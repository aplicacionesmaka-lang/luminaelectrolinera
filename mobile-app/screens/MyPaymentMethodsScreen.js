import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  ActivityIndicator, Alert, Modal, TextInput, Switch,
} from 'react-native';
import { paymentMethods, payments } from '../services/api';

const FRANCHISES = ['Visa', 'Mastercard', 'Amex', 'Diners'];
const TYPES      = ['Débito', 'Crédito'];

const FRANCHISE_COLOR = {
  Visa:       { bg: '#1a1f71', text: '#fff' },
  Mastercard: { bg: '#eb001b', text: '#fff' },
  Amex:       { bg: '#016fd0', text: '#fff' },
  Diners:     { bg: '#004a97', text: '#fff' },
};

function CardVisual({ method }) {
  const fc = FRANCHISE_COLOR[method.franchise] || { bg: '#334155', text: '#fff' };
  const isCredit = method.type === 'credit';
  return (
    <View style={[cv.card, { backgroundColor: fc.bg }]}>
      <View style={cv.top}>
        <Text style={[cv.franchise, { color: fc.text }]}>{method.franchise}</Text>
        {method.is_favorite && <View style={cv.favBadge}><Text style={cv.favText}>★ Favorita</Text></View>}
      </View>
      <Text style={[cv.number, { color: fc.text }]}>•••• •••• •••• {method.last_four}</Text>
      <View style={cv.bottom}>
        <Text style={[cv.holder, { color: fc.text + 'cc' }]}>{method.holder_name || '—'}</Text>
        <Text style={[cv.type, { color: fc.text + 'cc' }]}>{isCredit ? 'Crédito' : 'Débito'}</Text>
      </View>
    </View>
  );
}

export default function MyPaymentMethodsScreen({ navigation }) {
  const [methods,   setMethods]   = useState([]);
  const [history,   setHistory]   = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [showAdd,   setShowAdd]   = useState(false);
  const [form,      setForm]      = useState({ franchise: 'Visa', type: 'Débito', lastFour: '', holderName: '', expMonth: '', expYear: '', installments: 1 });
  const [saving,    setSaving]    = useState(false);

  const load = useCallback(async () => {
    try {
      const [m, h] = await Promise.all([paymentMethods.list(), payments.history().catch(() => [])]);
      setMethods(Array.isArray(m) ? m : []);
      setHistory(Array.isArray(h) ? h.slice(0, 10) : []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const set = k => v => setForm(p => ({ ...p, [k]: v }));

  async function handleAdd() {
    if (!form.lastFour || form.lastFour.length !== 4)
      return Alert.alert('Error', 'Ingresa los últimos 4 dígitos');
    setSaving(true);
    try {
      await paymentMethods.add({
        franchise:   form.franchise,
        type:        form.type === 'Crédito' ? 'credit' : 'debit',
        lastFour:    form.lastFour,
        holderName:  form.holderName,
        expMonth:    parseInt(form.expMonth) || null,
        expYear:     parseInt(form.expYear)  || null,
      });
      setShowAdd(false);
      setForm({ franchise: 'Visa', type: 'Débito', lastFour: '', holderName: '', expMonth: '', expYear: '' });
      load();
    } catch (err) {
      Alert.alert('Error', err.error || 'No se pudo agregar');
    } finally {
      setSaving(false);
    }
  }

  async function handleFavorite(id) {
    await paymentMethods.setFavorite(id);
    load();
  }

  async function handleToggle(id, active) {
    await paymentMethods.toggle(id);
    load();
  }

  async function handleDelete(id) {
    Alert.alert('Eliminar tarjeta', '¿Confirmas?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Eliminar', style: 'destructive', onPress: async () => { await paymentMethods.remove(id); load(); } },
    ]);
  }

  const fmt = iso => iso ? new Date(iso).toLocaleDateString('es-CO', { day:'2-digit', month:'short', year:'2-digit' }) : '—';
  const cop = n => `$${Math.round(n || 0).toLocaleString('es-CO')} COP`;

  if (loading) return <View style={s.center}><ActivityIndicator color="#7c3aed" size="large" /></View>;

  return (
    <ScrollView style={s.container} contentContainerStyle={{ paddingBottom: 40 }}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={s.back}>←  Volver</Text>
        </TouchableOpacity>
        <Text style={s.title}>Medios de Pago</Text>
        <TouchableOpacity style={s.addBtn} onPress={() => setShowAdd(true)}>
          <Text style={s.addBtnText}>+ Agregar</Text>
        </TouchableOpacity>
      </View>

      {/* Tarjetas */}
      {methods.length === 0 ? (
        <View style={s.emptyCard}>
          <Text style={s.emptyIcon}>💳</Text>
          <Text style={s.emptyText}>No tienes tarjetas registradas</Text>
          <TouchableOpacity style={s.emptyBtn} onPress={() => setShowAdd(true)}>
            <Text style={s.emptyBtnText}>Agregar tarjeta</Text>
          </TouchableOpacity>
        </View>
      ) : methods.map(m => (
        <View key={m.id} style={s.methodWrap}>
          <CardVisual method={m} />
          {!m.active && (
            <View style={s.inactiveBanner}>
              <Text style={s.inactiveBannerText}>Tarjeta inactiva</Text>
            </View>
          )}
          <View style={s.actions}>
            {!m.is_favorite && m.active && (
              <TouchableOpacity style={s.actionBtn} onPress={() => handleFavorite(m.id)}>
                <Text style={s.actionBtnText}>★ Marcar favorita</Text>
              </TouchableOpacity>
            )}
            <View style={s.toggleRow}>
              <Text style={s.toggleLabel}>{m.active ? 'Activa' : 'Inactiva'}</Text>
              <Switch
                value={m.active}
                onValueChange={() => handleToggle(m.id, m.active)}
                trackColor={{ false: '#e2e8f0', true: '#7c3aed' }}
                thumbColor="#fff"
              />
            </View>
            <TouchableOpacity style={s.deleteBtn} onPress={() => handleDelete(m.id)}>
              <Text style={s.deleteBtnText}>Eliminar</Text>
            </TouchableOpacity>
          </View>

          {/* Cuotas solo para crédito */}
          {m.type === 'credit' && m.active && (
            <View style={s.installSection}>
              <Text style={s.installTitle}>Cuotas para próxima recarga:</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                {[1,3,6,12,24,36].map(n => (
                  <TouchableOpacity key={n} style={[s.installChip, form.installments === n && s.installChipActive]} onPress={() => set('installments')(n)}>
                    <Text style={[s.installText, form.installments === n && s.installTextActive]}>{n === 1 ? 'Contado' : `${n} cuotas`}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          )}
        </View>
      ))}

      {/* Últimos movimientos */}
      {history.length > 0 && (
        <View style={s.card}>
          <Text style={s.cardTitle}>Últimos movimientos</Text>
          {history.map(h => (
            <View key={h.id} style={s.movRow}>
              <View style={{ flex: 1 }}>
                <Text style={s.movDesc}>Recarga de saldo</Text>
                <Text style={s.movDate}>{fmt(h.created_at || h.createdAt)}</Text>
              </View>
              <View style={[s.movBadge, { backgroundColor: h.status === 'Approved' ? '#dcfce7' : '#fef9c3' }]}>
                <Text style={[s.movStatus, { color: h.status === 'Approved' ? '#15803d' : '#92400e' }]}>{h.status}</Text>
              </View>
              <Text style={s.movAmount}>{cop(h.amount)}</Text>
            </View>
          ))}
        </View>
      )}

      {/* Modal agregar tarjeta */}
      <Modal visible={showAdd} animationType="slide" presentationStyle="pageSheet">
        <View style={m.container}>
          <View style={m.mHeader}>
            <TouchableOpacity onPress={() => setShowAdd(false)}>
              <Text style={m.mClose}>✕</Text>
            </TouchableOpacity>
            <Text style={m.mTitle}>Nueva tarjeta</Text>
            <View style={{ width: 24 }} />
          </View>

          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 20 }}>
            <Text style={m.label}>Franquicia</Text>
            <View style={m.chips}>
              {FRANCHISES.map(f => (
                <TouchableOpacity key={f} style={[m.chip, form.franchise === f && m.chipActive]} onPress={() => set('franchise')(f)}>
                  <Text style={[m.chipText, form.franchise === f && m.chipTextActive]}>{f}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={m.label}>Tipo</Text>
            <View style={m.chips}>
              {TYPES.map(t => (
                <TouchableOpacity key={t} style={[m.chip, form.type === t && m.chipActive]} onPress={() => set('type')(t)}>
                  <Text style={[m.chipText, form.type === t && m.chipTextActive]}>{t}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={m.label}>Nombre del titular</Text>
            <TextInput style={m.input} placeholder="Como aparece en la tarjeta" placeholderTextColor="#94a3b8" value={form.holderName} onChangeText={set('holderName')} autoCapitalize="characters" />

            <Text style={m.label}>Últimos 4 dígitos</Text>
            <TextInput style={m.input} placeholder="0000" placeholderTextColor="#94a3b8" keyboardType="numeric" maxLength={4} value={form.lastFour} onChangeText={set('lastFour')} />

            <View style={{ flexDirection: 'row', gap: 12 }}>
              <View style={{ flex: 1 }}>
                <Text style={m.label}>Mes venc.</Text>
                <TextInput style={m.input} placeholder="MM" placeholderTextColor="#94a3b8" keyboardType="numeric" maxLength={2} value={form.expMonth} onChangeText={set('expMonth')} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={m.label}>Año venc.</Text>
                <TextInput style={m.input} placeholder="AAAA" placeholderTextColor="#94a3b8" keyboardType="numeric" maxLength={4} value={form.expYear} onChangeText={set('expYear')} />
              </View>
            </View>

            <TouchableOpacity style={[m.saveBtn, saving && { opacity: 0.7 }]} onPress={handleAdd} disabled={saving}>
              {saving ? <ActivityIndicator color="#fff" /> : <Text style={m.saveBtnText}>Guardar tarjeta</Text>}
            </TouchableOpacity>
          </ScrollView>
        </View>
      </Modal>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container:        { flex: 1, backgroundColor: '#f8fafc' },
  center:           { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f8fafc' },
  header:           { flexDirection: 'row', alignItems: 'center', padding: 20, paddingTop: 56, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e2e8f0', marginBottom: 16, gap: 10 },
  back:             { color: '#7c3aed', fontSize: 15, fontWeight: '700' },
  title:            { flex: 1, color: '#1e293b', fontSize: 18, fontWeight: '800' },
  addBtn:           { backgroundColor: '#7c3aed', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 7 },
  addBtnText:       { color: '#fff', fontWeight: '700', fontSize: 13 },
  methodWrap:       { marginHorizontal: 16, marginBottom: 16 },
  actions:          { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 12, padding: 12, gap: 10, marginTop: 8, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, elevation: 1 },
  actionBtn:        { backgroundColor: '#f5f3ff', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6 },
  actionBtnText:    { color: '#7c3aed', fontWeight: '700', fontSize: 12 },
  toggleRow:        { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, justifyContent: 'flex-end' },
  toggleLabel:      { color: '#64748b', fontSize: 13 },
  deleteBtn:        { borderWidth: 1, borderColor: '#fca5a5', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6 },
  deleteBtnText:    { color: '#dc2626', fontWeight: '700', fontSize: 12 },
  inactiveBanner:   { backgroundColor: '#fef2f2', borderRadius: 8, padding: 8, marginTop: 6, alignItems: 'center' },
  inactiveBannerText:{ color: '#dc2626', fontWeight: '700', fontSize: 12 },
  installSection:   { backgroundColor: '#f5f3ff', borderRadius: 12, padding: 12, marginTop: 6 },
  installTitle:     { color: '#7c3aed', fontWeight: '700', fontSize: 13, marginBottom: 8 },
  installChip:      { borderWidth: 1.5, borderColor: '#ddd6fe', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 7, marginRight: 8 },
  installChipActive:{ backgroundColor: '#7c3aed', borderColor: '#7c3aed' },
  installText:      { color: '#6b7280', fontWeight: '600', fontSize: 13 },
  installTextActive:{ color: '#fff' },
  emptyCard:        { alignItems: 'center', backgroundColor: '#fff', marginHorizontal: 16, borderRadius: 20, padding: 40 },
  emptyIcon:        { fontSize: 48, marginBottom: 12 },
  emptyText:        { color: '#94a3b8', fontSize: 15, marginBottom: 20 },
  emptyBtn:         { backgroundColor: '#7c3aed', borderRadius: 14, paddingHorizontal: 24, paddingVertical: 12 },
  emptyBtnText:     { color: '#fff', fontWeight: '800', fontSize: 15 },
  card:             { backgroundColor: '#fff', marginHorizontal: 16, borderRadius: 16, padding: 18, marginBottom: 14, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8, elevation: 2 },
  cardTitle:        { color: '#1e293b', fontSize: 16, fontWeight: '800', marginBottom: 12 },
  movRow:           { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#f1f5f9', gap: 10 },
  movDesc:          { color: '#1e293b', fontWeight: '600', fontSize: 14 },
  movDate:          { color: '#94a3b8', fontSize: 12 },
  movBadge:         { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  movStatus:        { fontSize: 11, fontWeight: '700' },
  movAmount:        { color: '#1e293b', fontWeight: '700', fontSize: 14 },
});

const cv = StyleSheet.create({
  card:      { borderRadius: 18, padding: 22, height: 150, justifyContent: 'space-between' },
  top:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  franchise: { fontSize: 18, fontWeight: '900', letterSpacing: 1 },
  favBadge:  { backgroundColor: '#ffffff30', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 },
  favText:   { color: '#fff', fontWeight: '700', fontSize: 11 },
  number:    { fontSize: 20, fontWeight: '700', letterSpacing: 3 },
  bottom:    { flexDirection: 'row', justifyContent: 'space-between' },
  holder:    { fontSize: 13, fontWeight: '600' },
  type:      { fontSize: 13, fontWeight: '600' },
});

const m = StyleSheet.create({
  container:    { flex: 1, backgroundColor: '#fff' },
  mHeader:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 20, paddingTop: 24, borderBottomWidth: 1, borderBottomColor: '#e2e8f0' },
  mClose:       { color: '#64748b', fontSize: 20, fontWeight: '700' },
  mTitle:       { color: '#1e293b', fontSize: 18, fontWeight: '800' },
  label:        { color: '#64748b', fontSize: 12, fontWeight: '700', marginBottom: 8, marginTop: 16, textTransform: 'uppercase', letterSpacing: 0.5 },
  chips:        { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 4 },
  chip:         { borderWidth: 1.5, borderColor: '#e2e8f0', borderRadius: 20, paddingHorizontal: 16, paddingVertical: 8 },
  chipActive:   { backgroundColor: '#7c3aed', borderColor: '#7c3aed' },
  chipText:     { color: '#64748b', fontWeight: '600', fontSize: 13 },
  chipTextActive:{ color: '#fff' },
  input:        { backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 12, padding: 14, color: '#1e293b', fontSize: 15 },
  saveBtn:      { backgroundColor: '#7c3aed', borderRadius: 14, padding: 18, alignItems: 'center', marginTop: 24 },
  saveBtnText:  { color: '#fff', fontWeight: '800', fontSize: 16 },
});
