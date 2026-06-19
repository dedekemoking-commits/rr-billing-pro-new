import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Alert, ActivityIndicator,
} from 'react-native';
import { MaterialCommunityIcons as Icon } from '@expo/vector-icons';
import { C, FONTS, fmtRp } from '../utils/theme';
import { ADBHelper } from '../utils/adbHelper';

export default function TVCard({ tv, onPilihPaket, onHapus, onUpdateTV }) {
  const [timerSisa, setTimerSisa] = useState(tv.sisaDetik || 0);
  const [koneksi,   setKoneksi]   = useState('unknown'); // online | offline | unknown
  const [adbBusy,   setAdbBusy]   = useState(false);
  const intervalRef = useRef(null);

  // Sync timer dari tv prop
  useEffect(() => { setTimerSisa(tv.sisaDetik || 0); }, [tv.sisaDetik]);

  // Timer countdown
  useEffect(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (tv.timerActive && timerSisa > 0) {
      intervalRef.current = setInterval(() => {
        setTimerSisa(prev => {
          if (prev <= 1) {
            clearInterval(intervalRef.current);
            onUpdateTV({ timerActive: false, sisaDetik: 0 });
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [tv.timerActive]);

  function formatTimer(secs) {
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  }

  const timerColor = timerSisa <= 300 ? C.RED : C.ACCENT;
  const isExpired  = !tv.bebas && tv.paketAktif && timerSisa === 0;

  const adbAction = async (fn, label) => {
    if (adbBusy) return;
    setAdbBusy(true);
    try {
      const result = await fn();
      setKoneksi(result.sukses ? 'online' : 'offline');
    } catch {
      setKoneksi('offline');
    }
    setAdbBusy(false);
  };

  const cekKoneksi = async () => {
    setAdbBusy(true);
    const result = await ADBHelper.connect(tv.ip, tv.port || 5555);
    setKoneksi(result.sukses ? 'online' : 'offline');
    if (!result.sukses) {
      Alert.alert('Koneksi Gagal', result.pesan);
    } else {
      Alert.alert('✅ Terhubung', result.pesan);
    }
    setAdbBusy(false);
  };

  const koneksiColor = koneksi === 'online' ? C.GREEN : koneksi === 'offline' ? C.RED : C.MUTED;
  const koneksiLabel = koneksi === 'online' ? '● ONLINE' : koneksi === 'offline' ? '● OFFLINE' : '● ?';

  return (
    <View style={[s.card, isExpired && s.cardExpired]}>
      {/* Header baris */}
      <View style={s.hdr}>
        <View style={s.titleRow}>
          <Icon name="television-play" size={16} color={C.ACCENT} />
          <Text style={s.tvName}>{tv.nama}</Text>
        </View>
        <Text style={[s.koneksiTxt, { color: koneksiColor }]}>{koneksiLabel}</Text>
        <TouchableOpacity onPress={onHapus} style={s.delBtn}>
          <Icon name="close" size={16} color={C.RED} />
        </TouchableOpacity>
      </View>

      {/* IP & port */}
      <Text style={s.ipTxt}>{tv.ip}:{tv.port || 5555}</Text>

      {/* Timer */}
      <View style={s.timerWrap}>
        {tv.bebas ? (
          <Text style={[s.timer, { color: C.GREEN }]}>∞ BEBAS</Text>
        ) : isExpired ? (
          <Text style={[s.timer, { color: C.RED }]}>SELESAI ⏹</Text>
        ) : tv.paketAktif ? (
          <Text style={[s.timer, { color: timerColor }]}>{formatTimer(timerSisa)}</Text>
        ) : (
          <Text style={[s.timer, { color: C.MUTED }]}>00:00:00</Text>
        )}
        {tv.paketAktif && (
          <Text style={s.paketLabel}>{tv.paketAktif}</Text>
        )}
      </View>

      {/* ADB Controls */}
      <View style={s.ctrlRow}>
        <ADBBtn icon="power" color={C.RED} label="PWR"
          onPress={() => adbAction(() => ADBHelper.powerToggle(tv.ip, tv.port), 'power')} busy={adbBusy} />
        <ADBBtn icon="volume-high" color={C.ACCENT} label="Vol+"
          onPress={() => adbAction(() => ADBHelper.volume(tv.ip, true, tv.port), 'vol+')} busy={adbBusy} />
        <ADBBtn icon="volume-low" color={C.ACCENT} label="Vol-"
          onPress={() => adbAction(() => ADBHelper.volume(tv.ip, false, tv.port), 'vol-')} busy={adbBusy} />
        <ADBBtn icon="home" color={C.ACCENT2} label="Home"
          onPress={() => adbAction(() => ADBHelper.home(tv.ip, tv.port), 'home')} busy={adbBusy} />
        <ADBBtn icon="arrow-left" color={C.YELLOW} label="Back"
          onPress={() => adbAction(() => ADBHelper.back(tv.ip, tv.port), 'back')} busy={adbBusy} />
      </View>

      {/* Bottom row */}
      <View style={s.botRow}>
        <TouchableOpacity style={s.btnCek} onPress={cekKoneksi} disabled={adbBusy}>
          {adbBusy
            ? <ActivityIndicator size="small" color={C.GREEN} />
            : <Text style={s.btnCekTxt}>🔍 Cek ADB</Text>
          }
        </TouchableOpacity>
        <TouchableOpacity style={s.btnPaket} onPress={onPilihPaket}>
          <Icon name="package-variant" size={14} color="white" />
          <Text style={s.btnPaketTxt}>PAKET & PESANAN</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function ADBBtn({ icon, color, label, onPress, busy }) {
  return (
    <TouchableOpacity style={[s.adbBtn, { borderColor: color }]} onPress={onPress} disabled={busy}>
      <Icon name={icon} size={16} color={color} />
      <Text style={[s.adbBtnTxt, { color }]}>{label}</Text>
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  card: {
    backgroundColor: C.CARD, borderRadius: 14,
    borderWidth: 1, borderColor: C.BORDER,
    padding: 14, gap: 10,
  },
  cardExpired: { borderColor: C.RED },
  hdr:  { flexDirection: 'row', alignItems: 'center', gap: 8 },
  titleRow: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 },
  tvName: { ...FONTS.sub, color: C.ACCENT, fontSize: 13 },
  koneksiTxt: { ...FONTS.small },
  delBtn: { padding: 4 },
  ipTxt: { ...FONTS.small, color: C.MUTED },
  timerWrap: { alignItems: 'center', gap: 4 },
  timer: { fontFamily: 'monospace', fontSize: 30, fontWeight: 'bold', letterSpacing: 3 },
  paketLabel: { ...FONTS.small, color: C.YELLOW },
  ctrlRow: { flexDirection: 'row', gap: 8, justifyContent: 'center', flexWrap: 'wrap' },
  adbBtn: {
    borderWidth: 1, borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 6,
    alignItems: 'center', gap: 2,
    backgroundColor: C.BTN,
  },
  adbBtnTxt: { ...FONTS.small, fontSize: 9 },
  botRow: { flexDirection: 'row', gap: 8 },
  btnCek: {
    flex: 1, paddingVertical: 8, borderRadius: 8,
    backgroundColor: C.BTN, borderWidth: 1, borderColor: C.GREEN,
    alignItems: 'center',
  },
  btnCekTxt: { ...FONTS.small, color: C.GREEN },
  btnPaket: {
    flex: 2, paddingVertical: 8, borderRadius: 8,
    backgroundColor: C.ACCENT2, flexDirection: 'row',
    alignItems: 'center', justifyContent: 'center', gap: 6,
  },
  btnPaketTxt: { color: 'white', ...FONTS.small, fontSize: 11, fontWeight: 'bold' },
});
