/**
 * Termux RSA Key Pair — FALLBACK jika pakai Android langsung
 *
 * NOTE: Saat ini app menggunakan key dari PC (~/.android/adbkey)
 * yang sudah di-copy ke hardcodedRsaKey.js.
 * Termux key hanya perlu jika app dijalankan dari Android (Termux)
 * tanpa koneksi ke PC.
 *
 * UNTUK PAKAI KEY DARI TERMUX:
 * 1. Di Termux (di Android TV), jalankan:
 *    cat ~/.android/adbkey
 *    cat ~/.android/adbkey.pub
 *
 * 2. Copy seluruh isi kedua file tersebut
 * 3. Paste di bawah
 * 4. Ubah USE_TERMUX_KEY = true
 * 5. Di adbHelper.js, ganti import HARDCODED_PRIV_PEM
 *    dengan TERMUX_PRIVATE_KEY
 */

export const TERMUX_PRIVATE_KEY = `PASTE_TERMUX_PRIVATE_KEY_HERE`;
export const TERMUX_PUBLIC_KEY = `PASTE_TERMUX_PUBLIC_KEY_HERE`;
export const USE_TERMUX_KEY = false;
