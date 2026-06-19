import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  TextInput, ActivityIndicator, FlatList, Alert,
} from 'react-native';
import { MaterialCommunityIcons as Icon } from '@expo/vector-icons';
import { C, FONTS } from '../utils/theme';
import { ADBHelper } from '../utils/adbHelper';
import ModalPairing from '../components/ModalPairing';

export default function WiFiScreen() {
  const [ip,         setIp]         = useState('');
  const [port,       setPort]       = useState('5555');
  const [log,        setLog]        = useState([]);
  const [devices,    setDevices]    = useState([]);
  const [scanning,   setScanning]   = useState(false);
  const [scanProgress, setScanProgress] = useState(0);
  const [scanTotal,  setScanTotal]  = useState(254);
  const [connecting, setConnecting] = useState(false);
  const [localIP,    setLocalIP]    = useState(null);
  const [showPair,   setShowPair]   = useState(false);
  const [foundList,  setFoundList]  = useState([]);

  useEffect(() => {
    ADBHelper.getLocalIP().then(lip => {
      if (lip) setLocalIP(lip);
    });
  }, []);

  const addLog = (msg) => {
    const ts = new Date().toLocaleTimeString('id-ID');
    setLog(prev => [{ id: Date.now().toString(), ts, msg }, ...prev.slice(0, 49)]);
  };

  const doConnect = async () => {
    const p = parseInt(port);
    if (!ip.trim() || isNaN(p)) {
      addLog('⚠ IP/Port tidak valid'); return;
    }
    setConnecting(true);
    addLog(`→ Menghubungkan ke ${ip}:${p}...`);
    const result = await ADBHelper.connect(ip.trim(), p);
    if (result.sukses) {
      addLog(`✅ Terhubung ke ${ip}:${p}`);
      setDevices(prev => {
        const key = `${ip.trim()}:${p}`;
        if (!prev.find(d => d.key === key)) {
          return [...prev, { key, ip: ip.trim(), port: p, status: 'device' }];
        }
        return prev.map(d => d.key === key ? { ...d, status: 'device' } : d);
      });
    } else {
      addLog(`✖ ${result.pesan}`);
      if (result.status === 'unauthorized') {
        Alert.alert('Otorisasi Diperlukan',
          'TV menampilkan dialog "Izinkan debugging USB". Buka TV dan tap "Izinkan".');
      }
    }
    setConnecting(false);
  };

  const doDisconnect = async () => {
    const p = parseInt(port);
    if (!ip.trim()) return;
    addLog(`→ Memutus ${ip}:${p}...`);
    setDevices(prev => prev.filter(d => !(d.ip === ip.trim() && d.port === p)));
    addLog(`✅ Disconnected ${ip}:${p}`);
  };

  const doScan = async () => {
    if (!localIP) {
      Alert.alert('IP Tidak Ditemukan', 'Tidak bisa scan — HP tidak terhubung WiFi.');
      return;
    }
    setScanning(true);
    setScanProgress(0);
    setFoundList([]);
    addLog(`→ Scanning jaringan ${localIP.split('.').slice(0,3).join('.')}.x ...`);

    await ADBHelper.scanNetwork(
      localIP,
      (prog, tot) => { setScanProgress(prog); setScanTotal(tot); },
      (foundIp) => {
        setFoundList(prev => [...prev, foundIp]);
        addLog(`✅ ADB ditemukan: ${foundIp}:5555`);
      }
    );

    setScanning(false);
    addLog(`↺ Scan selesai`);
  };

  const onPairSuccess = (pairIp, pairPort) => {
    setIp(pairIp);
    setPort(String(pairPort));
    setShowPair(false);
    addLog(`✅ Paired & connected — ${pairIp}:${pairPort}`);
    setDevices(prev => {
      const key = `${pairIp}:${pairPort}`;
      if (!prev.find(d => d.key === key)) {
        return [...prev, { key, ip: pairIp, port: pairPort, status: 'device' }];
      }
      return prev;
    });
  };

  const onUseDevice = (d) => {
    setIp(d.ip);
    setPort(String(d.port));
    addLog(`→ Dipilih: ${d.ip}:${d.port}`);
  };

  return (
    <View style={s.root}>
      {/* Header */}
      <View style={s.hdr}>
        <Icon name="access-point-network" size={20} color={C.ACCENT} />
        <Text style={s.hdrTitle}>KONEKSI ADB via Wi-Fi</Text>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={s.scroll}>

        {/* IP Lokal */}
        {localIP && (
          <View style={s.ipLocalBox}>
            <Icon name="cellphone-wireless" size={14} color={C.GREEN} />
            <Text style={s.ipLocalTxt}>IP HP kamu: {localIP}</Text>
          </View>
        )}

        {/* ── Panduan ── */}
        <View style={s.card}>
          <Text style={s.cardTitle}>📋 Cara Aktifkan ADB Wi-Fi</Text>
          <View style={s.tabRow}>
            <TouchableOpacity style={s.tabBtnActive}>
              <Text style={s.tabBtnTxtActive}>Android TV 11+</Text>
            </TouchableOpacity>
          </View>
          {[
            ['1', 'Pengaturan → Tentang', 'Tap "Build" 7x → Mode Developer aktif'],
            ['2', 'Pengaturan → Opsi Developer', 'Aktifkan "Wireless Debugging"'],
            ['3', '"Pair device with pairing code"', 'Catat IP, Port Pairing & PIN'],
            ['4', 'Tap tombol Pairing di bawah', 'Isi form → selesai otomatis!'],
          ].map(([no, title, sub]) => (
            <View key={no} style={s.stepRow}>
              <View style={s.stepNo}>
                <Text style={s.stepNoTxt}>{no}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.stepTitle}>{title}</Text>
                <Text style={s.stepSub}>{sub}</Text>
              </View>
            </View>
          ))}
        </View>

        {/* ── Connect Manual ── */}
        <View style={s.card}>
          <Text style={s.cardTitle}>🔌 Connect Manual</Text>
          <View style={s.ipRow}>
            <TextInput
              style={[s.input, { flex: 1 }]}
              placeholder="IP Address TV"
              placeholderTextColor={C.MUTED}
              value={ip} onChangeText={setIp}
              keyboardType="numeric"
            />
            <Text style={s.sep}>:</Text>
            <TextInput
              style={[s.input, { width: 80 }]}
              placeholder="Port"
              placeholderTextColor={C.MUTED}
              value={port} onChangeText={setPort}
              keyboardType="numeric"
            />
          </View>

          <View style={s.btnRow}>
            <TouchableOpacity
              style={[s.btn, { borderColor: C.GREEN }]}
              onPress={doConnect} disabled={connecting}
            >
              {connecting
                ? <ActivityIndicator size="small" color={C.GREEN} />
                : <Text style={[s.btnTxt, { color: C.GREEN }]}>⚡ Connect</Text>
              }
            </TouchableOpacity>
            <TouchableOpacity style={[s.btn, { borderColor: C.RED }]} onPress={doDisconnect}>
              <Text style={[s.btnTxt, { color: C.RED }]}>✖ Disconnect</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.btn, { borderColor: C.ACCENT }]} onPress={() => setShowPair(true)}>
              <Text style={[s.btnTxt, { color: C.ACCENT }]}>📡 Pairing</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* ── Scan Jaringan ── */}
        <View style={s.card}>
          <Text style={s.cardTitle}>📡 Scan Jaringan (cari TV ADB)</Text>
          {scanning ? (
            <View style={s.scanProgress}>
              <ActivityIndicator color={C.ACCENT} size="small" />
              <Text style={s.scanTxt}>
                Scanning {scanProgress}/{scanTotal} IP... {foundList.length} ditemukan
              </Text>
            </View>
          ) : (
            <TouchableOpacity style={s.btnScan} onPress={doScan}>
              <Icon name="magnify" size={16} color={C.ACCENT2} />
              <Text style={s.btnScanTxt}>🔍 Scan Semua IP di Jaringan</Text>
            </TouchableOpacity>
          )}

          {foundList.length > 0 && (
            <View style={s.foundList}>
              <Text style={s.foundLabel}>✅ Ditemukan ({foundList.length}):</Text>
              {foundList.map(fip => (
                <TouchableOpacity
                  key={fip} style={s.foundRow}
                  onPress={() => { setIp(fip); setPort('5555'); }}
                >
                  <Icon name="television" size={14} color={C.GREEN} />
                  <Text style={s.foundTxt}>{fip}:5555</Text>
                  <Text style={s.foundUse}>Gunakan →</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>

        {/* ── Devices Terhubung ── */}
        <View style={s.card}>
          <Text style={s.cardTitle}>📟 Devices Terhubung ({devices.length})</Text>
          {devices.length === 0 ? (
            <Text style={s.emptyTxt}>Belum ada device. Gunakan Connect atau Pairing.</Text>
          ) : devices.map(d => (
            <TouchableOpacity key={d.key} style={s.devRow} onPress={() => onUseDevice(d)}>
              <Icon name="television-shimmer" size={16} color={C.GREEN} />
              <Text style={s.devTxt}>{d.key}</Text>
              <View style={[s.devBadge, { backgroundColor: C.GREEN + '33' }]}>
                <Text style={s.devBadgeTxt}>ONLINE</Text>
              </View>
            </TouchableOpacity>
          ))}
        </View>

        {/* ── Log ── */}
        <View style={s.card}>
          <Text style={s.cardTitle}>📝 Log Output</Text>
          {log.length === 0
            ? <Text style={s.emptyTxt}>Belum ada log.</Text>
            : log.slice(0, 20).map(l => (
                <Text key={l.id} style={s.logLine}>
                  <Text style={s.logTs}>[{l.ts}] </Text>
                  <Text style={s.logMsg}>{l.msg}</Text>
                </Text>
              ))
          }
        </View>

        <View style={{ height: 30 }} />
      </ScrollView>

      {/* Modal Pairing */}
      <ModalPairing
        visible={showPair}
        ipAwal={ip}
        onClose={() => setShowPair(false)}
        onSuccess={onPairSuccess}
      />
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.BG },
  hdr: {
    backgroundColor: C.PANEL, flexDirection: 'row', alignItems: 'center',
    gap: 10, paddingHorizontal: 16, paddingVertical: 14,
  },
  hdrTitle: { ...FONTS.title, color: C.ACCENT, fontSize: 15 },
  scroll: { padding: 12, gap: 12 },
  ipLocalBox: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#0A2A0A', borderRadius: 8, padding: 8,
    borderWidth: 1, borderColor: C.GREEN,
  },
  ipLocalTxt: { ...FONTS.small, color: C.GREEN },
  card: {
    backgroundColor: C.PANEL, borderRadius: 14,
    borderWidth: 1, borderColor: C.BORDER,
    padding: 14, marginBottom: 4,
  },
  cardTitle: { ...FONTS.sub, color: C.ACCENT2, marginBottom: 12 },
  tabRow: { flexDirection: 'row', marginBottom: 10 },
  tabBtnActive: {
    paddingHorizontal: 14, paddingVertical: 6,
    backgroundColor: C.ACCENT2, borderRadius: 8,
  },
  tabBtnTxtActive: { ...FONTS.small, color: 'white' },
  stepRow: {
    flexDirection: 'row', gap: 12, alignItems: 'flex-start', marginBottom: 10,
  },
  stepNo: {
    width: 24, height: 24, borderRadius: 12,
    backgroundColor: C.ACCENT2, alignItems: 'center', justifyContent: 'center',
  },
  stepNoTxt: { color: 'white', fontSize: 12, fontWeight: 'bold' },
  stepTitle: { ...FONTS.label, color: C.TEXT },
  stepSub:   { ...FONTS.small, color: C.MUTED, lineHeight: 18 },
  ipRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 },
  input: {
    backgroundColor: C.BTN, borderRadius: 10, borderWidth: 1, borderColor: C.BORDER,
    color: C.ACCENT, ...FONTS.body, paddingHorizontal: 12, paddingVertical: 10,
    fontSize: 14,
  },
  sep: { color: C.MUTED, fontSize: 18, fontWeight: 'bold' },
  btnRow: { flexDirection: 'row', gap: 8 },
  btn: {
    flex: 1, borderWidth: 1, borderRadius: 8,
    paddingVertical: 10, alignItems: 'center',
    backgroundColor: C.BTN,
  },
  btnTxt: { ...FONTS.small, fontWeight: 'bold' },
  btnScan: {
    flexDirection: 'row', gap: 8, alignItems: 'center',
    borderWidth: 1, borderColor: C.ACCENT2, borderRadius: 8,
    paddingVertical: 10, paddingHorizontal: 14,
    backgroundColor: C.BTN,
  },
  btnScanTxt: { ...FONTS.small, color: C.ACCENT2 },
  scanProgress: { flexDirection: 'row', gap: 10, alignItems: 'center', paddingVertical: 8 },
  scanTxt: { ...FONTS.small, color: C.YELLOW },
  foundList: { marginTop: 10, gap: 6 },
  foundLabel: { ...FONTS.small, color: C.GREEN, marginBottom: 4 },
  foundRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: C.CARD, borderRadius: 8, padding: 10,
    borderWidth: 1, borderColor: C.GREEN,
  },
  foundTxt: { ...FONTS.label, color: C.GREEN, flex: 1 },
  foundUse: { ...FONTS.small, color: C.ACCENT },
  devRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 10, borderBottomWidth: 0.5, borderBottomColor: C.BORDER,
  },
  devTxt:   { ...FONTS.label, color: C.TEXT, flex: 1 },
  devBadge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  devBadgeTxt: { ...FONTS.small, color: C.GREEN, fontWeight: 'bold' },
  logLine: { marginBottom: 4 },
  logTs:   { ...FONTS.small, color: C.MUTED },
  logMsg:  { ...FONTS.small, color: C.GREEN },
  emptyTxt: { ...FONTS.small, color: C.MUTED, textAlign: 'center', paddingVertical: 10 },
});
