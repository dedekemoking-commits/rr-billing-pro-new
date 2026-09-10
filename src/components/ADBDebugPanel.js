/**
 * ADB Connection Debug Helper
 * 
 * Gunakan untuk troubleshoot masalah koneksi ADB
 * Cocok untuk di-paste ke MainNavigator atau Home screen
 */

import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Alert } from 'react-native';
import { MaterialCommunityIcons as Icon } from '@expo/vector-icons';
import { ADBHelper } from '../utils/adbHelper';
import { C, FONTS } from '../utils/theme';

export function ADBDebugPanel() {
  const [logs, setLogs] = useState([]);
  const [testIp, setTestIp] = useState('192.168.1.100');
  const [testPort, setTestPort] = useState(5555);

  const addLog = (msg, type = 'info') => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs(prev => [...prev, { msg, type, timestamp }].slice(-20));
  };

  const testPortOpen = async () => {
    addLog(`🔍 Cek port ${testIp}:${testPort}...`, 'info');
    try {
      const isOpen = await ADBHelper.checkPortOpen(testIp, testPort, 3000);
      if (isOpen) {
        addLog(`✅ Port TERBUKA!`, 'success');
      } else {
        addLog(`❌ Port TERTUTUP`, 'error');
      }
    } catch (e) {
      addLog(`❌ Error: ${e.message}`, 'error');
    }
  };

  const testConnect = async () => {
    addLog(`🔗 Connect ke ${testIp}:${testPort}...`, 'info');
    try {
      const result = await ADBHelper.connect(testIp, testPort);
      if (result.sukses) {
        addLog(`✅ ${result.pesan}`, 'success');
      } else {
        addLog(`❌ ${result.pesan}`, 'error');
      }
    } catch (e) {
      addLog(`❌ Error: ${e.message}`, 'error');
    }
  };

  const testShell = async (cmd) => {
    addLog(`📤 Shell: ${cmd}`, 'info');
    try {
      const result = await ADBHelper.shell(testIp, cmd, testPort);
      if (result.sukses) {
        addLog(`✅ Output: ${result.output}`, 'success');
      } else {
        addLog(`❌ ${result.pesan}`, 'error');
      }
    } catch (e) {
      addLog(`❌ Error: ${e.message}`, 'error');
    }
  };

  const checkRsaKey = async () => {
    addLog(`🔑 Cek Device Info...`, 'info');
    try {
      const info = await ADBHelper.getDeviceInfo(testIp, testPort);
      if (info.sukses) {
        addLog(`✅ Brand: ${info.brand}`, 'success');
        addLog(`✅ Model: ${info.model}`, 'success');
        addLog(`✅ Android: ${info.android}`, 'success');
      } else {
        addLog(`❌ ${info.pesan}`, 'error');
      }
    } catch (e) {
      addLog(`❌ Error: ${e.message}`, 'error');
    }
  };

  const testPower = async () => {
    addLog(`🔌 Test Power Control (26)...`, 'info');
    await testShell('input keyevent 26');
  };

  const testVolume = async () => {
    addLog(`🔊 Test Volume Up (24)...`, 'info');
    await testShell('input keyevent 24');
  };

  return (
    <View style={styles.container}>
      <ScrollView style={styles.panel}>
        {/* Header */}
        <View style={styles.header}>
          <Icon name="bug" size={20} color={C.ACCENT} />
          <Text style={styles.title}>ADB Debug Panel</Text>
        </View>

        {/* IP & Port Input */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>📍 Target TV</Text>
          <View style={styles.inputRow}>
            <Text style={styles.label}>IP:</Text>
            <Text style={styles.value}>{testIp}</Text>
          </View>
          <View style={styles.inputRow}>
            <Text style={styles.label}>Port:</Text>
            <Text style={styles.value}>{testPort}</Text>
          </View>
        </View>

        {/* Connection Tests */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>🔗 Connection Tests</Text>
          <TouchableOpacity style={styles.btn} onPress={testPortOpen}>
            <Text style={styles.btnText}>1. Port Open?</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.btn} onPress={testConnect}>
            <Text style={styles.btnText}>2. Try Connect</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.btn} onPress={checkRsaKey}>
            <Text style={styles.btnText}>3. Check RSA Key</Text>
          </TouchableOpacity>
        </View>

        {/* Shell Commands */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>📤 Shell Commands</Text>
          <TouchableOpacity style={styles.btn} onPress={() => testShell('echo OK')}>
            <Text style={styles.btnText}>Echo Test</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.btn} onPress={testPower}>
            <Text style={styles.btnText}>Power Control</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.btn} onPress={testVolume}>
            <Text style={styles.btnText}>Volume Up</Text>
          </TouchableOpacity>
        </View>

        {/* Logs */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>📋 Logs</Text>
          {logs.length === 0 ? (
            <Text style={styles.noLogs}>Tidak ada log</Text>
          ) : (
            logs.map((log, i) => (
              <View key={i} style={[styles.logEntry, { borderLeftColor: log.type === 'success' ? '#4CAF50' : log.type === 'error' ? '#F44336' : '#2196F3' }]}>
                <Text style={{ ...styles.logMsg, color: log.type === 'success' ? '#4CAF50' : log.type === 'error' ? '#F44336' : '#2196F3' }}>
                  {log.msg}
                </Text>
                <Text style={styles.logTime}>{log.timestamp}</Text>
              </View>
            ))
          )}
          <TouchableOpacity style={[styles.btn, { marginTop: 10 }]} onPress={() => setLogs([])}>
            <Text style={styles.btnText}>Clear Logs</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.BG },
  panel: { padding: 12 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: C.BORDER,
    marginBottom: 12,
  },
  title: { ...FONTS.title, color: C.ACCENT, fontSize: 16 },
  section: { marginBottom: 16 },
  sectionTitle: { ...FONTS.sub, color: C.ACCENT2, marginBottom: 8 },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  label: { ...FONTS.small, color: C.MUTED, width: 40 },
  value: { ...FONTS.body, color: C.TEXT },
  btn: {
    backgroundColor: C.BTN,
    borderWidth: 1,
    borderColor: C.BORDER,
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 8,
  },
  btnText: { ...FONTS.body, color: C.TEXT, textAlign: 'center' },
  noLogs: { ...FONTS.small, color: C.MUTED, fontStyle: 'italic' },
  logEntry: {
    borderLeftWidth: 3,
    paddingLeft: 8,
    paddingVertical: 4,
    marginBottom: 4,
  },
  logMsg: { ...FONTS.small },
  logTime: { ...FONTS.small, color: C.MUTED, fontSize: 10, marginTop: 2 },
});

export default ADBDebugPanel;
