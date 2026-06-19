import { create } from 'zustand';
import { DEFAULT_PAKET, DEFAULT_MAKANAN, DEFAULT_MINUMAN } from '../utils/theme';
import {
  loadConfig, saveConfig, loadTransaksi, tambahTransaksi,
  hapusSemuaTransaksi, loadTVList, saveTVList, getLicenseStatus,
} from '../utils/storage';

export const useStore = create((set, get) => ({
  // ─── Auth ──────────────────────────────────────────────────────────────────
  currentUser: null,
  currentRole: null,
  setUser: (user, role) => set({ currentUser: user, currentRole: role }),
  logout: () => set({ currentUser: null, currentRole: null }),

  // ─── License ───────────────────────────────────────────────────────────────
  licenseStatus: null,
  loadLicense: async () => {
    const lic = await getLicenseStatus();
    set({ licenseStatus: lic });
  },

  // ─── Harga ─────────────────────────────────────────────────────────────────
  paketMain:   { ...DEFAULT_PAKET },
  menuMakanan: { ...DEFAULT_MAKANAN },
  menuMinuman: { ...DEFAULT_MINUMAN },

  loadHarga: async () => {
    const cfg = await loadConfig();
    set({
      paketMain:   cfg.paket_main   || DEFAULT_PAKET,
      menuMakanan: cfg.menu_makanan || DEFAULT_MAKANAN,
      menuMinuman: cfg.menu_minuman || DEFAULT_MINUMAN,
    });
  },

  saveHarga: async (paket, makanan, minuman) => {
    const cfg = await loadConfig();
    cfg.paket_main   = paket;
    cfg.menu_makanan = makanan;
    cfg.menu_minuman = minuman;
    await saveConfig(cfg);
    set({ paketMain: paket, menuMakanan: makanan, menuMinuman: minuman });
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

  // ─── Transaksi ─────────────────────────────────────────────────────────────
  transaksiList: [],

  loadTransaksi: async () => {
    const list = await loadTransaksi();
    set({ transaksiList: list });
  },

  tambahTransaksi: async (data) => {
    const list = await tambahTransaksi(data);
    set({ transaksiList: list });
  },

  bersihkanTransaksi: async () => {
    await hapusSemuaTransaksi();
    set({ transaksiList: [] });
  },
}));
