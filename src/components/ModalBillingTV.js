import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Modal, TextInput, Alert, ScrollView,
} from 'react-native';
import { MaterialCommunityIcons as Icon } from '@expo/vector-icons';
import { C, FONTS } from '../utils/theme';
import { useStore } from '../store/useStore';
import tvWsServer from '../utils/tvWsServer';
import httpFileServer from '../utils/httpFileServer';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';

const OVERLAY_MODES = [
  { value: 'always', label: 'Selalu Tampil' },
  { value: 'last_minutes', label: 'Menit Terakhir Saja' },
  { value: 'never', label: 'Tidak Tampil' },
];

export default function ModalBillingTV({ visible, onClose }) {
  const tvList = useStore(s => s.tvList);
  const sendTvCommand = useStore(s => s.sendTvCommand);
  const broadcastTvCommand = useStore(s => s.broadcastTvCommand);

  const [overlayMode, setOverlayMode] = useState('always');
  const [overlayMinutes, setOverlayMinutes] = useState('5');
  const [toastMsg, setToastMsg] = useState('');
  const [toastDuration, setToastDuration] = useState('3');
  const [uploading, setUploading] = useState(false);

  const connectedTvCount = tvList.filter(
    tv => tv.koneksiMetode === 'billingtv' && tvWsServer.isConnected(tv.nama)
  ).length;

  // ─── 1. Overlay Sisa Waktu ────────────────────────────────────
  const kirimOverlay = () => {
    if (connectedTvCount === 0) {
      Alert.alert('Tidak ada TV', 'Tidak ada billingtv yang terhubung via WebSocket.');
      return;
    }
    const sent = broadcastTvCommand('OVERLAY_SETTINGS', {
      overlayMode,
      overlayLastMinutes: parseInt(overlayMinutes) || 5,
    });
    Alert.alert('Terkirim', `Pengaturan overlay dikirim ke ${sent} TV.`);
  };

  // ─── 2. Upload Video Promosi ──────────────────────────────────
  const pilihVideo = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'video/*',
        copyToCacheDirectory: true,
      });

      if (result.canceled || !result.assets || result.assets.length === 0) return;

      const file = result.assets[0];
      const fileName = file.name || `promo_${Date.now()}.mp4`;
      setUploading(true);

      // Copy file to document directory with predictable name
      const destPath = `${FileSystem.documentDirectory}${fileName}`;
      await FileSystem.copyAsync({ from: file.uri, to: destPath });

      // Ensure HTTP file server is running
      if (!httpFileServer.isRunning) {
        await httpFileServer.start(8082);
      }

      // Get local IP for serving
      const { ADBHelper } = await import('../utils/adbHelper');
      const localIP = await ADBHelper.getLocalIP();
      if (!localIP) {
        Alert.alert('Error', 'Tidak dapat menentukan IP lokal.');
        setUploading(false);
        return;
      }

      // Build URL — client will fetch from phone's HTTP server
      // For now we store the local path and broadcast the file:// URI
      // The billingtv client needs to handle file:// or http:// URLs
      const videoUrl = `http://${localIP}:8082/media/${fileName}`;

      useStore.getState().setPromoVideoUrl(videoUrl);

      // Broadcast to all connected TVs
      let sent = 0;
      const ids = tvWsServer.getConnectedIds();
      for (const id of ids) {
        if (sendTvCommand(id, 'SHOW_MEDIA', { mediaType: 'video', url: videoUrl })) sent++;
      }

      Alert.alert('Video Promosi', `Video "${fileName}" dipilih.\n\nURL: ${videoUrl}\n\nDikirim ke ${sent} TV yang terhubung.`);
      setUploading(false);
    } catch (e) {
      setUploading(false);
      Alert.alert('Error', `Gagal memilih video: ${e.message}`);
    }
  };

  const sembunyikanVideo = () => {
    if (connectedTvCount === 0) {
      Alert.alert('Tidak ada TV', 'Tidak ada billingtv yang terhubung.');
      return;
    }
    const sent = broadcastTvCommand('HIDE_MEDIA');
    useStore.getState().setPromoVideoUrl('');
    Alert.alert('Dihentikan', `Video promosi dihentikan di ${sent} TV.`);
  };

  // ─── 3. Toast Message (webOS TV) ──────────────────────────────
  const kirimToast = () => {
    if (!toastMsg.trim()) {
      Alert.alert('Error', 'Pesan tidak boleh kosong.');
      return;
    }
    if (connectedTvCount === 0) {
      Alert.alert('Tidak ada TV', 'Tidak ada billingtv yang terhubung via WebSocket.');
      return;
    }
    const sent = broadcastTvCommand('SHOW_TOAST', {
      message: toastMsg.trim(),
      duration: parseInt(toastDuration) || 3,
    });
    Alert.alert('Terkirim', `Toast "${toastMsg.trim()}" dikirim ke ${sent} TV.`);
    setToastMsg('');
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={s.overlay}>
        <View style={s.container}>
          {/* Header */}
          <View style={s.hdr}>
            <Icon name="television" size={22} color={C.ACCENT2} />
            <Text style={s.hdrTitle}>Pengaturan BillingTV</Text>
            <TouchableOpacity onPress={onClose} style={s.btnClose}>
              <Icon name="close" size={20} color={C.TEXT} />
            </TouchableOpacity>
          </View>

          <ScrollView style={s.body} showsVerticalScrollIndicator={false}>
            {/* Status */}
            <View style={s.statusBox}>
              <Icon name="wifi" size={16} color={connectedTvCount > 0 ? C.GREEN : C.RED} />
              <Text style={[s.statusText, { color: connectedTvCount > 0 ? C.GREEN : C.RED }]}>
                {connectedTvCount > 0 ? `${connectedTvCount} TV terhubung` : 'Tidak ada TV terhubung'}
              </Text>
            </View>

            {/* ── 1. Overlay Sisa Waktu ── */}
            <View style={s.section}>
              <Text style={s.sectionTitle}>1. Overlay Sisa Waktu</Text>
              <Text style={s.sectionHint}>Atur kapan overlay waktu tampil di TV</Text>

              <Text style={s.label}>Mode Overlay:</Text>
              <View style={s.chipRow}>
                {OVERLAY_MODES.map(m => (
                  <TouchableOpacity
                    key={m.value}
                    style={[s.chip, overlayMode === m.value && s.chipActive]}
                    onPress={() => setOverlayMode(m.value)}
                  >
                    <Text style={[s.chipTxt, overlayMode === m.value && s.chipTxtActive]}>
                      {m.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {overlayMode === 'last_minutes' && (
                <>
                  <Text style={s.label}>Tampil di menit terakhir:</Text>
                  <TextInput
                    style={s.input}
                    value={overlayMinutes}
                    onChangeText={setOverlayMinutes}
                    keyboardType="numeric"
                    placeholder="5"
                    placeholderTextColor={C.MUTED}
                  />
                </>
              )}

              <TouchableOpacity style={s.btnKirim} onPress={kirimOverlay}>
                <Icon name="send" size={16} color="white" />
                <Text style={s.btnKirimTxt}>Kirim ke Semua TV</Text>
              </TouchableOpacity>
            </View>

            {/* ── 2. Video Promosi ── */}
            <View style={s.section}>
              <Text style={s.sectionTitle}>2. Video Promosi</Text>
              <Text style={s.sectionHint}>Upload & tampilkan video di TV</Text>

              <View style={s.btnRow}>
                <TouchableOpacity style={s.btnUpload} onPress={pilihVideo} disabled={uploading}>
                  <Icon name="video" size={18} color="white" />
                  <Text style={s.btnUploadTxt}>{uploading ? 'Memproses...' : 'Pilih Video'}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.btnStop} onPress={sembunyikanVideo}>
                  <Icon name="stop-circle" size={18} color="white" />
                  <Text style={s.btnStopTxt}>Hentikan</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* ── 3. Toast Message ── */}
            <View style={s.section}>
              <Text style={s.sectionTitle}>3. Toast Message (webOS)</Text>
              <Text style={s.sectionHint}>Kirim pesan singkat ke layar TV</Text>

              <TextInput
                style={s.input}
                value={toastMsg}
                onChangeText={setToastMsg}
                placeholder="Tulis pesan untuk TV..."
                placeholderTextColor={C.MUTED}
                multiline
              />

              <Text style={s.label}>Durasi (detik):</Text>
              <TextInput
                style={[s.input, { width: 80 }]}
                value={toastDuration}
                onChangeText={setToastDuration}
                keyboardType="numeric"
                placeholder="3"
                placeholderTextColor={C.MUTED}
              />

              <TouchableOpacity style={s.btnKirim} onPress={kirimToast}>
                <Icon name="message-alert" size={16} color="white" />
                <Text style={s.btnKirimTxt}>Kirim Toast</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
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
  hdrTitle: { flex: 1, ...FONTS.sub, color: C.ACCENT2, fontSize: 15, fontWeight: 'bold' },
  btnClose: { padding: 4 },
  body: { paddingHorizontal: 16, paddingBottom: 24 },
  statusBox: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: C.CARD, borderRadius: 8, padding: 10, marginTop: 12,
    borderWidth: 1, borderColor: C.BORDER,
  },
  statusText: { ...FONTS.small, fontSize: 12 },
  section: {
    marginTop: 16, backgroundColor: C.CARD, borderRadius: 12,
    padding: 14, borderWidth: 1, borderColor: C.BORDER,
  },
  sectionTitle: { ...FONTS.sub, color: C.TEXT, fontSize: 14, fontWeight: 'bold' },
  sectionHint: { ...FONTS.small, color: C.MUTED, fontSize: 11, marginTop: 2, marginBottom: 12 },
  label: { ...FONTS.small, color: C.TEXT, fontSize: 12, marginTop: 8, marginBottom: 4 },
  input: {
    backgroundColor: C.BTN, borderRadius: 8, borderWidth: 1, borderColor: C.BORDER,
    color: C.TEXT, paddingHorizontal: 12, paddingVertical: 8, ...FONTS.body, fontSize: 13,
  },
  chipRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  chip: {
    borderRadius: 8, borderWidth: 1, borderColor: C.BORDER,
    paddingHorizontal: 12, paddingVertical: 8, backgroundColor: C.BTN,
  },
  chipActive: { borderColor: C.ACCENT2, backgroundColor: '#1A0A2A' },
  chipTxt: { ...FONTS.small, color: C.MUTED, fontSize: 12 },
  chipTxtActive: { color: C.ACCENT2 },
  btnRow: { flexDirection: 'row', gap: 10 },
  btnKirim: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: C.ACCENT2, borderRadius: 10, paddingVertical: 12, marginTop: 12,
  },
  btnKirimTxt: { color: 'white', ...FONTS.sub, fontSize: 13 },
  btnUpload: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: C.ACCENT, borderRadius: 10, paddingVertical: 12,
  },
  btnUploadTxt: { color: 'white', ...FONTS.sub, fontSize: 13 },
  btnStop: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: C.RED, borderRadius: 10, paddingVertical: 12,
  },
  btnStopTxt: { color: 'white', ...FONTS.sub, fontSize: 13 },
});
