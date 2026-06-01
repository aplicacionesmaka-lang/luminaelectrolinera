import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { useAuth } from '../services/AuthContext';

export default function LoginScreen({ navigation }) {
  const { login } = useAuth();
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [loading,  setLoading]  = useState(false);

  async function handleLogin() {
    if (!email || !password) return Alert.alert('Error', 'Completa todos los campos');
    setLoading(true);
    try {
      await login(email.trim().toLowerCase(), password);
    } catch (err) {
      Alert.alert('Error', err.error || 'Credenciales incorrectas');
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={s.container}>
      <Text style={s.logo}>⚡ Lumina</Text>
      <Text style={s.subtitle}>Carga inteligente para tu EV</Text>

      <TextInput
        style={s.input}
        placeholder="Correo electrónico"
        placeholderTextColor="#888"
        keyboardType="email-address"
        autoCapitalize="none"
        value={email}
        onChangeText={setEmail}
      />
      <TextInput
        style={s.input}
        placeholder="Contraseña"
        placeholderTextColor="#888"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />

      <TouchableOpacity style={s.btn} onPress={handleLogin} disabled={loading}>
        {loading ? <ActivityIndicator color="#fff" /> : <Text style={s.btnText}>Iniciar sesión</Text>}
      </TouchableOpacity>

      <TouchableOpacity onPress={() => navigation.navigate('Register')}>
        <Text style={s.link}>¿No tienes cuenta? Regístrate</Text>
      </TouchableOpacity>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f1117', justifyContent: 'center', padding: 28 },
  logo:      { fontSize: 42, fontWeight: '800', color: '#00e5b4', textAlign: 'center', marginBottom: 6 },
  subtitle:  { color: '#888', textAlign: 'center', marginBottom: 40, fontSize: 15 },
  input:     { backgroundColor: '#1a1d27', color: '#fff', borderRadius: 12, padding: 16, marginBottom: 14, fontSize: 15 },
  btn:       { backgroundColor: '#00e5b4', borderRadius: 12, padding: 16, alignItems: 'center', marginTop: 8 },
  btnText:   { color: '#0f1117', fontWeight: '700', fontSize: 16 },
  link:      { color: '#00e5b4', textAlign: 'center', marginTop: 20, fontSize: 14 },
});
