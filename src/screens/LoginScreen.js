import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  Alert, ScrollView, KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
import { MaterialCommunityIcons as Icon } from '@expo/vector-icons';
import * as Crypto from 'expo-crypto';
import { C, FONTS } from '../utils/theme';
import { getConfig, getLicenseStatus } from '../utils/storage';
import { useStore } from '../store/useStore';

const DEFAULT_USERS = {
  admin: { passwordHash: '', role: 'admin' },
  kasir: { passwordHash: '', role: 'kasir' },
};

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

  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading]   = useState(false);
  const [attempts, setAttempts] = useState(0);
  const [lockedUntil, setLockedUntil] = useState(null);
  const [licMsg, setLicMsg]     = useState('Memeriksa lisensi...');
  const [licColor, setLicColor] = useState(C.MUTED);
  const [errMsg, setErrMsg]     = useState('');

  useEffect(() => {
    (async () => {
      const lic = await getLicenseStatus();
      if (lic.status === 'active') {
        setLicMsg('✅ Lisensi Aktif'); setLicColor(C.GREEN);
      } else if (lic.status === 'trial') {
        setLicMsg(`🕐 ${lic.pesan}`); setLicColor(C.YELLOW);
      } else {
        setLicMsg(`⚠ ${lic.pesan}`); setLicColor(C.RED);
      }
    })();
  }, []);

  const doLogin = async () => {
    if (lockedUntil && Date.now() < lockedUntil) {
      const sisa = Math.ceil((lockedUntil - Date.now()) / 1000);
      setErrMsg(`⛔ Terkunci ${sisa}s`); return;
    }

    setLoading(true);
    const hash  = await sha256(password);
    const users = await getConfig('users', null);

    // Default password hash
    const adminHash = await sha256('admin123');
    const kasirHash = await sha256('kasir123');
    const defaults  = {
      admin: { passwordHash: adminHash, role: 'admin' },
      kasir: { passwordHash: kasirHash, role: 'kasir' },
    };

    const allUsers = users || defaults;
    const uname    = username.trim().toLowerCase();
    const udata    = allUsers[uname];

    if (udata && udata.passwordHash === hash) {
      setAttempts(0);
      await loadHarga();
      await loadTVs();
      await loadLicense();
      setUser(uname, udata.role);
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
    setLoading(false);
  };

  return (
    <KeyboardAvoidingView
      style={s.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
        {/* Logo Area */}
        <View style={s.logoWrap}>
          <View style={s.logoCircle}>
            <Icon name="gamepad-variant" size={44} color={C.ACCENT} />
          </View>
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

          <Text style={s.hint}>
            Default: admin / admin123  |  kasir / kasir123
          </Text>
        </View>

        <Text style={s.ver}>RR BILLING PRO v2.0 • RR CCTV © 2026</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  root:    { flex: 1, backgroundColor: C.BG },
  scroll:  { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: 20 },
  logoWrap:{ alignItems: 'center', marginBottom: 24 },
  logoCircle: {
    width: 80, height: 80, borderRadius: 20,
    backgroundColor: C.ACCENT2, alignItems: 'center', justifyContent: 'center',
    marginBottom: 12,
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
  hint: { ...FONTS.small, color: C.MUTED, textAlign: 'center', marginTop: 16 },
  ver:  { ...FONTS.small, color: C.MUTED, marginTop: 32 },
});
