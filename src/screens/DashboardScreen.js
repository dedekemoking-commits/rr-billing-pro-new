import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  Alert, Modal, TextInput, FlatList, ActivityIndicator,
} from 'react-native';
import { MaterialCommunityIcons as Icon } from '@expo/vector-icons';
import { C, FONTS, fmtRp, MENIT_MAP } from '../utils/theme';
import { useStore } from '../store/useStore';
import { ADBHelper } from '../utils/adbHelper';
import TVCard from '../components/TVCard';
import ModalTambahTV from '../components/ModalTambahTV';
import ModalPaket from '../components/ModalPaket';

export default function DashboardScreen({ navigation }) {
  const tvList        = useStore(s => s.tvList);
  const tambahTV      = useStore(s => s.tambahTV);
  const hapusTV       = useStore(s => s.hapusTV);
  const updateTV      = useStore(s => s.updateTV);
  const catat         = useStore(s => s.tambahTransaksi);
  const currentUser   = useStore(s => s.currentUser);
  const paketMain     = useStore(s => s.paketMain);
  const menuMakanan   = useStore(s => s.menuMakanan);
  const menuMinuman   = useStore(s => s.menuMinuman);

  const [showTambah,  setShowTambah]  = useState(false);
  const [showPaket,   setShowPaket]   = useState(false);
  const [selectedTV,  setSelectedTV]  = useState(null);

  const onTambahTV = async (tvData) => {
    const id = `tv_${Date.now()}`;
    await tambahTV({ ...tvData, id });
  };

  const onPilihPaket = (tv) => {
    setSelectedTV(tv);
    setShowPaket(true);
  };

  const onPaketConfirm = async (paketNm, paketHarga, pesanan, total) => {
    if (!selectedTV) return;

    const menit = MENIT_MAP[paketNm] ?? 60;
    await updateTV(selectedTV.id, {
      paketAktif: paketNm,
      sisaDetik: menit * 60,
      timerActive: menit > 0,
      bebas: menit === 0,
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

  return (
    <View style={s.root}>
      {/* Header */}
      <View style={s.hdr}>
        <Text style={s.hdrTitle}>📺 DASHBOARD TV</Text>
        <Text style={s.hdrSub}>Total: {tvList.length} TV</Text>
        <TouchableOpacity style={s.btnAdd} onPress={() => setShowTambah(true)}>
          <Icon name="plus" size={18} color="white" />
          <Text style={s.btnAddTxt}>Tambah TV</Text>
        </TouchableOpacity>
      </View>

      {/* TV List */}
      {tvList.length === 0 ? (
        <View style={s.empty}>
          <Icon name="television-off" size={64} color={C.MUTED} />
          <Text style={s.emptyTxt}>Belum ada TV</Text>
          <Text style={s.emptyHint}>Tap "Tambah TV" untuk menambahkan</Text>
        </View>
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

      {/* Modal Pilih Paket */}
      {selectedTV && (
        <ModalPaket
          visible={showPaket}
          tvLabel={selectedTV?.nama}
          onClose={() => { setShowPaket(false); setSelectedTV(null); }}
          onConfirm={onPaketConfirm}
          paketData={paketMain}
          makananData={menuMakanan}
          minumanData={menuMinuman}
        />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.BG },
  hdr: {
    backgroundColor: C.PANEL,
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 12,
    paddingTop: 16, gap: 8,
  },
  hdrTitle: { ...FONTS.title, color: C.ACCENT, flex: 1, fontSize: 15 },
  hdrSub:   { ...FONTS.small, color: C.MUTED },
  btnAdd: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: C.ACCENT2, borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 8,
  },
  btnAddTxt: { color: 'white', ...FONTS.sub, fontSize: 12 },
  list: { padding: 12, gap: 12 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  emptyTxt:  { ...FONTS.sub, color: C.MUTED, fontSize: 16 },
  emptyHint: { ...FONTS.small, color: C.MUTED },
});
