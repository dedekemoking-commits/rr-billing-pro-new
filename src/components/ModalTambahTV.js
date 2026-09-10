import React, { useState, useEffect, useRef } from 'react';
import {
  Modal, View, Text, TextInput, TouchableOpacity,
  StyleSheet, ScrollView, ActivityIndicator, useWindowDimensions,
} from 'react-native';
import { MaterialCommunityIcons as Icon } from '@expo/vector-icons';
import { C, FONTS, JENIS_PS } from '../utils/theme';
import { ADBHelper } from '../utils/adbHelper';
import { pairWithTV, submitPairingCode } from '../utils/atpv2Helper';
import {
  startMDNS, stopMDNS, scanTCP, isValidIP, getSubnet,
} from '../utils/atpv2Discovery';

export default function ModalTambahTV({ visible, onClose, onConfirm, nomorTV }) {
  const { height: screenH, width: screenW } = useWindowDimensions();
  const isLandscape = screenW > screenH;
  const [ip, ipSet] = useState('');
  const [port, portSet] = useState('5555');
  const [nama, namaSet] = useState('');
  const [loading, loadingSet] = useState(false);
  const [step, stepSet] = useState('input'); // input | rsa | atpv2_pairing | done
  const [msg, msgSet] = useState('');
  const [showGuide, setShowGuide] = useState(false);
  const [jenisPs, setJenisPs] = useState(null);
  const [metode, setMetode] = useState('atpv2'); // 'adb' | 'atpv2' | 'billingtv'
  const [atpv2Cert, setAtpv2Cert] = useState(null);
  const [atpv2Code, setAtpv2Code] = useState('');
  const [pairingCodeInput, setPairingCodeInput] = useState('');

  // ─── Discovery state ───
  const [discoveredTVs, setDiscoveredTVs] = useState([]);
  const [mdnsStatus, setMdnsStatus] = useState('');
  const [scanningLAN, setScanningLAN] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);
  const localIP = useRef('');

  // ─── Get local IP & start discovery ───
  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    (async () => {
      try {
        const mod = require('expo-network');
        const ip = await mod.getIpAddressAsync();
        if (!cancelled) localIP.current = ip;
        console.log('[DISCOVERY] Local IP:', ip);
      } catch (e) {
        console.warn('[DISCOVERY] Gagal dapat local IP:', e);
      }
    })();
    setDiscoveredTVs([]);
    setMdnsStatus('memulai...');
    startMDNS(
      (tv) => {
        if (cancelled) return;
        setDiscoveredTVs(prev => {
          if (prev.some(t => t.ip === tv.ip)) return prev;
          return [...prev, tv];
        });
      },
      (status, msg) => {
        if (cancelled) return;
        if (status === 'started') setMdnsStatus('aktif');
        else if (status === 'stopped') setMdnsStatus('');
        else if (status === 'error') setMdnsStatus('error');
      },
    );
    return () => { cancelled = true; stopMDNS(); };
  }, [visible]);

  const reset = () => {
    ipSet(''); portSet('5555'); namaSet(''); loadingSet(false);
    stepSet('input'); msgSet(''); setShowGuide(false); setJenisPs(null);
    setMetode('atpv2'); setAtpv2Cert(null); setAtpv2Code('');
    setPairingCodeInput(''); setDiscoveredTVs([]);
  };

  // ─── Scan LAN (TCP fallback) ───
  const handleScanLAN = async () => {
    const subnet = getSubnet(localIP.current);
    if (!subnet) { msgSet('Gagal mendeteksi subnet jaringan'); return; }
    setScanningLAN(true);
    msgSet(`Memindai ${subnet}.1-254 port 6467...`);
    const results = await scanTCP(subnet, (done, total, found) => {
      setScanProgress(Math.round((done / total) * 100));
    });
    setScanningLAN(false);
    if (results.length === 0) {
      msgSet('Tidak ada TV dengan port 6467 terbuka di jaringan ini.');
    } else {
      msgSet(`Ditemukan ${results.length} TV via port scan.`);
      setDiscoveredTVs(prev => {
        const combined = [...prev];
        for (const r of results) {
          if (!combined.some(t => t.ip === r.ip)) combined.push(r);
        }
        return combined;
      });
    }
  };

  const handleClose = () => { reset(); onClose(); };

  // ─── LANGSUNG CONNECT ────────────────────────────────────
  const handleConnect = async () => {
    loadingSet(true);
    msgSet('');

    if (metode === 'billingtv') {
      // ── BillingTV: langsung done, TV akan konek ke WS server ──
      const phoneIp = localIP.current || 'IP Anda';
      stepSet('done');
      msgSet(`BillingTV aktif. Masukkan IP phone (${phoneIp}) di billingtv.apk. Port: 8080`);
      loadingSet(false);
      return;
    }

    if (!ip.trim()) { loadingSet(false); return; }

    if (metode === 'atpv2') {
      // ── ATPv2 pairing ──
      stepSet('atpv2_pairing');
      msgSet('Menghubungkan ke TV port 6467...');
      const result = await pairWithTV(ip.trim());
      loadingSet(false);
      if (result.sukses && result.cert) {
        setAtpv2Cert(result.cert);
        if (result.code) {
          setAtpv2Code(result.code);
          msgSet(`Kode di TV: ${result.code}. Masukkan kode yang tampil di layar TV.`);
        } else {
          msgSet('TV siap pairing. Masukkan kode 6 digit dari layar TV.');
        }
      } else {
        msgSet(result.pesan || 'Gagal pairing');
        stepSet('input');
      }
      return;
    }

    // ── ADB (existing) ──
    const targetPort = parseInt(port.trim()) || 5555;
    stepSet('rsa');
    console.log(`[TAMBAH-TV] Connecting to ${ip.trim()}:${targetPort}...`);
    const existing = ADBHelper.getConnectedDevices().find(d => d.ip === ip.trim());
    if (existing) {
      ADBHelper.disconnect(ip.trim(), existing.port);
    }
    const result = await ADBHelper.connect(ip.trim(), targetPort, { handshakeTimeout: 120000 });
    loadingSet(false);
    if (result.sukses) {
      msgSet(result.pesan);
      stepSet('done');
    } else {
      const msg = result.pesan === 'PUBLIC_KEY_REJECTED'
        ? 'Public key ditolak TV. Gunakan menu "Wireless Debugging" dengan kode pairing 6 digit.'
        : result.pesan === 'ADB handshake timeout'
        ? 'Tidak ada respon dari TV setelah 2 menit. Pastikan TV menyala dan cek port yang benar.'
        : (result.pesan || 'Gagal koneksi.');
      msgSet(msg);
      stepSet('input');
    }
  };

  const handleSubmitPairingCode = async () => {
    if (!pairingCodeInput.trim() || pairingCodeInput.length !== 6) {
      msgSet('Masukkan 6 karakter hex dari layar TV (contoh: A3F2B1)');
      return;
    }
    if (!atpv2Cert) {
      msgSet('Sertifikat belum digenerate. Coba lagi.');
      return;
    }
    loadingSet(true);
    msgSet('Memproses kode pairing...');
    const result = await submitPairingCode(ip.trim(), atpv2Cert, pairingCodeInput.trim());
    loadingSet(false);
    if (result.sukses) {
      stepSet('done');
      msgSet('✅ Pairing berhasil! Sertifikat tersimpan.');
    } else {
      msgSet(result.pesan || 'Kode salah. Coba lagi.');
    }
  };

  // ─── SIMPAN TV ────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!jenisPs) return;
    const namaTV = nama.trim() || `KOTA ${nomorTV}`;
    const targetPort = parseInt(port.trim()) || 5555;
    await onConfirm({
      nama: namaTV,
      ip: ip.trim(),
      port: targetPort,
      jenisPs,
      koneksiMetode: metode,
    });
    reset();
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={s.overlay}>
        <View style={[s.container, { maxHeight: isLandscape ? '70%' : '85%' }]}>
          <ScrollView keyboardShouldPersistTaps="handled">
            {/* Header */}
            <View style={s.hdr}>
              <Text style={s.title}>TV #{nomorTV}</Text>
              <TouchableOpacity onPress={handleClose}>
                <Icon name="close" size={22} color={C.MUTED} />
              </TouchableOpacity>
            </View>

            {/* ─── STEP: INPUT IP ──────────────────────────── */}
            {step === 'input' && (
              <>
                {/* ── Discovered TVs ── */}
                {discoveredTVs.length > 0 && (
                  <View style={s.discBox}>
                    <View style={s.discHeader}>
                      <Icon name="television" size={16} color={C.GREEN} />
                      <Text style={s.discTitle}>TV Terdeteksi ({discoveredTVs.length})</Text>
                      <View style={[s.discDot, { backgroundColor: mdnsStatus === 'aktif' ? C.GREEN : C.MUTED }]} />
                    </View>
                    {discoveredTVs.map((tv, idx) => (
                      <TouchableOpacity key={idx} style={s.discRow} onPress={() => {
                        ipSet(tv.ip);
                        setMetode('atpv2');
                        msgSet(`TV dipilih: ${tv.name || tv.ip}. Tap "Hubungkan"`);
                      }}>
                        <Icon name="remote" size={18} color={C.GREEN} />
                        <Text style={s.discIp}>{tv.ip}</Text>
                        <Text style={s.discName}>{tv.name || 'Android TV'}</Text>
                        <Text style={s.discSrc}>{tv.source === 'mdns' ? 'mDNS' : 'Scan'}</Text>
                        <Icon name="arrow-right" size={16} color={C.YELLOW} />
                      </TouchableOpacity>
                    ))}
                  </View>
                )}

                {/* ── Scan progress ── */}
                {scanningLAN && (
                  <View style={s.scanBox}>
                    <ActivityIndicator size="small" color={C.YELLOW} />
                    <Text style={s.scanTxt}>{`Memindai... ${scanProgress}%`}</Text>
                  </View>
                )}

                {!scanningLAN && discoveredTVs.length === 0 && mdnsStatus !== 'aktif' && (
                  <View style={s.discEmpty}>
                    <Icon name="wifi-off" size={20} color={C.MUTED} />
                    <Text style={s.discEmptyTxt}>Mencari TV di jaringan...</Text>
                  </View>
                )}

                <TouchableOpacity style={s.btnScan} onPress={handleScanLAN} disabled={scanningLAN}>
                  <Icon name="wifi" size={16} color={C.YELLOW} />
                  <Text style={s.btnScanTxt}>
                    {scanningLAN ? 'Memindai...' : '🔍 Scan Jaringan (port 6467)'}
                  </Text>
                </TouchableOpacity>

                <Text style={s.labelAtau}>— atau masukkan IP manual —</Text>

                <Text style={s.label}>IP Address TV</Text>
                <TextInput
                  style={s.inp}
                  placeholder="192.168.1.xxx"
                  placeholderTextColor={C.MUTED}
                  value={ip}
                  onChangeText={ipSet}
                  keyboardType="numeric"
                  autoFocus
                />

                {metode === 'adb' && (
                  <>
                    <Text style={s.label}>Port ADB (5555 = standar)</Text>
                    <TextInput
                      style={s.inp}
                      placeholder="5555"
                      placeholderTextColor={C.MUTED}
                      value={port}
                      onChangeText={portSet}
                      keyboardType="numeric"
                    />
                  </>
                )}

                <Text style={s.label}>Nama TV (opsional)</Text>
                <TextInput
                  style={s.inp}
                  placeholder={`KOTA ${nomorTV}`}
                  placeholderTextColor={C.MUTED}
                  value={nama}
                  onChangeText={namaSet}
                />

                {/* ── Pilih Metode Koneksi ── */}
                <Text style={s.label}>Pilih Metode Koneksi:</Text>
                <View style={s.metodeRow3}>
                  <TouchableOpacity
                    style={[s.metodeBtn, metode === 'atpv2' && s.metodeBtnActiveA]}
                    onPress={() => setMetode('atpv2')}
                  >
                    <Icon name="remote" size={20} color={metode === 'atpv2' ? C.GREEN : C.MUTED} />
                    <Text style={[s.metodeBtnTxt, { color: metode === 'atpv2' ? C.GREEN : C.MUTED }]}>Connect</Text>
                    <Text style={s.metodeBtnSub}>Remote Service{'\n'}Port 6466/6467</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[s.metodeBtn, metode === 'adb' && s.metodeBtnActiveB]}
                    onPress={() => setMetode('adb')}
                  >
                    <Icon name="debug" size={20} color={metode === 'adb' ? C.YELLOW : C.MUTED} />
                    <Text style={[s.metodeBtnTxt, { color: metode === 'adb' ? C.YELLOW : C.MUTED }]}>ADB</Text>
                    <Text style={s.metodeBtnSub}>Wireless{'\n'}Debugging</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[s.metodeBtn, metode === 'billingtv' && s.metodeBtnActiveC]}
                    onPress={() => setMetode('billingtv')}
                  >
                    <Icon name="cellphone" size={20} color={metode === 'billingtv' ? C.ACCENT2 : C.MUTED} />
                    <Text style={[s.metodeBtnTxt, { color: metode === 'billingtv' ? C.ACCENT2 : C.MUTED }]}>BillingTV</Text>
                    <Text style={s.metodeBtnSub}>WebSocket{'\n'}Port 8080</Text>
                  </TouchableOpacity>
                </View>

                {metode === 'atpv2' && (
                  <View style={s.atpv2Info}>
                    <Icon name="information-outline" size={14} color={C.GREEN} />
                    <Text style={s.atpv2InfoTxt}>
                      Connect menggunakan Android TV Remote Service (bawaan TV). 
                      Pairing 1x dengan kode 6 digit, tidak perlu developer mode.
                    </Text>
                  </View>
                )}

                {metode === 'billingtv' && (
                  <View style={[s.atpv2Info, { borderColor: C.ACCENT2, backgroundColor: '#0A0A2A' }]}>
                    <Icon name="information-outline" size={14} color={C.ACCENT2} />
                    <Text style={[s.atpv2InfoTxt, { color: C.ACCENT2 }]}>
                      BillingTV menggunakan WebSocket. Install billingtv.apk di TV, 
                      masukkan IP phone ini (port 8080) di aplikasi TV.
                      Timer, lock screen, dan media dikontrol dari HP.
                    </Text>
                  </View>
                )}

                {msg ? (
                  <View style={[s.msgBox, { borderColor: C.RED }]}>
                    <Text style={[s.msgTxt, { color: C.RED }]}>{msg}</Text>
                  </View>
                ) : null}

                <TouchableOpacity
                  style={[s.btnMain, (loading || (metode !== 'billingtv' && !ip.trim())) && s.btnDisabled]}
                  onPress={handleConnect}
                  disabled={loading || (metode !== 'billingtv' && !ip.trim())}
                >
                  <Icon
                    name={metode === 'atpv2' ? 'remote' : metode === 'billingtv' ? 'cellphone' : 'wifi'}
                    size={18} color="white"
                  />
                  <Text style={s.btnMainTxt}>
                    {loading ? 'Menghubungkan...' :
                     metode === 'billingtv' ? 'Siapkan BillingTV' :
                     `Hubungkan via ${metode === 'atpv2' ? 'Connect' : 'ADB'}`}
                  </Text>
                </TouchableOpacity>

                {/* Guide: cara konfigurasi */}
                <TouchableOpacity style={s.btnGuide} onPress={() => setShowGuide(!showGuide)}>
                  <Icon name={showGuide ? 'chevron-up' : 'help-circle'} size={16} color={C.YELLOW} />
                  <Text style={s.btnGuideTxt}>
                    {showGuide ? 'Tutup Panduan' : 'TV tidak terdeteksi? Panduan ⚙'}
                  </Text>
                </TouchableOpacity>

                {showGuide && metode === 'adb' && (
                  <View style={s.guideBox}>
                    <Text style={s.guideTitle}>📋 Cara Aktifkan ADB di TV:</Text>
                    {[
                      'Buka Setelan TV → Preferensi Perangkat → Tentang',
                      'Tap "Nomor Build" 7x → Opsi Developer aktif',
                      'Kembali → Opsi Developer',
                      'Aktifkan "USB Debugging"',
                      'Aktifkan "ADB over Wi-Fi" (port 5555)\natau "Wireless Debugging" (port dinamis)',
                      'Catat IP & Port dari TV',
                      'Masukkan IP + Port di atas & tap Hubungkan',
                    ].map((step, i) => (
                      <View key={i} style={s.guideRow}>
                        <View style={s.guideDot}><Text style={s.guideDotTxt}>{i + 1}</Text></View>
                        <Text style={s.guideTxt}>{step}</Text>
                      </View>
                    ))}
                    <View style={s.guideNote}>
                      <Icon name="lightbulb-on" size={14} color={C.YELLOW} />
                      <Text style={s.guideNoteTxt}>
                        Android 11+: Gunakan "Wireless Debugging" + Pairing (kode 6 digit)
                      </Text>
                    </View>
                  </View>
                )}

                {showGuide && metode === 'atpv2' && (
                  <View style={s.guideBox}>
                    <Text style={s.guideTitle}>📋 Cara Pairing:</Text>
                    {[
                      'Pastikan TV dan HP dalam 1 jaringan WiFi',
                      'TV akan menampilkan kode 6 digit',
                      'Masukkan kode tersebut di popup yang muncul',
                      'Pairing otomatis — cukup 1x, sertifikat tersimpan',
                      'Setelah reboot TV, koneksi tetap jalan tanpa pairing ulang',
                    ].map((step, i) => (
                      <View key={i} style={s.guideRow}>
                        <View style={s.guideDot}><Text style={s.guideDotTxt}>{i + 1}</Text></View>
                        <Text style={s.guideTxt}>{step}</Text>
                      </View>
                    ))}
                    <View style={s.guideNote}>
                      <Icon name="lightbulb-on" size={14} color={C.GREEN} />
                      <Text style={s.guideNoteTxt}>
                        Tidak perlu developer mode atau ADB. Port 6466/6467 sudah otomatis terbuka.
                      </Text>
                    </View>
                  </View>
                )}

                {showGuide && metode === 'billingtv' && (
                  <View style={[s.guideBox, { borderColor: C.ACCENT2 }]}>
                    <Text style={[s.guideTitle, { color: C.ACCENT2 }]}>📋 Cara Setup BillingTV:</Text>
                    {[
                      'Install billingtv.apk di Android TV',
                      'Buka billingtv.apk → masukkan IP phone ini',
                      `IP phone: ${localIP.current || '(deteksi otomatis)'}`,
                      'Port: 8080 (default)',
                      'Tap "Mulai" di TV → status "Terhubung" muncul',
                      'TV akan menampilkan overlay timer saat sesi aktif',
                    ].map((step, i) => (
                      <View key={i} style={s.guideRow}>
                        <View style={[s.guideDot, { backgroundColor: C.ACCENT2 }]}><Text style={s.guideDotTxt}>{i + 1}</Text></View>
                        <Text style={s.guideTxt}>{step}</Text>
                      </View>
                    ))}
                    <View style={s.guideNote}>
                      <Icon name="lightbulb-on" size={14} color={C.ACCENT2} />
                      <Text style={s.guideNoteTxt}>
                        BillingTV tidak perlu developer mode. Timer, lock screen, dan media dikontrol langsung dari HP.
                      </Text>
                    </View>
                  </View>
                )}
              </>
            )}

            {/* ─── STEP: ATPv2 PAIRING — MASUKKAN KODE ──── */}
            {step === 'atpv2_pairing' && (
              <View style={s.atpv2PairBox}>
                {loading ? (
                  <>
                    <ActivityIndicator size="large" color={C.GREEN} />
                    <Text style={s.atpv2PairTitle}>Menghubungkan...</Text>
                    <Text style={s.atpv2PairHint}>
                      Menghubungkan ke TV port 6467...
                    </Text>
                  </>
                ) : (
                  <>
                    <Icon name="remote" size={48} color={C.GREEN} />
                    <Text style={s.atpv2PairTitle}>Kode Pairing</Text>
                    {atpv2Code ? (
                      <View style={s.codeDisplay}>
                        <Text style={s.codeTxt}>{atpv2Code}</Text>
                      </View>
                    ) : null}
                    <Text style={s.atpv2PairHint}>
                      Masukkan kode 6 digit hex yang tampil di layar TV Anda.
                    </Text>
                  </>
                )}

                <Text style={s.label}>Kode 6 Digit dari TV (Hex):</Text>
                <TextInput
                  style={s.inp}
                  placeholder="contoh: A3F2B1"
                  placeholderTextColor={C.MUTED}
                  value={pairingCodeInput}
                  onChangeText={v => setPairingCodeInput(v.toUpperCase())}
                  keyboardType="default"
                  autoCapitalize="characters"
                  maxLength={6}
                />

                {msg ? (
                  <View style={[s.msgBox, { borderColor: msg.includes('✅') ? C.GREEN : C.RED }]}>
                    <Text style={[s.msgTxt, { color: msg.includes('✅') ? C.GREEN : C.RED }]}>{msg}</Text>
                  </View>
                ) : null}

                <TouchableOpacity
                  style={[s.btnMain, (loading || !pairingCodeInput) && s.btnDisabled]}
                  onPress={handleSubmitPairingCode}
                  disabled={loading || !pairingCodeInput}
                >
                  {loading
                    ? <ActivityIndicator size="small" color="white" />
                    : <Icon name="check-circle" size={18} color="white" />}
                  <Text style={s.btnMainTxt}>
                    {loading ? 'Memproses...' : 'Kirim Kode Pairing'}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity style={s.btnBatal} onPress={() => { stepSet('input'); loadingSet(false); }}>
                  <Text style={s.btnBatalTxt}>Batal</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* ─── STEP: RSA DIALOG - MENUNGGU USER APPROVE ─── */}
            {step === 'rsa' && (
              <View style={s.rsaBox}>
                <ActivityIndicator size="large" color={C.ACCENT2} />
                <Text style={s.rsaTitle}>Menunggu Persetujuan...</Text>
                <Text style={s.rsaHint}>
                  Cek layar TV Anda.{'\n'}
                  Akan muncul dialog "Izinkan debugging USB?"{'\n'}
                  dengan fingerprint RSA.{'\n\n'}
                  <Text style={{ fontWeight: 'bold', color: C.ACCENT2 }}>
                    Tap "Izinkan" di TV untuk melanjutkan.
                  </Text>
                </Text>
                <TouchableOpacity style={s.btnBatal} onPress={() => { loadingSet(false); stepSet('input'); }}>
                  <Text style={s.btnBatalTxt}>Batal</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* ─── STEP: DONE - BERHASIL ──────────────────── */}
            {step === 'done' && (
              <View style={s.doneBox}>
                <Icon name="check-circle" size={48} color={C.GREEN} />
                <Text style={s.doneTitle}>Terhubung!</Text>
                <Text style={s.doneHint}>{msg}</Text>

                <View style={s.inputRow}>
                  <TextInput
                    style={[s.inp, { flex: 1 }]}
                    placeholder={`Nama: KOTA ${nomorTV}`}
                    placeholderTextColor={C.MUTED}
                    value={nama}
                    onChangeText={namaSet}
                  />
                </View>

                <Text style={s.psLabel}>Pilih Jenis PS untuk TV ini:</Text>
                <View style={s.psRow}>
                  {JENIS_PS.map(ps => (
                    <TouchableOpacity
                      key={ps}
                      style={[s.psBtn, jenisPs === ps && s.psBtnActive]}
                      onPress={() => setJenisPs(ps)}
                    >
                      <Text style={[s.psBtnTxt, jenisPs === ps && s.psBtnTxtActive]}>{ps}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <TouchableOpacity
                  style={[s.btnSave, !jenisPs && s.btnDisabled]}
                  onPress={handleSave}
                  disabled={!jenisPs}
                >
                  <Icon name="plus-circle" size={18} color="white" />
                  <Text style={s.btnSaveTxt}>Tambahkan TV Ini</Text>
                </TouchableOpacity>
              </View>
            )}

            <TouchableOpacity style={s.btnBatalBottom} onPress={handleClose}>
              <Text style={s.btnBatalTxt}>Batal</Text>
            </TouchableOpacity>
            <View style={{ height: 30 }} />
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  container: { backgroundColor: C.PANEL, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20 },
  hdr: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  title: { ...FONTS.title, color: C.ACCENT, fontSize: 16, flex: 1 },

  label: { ...FONTS.label, color: C.MUTED, marginBottom: 6 },
  inp: {
    backgroundColor: C.BTN, borderRadius: 10, borderWidth: 1, borderColor: C.BORDER,
    color: C.ACCENT, paddingHorizontal: 12, paddingVertical: 10,
    marginBottom: 12, fontSize: 15,
  },

  msgBox: { borderWidth: 1, borderRadius: 10, padding: 10, marginVertical: 8 },
  msgTxt: { ...FONTS.small, textAlign: 'center', lineHeight: 18 },

  btnMain: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    borderWidth: 1, borderColor: C.ACCENT2, borderRadius: 10,
    paddingVertical: 14, marginTop: 4, backgroundColor: C.ACCENT2,
  },
  btnMainTxt: { color: 'white', ...FONTS.sub, fontSize: 14 },
  btnDisabled: { opacity: 0.5 },

  // RSA waiting
  rsaBox: { alignItems: 'center', paddingVertical: 24, gap: 12 },
  rsaTitle: { ...FONTS.sub, color: C.ACCENT2, fontSize: 16, marginTop: 8 },
  rsaHint: { ...FONTS.small, color: C.MUTED, textAlign: 'center', lineHeight: 20 },

  // Done
  doneBox: { alignItems: 'center', paddingVertical: 16, gap: 8 },
  doneTitle: { ...FONTS.sub, color: C.GREEN, fontSize: 18, fontWeight: 'bold' },
  doneHint: { ...FONTS.small, color: C.MUTED, textAlign: 'center', lineHeight: 18, marginBottom: 8 },
  inputRow: { flexDirection: 'row', gap: 8, width: '100%' },
  psLabel: { ...FONTS.label, color: C.YELLOW, marginTop: 8, marginBottom: 4, textAlign: 'center' },
  psRow: { flexDirection: 'row', gap: 8, width: '100%' },
  psBtn: {
    flex: 1, paddingVertical: 10, borderRadius: 8,
    borderWidth: 1, borderColor: C.BORDER, backgroundColor: C.BTN,
    alignItems: 'center',
  },
  psBtnActive: { borderColor: C.YELLOW, backgroundColor: '#3A2A00' },
  psBtnTxt: { ...FONTS.sub, color: C.MUTED, fontSize: 13 },
  psBtnTxtActive: { color: C.YELLOW, fontWeight: 'bold' },
  btnSave: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    borderWidth: 1, borderColor: C.GREEN, borderRadius: 10,
    paddingVertical: 14, marginTop: 8, backgroundColor: '#1A3A1A', width: '100%',
  },
  btnSaveTxt: { color: C.GREEN, ...FONTS.sub, fontSize: 14 },

  btnBatal: { borderWidth: 1, borderColor: C.BORDER, borderRadius: 10, paddingVertical: 12, paddingHorizontal: 20, marginTop: 16 },
  btnBatalTxt: { color: C.MUTED, ...FONTS.sub, textAlign: 'center' },
  btnBatalBottom: { borderRadius: 10, paddingVertical: 12, alignItems: 'center', marginTop: 8, backgroundColor: C.RED },
  btnGuide: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    marginTop: 12, paddingVertical: 8,
  },
  btnGuideTxt: { ...FONTS.small, color: C.YELLOW },
  guideBox: {
    backgroundColor: C.CARD, borderRadius: 12, padding: 14,
    borderWidth: 1, borderColor: C.YELLOW, marginTop: 8,
  },
  guideTitle: { ...FONTS.sub, color: C.YELLOW, marginBottom: 10 },
  guideRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 8 },
  guideDot: {
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: C.YELLOW, alignItems: 'center', justifyContent: 'center',
  },
  guideDotTxt: { color: '#000', fontSize: 11, fontWeight: 'bold' },
  guideTxt: { ...FONTS.small, color: C.TEXT, flex: 1, lineHeight: 18 },
  guideNote: {
    flexDirection: 'row', gap: 8, alignItems: 'flex-start',
    marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: C.BORDER,
  },
  guideNoteTxt: { ...FONTS.small, color: C.MUTED, flex: 1, lineHeight: 16 },

  // Metode koneksi
  metodeRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  metodeRow3: { flexDirection: 'row', gap: 6, marginBottom: 12 },
  metodeBtn: {
    flex: 1, paddingVertical: 12, borderRadius: 12,
    borderWidth: 1, borderColor: C.BORDER, backgroundColor: C.BTN,
    alignItems: 'center', gap: 4,
  },
  metodeBtnActiveA: { borderColor: C.GREEN, backgroundColor: '#0A2A0A' },
  metodeBtnActiveB: { borderColor: C.YELLOW, backgroundColor: '#2A2A00' },
  metodeBtnActiveC: { borderColor: C.ACCENT2, backgroundColor: '#0A0A2A' },
  metodeBtnTxt: { ...FONTS.sub, fontSize: 12 },
  metodeBtnSub: { ...FONTS.small, color: C.MUTED, textAlign: 'center', lineHeight: 14, fontSize: 8 },

  atpv2Info: {
    flexDirection: 'row', gap: 8, alignItems: 'flex-start',
    backgroundColor: '#0A1A0A', borderRadius: 10, padding: 10, marginBottom: 12,
    borderWidth: 1, borderColor: C.GREEN,
  },
  atpv2InfoTxt: { ...FONTS.small, color: C.GREEN, flex: 1, lineHeight: 16 },

  // ATPv2 pairing
  atpv2PairBox: { alignItems: 'center', paddingVertical: 16, gap: 12 },
  atpv2PairTitle: { ...FONTS.sub, color: C.GREEN, fontSize: 18, marginTop: 8 },
  codeDisplay: {
    backgroundColor: '#000', borderRadius: 12, paddingHorizontal: 24, paddingVertical: 12,
    borderWidth: 2, borderColor: C.GREEN,
  },
  codeTxt: { color: C.GREEN, fontFamily: 'monospace', fontSize: 32, fontWeight: 'bold', letterSpacing: 8 },
  atpv2PairHint: { ...FONTS.small, color: C.MUTED, textAlign: 'center', lineHeight: 18, marginBottom: 8 },

  // Discovery
  discBox: { backgroundColor: C.CARD, borderRadius: 12, padding: 10, marginBottom: 12, borderWidth: 1, borderColor: C.GREEN },
  discHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  discTitle: { ...FONTS.sub, color: C.GREEN, fontSize: 13, flex: 1 },
  discDot: { width: 8, height: 8, borderRadius: 4 },
  discRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingVertical: 10, paddingHorizontal: 8, marginBottom: 4,
    borderWidth: 1, borderColor: C.BORDER, borderRadius: 8, backgroundColor: C.BTN,
  },
  discIp: { ...FONTS.sub, color: C.TEXT, fontSize: 13, fontFamily: 'monospace' },
  discName: { ...FONTS.small, color: C.MUTED, flex: 1, fontSize: 11 },
  discSrc: { ...FONTS.small, color: C.YELLOW, fontSize: 9, paddingHorizontal: 4 },
  discEmpty: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8, padding: 10 },
  discEmptyTxt: { ...FONTS.small, color: C.MUTED, flex: 1 },
  labelAtau: { ...FONTS.small, color: C.MUTED, textAlign: 'center', marginVertical: 8, fontSize: 12 },
  btnScan: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    borderWidth: 1, borderColor: C.YELLOW, borderRadius: 8, paddingVertical: 10, marginBottom: 4,
    backgroundColor: '#2A2A00',
  },
  btnScanTxt: { ...FONTS.sub, color: C.YELLOW, fontSize: 13 },
  scanBox: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8, padding: 10 },
  scanTxt: { ...FONTS.small, color: C.YELLOW, flex: 1 },
});
