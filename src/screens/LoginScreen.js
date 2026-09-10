import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  Alert, ScrollView, KeyboardAvoidingView, Platform, ActivityIndicator, Image,
} from 'react-native';
import { MaterialCommunityIcons as Icon } from '@expo/vector-icons';
import * as Crypto from 'expo-crypto';
import { C, FONTS } from '../utils/theme';
import { getConfig, setConfig, getLicenseStatus } from '../utils/storage';
import { useStore } from '../store/useStore';

import { fetchUsers, cekUsername, daftarUser, loginUser, seedAdmin } from '../utils/githubAuth';

async function sha256(text) {
  const digest = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256, text
  );
  return digest;
}

export default function LoginScreen({ navigation }) {
  const setUser = useStore(s => s.setUser);
  const loadHarga = useStore(s => s.loadHarga);
  const loadTVs   = useStore(s => s.loadTVs);
  const loadLicense = useStore(s => s.loadLicense);
  const loadTransaksi = useStore(s => s.loadTransaksi);

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading]   = useState(false);
  const [attempts, setAttempts] = useState(0);
  const [lockedUntil, setLockedUntil] = useState(null);
  const [licMsg, setLicMsg]     = useState('Memeriksa lisensi...');
  const [licColor, setLicColor] = useState(C.MUTED);
  const [errMsg, setErrMsg]     = useState('');
  const [showReg,  setShowReg]  = useState(false);
  const [regUser,  setRegUser]  = useState('');
  const [regPass,  setRegPass]  = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regMsg,   setRegMsg]   = useState('');
  const [regMsgOk, setRegMsgOk] = useState(false);

  useEffect(() => {
    setLicMsg('Memeriksa lisensi...'); setLicColor(C.MUTED);
    try { seedAdmin(sha256); } catch {}
    // Non-blocking license check — jangan blokir UI
    const timeout = setTimeout(async () => {
      try {
        const lic = await getLicenseStatus();
        if (lic.status === 'active') {
          setLicMsg('✅ Lisensi Aktif'); setLicColor(C.GREEN);
        } else if (lic.status === 'trial') {
          setLicMsg(`🕐 ${lic.pesan}`); setLicColor(C.YELLOW);
        } else {
          setLicMsg(`⚠ ${lic.pesan}`); setLicColor(C.RED);
        }
      } catch {
        setLicMsg('⚠ Gagal memeriksa lisensi'); setLicColor(C.YELLOW);
      }
    }, 500);
    return () => clearTimeout(timeout);
  }, []);

  const doLogin = async () => {
    if (!username.trim() || !password) {
      setErrMsg('✖ Isi username & password'); return;
    }
    if (lockedUntil && Date.now() < lockedUntil) {
      const sisa = Math.ceil((lockedUntil - Date.now()) / 1000);
      setErrMsg(`⛔ Terkunci ${sisa}s`); return;
    }

    setLoading(true);
    setErrMsg('');

    try {
      const hash = await sha256(password);
      const user = await loginUser(username, hash);
      if (user) {
        setAttempts(0);
        await Promise.all([
          loadHarga(),
          loadTVs(),
          loadLicense(),
          loadTransaksi(),
        ]);
        await setUser(user.username, user.role);
        navigation.replace('Main');
      } else {
        const newAttempts = attempts + 1;
        setAttempts(newAttempts);
        if (newAttempts >= 5) {
          setLockedUntil(Date.now() + 60000);
          setErrMsg('⛔ 5x salah — terkunci 1 menit');
        } else {
          setErrMsg(`✖ Username/Password salah (${newAttempts}/5)`);
        }
      }
    } catch (e) {
      setErrMsg(`✖ Gagal: ${e.message}`);
    }
    setLoading(false);
  };

  const doRegistrasi = async () => {
    if (!regUser.trim() || regPass.length < 4) {
      setRegMsg('Username & password minimal 4 karakter'); setRegMsgOk(false); return;
    }
    setRegMsg('Memeriksa ketersediaan username...');
    setRegMsgOk(false);
    const hash = await sha256(regPass);
    try {
      const exists = await cekUsername(regUser.trim());
      if (exists) {
        setRegMsg(`Username "${regUser.trim()}" sudah terdaftar`); setRegMsgOk(false); return;
      }
      await daftarUser(regUser.trim(), hash, regEmail.trim());
      setRegMsg(`✅ Akun "${regUser.trim()}" berhasil dibuat! Silakan login.`);
      setRegMsgOk(true);
      setRegUser(''); setRegPass(''); setRegEmail('');
    } catch (e) {
      setRegMsg(`✖ Gagal daftar: ${e.message}`); setRegMsgOk(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={s.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
          {/* Logo Area */}
          <View style={s.logoWrap}>
            <Image
              source={require('../../assets/logo.png')}
              style={s.logoImage}
              resizeMode="contain"
            />
            <Text style={s.appName}>RR BILLING PRO</Text>
            <Text style={s.appSub}>Sistem Billing Rental TV & PS</Text>
            <Text style={[s.licMsg, { color: licColor }]}>{licMsg}</Text>
          </View>

          {/* Card Login */}
          <View style={s.card}>
            <Text style={s.fieldLabel}>Username</Text>
            <TextInput
              style={s.input}
              value={username}
              onChangeText={setUsername}
              placeholder="Masukkan username"
              placeholderTextColor={C.MUTED}
              autoCapitalize="none"
              returnKeyType="next"
            />

            <Text style={[s.fieldLabel, { marginTop: 14 }]}>Password</Text>
            <View style={s.passRow}>
              <TextInput
                style={[s.input, { flex: 1 }]}
                value={password}
                onChangeText={setPassword}
                placeholder="Masukkan password"
                placeholderTextColor={C.MUTED}
                secureTextEntry={!showPass}
                returnKeyType="done"
                onSubmitEditing={doLogin}
              />
              <TouchableOpacity style={s.eyeBtn} onPress={() => setShowPass(!showPass)}>
                <Icon name={showPass ? 'eye-off' : 'eye'} size={20} color={C.MUTED} />
              </TouchableOpacity>
            </View>

            {errMsg ? <Text style={s.errMsg}>{errMsg}</Text> : null}

            <TouchableOpacity
              style={[s.btnLogin, loading && { opacity: 0.6 }]}
              onPress={doLogin}
              disabled={loading}
            >
              {loading
                ? <ActivityIndicator color="white" />
                : <Text style={s.btnLoginTxt}>🔓  MASUK</Text>
              }
            </TouchableOpacity>

            <TouchableOpacity style={s.btnDaftar} onPress={() => setShowReg(true)}>
              <Text style={s.btnDaftarTxt}>📝 Belum punya akun? Daftar di sini</Text>
            </TouchableOpacity>
          </View>

          <Text style={s.ver}>RR BILLING PRO v2.0 • RR CCTV © 2026</Text>
        </ScrollView>

        {/* Modal Daftar - di luar ScrollView */}
        {showReg && (
          <View style={s.regOverlay}>
            <View style={s.regCard}>
              <Text style={s.regTitle}>📝 DAFTAR AKUN BARU</Text>
              <TextInput style={s.input} placeholder="Username" placeholderTextColor={C.MUTED} value={regUser} onChangeText={setRegUser} autoCapitalize="none" />
              <TextInput style={s.input} placeholder="Password (min 4 karakter)" placeholderTextColor={C.MUTED} value={regPass} onChangeText={setRegPass} secureTextEntry />
              <TextInput style={s.input} placeholder="Email (opsional)" placeholderTextColor={C.MUTED} value={regEmail} onChangeText={setRegEmail} keyboardType="email-address" autoCapitalize="none" />
              {regMsg ? <Text style={[s.regMsg, { color: regMsgOk ? C.GREEN : C.RED }]}>{regMsg}</Text> : null}
              <TouchableOpacity style={s.btnReg} onPress={doRegistrasi}><Text style={s.btnRegTxt}>✅ Daftar</Text></TouchableOpacity>
              <TouchableOpacity style={s.btnRegBatal} onPress={() => { setShowReg(false); setRegMsg(''); }}><Text style={s.btnRegBatalTxt}>✖ Tutup</Text></TouchableOpacity>
            </View>
          </View>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  root:    { flex: 1, backgroundColor: C.BG },
  scroll:  { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: 20 },
  logoWrap:{ alignItems: 'center', marginBottom: 24 },
  logoImage: {
    width: 100, height: 100, marginBottom: 12,
  },
  appName: { ...FONTS.title, fontSize: 22, color: C.ACCENT, letterSpacing: 2 },
  appSub:  { ...FONTS.body, color: C.MUTED, marginTop: 4 },
  licMsg:  { ...FONTS.small, marginTop: 8 },
  card: {
    width: '100%', maxWidth: 400,
    backgroundColor: C.PANEL, borderRadius: 16,
    borderWidth: 1, borderColor: C.BORDER,
    padding: 24,
  },
  fieldLabel: { ...FONTS.label, color: C.MUTED, marginBottom: 6 },
  input: {
    backgroundColor: C.BTN, borderRadius: 10,
    borderWidth: 1, borderColor: C.BORDER,
    color: C.ACCENT, ...FONTS.body,
    paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 14,
  },
  passRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  eyeBtn:  { padding: 12 },
  errMsg:  { color: C.RED, ...FONTS.small, marginTop: 10, textAlign: 'center' },
  btnLogin: {
    backgroundColor: C.ACCENT2, borderRadius: 12,
    paddingVertical: 14, alignItems: 'center',
    marginTop: 18,
  },
  btnLoginTxt: { color: 'white', ...FONTS.sub, fontSize: 15, letterSpacing: 1 },
  btnDaftar: { marginTop: 14, alignItems: 'center' },
  btnDaftarTxt: { ...FONTS.small, color: C.ACCENT, textDecorationLine: 'underline' },
  regOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'center',
    padding: 20, zIndex: 100,
  },
  regCard: {
    backgroundColor: C.PANEL, borderRadius: 16,
    borderWidth: 1, borderColor: C.BORDER, padding: 24,
    maxWidth: 400, alignSelf: 'center', width: '100%',
  },
  regTitle: { ...FONTS.title, color: C.ACCENT, fontSize: 15, marginBottom: 16, textAlign: 'center' },
  regMsg: { ...FONTS.small, textAlign: 'center', marginTop: 8, marginBottom: 8 },
  btnReg: {
    backgroundColor: C.ACCENT2, borderRadius: 10,
    paddingVertical: 12, alignItems: 'center', marginTop: 8,
  },
  btnRegTxt: { color: 'white', ...FONTS.sub },
  btnRegBatal: {
    borderWidth: 1, borderColor: C.RED, borderRadius: 10,
    paddingVertical: 10, alignItems: 'center', marginTop: 8,
  },
  btnRegBatalTxt: { color: C.RED, ...FONTS.sub },
  ver:  { ...FONTS.small, color: C.MUTED, marginTop: 32 },
});
