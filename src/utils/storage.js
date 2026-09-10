import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import * as forge from 'node-forge';
import { DEFAULT_PAKET, DEFAULT_MAKANAN, DEFAULT_MINUMAN } from './theme';
import { TERMUX_PRIVATE_KEY, TERMUX_PUBLIC_KEY, USE_TERMUX_KEY } from './termuxRsaKey';

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

// ─── LISENSI (PC Keygen Compatible) ──────────────────────────────────────────
// Algoritma: custom Base32 + HMAC-SHA256 + CRC-16

const RR_LICENSE_SECRET = 'RR-CCTV-2026-BILLING-PRO-SECRET-KEY-JANGAN-BOCOR';
const CHARSET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const TRIAL_DAYS = 7;

// Encode bytes to custom Base32 — process 5 bytes at a time (pure arithmetic, no 32-bit truncation)
function toB32(data) {
  let result = '';
  const len = data.length;
  let i = 0;
  while (i < len) {
    const chunkSize = Math.min(5, len - i);
    let bits = 0;
    for (let j = 0; j < chunkSize; j++) bits = bits * 256 + data[i + j];
    const totalBits = chunkSize * 8;
    let remaining = totalBits;
    while (remaining >= 5) {
      remaining -= 5;
      result += CHARSET[Math.floor(bits / Math.pow(2, remaining)) % 32];
    }
    if (remaining > 0) {
      result += CHARSET[Math.floor((bits % Math.pow(2, remaining)) * Math.pow(2, 5 - remaining))];
    }
    i += chunkSize;
  }
  return result;
}

// Decode custom Base32 to bytes — process 8 chars at a time (pure arithmetic)
function fromB32(s) {
  const chars = s.toUpperCase();
  const bytes = [];
  let i = 0;
  while (i < chars.length) {
    const chunkSize = Math.min(8, chars.length - i);
    let bits = 0;
    for (let j = 0; j < chunkSize; j++) {
      const idx = CHARSET.indexOf(chars[i + j]);
      if (idx === -1) throw new Error('Invalid char');
      bits = bits * 32 + idx;
    }
    const totalBits = chunkSize * 5;
    const extra = totalBits % 8;
    bits = Math.floor(bits / Math.pow(2, extra));
    const outBytes = (totalBits - extra) / 8;
    for (let j = 0; j < outBytes; j++) {
      bytes.push(Math.floor(bits / Math.pow(2, (outBytes - 1 - j) * 8)) % 256);
    }
    i += chunkSize;
  }
  return Uint8Array.from(bytes);
}

function formatKode(raw) {
  while (raw.length % 4 !== 0) raw += 'A';
  const groups = [];
  for (let i = 0; i < raw.length; i += 4) groups.push(raw.slice(i, i + 4));
  return 'RR-' + groups.join('-');
}

function crc16(str) {
  let crc32 = 0xFFFFFFFF;
  const poly = 0xEDB88320;
  for (let i = 0; i < str.length; i++) {
    crc32 ^= str.charCodeAt(i);
    for (let j = 0; j < 8; j++) {
      if (crc32 & 1) crc32 = (crc32 >>> 1) ^ poly;
      else crc32 >>>= 1;
    }
  }
  crc32 ^= 0xFFFFFFFF;
  return (crc32 ^ (crc32 >>> 16)) & 0xFFFF;
}

function unformatKode(kode) {
  return kode.toUpperCase().replace(/-/g, '').replace(/^RR/, '');
}

function daysSinceEpoch(date) {
  const epoch = new Date(2000, 0, 1);
  return Math.floor((date.getTime() - epoch.getTime()) / 86400000);
}

function epochToDate(n) {
  const epoch = new Date(2000, 0, 1);
  return new Date(epoch.getTime() + n * 86400000);
}

async function hmacSha256(keyBytes, messageBytes) {
  const blockSize = 64;
  let k = keyBytes;
  if (k.length > blockSize) {
    const hashBuf = await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, k);
    k = new Uint8Array(hashBuf);
  }
  const kPad = new Uint8Array(blockSize);
  kPad.set(k);
  const ipad = new Uint8Array(blockSize);
  const opad = new Uint8Array(blockSize);
  for (let i = 0; i < blockSize; i++) {
    ipad[i] = kPad[i] ^ 0x36;
    opad[i] = kPad[i] ^ 0x5C;
  }
  const innerInput = new Uint8Array(blockSize + messageBytes.length);
  innerInput.set(ipad);
  innerInput.set(messageBytes, blockSize);
  const innerHash = await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, innerInput);
  const innerArr = new Uint8Array(innerHash);
  const outerInput = new Uint8Array(blockSize + 32);
  outerInput.set(opad);
  outerInput.set(innerArr, blockSize);
  const outerHash = await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, outerInput);
  return new Uint8Array(outerHash).slice(0, 4);
}

async function verifyHMAC(payload, signature) {
  const secretBytes = new Uint8Array(RR_LICENSE_SECRET.split('').map(c => c.charCodeAt(0)));
  const expectedSig = await hmacSha256(secretBytes, payload);
  return expectedSig.length === signature.length &&
    expectedSig.every((v, i) => v === signature[i]);
}

export async function getLicenseStatus() {
  try {
    const raw = await AsyncStorage.getItem(LICENSE_KEY);
    let lic = raw ? JSON.parse(raw) : null;

    if (!lic) {
      lic = { status: 'trial', mulai: new Date().toISOString(), aktif: false, kode: '' };
      await AsyncStorage.setItem(LICENSE_KEY, JSON.stringify(lic));
    }

    // Verify stored license on load
    if (lic.aktif && lic.kode) {
      const result = await verifyLicenseCode(lic.kode);
      if (result.sukses) {
        return { status: 'active', sisaHari: result.sisaHari, pesan: result.pesan };
      }
      // If code expired, fall through to check
      lic.aktif = false;
      await AsyncStorage.setItem(LICENSE_KEY, JSON.stringify(lic));
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

async function verifyLicenseCode(kode) {
  try {
    const raw = unformatKode(kode);
    if (!raw || raw.length < 16) {
      return { sukses: false, pesan: 'Kode terlalu pendek' };
    }

    const data = fromB32(raw);
    if (!data || data.length < 12) {
      return { sukses: false, pesan: 'Data kode tidak valid' };
    }

    // Copy slices to prevent ArrayBuffer offset issues
    const payload = new Uint8Array(data.slice(0, 8));
    const signature = new Uint8Array(data.slice(8, 12));

    // Verify HMAC
    const valid = await verifyHMAC(payload, signature);
    if (!valid) {
      return { sukses: false, pesan: 'Tanda tangan kode tidak valid' };
    }

    // Decode payload: >BIHB = edition(1) + expiry_days(4) + machine_crc(2) + reserved(1)
    const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
    const editionByte = view.getUint8(0);
    const expiryDays = view.getUint32(1);
    const machineCrc = view.getUint16(5);

    const expiryDate = epochToDate(expiryDays);
    const now = new Date();
    const sisaHari = Math.floor((expiryDate - now) / 86400000);

    if (sisaHari < 0) {
      return { sukses: false, pesan: `Lisensi kedaluwarsa sejak ${expiryDate.toLocaleDateString('id-ID')}` };
    }

    const editionNames = { 0x01: '1 Bulan', 0x03: '3 Bulan', 0x0C: '1 Tahun', 0xFF: 'LIFETIME' };
    const editionName = editionNames[editionByte] || 'Unknown';

    return {
      sukses: true,
      pesan: `Lisensi ${editionName} aktif hingga ${expiryDate.toLocaleDateString('id-ID')} (sisa ${sisaHari} hari)`,
      sisaHari,
      edition: editionName,
      universal: machineCrc === 0,
    };
  } catch (e) {
    return { sukses: false, pesan: `Kode tidak valid: ${e.message}` };
  }
}

export async function aktivasiLisensi(kode) {
  const result = await verifyLicenseCode(kode.trim());
  if (result.sukses) {
    const lic = {
      status: 'active', aktif: true, kode: kode.trim(),
      mulai: new Date().toISOString(),
      tglAktivasi: new Date().toISOString(),
      edition: result.edition,
      expiryDays: result.sisaHari,
    };
    await AsyncStorage.setItem(LICENSE_KEY, JSON.stringify(lic));
    return { sukses: true, pesan: result.pesan };
  }
  return result;
}

// ─── GENERATOR KODE (Super Admin) ─────────────────────────────────────────────
const EDITION_MAP = { BULANAN: 0x01, '3BULAN': 0x03, TAHUNAN: 0x0C, LIFETIME: 0xFF };
const EDITION_HARI = { 0x01: 30, 0x03: 90, 0x0C: 360, 0xFF: 1080 };

async function generateHMAC(payload) {
  const secretBytes = new Uint8Array(RR_LICENSE_SECRET.split('').map(c => c.charCodeAt(0)));
  const sig = await hmacSha256(secretBytes, payload);
  return sig.slice(0, 4);
}

export async function generateLicenseKode(edition, username, days) {
  const editionByte = EDITION_MAP[edition.toUpperCase().replace(/[\s-]/g, '')];
  if (editionByte === undefined) throw new Error('Edition tidak dikenal: ' + edition);
  const hari = days || EDITION_HARI[editionByte] || 31;
  const expiryDays = await daysSinceEpoch(new Date(Date.now() + hari * 86400000));
  const machineCrc = username ? crc16(username.trim().toLowerCase()) : 0;
  const payload = new Uint8Array(8);
  const dv = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
  dv.setUint8(0, editionByte);
  dv.setUint32(1, expiryDays);
  dv.setUint16(5, machineCrc);
  dv.setUint8(7, 0);
  const sig = await generateHMAC(payload);
  const full = new Uint8Array(12);
  full.set(payload);
  full.set(sig, 8);
  return formatKode(toB32(full));
}

// ─── RIWAYAT TRANSAKSI ────────────────────────────────────────────────────────
const TRANSAKSI_KEY = 'rr_transaksi';

export async function loadTransaksi() {
  try {
    const raw = await AsyncStorage.getItem(TRANSAKSI_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function genTrxId() {
  const ts = Date.now().toString(36);
  const rnd = Math.random().toString(36).substring(2, 7);
  return `TRX-${ts}${rnd}`.toUpperCase();
}

export async function tambahTransaksi(data) {
  const list = await loadTransaksi();
  const item = { id: genTrxId(), ...data };
  list.unshift(item);
  await AsyncStorage.setItem(TRANSAKSI_KEY, JSON.stringify(list));
  return list;
}

export async function hapusSemuaTransaksi() {
  await AsyncStorage.removeItem(TRANSAKSI_KEY);
}

// ─── AUTH SESSION ────────────────────────────────────────────────────────────
const SESSION_KEY = 'rr_session';

export async function saveSession(user, role) {
  await AsyncStorage.setItem(SESSION_KEY, JSON.stringify({ user, role }));
}

export async function loadSession() {
  try {
    const raw = await AsyncStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

export async function clearSession() {
  await AsyncStorage.removeItem(SESSION_KEY);
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

// ─── ADB KEY PAIR (for AUTH handshake) ───────────────────────────────────────
const ADB_KEY_PRIV = 'rr_adb_privkey';
const ADB_KEY_PUB  = 'rr_adb_pubkey';

export async function tryGetAdbKeyPair() {
  try {
    const privPem = await AsyncStorage.getItem(ADB_KEY_PRIV);
    const pubPem  = await AsyncStorage.getItem(ADB_KEY_PUB);
    if (privPem && pubPem) return { privPem, pubPem };
  } catch {}
  return null;
}

export async function getAdbKeyPair() {
  try {
    // ★ SOLUSI 3: CEK TERMUX KEY TERLEBIH DAHULU ★
    if (USE_TERMUX_KEY && TERMUX_PRIVATE_KEY && TERMUX_PUBLIC_KEY) {
      const privPem = TERMUX_PRIVATE_KEY.trim();
      const pubPem  = TERMUX_PUBLIC_KEY.trim();
      
      // Validasi format key
      if (privPem.includes('BEGIN') && privPem.includes('PRIVATE') &&
          pubPem.includes('BEGIN') && pubPem.includes('PUBLIC')) {
        console.log('[ADB] ★ MENGGUNAKAN RSA KEY DARI TERMUX ★');
        // Cache ke AsyncStorage agar tidak perlu paste lagi di future
        await AsyncStorage.setItem(ADB_KEY_PRIV, privPem);
        await AsyncStorage.setItem(ADB_KEY_PUB, pubPem);
        return { privPem, pubPem };
      } else {
        console.warn('[ADB] Termux key format tidak valid, generate baru...');
      }
    }
    
    let privPem = await AsyncStorage.getItem(ADB_KEY_PRIV);
    let pubPem  = await AsyncStorage.getItem(ADB_KEY_PUB);

    if (!privPem || !pubPem) {
      // Generate key secara async agar tidak memblokir UI thread
      const keypair = await new Promise(resolve =>
        setTimeout(() => resolve(forge.pki.rsa.generateKeyPair({ bits: 2048, e: 0x10001 })), 50)
      );
      privPem = forge.pki.privateKeyToPem(keypair.privateKey);
      pubPem  = forge.pki.publicKeyToPem(keypair.publicKey);
      await AsyncStorage.setItem(ADB_KEY_PRIV, privPem);
      await AsyncStorage.setItem(ADB_KEY_PUB, pubPem);
    }

    return { privPem, pubPem };
  } catch (e) {
    console.warn('[ADB] Key gen error:', e.message);
    return null;
  }
}

export async function adbSignToken(tokenBytes, privPem) {
  try {
    const privateKey = forge.pki.privateKeyFromPem(privPem);

    // ADB protocol: server sends 20-byte token. Server calls
    // RSA_verify(NID_sha1, token, 20, sig, ...) which computes
    // SHA-1(token) internally and verifies the signature.
    // So we MUST SHA-1 hash the token first, then sign.
    const md = forge.md.sha1.create();
    let binaryStr = '';
    for (let i = 0; i < tokenBytes.length; i++) {
      binaryStr += String.fromCharCode(tokenBytes[i]);
    }
    md.update(binaryStr, 'binary');
    const sigStr = privateKey.sign(md);
    const sigBytes = new Uint8Array(sigStr.length);
    for (let i = 0; i < sigStr.length; i++) {
      sigBytes[i] = sigStr.charCodeAt(i);
    }
    return sigBytes;
  } catch (e) {
    console.warn('[ADB] Sign error:', e.message);
    return null;
  }
}
