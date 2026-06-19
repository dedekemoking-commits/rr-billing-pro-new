import React, { useState } from 'react';
import {
  Modal, View, Text, TouchableOpacity, ScrollView, StyleSheet,
} from 'react-native';
import { MaterialCommunityIcons as Icon } from '@expo/vector-icons';
import { C, FONTS, fmtRp } from '../utils/theme';

export default function ModalPaket({ visible, tvLabel, onClose, onConfirm, paketData, makananData, minumanData }) {
  const [selectedPaket, setSelectedPaket] = useState(Object.keys(paketData)[0]);
  const [qty, setQty] = useState({});

  const allMenu = { ...makananData, ...minumanData };

  const getQty = (nama) => qty[nama] || 0;
  const setQtyItem = (nama, val) => setQty(prev => ({ ...prev, [nama]: Math.max(0, val) }));

  const paketHarga = paketData[selectedPaket] || 0;
  const pesananTotal = Object.entries(qty).reduce((sum, [nm, q]) => sum + (allMenu[nm] || 0) * q, 0);
  const total = paketHarga + pesananTotal;
  const isBebas = selectedPaket === 'Main Bebas';

  const handleConfirm = () => {
    const pesanan = Object.fromEntries(Object.entries(qty).filter(([,q]) => q > 0));
    onConfirm(selectedPaket, paketHarga, pesanan, total);
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={s.overlay}>
        <View style={s.container}>
          {/* Header */}
          <View style={s.hdr}>
            <Text style={s.title}>📦 {tvLabel}</Text>
            <TouchableOpacity onPress={onClose}>
              <Icon name="close" size={22} color={C.MUTED} />
            </TouchableOpacity>
          </View>

          {/* Total */}
          <View style={s.totalBar}>
            <Text style={s.totalTxt}>
              {isBebas ? 'Paket: Main Bebas (manual)' : `Total: ${fmtRp(total)}`}
            </Text>
          </View>

          <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
            {/* Paket Waktu */}
            <Text style={s.secTitle}>⏱ PAKET WAKTU</Text>
            <View style={s.quickRow}>
              {['Main Bebas', 'Reguler'].map(nm => (
                <TouchableOpacity
                  key={nm}
                  style={[s.quickBtn, selectedPaket === nm && s.quickBtnActive]}
                  onPress={() => setSelectedPaket(nm)}
                >
                  <Text style={[s.quickBtnTxt, selectedPaket === nm && { color: 'white' }]}>⚡ {nm}</Text>
                </TouchableOpacity>
              ))}
            </View>
            {Object.entries(paketData).map(([nama, harga]) => (
              <TouchableOpacity
                key={nama}
                style={[s.paketRow, selectedPaket === nama && s.paketRowActive]}
                onPress={() => setSelectedPaket(nama)}
              >
                <View style={[s.radio, selectedPaket === nama && s.radioActive]}>
                  {selectedPaket === nama && <View style={s.radioDot} />}
                </View>
                <Text style={[s.paketNama, selectedPaket === nama && { color: C.ACCENT }]}>{nama}</Text>
                <Text style={s.paketHarga}>
                  {harga === 0 ? 'Sesuai Durasi' : fmtRp(harga)}
                </Text>
              </TouchableOpacity>
            ))}

            {/* Makanan */}
            <Text style={s.secTitle}>🍔 MAKANAN</Text>
            {Object.entries(makananData).map(([nama, harga]) => (
              <MenuRow key={nama} nama={nama} harga={harga} qty={getQty(nama)} onQty={v => setQtyItem(nama, v)} />
            ))}

            {/* Minuman */}
            <Text style={s.secTitle}>🥤 MINUMAN</Text>
            {Object.entries(minumanData).map(([nama, harga]) => (
              <MenuRow key={nama} nama={nama} harga={harga} qty={getQty(nama)} onQty={v => setQtyItem(nama, v)} />
            ))}

            <View style={{ height: 20 }} />
          </ScrollView>

          {/* Footer */}
          <View style={s.footer}>
            <TouchableOpacity style={s.btnBatal} onPress={onClose}>
              <Text style={s.btnBatalTxt}>✖ Batal</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.btnOk} onPress={handleConfirm}>
              <Text style={s.btnOkTxt}>✅ Konfirmasi</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function MenuRow({ nama, harga, qty, onQty }) {
  return (
    <View style={ms.row}>
      <View style={{ flex: 1 }}>
        <Text style={ms.nama}>{nama}</Text>
        <Text style={ms.harga}>{fmtRp(harga)}</Text>
      </View>
      <View style={ms.qtyRow}>
        <TouchableOpacity style={ms.qtyBtn} onPress={() => onQty(qty - 1)}>
          <Text style={ms.qtyBtnTxt}>−</Text>
        </TouchableOpacity>
        <Text style={ms.qtyVal}>{qty}</Text>
        <TouchableOpacity style={[ms.qtyBtn, { borderColor: C.GREEN }]} onPress={() => onQty(qty + 1)}>
          <Text style={[ms.qtyBtnTxt, { color: C.GREEN }]}>+</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'flex-end' },
  container: {
    backgroundColor: C.PANEL, borderTopLeftRadius: 22, borderTopRightRadius: 22,
    height: '92%', padding: 16,
  },
  hdr: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  title: { ...FONTS.title, color: C.ACCENT, fontSize: 15 },
  totalBar: {
    backgroundColor: C.CARD, borderRadius: 10, padding: 10,
    alignItems: 'center', marginBottom: 10,
    borderWidth: 1, borderColor: C.YELLOW,
  },
  totalTxt: { ...FONTS.sub, color: C.YELLOW, fontSize: 16 },
  secTitle: { ...FONTS.sub, color: C.ACCENT2, marginVertical: 10 },
  quickRow: { flexDirection: 'row', gap: 10, marginBottom: 8 },
  quickBtn: {
    borderWidth: 1, borderColor: C.GREEN, borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 7, backgroundColor: C.BTN,
  },
  quickBtnActive: { backgroundColor: C.GREEN },
  quickBtnTxt: { ...FONTS.small, color: C.GREEN },
  paketRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 10, paddingHorizontal: 8,
    borderBottomWidth: 0.5, borderBottomColor: C.BORDER,
  },
  paketRowActive: { backgroundColor: `${C.ACCENT2}22` },
  radio: {
    width: 18, height: 18, borderRadius: 9,
    borderWidth: 2, borderColor: C.MUTED,
    alignItems: 'center', justifyContent: 'center',
  },
  radioActive: { borderColor: C.ACCENT },
  radioDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: C.ACCENT },
  paketNama: { ...FONTS.label, color: C.TEXT, flex: 1 },
  paketHarga: { ...FONTS.small, color: C.MUTED },
  footer: { flexDirection: 'row', gap: 10, paddingTop: 12 },
  btnBatal: {
    flex: 1, paddingVertical: 13, borderRadius: 12,
    backgroundColor: C.RED, alignItems: 'center',
  },
  btnBatalTxt: { color: 'white', ...FONTS.sub },
  btnOk: {
    flex: 2, paddingVertical: 13, borderRadius: 12,
    backgroundColor: C.ACCENT2, alignItems: 'center',
  },
  btnOkTxt: { color: 'white', ...FONTS.sub },
});

const ms = StyleSheet.create({
  row: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 10, borderBottomWidth: 0.5, borderBottomColor: C.BORDER,
  },
  nama:  { ...FONTS.label, color: C.TEXT },
  harga: { ...FONTS.small, color: C.MUTED },
  qtyRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  qtyBtn: {
    width: 28, height: 28, borderRadius: 6,
    borderWidth: 1, borderColor: C.RED,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: C.BTN,
  },
  qtyBtnTxt: { color: C.RED, fontSize: 16, fontWeight: 'bold' },
  qtyVal: { ...FONTS.sub, color: C.ACCENT, minWidth: 24, textAlign: 'center' },
});
