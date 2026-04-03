import React, { useEffect, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { InputField } from '../components/InputField';
import { PrimaryButton } from '../components/PrimaryButton';
import { SkeuoCard } from '../components/SkeuoCard';
import { Colors } from '../theme/colors';
import { Typography } from '../theme/typography';
import { useAuth } from '../context/AuthContext';
import { getSetting, setSetting } from '../db/settings';
import ReactNativeBiometrics from 'react-native-biometrics';

const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 30 * 1000;

export const PinUnlockScreen = () => {
  const { unlockWithPin, unlockWithoutPin } = useAuth();
  const [pin, setPin] = useState('');
  const [attempts, setAttempts] = useState(0);
  const [lockoutUntil, setLockoutUntil] = useState<number | null>(null);
  const [biometricEnabled, setBiometricEnabled] = useState(false);

  useEffect(() => {
    const load = async () => {
      const lockout = await getSetting('lockout_until');
      const attemptsRaw = await getSetting('failed_attempts');
      const bio = await getSetting('biometric_enabled');
      if (lockout) setLockoutUntil(Number(lockout));
      if (attemptsRaw) setAttempts(Number(attemptsRaw));
      setBiometricEnabled(bio === 'true');
    };
    load();
  }, []);

  useEffect(() => {
    if (!lockoutUntil) return;
    const id = setInterval(() => {
      if (Date.now() >= lockoutUntil) {
        setLockoutUntil(null);
        setSetting('lockout_until', null);
        setAttempts(0);
        setSetting('failed_attempts', '0');
      }
    }, 500);
    return () => clearInterval(id);
  }, [lockoutUntil]);

  const handleUnlock = async () => {
    if (lockoutUntil && Date.now() < lockoutUntil) return;
    if (!/^\d{4,6}$/.test(pin)) {
      Alert.alert('Invalid PIN', 'PIN must be 4-6 digits.');
      return;
    }
    const ok = await unlockWithPin(pin);
    if (!ok) {
      const next = attempts + 1;
      setAttempts(next);
      await setSetting('failed_attempts', String(next));
      if (next >= MAX_ATTEMPTS) {
        const until = Date.now() + LOCKOUT_MS;
        setLockoutUntil(until);
        await setSetting('lockout_until', String(until));
        Alert.alert('Locked', 'Too many attempts. Locked for 30 seconds.');
      } else {
        Alert.alert('Incorrect PIN', `Attempts left: ${MAX_ATTEMPTS - next}`);
      }
    }
  };

  const handleBiometric = async () => {
    if (!biometricEnabled) return;
    const rnBiometrics = new ReactNativeBiometrics();
    const { available } = await rnBiometrics.isSensorAvailable();
    if (!available) {
      Alert.alert('Biometric Unavailable', 'No biometric sensor detected.');
      return;
    }
    const result = await rnBiometrics.simplePrompt({ promptMessage: 'Unlock CounterX' });
    if (result.success) {
      unlockWithoutPin();
    }
  };

  const isLocked = lockoutUntil !== null && Date.now() < lockoutUntil;
  const remaining = lockoutUntil ? Math.max(0, Math.ceil((lockoutUntil - Date.now()) / 1000)) : 0;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Enter PIN</Text>
      <Text style={styles.subtitle}>Secure access to your master records.</Text>
      <SkeuoCard>
        <InputField label="PIN" value={pin} onChangeText={setPin} keyboardType="numeric" secureTextEntry />
        {isLocked && <Text style={styles.locked}>Locked for {remaining}s</Text>}
        <PrimaryButton title="Unlock" onPress={handleUnlock} disabled={isLocked} />
        {biometricEnabled && (
          <View style={{ marginTop: 12 }}>
            <PrimaryButton title="Use Biometrics" onPress={handleBiometric} />
          </View>
        )}
      </SkeuoCard>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: Colors.background,
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
  locked: {
    color: Colors.danger,
    marginBottom: 8,
  },
});
