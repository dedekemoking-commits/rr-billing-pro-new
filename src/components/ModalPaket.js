import React, { useState, useEffect } from 'react';
import {
  Modal, View, Text, TouchableOpacity, ScrollView, StyleSheet, TextInput, useWindowDimensions,
} from 'react-native';
import { MaterialCommunityIcons as Icon } from '@expo/vector-icons';
import { C, FONTS, fmtRp } from '../utils/theme';

export default function ModalPaket({ visible, tvLabel, onClose, onConfirm, paketData, paketDurasi, makananData, minumanData, hidePaket }) {
  const { height: screenH, width: screenW } = useWindowDimensions();
  const isLandscape = screenW > screenH;
  const [selectedPaket, setSelectedPaket] = useState(Object.keys(paketData)[0]);
  const [qty, setQty] = useState({});

  const [jam, setJam] = useState('0');
  const [menit, setMenit] = useState('30');

  // State untuk perpanjangan waktu saat sesi berjalan
  const [extendPaket, setExtendPaket] = useState(null);
  const [extendJam, setExtendJam] = useState('0');
  const [extendMenit, setExtendMenit] = useState('30');

  // Status LUNAS / TAGIHAN
  const [isLunas, setIsLunas] = useState(false);

  useEffect(() => {
    const m = paketDurasi?.[selectedPaket] || 60;
    setJam(String(Math.floor(m / 60)));
    setMenit(String(m % 60));
  }, [selectedPaket, paketDurasi]);

  const allMenu = { ...makananData, ...minumanData };

  const getQty = (nama) => qty[nama] || 0;
  const setQtyItem = (nama, val) => setQty(prev => ({ ...prev, [nama]: Math.max(0, val) }));

  const paketHarga = paketData[selectedPaket] || 0;
  const pesananTotal = Object.entries(qty).reduce((sum, [nm, q]) => sum + (allMenu[nm] || 0) * q, 0);
  const isBebas = selectedPaket === 'Main Bebas';

  const totalMenit = !hidePaket ? (parseInt(jam) || 0) * 60 + (parseInt(menit) || 0) : 0;

  // Hitung harga perpanjangan
  const extendTotalMenit = hidePaket ? ((parseInt(extendJam) || 0) * 60 + (parseInt(extendMenit) || 0)) : 0;
  const extendHargaPerJam = paketData['1 Jam'] || 0;
  const extendHarga = hidePaket && extendPaket
    ? (extendPaket === 'Main Bebas'
        ? Math.ceil((extendTotalMenit / 60) * extendHargaPerJam)
        : (paketData[extendPaket] || 0))
    : 0;

  const hargaPerJam = paketData['1 Jam'] || 0;
  const bebasHarga = 0;
  const total = bebasHarga + extendHarga + pesananTotal;

  const handleConfirm = () => {
    const pesanan = Object.fromEntries(Object.entries(qty).filter(([,q]) => q > 0));
    if (hidePaket) {
      if (extendPaket) {
        const durasi = { jam: parseInt(extendJam) || 0, menit: parseInt(extendMenit) || 0 };
        onConfirm(extendPaket, extendHarga, pesanan, total, durasi, true, isLunas);
      } else {
        onConfirm(null, 0, pesanan, pesananTotal, null, false, isLunas);
      }
    } else {
      onConfirm(selectedPaket, bebasHarga, pesanan, total, isBebas ? { jam: 0, menit: 0 } : { jam: parseInt(jam) || 0, menit: parseInt(menit) || 0 }, false, isLunas);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={s.overlay}>
        <View style={[s.container, { height: isLandscape ? '78%' : '92%' }]}>
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
              {hidePaket
                ? extendPaket
                  ? `Perpanjang: ${fmtRp(extendHarga)}${pesananTotal > 0 ? ` + Pesanan: ${fmtRp(pesananTotal)}` : ''} = ${fmtRp(total)}`
                  : `Pesanan: ${fmtRp(total)}`
                : totalMenit > 0
                  ? `Total: ${fmtRp(total)}  •  ${totalMenit} menit${isBebas ? ` (langsung mulai)` : ''}`
                  : isBebas
                    ? `Total: ${fmtRp(pesananTotal)}${pesananTotal > 0 ? ' (pesanan)' : ' (mulai bebas)'}`
                    : `Total: ${fmtRp(total)}`
              }
            </Text>
          </View>

          <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
            {!hidePaket ? (<>
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

              {/* Custom Duration - sembunyikan untuk Main Bebas */}
              {!isBebas && (<>
                <Text style={s.secTitle}>⏱ ATUR DURASI MANUAL</Text>
                <View style={s.durasiRow}>
                  <TextInput
                    style={s.durasiInput}
                    value={jam}
                    onChangeText={setJam}
                    keyboardType="numeric"
                    placeholder="0"
                    placeholderTextColor={C.MUTED}
                  />
                  <Text style={s.durasiLabel}>Jam</Text>
                  <TextInput
                    style={s.durasiInput}
                    value={menit}
                    onChangeText={setMenit}
                    keyboardType="numeric"
                    placeholder="30"
                    placeholderTextColor={C.MUTED}
                  />
                  <Text style={s.durasiLabel}>Menit</Text>
                  <Text style={s.durasiTotal}>
                    = {totalMenit > 0 ? `${totalMenit} menit` : '—'}
                  </Text>
                </View>
              </>)}
              {isBebas && (
                <View style={s.durasiRow}>
                  <Text style={[s.durasiTotal, { textAlign: 'center', flex: 1 }]}>
                    Harga mengikuti waktu berjalan (paket 1 Jam)
                  </Text>
                </View>
              )}
            </>            ) : (<>
              {/* ── TAMBAH WAKTU (saat sesi berjalan) ── */}
              <Text style={s.secTitle}>⏱ TAMBAH WAKTU</Text>
              <View style={s.quickRow}>
                {Object.entries(paketData).filter(([nama]) => nama !== 'Main Bebas' && nama !== 'Reguler').slice(0, 4).map(([nama]) => (
                  <TouchableOpacity
                    key={nama}
                    style={[s.quickBtn, extendPaket === nama && s.quickBtnActive]}
                    onPress={() => {
                      if (extendPaket === nama) {
                        setExtendPaket(null);
                      } else {
                        setExtendPaket(nama);
                        const m = paketDurasi?.[nama] || 60;
                        setExtendJam(String(Math.floor(m / 60)));
                        setExtendMenit(String(m % 60));
                      }
                    }}
                  >
                    <Text style={[s.quickBtnTxt, extendPaket === nama && { color: 'white' }]}>⏱ {nama}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              {extendPaket && extendPaket !== 'Main Bebas' && (
                <View style={s.durasiRow}>
                  <Text style={s.durasiTotal}>
                    +{paketDurasi?.[extendPaket] || 60} menit = {fmtRp(paketData[extendPaket] || 0)}
                  </Text>
                </View>
              )}
              {extendPaket === 'Main Bebas' && (
                <View style={s.durasiRow}>
                  <TextInput
                    style={s.durasiInput}
                    value={extendJam}
                    onChangeText={setExtendJam}
                    keyboardType="numeric"
                    placeholder="0"
                    placeholderTextColor={C.MUTED}
                  />
                  <Text style={s.durasiLabel}>Jam</Text>
                  <TextInput
                    style={s.durasiInput}
                    value={extendMenit}
                    onChangeText={setExtendMenit}
                    keyboardType="numeric"
                    placeholder="30"
                    placeholderTextColor={C.MUTED}
                  />
                  <Text style={s.durasiLabel}>Menit</Text>
                  <Text style={s.durasiTotal}>
                    = {extendTotalMenit > 0 ? `${fmtRp(extendHarga)}` : '—'}
                  </Text>
                </View>
              )}
              <Text style={s.tambahPesananTxt}>🍽 TAMBAH PESANAN</Text>
            </>)}

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

          {/* LUNAS / TAGIHAN */}
          {!hidePaket && (
            <View style={lunasStyles.row}>
              <TouchableOpacity
                style={[lunasStyles.btn, !isLunas && lunasStyles.btnActiveTagihan]}
                onPress={() => setIsLunas(false)}
              >
                <Text style={[lunasStyles.btnTxt, !isLunas && lunasStyles.btnTxtActive]}>
                  📋 TAGIHAN
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[lunasStyles.btn, isLunas && lunasStyles.btnActiveLunas]}
                onPress={() => setIsLunas(true)}
              >
                <Text style={[lunasStyles.btnTxt, isLunas && lunasStyles.btnTxtActive]}>
                  ✅ LUNAS
                </Text>
              </TouchableOpacity>
            </View>
          )}

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
  tambahPesananTxt: { ...FONTS.sub, color: C.YELLOW, fontSize: 14, textAlign: 'center', marginVertical: 10 },
  durasiRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: C.CARD, borderRadius: 10, padding: 10,
    borderWidth: 1, borderColor: C.YELLOW, marginBottom: 10,
  },
  durasiInput: {
    backgroundColor: C.BTN, borderRadius: 8, borderWidth: 1, borderColor: C.BORDER,
    color: C.ACCENT, paddingHorizontal: 10, paddingVertical: 6,
    fontSize: 16, width: 60, textAlign: 'center', fontFamily: 'monospace',
  },
  durasiLabel: { ...FONTS.label, color: C.MUTED },
  durasiTotal: { ...FONTS.sub, color: C.YELLOW, flex: 1, textAlign: 'right' },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'flex-end' },
  container: {
    backgroundColor: C.PANEL, borderTopLeftRadius: 22, borderTopRightRadius: 22,
    padding: 16,
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

const lunasStyles = StyleSheet.create({
  row: {
    flexDirection: 'row', gap: 10, paddingHorizontal: 4, paddingBottom: 10,
  },
  btn: {
    flex: 1, paddingVertical: 10, borderRadius: 10,
    borderWidth: 1.5, borderColor: C.BORDER, backgroundColor: C.BTN,
    alignItems: 'center',
  },
  btnActiveLunas: {
    borderColor: C.GREEN, backgroundColor: `${C.GREEN}22`,
  },
  btnActiveTagihan: {
    borderColor: C.ORANGE, backgroundColor: `${C.ORANGE}22`,
  },
  btnTxt: { ...FONTS.sub, color: C.MUTED },
  btnTxtActive: { color: C.TEXT },
});
