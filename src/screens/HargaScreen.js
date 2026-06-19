import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  StyleSheet, Alert,
} from 'react-native';
import { MaterialCommunityIcons as Icon } from '@expo/vector-icons';
import { C, FONTS, fmtRp } from '../utils/theme';
import { useStore } from '../store/useStore';

export default function HargaScreen() {
  const paketMain   = useStore(s => s.paketMain);
  const menuMakanan = useStore(s => s.menuMakanan);
  const menuMinuman = useStore(s => s.menuMinuman);
  const saveHarga   = useStore(s => s.saveHarga);

  const [editPaket,   setEditPaket]   = useState({});
  const [editMakanan, setEditMakanan] = useState({});
  const [editMinuman, setEditMinuman] = useState({});

  useEffect(() => {
    setEditPaket(  Object.fromEntries(Object.entries(paketMain).map(([k,v]) => [k, String(v)])) );
    setEditMakanan(Object.fromEntries(Object.entries(menuMakanan).map(([k,v]) => [k, String(v)])));
    setEditMinuman(Object.fromEntries(Object.entries(menuMinuman).map(([k,v]) => [k, String(v)])));
  }, [paketMain, menuMakanan, menuMinuman]);

  const simpan = async () => {
    const toObj = (editMap) =>
      Object.fromEntries(
        Object.entries(editMap)
          .filter(([k]) => k.trim())
          .map(([k, v]) => [k.trim(), parseInt(v) || 0])
      );
    await saveHarga(toObj(editPaket), toObj(editMakanan), toObj(editMinuman));
    Alert.alert('✅ Tersimpan', 'Data harga berhasil disimpan!');
  };

  const hapusItem = (map, setMap, key) => {
    Alert.alert('Hapus Item', `Hapus "${key}"?`, [
      { text: 'Batal', style: 'cancel' },
      { text: 'Hapus', style: 'destructive', onPress: () => {
        const updated = { ...map };
        delete updated[key];
        setMap(updated);
      }},
    ]);
  };

  const tambahItem = (map, setMap) => {
    const newKey = `Item Baru ${Object.keys(map).length + 1}`;
    setMap({ ...map, [newKey]: '0' });
  };

  return (
    <View style={s.root}>
      {/* Header */}
      <View style={s.hdr}>
        <Text style={s.hdrTitle}>⚙️ KONTROL HARGA</Text>
        <TouchableOpacity style={s.btnSimpan} onPress={simpan}>
          <Icon name="content-save" size={16} color={C.GREEN} />
          <Text style={s.btnSimpanTxt}>Simpan</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={s.scroll}>
        <HargaSection
          judul="⏱ Paket Waktu Main"
          editMap={editPaket}
          onChangeNama={(lama, baru) => {
            const cp = { ...editPaket };
            cp[baru] = cp[lama]; delete cp[lama];
            setEditPaket(cp);
          }}
          onChangeHarga={(k, v) => setEditPaket({ ...editPaket, [k]: v })}
          onHapus={(k) => hapusItem(editPaket, setEditPaket, k)}
          onTambah={() => tambahItem(editPaket, setEditPaket)}
        />
        <HargaSection
          judul="🍔 Menu Makanan"
          editMap={editMakanan}
          onChangeNama={(lama, baru) => {
            const cp = { ...editMakanan };
            cp[baru] = cp[lama]; delete cp[lama];
            setEditMakanan(cp);
          }}
          onChangeHarga={(k, v) => setEditMakanan({ ...editMakanan, [k]: v })}
          onHapus={(k) => hapusItem(editMakanan, setEditMakanan, k)}
          onTambah={() => tambahItem(editMakanan, setEditMakanan)}
        />
        <HargaSection
          judul="🥤 Menu Minuman"
          editMap={editMinuman}
          onChangeNama={(lama, baru) => {
            const cp = { ...editMinuman };
            cp[baru] = cp[lama]; delete cp[lama];
            setEditMinuman(cp);
          }}
          onChangeHarga={(k, v) => setEditMinuman({ ...editMinuman, [k]: v })}
          onHapus={(k) => hapusItem(editMinuman, setEditMinuman, k)}
          onTambah={() => tambahItem(editMinuman, setEditMinuman)}
        />
        <View style={{ height: 30 }} />
      </ScrollView>
    </View>
  );
}

function HargaSection({ judul, editMap, onChangeNama, onChangeHarga, onHapus, onTambah }) {
  return (
    <View style={hs.card}>
      <View style={hs.hdr}>
        <Text style={hs.judul}>{judul}</Text>
        <TouchableOpacity style={hs.btnAdd} onPress={onTambah}>
          <Icon name="plus" size={14} color={C.GREEN} />
          <Text style={hs.btnAddTxt}>Tambah</Text>
        </TouchableOpacity>
      </View>
      {Object.entries(editMap).map(([nama, harga]) => (
        <View key={nama} style={hs.row}>
          <TextInput
            style={[hs.input, { flex: 2 }]}
            value={nama}
            onChangeText={(v) => onChangeNama(nama, v)}
            placeholder="Nama item"
            placeholderTextColor={C.MUTED}
          />
          <TextInput
            style={[hs.input, { flex: 1 }]}
            value={harga}
            onChangeText={(v) => onChangeHarga(nama, v)}
            keyboardType="numeric"
            placeholder="Harga"
            placeholderTextColor={C.MUTED}
          />
          <Text style={hs.rp}>Rp</Text>
          <TouchableOpacity onPress={() => onHapus(nama)} style={hs.delBtn}>
            <Icon name="trash-can-outline" size={18} color={C.RED} />
          </TouchableOpacity>
        </View>
      ))}
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
  btnSimpan: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    borderWidth: 1, borderColor: C.GREEN, borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 7,
    backgroundColor: '#1A3A1A',
  },
  btnSimpanTxt: { color: C.GREEN, ...FONTS.sub },
  scroll: { padding: 12, gap: 12 },
});

const hs = StyleSheet.create({
  card: {
    backgroundColor: C.PANEL, borderRadius: 14,
    borderWidth: 1, borderColor: C.BORDER, padding: 14,
  },
  hdr: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', marginBottom: 12,
  },
  judul: { ...FONTS.sub, color: C.ACCENT2 },
  btnAdd: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    borderWidth: 1, borderColor: C.GREEN, borderRadius: 6,
    paddingHorizontal: 8, paddingVertical: 4, backgroundColor: '#1A3A1A',
  },
  btnAddTxt: { color: C.GREEN, ...FONTS.small },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  input: {
    backgroundColor: C.BTN, borderRadius: 8, borderWidth: 1, borderColor: C.BORDER,
    color: C.TEXT, ...FONTS.small, paddingHorizontal: 10, paddingVertical: 8,
    fontSize: 12,
  },
  rp:     { ...FONTS.small, color: C.MUTED },
  delBtn: { padding: 6 },
});
