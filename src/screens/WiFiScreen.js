import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  TextInput, ActivityIndicator,
} from 'react-native';
import { MaterialCommunityIcons as Icon } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { C, FONTS } from '../utils/theme';
import { ADBHelper } from '../utils/adbHelper';
import connectionManager from '../utils/connectionManager';
import ModalPairing from '../components/ModalPairing';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import { useStore } from '../store/useStore';

const TARGET_IP = '192.168.1.54';
const TARGET_PORT = 5555;

export default function WiFiScreen() {
  const promoVideoUrl = useStore(s => s.promoVideoUrl);
  const setPromoVideoUrl = useStore(s => s.setPromoVideoUrl);
  const [ip,         setIp]         = useState(TARGET_IP);
  const [port,       setPort]       = useState(String(TARGET_PORT));
  const [log,        setLog]        = useState([]);
  const [devices,    setDevices]    = useState([]);
  const [connecting, setConnecting] = useState(false);
  const [localIP,    setLocalIP]    = useState(null);
  const [showPair,   setShowPair]   = useState(false);
  const [mdnsFound,  setMdnsFound]  = useState([]);
  const [mdnsStatus, setMdnsStatus] = useState('');
  const [autoConnect, setAutoConnect] = useState(false);
  const [pendingPair, setPendingPair] = useState(null);
  const [connLayer, setConnLayer] = useState(null);
  const [clientStatus, setClientStatus] = useState('unknown');
  const targetIpRef = useRef(TARGET_IP);

  useEffect(() => {
    (async () => {
      const info = await ADBHelper.getLocalSubnet();
      if (info) {
        setLocalIP(info.localIP);
        addLog(`📡 IP HP: ${info.localIP}`);
      } else {
        addLog('⚠ Tidak dapat deteksi IP lokal. Cek koneksi WiFi.');
      }
    })();
  }, []);

  useEffect(() => {
    addLog('→ Memulai mDNS discovery...');
    setMdnsStatus('memulai...');
    ADBHelper.startMDNSDiscovery(
      targetIpRef.current,
      (foundIp, foundPort, serviceName, serviceType) => {
        const key = `${foundIp}:${foundPort}`;
        const typeLabel = serviceType === 'plain' ? '🔓' : '🔒';
        addLog(`✅ mDNS ${typeLabel}: ${key} (${serviceName || 'TV'})`);
        setMdnsFound(prev => {
          if (prev.some(f => `${f.ip}:${f.port}` === key)) return prev;
          return [...prev, { ip: foundIp, port: foundPort, name: serviceName, type: serviceType }];
        });
        if (autoConnect && foundIp === targetIpRef.current) {
          if (serviceType === 'plain' || String(foundPort) === '5555') {
            addLog(`→ Auto-connect ke ${foundIp}:${foundPort}...`);
            doConnect(foundIp, String(foundPort));
          } else if (serviceType === 'tls') {
            (async () => {
              const savedPin = await AsyncStorage.getItem('adb_pair_pin_' + foundIp);
              if (savedPin) {
                addLog(`→ Auto-pair TLS ke ${foundIp}:${foundPort}...`);
                const r = await ADBHelper.pairDevice(foundIp, foundPort, savedPin);
                if (r.sukses) {
                  addLog('✅ Pairing sukses, konek ke 5555...');
                  await new Promise(resolve => setTimeout(resolve, 1500));
                  doConnect(foundIp, '5555');
                } else {
                  addLog(`⚠ Auto-pair gagal: ${r.pesan}`);
                }
              } else {
                addLog(`ℹ TLS ditemukan — buka pairing...`);
                setPendingPair({ ip: foundIp, port: foundPort });
                setShowPair(true);
              }
            })();
          }
        }
      },
      (status, msg) => {
        setMdnsStatus(status === 'started' ? 'aktif' : status === 'stopped' ? 'berhenti' : `error: ${msg || status}`);
        if (status === 'error') addLog(`⚠ mDNS: ${msg || 'Gagal'}`);
      }
    );
    return () => {
      ADBHelper.stopMDNSDiscovery();
      setMdnsStatus('berhenti');
    };
  }, []);

  const addLog = (msg) => {
    const ts = new Date().toLocaleTimeString('id-ID');
    setLog(prev => [{ id: Date.now().toString(), ts, msg }, ...prev.slice(0, 99)]);
  };

  const doConnect = async (targetIp, targetPort) => {
    const p = parseInt(targetPort) || parseInt(port);
    const addr = targetIp || ip.trim();
    if (!addr || isNaN(p)) { addLog('⚠ IP/Port tidak valid'); return; }
    const existing = ADBHelper.getConnectedDevices().find(d => d.ip === addr);
    if (existing) {
      ADBHelper.disconnect(addr, existing.port);
      addLog(`→ Koneksi lama ${addr}:${existing.port} diputus`);
    }
    setConnecting(true);
    addLog(`→ Menghubungkan ke ${addr}:${p}...`);
    const result = await ADBHelper.directConnect(addr, p);
    if (result.sukses) {
      addLog(`✅ Terhubung ke ${addr}:${p}`);
      addDevice(addr, p);
      // Auto-detect TV Client & upgrade connection layer
      checkTvClientUpgrade(addr);
    } else {
      addLog(`✖ ${result.pesan}`);
    }
    setConnecting(false);
  };

  const checkTvClientUpgrade = async (ip) => {
    try {
      const hasClient = await connectionManager.checkClientRunning(ip);
      setClientStatus(hasClient ? 'running' : 'not_found');
      if (hasClient) {
        addLog(`📡 TV Client terdeteksi, upgrade koneksi...`);
        const layer = await connectionManager.connect(ip);
        if (layer) {
          setConnLayer(layer);
          addLog(`✅ Connection upgraded to ${layer.toUpperCase()}`);
        }
      }
    } catch (e) {
      setClientStatus('error');
    }
  };

  const addDevice = (addr, p) => {
    const key = `${addr}:${p}`;
    setDevices(prev => {
      if (!prev.find(d => d.key === key)) {
        return [...prev, { key, ip: addr, port: p, status: 'device' }];
      }
      return prev.map(d => d.key === key ? { ...d, status: 'device' } : d);
    });
  };

  const doDisconnect = async (targetIp, targetPort) => {
    const addr = targetIp || ip.trim();
    const p = parseInt(targetPort) || parseInt(port);
    if (!addr) return;
    addLog(`→ Memutus ${addr}:${p}...`);
    ADBHelper.disconnect(addr, p);
    setDevices(prev => prev.filter(d => !(d.ip === addr && d.port === p)));
    addLog(`✅ Disconnected ${addr}:${p}`);
  };

  const doDisconnectAll = async () => {
    if (devices.length === 0) { addLog('⚠ Tidak ada device terhubung'); return; }
    addLog(`→ Memutus semua (${devices.length} device)...`);
    ADBHelper.disconnectAll();
    setDevices([]);
    addLog('✅ Semua koneksi diputus');
  };

  const onPairSuccess = (pairIp, pairPort, pairPin) => {
    if (pendingPair && pairPin) {
      AsyncStorage.setItem('adb_pair_pin_' + pairIp, pairPin);
    }
    setPendingPair(null);
    setIp(pairIp);
    setPort(String(pairPort));
    setShowPair(false);
    addLog(`✅ Paired & connected — ${pairIp}:${pairPort}`);
    addDevice(pairIp, pairPort);
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
        <Text style={s.hdrTitle}>ADB WIFI</Text>
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
              style={[s.input, { width: 100 }]}
              placeholder="Port"
              placeholderTextColor={C.MUTED}
              value={port} onChangeText={setPort}
              keyboardType="numeric"
            />
          </View>

          <View style={s.btnRow}>
            <TouchableOpacity
              style={[s.btn, { borderColor: C.GREEN }]}
              onPress={() => doConnect()} disabled={connecting}
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

          {/* Connect Target langsung */}
          <View style={[s.btnRow, { marginTop: 8 }]}>
            <TouchableOpacity
              style={[s.btn, { borderColor: C.YELLOW, flex: 2 }]}
              onPress={() => doConnect(TARGET_IP, String(TARGET_PORT))}
              disabled={connecting}
            >
              {connecting
                ? <ActivityIndicator size="small" color={C.YELLOW} />
                : <Text style={[s.btnTxt, { color: C.YELLOW }]}>🎯 Connect Target ({TARGET_IP})</Text>
              }
            </TouchableOpacity>
            <TouchableOpacity style={[s.btn, { borderColor: C.RED }]} onPress={doDisconnectAll}>
              <Text style={[s.btnTxt, { color: C.RED }]}>✖ All</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* ── Connection Status ── */}
        {connLayer && (
          <View style={s.card}>
            <Text style={s.cardTitle}>🔗 Koneksi Aktif</Text>
            <View style={diagRow}>
              <Text style={diagLabel}>Layer:</Text>
              <Text style={[diagVal, {
                color: connLayer === 'ws' ? C.GREEN : connLayer === 'http' ? C.YELLOW : C.ACCENT
              }]}>
                {connLayer === 'ws' ? 'WebSocket' : connLayer === 'http' ? 'HTTP' : 'ADB'}
              </Text>
              <Text style={{ ...FONTS.small, color: C.MUTED, marginLeft: 4 }}>
                port {connectionManager.getActivePort()}
              </Text>
            </View>
            <View style={diagRow}>
              <Text style={diagLabel}>Client:</Text>
              <Text style={[diagVal, {
                color: clientStatus === 'running' ? C.GREEN : clientStatus === 'not_found' ? C.YELLOW : C.MUTED
              }]}>
                {clientStatus === 'running' ? '✅ Running' : clientStatus === 'not_found' ? '❌ Not found' : '?'}
              </Text>
            </View>
            {clientStatus === 'not_found' && (
              <TouchableOpacity
                style={[s.btn, { borderColor: C.ACCENT2, marginTop: 8 }]}
                onPress={() => {
                  const d = ADBHelper.getConnectedDevices()[0];
                  if (d) checkTvClientUpgrade(d.ip);
                }}
              >
                <Text style={[s.btnTxt, { color: C.ACCENT2 }]}>🔄 Cek Client</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* ── mDNS Discovery ── */}
        <View style={s.card}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <Text style={s.cardTitle}>📡 Discovery</Text>
            <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
              <TouchableOpacity onPress={() => setAutoConnect(!autoConnect)}>
                <Text style={{ color: autoConnect ? C.GREEN : C.MUTED, ...FONTS.small, fontWeight: 'bold' }}>
                  {autoConnect ? '⚡ Auto: ON' : '⚡ Auto: OFF'}
                </Text>
              </TouchableOpacity>
              <View style={[s.mdnsDot, { backgroundColor: mdnsStatus === 'aktif' ? C.GREEN : mdnsStatus ? C.RED : C.MUTED }]} />
              <Text style={{ ...FONTS.small, color: C.MUTED }}>{mdnsStatus || 'mati'}</Text>
            </View>
          </View>
          {mdnsFound.length > 0 && (
            <View style={s.foundList}>
              <Text style={s.foundLabel}>📡 mDNS ({mdnsFound.length}):</Text>
              {mdnsFound.map((f, idx) => (
                <View key={idx} style={s.foundRow}>
                  <TouchableOpacity style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 }} onPress={() => { setIp(f.ip); setPort(String(f.port)); }}>
                    <Icon name={f.type === 'plain' ? 'television' : 'lock'} size={14} color={f.type === 'plain' ? C.GREEN : C.YELLOW} />
                    <Text style={s.foundTxt}>{f.ip}:{f.port}</Text>
                    {f.type === 'tls' && <Text style={[s.foundUse, { color: C.YELLOW }]}>TLS</Text>}
                    {f.type === 'plain' && <Text style={[s.foundUse, { color: C.GREEN }]}>5555</Text>}
                    <Text style={s.foundUse}>Gunakan →</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}
          {mdnsFound.length === 0 && mdnsStatus === 'aktif' && (
            <Text style={s.emptyTxt}>Menunggu discovery... Pastikan Wireless Debugging aktif di TV.</Text>
          )}
        </View>

        {/* ── Devices Terhubung ── */}
        <View style={s.card}>
          <Text style={s.cardTitle}>📟 Devices Terhubung ({devices.length})</Text>
          {devices.length === 0 ? (
            <Text style={s.emptyTxt}>Belum ada device. Gunakan Connect atau Pairing.</Text>
          ) : devices.map(d => (
            <View key={d.key} style={s.devRow}>
              <TouchableOpacity style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 }} onPress={() => onUseDevice(d)}>
                <Icon name="television-shimmer" size={16} color={C.GREEN} />
                <Text style={s.devTxt}>{d.key}</Text>
                <View style={[s.devBadge, { backgroundColor: C.GREEN + '33' }]}>
                  <Text style={s.devBadgeTxt}>ONLINE</Text>
                </View>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => doDisconnect(d.ip, d.port)} style={{ padding: 4 }}>
                <Icon name="close-circle" size={18} color={C.RED} />
              </TouchableOpacity>
            </View>
          ))}
        </View>

        {/* ── Video Promo (untuk semua TV) ── */}
        <View style={s.card}>
          <Text style={s.cardTitle}>🎬 Video Promo TV</Text>
          <Text style={{ ...FONTS.small, color: C.MUTED, marginBottom: 8 }}>
            Video promosi ditampilkan ke semua TV saat pertama terhubung (idle).
          </Text>
          <TouchableOpacity
            style={[s.btn, { borderColor: C.ACCENT, marginBottom: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }]}
            onPress={async () => {
              try {
                const result = await DocumentPicker.getDocumentAsync({
                  type: 'video/*',
                  copyToCacheDirectory: true,
                });
                if (!result.canceled && result.assets && result.assets.length > 0) {
                  const file = result.assets[0];
                  const fileName = file.name || 'promo.mp4';
                  const destPath = `${FileSystem.documentDirectory}${fileName}`;
                  await FileSystem.copyAsync({ from: file.uri, to: destPath });
                  setPromoVideoUrl(destPath);
                  addLog(`✅ Video promo diset: ${fileName}`);
                }
              } catch (e) {
                addLog(`❌ Gagal pilih video: ${e.message}`);
              }
            }}
          >
            <Icon name="file-video" size={18} color={C.ACCENT} />
            <Text style={[s.btnTxt, { color: C.ACCENT }]}>
              {promoVideoUrl ? 'Ganti Video' : 'Pilih Video dari HP'}
            </Text>
          </TouchableOpacity>
          <View style={s.btnRow}>
            <TouchableOpacity
              style={[s.btn, { borderColor: C.RED }]}
              onPress={() => {
                setPromoVideoUrl('');
                addLog('🗑 Video promo dihapus');
              }}
            >
              <Text style={[s.btnTxt, { color: C.RED }]}>🗑 Hapus</Text>
            </TouchableOpacity>
          </View>
          {promoVideoUrl ? (
            <View style={{ marginTop: 8, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Icon name="check-circle" size={12} color={C.GREEN} />
              <Text style={{ ...FONTS.small, color: C.GREEN, flex: 1 }} numberOfLines={1}>
                Aktif: {promoVideoUrl.split('/').pop()}
              </Text>
            </View>
          ) : (
            <View style={{ marginTop: 8, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Icon name="close-circle" size={12} color={C.MUTED} />
              <Text style={{ ...FONTS.small, color: C.MUTED }}>Belum diset (promo nonaktif)</Text>
            </View>
          )}
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
        ipAwal={pendingPair?.ip || ip}
        portAwal={pendingPair?.port ? String(pendingPair.port) : ''}
        onClose={() => { setShowPair(false); setPendingPair(null); }}
        onSuccess={onPairSuccess}
      />
    </View>
  );
}

const diagRow = {
  flexDirection: 'row', alignItems: 'center', gap: 8,
  paddingVertical: 4,
};
const diagLabel = { ...FONTS.small, color: '#FFFFFF', width: 90 };
const diagVal = { ...FONTS.small, color: '#FFFFFF', fontWeight: 'bold' };

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
  mdnsDot: {
    width: 8, height: 8, borderRadius: 4,
  },
});
