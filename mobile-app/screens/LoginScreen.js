import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, KeyboardAvoidingView, Platform, StatusBar } from 'react-native';
import { useAuth } from '../services/AuthContext';

export default function LoginScreen({ navigation }) {
  const { login } = useAuth();
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [loading,  setLoading]  = useState(false);
  const [showPass, setShowPass] = useState(false);

  async function handleLogin() {
    if (!email || !password) return Alert.alert('Campos requeridos', 'Ingresa tu correo y contraseña');
    setLoading(true);
    try {
      await login(email.trim().toLowerCase(), password);
    } catch (err) {
      Alert.alert('Acceso denegado', err.error || 'Credenciales incorrectas');
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView style={s.outer} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <StatusBar barStyle="light-content" />

      {/* Decoración superior */}
      <View style={s.topGlow} />

      <View style={s.container}>
        {/* Logo */}
        <View style={s.logoWrap}>
          <View style={s.logoIcon}>
            <Text style={s.bolt}>⚡</Text>
          </View>
          <Text style={s.logoText}>Lumina</Text>
          <Text style={s.tagline}>Carga inteligente para tu vehículo eléctrico</Text>
        </View>

        {/* Formulario */}
        <View style={s.form}>
          <Text style={s.formLabel}>Correo electrónico</Text>
          <TextInput
            style={s.input}
            placeholder="tu@correo.com"
            placeholderTextColor="#555"
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            value={email}
            onChangeText={setEmail}
          />

          <Text style={s.formLabel}>Contraseña</Text>
          <View style={s.inputRow}>
            <TextInput
              style={[s.input, { flex: 1, marginBottom: 0 }]}
              placeholder="••••••••"
              placeholderTextColor="#555"
              secureTextEntry={!showPass}
              value={password}
              onChangeText={setPassword}
              onSubmitEditing={handleLogin}
              returnKeyType="go"
            />
            <TouchableOpacity style={s.eyeBtn} onPress={() => setShowPass(v => !v)}>
              <Text style={s.eyeText}>{showPass ? '🙈' : '👁️'}</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity style={[s.btn, loading && s.btnLoading]} onPress={handleLogin} disabled={loading}>
            {loading
              ? <ActivityIndicator color="#0f1117" />
              : <Text style={s.btnText}>Iniciar sesión</Text>}
          </TouchableOpacity>
        </View>

        <TouchableOpacity onPress={() => navigation.navigate('Register')}>
          <Text style={s.link}>¿No tienes cuenta? <Text style={{ color: '#00e5b4' }}>Regístrate gratis</Text></Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  outer:      { flex: 1, backgroundColor: '#0a0d14' },
  topGlow:    { position: 'absolute', top: -60, left: '50%', marginLeft: -100, width: 200, height: 200, borderRadius: 100, backgroundColor: '#00e5b430' },
  container:  { flex: 1, justifyContent: 'center', padding: 28 },
  logoWrap:   { alignItems: 'center', marginBottom: 44 },
  logoIcon:   { width: 72, height: 72, borderRadius: 24, backgroundColor: '#052e16', justifyContent: 'center', alignItems: 'center', marginBottom: 14, borderWidth: 1.5, borderColor: '#00e5b440' },
  bolt:       { fontSize: 36 },
  logoText:   { color: '#fff', fontSize: 38, fontWeight: '800', letterSpacing: -1 },
  tagline:    { color: '#555', fontSize: 14, marginTop: 6, textAlign: 'center' },
  form:       { marginBottom: 28 },
  formLabel:  { color: '#888', fontSize: 12, fontWeight: '600', marginBottom: 6, marginTop: 16, textTransform: 'uppercase', letterSpacing: 0.5 },
  input:      { backgroundColor: '#1a1d27', color: '#fff', borderRadius: 12, padding: 16, fontSize: 15, marginBottom: 4, borderWidth: 1, borderColor: '#252830' },
  inputRow:   { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  eyeBtn:     { backgroundColor: '#1a1d27', borderRadius: 12, padding: 16, borderWidth: 1, borderColor: '#252830' },
  eyeText:    { fontSize: 16 },
  btn:        { backgroundColor: '#00e5b4', borderRadius: 14, padding: 17, alignItems: 'center', marginTop: 24 },
  btnLoading: { opacity: 0.7 },
  btnText:    { color: '#0f1117', fontWeight: '800', fontSize: 16 },
  link:       { color: '#555', textAlign: 'center', fontSize: 14 },
});
