import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { MaterialCommunityIcons as Icon } from '@expo/vector-icons';
import { C, FONTS } from '../utils/theme';
import DashboardScreen from '../screens/DashboardScreen';
import HargaScreen     from '../screens/HargaScreen';
import RiwayatScreen   from '../screens/RiwayatScreen';
import WiFiScreen      from '../screens/WiFiScreen';
import ProfilScreen    from '../screens/ProfilScreen';

const Tab = createBottomTabNavigator();

export default function MainNavigator({ navigation }) {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarStyle: {
          backgroundColor: '#0A0A20',
          borderTopColor: C.BORDER,
          borderTopWidth: 1,
          paddingBottom: 4,
          height: 62,
        },
        tabBarActiveTintColor:   C.ACCENT,
        tabBarInactiveTintColor: C.MUTED,
        tabBarLabelStyle: { ...FONTS.small, fontSize: 10 },
        tabBarIcon: ({ color, size }) => {
          const icons = {
            Dashboard: 'television-play',
            Harga:     'currency-usd',
            Riwayat:   'chart-bar',
            WiFi:      'access-point-network',
            Profil:    'account-circle',
          };
          return <Icon name={icons[route.name]} size={22} color={color} />;
        },
      })}
    >
      <Tab.Screen name="Dashboard" component={DashboardScreen}  options={{ title: 'TV' }} />
      <Tab.Screen name="Harga"     component={HargaScreen}       options={{ title: 'Harga' }} />
      <Tab.Screen name="Riwayat"   component={RiwayatScreen}     options={{ title: 'Riwayat' }} />
      <Tab.Screen name="WiFi"      component={WiFiScreen}        options={{ title: 'ADB WiFi' }} />
      <Tab.Screen
        name="Profil"
        options={{ title: 'Profil' }}
      >
        {(props) => <ProfilScreen {...props} navigation={navigation} />}
      </Tab.Screen>
    </Tab.Navigator>
  );
}
