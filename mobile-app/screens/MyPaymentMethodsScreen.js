import React, { useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
import TopupScreen from './TopupScreen';

export default function MyPaymentMethodsScreen({ navigation, route }) {
  return <TopupScreen navigation={navigation} route={route} />;
}
