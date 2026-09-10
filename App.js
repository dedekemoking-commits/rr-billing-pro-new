import React, { useEffect, useState, useRef } from 'react';
import { View, ActivityIndicator, Alert, Text } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import * as Updates from 'expo-updates';
import LoginScreen   from './src/screens/LoginScreen';
import MainNavigator from './src/navigation/MainNavigator';
import { useStore } from './src/store/useStore';
import { warmUpCertificate } from './src/utils/atpv2Helper';

const Stack = createNativeStackNavigator();

function RootNavigator() {
  const currentUser = useStore(s => s.currentUser);
  const appReady    = useStore(s => s.appReady);

  if (!appReady) {
    return (
      <View style={{ flex: 1, backgroundColor: '#0D0D1A', justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#7B2FFF" />
      </View>
    );
  }

  return (
    <Stack.Navigator
      initialRouteName={currentUser ? 'Main' : 'Login'}
      screenOptions={{ headerShown: false, animation: 'fade' }}
    >
      <Stack.Screen name="Login" component={LoginScreen} />
      <Stack.Screen name="Main"  component={MainNavigator} />
    </Stack.Navigator>
  );
}

export default function App() {
  const restoreSession = useStore(s => s.restoreSession);
  const [updateMsg, setUpdateMsg] = useState(null);
  const checkedRef = useRef(false);

  useEffect(() => { restoreSession().catch(e => console.warn('[Session]', e.message)); }, []);
  useEffect(() => { warmUpCertificate(); }, []);

  useEffect(() => {
    activateKeepAwakeAsync().catch(e => console.warn('[KeepAwake]', e.message));
    return () => { deactivateKeepAwake(); };
  }, []);

  useEffect(() => {
    if (checkedRef.current) return;
    checkedRef.current = true;

    const checkUpdate = async () => {
      try {
        const { isAvailable } = await Updates.checkForUpdateAsync();
        if (isAvailable) {
          setUpdateMsg('Mengunduh pembaruan...');
          const { isNew } = await Updates.fetchUpdateAsync();
          if (isNew) {
            Alert.alert(
              'Pembaruan Tersedia',
              'Aplikasi akan di-restart untuk menerapkan pembaruan.',
              [{ text: 'Restart', onPress: () => Updates.reloadAsync() }]
            );
          }
        }
      } catch (e) {
        console.log('[Update]', e.message);
      } finally {
        setUpdateMsg(null);
      }
    };

    checkUpdate();
  }, []);

  return (
    <SafeAreaProvider>
      <StatusBar style="light" backgroundColor="#0D0D1A" />
      <NavigationContainer>
        {updateMsg && (
          <View style={{ position: 'absolute', top: 0, left: 0, right: 0, backgroundColor: '#7B2FFF', padding: 8, zIndex: 999 }}>
            <Text style={{ color: 'white', textAlign: 'center', fontFamily: 'monospace', fontSize: 11 }}>{updateMsg}</Text>
          </View>
        )}
        <RootNavigator />
      </NavigationContainer>
    </SafeAreaProvider>
  );
}
