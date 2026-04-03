import React, { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { InputField } from '../components/InputField';
import { PrimaryButton } from '../components/PrimaryButton';
import { SkeuoCard } from '../components/SkeuoCard';
import { Colors } from '../theme/colors';
import { Typography } from '../theme/typography';
import { useAuth } from '../context/AuthContext';

export const PinSetupScreen = () => {
  const { completeSetup } = useAuth();
  const [pin, setPin] = useState('');
  const [confirm, setConfirm] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');

  const onSubmit = async () => {
    if (!/^\d{4,6}$/.test(pin)) {
      Alert.alert('Invalid PIN', 'PIN must be 4-6 digits.');
      return;
    }
    if (pin !== confirm) {
      Alert.alert('PIN mismatch', 'PIN confirmation does not match.');
      return;
    }
    if (!name.trim() || !email.trim()) {
      Alert.alert('Missing info', 'Name and email are required.');
      return;
    }
    await completeSetup(pin, { name: name.trim(), email: email.trim(), phone: phone.trim() || null });
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>CounterX Setup</Text>
      <Text style={styles.subtitle}>Create your secure master PIN and profile.</Text>
      <SkeuoCard style={styles.card}>
        <InputField label="Set PIN (4-6 digits)" value={pin} onChangeText={setPin} keyboardType="numeric" secureTextEntry />
        <InputField label="Confirm PIN" value={confirm} onChangeText={setConfirm} keyboardType="numeric" secureTextEntry />
        <InputField label="Master Name" value={name} onChangeText={setName} placeholder="Full name" />
        <InputField label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" />
        <InputField label="Phone (optional)" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
        <PrimaryButton title="Finish Setup" onPress={onSubmit} />
      </SkeuoCard>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    padding: 20,
  },
  title: {
    fontFamily: Typography.heading,
    fontSize: 28,
    color: Colors.textPrimary,
    marginBottom: 6,
  },
  subtitle: {
    color: Colors.textSecondary,
    marginBottom: 18,
  },
  card: {},
});
