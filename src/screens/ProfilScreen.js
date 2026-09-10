import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  StyleSheet, Alert, Linking, Image,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons as Icon } from '@expo/vector-icons';
import * as Crypto from 'expo-crypto';
import * as Clipboard from 'expo-clipboard';
import * as ImagePicker from 'expo-image-picker';
import { C, FONTS } from '../utils/theme';
import { useStore } from '../store/useStore';
import { aktivasiLisensi, setConfig, getConfig, generateLicenseKode } from '../utils/storage';
import { fetchUsers, cachedUsers, saveToGitHub } from '../utils/githubAuth';

export default function ProfilScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const currentUser   = useStore(s => s.currentUser);
  const currentRole   = useStore(s => s.currentRole);
  const licenseStatus = useStore(s => s.licenseStatus);
  const loadLicense   = useStore(s => s.loadLicense);
  const logout        = useStore(s => s.logout);
  const namaRental    = useStore(s => s.namaRental);
  const setNamaRental = useStore(s => s.setNamaRental);
  const bgImagePortrait  = useStore(s => s.bgImagePortrait);
  const setBgImagePortrait = useStore(s => s.setBgImagePortrait);
  const bgImageLandscape = useStore(s => s.bgImageLandscape);
  const setBgImageLandscape = useStore(s => s.setBgImageLandscape);
  const cardOpacity   = useStore(s => s.cardOpacity);
  const setCardOpacity = useStore(s => s.setCardOpacity);

  const [kode,      setKode]    = useState('');
  const [aktMsg,    setAktMsg]  = useState('');
  const [aktOk,     setAktOk]   = useState(false);
  const [newPass,   setNewPass] = useState('');
  const [showWA,    setShowWA]  = useState(false);

  const [regUser,   setRegUser] = useState('');
  const [regPass,   setRegPass] = useState('');
  const [regRole,   setRegRole] = useState('kasir');
  const [regEmail,  setRegEmail] = useState('');
  const [regMsg,    setRegMsg]   = useState('');
  const [regMsgOk,  setRegMsgOk] = useState(false);
  const [usersList, setUsersList] = useState([]);
  const [smtpHost,  setSmtpHost] = useState('');
  const [smtpPort,  setSmtpPort] = useState('587');
  const [smtpUser,  setSmtpUser] = useState('');
  const [smtpPass,  setSmtpPass] = useState('');
  const [smtpMsg,   setSmtpMsg]  = useState('');
  const [smtpOk,    setSmtpOk]   = useState(false);
  const [genUname,  setGenUname] = useState('');
  const [genPaket,  setGenPaket] = useState('BULANAN');
  const [genKode,   setGenKode]  = useState('');
  const [genMsg,    setGenMsg]   = useState('');
  const [editNama,  setEditNama] = useState(namaRental);
  const isSuperAdmin = currentUser === 'rrgaming';

  useEffect(() => {
    loadUsers();
    loadSMTP();
  }, []);

  useEffect(() => {
    setEditNama(namaRental);
  }, [namaRental]);

  const loadUsers = async () => {
    const users = await getConfig('users', {}) || {};
    setUsersList(Object.entries(users).map(([name, data]) => ({ name, role: data.role })));
  };

  const loadSMTP = async () => {
    const cfg = await getConfig('smtp', {});
    if (cfg.host) setSmtpHost(cfg.host);
    if (cfg.port) setSmtpPort(String(cfg.port));
    if (cfg.user) setSmtpUser(cfg.user);
    if (cfg.pass) setSmtpPass(cfg.pass);
  };

  const simpanNamaRental = async () => {
    const nama = editNama.trim();
    if (!nama) {
      Alert.alert('Error', 'Nama rental tidak boleh kosong');
      return;
    }
    await setNamaRental(nama);
    Alert.alert('Tersimpan', `Nama rental diubah menjadi "${nama}"`);
  };

  const pilihBackground = async (orientation) => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: orientation === 'landscape' ? [16, 9] : [9, 16],
      quality: 0.8,
    });
    if (!result.canceled && result.assets?.[0]?.uri) {
      if (orientation === 'landscape') {
        await setBgImageLandscape(result.assets[0].uri);
      } else {
        await setBgImagePortrait(result.assets[0].uri);
      }
      Alert.alert('Tersimpan', `Background ${orientation} berhasil diubah.`);
    }
  };

  const hapusBackground = async () => {
    Alert.alert('Hapus Background', 'Hapus semua background?', [
      { text: 'Batal', style: 'cancel' },
      { text: 'Hapus', style: 'destructive', onPress: async () => {
        await setBgImagePortrait(null);
        await setBgImageLandscape(null);
        Alert.alert('Dihapus', 'Semua background dihapus.');
      }},
    ]);
  };

  const doRegistrasi = async () => {
    if (!regUser.trim() || regPass.length < 4) {
      setRegMsg('Username & password minimal 4 karakter');
      setRegMsgOk(false);
      return;
    }
    const hash = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, regPass);
    const users = await getConfig('users', {});
    if (users[regUser.trim().toLowerCase()]) {
      setRegMsg(`Username "${regUser.trim()}" sudah ada`);
      setRegMsgOk(false);
      return;
    }
    users[regUser.trim().toLowerCase()] = {
      passwordHash: hash, role: regRole, email: regEmail.trim() || '',
      dibuat: new Date().toISOString(),
    };
    await setConfig('users', users);
    setRegMsg(`✅ User "${regUser.trim()}" (${regRole}) berhasil dibuat`);
    setRegMsgOk(true);
    setRegUser(''); setRegPass(''); setRegEmail('');
    loadUsers();
  };

  const simpanSMTP = async () => {
    await setConfig('smtp', {
      host: smtpHost.trim(), port: parseInt(smtpPort) || 587,
      user: smtpUser.trim(), pass: smtpPass,
    });
    setSmtpMsg('✅ Konfigurasi SMTP disimpan');
    setSmtpOk(true);
  };

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

    // Update local config
    const users = await getConfig('users', {});
    const existing = users[currentUser] || {};
    users[currentUser] = { ...existing, passwordHash: hash };
    await setConfig('users', users);

    // Also update GitHub user data so loginUser picks it up
    try {
      const ghUsers = await fetchUsers();
      if (ghUsers && ghUsers[currentUser]) {
        ghUsers[currentUser].passwordHash = hash;
        cachedUsers = ghUsers;
        await saveToGitHub(ghUsers);
      }
    } catch (e) {
      console.warn('[Password] GitHub sync failed:', e.message);
    }

    setNewPass('');
    Alert.alert('✅ Berhasil', 'Password berhasil diubah!');
  };

  const doGenerate = async () => {
    if (!genUname.trim()) { setGenMsg('⚠ Masukkan username'); return; }
    setGenMsg('⏳ Generating...');
    setGenKode('');
    try {
      const kode = await generateLicenseKode(genPaket, genUname.trim());
      setGenKode(kode);
      setGenMsg('');
    } catch (e) {
      setGenMsg('✖ ' + e.message);
    }
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
      <View style={[s.hdr, { paddingTop: insets.top + 8 }]}>
        <Text style={s.hdrTitle}>👤 PROFIL & AKTIVASI</Text>
        <TouchableOpacity style={s.btnLogout} onPress={doLogout}>
          <Icon name="logout" size={16} color={C.RED} />
          <Text style={s.btnLogoutTxt}>Keluar</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={s.scroll}>
        {/* Profil Card */}
        <View style={s.profileCard}>
          <Image
            source={require('../../assets/logo.png')}
            style={s.logoImage}
            resizeMode="contain"
          />
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

        {/* Nama Rental Card */}
        <View style={s.card}>
          <Text style={s.cardTitle}>🏪 NAMA RENTAL</Text>
          <Text style={s.fieldLabel}>Nama yang tampil di dashboard & TV</Text>
          <TextInput
            style={s.input}
            placeholder="Nama Rental Anda"
            placeholderTextColor={C.MUTED}
            value={editNama}
            onChangeText={setEditNama}
          />
          <TouchableOpacity style={s.btnAkt} onPress={simpanNamaRental}>
            <Icon name="content-save" size={16} color="white" />
            <Text style={s.btnAktTxt}>💾 Simpan Nama</Text>
          </TouchableOpacity>
        </View>

        {/* Background Dashboard */}
        <View style={s.card}>
          <Text style={s.cardTitle}>🖼️ BACKGROUND DASHBOARD</Text>

          {/* Portrait */}
          <Text style={s.bgLabel}>📱 Portrait</Text>
          {bgImagePortrait ? (
            <Image source={{ uri: bgImagePortrait }} style={s.bgPreview} resizeMode="cover" />
          ) : (
            <View style={s.bgPlaceholder}>
              <Icon name="image-off" size={24} color={C.MUTED} />
              <Text style={s.bgPlaceholderTxt}>Belum ada gambar</Text>
            </View>
          )}
          <TouchableOpacity style={s.btnBgPick} onPress={() => pilihBackground('portrait')}>
            <Icon name="image" size={16} color="white" />
            <Text style={s.btnBgPickTxt}>{bgImagePortrait ? 'Ganti' : 'Pilih Gambar'}</Text>
          </TouchableOpacity>

          {/* Landscape */}
          <Text style={[s.bgLabel, { marginTop: 14 }]}>📺 Landscape</Text>
          {bgImageLandscape ? (
            <Image source={{ uri: bgImageLandscape }} style={s.bgPreviewLand} resizeMode="cover" />
          ) : (
            <View style={[s.bgPlaceholder, { height: 80 }]}>
              <Icon name="image-off" size={24} color={C.MUTED} />
              <Text style={s.bgPlaceholderTxt}>Belum ada gambar</Text>
            </View>
          )}
          <TouchableOpacity style={s.btnBgPick} onPress={() => pilihBackground('landscape')}>
            <Icon name="image" size={16} color="white" />
            <Text style={s.btnBgPickTxt}>{bgImageLandscape ? 'Ganti' : 'Pilih Gambar'}</Text>
          </TouchableOpacity>

          {(bgImagePortrait || bgImageLandscape) && (
            <TouchableOpacity style={s.btnBgRemove} onPress={hapusBackground}>
              <Icon name="delete" size={16} color="white" />
              <Text style={s.btnBgRemoveTxt}>🗑️ Hapus Semua</Text>
            </TouchableOpacity>
          )}

          <View style={s.opacitySection}>
            <Text style={s.fieldLabel}>Opacity Kartu: {cardOpacity}%</Text>
            <View style={s.opacityControls}>
              <TouchableOpacity 
                style={s.opacityBtn}
                onPress={() => setCardOpacity(Math.max(1, cardOpacity - 10))}
              >
                <Text style={s.opacityBtnTxt}>−</Text>
              </TouchableOpacity>
              <TextInput
                style={s.opacityInput}
                value={String(cardOpacity)}
                onChangeText={(val) => {
                  const n = parseInt(val) || 50;
                  setCardOpacity(Math.max(1, Math.min(100, n)));
                }}
                keyboardType="numeric"
                maxLength={3}
              />
              <TouchableOpacity 
                style={s.opacityBtn}
                onPress={() => setCardOpacity(Math.min(100, cardOpacity + 10))}
              >
                <Text style={s.opacityBtnTxt}>+</Text>
              </TouchableOpacity>
            </View>
            <View style={s.opacityLabels}>
              <Text style={s.opacityLabelTxt}>Transparan</Text>
              <Text style={s.opacityLabelTxt}>Solid</Text>
            </View>
          </View>
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
            { nama: '1 Bulan',   harga: 'Rp 99.000',   desc: 'ADD TV Sampai 5',                 color: C.ACCENT,  ico: '💎' },
            { nama: '3 Bulan',   harga: 'Rp 299.000',  desc: 'ADD TV Sampai 10',                color: C.GREEN,   ico: '🚀' },
            { nama: '1 Tahun',   harga: 'Rp 999.000',  desc: 'ADD TV Sampai 15',                color: C.YELLOW,  ico: '👑' },
            { nama: 'LIFETIME',  harga: 'Rp 2.000.000', desc: 'ADD TV unlimited',               color: C.ORANGE,  ico: '♾️' },
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

        {/* Super Admin: Generate Kode Aktivasi */}
        {isSuperAdmin && (
          <View style={s.card}>
            <Text style={s.cardTitle}>🔑 GENERATE KODE AKTIVASI</Text>
            <Text style={s.fieldLabel}>Username Pelanggan</Text>
            <TextInput style={s.input} placeholder="username" placeholderTextColor={C.MUTED}
              value={genUname} onChangeText={setGenUname} autoCapitalize="none" />
            <Text style={s.fieldLabel}>Paket</Text>
            <View style={s.modeRow}>
              {['BULANAN', '3BULAN', 'TAHUNAN', 'LIFETIME'].map(p => (
                <TouchableOpacity key={p} style={[s.roleBtn, genPaket === p && s.roleBtnActive]}
                  onPress={() => setGenPaket(p)}>
                  <Text style={[s.roleBtnTxt, genPaket === p && { color: 'white' }]}>{p}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={[s.paketDesc, { marginBottom: 12, textAlign: 'center' }]}>
              {genPaket === 'BULANAN' ? '30 hari • ADD TV 5' :
               genPaket === '3BULAN' ? '60 hari • ADD TV 10' :
               genPaket === 'TAHUNAN' ? '360 hari • ADD TV 15' :
               '1.080 hari • ADD TV unlimited'}
            </Text>
            <TouchableOpacity style={s.btnAkt} onPress={doGenerate}>
              <Icon name="key" size={16} color="white" />
              <Text style={s.btnAktTxt}>⚡ Generate Kode</Text>
            </TouchableOpacity>
            {genMsg ? <Text style={[s.aktMsg, { color: C.YELLOW }]}>{genMsg}</Text> : null}
            {genKode ? (
              <TouchableOpacity style={s.genCodeBox} onPress={async () => {
                await Clipboard.setStringAsync(genKode);
                Alert.alert('✅ Copied', genKode);
              }}>
                <Text style={s.genCodeTxt}>{genKode}</Text>
                <Text style={s.genCodeHint}>Tap untuk copy</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        )}

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

        {/* Admin: Registrasi User & SMTP */}
        {currentRole === 'admin' && (
          <View style={s.card}>
            <Text style={s.cardTitle}>👥 MANAJEMEN USER</Text>
            <Text style={s.fieldLabel}>Username baru</Text>
            <TextInput
              style={s.input}
              placeholder="username"
              placeholderTextColor={C.MUTED}
              value={regUser} onChangeText={setRegUser}
              autoCapitalize="none"
            />
            <Text style={s.fieldLabel}>Password</Text>
            <TextInput
              style={s.input}
              placeholder="password"
              placeholderTextColor={C.MUTED}
              value={regPass} onChangeText={setRegPass}
              secureTextEntry
            />
            <Text style={s.fieldLabel}>Role</Text>
            <View style={s.modeRow}>
              {['admin', 'kasir'].map(r => (
                <TouchableOpacity
                  key={r}
                  style={[s.roleBtn, regRole === r && s.roleBtnActive]}
                  onPress={() => setRegRole(r)}
                >
                  <Text style={[s.roleBtnTxt, regRole === r && { color: 'white' }]}>{r}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={s.fieldLabel}>Email (opsional)</Text>
            <TextInput
              style={s.input}
              placeholder="email@example.com"
              placeholderTextColor={C.MUTED}
              value={regEmail} onChangeText={setRegEmail}
              keyboardType="email-address"
              autoCapitalize="none"
            />
            <TouchableOpacity style={s.btnSavePass} onPress={doRegistrasi}>
              <Text style={s.btnSavePassTxt}>➕ Daftarkan User Baru</Text>
            </TouchableOpacity>

            {regMsg ? <Text style={[s.regMsg, { color: regMsgOk ? C.GREEN : C.RED }]}>{regMsg}</Text> : null}

            {/* Daftar Users */}
            <Text style={[s.fieldLabel, { marginTop: 14 }]}>User Terdaftar:</Text>
            {usersList.length > 0 ? (
              usersList.map(u => (
                <View key={u.name} style={s.userRow}>
                  <Text style={s.userName}>{u.name}</Text>
                  <Text style={s.userRole}>({u.role})</Text>
                </View>
              ))
            ) : (
              <Text style={s.emptyTxt}>Tidak ada user</Text>
            )}
          </View>
        )}

        {/* Admin: SMTP Config */}
        {currentRole === 'admin' && (
          <View style={s.card}>
            <Text style={s.cardTitle}>📧 KONFIGURASI EMAIL (SMTP)</Text>
            <Text style={s.fieldLabel}>Server SMTP</Text>
            <TextInput style={s.input} placeholder="smtp.gmail.com" placeholderTextColor={C.MUTED} value={smtpHost} onChangeText={setSmtpHost} autoCapitalize="none" />
            <View style={s.ipRow}>
              <TextInput style={[s.input, { flex: 1 }]} placeholder="Port" placeholderTextColor={C.MUTED} value={smtpPort} onChangeText={setSmtpPort} keyboardType="numeric" />
              <TextInput style={[s.input, { flex: 1 }]} placeholder="Email" placeholderTextColor={C.MUTED} value={smtpUser} onChangeText={setSmtpUser} keyboardType="email-address" autoCapitalize="none" />
            </View>
            <TextInput style={s.input} placeholder="Password/App Password" placeholderTextColor={C.MUTED} value={smtpPass} onChangeText={setSmtpPass} secureTextEntry />
            <TouchableOpacity style={s.btnSavePass} onPress={simpanSMTP}>
              <Text style={s.btnSavePassTxt}>💾 Simpan Konfigurasi SMTP</Text>
            </TouchableOpacity>
            {smtpMsg ? <Text style={[s.regMsg, { color: smtpOk ? C.GREEN : C.RED }]}>{smtpMsg}</Text> : null}
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
  logoImage: {
    width: 80, height: 80, marginBottom: 12,
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
  modeRow: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  roleBtn: {
    flex: 1, paddingVertical: 10, borderRadius: 8,
    borderWidth: 1, borderColor: C.BORDER, alignItems: 'center',
    backgroundColor: C.BTN,
  },
  roleBtnActive: { backgroundColor: C.ACCENT2, borderColor: C.ACCENT2 },
  roleBtnTxt: { ...FONTS.small, color: C.MUTED },
  regMsg: { ...FONTS.small, textAlign: 'center', marginTop: 8 },
  userRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingVertical: 6, borderBottomWidth: 0.5, borderBottomColor: C.BORDER,
  },
  userName: { ...FONTS.label, color: C.TEXT, flex: 1 },
  userRole: { ...FONTS.small, color: C.MUTED },
  emptyTxt: { ...FONTS.small, color: C.MUTED, textAlign: 'center', paddingVertical: 10 },
  ipRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  genCodeBox: {
    borderWidth: 2, borderColor: C.GREEN, borderRadius: 12,
    padding: 16, alignItems: 'center', marginTop: 10,
    backgroundColor: '#1A3A1A',
  },
  genCodeTxt: { ...FONTS.title, color: C.GREEN, fontSize: 14, letterSpacing: 2, textAlign: 'center' },
  genCodeHint: { ...FONTS.small, color: C.MUTED, marginTop: 6 },
  btnSavePass: {
    backgroundColor: C.ACCENT2, borderRadius: 10,
    paddingVertical: 12, alignItems: 'center',
  },
  btnSavePassTxt: { color: 'white', ...FONTS.sub },

  // Background & Opacity
  bgLabel: { ...FONTS.sub, color: C.TEXT, fontSize: 12, marginBottom: 6 },
  bgPreview: {
    width: '100%', height: 120, borderRadius: 10, marginBottom: 8,
    borderWidth: 1, borderColor: C.BORDER,
  },
  bgPreviewLand: {
    width: '100%', height: 80, borderRadius: 10, marginBottom: 8,
    borderWidth: 1, borderColor: C.BORDER,
  },
  bgPlaceholder: {
    width: '100%', height: 120, borderRadius: 10, marginBottom: 8,
    borderWidth: 1, borderColor: C.BORDER, borderStyle: 'dashed',
    backgroundColor: C.BTN, alignItems: 'center', justifyContent: 'center', gap: 6,
  },
  bgPlaceholderTxt: { ...FONTS.small, color: C.MUTED },
  btnBgPick: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: C.ACCENT2, borderRadius: 10, paddingVertical: 10, marginBottom: 6,
  },
  btnBgPickTxt: { color: 'white', ...FONTS.sub, fontSize: 12 },
  btnBgRemove: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: C.RED, borderRadius: 10, paddingVertical: 10, marginTop: 6,
  },
  btnBgRemoveTxt: { color: 'white', ...FONTS.sub, fontSize: 12 },
  opacitySection: { marginTop: 4 },
  opacityControls: { flexDirection: 'row', gap: 8, alignItems: 'center', marginBottom: 10 },
  opacityBtn: {
    width: 44, height: 44, borderRadius: 8,
    backgroundColor: C.ACCENT2, alignItems: 'center', justifyContent: 'center',
  },
  opacityBtnTxt: { color: 'white', fontSize: 20, fontWeight: 'bold' },
  opacityInput: {
    flex: 1, backgroundColor: C.BTN, borderRadius: 8,
    borderWidth: 1, borderColor: C.BORDER,
    color: C.ACCENT, textAlign: 'center', fontSize: 14, fontWeight: 'bold',
  },
  opacityLabels: { flexDirection: 'row', justifyContent: 'space-between' },
  opacityLabelTxt: { ...FONTS.small, color: C.MUTED, fontSize: 10 },
});
