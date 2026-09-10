import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  StyleSheet, Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons as Icon } from '@expo/vector-icons';
import { C, FONTS, JENIS_PS } from '../utils/theme';
import { useStore } from '../store/useStore';

export default function HargaScreen() {
  const insets      = useSafeAreaInsets();
  const paketMain   = useStore(s => s.paketMain);
  const paketDurasi = useStore(s => s.paketDurasi);
  const menuMakanan = useStore(s => s.menuMakanan);
  const menuMinuman = useStore(s => s.menuMinuman);
  const saveHarga   = useStore(s => s.saveHarga);

  const [editPaket,   setEditPaket]   = useState({});
  const [editDurasi,  setEditDurasi]  = useState({});
  const [editMakanan, setEditMakanan] = useState({});
  const [editMinuman, setEditMinuman] = useState({});

  useEffect(() => {
    const toStr = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, String(v)]));
    const nested = {};
    for (const t of JENIS_PS) {
      nested[t] = toStr(paketMain[t] || {});
    }
    setEditPaket(nested);
    setEditDurasi(Object.fromEntries(Object.entries(paketDurasi).map(([k, v]) => [k, String(v)])));
    setEditMakanan(toStr(menuMakanan));
    setEditMinuman(toStr(menuMinuman));
  }, [paketMain, paketDurasi, menuMakanan, menuMinuman]);

  const toObj = (editMap) =>
    Object.fromEntries(
      Object.entries(editMap)
        .filter(([k]) => k.trim())
        .map(([k, v]) => [k.trim(), parseInt(v) || 0])
    );

  const simpan = async () => {
    const paketSaved = {};
    for (const t of JENIS_PS) {
      paketSaved[t] = toObj(editPaket[t] || {});
    }
    await saveHarga(
      paketSaved, toObj(editDurasi),
      toObj(editMakanan), toObj(editMinuman)
    );
    Alert.alert('✅ Tersimpan', 'Data harga & durasi berhasil disimpan!');
  };

  const renameAll = (lama, baru) => {
    if (lama === baru || !baru.trim()) return;
    const cp = {};
    for (const t of JENIS_PS) {
      cp[t] = { ...editPaket[t] };
      cp[t][baru] = cp[t][lama];
      delete cp[t][lama];
    }
    setEditPaket(cp);
    const cd = { ...editDurasi };
    cd[baru] = cd[lama];
    delete cd[lama];
    setEditDurasi(cd);
  };

  const hapusRow = (nama) => {
    Alert.alert('Hapus Item', `Hapus "${nama}" dari semua PS?`, [
      { text: 'Batal', style: 'cancel' },
      { text: 'Hapus', style: 'destructive', onPress: () => {
        const cp = {};
        for (const t of JENIS_PS) {
          cp[t] = { ...editPaket[t] };
          delete cp[t][nama];
        }
        setEditPaket(cp);
        const cd = { ...editDurasi };
        delete cd[nama];
        setEditDurasi(cd);
      }},
    ]);
  };

  const tambahRow = () => {
    const key = `Item Baru ${Object.keys(editPaket.PS3 || {}).length + 1}`;
    const cp = {};
    for (const t of JENIS_PS) {
      cp[t] = { ...editPaket[t], [key]: '0' };
    }
    setEditPaket(cp);
    setEditDurasi({ ...editDurasi, [key]: '60' });
  };

  const allNames = JENIS_PS.flatMap(t => Object.keys(editPaket[t] || {}));
  const unikNames = [...new Set(allNames)];

  return (
    <View style={s.root}>
      <View style={[s.hdr, { paddingTop: insets.top + 8 }]}>
        <Text style={s.hdrTitle}>⚙️ KONTROL HARGA</Text>
        <TouchableOpacity style={s.btnSimpan} onPress={simpan}>
          <Icon name="content-save" size={16} color={C.GREEN} />
          <Text style={s.btnSimpanTxt}>Simpan</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={s.scroll}>
        {/* ─── Paket Waktu Main — 3 kolom PS3 / PS4 / PS5 ─── */}
        <View style={hs.card}>
          <View style={hs.hdr}>
            <Text style={hs.judul}>⏱ Paket Waktu Main</Text>
            <TouchableOpacity style={hs.btnAdd} onPress={tambahRow}>
              <Icon name="plus" size={14} color={C.GREEN} />
              <Text style={hs.btnAddTxt}>Tambah</Text>
            </TouchableOpacity>
          </View>

          {/* Header kolom */}
          <View style={hs.tierRow}>
            <Text style={[hs.cell, { flex: 2 }, hs.colHdr]}>Paket</Text>
            {JENIS_PS.map(t => (
              <Text key={t} style={[hs.cell, hs.colHdr, hs.colTier]}>{t}</Text>
            ))}
            <Text style={[hs.cell, { width: 44 }, hs.colHdr]}>Mnt</Text>
            <View style={{ width: 28 }} />
          </View>

          {unikNames.map((nama, idx) => (
            <View key={idx} style={hs.tierRow}>
              <TextInput
                style={[hs.input, { flex: 2 }]}
                value={nama}
                onChangeText={(v) => renameAll(nama, v)}
                placeholder="Nama paket"
                placeholderTextColor={C.MUTED}
              />
              {JENIS_PS.map(t => (
                <TextInput
                  key={t}
                  style={[hs.input, hs.colTier]}
                  value={editPaket[t]?.[nama] || '0'}
                  onChangeText={(v) => setEditPaket(prev => ({
                    ...prev,
                    [t]: { ...prev[t], [nama]: v }
                  }))}
                  keyboardType="numeric"
                />
              ))}
              <TextInput
                style={[hs.input, { width: 44 }]}
                value={editDurasi[nama] || '60'}
                onChangeText={(v) => setEditDurasi({ ...editDurasi, [nama]: v })}
                keyboardType="numeric"
              />
              <TouchableOpacity onPress={() => hapusRow(nama)} style={hs.delBtn}>
                <Icon name="trash-can-outline" size={18} color={C.RED} />
              </TouchableOpacity>
            </View>
          ))}
        </View>

        {/* ─── Menu Makanan ────────────────────────────────── */}
        <FlatSection
          judul="🍔 Menu Makanan"
          editMap={editMakanan}
          setMap={setEditMakanan}
        />

        {/* ─── Menu Minuman ────────────────────────────────── */}
        <FlatSection
          judul="🥤 Menu Minuman"
          editMap={editMinuman}
          setMap={setEditMinuman}
        />

        <View style={{ height: 30 }} />
      </ScrollView>
    </View>
  );
}

function FlatSection({ judul, editMap, setMap }) {
  const entries = Object.entries(editMap);
  return (
    <View style={hs.card}>
      <View style={hs.hdr}>
        <Text style={hs.judul}>{judul}</Text>
        <TouchableOpacity style={hs.btnAdd} onPress={() => {
          const k = `Item Baru ${entries.length + 1}`;
          setMap({ ...editMap, [k]: '0' });
        }}>
          <Icon name="plus" size={14} color={C.GREEN} />
          <Text style={hs.btnAddTxt}>Tambah</Text>
        </TouchableOpacity>
      </View>
      {entries.map(([nama, harga], idx) => (
        <View key={idx} style={hs.row}>
          <TextInput
            style={[hs.input, { flex: 2 }]}
            value={nama}
            onChangeText={(v) => {
              const cp = { ...editMap };
              cp[v] = cp[nama];
              delete cp[nama];
              setMap(cp);
            }}
            placeholder="Nama item"
            placeholderTextColor={C.MUTED}
          />
          <TextInput
            style={[hs.input, { flex: 1 }]}
            value={harga}
            onChangeText={(v) => setMap({ ...editMap, [nama]: v })}
            keyboardType="numeric"
            placeholder="Harga"
            placeholderTextColor={C.MUTED}
          />
          <Text style={hs.rp}>Rp</Text>
          <TouchableOpacity onPress={() => {
            Alert.alert('Hapus Item', `Hapus "${nama}"?`, [
              { text: 'Batal', style: 'cancel' },
              { text: 'Hapus', style: 'destructive', onPress: () => {
                const cp = { ...editMap };
                delete cp[nama];
                setMap(cp);
              }},
            ]);
          }} style={hs.delBtn}>
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
  // Tiered layout (paket)
  tierRow: {
    flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 8,
  },
  cell: { ...FONTS.small, fontSize: 10, textAlign: 'center', color: C.MUTED },
  colHdr: { color: C.ACCENT, fontWeight: 'bold', marginBottom: 2 },
  colTier: { flex: 1 },
  // Flat layout (makanan/minuman)
  row: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  input: {
    backgroundColor: C.BTN, borderRadius: 8, borderWidth: 1, borderColor: C.BORDER,
    color: C.TEXT, ...FONTS.small, paddingHorizontal: 8, paddingVertical: 8,
    fontSize: 11,
  },
  rp: { ...FONTS.small, color: C.MUTED },
  delBtn: { padding: 5 },
});
