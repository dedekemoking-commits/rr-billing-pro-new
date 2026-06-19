# RR BILLING PRO — React Native (Expo)
## Konversi dari Python customtkinter → Android APK

---

## 📁 STRUKTUR PROJECT

```
RRBillingPro/
├── App.js                          # Entry point
├── app.json                        # Expo config
├── eas.json                        # Build config
├── package.json
├── assets/
│   ├── icon.png                    # 1024x1024 icon app
│   ├── splash.png                  # 1284x2778 splash
│   └── adaptive-icon.png           # 1024x1024 Android adaptive icon
└── src/
    ├── screens/
    │   ├── LoginScreen.js           # Login + lisensi check
    │   ├── DashboardScreen.js       # List TV + timer
    │   ├── HargaScreen.js           # Kontrol harga
    │   ├── RiwayatScreen.js         # Riwayat transaksi + export CSV
    │   ├── WiFiScreen.js            # ADB WiFi + scan jaringan
    │   └── ProfilScreen.js          # Profil + aktivasi lisensi
    ├── components/
    │   ├── TVCard.js                # Kartu TV dengan countdown timer
    │   ├── ModalTambahTV.js         # Dialog tambah TV baru
    │   ├── ModalPairing.js          # Dialog ADB pairing (Android TV 11+)
    │   └── ModalPaket.js            # Dialog pilih paket + pesanan
    ├── navigation/
    │   └── MainNavigator.js         # Bottom tab navigator
    ├── store/
    │   └── useStore.js              # Zustand global state
    └── utils/
        ├── theme.js                 # Warna, font, konstanta
        ├── storage.js               # AsyncStorage wrapper
        └── adbHelper.js             # ADB via TCP socket
```

---

## 🚀 CARA BUILD APK

### PRASYARAT
```bash
# Install Node.js 18+ dan npm
node --version   # >= 18
npm --version

# Install Expo CLI
npm install -g expo-cli eas-cli

# Login ke akun Expo (gratis di expo.dev)
eas login
```

### LANGKAH 1 — Install Dependencies
```bash
cd RRBillingPro
npm install
```

### LANGKAH 2 — Tambahkan Asset
Siapkan gambar berikut di folder `assets/`:
- `icon.png`           — 1024×1024 px (icon app)
- `splash.png`         — 1284×2778 px (layar loading)
- `adaptive-icon.png`  — 1024×1024 px (Android adaptive icon)

Bisa pakai placeholder dulu:
```bash
# Download placeholder images
curl -o assets/icon.png "https://via.placeholder.com/1024x1024/0D0D1A/00FFCC?text=RR"
curl -o assets/splash.png "https://via.placeholder.com/1284x2778/0D0D1A/00FFCC?text=RR+BILLING+PRO"
curl -o assets/adaptive-icon.png "https://via.placeholder.com/1024x1024/7B2FFF/ffffff?text=RR"
```

### LANGKAH 3 — Update EAS Project ID
```bash
# Buat project baru di expo.dev, lalu:
eas init
# Salin project ID ke app.json → expo.extra.eas.projectId
```

### LANGKAH 4 — Build APK (free, tidak butuh akun berbayar)
```bash
# Build APK untuk internal testing (gratis)
eas build --platform android --profile preview

# Setelah selesai, link download APK akan muncul
# Install APK ke HP Android langsung
```

### LANGKAH 5 — Build untuk Play Store (AAB)
```bash
eas build --platform android --profile production
```

---

## 📱 DEVELOPMENT (Test di HP langsung)

```bash
# Install Expo Go di HP dari Play Store
# Jalankan dev server
npx expo start

# Scan QR code dengan Expo Go
# ATAU tekan 'a' untuk buka di emulator Android
```

---

## 🔧 KONFIGURASI NATIVE MODULES

Beberapa package butuh konfigurasi tambahan:

### react-native-tcp-socket (untuk ADB)
```bash
# Jika menggunakan expo-dev-client (bukan Expo Go):
npx expo install react-native-tcp-socket
# Lalu build dev client:
eas build --profile development --platform android
```

### @react-native-community/netinfo
```bash
npx expo install @react-native-community/netinfo
```

### Jika menggunakan Expo Go (development saja):
Beberapa fitur TCP tidak tersedia di Expo Go standar.
Gunakan Expo Dev Client untuk fitur TCP penuh:
```bash
npx expo install expo-dev-client
eas build --profile development
```

---

## 📡 CATATAN ADB PAIRING

### Keterbatasan di Android:
Karena HP Android tidak bisa menjalankan binary `adb` langsung,
koneksi ADB dilakukan via **TCP Socket langsung** ke port ADB TV.

**Cara kerja:**
1. Cek port 5555 terbuka di TV → `ADBHelper.checkPortOpen()`
2. Send ADB CNXN handshake → `ADBHelper.connect()`
3. Kirim shell command → `ADBHelper.shell()`

**Pairing Android TV 11+ (SPAKE2+TLS):**
Protocol pairing asli membutuhkan TLS 1.3 + SPAKE2 yang tidak tersedia
di React Native tanpa native module khusus.

**Solusi alternatif yang bisa dipakai:**
- Setelah pair via laptop/PC sekali, HP bisa connect langsung ke port 5555
- Gunakan Termux di HP Android untuk install adb dan pair dari terminal
- Atau gunakan IP port 5555 langsung jika TV sudah pernah di-pair sebelumnya

### Untuk TV Android 10 ke bawah:
Connect langsung ke IP:5555 tanpa pairing — ini berjalan penuh di HP.

---

## 🔐 DEFAULT LOGIN
- admin / admin123  (role: admin)
- kasir / kasir123  (role: kasir)

---

## 📦 FITUR LENGKAP

| Fitur                    | Status      |
|--------------------------|-------------|
| Login multi-user         | ✅ Lengkap  |
| Sistem lisensi trial     | ✅ Lengkap  |
| Dashboard TV multi-kota  | ✅ Lengkap  |
| Countdown timer per TV   | ✅ Lengkap  |
| Kontrol ADB (power/vol)  | ✅ Lengkap  |
| Paket waktu main         | ✅ Lengkap  |
| Menu makanan & minuman   | ✅ Lengkap  |
| Riwayat transaksi        | ✅ Lengkap  |
| Export CSV               | ✅ Lengkap  |
| Kontrol harga dinamis    | ✅ Lengkap  |
| Scan jaringan ADB        | ✅ Lengkap  |
| ADB Connect manual       | ✅ Lengkap  |
| ADB Pairing (partial)    | ⚠ Partial  |
| Data persisten           | ✅ Lengkap  |
| Dark theme gaming        | ✅ Lengkap  |

---

## 💬 KONTAK
WhatsApp: 0812-7064-7744
