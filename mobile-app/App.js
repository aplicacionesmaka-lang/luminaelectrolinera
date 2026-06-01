import React from 'react';
import { StatusBar } from 'react-native';
import { AuthProvider } from './services/AuthContext';
import AppNavigator from './navigation/AppNavigator';

export default function App() {
  return (
    <AuthProvider>
      <StatusBar barStyle="light-content" backgroundColor="#0f1117" />
      <AppNavigator />
    </AuthProvider>
  );
}
