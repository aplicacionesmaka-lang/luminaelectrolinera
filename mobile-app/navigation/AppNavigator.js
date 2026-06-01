import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Text } from 'react-native';

import { useAuth } from '../services/AuthContext';
import LoginScreen        from '../screens/LoginScreen';
import RegisterScreen     from '../screens/RegisterScreen';
import MapScreen          from '../screens/MapScreen';
import StationDetailScreen from '../screens/StationDetailScreen';
import HistoryScreen      from '../screens/HistoryScreen';
import ProfileScreen      from '../screens/ProfileScreen';
import TopupScreen        from '../screens/TopupScreen';

const Stack = createNativeStackNavigator();
const Tab   = createBottomTabNavigator();

function HomeTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarStyle:       { backgroundColor: '#1a1d27', borderTopColor: '#0f1117', height: 60, paddingBottom: 8 },
        tabBarActiveTintColor:   '#00e5b4',
        tabBarInactiveTintColor: '#555',
        tabBarLabel: ({ color }) => {
          const labels = { Map: 'Estaciones', History: 'Historial', Profile: 'Perfil' };
          return <Text style={{ color, fontSize: 11, fontWeight: '600' }}>{labels[route.name]}</Text>;
        },
        tabBarIcon: ({ color, size }) => {
          const icons = { Map: '⚡', History: '🕐', Profile: '👤' };
          return <Text style={{ fontSize: size - 4 }}>{icons[route.name]}</Text>;
        },
      })}
    >
      <Tab.Screen name="Map"     component={MapScreen} />
      <Tab.Screen name="History" component={HistoryScreen} />
      <Tab.Screen name="Profile" component={ProfileScreen} />
    </Tab.Navigator>
  );
}

export default function AppNavigator() {
  const { user, loading } = useAuth();

  if (loading) return null;

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {user ? (
          <>
            <Stack.Screen name="HomeTabs"      component={HomeTabs} />
            <Stack.Screen name="StationDetail" component={StationDetailScreen} />
            <Stack.Screen name="Topup"         component={TopupScreen} />
          </>
        ) : (
          <>
            <Stack.Screen name="Login"    component={LoginScreen} />
            <Stack.Screen name="Register" component={RegisterScreen} />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
