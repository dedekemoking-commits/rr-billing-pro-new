/**
 * Modal Pairing ADB untuk Android TV 11+
 *
 * Mode otomatis menggunakan native module (TLS + SPAKE2-X25519)
 * untuk pairing via Wireless Debugging.
 * Mode manual via Termux sebagai fallback.
 */
import React, { useState, useEffect } from 'react';
import {
  Modal, View, Text, TextInput, TouchableOpacity,
  StyleSheet, ScrollView, ActivityIndicator, Alert, useWindowDimensions,
} from 'react-native';
import { MaterialCommunityIcons as Icon } from '@expo/vector-icons';
import { C, FONTS } from '../utils/theme';
import { ADBHelper } from '../utils/adbHelper';

async function performADBPairing(ip, pairPort, pin) {
  if (!/^\d{6}$/.test(pin.trim())) {
    return { sukses: false, pesan: 'PIN harus 6 digit angka (dari TV)' };
  }

  // 1. Coba native pairing protocol (TLS + SPAKE2)
  const pairResult = await ADBHelper.pairDevice(ip, parseInt(pairPort), pin.trim());
  if (pairResult.sukses) {
    // Pairing berhasil — TV sudah simpan public key kita
    // Tunggu sebentar lalu connect ke port ADB (5555)
    await new Promise(r => setTimeout(r, 1500));
    const c = await ADBHelper.connect(ip, 5555);
    if (c.sukses) return { sukses: true, port: 5555, pesan: `✅ Pairing & koneksi berhasil ke ${ip}:5555` };
    return { sukses: true, port: parseInt(pairPort), pesan: `✅ Pairing berhasil, tapi koneksi ADB belum siap. Coba "Hubungkan" manual.` };
  }

  // 2. Fallback: cek apakah port ADB sudah terbuka
  const c1 = await ADBHelper.connect(ip, 5555);
  if (c1.sukses) return { sukses: true, port: 5555, pesan: `✅ Terhubung ke ${ip}:5555` };

  // 3. Coba connect ke dynamic port
  const c2 = await ADBHelper.connect(ip, parseInt(pairPort));
  if (c2.sukses) return { sukses: true, port: parseInt(pairPort), pesan: `✅ Terhubung ke ${ip}:${pairPort}` };

  return {
    sukses: false,
    pesan: pairResult.pesan
      ? `⚠ ${pairResult.pesan}\n\nSilakan pairing manual:\n1. Buka Termux\n2. Ketik: adb pair ${ip}:${pairPort}\n3. Masukkan PIN: ${pin}\n4. Setelah sukses, ketik: adb connect ${ip}\n5. Kembali ke app & tambah TV`
      : `⚠ Auto-connect gagal.\n\nSilakan pairing manual:\n1. Buka Termux\n2. Ketik: adb pair ${ip}:${pairPort}\n3. Masukkan PIN: ${pin}\n4. Setelah sukses, ketik: adb connect ${ip}\n5. Kembali ke app & tambah TV`,
  };
}

export default function ModalPairing({ visible, ipAwal = '', portAwal = '', onClose, onSuccess }) {
  const { height: screenH, width: screenW } = useWindowDimensions();
  const isLandscape = screenW > screenH;
  const [ip,       setIp]       = useState(ipAwal);
  const [pairPort, setPairPort] = useState(portAwal);
  const [pin,      setPin]      = useState('');
  const [status,   setStatus]   = useState('idle');
  const [statusMsg,setStatusMsg]= useState('');
  const [metode,   setMetode]   = useState('auto');

  useEffect(() => { if (visible) { setStatus('idle'); setStatusMsg(''); setPairPort(portAwal); } }, [visible]);

  const handlePair = async () => {
    const p = parseInt(pairPort);
    if (!ip.trim() || isNaN(p) || pin.trim().length !== 6) {
      setStatus('fail');
      setStatusMsg('⚠ Isi semua field (IP, Port Pairing, PIN)');
      return;
    }

    if (metode === 'termux') {
      Alert.alert('Perintah Termux', `Jalankan di Termux:\n\nadb pair ${ip.trim()}:${p}\n(ketik PIN: ${pin.trim()})\n\nLalu:\nadb connect ${ip.trim()}\n\nSetelah berhasil, tap "Selesai"`, [
        { text: 'Selesai', onPress: async () => {
          setStatus('pairing');
          setStatusMsg(`⏳ Mencoba koneksi ke ${ip.trim()}...`);
          // Coba connect setelah user selesai pairing via Termux
          const r1 = await ADBHelper.connect(ip.trim(), 5555);
          if (r1.sukses) {
            setStatus('ok');
            setStatusMsg(`✅ ${ip.trim()}:5555`);
            setTimeout(() => onSuccess(ip.trim(), 5555), 800);
            return;
          }
          const r2 = await ADBHelper.connect(ip.trim(), p);
          if (r2.sukses) {
            setStatus('ok');
            setStatusMsg(`✅ ${ip.trim()}:${p}`);
            setTimeout(() => onSuccess(ip.trim(), p), 800);
            return;
          }
          setStatus('fail');
          setStatusMsg(`❌ Gagal connect.\n\nCoba metode ADB standar:\n1. Di Termux TV: adb tcpip 5555\n2. Di Termux HP: adb connect ${ip.trim()}\n3. Kembali & tambah TV manual`);
        }},
        { text: 'Batal', style: 'cancel' },
      ]);
      return;
    }

    setStatus('pairing');
    setStatusMsg(`⏳ Mencoba koneksi ke ${ip}:${p}...`);

    const result = await performADBPairing(ip.trim(), p, pin.trim());

    if (result.sukses) {
      setStatus('ok');
      setStatusMsg(`✅ ${ip.trim()}:${result.port}`);
      setTimeout(() => {
        onSuccess(ip.trim(), result.port, pin.trim());
        reset();
      }, 800);
    } else {
      setStatus('fail');
      setStatusMsg(result.pesan);
    }
  };

  const reset = () => {
    setIp(''); setPairPort(''); setPin('');
    setStatus('idle'); setStatusMsg('');
  };

  const handleClose = () => { reset(); onClose(); };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={s.overlay}>
        <View style={[s.container, { maxHeight: isLandscape ? '78%' : '94%' }]}>
          <ScrollView keyboardShouldPersistTaps="handled">
            {/* Header */}
            <View style={s.hdr}>
              <Icon name="access-point" size={22} color={C.ACCENT} />
              <Text style={s.title}>Pairing ADB Wi-Fi</Text>
              <TouchableOpacity onPress={handleClose}>
                <Icon name="close" size={22} color={C.MUTED} />
              </TouchableOpacity>
            </View>

            <Text style={s.subTitle}>Untuk Android TV 11+ (Wireless Debugging)</Text>

            {/* Panduan */}
            <View style={s.guideBox}>
              <Text style={s.guideTitle}>📋 Langkah di TV:</Text>
              {[
                'Buka Pengaturan → Opsi Developer',
                'Aktifkan "Wireless Debugging"',
                'Tap "Pair device with pairing code"',
                'Catat IP, Port (contoh: 42135), & PIN 6 digit',
              ].map((step, i) => (
                <View key={i} style={s.guideRow}>
                  <View style={s.guideDot}><Text style={s.guideDotTxt}>{i + 1}</Text></View>
                  <Text style={s.guideTxt}>{step}</Text>
                </View>
              ))}
            </View>

            {/* Pilih mode */}
            <View style={s.modeRow}>
              <TouchableOpacity
                style={[s.modeBtn, metode === 'auto' && s.modeBtnActive]}
                onPress={() => setMetode('auto')}
              >
                <Text style={[s.modeBtnTxt, metode === 'auto' && s.modeBtnTxtActive]}>Otomatis</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.modeBtn, metode === 'termux' && s.modeBtnActive]}
                onPress={() => setMetode('termux')}
              >
                <Text style={[s.modeBtnTxt, metode === 'termux' && s.modeBtnTxtActive]}>Manual via Termux</Text>
              </TouchableOpacity>
            </View>

            {metode === 'auto' && (
              <>
                {/* Form */}
                <Text style={s.fieldLabel}>IP Address TV</Text>
                <TextInput
                  style={s.input}
                  placeholder="192.168.1.xxx"
                  placeholderTextColor={C.MUTED}
                  value={ip} onChangeText={setIp}
                  keyboardType="numeric"
                />

                <Text style={s.fieldLabel}>Port Pairing (dari TV)</Text>
                <TextInput
                  style={s.input}
                  placeholder="contoh: 42135"
                  placeholderTextColor={C.MUTED}
                  value={pairPort} onChangeText={setPairPort}
                  keyboardType="numeric"
                />

                <Text style={s.fieldLabel}>PIN (6 digit)</Text>
                <TextInput
                  style={s.input}
                  placeholder="xxxxxx"
                  placeholderTextColor={C.MUTED}
                  value={pin} onChangeText={setPin}
                  keyboardType="numeric"
                  maxLength={6}
                />
              </>
            )}

            {metode === 'termux' && (
              <View style={s.termuxBox}>
                <Icon name="console" size={20} color={C.GREEN} />
                <Text style={s.termuxTitle}>Termux Command</Text>
                <View style={s.cmdBox}>
                  <Text style={s.cmdTxt}>adb pair {ip || 'IP_TV'}:{pairPort || 'PORT'}</Text>
                </View>
                <View style={s.cmdBox}>
                  <Text style={s.cmdTxt}>adb connect {ip || 'IP_TV'}</Text>
                </View>
                <Text style={s.termuxHint}>
                  Install Termux dari F-Droid, lalu jalankan 2 perintah di atas.
                  PIN akan diminta saat adb pair.
                </Text>
              </View>
            )}

            {/* Status */}
            {statusMsg ? (
              <View style={[s.statusBox, {
                borderColor: status === 'ok' ? C.GREEN : status === 'fail' ? C.RED : C.YELLOW,
              }]}>
                <Text style={[s.statusTxt, {
                  color: status === 'ok' ? C.GREEN : status === 'fail' ? C.RED : C.YELLOW,
                }]}>
                  {statusMsg.length > 100 ? statusMsg.substring(0, 100) + '...' : statusMsg}
                </Text>
                {statusMsg.length > 100 && (
                  <TouchableOpacity onPress={() => Alert.alert('Detail', statusMsg)}>
                    <Text style={{ color: C.ACCENT2, ...FONTS.small, textAlign: 'center', marginTop: 4 }}>Baca selengkapnya</Text>
                  </TouchableOpacity>
                )}
              </View>
            ) : null}

            {/* Pair Button */}
            <TouchableOpacity
              style={[s.btnPair, status === 'pairing' && { opacity: 0.6 }]}
              onPress={handlePair}
              disabled={status === 'pairing'}
            >
              {status === 'pairing'
                ? <ActivityIndicator color={C.GREEN} />
                : <>
                    <Icon name={metode === 'termux' ? 'console-line' : 'key-chain'} size={18} color={C.GREEN} />
                    <Text style={s.btnPairTxt}>
                      {metode === 'termux' ? 'Saya sudah pairing — Cek koneksi' : 'Coba Pairing'}
                    </Text>
                  </>
              }
            </TouchableOpacity>

            {/* Note */}
            <View style={s.noteBox}>
              <Icon name="information-outline" size={14} color={C.MUTED} />
              <Text style={s.noteTxt}>
                {metode === 'auto'
                  ? 'Kode PIN hanya berlaku beberapa menit. Jika gagal, coba mode "Manual via Termux".'
                  : 'Setelah pairing berhasil, koneksi berikutnya cukup lewat "Scan" atau "Tambah TV".'}
              </Text>
            </View>

            <TouchableOpacity style={s.btnTutup} onPress={handleClose}>
              <Text style={s.btnTutupTxt}>✖ Tutup</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.8)',
    justifyContent: 'flex-end',
  },
  container: {
    backgroundColor: C.PANEL, borderTopLeftRadius: 22, borderTopRightRadius: 22,
    padding: 20,
  },
  hdr: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    justifyContent: 'space-between', marginBottom: 4,
  },
  title:    { ...FONTS.title, color: C.ACCENT, flex: 1, fontSize: 16 },
  subTitle: { ...FONTS.small, color: C.MUTED, marginBottom: 14 },
  guideBox: {
    backgroundColor: C.CARD, borderRadius: 12, padding: 14,
    borderWidth: 1, borderColor: C.ACCENT2, marginBottom: 16,
  },
  guideTitle: { ...FONTS.sub, color: C.ACCENT2, marginBottom: 10 },
  guideRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 8 },
  guideDot: {
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: C.ACCENT2, alignItems: 'center', justifyContent: 'center',
  },
  guideDotTxt: { color: 'white', fontSize: 11, fontWeight: 'bold' },
  guideTxt: { ...FONTS.small, color: C.TEXT, flex: 1, lineHeight: 18 },
  fieldLabel: { ...FONTS.label, color: C.MUTED, marginBottom: 6 },
  input: {
    backgroundColor: C.BTN, borderRadius: 10, borderWidth: 1, borderColor: C.BORDER,
    color: C.ACCENT, ...FONTS.body, paddingHorizontal: 12, paddingVertical: 10,
    marginBottom: 12, fontSize: 15,
  },
  statusBox: {
    borderWidth: 1, borderRadius: 10, padding: 12, marginVertical: 8,
  },
  statusTxt: { ...FONTS.small, lineHeight: 20, textAlign: 'center' },
  btnPair: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    borderWidth: 1, borderColor: C.GREEN, borderRadius: 12,
    paddingVertical: 14, marginVertical: 8, backgroundColor: '#1A3A1A',
  },
  btnPairTxt: { color: C.GREEN, ...FONTS.sub, fontSize: 14 },
  noteBox: {
    flexDirection: 'row', gap: 8, alignItems: 'flex-start',
    backgroundColor: C.CARD, borderRadius: 10, padding: 12, marginVertical: 8,
  },
  noteTxt: { ...FONTS.small, color: C.MUTED, flex: 1, lineHeight: 18 },
  btnTutup: {
    borderRadius: 12, paddingVertical: 12, alignItems: 'center',
    backgroundColor: C.RED, marginTop: 4, marginBottom: 20,
  },
  btnTutupTxt: { color: 'white', ...FONTS.sub },
  modeRow: {
    flexDirection: 'row', gap: 8, marginBottom: 14,
  },
  modeBtn: {
    flex: 1, paddingVertical: 10, borderRadius: 10,
    alignItems: 'center', borderWidth: 1, borderColor: C.BORDER,
    backgroundColor: C.BTN,
  },
  modeBtnActive: { borderColor: C.ACCENT, backgroundColor: '#1A1040' },
  modeBtnTxt: { ...FONTS.small, color: C.MUTED },
  modeBtnTxtActive: { color: C.ACCENT, fontWeight: 'bold' },
  termuxBox: {
    backgroundColor: '#0A1A0A', borderRadius: 12, padding: 14,
    borderWidth: 1, borderColor: C.GREEN, marginBottom: 14,
  },
  termuxTitle: { ...FONTS.sub, color: C.GREEN, marginTop: 6, marginBottom: 10 },
  cmdBox: {
    backgroundColor: '#000', borderRadius: 8, padding: 10,
    marginBottom: 8,
  },
  cmdTxt: { color: C.GREEN, ...FONTS.code, fontSize: 13 },
  termuxHint: { ...FONTS.small, color: C.MUTED, marginTop: 4, lineHeight: 18 },
});
