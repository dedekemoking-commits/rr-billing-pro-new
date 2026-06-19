import React, { useEffect, useState } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet, Alert,
} from 'react-native';
import { MaterialCommunityIcons as Icon } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { C, FONTS, fmtRp } from '../utils/theme';
import { useStore } from '../store/useStore';
import { format } from 'date-fns';
import { id as localeId } from 'date-fns/locale';

export default function RiwayatScreen() {
  const transaksiList   = useStore(s => s.transaksiList);
  const loadTransaksi   = useStore(s => s.loadTransaksi);
  const bersihkan       = useStore(s => s.bersihkanTransaksi);
  const currentUser     = useStore(s => s.currentUser);

  useEffect(() => { loadTransaksi(); }, []);

  const totalPendapatan = transaksiList.reduce((s, t) => s + (t.total || 0), 0);

  const formatWaktu = (iso) => {
    try {
      return format(new Date(iso), 'dd MMM HH:mm', { locale: localeId });
    } catch { return iso; }
  };

  const exportCSV = async () => {
    if (!transaksiList.length) {
      Alert.alert('Kosong', 'Belum ada transaksi.'); return;
    }

    const header = 'Waktu,Kasir,Kota/TV,Paket,Pesanan,Total\n';
    const rows   = transaksiList.map(t => {
      const pesananStr = Object.entries(t.pesanan || {})
        .map(([nm, q]) => `${nm}x${q}`).join(' | ') || '-';
      return [
        t.waktu, t.kasir, t.kota, t.paket,
        `"${pesananStr}"`, fmtRp(t.total)
      ].join(',');
    }).join('\n');

    const tgl  = format(new Date(), 'yyyyMMdd_HHmmss');
    const path = FileSystem.documentDirectory + `laporan_rr_billing_${tgl}.csv`;

    await FileSystem.writeAsStringAsync(path, header + rows, {
      encoding: FileSystem.EncodingType.UTF8,
    });

    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(path, { mimeType: 'text/csv', dialogTitle: 'Export Laporan Transaksi' });
    } else {
      Alert.alert('✅ Tersimpan', `File: ${path}`);
    }
  };

  const konfirmasiHapus = () => {
    Alert.alert('Hapus Semua Riwayat', 'Yakin menghapus semua data transaksi?', [
      { text: 'Batal', style: 'cancel' },
      { text: 'Hapus', style: 'destructive', onPress: bersihkan },
    ]);
  };

  const renderItem = ({ item, index }) => {
    const pesananStr = Object.entries(item.pesanan || {})
      .map(([nm, q]) => `${nm}×${q}`).join(', ') || '—';
    return (
      <View style={[s.row, index % 2 === 0 && { backgroundColor: C.CARD }]}>
        <View style={s.rowLeft}>
          <Text style={s.waktu}>{formatWaktu(item.waktu)}</Text>
          <Text style={s.kota}>{item.kota}</Text>
          <Text style={s.paket}>{item.paket}</Text>
          {pesananStr !== '—' && (
            <Text style={s.pesanan}>{pesananStr}</Text>
          )}
        </View>
        <View style={s.rowRight}>
          <Text style={s.total}>{fmtRp(item.total)}</Text>
          <Text style={s.kasir}>{item.kasir}</Text>
        </View>
      </View>
    );
  };

  return (
    <View style={s.root}>
      {/* Header */}
      <View style={s.hdr}>
        <Text style={s.hdrTitle}>📊 RIWAYAT TRANSAKSI</Text>
      </View>

      {/* Rekap */}
      <View style={s.rekap}>
        <View style={s.rekapCard}>
          <Text style={s.rekapLabel}>Transaksi</Text>
          <Text style={s.rekapVal}>{transaksiList.length}</Text>
        </View>
        <View style={s.rekapCard}>
          <Text style={s.rekapLabel}>Total Pendapatan</Text>
          <Text style={[s.rekapVal, { color: C.GREEN }]}>{fmtRp(totalPendapatan)}</Text>
        </View>
      </View>

      {/* Actions */}
      <View style={s.actRow}>
        <TouchableOpacity style={s.btnExport} onPress={exportCSV}>
          <Icon name="file-export" size={16} color={C.GREEN} />
          <Text style={s.btnExportTxt}>Export CSV</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.btnHapus} onPress={konfirmasiHapus}>
          <Icon name="trash-can" size={16} color={C.RED} />
          <Text style={s.btnHapusTxt}>Bersihkan</Text>
        </TouchableOpacity>
      </View>

      {/* Tabel Header */}
      <View style={s.tableHdr}>
        <Text style={[s.thCell, { flex: 2 }]}>WAKTU / TV</Text>
        <Text style={[s.thCell, { flex: 1, textAlign: 'right' }]}>TOTAL</Text>
      </View>

      {/* List */}
      {transaksiList.length === 0 ? (
        <View style={s.empty}>
          <Icon name="clipboard-text-off" size={54} color={C.MUTED} />
          <Text style={s.emptyTxt}>Belum ada transaksi</Text>
        </View>
      ) : (
        <FlatList
          data={transaksiList}
          keyExtractor={(_, i) => String(i)}
          renderItem={renderItem}
        />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.BG },
  hdr: {
    backgroundColor: C.PANEL, paddingHorizontal: 16, paddingVertical: 14,
  },
  hdrTitle: { ...FONTS.title, color: C.ACCENT, fontSize: 15 },
  rekap: {
    flexDirection: 'row', gap: 10, padding: 12,
    backgroundColor: C.PANEL, borderBottomWidth: 1, borderBottomColor: C.BORDER,
  },
  rekapCard: {
    flex: 1, backgroundColor: C.CARD, borderRadius: 10, padding: 12,
    alignItems: 'center', borderWidth: 1, borderColor: C.BORDER,
  },
  rekapLabel: { ...FONTS.small, color: C.MUTED },
  rekapVal:   { ...FONTS.sub, color: C.YELLOW, fontSize: 16, marginTop: 4 },
  actRow: {
    flexDirection: 'row', gap: 10, padding: 12,
    borderBottomWidth: 1, borderBottomColor: C.BORDER,
  },
  btnExport: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    borderWidth: 1, borderColor: C.GREEN, borderRadius: 10, paddingVertical: 10,
    backgroundColor: '#1A3A1A',
  },
  btnExportTxt: { color: C.GREEN, ...FONTS.sub },
  btnHapus: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    borderWidth: 1, borderColor: C.RED, borderRadius: 10, paddingVertical: 10,
    backgroundColor: '#3A0000',
  },
  btnHapusTxt: { color: C.RED, ...FONTS.sub },
  tableHdr: {
    flexDirection: 'row', paddingHorizontal: 14, paddingVertical: 8,
    backgroundColor: C.PANEL, borderBottomWidth: 1, borderBottomColor: C.BORDER,
  },
  thCell: { ...FONTS.small, color: C.ACCENT, fontWeight: 'bold', letterSpacing: 0.5 },
  row: {
    flexDirection: 'row', paddingHorizontal: 14, paddingVertical: 10,
    borderBottomWidth: 0.5, borderBottomColor: C.BORDER,
  },
  rowLeft:  { flex: 2 },
  rowRight: { flex: 1, alignItems: 'flex-end', justifyContent: 'center' },
  waktu:   { ...FONTS.small, color: C.MUTED },
  kota:    { ...FONTS.label, color: C.ACCENT, fontWeight: 'bold' },
  paket:   { ...FONTS.small, color: C.YELLOW },
  pesanan: { ...FONTS.small, color: C.MUTED },
  total:   { ...FONTS.sub, color: C.GREEN, fontSize: 13 },
  kasir:   { ...FONTS.small, color: C.MUTED },
  empty:   { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  emptyTxt: { ...FONTS.body, color: C.MUTED },
});
