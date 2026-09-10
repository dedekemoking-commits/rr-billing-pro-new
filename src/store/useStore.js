import { create } from 'zustand';
import { DEFAULT_PAKET, DEFAULT_MAKANAN, DEFAULT_MINUMAN, MENIT_MAP, JENIS_PS } from '../utils/theme';
import {
  loadConfig, saveConfig, loadTransaksi, tambahTransaksi,
  hapusSemuaTransaksi, loadTVList, saveTVList, getLicenseStatus,
  saveSession, loadSession, clearSession,
} from '../utils/storage';
import { syncTransaksi, saveTransaksiToGithub, hapusTransaksiRemote } from '../utils/githubTransaksi';
import tvWsServer from '../utils/tvWsServer';
import * as tvWsProto from '../utils/tvWsProtocol';
import httpFileServer from '../utils/httpFileServer';

const _promoSentOnce = {};  // Track promo per mejaId (module-level, survives re-renders)

export const useStore = create((set, get) => ({
  // ─── Auth ──────────────────────────────────────────────────────────────────
  currentUser: null,
  currentRole: null,
  appReady: false,

  setUser: async (user, role) => {
    await saveSession(user, role);
    set({ currentUser: user, currentRole: role });
  },

  logout: async () => {
    await clearSession();
    set({ currentUser: null, currentRole: null });
  },

  restoreSession: async () => {
    const session = await loadSession();
    if (session) {
      set({ currentUser: session.user, currentRole: session.role });
      // Load data setelah session direstore
      const store = useStore.getState();
      await Promise.allSettled([
        store.loadLicense(),
        store.loadHarga(),
        store.loadTVs(),
        store.loadNamaRental(),
        store.loadBgConfig(),
      ]);
      // Start TV WebSocket server + HTTP file server
      store.startTvWsServer(8080);
      httpFileServer.start(8082);
    }
    set({ appReady: true });
  },

  // ─── License ───────────────────────────────────────────────────────────────
  licenseStatus: null,
  loadLicense: async () => {
    const lic = await getLicenseStatus();
    set({ licenseStatus: lic });
  },

  // ─── Nama Rental ────────────────────────────────────────────────────────────
  namaRental: 'RR Billing Pro',
  loadNamaRental: async () => {
    const cfg = await loadConfig();
    if (cfg.namaRental) set({ namaRental: cfg.namaRental });
  },
  setNamaRental: async (name) => {
    const cfg = await loadConfig();
    cfg.namaRental = name;
    await saveConfig(cfg);
    set({ namaRental: name });
  },

  // ─── Background & Opacity ───────────────────────────────────────────────────
  bgImagePortrait: null,
  bgImageLandscape: null,
  cardOpacity: 60,
  loadBgConfig: async () => {
    const cfg = await loadConfig();
    const updates = {};
    if (cfg.bgImagePortrait) updates.bgImagePortrait = cfg.bgImagePortrait;
    if (cfg.bgImageLandscape) updates.bgImageLandscape = cfg.bgImageLandscape;
    if (cfg.cardOpacity != null) updates.cardOpacity = cfg.cardOpacity;
    if (Object.keys(updates).length) set(updates);
  },
  setBgImagePortrait: async (uri) => {
    const cfg = await loadConfig();
    cfg.bgImagePortrait = uri;
    await saveConfig(cfg);
    set({ bgImagePortrait: uri });
  },
  setBgImageLandscape: async (uri) => {
    const cfg = await loadConfig();
    cfg.bgImageLandscape = uri;
    await saveConfig(cfg);
    set({ bgImageLandscape: uri });
  },
  setCardOpacity: async (val) => {
    const cfg = await loadConfig();
    cfg.cardOpacity = val;
    await saveConfig(cfg);
    set({ cardOpacity: val });
  },

  // ─── Harga ─────────────────────────────────────────────────────────────────
  paketMain:   { PS3: { ...DEFAULT_PAKET.PS3 }, PS4: { ...DEFAULT_PAKET.PS4 }, PS5: { ...DEFAULT_PAKET.PS5 } },
  paketDurasi: { ...MENIT_MAP },
  menuMakanan: { ...DEFAULT_MAKANAN },
  menuMinuman: { ...DEFAULT_MINUMAN },

  loadHarga: async () => {
    const cfg = await loadConfig();
    let paket = cfg.paket_main;
    if (!paket) {
      paket = { PS3: { ...DEFAULT_PAKET.PS3 }, PS4: { ...DEFAULT_PAKET.PS4 }, PS5: { ...DEFAULT_PAKET.PS5 } };
    } else if (!paket.PS3) {
      // Format lama (flat) → migrasi ke nested per-tier
      paket = { PS3: { ...paket }, PS4: { ...paket }, PS5: { ...paket } };
    }
    set({
      paketMain:   paket,
      paketDurasi: cfg.paket_durasi || MENIT_MAP,
      menuMakanan: cfg.menu_makanan || DEFAULT_MAKANAN,
      menuMinuman: cfg.menu_minuman || DEFAULT_MINUMAN,
    });
  },

  saveHarga: async (paket, durasi, makanan, minuman) => {
    const cfg = await loadConfig();
    cfg.paket_main   = paket;
    cfg.paket_durasi = durasi;
    cfg.menu_makanan = makanan;
    cfg.menu_minuman = minuman;
    await saveConfig(cfg);
    set({ paketMain: paket, paketDurasi: durasi, menuMakanan: makanan, menuMinuman: minuman });
  },

  // ─── TV List ───────────────────────────────────────────────────────────────
  tvList: [],

  loadTVs: async () => {
    const list = await loadTVList();
    set({ tvList: list });
  },

  tambahTV: async (tv) => {
    const list = [...get().tvList, tv];
    await saveTVList(list);
    set({ tvList: list });
  },

  hapusTV: async (id) => {
    const list = get().tvList.filter(t => t.id !== id);
    await saveTVList(list);
    set({ tvList: list });
  },

  updateTV: async (id, updates) => {
    const list = get().tvList.map(t => t.id === id ? { ...t, ...updates } : t);
    await saveTVList(list);
    set({ tvList: list });
  },

  // ─── TV WebSocket Server ───────────────────────────────────────────────────
  tvWsRunning: false,
  tvWsPort: 8080,
  tvWsClients: [], // [{ mejaId, nama, device, screenOn, connected }]
  promoVideoUrl: '',

  startTvWsServer: async (port = 8080) => {
    if (tvWsServer.isRunning) return true;
    const ok = await tvWsServer.start(port);
    // Also start HTTP file server for video serving
    if (!httpFileServer.isRunning) {
      await httpFileServer.start(8082);
    }
    if (ok) {
      tvWsServer.onClientConnect = (mejaId, info) => {
        const clients = tvWsServer.getConnectedTvs();
        set({ tvWsClients: clients });
        console.log(`[Store] TV connected: ${mejaId}`);
      };
      tvWsServer.onClientDisconnect = (mejaId) => {
        const clients = tvWsServer.getConnectedTvs();
        set({ tvWsClients: clients });
        console.log(`[Store] TV disconnected: ${mejaId}`);
      };
      tvWsServer.onScreenToggle = (mejaId, screenOn) => {
        const clients = tvWsServer.getConnectedTvs();
        set({ tvWsClients: clients });
      };
      tvWsServer.onBuildState = (mejaId) => {
        const st = get();
        const tv = (st.tvList || []).find(t => t.nama === mejaId || t.id === mejaId);
        const cmds = [];

        if (tv) {
          if (tv.sesiAktif && tv.sisaWaktu > 0) {
            cmds.push(tvWsProto.buildStartTimer(mejaId, tv.sisaWaktu, tv.namaRental || '', tv.totalTagihan || tv.harga || 0, {
              isBebas: tv.isBebas || false,
              lunasTotal: tv.lunasTotal || 0,
              tagihanTotal: tv.tagihanTotal || 0,
            }));
          } else if (tv.locked) {
            cmds.push(tvWsProto.buildLockScreen(mejaId, tv.lockPesan || 'WAKTU SEWA HABIS', tv.lockDetail || {}));
          } else {
            cmds.push(tvWsProto.buildStopTimer(mejaId));
          }
        } else {
          cmds.push(tvWsProto.buildStopTimer(mejaId));
        }

        const promoUrl = st.promoVideoUrl;
        if (promoUrl && !_promoSentOnce[mejaId]) {
          _promoSentOnce[mejaId] = true;
          cmds.push(tvWsProto.buildShowMedia(mejaId, 'video', promoUrl));
        }

        return cmds;
      };
      set({ tvWsRunning: true, tvWsPort: port, tvWsClients: tvWsServer.getConnectedTvs() });
    }
    return ok;
  },

  stopTvWsServer: () => {
    tvWsServer.stop();
    set({ tvWsRunning: false, tvWsClients: [] });
  },

  refreshTvWsClients: () => {
    if (tvWsServer.isRunning) {
      set({ tvWsClients: tvWsServer.getConnectedTvs() });
    }
  },

  setPromoVideoUrl: (url) => {
    set({ promoVideoUrl: url || '' });
    // Reset sent-once flag agar bisa dikirim ulang ke TV yang sudah reconnect
    Object.keys(_promoSentOnce).forEach(k => { _promoSentOnce[k] = false; });
  },

  sendTvCommand: (mejaId, action, params = {}) => {
    let msg;
    switch (action) {
      case 'START_TIMER':
        msg = tvWsProto.buildStartTimer(mejaId, params.sisaDetik, params.namaRental, params.totalTagihan, params);
        break;
      case 'STOP_TIMER':
        msg = tvWsProto.buildStopTimer(mejaId);
        break;
      case 'SYNC_TIMER':
        msg = tvWsProto.buildSyncTimer(mejaId, params.sisaDetik, params.totalTagihan, params);
        break;
      case 'PAUSE_TIMER':
        msg = tvWsProto.buildPauseTimer(mejaId);
        break;
      case 'RESUME_TIMER':
        msg = tvWsProto.buildResumeTimer(mejaId, params.sisaDetik);
        break;
      case 'UPDATE_TOTAL':
        msg = tvWsProto.buildUpdateTotal(mejaId, params.totalTagihan, params);
        break;
      case 'LOCK_SCREEN':
        msg = tvWsProto.buildLockScreen(mejaId, params.pesan, params.detail);
        break;
      case 'UNLOCK_SCREEN':
        msg = tvWsProto.buildUnlockScreen(mejaId);
        break;
      case 'SHOW_MEDIA':
        msg = tvWsProto.buildShowMedia(mejaId, params.mediaType, params.url);
        break;
      case 'HIDE_MEDIA':
        msg = tvWsProto.buildHideMedia(mejaId);
        break;
      case 'SHOW_PIN':
        msg = tvWsProto.buildShowPin(mejaId, params.pin);
        break;
      case 'HIDE_PIN':
        msg = tvWsProto.buildHidePin(mejaId);
        break;
      case 'SHOW_TOAST':
        msg = tvWsProto.buildToast(mejaId, params.message, params.duration);
        break;
      case 'OVERLAY_SETTINGS':
        msg = tvWsProto.buildOverlaySettings(mejaId, params.overlayMode, params.overlayLastMinutes);
        break;
      case 'SLEEP_TV':
        msg = tvWsProto.buildSleepTv(mejaId, params.countdown);
        break;
      default:
        return false;
    }
    // Try WebSocket first — cek nama langsung
    if (tvWsServer.isRunning && tvWsServer.isConnected(mejaId)) {
      return tvWsServer.sendTo(mejaId, msg);
    }
    // Fallback: kirim ke SEMUA connected WS clients (nama TV di server mungkin beda)
    if (tvWsServer.isRunning) {
      const ids = tvWsServer.getConnectedIds();
      let sent = false;
      for (const id of ids) {
        if (tvWsServer.sendTo(id, msg)) {
          console.log(`[sendTvCommand] WS broadcast sent to ${id}: ${action}`);
          sent = true;
        }
      }
      if (sent) return true;
    }
    // Fallback: HTTP POST to TV client's HTTP server
    const tv = get().tvList.find(t => t.nama === mejaId);
    if (tv && tv.ip) {
      const httpPort = tv.tvClientPort || 8080;
      const body = msg;
      fetch(`http://${tv.ip}:${httpPort}/command`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      }).then(() => console.log(`[sendTvCommand] HTTP fallback sent: ${action} to ${tv.ip}`))
        .catch((e) => console.log(`[sendTvCommand] HTTP fallback failed: ${e.message}`));
      return true;
    }
    return false;
  },

  broadcastTvCommand: (action, params = {}) => {
    if (!tvWsServer.isRunning) return 0;
    const ids = tvWsServer.getConnectedIds();
    let sent = 0;
    for (const id of ids) {
      if (get().sendTvCommand(id, action, params)) sent++;
    }
    return sent;
  },

  isTvConnected: (mejaId) => {
    return tvWsServer.isRunning && tvWsServer.isConnected(mejaId);
  },

  // ─── Transaksi ─────────────────────────────────────────────────────────────
  transaksiList: [],

  loadTransaksi: async () => {
    let list = await loadTransaksi();
    const user = get().currentUser;
    if (user) {
      const merged = await syncTransaksi(user, list);
      if (merged !== list) {
        list = merged;
      }
    }
    set({ transaksiList: list });
  },

  tambahTransaksi: async (data) => {
    const list = await tambahTransaksi(data);
    set({ transaksiList: list });
    const user = get().currentUser;
    if (user) {
      saveTransaksiToGithub(user, list);
    }
  },

  bersihkanTransaksi: async () => {
    await hapusSemuaTransaksi();
    const user = get().currentUser;
    if (user) {
      hapusTransaksiRemote(user);
    }
    set({ transaksiList: [] });
  },
}));
