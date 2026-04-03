import React, { useCallback, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRoute } from '@react-navigation/native';
import Pdf from 'react-native-pdf';
import Share from 'react-native-share';
import { getMemberById, getProductById } from '../db/repository';
import { generateInvoicePdf } from '../services/invoiceService';
import { useAuth } from '../context/AuthContext';
import { Colors } from '../theme/colors';

export const InvoicePreviewScreen = () => {
  const route = useRoute<any>();
  const { memberId, productId } = route.params;
  const { masterProfile } = useAuth();
  const [filePath, setFilePath] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!masterProfile) return;
    const member = await getMemberById(memberId);
    const product = await getProductById(productId);
    if (!member || !product) return;
    const path = await generateInvoicePdf(product, member, masterProfile, member.signature_path);
    setFilePath(path || null);
  }, [memberId, productId, masterProfile]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const handleShare = async () => {
    if (!filePath) return;
    try {
      await Share.open({ url: `file://${filePath}` });
    } catch (e: any) {
      Alert.alert('Share failed', e.message || 'Unable to share invoice.');
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Invoice Preview</Text>
      {filePath ? (
        <Pdf source={{ uri: `file://${filePath}` }} style={styles.pdf} />
      ) : (
        <Text style={styles.loading}>Generating invoice...</Text>
      )}
      <Text style={styles.share} onPress={handleShare}>Share Invoice</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
    padding: 12,
  },
  title: {
    fontSize: 18,
    marginBottom: 8,
  },
  pdf: {
    flex: 1,
    borderRadius: 8,
    overflow: 'hidden',
  },
  loading: {
    color: Colors.textSecondary,
  },
  share: {
    marginTop: 8,
    color: Colors.accent,
  },
});
