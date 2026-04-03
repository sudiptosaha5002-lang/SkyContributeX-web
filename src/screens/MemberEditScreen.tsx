import React, { useCallback, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import { InputField } from '../components/InputField';
import { PrimaryButton } from '../components/PrimaryButton';
import { SkeuoCard } from '../components/SkeuoCard';
import { Colors } from '../theme/colors';
import { Typography } from '../theme/typography';
import { getMemberById, updateMember } from '../db/repository';
import { Member } from '../types/models';
import { saveImageProof, savePdfProof, saveSignatureImage } from '../storage/fileStore';
import { launchCamera, launchImageLibrary } from 'react-native-image-picker';
import DocumentPicker from 'react-native-document-picker';
import SignatureScreen from 'react-native-signature-canvas';
import { nowIso } from '../utils/format';

export const MemberEditScreen = () => {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { memberId, productId } = route.params;
  const [member, setMember] = useState<Member | null>(null);
  const [showSignature, setShowSignature] = useState(false);

  const load = useCallback(async () => {
    const m = await getMemberById(memberId);
    if (m) setMember(m);
  }, [memberId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  if (!member) return null;

  const updateField = (key: keyof Member, value: any) => {
    setMember(prev => (prev ? { ...prev, [key]: value } : prev));
  };

  const handleSave = async () => {
    const amountPaid = Number(member.amount_paid);
    const amountDue = Number(member.amount_due);
    const status = amountPaid >= amountDue ? 'PAID' : 'PENDING';
    const updated = { ...member, amount_paid: amountPaid, amount_due: amountDue, status, submitted_at: nowIso() };
    await updateMember(updated);
    navigation.goBack();
  };

  const handleImageProof = async (source: 'camera' | 'gallery') => {
    try {
      const result = source === 'camera'
        ? await launchCamera({ mediaType: 'photo', quality: 0.8 })
        : await launchImageLibrary({ mediaType: 'photo', quality: 0.8 });
      const asset = result.assets?.[0];
      if (!asset?.uri) return;
      const path = await saveImageProof(asset.uri);
      updateField('proof_path', path);
    } catch (e: any) {
      Alert.alert('Proof upload failed', e.message || 'Unable to upload proof.');
    }
  };

  const handlePdfProof = async () => {
    try {
      const res = await DocumentPicker.pick({ type: [DocumentPicker.types.pdf] });
      const file = res[0];
      if (!file?.uri) return;
      const sourceUri = (file as any).fileCopyUri || file.uri;
      const path = await savePdfProof(sourceUri);
      updateField('proof_path', path);
    } catch (e: any) {
      if (DocumentPicker.isCancel(e)) return;
      Alert.alert('PDF upload failed', e.message || 'Unable to upload PDF.');
    }
  };

  const handleSignature = async (signature: string) => {
    try {
      const path = await saveSignatureImage(signature);
      updateField('signature_path', path);
      setShowSignature(false);
    } catch (e: any) {
      Alert.alert('Signature failed', e.message || 'Unable to save signature.');
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Edit Member</Text>
      <SkeuoCard>
        <InputField label="Name" value={member.name} onChangeText={v => updateField('name', v)} />
        <InputField label="Amount Due" value={String(member.amount_due)} onChangeText={v => updateField('amount_due', Number(v))} keyboardType="numeric" />
        <InputField label="Amount Paid" value={String(member.amount_paid)} onChangeText={v => updateField('amount_paid', Number(v))} keyboardType="numeric" />
        {!member.proof_path && <Text style={styles.warning}>Missing proof (optional but recommended)</Text>}
        <View style={styles.row}>
          <PrimaryButton title="Camera Proof" onPress={() => handleImageProof('camera')} />
        </View>
        <View style={styles.row}>
          <PrimaryButton title="Gallery Proof" onPress={() => handleImageProof('gallery')} />
        </View>
        <View style={styles.row}>
          <PrimaryButton title="PDF Proof" onPress={handlePdfProof} />
        </View>
        <View style={styles.row}>
          <PrimaryButton title="Add Signature" onPress={() => setShowSignature(true)} />
        </View>
        <View style={styles.row}>
          <PrimaryButton title="Generate Invoice" onPress={() => navigation.navigate('InvoicePreview', { memberId, productId })} />
        </View>
        <PrimaryButton title="Save" onPress={handleSave} />
      </SkeuoCard>

      <Modal visible={showSignature} animationType="slide">
        <View style={styles.signatureContainer}>
          <Text style={styles.signatureTitle}>Sign below</Text>
          <SignatureScreen
            onOK={handleSignature}
            onEmpty={() => Alert.alert('Signature', 'Please provide a signature.')}
            onClear={() => null}
            descriptionText=""
            webStyle={'.m-signature-pad--footer {display: none;}'}
          />
          <Pressable style={styles.signatureClose} onPress={() => setShowSignature(false)}>
            <Text style={styles.link}>Close</Text>
          </Pressable>
        </View>
      </Modal>
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
    marginBottom: 12,
  },
  warning: {
    color: Colors.warning,
    marginBottom: 8,
  },
  row: {
    marginBottom: 10,
  },
  signatureContainer: {
    flex: 1,
    padding: 12,
    backgroundColor: Colors.background,
  },
  signatureTitle: {
    fontSize: 18,
    marginBottom: 8,
  },
  signatureClose: {
    padding: 12,
    alignItems: 'center',
  },
  link: {
    color: Colors.accent,
  },
});
