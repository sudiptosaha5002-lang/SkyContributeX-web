import React, { useCallback, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import { SkeuoCard } from '../components/SkeuoCard';
import { PrimaryButton } from '../components/PrimaryButton';
import { ProgressBar } from '../components/ProgressBar';
import { Colors } from '../theme/colors';
import { Typography } from '../theme/typography';
import { getMembersByProduct, getProductById } from '../db/repository';
import { Member, Product } from '../types/models';
import { exportCardToExcel } from '../services/exportService';
import Share from 'react-native-share';

export const CardDetailsScreen = () => {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { productId } = route.params;
  const [product, setProduct] = useState<Product | null>(null);
  const [members, setMembers] = useState<Member[]>([]);

  const load = useCallback(async () => {
    const p = await getProductById(productId);
    const m = await getMembersByProduct(productId);
    setProduct(p);
    setMembers(m);
  }, [productId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  if (!product) return null;

  const paidMembers = members.filter(m => m.status === 'PAID').length;
  const totalCollected = members.reduce((sum, m) => sum + m.amount_paid, 0);
  const progress = members.length ? paidMembers / members.length : 0;

  const handleExport = async () => {
    try {
      const path = await exportCardToExcel(product, members);
      await Share.open({ url: `file://${path}` });
    } catch (e: any) {
      Alert.alert('Export failed', e.message || 'Unable to export.');
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>{product.title}</Text>
        <Pressable onPress={() => navigation.goBack()}>
          <Text style={styles.link}>Back</Text>
        </Pressable>
      </View>
      <SkeuoCard style={styles.summary}>
        <Text style={styles.meta}>Total Amount: {product.total_amount}</Text>
        <Text style={styles.meta}>Members: {members.length}</Text>
        <Text style={styles.meta}>Paid: {paidMembers}</Text>
        <Text style={styles.meta}>Collected: {totalCollected}</Text>
        <ProgressBar progress={progress} />
      </SkeuoCard>
      <PrimaryButton title="Export to Excel" onPress={handleExport} />

      <FlatList
        data={members}
        keyExtractor={item => item.member_id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <Pressable onPress={() => navigation.navigate('MemberEdit', { memberId: item.member_id, productId })}>
            <SkeuoCard style={styles.memberCard}>
              <Text style={styles.memberName}>{item.name}</Text>
              <Text style={styles.meta}>Due: {item.amount_due} | Paid: {item.amount_paid}</Text>
              <Text style={[styles.status, item.status === 'PAID' ? styles.paid : styles.pending]}>
                {item.status}
              </Text>
            </SkeuoCard>
          </Pressable>
        )}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
    padding: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  title: {
    fontFamily: Typography.heading,
    fontSize: 24,
    color: Colors.textPrimary,
  },
  link: {
    color: Colors.accent,
  },
  summary: {
    marginBottom: 12,
  },
  meta: {
    color: Colors.textSecondary,
    marginBottom: 4,
  },
  list: {
    paddingTop: 12,
    paddingBottom: 60,
  },
  memberCard: {
    marginBottom: 10,
  },
  memberName: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  status: {
    marginTop: 6,
    fontWeight: '700',
  },
  paid: {
    color: Colors.success,
  },
  pending: {
    color: Colors.warning,
  },
});
