import React, { useState } from 'react';
import {
  Modal, View, Text, TextInput, TouchableOpacity,
  StyleSheet, ScrollView, ActivityIndicator, Alert,
} from 'react-native';
import { MaterialCommunityIcons as Icon } from '@expo/vector-icons';
import { C, FONTS } from '../utils/theme';
import { ADBHelper } from '../utils/adbHelper';
import ModalPairing from './ModalPairing';

export default function ModalTambahTV({ visible, onClose, onConfirm, nomorTV }) {
  const [nama,     setNama]     = useState('');
  const [ip,       setIp]       = useState('');
  const [port,     setPort]     = useState('5555');
  const [mode,     setMode]     = useState('android11'); // android11 | android10
  const [status,   setStatus]   = useState('idle');     // idle | testing | ok | fail
  const [statusMsg,setStatusMsg]= useState('');
  const [showPair, setShowPair] = useState(false);

  const resetForm = () => {
    setNama(''); setIp(''); setPort('5555');
    setMode('android11'); setStatus('idle'); setStatusMsg('');
  };

  const handleClose = () => { resetForm(); onClose(); };

  const tesKoneksi = async () => {
    const p = parseInt(port);
    if (!ip.trim() || isNaN(p) || p < 1 || p > 65535) {
      setStatus('fail'); setStatusMsg('⚠ IP & Port harus diisi dengan benar'); return;
    }
    setStatus('testing'); setStatusMsg(`Menghubungkan ke ${ip}:${p}...`);
    const result = await ADBHelper.connect(ip.trim(), p);
    if (result.sukses) {
      setStatus('ok');
      setStatusMsg(`✅ TERHUBUNG — ${ip}:${p}`);
    } else {
      setStatus('fail');
      setStatusMsg(`✖ ${result.pesan}`);
    }
  };

  const handlePairDone = (pairIp, pairPort) => {
    setIp(pairIp);
    setPort(String(pairPort));
    setStatus('ok');
    setStatusMsg(`✅ PAIRED & TERHUBUNG — ${pairIp}:${pairPort}`);
    setShowPair(false);
  };

  const handleConfirm = async () => {
    if (status !== 'ok') {
      Alert.alert('Tes Koneksi Dulu', 'Pastikan koneksi ADB berhasil sebelum menambahkan TV.');
      return;
    }
    const namaTV = nama.trim() || `KOTA ${nomorTV}`;
    await onConfirm({ nama: namaTV, ip: ip.trim(), port: parseInt(port) });
    resetForm();
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={s.overlay}>
        <View style={s.container}>
          <ScrollView keyboardShouldPersistTaps="handled">
            {/* Header */}
            <View style={s.hdr}>
              <Text style={s.title}>📺 Tambah TV #{nomorTV}</Text>
              <TouchableOpacity onPress={handleClose}>
                <Icon name="close" size={22} color={C.MUTED} />
              </TouchableOpacity>
            </View>

            {/* Mode selector */}
            <Text style={s.sectionLabel}>Versi Android TV</Text>
            <View style={s.modeRow}>
              {[
                { k: 'android11', label: 'Android TV 11+\n(Pairing)' },
                { k: 'android10', label: 'Android TV 10↓\n(Langsung)' },
              ].map(m => (
                <TouchableOpacity
                  key={m.k}
                  style={[s.modeBtn, mode === m.k && s.modeBtnActive]}
                  onPress={() => setMode(m.k)}
                >
                  <Text style={[s.modeBtnTxt, mode === m.k && { color: 'white' }]}>
                    {m.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Info mode */}
            <View style={s.infoBox}>
              {mode === 'android11' ? (
                <Text style={s.infoTxt}>
                  🔐 Perlu PAIRING dulu (sekali saja).{'\n'}
                  Di TV: Pengaturan → Opsi Developer → Wireless Debugging → "Pair device with pairing code"{'\n'}
                  Tap tombol Pairing di bawah, atau langsung Tes jika sudah pernah paired.
                </Text>
              ) : (
                <Text style={[s.infoTxt, { color: C.GREEN }]}>
                  🔌 Langsung TANPA pairing.{'\n'}
                  Di TV: Pengaturan → Opsi Developer → aktifkan "ADB Debugging / Network Debugging"{'\n'}
                  Port default: 5555
                </Text>
              )}
            </View>

            {/* Nama TV */}
            <Text style={s.fieldLabel}>Nama Kota / Label TV</Text>
            <TextInput
              style={s.input}
              placeholder={`KOTA ${nomorTV}`}
              placeholderTextColor={C.MUTED}
              value={nama} onChangeText={setNama}
            />

            {/* IP & Port */}
            <Text style={s.fieldLabel}>IP Address & Port ADB</Text>
            <View style={s.ipRow}>
              <TextInput
                style={[s.input, { flex: 1 }]}
                placeholder="192.168.1.xxx"
                placeholderTextColor={C.MUTED}
                value={ip} onChangeText={setIp}
                keyboardType="numeric"
              />
              <Text style={s.colon}>:</Text>
              <TextInput
                style={[s.input, { width: 80 }]}
                placeholder="5555"
                placeholderTextColor={C.MUTED}
                value={port} onChangeText={setPort}
                keyboardType="numeric"
              />
            </View>

            {/* Status */}
            {statusMsg ? (
              <Text style={[s.statusTxt, {
                color: status === 'ok' ? C.GREEN : status === 'fail' ? C.RED : C.YELLOW,
              }]}>
                {statusMsg}
              </Text>
            ) : null}

            {/* Buttons */}
            <TouchableOpacity
              style={[s.btnTes, status === 'testing' && { opacity: 0.6 }]}
              onPress={tesKoneksi}
              disabled={status === 'testing'}
            >
              {status === 'testing'
                ? <ActivityIndicator color={C.GREEN} />
                : <Text style={s.btnTesTxt}>🔗 Tes Koneksi ADB</Text>
              }
            </TouchableOpacity>

            {mode === 'android11' && (
              <TouchableOpacity
                style={s.btnPairing}
                onPress={() => setShowPair(true)}
              >
                <Icon name="access-point" size={16} color={C.ACCENT} />
                <Text style={s.btnPairingTxt}>📡 Buka Dialog Pairing (Android TV 11+)</Text>
              </TouchableOpacity>
            )}

            {/* Confirm / Cancel */}
            <View style={s.botRow}>
              <TouchableOpacity style={s.btnBatal} onPress={handleClose}>
                <Text style={s.btnBatalTxt}>✖ Batal</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.btnKonfirm, status !== 'ok' && { opacity: 0.4 }]}
                onPress={handleConfirm}
                disabled={status !== 'ok'}
              >
                <Text style={s.btnKonfirmTxt}>✅ Tambahkan TV</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </View>

      {/* Modal Pairing */}
      <ModalPairing
        visible={showPair}
        ipAwal={ip}
        onClose={() => setShowPair(false)}
        onSuccess={handlePairDone}
      />
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  container: {
    backgroundColor: C.PANEL, borderTopLeftRadius: 20, borderTopRightRadius: 20,
    maxHeight: '92%', padding: 20,
  },
  hdr: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  title: { ...FONTS.title, color: C.ACCENT, fontSize: 16 },
  sectionLabel: { ...FONTS.label, color: C.MUTED, marginBottom: 8 },
  modeRow: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  modeBtn: {
    flex: 1, padding: 10, borderRadius: 10,
    borderWidth: 1, borderColor: C.BORDER,
    backgroundColor: C.BTN, alignItems: 'center',
  },
  modeBtnActive: { backgroundColor: C.ACCENT2, borderColor: C.ACCENT2 },
  modeBtnTxt: { ...FONTS.small, color: C.MUTED, textAlign: 'center', lineHeight: 16 },
  infoBox: {
    backgroundColor: C.CARD, borderRadius: 10, padding: 12, marginBottom: 14,
    borderWidth: 1, borderColor: C.BORDER,
  },
  infoTxt: { ...FONTS.small, color: C.ACCENT, lineHeight: 18 },
  fieldLabel: { ...FONTS.label, color: C.MUTED, marginBottom: 6 },
  input: {
    backgroundColor: C.BTN, borderRadius: 10, borderWidth: 1, borderColor: C.BORDER,
    color: C.ACCENT, ...FONTS.body, paddingHorizontal: 12, paddingVertical: 10,
    marginBottom: 12, fontSize: 14,
  },
  ipRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  colon: { color: C.MUTED, fontSize: 18 },
  statusTxt: { ...FONTS.small, textAlign: 'center', marginVertical: 8 },
  btnTes: {
    borderWidth: 1, borderColor: C.GREEN, borderRadius: 10,
    paddingVertical: 12, alignItems: 'center', marginVertical: 6,
    backgroundColor: '#1A3A1A',
  },
  btnTesTxt: { color: C.GREEN, ...FONTS.sub },
  btnPairing: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderWidth: 1, borderColor: C.ACCENT, borderRadius: 10,
    paddingVertical: 10, paddingHorizontal: 14, marginVertical: 6,
    backgroundColor: C.BTN,
  },
  btnPairingTxt: { color: C.ACCENT, ...FONTS.small },
  botRow: { flexDirection: 'row', gap: 10, marginTop: 10, marginBottom: 20 },
  btnBatal: {
    flex: 1, paddingVertical: 12, borderRadius: 10,
    backgroundColor: C.RED, alignItems: 'center',
  },
  btnBatalTxt: { color: 'white', ...FONTS.sub },
  btnKonfirm: {
    flex: 2, paddingVertical: 12, borderRadius: 10,
    backgroundColor: C.ACCENT2, alignItems: 'center',
  },
  btnKonfirmTxt: { color: 'white', ...FONTS.sub },
});
