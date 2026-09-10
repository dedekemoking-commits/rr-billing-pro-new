import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Modal, Alert,
} from 'react-native';
import { MaterialCommunityIcons as Icon } from '@expo/vector-icons';
import { C, FONTS } from '../utils/theme';
import { sendCommand as atpv2Send } from '../utils/atpv2Helper';
import { ADBHelper } from '../utils/adbHelper';

function RemoteBtn({ icon, color, label, onPress, size = 22 }) {
  return (
    <TouchableOpacity style={[s.rBtn, { borderColor: color }]} onPress={onPress} activeOpacity={0.6}>
      <Icon name={icon} size={size} color={color} />
      {label ? <Text style={[s.rBtnLabel, { color }]}>{label}</Text> : null}
    </TouchableOpacity>
  );
}

function DPadBtn({ icon, color, onPress }) {
  return (
    <TouchableOpacity style={[s.dpadBtn, { borderColor: color }]} onPress={onPress} activeOpacity={0.5}>
      <Icon name={icon} size={22} color={color} />
    </TouchableOpacity>
  );
}

export default function ModalRemoteControl({ visible, onClose, tv, atpv2Conn, atpv2Status }) {
  const [busy, setBusy] = useState(false);

  if (!tv) return null;

  const isAtpv2 = tv.koneksiMetode === 'atpv2';
  const isADB = tv.koneksiMetode !== 'atpv2' && tv.koneksiMetode !== 'billingtv';
  const isBillingTV = tv.koneksiMetode === 'billingtv';
  const canRemote = (isAtpv2 && atpv2Status === 'connected') || isADB;

  const send = async (cmd, params = {}) => {
    if (busy || !canRemote) return;
    setBusy(true);
    try {
      if (isAtpv2 && atpv2Conn && atpv2Status === 'connected') {
        await atpv2Send(atpv2Conn, cmd, params);
      } else if (isADB) {
        const keyCode = getKeyCode(cmd, params);
        if (keyCode) {
          await ADBHelper.shell(tv.ip, `input keyevent ${keyCode}`, tv.port);
        }
      } else if (isBillingTV) {
        Alert.alert('BillingTV', 'Remote control hanya tersedia via Connect atau ADB.');
        setBusy(false);
        return;
      }
    } catch (e) {
      Alert.alert('Gagal', `Remote: ${e.message}`);
    }
    setBusy(false);
  };

  const getKeyCode = (cmd, params) => {
    switch (cmd) {
      case 'power': return 26;
      case 'home': return 3;
      case 'back': return 4;
      case 'enter': return 66;
      case 'up': return 19;
      case 'down': return 20;
      case 'left': return 21;
      case 'right': return 22;
      case 'dpadCenter': return 23;
      case 'volume':
        return params.action === 'up' ? 24 : 25;
      case 'mute': return 164;
      case 'input': return 178;
      case 'menu': return 82;
      case 'settings': return 176;
      case 'mediaPlayPause': return 85;
      default: return null;
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={s.overlay}>
        <View style={s.container}>
          {/* Header */}
          <View style={s.hdr}>
            <Icon name="remote" size={20} color={C.ACCENT} />
            <Text style={s.hdrTitle}>Remote Control</Text>
            <Text style={[s.hdrTv, { color: canRemote ? C.GREEN : C.RED }]}>
              {tv.nama} {canRemote ? '●' : '○'}
            </Text>
            <TouchableOpacity onPress={onClose} style={s.btnClose}>
              <Icon name="close" size={20} color={C.TEXT} />
            </TouchableOpacity>
          </View>

          <View style={s.body}>
            {/* Top Row: Power, Input, Menu */}
            <View style={s.topRow}>
              <RemoteBtn icon="power" color={C.RED} label="Power" onPress={() => send('power')} size={26} />
              <RemoteBtn icon="video-input-hdmi" color={C.YELLOW} label="Input" onPress={() => send('input')} />
              <RemoteBtn icon="menu" color={C.ACCENT2} label="Menu" onPress={() => send('menu')} />
            </View>

            {/* D-Pad */}
            <View style={s.dpadArea}>
              <View style={s.dpadCol}>
                <DPadBtn icon="chevron-up" color={C.ACCENT} onPress={() => send('up')} />
              </View>
              <View style={s.dpadRow}>
                <DPadBtn icon="chevron-left" color={C.ACCENT} onPress={() => send('left')} />
                <TouchableOpacity style={s.dpadCenter} onPress={() => send('dpadCenter')} activeOpacity={0.5}>
                  <Text style={s.dpadCenterTxt}>OK</Text>
                </TouchableOpacity>
                <DPadBtn icon="chevron-right" color={C.ACCENT} onPress={() => send('right')} />
              </View>
              <View style={s.dpadCol}>
                <DPadBtn icon="chevron-down" color={C.ACCENT} onPress={() => send('down')} />
              </View>
            </View>

            {/* Second Row: Back, Home, Settings */}
            <View style={s.topRow}>
              <RemoteBtn icon="arrow-left" color={C.ACCENT} label="Back" onPress={() => send('back')} />
              <RemoteBtn icon="home" color={C.ACCENT} label="Home" onPress={() => send('home')} />
              <RemoteBtn icon="cog" color={C.ACCENT} label="Set" onPress={() => send('settings')} />
            </View>

            {/* Volume & Mute */}
            <View style={s.topRow}>
              <RemoteBtn icon="volume-high" color={C.GREEN} label="Vol+" onPress={() => send('volume', { action: 'up' })} />
              <RemoteBtn icon="volume-mute" color={C.ORANGE} label="Mute" onPress={() => send('mute')} />
              <RemoteBtn icon="volume-low" color={C.GREEN} label="Vol-" onPress={() => send('volume', { action: 'down' })} />
            </View>

            {/* Media Control */}
            <View style={[s.topRow, { justifyContent: 'center' }]}>
              <RemoteBtn icon="play-pause" color={C.ACCENT2} label="Play/Pause" onPress={() => send('mediaPlayPause')} size={28} />
            </View>

            {!canRemote && (
              <View style={s.warnBox}>
                <Icon name="alert-circle" size={14} color={C.YELLOW} />
                <Text style={s.warnTxt}>
                  {isBillingTV
                    ? 'Remote tidak tersedia via BillingTV. Gunakan Connect atau ADB.'
                    : 'TV offline. Hubungkan dulu untuk menggunakan remote.'}
                </Text>
              </View>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  container: {
    backgroundColor: C.PANEL, borderTopLeftRadius: 20, borderTopRightRadius: 20,
    maxHeight: '85%',
  },
  hdr: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: C.BORDER,
  },
  hdrTitle: { flex: 1, ...FONTS.sub, color: C.ACCENT, fontSize: 15, fontWeight: 'bold' },
  hdrTv: { ...FONTS.small, fontSize: 11 },
  btnClose: { padding: 4 },
  body: { paddingHorizontal: 16, paddingBottom: 24, paddingTop: 12, gap: 16 },

  // Top row (3 buttons)
  topRow: {
    flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center', gap: 10,
  },

  // Remote button
  rBtn: {
    alignItems: 'center', justifyContent: 'center', gap: 4,
    borderWidth: 1, borderRadius: 12,
    paddingHorizontal: 16, paddingVertical: 12,
    backgroundColor: C.BTN, minWidth: 72,
  },
  rBtnLabel: { ...FONTS.small, fontSize: 10 },

  // D-Pad area
  dpadArea: {
    alignItems: 'center', gap: 4,
    paddingVertical: 8,
  },
  dpadRow: {
    flexDirection: 'row', alignItems: 'center', gap: 20,
  },
  dpadCol: {
    alignItems: 'center',
  },
  dpadBtn: {
    width: 52, height: 52, borderRadius: 26,
    borderWidth: 1, backgroundColor: C.BTN,
    alignItems: 'center', justifyContent: 'center',
  },
  dpadCenter: {
    width: 56, height: 56, borderRadius: 28,
    borderWidth: 2, borderColor: C.ACCENT, backgroundColor: C.CARD,
    alignItems: 'center', justifyContent: 'center',
  },
  dpadCenterTxt: {
    ...FONTS.sub, color: C.ACCENT, fontSize: 14, fontWeight: 'bold',
  },

  // Warning
  warnBox: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#1A1A0A', borderRadius: 8,
    borderWidth: 1, borderColor: C.YELLOW, padding: 10,
  },
  warnTxt: { ...FONTS.small, color: C.YELLOW, flex: 1 },
});
