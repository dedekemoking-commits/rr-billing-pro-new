import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ActivityIndicator, NativeModules,
} from 'react-native';
import { MaterialCommunityIcons as Icon } from '@expo/vector-icons';
import { C, FONTS, fmtRp } from '../utils/theme';
import { ADBHelper } from '../utils/adbHelper';
import connectionManager from '../utils/connectionManager';
import tvWsServer from '../utils/tvWsServer';
import {
  loadCertificate, connectRemote, sendCommand as atpv2Send, disconnect as atpv2Disconnect,
} from '../utils/atpv2Helper';
import { useStore } from '../store/useStore';
import ModalRemoteControl from './ModalRemoteControl';

function akhiriSesi(tv, onUpdateTV, atpv2Conn, atpv2Status) {
  if (!tv) return;
  // Kirim STOP_TIMER + UNLOCK_SCREEN ke billingtv jika terhubung
  if (tv.koneksiMetode === 'billingtv' && tvWsServer.isConnected(tv.nama)) {
    const { sendTvCommand } = useStore.getState();
    sendTvCommand(tv.nama, 'STOP_TIMER');
    sendTvCommand(tv.nama, 'UNLOCK_SCREEN');
  }
  // Matikan TV via ATPv2 jika terhubung
  if (tv.koneksiMetode === 'atpv2' && atpv2Conn && atpv2Status === 'connected') {
    atpv2Send(atpv2Conn, 'power').catch(() => {});
  }
  onUpdateTV({ paketAktif: '', sisaDetik: 0, timerActive: false, bebas: false, bebasMulai: undefined, bebasHargaPerJam: undefined, bebasPesananTotal: undefined, paketHarga: undefined, totalPesanan: undefined, pesananItems: undefined });
  ADBHelper.powerOff(tv.ip, tv.port).catch(() => {});
}

function hitungTotal(tv, runningTotal) {
  const totalPaket = tv.paketHarga || 0;
  const totalPesanan = tv.bebas ? (tv.bebasPesananTotal || 0) : (tv.totalPesanan || 0);
  const totalSemua = tv.bebas ? runningTotal : (totalPaket + totalPesanan);
  return { totalPaket, totalPesanan, totalSemua };
}

function buildLockDetail(tv, runningTotal) {
  const { totalPaket, totalPesanan, totalSemua } = hitungTotal(tv, runningTotal);
  const allMenu = { ...useStore.getState().menuMakanan, ...useStore.getState().menuMinuman };
  const makananList = [];
  const minumanList = [];
  if (tv.pesananItems) {
    Object.entries(tv.pesananItems).forEach(([nama, qty]) => {
      const harga = allMenu[nama] || 0;
      const item = { item: `${qty}x ${nama}`, harga: fmtRp(harga * qty), lunas: tv.paid === true };
      if (useStore.getState().menuMakanan[nama]) makananList.push(item);
      else if (useStore.getState().menuMinuman[nama]) minumanList.push(item);
    });
  }
  return {
    meja: tv.nama,
    sewa: tv.paketAktif || '-',
    sewa_harga: fmtRp(totalPaket),
    sewa_lunas: tv.paid === true,
    lunas_total: tv.paid === true ? fmtRp(totalPaket) : 'Rp 0',
    tagihan_total: tv.paid === true ? 'Rp 0' : fmtRp(totalPaket),
    makanan: makananList,
    minuman: minumanList,
    fnb: fmtRp(totalPesanan),
    total: fmtRp(totalSemua),
    logo_url: '',
    promo_url: '',
  };
}

function tampilPopupSelesai(tv, runningTotal, onUpdateTV, isAuto, atpv2Conn, atpv2Status) {
  const { totalPaket, totalPesanan, totalSemua } = hitungTotal(tv, runningTotal);
  const label = isAuto ? 'Waktu Habis' : 'Selesai';
  const lines = [
    `Akhiri sesi ${tv.nama}?`,
    '',
    `Paket: ${tv.paketAktif || '-'}`,
    `Paket: ${fmtRp(totalPaket)}`,
  ];
  if (totalPesanan > 0) {
    lines.push(`Pesanan: ${fmtRp(totalPesanan)}`);
  }
  lines.push('');
  lines.push(`TOTAL: ${fmtRp(totalSemua)}`);
  lines.push('');
  lines.push(tv.paid ? 'Status: LUNAS' : 'Status: TAGIHAN');
  lines.push(isAuto ? 'TV akan dikunci (Lock Screen)' : 'TV akan dikunci');
  const msg = lines.join('\n');

  const onOk = () => {
    const { sendTvCommand } = useStore.getState();
    const detail = buildLockDetail(tv, runningTotal);
    sendTvCommand(tv.nama, 'LOCK_SCREEN', { pesan: tv.paid ? 'LUNAS' : 'WAKTU SEWA HABIS', detail });

    // Bebas: 10 detik hitung mundur lalu TV sleep
    if (tv.bebas) {
      sendTvCommand(tv.nama, 'SLEEP_TV', { countdown: 10 });
    }

    // Matikan sesi
    akhiriSesi(tv, onUpdateTV, atpv2Conn, atpv2Status);
  };

  if (isAuto) {
    Alert.alert(label, msg, [{ text: 'OK', onPress: onOk }]);
  } else {
    Alert.alert(label, msg, [
      { text: 'Batal', style: 'cancel' },
      { text: 'Selesai', style: 'destructive', onPress: onOk },
    ]);
  }
}

const INSTALL_STEP_LABELS = {
  idle:       '',
  connecting: '🔌 Koneksi...',
  sending:    '📦 Kirim APK',
  installing: '💿 Install APK...',
  granting:   '🔐 Grant permissions...',
  starting:   '🚀 Start service...',
  verifying:  '✅ Verifikasi',
  done:       '✅ Selesai! TV Client aktif',
  error:      '❌ Gagal, tap untuk ulang',
};

export default function TVCard({ tv, onPilihPaket, onHapus, onUpdateTV, menuMakanan, menuMinuman, cardOpacity = 60 }) {
  const allMenu = { ...menuMakanan, ...menuMinuman };
  const [timerSisa, setTimerSisa] = useState(tv.sisaDetik || 0);
  const [koneksi,   setKoneksi]   = useState('unknown');
  const [adbBusy,   setAdbBusy]   = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [runningTotal, setRunningTotal] = useState(0);
  const [installStep, setInstallStep] = useState('idle');
  const [installPct, setInstallPct] = useState(0);
  const [clientRunning, setClientRunning] = useState(false);
  const [showPortInput, setShowPortInput] = useState(false);
  const [newPort, setNewPort] = useState('');
  const [atpv2Conn, setAtpv2Conn] = useState(null);
  const [atpv2Status, setAtpv2Status] = useState('idle'); // idle | connecting | connected | error
  const [showRemoteModal, setShowRemoteModal] = useState(false);
  const [elapsedTime, setElapsedTime] = useState(0);
  const intervalRef = useRef(null);
  const keepRef     = useRef(null);
  const syncRef     = useRef(null);
  const bebasTotalRef = useRef(null);
  const updateRef   = useRef(onUpdateTV);
  const tvRef       = useRef(tv);
  const runningTotalRef = useRef(0);
  const scanLockRef = useRef(false);
  const lastScanRef = useRef(0);
  updateRef.current = onUpdateTV;
  tvRef.current = tv;
  runningTotalRef.current = runningTotal;

  useEffect(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);

    if (tv.bebas && tv.timerActive) {
      // Main Bebas: tidak ada countdown, cuma hitung waktu berjalan
      setTimerSisa(0);
      return () => {};
    }

    // Reguler: gunakan timerEndTime dari store (persist, tidak hilang saat rotate)
    const endTime = tv.timerEndTime || 0;
    if (tv.timerActive && endTime > 0) {
      const updateTimer = () => {
        const sisa = Math.max(0, Math.ceil((endTime - Date.now()) / 1000));
        setTimerSisa(sisa);
        if (sisa <= 0) {
          clearInterval(intervalRef.current);
          const currentTV = tvRef.current;
          const currentRT = runningTotalRef.current;

          // Reguler: tampil popup selesai → kasir klik OK → lockscreen → sleep
          tampilPopupSelesai(currentTV, currentRT, updateRef.current, true, atpv2ConnRef.current, atpv2StatusRef.current);
        }
      };
      updateTimer();
      intervalRef.current = setInterval(updateTimer, 1000);
    } else {
      setTimerSisa(tv.sisaDetik || 0);
    }

    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [tv.timerActive, tv.timerEndTime, tv.bebas]);

  useEffect(() => {
    const checkKoneksi = async () => {
      // ── BillingTV: cek via WebSocket server ──
      if (tv.koneksiMetode === 'billingtv') {
        const wsOk = tvWsServer.isRunning && tvWsServer.isConnected(tv.nama);
        setClientRunning(wsOk);
        setKoneksi(wsOk ? 'online' : 'offline');
        return;
      }

      // ── Cek HTTP :8080 dulu (tv-client lama) ──
      let httpOk = false;
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 3000);
        const res = await fetch(`http://${tv.ip}:8080/ping`, { signal: controller.signal });
        clearTimeout(timeout);
        if (res.ok) {
          const data = await res.json();
          httpOk = data.status === 'ok';
          setClientRunning(httpOk);
        }
      } catch { /* ignore */ }

      if (httpOk) {
        setKoneksi('online');
        return;
      }
      setClientRunning(false);

      // ── Fallback: cek ADB ──
      const curPort = tv.port || 5555;
      let adbOnline = false;
      try {
        const open1 = await ADBHelper.checkPortOpen(tv.ip, curPort, 2000);
        if (open1) { adbOnline = true; }
        if (!adbOnline && curPort !== 5555) {
          const open2 = await ADBHelper.checkPortOpen(tv.ip, 5555, 2000);
          if (open2) {
            updateRef.current({ port: 5555 });
            adbOnline = true;
          }
        }
      } catch { /* ignore */ }

      if (!adbOnline && !scanLockRef.current && Date.now() - lastScanRef.current > 60000) {
        scanLockRef.current = true;
        lastScanRef.current = Date.now();
        try {
          const found = await ADBHelper.findTV(tv.ip, curPort);
          if (found) {
            if (found.needsPairing) { setKoneksi('offline'); scanLockRef.current = false; return; }
            const newPort = found.port || 5555;
            if (newPort !== curPort) updateRef.current({ port: newPort });
            adbOnline = true;
          }
        } catch { /* ignore */ }
        scanLockRef.current = false;
      }

      setKoneksi(adbOnline ? 'online' : 'offline');
    };

    checkKoneksi();
    keepRef.current = setInterval(checkKoneksi, 15000);
    return () => { if (keepRef.current) clearInterval(keepRef.current); };
  }, [tv.ip, tv.port, tv.koneksiMetode, tv.nama]);

  useEffect(() => {
    if (tv.koneksiMetode !== 'atpv2') {
      if (atpv2Conn) { atpv2Disconnect(atpv2Conn); setAtpv2Conn(null); setAtpv2Status('idle'); }
      return;
    }
    let cancelled = false;
    let retryCount = 0;
    const maxRetries = 5;

    const autoConnect = async () => {
      const cert = await loadCertificate(tv.ip);
      if (!cert || cancelled) return;
      setAtpv2Status('connecting');
      try {
        const conn = await connectRemote(tv.ip, cert);
        if (!cancelled) {
          setAtpv2Conn(conn);
          setAtpv2Status('connected');
          retryCount = 0;
        } else {
          atpv2Disconnect(conn);
        }
      } catch {
        if (!cancelled) {
          setAtpv2Status('error');
          // Auto-retry dengan exponential backoff
          if (retryCount < maxRetries) {
            retryCount++;
            const delay = Math.min(10000, 2000 * Math.pow(2, retryCount - 1));
            setTimeout(() => { if (!cancelled) autoConnect(); }, delay);
          }
        }
      }
    };
    autoConnect();
    return () => { cancelled = true; if (atpv2Conn) { atpv2Disconnect(atpv2Conn); } };
  }, [tv.koneksiMetode, tv.ip]);

  // ── ATPv2: Auto-reconnect setiap 5 detik jika koneksi putus ──
  const atpv2StatusRef = useRef(atpv2Status);
  atpv2StatusRef.current = atpv2Status;
  const atpv2ConnRef = useRef(atpv2Conn);
  atpv2ConnRef.current = atpv2Conn;

  useEffect(() => {
    if (tv.koneksiMetode !== 'atpv2') return;
    let cancelled = false;
    const interval = setInterval(async () => {
      if (cancelled) return;
      const curStatus = atpv2StatusRef.current;
      const curConn = atpv2ConnRef.current;
      if ((curStatus === 'connected' && curConn && !curConn.connected) ||
          ((curStatus === 'error' || curStatus === 'idle') && !curConn)) {
        setAtpv2Status('connecting');
        try {
          const cert = await loadCertificate(tv.ip);
          if (!cert || cancelled) { setAtpv2Status('error'); return; }
          const conn = await connectRemote(tv.ip, cert);
          if (!cancelled) {
            setAtpv2Conn(conn);
            setAtpv2Status('connected');
          } else {
            atpv2Disconnect(conn);
          }
        } catch {
          if (!cancelled) setAtpv2Status('error');
        }
      }
    }, 5000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [tv.koneksiMetode, tv.ip]);

  // ── BillingTV: SYNC_TIMER setiap detik saat sesi aktif ──
  useEffect(() => {
    if (tv.koneksiMetode !== 'billingtv' || !tv.timerActive) {
      if (syncRef.current) { clearInterval(syncRef.current); syncRef.current = null; }
      return;
    }

    syncRef.current = setInterval(() => {
      const cur = tvRef.current;
      const store = useStore.getState();
      const { totalPaket, totalPesanan, totalSemua } = hitungTotal(cur, runningTotalRef.current);
      store.sendTvCommand(cur.nama, 'SYNC_TIMER', {
        sisaDetik: cur.bebas ? 0 : (cur.sisaDetik || 0),
        totalTagihan: totalSemua,
        lunasTotal: cur.paid ? totalSemua : 0,
        tagihanTotal: cur.paid ? 0 : totalSemua,
      });
    }, 5000);

    return () => { if (syncRef.current) clearInterval(syncRef.current); };
  }, [tv.koneksiMetode, tv.timerActive]);

  useEffect(() => {
    if (bebasTotalRef.current) clearInterval(bebasTotalRef.current);
    if (tv.bebas && tv.bebasMulai) {
      const update = () => {
        const elapsed = Date.now() - tv.bebasMulai;
        const jam = elapsed / 3600000;
        const biayaWaktu = Math.ceil(jam * (tv.bebasHargaPerJam || 10000));
        setRunningTotal(biayaWaktu + (tv.bebasPesananTotal || 0));
      };
      update();
      bebasTotalRef.current = setInterval(update, 10000);
    } else {
      setRunningTotal(0);
    }
    return () => { if (bebasTotalRef.current) clearInterval(bebasTotalRef.current); };
  }, [tv.bebas, tv.bebasMulai, tv.bebasHargaPerJam, tv.bebasPesananTotal]);

  useEffect(() => {
    if (tv.bebas && tv.bebasMulai) {
      const update = () => {
        const elapsed = Math.floor((Date.now() - tv.bebasMulai) / 1000);
        setElapsedTime(elapsed);
      };
      update();
      const ref = setInterval(update, 1000);
      return () => clearInterval(ref);
    } else {
      setElapsedTime(0);
    }
  }, [tv.bebas, tv.bebasMulai]);

  function formatTimer(secs) {
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  }

  const timerColor = timerSisa <= 300 ? C.RED : C.ACCENT;
  const isExpired  = !tv.bebas && tv.paketAktif && timerSisa === 0;
  const canRemote = (tv.koneksiMetode === 'atpv2' && atpv2Status === 'connected') ||
                    (tv.koneksiMetode !== 'atpv2' && tv.koneksiMetode !== 'billingtv' && koneksi === 'online');

  const cmAction = async (cmd, params, adbFn, label) => {
    if (adbBusy) return;
    setAdbBusy(true);
    try {
      console.log(`[TVCard] cmAction cmd=${cmd} metode=${tv.koneksiMetode} atpv2Conn=${!!atpv2Conn} atpv2Status=${atpv2Status}`);

      // ── Prioritas 1: ATPv2 jika connected ──
      if (tv.koneksiMetode === 'atpv2' && atpv2Conn && atpv2Status === 'connected') {
        console.log(`[TVCard] Sending via ATPv2: cmd=${cmd}`);
        const result = await atpv2Send(atpv2Conn, cmd, params);
        console.log(`[TVCard] ATPv2 result:`, JSON.stringify(result));
        if (result.status === 'ok') { setAdbBusy(false); return; }
        console.log(`[TVCard] ATPv2 failed, falling through`);
        setAtpv2Status('error');
      }

      // ── Prioritas 2: BillingTV WebSocket ──
      if (tv.koneksiMetode === 'billingtv') {
        const wsOk = tvWsServer.isConnected(tv.nama);
        if (wsOk) {
          // Kirim command via WebSocket
          const store = useStore.getState();
          let sent = false;
          switch (cmd) {
            case 'home':
              sent = store.sendTvCommand(tv.nama, 'START_TIMER', { sisaDetik: 0 });
              break;
            case 'power':
              sent = store.sendTvCommand(tv.nama, 'STOP_TIMER');
              break;
            default:
              // Remote buttons (vol, hdmi, etc) via keyevent via ATPv2/ADB
              break;
          }
          if (sent) { setAdbBusy(false); return; }
        }
        Alert.alert('BillingTV', 'TV tidak terhubung via WebSocket. Pastikan billingtv.apk aktif.');
        setAdbBusy(false);
        return;
      }

      // ── Prioritas 3: TV Client (WebSocket / HTTP) ──
      const layer = connectionManager.getActiveLayer();
      if (layer) {
        const result = await connectionManager.send(cmd, params);
        if (result.status === 'ok') { setAdbBusy(false); return; }
      }

      // ── Fallback: ADB ──
      const result = await adbFn();
      if (!result.sukses) {
        await new Promise(r => setTimeout(r, 500));
        const result2 = await adbFn();
        setKoneksi(result2.sukses ? 'online' : 'offline');
        if (!result2.sukses) {
          Alert.alert('Gagal', `${label}: ${result2.pesan || 'TV tidak merespon'}`);
        }
      } else {
        setKoneksi('online');
      }
    } catch (e) {
      if (tv.koneksiMetode === 'atpv2') setAtpv2Status('error');
      else setKoneksi('offline');
      Alert.alert('Gagal', `${label}: ${e.message}`);
    }
    setAdbBusy(false);
  };

  const cekKoneksi = async () => {
    setAdbBusy(true);
    setShowPortInput(false);
    const cur = tvRef.current;
    const result = await ADBHelper.connect(cur.ip, cur.port || 5555);
    if (result.pesan === 'PUBLIC_KEY_REJECTED') {
      setKoneksi('offline');
      setShowPortInput(true);
      setNewPort(String(cur.port || 5555));
      Alert.alert('Perlu Pairing Ulang',
        'Public key tidak dikenali TV (mungkin TV di-reset).\nHapus TV ini lalu tambah lagi via menu Tambah TV.');
    } else {
      const ok = result.sukses;
      setKoneksi(ok ? 'online' : 'offline');
      if (!ok) {
        setShowPortInput(true);
        setNewPort(String(cur.port || 5555));
      }
      Alert.alert(ok ? 'Terhubung' : 'Koneksi Gagal', result.pesan);
    }
    setAdbBusy(false);
  };

  const simpanPortBaru = () => {
    const p = parseInt(newPort);
    if (isNaN(p) || p < 1 || p > 65535) {
      Alert.alert('Port tidak valid', 'Masukkan angka 1-65535');
      return;
    }
    updateRef.current({ port: p });
    setShowPortInput(false);
    setTimeout(() => cekKoneksi(), 300);
  };

  const cariUlang = async () => {
    if (isScanning) return;
    setIsScanning(true);
    try {
      const result = await ADBHelper.findTV(tv.ip, tv.port);
      if (result) {
        if (result.needsPairing) {
          Alert.alert('Perlu Pairing Ulang',
            'TV ditemukan tetapi public key tidak dikenali (mungkin TV di-reset).\n\n1. Buka TV Settings → Opsi Developer → Wireless Debugging\n2. Tap "Pair device with pairing code"\n3. Hapus TV ini lalu tambah lagi via menu Tambah TV');
          return;
        }
        setKoneksi('online');
        if (result.port !== (tv.port || 5555)) {
          updateRef.current({ port: result.port });
        }
      } else {
        Alert.alert('Tidak Ditemukan',
          'Pastikan TV menyala dan Wireless Debugging aktif.\n\n1. Buka Settings → Opsi Developer\n2. Aktifkan "Wireless Debugging"\n3. Setelah ON, tap "Cari Ulang" lagi');
      }
    } catch (e) {
      Alert.alert('Error', e.message);
    }
    setIsScanning(false);
  };

  const setupTvClient = async (ip, port) => {
    setInstallStep('granting');
    const grantCmds = [
      `pm grant com.rrcctv.rr_tv_client android.permission.WRITE_SECURE_SETTINGS`,
      `appops set com.rrcctv.rr_tv_client SYSTEM_ALERT_WINDOW allow`,
      `settings put secure enabled_accessibility_services com.rrcctv.rr_tv_client/.RrTvAccessibilityService`,
      `settings put secure accessibility_enabled 1`,
    ];
    for (const cmd of grantCmds) {
      await ADBHelper.shell(ip, cmd, port);
    }

    setInstallStep('starting');
    await ADBHelper.shell(ip, `am start -n com.rrcctv.rr_tv_client/.MainActivity --user 0`, port);
    await new Promise(r => setTimeout(r, 10000));

    setInstallStep('verifying');
    for (let i = 0; i < 15; i++) {
      setInstallPct(Math.round((i + 1) / 15 * 100));
      const running = await connectionManager.checkClientRunning(ip);
      if (running) return true;
      await new Promise(r => setTimeout(r, 2000));
    }
    return false;
  };

  const installClientApk = async () => {
    if (installStep !== 'idle' && installStep !== 'error') return;
    setInstallStep('connecting');
    setInstallPct(0);
    setClientRunning(false);
    try {
      setInstallStep('sending');
      setInstallPct(0);

      const result = await NativeModules.AdbPairingModule.pushAndInstallApk(
        tv.ip, tv.port, 'tv-client.apk'
      );

      if (result.success) {
        setInstallStep('done');
        setInstallPct(100);
        Alert.alert('✅ APK Terkirim',
          'File APK sudah di TV.\n\n'
          + 'Cek TV — akan muncul dialog Install.\n'
          + 'Tekan Install pakai remote TV.\n\n'
          + 'Setelah selesai, Restart app ini.');
      } else {
        setInstallStep('error');
        Alert.alert('Gagal Kirim', result.message || 'Gagal mengirim file APK ke TV');
      }
    } catch (e) {
      setInstallStep('error');
      Alert.alert('Error', e.message || 'Gagal membaca file client');
    }
  };

  const selesai = () => tampilPopupSelesai(tv, runningTotal, updateRef.current, false, atpv2Conn, atpv2Status);

  const installing = installStep !== 'idle' && installStep !== 'done' && installStep !== 'error';

  return (
    <View style={[s.card, isExpired && s.cardExpired, { backgroundColor: `rgba(26,26,58, ${cardOpacity / 100})` }]}>
      <View style={s.hdr}>
        <View style={s.titleRow}>
          <Icon name="television-play" size={16} color={C.ACCENT} />
          <Text style={s.tvName}>{tv.nama}</Text>
          {tv.jenisPs && <Text style={s.psBadge}>{tv.jenisPs}</Text>}
          {tv.koneksiMetode === 'atpv2' ? (
            <Text style={[s.metodeBadge, { borderColor: atpv2Status === 'connected' ? C.GREEN : C.MUTED, color: atpv2Status === 'connected' ? C.GREEN : C.MUTED }]}>
              ⚡ Connect
            </Text>
          ) : tv.koneksiMetode === 'billingtv' ? (
            <Text style={[s.metodeBadge, { borderColor: koneksi === 'online' ? C.ACCENT2 : C.MUTED, color: koneksi === 'online' ? C.ACCENT2 : C.MUTED }]}>
              📱WS
            </Text>
          ) : (
            <Text style={[s.metodeBadge, { borderColor: C.YELLOW, color: C.YELLOW }]}>🔧ADB</Text>
          )}
        </View>
        {tv.koneksiMetode === 'atpv2' ? (
          <Text style={[s.koneksiTxt, { color: atpv2Status === 'connected' ? C.GREEN : atpv2Status === 'error' ? C.RED : C.YELLOW }]}>
            {atpv2Status === 'connected' ? 'ONLINE' : atpv2Status === 'error' ? 'ERROR' : atpv2Status === 'connecting' ? '...' : 'OFFLINE'}
          </Text>
        ) : (
          <Text style={[s.koneksiTxt, { color: koneksi === 'online' ? C.GREEN : koneksi === 'offline' ? C.RED : C.MUTED }]}>
            {koneksi === 'online' ? 'ONLINE' : koneksi === 'offline' ? 'OFFLINE' : '?'}
          </Text>
        )}
        <TouchableOpacity onPress={onHapus} style={s.delBtn}>
          <Icon name="close" size={16} color={C.RED} />
        </TouchableOpacity>
      </View>

      {tv.bebas && koneksi === 'online' && runningTotal > 0 && (
        <Text style={s.bebasTotalTxt}> {fmtRp(runningTotal)}</Text>
      )}
      <Text style={s.ipTxt}>{tv.ip}:{tv.port || 5555}</Text>

      <View style={s.timerWrap}>
        {tv.bebas ? (
          <Text style={[s.timer, { color: C.GREEN }]}>{formatTimer(elapsedTime)}</Text>
        ) : isExpired ? (
          <Text style={[s.timer, { color: C.RED }]}>SELESAI ⏹</Text>
        ) : tv.paketAktif ? (
          <Text style={[s.timer, { color: timerColor }]}>{formatTimer(timerSisa)}</Text>
        ) : (
          <Text style={[s.timer, { color: C.MUTED }]}>00:00:00</Text>
        )}
        {tv.paketAktif && <Text style={s.paketLabel}>{tv.paketAktif}</Text>}
      </View>

      {/* ── Bill Breakdown: LUNAS & TAGIHAN ── */}
      {tv.paketAktif && (
        <View style={s.billBox}>
          {tv.bebas && runningTotal > 0 && (
            <View style={s.billItem}>
              <Text style={tv.paid ? s.billLunas : s.billTagihan}>
                Main Bebas (running)  {tv.paid ? '✓ LUNAS' : '📋 TAGIHAN'}
              </Text>
            </View>
          )}
          {!tv.bebas && tv.paketHarga > 0 && (
            <View style={s.billItem}>
              <Text style={tv.paid ? s.billLunas : s.billTagihan}>{tv.paketAktif}  {fmtRp(tv.paketHarga)}  {tv.paid ? '✓ LUNAS' : '📋 TAGIHAN'}</Text>
            </View>
          )}
          {tv.pesananItems && Object.entries(tv.pesananItems).map(([nama, qty]) => {
            const harga = allMenu[nama] || 0;
            return (
              <View key={nama} style={s.billItem}>
                <Text style={s.billTagihan}>{nama} ×{qty}  {fmtRp(harga * qty)}  TAGIHAN</Text>
              </View>
            );
          })}
          <View style={[s.billItem, { borderTopWidth: 1, borderTopColor: C.BORDER, paddingTop: 4, marginTop: 4 }]}>
            <Text style={s.billTotal}>TOTAL: {fmtRp(tv.bebas ? runningTotal : (tv.paketHarga || 0) + (tv.totalPesanan || 0))}</Text>
          </View>
        </View>
      )}

      {/* Remote control — via Connect/ADB. BillingTV hanya support timer/lock/media */}
      <View style={s.ctrlRow}>
        <ADBBtn icon="power" color={C.RED} label="PWR"
          onPress={() => cmAction('power', { action: 'toggle' }, () => ADBHelper.powerToggle(tv.ip, tv.port), 'power')} busy={adbBusy} />
        <ADBBtn icon="volume-high" color={C.ACCENT} label="Vol+"
          onPress={() => cmAction('volume', { action: 'up' }, () => ADBHelper.volume(tv.ip, true, tv.port), 'vol+')} busy={adbBusy} />
        <ADBBtn icon="volume-low" color={C.ACCENT} label="Vol-"
          onPress={() => cmAction('volume', { action: 'down' }, () => ADBHelper.volume(tv.ip, false, tv.port), 'vol-')} busy={adbBusy} />
        <ADBBtn
          icon="remote"
          color={canRemote ? C.ACCENT2 : C.MUTED}
          label="Remote"
          onPress={() => setShowRemoteModal(true)}
          busy={adbBusy}
        />
        {tv.koneksiMetode === 'atpv2' && (
          <ADBBtn
            icon="remote" color={atpv2Status === 'connected' ? C.GREEN : atpv2Status === 'error' ? C.RED : C.MUTED}
            label={atpv2Status === 'connected' ? '✓' : atpv2Status === 'error' ? '✗' : atpv2Status === 'connecting' ? '...' : 'Connect'}
            busy={adbBusy || atpv2Status === 'connecting'}
            onPress={async () => {
              if (atpv2Status === 'connected') {
                atpv2Disconnect(atpv2Conn); setAtpv2Conn(null); setAtpv2Status('idle');
                return;
              }
              setAtpv2Status('connecting');
              try {
                const cert = await loadCertificate(tv.ip);
                if (!cert) { setAtpv2Status('error'); Alert.alert('Connect', 'Sertifikat tidak ditemukan. Hapus & tambah TV lagi via Connect.'); return; }
                const conn = await connectRemote(tv.ip, cert);
                setAtpv2Conn(conn);
                setAtpv2Status('connected');
              } catch (e) {
                setAtpv2Status('error');
                Alert.alert('Connect', `Gagal connect: ${e.message}`);
              }
            }}
          />
        )}
        {tv.koneksiMetode === 'billingtv' && (
          <ADBBtn
            icon="cellphone" color={koneksi === 'online' ? C.ACCENT2 : C.RED}
            label={koneksi === 'online' ? 'WS✓' : 'WS✗'}
            busy={adbBusy}
            onPress={() => {
              if (koneksi === 'online') {
                Alert.alert('BillingTV', `TV ${tv.nama} terhubung via WebSocket.\nTimer dan lock screen dikontrol dari HP.`);
              } else {
                Alert.alert('BillingTV offline', 'Pastikan billingtv.apk aktif dan IP phone benar.');
              }
            }}
          />
        )}
      </View>

      {/* Dynamic install button */}
      {clientRunning ? (
        <View style={s.clientOnlineBox}>
          <Icon name="check-circle" size={16} color={C.GREEN} />
          <Text style={s.clientOnlineTxt}>CLIENT ONLINE</Text>
        </View>
      ) : koneksi === 'online' && !installing ? (
        <TouchableOpacity style={s.btnInstallClient} onPress={installClientApk}>
          <Icon name="cellphone-arrow-down" size={16} color="white" />
          <Text style={s.btnInstallClientTxt}>INSTALL TV CLIENT</Text>
        </TouchableOpacity>
      ) : installing ? (
        <View style={s.progressBox}>
          <Text style={s.stepLabel}>{INSTALL_STEP_LABELS[installStep] || ''}</Text>
          {['sending','verifying'].includes(installStep) && (
            <View style={s.progressBarBg}>
              <View style={[s.progressBarFill, { width: `${installPct}%` }]} />
            </View>
          )}
          {installStep === 'done' && (
            <Text style={s.stepDone}>✅ Selesai! TV Client aktif</Text>
          )}
          {installStep === 'error' && (
            <TouchableOpacity style={s.btnRetry} onPress={installClientApk}>
              <Text style={s.btnRetryTxt}>↻ Coba Lagi</Text>
            </TouchableOpacity>
          )}
          {!['done','error'].includes(installStep) && (
            <ActivityIndicator size="small" color={C.ACCENT} />
          )}
        </View>
      ) : null}

      {tv.koneksiMetode !== 'atpv2' && tv.koneksiMetode !== 'billingtv' && koneksi === 'offline' && !clientRunning && (
        <View style={s.offlineBox}>
          <Text style={s.offlineTxt}>
            ⚡ Aktifkan Wireless Debugging di TV, lalu tap "Cari Ulang"
          </Text>
          <TouchableOpacity style={s.btnCari} onPress={cariUlang} disabled={isScanning}>
            {isScanning
              ? <ActivityIndicator size="small" color={C.GREEN} />
              : <Icon name="wifi" size={16} color={C.GREEN} />}
            <Text style={s.btnCariTxt}>{isScanning ? 'Memindai port...' : 'Cari Ulang'}</Text>
          </TouchableOpacity>
        </View>
      )}

      {tv.koneksiMetode === 'billingtv' && koneksi === 'offline' && (
        <View style={[s.offlineBox, { borderColor: C.ACCENT2, backgroundColor: '#0A0A1A' }]}>
          <Text style={[s.offlineTxt, { color: C.ACCENT2 }]}>
            📱 Pastikan billingtv.apk aktif di TV.{'\n'}
            Masukkan IP phone ini di aplikasi TV.{'\n'}
            Port: 8080
          </Text>
        </View>
      )}

      {tv.koneksiMetode !== 'atpv2' && tv.koneksiMetode !== 'billingtv' && atpv2Status === 'error' && (
        <View style={s.offlineBox}>
          <Text style={s.offlineTxt}>
            ⚡ Koneksi terputus. Tap tombol Connect untuk reconnect.
          </Text>
        </View>
      )}

      {tv.koneksiMetode !== 'atpv2' && tv.koneksiMetode !== 'billingtv' && showPortInput && (
        <View style={s.gantiPortBox}>
          <Text style={s.gantiPortLabel}>Ganti Port ADB:</Text>
          <View style={s.gantiPortRow}>
            <TextInput
              style={s.gantiPortInput}
              value={newPort}
              onChangeText={setNewPort}
              keyboardType="numeric"
              placeholder="5555"
              placeholderTextColor={C.MUTED}
            />
            <TouchableOpacity style={s.btnSimpanPort} onPress={simpanPortBaru}>
              <Text style={s.btnSimpanPortTxt}>Simpan</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.btnBatalPort} onPress={() => setShowPortInput(false)}>
              <Text style={s.btnBatalPortTxt}>✕</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      <View style={s.botRow}>
        {tv.koneksiMetode === 'billingtv' ? (
          <TouchableOpacity
            style={[s.btnCek, { borderColor: koneksi === 'online' ? C.ACCENT2 : C.RED }]}
            onPress={() => {
              if (koneksi === 'online') {
                Alert.alert('BillingTV Status', `TV ${tv.nama} terhubung via WebSocket.\nTimer & lock screen aktif.`);
              } else {
                Alert.alert('BillingTV offline', `Pastikan billingtv.apk aktif di TV.\nIP phone harus diisi di TV.`);
              }
            }}
          >
            <Text style={[s.btnCekTxt, { color: koneksi === 'online' ? C.ACCENT2 : C.RED }]}>
              {koneksi === 'online' ? 'WS ✓' : 'WS ✗'}
            </Text>
          </TouchableOpacity>
        ) : tv.koneksiMetode !== 'atpv2' ? (
          <TouchableOpacity style={s.btnCek} onPress={koneksi === 'offline' ? cariUlang : cekKoneksi} disabled={adbBusy || isScanning}>
            {adbBusy || isScanning ? <ActivityIndicator size="small" color={C.GREEN} />
              : <Text style={s.btnCekTxt}>{koneksi === 'offline' ? 'Cari Ulang' : 'Cek ADB'}</Text>}
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[s.btnCek, { borderColor: atpv2Status === 'connected' ? C.GREEN : C.RED }]}
            onPress={async () => {
              if (atpv2Status === 'connected') {
                atpv2Disconnect(atpv2Conn); setAtpv2Conn(null); setAtpv2Status('idle');
                return;
              }
              setAtpv2Status('connecting');
              try {
                const cert = await loadCertificate(tv.ip);
                if (!cert) { setAtpv2Status('error'); Alert.alert('Connect', 'Sertifikat tidak ditemukan. Hapus & tambah TV lagi via Connect.'); return; }
                const conn = await connectRemote(tv.ip, cert);
                setAtpv2Conn(conn);
                setAtpv2Status('connected');
              } catch (e) {
                setAtpv2Status('error');
                Alert.alert('Connect', `Gagal connect: ${e.message}`);
              }
            }}
            disabled={atpv2Status === 'connecting'}
          >
            {atpv2Status === 'connecting' ? <ActivityIndicator size="small" color={C.GREEN} />
              : <Text style={[s.btnCekTxt, { color: atpv2Status === 'connected' ? C.GREEN : C.RED }]}>
                  {atpv2Status === 'connected' ? '✓ Connect' : '✗ Error'}
                </Text>}
          </TouchableOpacity>
        )}
        <TouchableOpacity style={s.btnPaket} onPress={onPilihPaket}>
          <Icon name="package-variant" size={14} color="white" />
          <Text style={s.btnPaketTxt}>PAKET & PESANAN</Text>
        </TouchableOpacity>
      </View>

      {(tv.paketAktif || tv.timerActive) && (
        <TouchableOpacity style={s.btnSelesai} onPress={selesai}>
          <Icon name="stop-circle" size={16} color="white" />
          <Text style={s.btnSelesaiTxt}>⏹ SELESAI</Text>
        </TouchableOpacity>
      )}

      <ModalRemoteControl
        visible={showRemoteModal}
        onClose={() => setShowRemoteModal(false)}
        tv={tv}
        atpv2Conn={atpv2Conn}
        atpv2Status={atpv2Status}
      />
    </View>
  );
}

function ADBBtn({ icon, color, label, onPress, busy }) {
  return (
    <TouchableOpacity style={[s.adbBtn, { borderColor: color }]} onPress={onPress} disabled={busy}>
      <Icon name={icon} size={16} color={color} />
      <Text style={[s.adbBtnTxt, { color }]}>{label}</Text>
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  card: {
    flex: 1, backgroundColor: C.CARD, borderRadius: 14,
    borderWidth: 1, borderColor: C.BORDER,
    padding: 14, gap: 10,
  },
  cardExpired: { borderColor: C.RED },
  hdr:  { flexDirection: 'row', alignItems: 'center', gap: 8 },
  titleRow: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 },
  tvName: { ...FONTS.sub, color: C.ACCENT, fontSize: 13 },
  psBadge: {
    ...FONTS.small, fontSize: 9, color: C.YELLOW,
    borderWidth: 1, borderColor: C.YELLOW, borderRadius: 4,
    paddingHorizontal: 4, paddingVertical: 1,
  },
  metodeBadge: {
    ...FONTS.small, fontSize: 8,
    borderWidth: 1, borderRadius: 4,
    paddingHorizontal: 3, paddingVertical: 1,
  },
  koneksiTxt: { ...FONTS.small },
  delBtn: { padding: 4 },
  ipTxt: { ...FONTS.small, color: C.MUTED },
  bebasTotalTxt: { ...FONTS.sub, color: C.YELLOW, fontSize: 13, textAlign: 'center' },
  timerWrap: { alignItems: 'center', gap: 4 },
  timer: { fontFamily: 'monospace', fontSize: 30, fontWeight: 'bold', letterSpacing: 3 },
  paketLabel: { ...FONTS.small, color: C.YELLOW },
  billBox: {
    backgroundColor: C.CARD, borderRadius: 8, padding: 8,
    marginHorizontal: 0, marginBottom: 4,
    borderWidth: 1, borderColor: C.BORDER,
  },
  billItem: { paddingVertical: 2 },
  billLunas: { ...FONTS.small, color: C.GREEN, fontWeight: 'bold' },
  billTagihan: { ...FONTS.small, color: C.RED },
  billTotal: { ...FONTS.sub, color: C.TEXT, fontWeight: 'bold' },
  ctrlRow: { flexDirection: 'row', gap: 8, justifyContent: 'center', flexWrap: 'wrap' },
  adbBtn: {
    borderWidth: 1, borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 6,
    alignItems: 'center', gap: 2,
    backgroundColor: C.BTN,
  },
  adbBtnTxt: { ...FONTS.small, fontSize: 9 },
  botRow: { flexDirection: 'row', gap: 8 },
  btnCek: {
    flex: 1, paddingVertical: 8, borderRadius: 8,
    backgroundColor: C.BTN, borderWidth: 1, borderColor: C.GREEN,
    alignItems: 'center',
  },
  btnCekTxt: { ...FONTS.small, color: C.GREEN },
  btnPaket: {
    flex: 2, paddingVertical: 8, borderRadius: 8,
    backgroundColor: C.ACCENT2, flexDirection: 'row',
    alignItems: 'center', justifyContent: 'center', gap: 6,
  },
  btnPaketTxt: { color: 'white', ...FONTS.small, fontSize: 11, fontWeight: 'bold' },
  btnInstallClient: {
    paddingVertical: 12, borderRadius: 10,
    backgroundColor: C.ACCENT2, alignItems: 'center',
    flexDirection: 'row', justifyContent: 'center', gap: 6,
  },
  btnInstallClientTxt: { color: 'white', ...FONTS.sub, fontSize: 12 },
  clientOnlineBox: {
    paddingVertical: 12, borderRadius: 10,
    backgroundColor: '#0A2A0A', alignItems: 'center',
    flexDirection: 'row', justifyContent: 'center', gap: 6,
    borderWidth: 1, borderColor: C.GREEN,
  },
  clientOnlineTxt: { color: C.GREEN, ...FONTS.sub, fontSize: 12 },
  progressBox: {
    paddingVertical: 12, borderRadius: 10,
    backgroundColor: C.BTN, alignItems: 'center',
    gap: 6, borderWidth: 1, borderColor: C.BORDER,
  },
  stepLabel: { ...FONTS.sub, color: C.YELLOW, fontSize: 11 },
  stepDone: { ...FONTS.sub, color: C.GREEN, fontSize: 11 },
  progressBarBg: {
    width: '100%', height: 8, borderRadius: 4,
    backgroundColor: '#333', overflow: 'hidden',
  },
  progressBarFill: {
    height: 8, borderRadius: 4, backgroundColor: C.GREEN,
  },
  btnRetry: {
    borderWidth: 1, borderColor: C.YELLOW, borderRadius: 6,
    paddingHorizontal: 12, paddingVertical: 6,
  },
  btnRetryTxt: { color: C.YELLOW, ...FONTS.sub, fontSize: 11 },
  btnSelesai: {
    paddingVertical: 12, borderRadius: 10,
    backgroundColor: C.RED, alignItems: 'center',
    flexDirection: 'row', justifyContent: 'center', gap: 6,
  },
  btnSelesaiTxt: { color: 'white', ...FONTS.sub },
  offlineBox: {
    backgroundColor: '#1A0A0A', borderRadius: 10,
    borderWidth: 1, borderColor: C.RED, padding: 12,
    alignItems: 'center', gap: 10,
  },
  offlineTxt: { ...FONTS.small, color: C.YELLOW, textAlign: 'center', lineHeight: 18 },
  btnCari: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    borderWidth: 1, borderColor: C.GREEN, borderRadius: 8,
    paddingHorizontal: 14, paddingVertical: 8,
    backgroundColor: '#0A1A0A',
  },
  btnCariTxt: { ...FONTS.sub, color: C.GREEN, fontSize: 11 },
  gantiPortBox: {
    backgroundColor: '#1A1A2A', borderRadius: 10,
    borderWidth: 1, borderColor: C.YELLOW, padding: 10,
  },
  gantiPortLabel: { ...FONTS.small, color: C.YELLOW, marginBottom: 6 },
  gantiPortRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  gantiPortInput: {
    flex: 1, backgroundColor: C.BTN, borderRadius: 8,
    borderWidth: 1, borderColor: C.BORDER, color: C.TEXT,
    paddingHorizontal: 10, paddingVertical: 6, ...FONTS.body,
  },
  btnSimpanPort: {
    backgroundColor: C.GREEN, borderRadius: 8,
    paddingHorizontal: 14, paddingVertical: 8,
  },
  btnSimpanPortTxt: { color: 'white', ...FONTS.small, fontWeight: 'bold' },
  btnBatalPort: {
    borderWidth: 1, borderColor: C.RED, borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 8,
  },
  btnBatalPortTxt: { color: C.RED, ...FONTS.sub },
});
