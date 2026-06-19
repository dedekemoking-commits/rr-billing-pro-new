import React, { useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  StyleSheet, Alert, Linking,
} from 'react-native';
import { MaterialCommunityIcons as Icon } from '@expo/vector-icons';
import * as Crypto from 'expo-crypto';
import { C, FONTS } from '../utils/theme';
import { useStore } from '../store/useStore';
import { aktivasiLisensi, setConfig, getConfig } from '../utils/storage';

export default function ProfilScreen({ navigation }) {
  const currentUser   = useStore(s => s.currentUser);
  const currentRole   = useStore(s => s.currentRole);
  const licenseStatus = useStore(s => s.licenseStatus);
  const loadLicense   = useStore(s => s.loadLicense);
  const logout        = useStore(s => s.logout);

  const [kode,      setKode]    = useState('');
  const [aktMsg,    setAktMsg]  = useState('');
  const [aktOk,     setAktOk]   = useState(false);
  const [newPass,   setNewPass] = useState('');
  const [showWA,    setShowWA]  = useState(false);

  const doAktivasi = async () => {
    if (!kode.trim()) { setAktMsg('⚠ Masukkan kode aktivasi'); return; }
    const result = await aktivasiLisensi(kode.trim());
    setAktMsg(result.pesan);
    setAktOk(result.sukses);
    if (result.sukses) {
      await loadLicense();
      Alert.alert('🎉 Aktivasi Berhasil', result.pesan);
    }
  };

  const doGantiPass = async () => {
    if (newPass.length < 6) {
      Alert.alert('⚠ Terlalu Pendek', 'Password minimal 6 karakter.'); return;
    }
    const hash  = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, newPass);
    const users = await getConfig('users', null);
    const defaultHash = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, 'admin123');
    const kasirHash   = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, 'kasir123');
    const allUsers = users || {
      admin: { passwordHash: defaultHash, role: 'admin' },
      kasir: { passwordHash: kasirHash,   role: 'kasir' },
    };
    allUsers[currentUser] = { ...allUsers[currentUser], passwordHash: hash };
    await setConfig('users', allUsers);
    setNewPass('');
    Alert.alert('✅ Berhasil', 'Password berhasil diubah!');
  };

  const doLogout = () => {
    Alert.alert('Keluar', 'Yakin ingin keluar / ganti akun?', [
      { text: 'Batal', style: 'cancel' },
      { text: 'Keluar', style: 'destructive', onPress: () => {
        logout();
        navigation.replace('Login');
      }},
    ]);
  };

  const licColor = licenseStatus?.status === 'active' ? C.GREEN
    : licenseStatus?.status === 'trial' ? C.YELLOW : C.RED;

  const openWA = (paket) => {
    const msg = encodeURIComponent(
      `Halo Admin RR Billing Pro 👋\n\nSaya ingin berlangganan:\n📦 Paket: ${paket}\n\nMohon info pembayaran. Terima kasih!`
    );
    Linking.openURL(`https://wa.me/6281270647744?text=${msg}`);
  };

  return (
    <View style={s.root}>
      <View style={s.hdr}>
        <Text style={s.hdrTitle}>👤 PROFIL & AKTIVASI</Text>
        <TouchableOpacity style={s.btnLogout} onPress={doLogout}>
          <Icon name="logout" size={16} color={C.RED} />
          <Text style={s.btnLogoutTxt}>Keluar</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={s.scroll}>
        {/* Profil Card */}
        <View style={s.profileCard}>
          <View style={s.avatarCircle}>
            <Icon name="gamepad-variant" size={36} color={C.ACCENT} />
          </View>
          <Text style={s.appName}>RR BILLING PRO</Text>
          <Text style={s.appSub}>Sistem Billing Rental PlayStation & TV</Text>
          <View style={s.divider} />
          {[
            ['Versi',      'v2.0.0'],
            ['Developer',  'RR CCTV'],
            ['Kontak',     '0812-7064-7744'],
            ['User Aktif', `${currentUser} [${currentRole}]`],
            ['Lisensi',    licenseStatus?.pesan || '—'],
          ].map(([label, val]) => (
            <View key={label} style={s.infoRow}>
              <Text style={s.infoLabel}>{label}</Text>
              <Text style={[s.infoVal, label === 'Lisensi' && { color: licColor }]}>{val}</Text>
            </View>
          ))}
          <Text style={s.copy}>© 2026 RR CCTV — All Rights Reserved</Text>
        </View>

        {/* Aktivasi Card */}
        <View style={s.card}>
          <Text style={s.cardTitle}>🔑 AKTIVASI LISENSI</Text>
          <View style={[s.licBadge, { borderColor: licColor }]}>
            <Text style={[s.licBadgeTxt, { color: licColor }]}>
              {licenseStatus?.status === 'active' ? '✅' : licenseStatus?.status === 'trial' ? '🕐' : '⛔'}{' '}
              {licenseStatus?.pesan}
            </Text>
          </View>
          <Text style={s.fieldLabel}>Kode Aktivasi (format: RR-XXXX-XXXX-XXXX)</Text>
          <TextInput
            style={s.input}
            placeholder="RR-XXXX-XXXX-XXXX"
            placeholderTextColor={C.MUTED}
            value={kode} onChangeText={setKode}
            autoCapitalize="characters"
          />
          {aktMsg ? (
            <Text style={[s.aktMsg, { color: aktOk ? C.GREEN : C.RED }]}>{aktMsg}</Text>
          ) : null}
          <TouchableOpacity style={s.btnAkt} onPress={doAktivasi}>
            <Icon name="key" size={16} color="white" />
            <Text style={s.btnAktTxt}>🔓 Aktifkan Lisensi</Text>
          </TouchableOpacity>
        </View>

        {/* Paket Berlangganan */}
        <View style={s.card}>
          <Text style={s.cardTitle}>💰 PAKET BERLANGGANAN</Text>
          {[
            { nama: 'Bulanan',  harga: 'Rp 99.000 / bulan',  desc: 'Semua fitur, 1 lokasi',  color: C.ACCENT,  ico: '💎' },
            { nama: '3 Bulan', harga: 'Rp 249.000',          desc: 'Hemat 16% vs bulanan',   color: C.GREEN,   ico: '🚀' },
            { nama: 'Tahunan', harga: 'Rp 799.000 / tahun',  desc: 'Hemat 33% — Terbaik!',  color: C.YELLOW,  ico: '👑' },
          ].map(p => (
            <View key={p.nama} style={[s.paketCard, { borderColor: p.color }]}>
              <Text style={s.paketIco}>{p.ico}</Text>
              <View style={{ flex: 1 }}>
                <Text style={[s.paketNama, { color: p.color }]}>{p.nama}</Text>
                <Text style={s.paketHarga}>{p.harga}</Text>
                <Text style={s.paketDesc}>{p.desc}</Text>
              </View>
              <TouchableOpacity
                style={[s.btnBayar, { backgroundColor: p.color }]}
                onPress={() => openWA(`${p.nama} (${p.harga})`)}
              >
                <Text style={s.btnBayarTxt}>Bayar</Text>
              </TouchableOpacity>
            </View>
          ))}
          <TouchableOpacity style={s.btnWA} onPress={() => Linking.openURL('https://wa.me/6281270647744')}>
            <Icon name="whatsapp" size={18} color={C.GREEN} />
            <Text style={s.btnWATxt}>Hubungi Admin via WhatsApp</Text>
          </TouchableOpacity>
        </View>

        {/* Ganti Password */}
        {currentRole === 'admin' && (
          <View style={s.card}>
            <Text style={s.cardTitle}>🔒 GANTI PASSWORD SAYA</Text>
            <TextInput
              style={s.input}
              placeholder="Password baru (min 6 karakter)"
              placeholderTextColor={C.MUTED}
              value={newPass} onChangeText={setNewPass}
              secureTextEntry
            />
            <TouchableOpacity style={s.btnSavePass} onPress={doGantiPass}>
              <Text style={s.btnSavePassTxt}>💾 Simpan Password Baru</Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={{ height: 30 }} />
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.BG },
  hdr: {
    backgroundColor: C.PANEL,
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14,
  },
  hdrTitle: { ...FONTS.title, color: C.ACCENT, fontSize: 15 },
  btnLogout: {
    flexDirection: 'row', gap: 4, alignItems: 'center',
    borderWidth: 1, borderColor: C.RED, borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 6,
  },
  btnLogoutTxt: { color: C.RED, ...FONTS.small },
  scroll: { padding: 12, gap: 12 },
  profileCard: {
    backgroundColor: C.PANEL, borderRadius: 14, borderWidth: 1, borderColor: C.BORDER,
    padding: 20, alignItems: 'center',
  },
  avatarCircle: {
    width: 72, height: 72, borderRadius: 20,
    backgroundColor: C.ACCENT2, alignItems: 'center', justifyContent: 'center',
    marginBottom: 12,
  },
  appName: { ...FONTS.title, color: C.ACCENT, fontSize: 18 },
  appSub:  { ...FONTS.small, color: C.MUTED, marginTop: 4 },
  divider: { height: 1, backgroundColor: C.BORDER, alignSelf: 'stretch', marginVertical: 16 },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', alignSelf: 'stretch', marginBottom: 8 },
  infoLabel: { ...FONTS.label, color: C.MUTED },
  infoVal:   { ...FONTS.label, color: C.TEXT },
  copy: { ...FONTS.small, color: C.MUTED, marginTop: 12 },
  card: {
    backgroundColor: C.PANEL, borderRadius: 14,
    borderWidth: 1, borderColor: C.BORDER, padding: 16,
  },
  cardTitle: { ...FONTS.sub, color: C.ACCENT2, marginBottom: 12 },
  licBadge: {
    borderWidth: 1, borderRadius: 10, padding: 10,
    alignItems: 'center', marginBottom: 12,
  },
  licBadgeTxt: { ...FONTS.sub, fontSize: 13 },
  fieldLabel: { ...FONTS.label, color: C.MUTED, marginBottom: 6 },
  input: {
    backgroundColor: C.BTN, borderRadius: 10, borderWidth: 1, borderColor: C.BORDER,
    color: C.ACCENT, ...FONTS.body, paddingHorizontal: 12, paddingVertical: 10,
    marginBottom: 10, fontSize: 14,
  },
  aktMsg: { ...FONTS.small, textAlign: 'center', marginBottom: 8 },
  btnAkt: {
    flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center',
    backgroundColor: C.ACCENT2, borderRadius: 10, paddingVertical: 12,
  },
  btnAktTxt: { color: 'white', ...FONTS.sub },
  paketCard: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderWidth: 1, borderRadius: 10, padding: 12, marginBottom: 8,
    backgroundColor: C.CARD,
  },
  paketIco:  { fontSize: 24 },
  paketNama: { ...FONTS.sub, fontSize: 13 },
  paketHarga:{ ...FONTS.label, color: C.TEXT },
  paketDesc: { ...FONTS.small, color: C.MUTED },
  btnBayar: {
    borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8,
    alignItems: 'center',
  },
  btnBayarTxt: { color: C.BG, ...FONTS.small, fontWeight: 'bold' },
  btnWA: {
    flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: C.GREEN, borderRadius: 10, paddingVertical: 12,
    marginTop: 8, backgroundColor: '#1A3A1A',
  },
  btnWATxt: { color: C.GREEN, ...FONTS.sub },
  btnSavePass: {
    backgroundColor: C.ACCENT2, borderRadius: 10,
    paddingVertical: 12, alignItems: 'center',
  },
  btnSavePassTxt: { color: 'white', ...FONTS.sub },
});
