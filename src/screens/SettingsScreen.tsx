import React, { useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { InputField } from '../components/InputField';
import { PrimaryButton } from '../components/PrimaryButton';
import { SkeuoCard } from '../components/SkeuoCard';
import { Colors } from '../theme/colors';
import { Typography } from '../theme/typography';
import { useAuth } from '../context/AuthContext';
import { getSetting, setSetting } from '../db/settings';
import { createBackup, restoreBackup } from '../services/backupService';
import Share from 'react-native-share';
import DocumentPicker from 'react-native-document-picker';

export const SettingsScreen = () => {
  const { masterProfile, refreshProfile, lock } = useAuth();
  const [name, setName] = useState(masterProfile?.name || '');
  const [email, setEmail] = useState(masterProfile?.email || '');
  const [phone, setPhone] = useState(masterProfile?.phone || '');
  const [biometricEnabled, setBiometricEnabled] = useState(false);

  useEffect(() => {
    const load = async () => {
      const bio = await getSetting('biometric_enabled');
      setBiometricEnabled(bio === 'true');
    };
    load();
  }, []);

  const saveProfile = async () => {
    await setSetting('master_profile', JSON.stringify({ name, email, phone }));
    await refreshProfile();
    Alert.alert('Saved', 'Master profile updated.');
  };

  const toggleBiometric = async (value: boolean) => {
    setBiometricEnabled(value);
    await setSetting('biometric_enabled', value ? 'true' : 'false');
  };

  const handleBackup = async () => {
    try {
      const path = await createBackup();
      await Share.open({ url: `file://${path}` });
    } catch (e: any) {
      Alert.alert('Backup failed', e.message || 'Unable to create backup.');
    }
  };

  const handleRestore = async () => {
    try {
      const res = await DocumentPicker.pick({ type: [DocumentPicker.types.plainText, DocumentPicker.types.allFiles] });
      const file = res[0];
      if (!file?.uri) return;
      await restoreBackup(file.uri, 'replace');
      Alert.alert('Restore complete', 'Data restored from backup.');
    } catch (e: any) {
      if (DocumentPicker.isCancel(e)) return;
      Alert.alert('Restore failed', e.message || 'Unable to restore backup.');
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Settings</Text>
      <SkeuoCard>
        <Text style={styles.section}>Master Profile</Text>
        <InputField label="Name" value={name} onChangeText={setName} />
        <InputField label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" />
        <InputField label="Phone" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
        <PrimaryButton title="Save Profile" onPress={saveProfile} />
      </SkeuoCard>

      <SkeuoCard style={styles.block}>
        <Text style={styles.section}>Security</Text>
        <View style={styles.row}>
          <Text style={styles.label}>Enable Biometrics</Text>
          <Switch value={biometricEnabled} onValueChange={toggleBiometric} />
        </View>
        <PrimaryButton title="Lock Now" onPress={lock} />
      </SkeuoCard>

      <SkeuoCard style={styles.block}>
        <Text style={styles.section}>Backup & Restore</Text>
        <PrimaryButton title="Create Backup" onPress={handleBackup} />
        <View style={{ height: 10 }} />
        <PrimaryButton title="Restore Backup" onPress={handleRestore} />
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
    padding: 16,
  },
  title: {
    fontFamily: Typography.heading,
    fontSize: 24,
    color: Colors.textPrimary,
    marginBottom: 6,
  },
  section: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 10,
    color: Colors.textPrimary,
  },
  block: {
    marginTop: 12,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  label: {
    color: Colors.textSecondary,
  },
});
