import AsyncStorage from '@react-native-async-storage/async-storage';
import { DEFAULT_PAKET, DEFAULT_MAKANAN, DEFAULT_MINUMAN } from './theme';

const CONFIG_KEY  = 'rr_billing_config';
const LICENSE_KEY = 'rr_billing_license';

// ─── CONFIG ──────────────────────────────────────────────────────────────────
export async function loadConfig() {
  try {
    const raw = await AsyncStorage.getItem(CONFIG_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

export async function saveConfig(data) {
  try {
    await AsyncStorage.setItem(CONFIG_KEY, JSON.stringify(data));
  } catch (e) { console.warn('saveConfig error', e); }
}

export async function getConfig(key, defaultVal = null) {
  const cfg = await loadConfig();
  return cfg[key] !== undefined ? cfg[key] : defaultVal;
}

export async function setConfig(key, value) {
  const cfg = await loadConfig();
  cfg[key] = value;
  await saveConfig(cfg);
}

// ─── LISENSI ─────────────────────────────────────────────────────────────────
const TRIAL_DAYS = 7;

export async function getLicenseStatus() {
  try {
    const raw = await AsyncStorage.getItem(LICENSE_KEY);
    let lic = raw ? JSON.parse(raw) : null;

    if (!lic) {
      lic = { status: 'trial', mulai: new Date().toISOString(), aktif: false, kode: '' };
      await AsyncStorage.setItem(LICENSE_KEY, JSON.stringify(lic));
    }

    if (lic.aktif) {
      return { status: 'active', sisaHari: 9999, pesan: 'Lisensi Aktif ✅' };
    }

    const mulai = new Date(lic.mulai);
    const sisa  = TRIAL_DAYS - Math.floor((Date.now() - mulai.getTime()) / 86400000);
    if (sisa > 0) {
      return { status: 'trial', sisaHari: sisa, pesan: `Mode Trial — sisa ${sisa} hari` };
    }
    return { status: 'expired', sisaHari: 0, pesan: 'Trial habis — Aktifkan lisensi' };
  } catch {
    return { status: 'trial', sisaHari: 7, pesan: 'Mode Trial' };
  }
}

export async function aktivasiLisensi(kode) {
  const bersih = kode.toUpperCase().replace(/-/g, '');
  if (bersih.length === 14 && bersih.startsWith('RR')) {
    const lic = {
      status: 'active', aktif: true, kode,
      mulai: new Date().toISOString(),
      tglAktivasi: new Date().toISOString(),
    };
    await AsyncStorage.setItem(LICENSE_KEY, JSON.stringify(lic));
    return { sukses: true, pesan: 'Aktivasi berhasil! Lisensi penuh aktif. 🎉' };
  }
  return { sukses: false, pesan: 'Kode tidak valid. Format: RR-XXXX-XXXX-XXXX' };
}

// ─── RIWAYAT TRANSAKSI ────────────────────────────────────────────────────────
const TRANSAKSI_KEY = 'rr_transaksi';

export async function loadTransaksi() {
  try {
    const raw = await AsyncStorage.getItem(TRANSAKSI_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

export async function tambahTransaksi(data) {
  const list = await loadTransaksi();
  list.unshift(data);
  await AsyncStorage.setItem(TRANSAKSI_KEY, JSON.stringify(list));
  return list;
}

export async function hapusSemuaTransaksi() {
  await AsyncStorage.removeItem(TRANSAKSI_KEY);
}

// ─── TV LIST ─────────────────────────────────────────────────────────────────
const TV_KEY = 'rr_tv_list';

export async function loadTVList() {
  try {
    const raw = await AsyncStorage.getItem(TV_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

export async function saveTVList(list) {
  await AsyncStorage.setItem(TV_KEY, JSON.stringify(list));
}
