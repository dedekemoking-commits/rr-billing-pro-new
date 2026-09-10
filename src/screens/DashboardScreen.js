import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  Alert, FlatList, ScrollView, useWindowDimensions, ImageBackground,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons as Icon } from '@expo/vector-icons';
import { C, FONTS, fmtRp } from '../utils/theme';
import { useStore } from '../store/useStore';
import { ADBHelper } from '../utils/adbHelper';
import tvWsServer from '../utils/tvWsServer';
import TVCard from '../components/TVCard';
import ModalTambahTV from '../components/ModalTambahTV';
import ModalPaket from '../components/ModalPaket';
import ModalBillingTV from '../components/ModalBillingTV';

export default function DashboardScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const { width: screenW, height: screenH } = useWindowDimensions();
  const isLandscape = screenW > screenH;
  const tvList        = useStore(s => s.tvList);
  const tambahTV      = useStore(s => s.tambahTV);
  const hapusTV       = useStore(s => s.hapusTV);
  const updateTV      = useStore(s => s.updateTV);
  const catat         = useStore(s => s.tambahTransaksi);
  const namaRental    = useStore(s => s.namaRental);
  const currentUser   = useStore(s => s.currentUser);
  const paketMain     = useStore(s => s.paketMain);
  const paketDurasi   = useStore(s => s.paketDurasi);
  const menuMakanan   = useStore(s => s.menuMakanan);
  const menuMinuman   = useStore(s => s.menuMinuman);
  const bgImagePortrait  = useStore(s => s.bgImagePortrait);
  const bgImageLandscape = useStore(s => s.bgImageLandscape);
  const cardOpacity      = useStore(s => s.cardOpacity);

  const [showTambah,  setShowTambah]  = useState(false);
  const [showPaket,   setShowPaket]   = useState(false);
  const [selectedTV,  setSelectedTV]  = useState(null);
  const [showBillingTV, setShowBillingTV] = useState(false);

  const onTambahTV = async (tvData) => {
    const id = `tv_${Date.now()}`;
    await tambahTV({ ...tvData, id });
  };

  const onPilihPaket = (tv) => {
    setSelectedTV(tv);
    setShowPaket(true);
  };

  const onPaketConfirm = async (paketNm, paketHarga, pesanan, total, durasi, isExtend, isLunas) => {
    if (!selectedTV) return;

    const { sendTvCommand } = useStore.getState();

    // Mode perpanjangan waktu saat sesi berjalan
    if (isExtend && paketNm) {
      const menit = (durasi?.jam || 0) * 60 + (durasi?.menit || 0);
      const extendMenit = menit > 0 ? menit : 60;
      const pesananTotal = Math.max(0, total - paketHarga);
      const updates = {};
      if (!selectedTV.bebas) {
        updates.sisaDetik = (selectedTV.sisaDetik || 0) + extendMenit * 60;
        updates.timerEndTime = (selectedTV.timerEndTime || Date.now()) + extendMenit * 60 * 1000;
      }
      updates.paketAktif = `${paketNm} (+${extendMenit}m)`;
      updates.paketHarga = (selectedTV.paketHarga || 0) + paketHarga;
      if (pesananTotal > 0) {
        if (selectedTV.bebas) {
          updates.bebasPesananTotal = (selectedTV.bebasPesananTotal || 0) + pesananTotal;
        } else {
          updates.totalPesanan = (selectedTV.totalPesanan || 0) + pesananTotal;
        }
        const existingItems = selectedTV.pesananItems || {};
        const mergedItems = { ...existingItems };
        Object.entries(pesanan).forEach(([nama, qty]) => {
          mergedItems[nama] = (mergedItems[nama] || 0) + qty;
        });
        updates.pesananItems = mergedItems;
      }
      await updateTV(selectedTV.id, updates);
      await catat({
        waktu:   new Date().toISOString(),
        kasir:   currentUser,
        kota:    selectedTV.nama,
        paket:   `Perpanjang ${paketNm}`,
        pesanan: pesanan,
        total:   total,
      });
      const totalPaket = updates.paketHarga || 0;
      const totalBebas = (updates.bebasPesananTotal || 0) + Math.ceil(((Date.now() - (selectedTV.bebasMulai || Date.now())) / 3600000) * (selectedTV.bebasHargaPerJam || 10000));
      const grandTotal = selectedTV.bebas ? totalBebas : totalPaket;
      sendTvCommand(selectedTV.nama, 'SYNC_TIMER', {
        sisaDetik: updates.sisaDetik || 0,
        totalTagihan: grandTotal,
        lunasTotal: isLunas ? grandTotal : 0,
        tagihanTotal: isLunas ? 0 : grandTotal,
      });
      setShowPaket(false);
      setSelectedTV(null);
      return;
    }

    // Mode tambah pesanan (timer sudah berjalan)
    if (!paketNm) {
      await catat({
        waktu:   new Date().toISOString(),
        kasir:   currentUser,
        kota:    selectedTV.nama,
        paket:   'Pesanan Tambahan',
        pesanan: pesanan,
        total:   total,
      });
      const updates = {};
      const existingItems = selectedTV.pesananItems || {};
      const mergedItems = { ...existingItems };
      Object.entries(pesanan).forEach(([nama, qty]) => {
        mergedItems[nama] = (mergedItems[nama] || 0) + qty;
      });
      updates.pesananItems = mergedItems;
      if (selectedTV.bebas) {
        updates.bebasPesananTotal = (selectedTV.bebasPesananTotal || 0) + total;
      } else {
        updates.totalPesanan = (selectedTV.totalPesanan || 0) + total;
      }
      await updateTV(selectedTV.id, updates);
      // Hitung total terbaru & kirim UPDATE_TOTAL ke TV
      const newBebasTotal = selectedTV.bebas
        ? (selectedTV.bebasPesananTotal || 0) + total + Math.ceil(((Date.now() - (selectedTV.bebasMulai || Date.now())) / 3600000) * (selectedTV.bebasHargaPerJam || 10000))
        : 0;
      const newRegTotal = !selectedTV.bebas
        ? (selectedTV.paketHarga || 0) + (selectedTV.totalPesanan || 0) + total
        : 0;
      const grandTotal = selectedTV.bebas ? newBebasTotal : newRegTotal;
      sendTvCommand(selectedTV.nama, 'UPDATE_TOTAL', {
        totalTagihan: grandTotal,
        lunasTotal: selectedTV.paid ? grandTotal : 0,
        tagihanTotal: selectedTV.paid ? 0 : grandTotal,
      });
      setShowPaket(false);
      setSelectedTV(null);
      return;
    }

    // Mode mulai sesi baru
    const isBebas = paketNm === 'Main Bebas';
    const menit = (durasi?.jam || 0) * 60 + (durasi?.menit || 0);
    const durasiPaket = menit > 0 ? menit : 60;
    const pesananTotal = Math.max(0, total - paketHarga);

    // Main Bebas: sisaDetik=0 (tidak ada countdown), timerActive=true (agar running total jalan)
    const sisaDetik = isBebas ? 0 : durasiPaket * 60;
    const timerEndTime = isBebas ? 0 : Date.now() + sisaDetik * 1000;

    const updates = {
      paketAktif: isBebas ? 'Main Bebas' : `${paketNm}${menit > 0 ? ` (${durasiPaket}m)` : ''}`,
      sisaDetik,
      timerEndTime,
      timerActive: true,
      bebas: isBebas,
      paketHarga,
      totalPesanan: pesananTotal,
      pesananItems: pesananTotal > 0 ? pesanan : {},
      paid: !!isLunas,
    };
    if (isBebas) {
      const tierData = paketMain[selectedTV.jenisPs || 'PS3'] || paketMain.PS3;
      const hargaPerJam = tierData['1 Jam'] || 10000;
      updates.bebasMulai = Date.now();
      updates.bebasHargaPerJam = hargaPerJam;
      updates.bebasPesananTotal = pesananTotal;
    }
    await updateTV(selectedTV.id, updates);

    // Kirim ke TV
    sendTvCommand(selectedTV.nama, 'UNLOCK_SCREEN');
    sendTvCommand(selectedTV.nama, 'START_TIMER', {
      sisaDetik,
      namaRental,
      totalTagihan: isBebas ? 0 : paketHarga,
      lunasTotal: isLunas ? (isBebas ? 0 : paketHarga) : 0,
      tagihanTotal: isLunas ? 0 : (isBebas ? 0 : paketHarga),
    });

    await catat({
      waktu:   new Date().toISOString(),
      kasir:   currentUser,
      kota:    selectedTV.nama,
      paket:   paketNm,
      pesanan: pesanan,
      total:   total,
    });
    setShowPaket(false);
    setSelectedTV(null);
  };

  const onHapusTV = (tv) => {
    Alert.alert('Hapus TV', `Hapus "${tv.nama}"?`, [
      { text: 'Batal', style: 'cancel' },
      { text: 'Hapus', style: 'destructive', onPress: () => hapusTV(tv.id) },
    ]);
  };

  // ─── Silent auto-sync jaringan (tanpa UI output) ─────────────────────────
  const syncNetwork = useCallback(async () => {
    const localIP = await ADBHelper.getLocalIP();
    if (!localIP) return;
    const existingMap = new Map(tvList.map(t => [t.ip, t]));
    const newlyFound = [];
    await ADBHelper.scanNetwork(localIP, undefined, (ip, port) => {
      if (newlyFound.some(f => f.ip === ip)) return;
      newlyFound.push({ ip, port });
    });
    for (const { ip, port } of newlyFound) {
      const known = existingMap.get(ip);
      if (known) {
        if (known.port !== port) {
          await updateTV(known.id, { port });
        }
      } else {
        const result = await ADBHelper.connect(ip, port);
        if (result.sukses) {
          const idx = tvList.length + 1;
          await onTambahTV({ nama: `TV ${idx} (${port})`, ip, port });
        }
      }
    }
  }, [tvList]);

  // Auto-sync on mount (silent)
  const syncRef = useRef(syncNetwork);
  syncRef.current = syncNetwork;
  useEffect(() => { const t = setTimeout(() => syncRef.current(), 1200); return () => clearTimeout(t); }, []);

  const bgSource = isLandscape
    ? (bgImageLandscape ? { uri: bgImageLandscape } : undefined)
    : (bgImagePortrait ? { uri: bgImagePortrait } : undefined);

  return (
    <ImageBackground
      source={bgSource}
      style={s.root}
      resizeMode="cover"
    >
      {/* Header */}
      <View style={[s.hdr, { paddingTop: insets.top + 8 }]}>
        <Text style={s.hdrTitle}>{namaRental}</Text>
        <Text style={s.hdrSub}>TV: {tvList.length}</Text>
        <TouchableOpacity style={s.btnAdd} onPress={() => setShowTambah(true)}>
          <Icon name="plus" size={18} color="white" />
          <Text style={s.btnAddTxt}>Tambah TV</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.btnMenu} onPress={() => setShowBillingTV(true)}>
          <Icon name="cog" size={20} color={C.TEXT} />
        </TouchableOpacity>
      </View>

      {/* Modal Pengaturan BillingTV */}

      {/* TV List */}
      {tvList.length === 0 ? (
        <View style={s.empty}>
          <Icon name="television-off" size={64} color={C.MUTED} />
          <Text style={s.emptyTxt}>Belum ada TV</Text>
          <Text style={s.emptyHint}>Tap "Tambah TV" atau menu (⋯)</Text>
        </View>
      ) : isLandscape ? (
        <ScrollView contentContainerStyle={s.gridLandscape}>
          {tvList.map(item => (
            <View key={item.id} style={s.gridItem}>
              <TVCard
                tv={item}
                onPilihPaket={() => onPilihPaket(item)}
                onHapus={() => onHapusTV(item)}
                onUpdateTV={(updates) => updateTV(item.id, updates)}
                menuMakanan={menuMakanan}
                menuMinuman={menuMinuman}
                cardOpacity={cardOpacity}
              />
            </View>
          ))}
        </ScrollView>
      ) : (
        <FlatList
          data={tvList}
          keyExtractor={item => item.id}
          renderItem={({ item }) => (
            <TVCard
              tv={item}
              onPilihPaket={() => onPilihPaket(item)}
              onHapus={() => onHapusTV(item)}
              onUpdateTV={(updates) => updateTV(item.id, updates)}
              menuMakanan={menuMakanan}
              menuMinuman={menuMinuman}
              cardOpacity={cardOpacity}
            />
          )}
          contentContainerStyle={s.list}
        />
      )}

      {/* Modal Tambah TV */}
      <ModalTambahTV
        visible={showTambah}
        onClose={() => setShowTambah(false)}
        onConfirm={onTambahTV}
        nomorTV={tvList.length + 1}
      />

      {/* Modal Pilih Paket — paketData per jenis PS */}
      {selectedTV && (
        <ModalPaket
          visible={showPaket}
          tvLabel={selectedTV?.nama}
          onClose={() => { setShowPaket(false); setSelectedTV(null); }}
          onConfirm={onPaketConfirm}
          paketData={paketMain[selectedTV?.jenisPs || 'PS3'] || paketMain.PS3}
          paketDurasi={paketDurasi}
          makananData={menuMakanan}
          minumanData={menuMinuman}
          hidePaket={selectedTV?.timerActive || selectedTV?.bebas || false}
        />
      )}

      {/* Modal Pengaturan BillingTV */}
      <ModalBillingTV visible={showBillingTV} onClose={() => setShowBillingTV(false)} />
    </ImageBackground>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.BG },
  hdr: {
    backgroundColor: C.PANEL,
    flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap',
    paddingHorizontal: 12, paddingVertical: 10,
    paddingTop: 16, gap: 6,
  },
  hdrTitle: { ...FONTS.title, color: C.ACCENT, fontSize: 14, minWidth: 120 },
  hdrSub:   { ...FONTS.small, color: C.MUTED },
  btnAdd: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: C.ACCENT2, borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 8,
  },
  btnAddTxt: { color: 'white', ...FONTS.sub, fontSize: 12 },
  btnMenu: {
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: C.CARD, borderRadius: 10,
    paddingHorizontal: 8, paddingVertical: 8,
    borderWidth: 1, borderColor: C.BORDER,
  },
  list: { padding: 12, gap: 12 },
  gridLandscape: { flexDirection: 'row', flexWrap: 'wrap', padding: 12, gap: 12 },
  gridItem: { width: '31%' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  emptyTxt:  { ...FONTS.sub, color: C.MUTED, fontSize: 16 },
  emptyHint: { ...FONTS.small, color: C.MUTED },
});
