import React, { useMemo, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import Slider from '@react-native-community/slider';
import { InputField } from '../components/InputField';
import { PrimaryButton } from '../components/PrimaryButton';
import { SkeuoCard } from '../components/SkeuoCard';
import { Colors } from '../theme/colors';
import { Typography } from '../theme/typography';
import { createMembersForProduct, createProduct } from '../db/repository';
import { useNavigation } from '@react-navigation/native';

export const CreateCardScreen = () => {
  const navigation = useNavigation<any>();
  const [title, setTitle] = useState('');
  const [totalAmount, setTotalAmount] = useState('');
  const [membersCount, setMembersCount] = useState(5);
  const [autoSplit, setAutoSplit] = useState(true);
  const [manualSplit, setManualSplit] = useState('');
  const [deadline, setDeadline] = useState('');
  const [notes, setNotes] = useState('');

  const splitAmount = useMemo(() => {
    const total = Number(totalAmount) || 0;
    return membersCount > 0 ? Number((total / membersCount).toFixed(2)) : 0;
  }, [totalAmount, membersCount]);

  const onSave = async () => {
    if (!title.trim()) {
      Alert.alert('Missing name', 'Product name is required.');
      return;
    }
    const total = Number(totalAmount);
    if (!Number.isFinite(total) || total <= 0) {
      Alert.alert('Invalid total', 'Total amount must be a positive number.');
      return;
    }
    const split = autoSplit ? splitAmount : Number(manualSplit) || splitAmount;
    const created = await createProduct({
      title: title.trim(),
      description: notes.trim() || null,
      total_amount: total,
      members_count: membersCount,
      split_amount: split,
      deadline: deadline.trim() || null,
    });
    await createMembersForProduct(created.product_id, membersCount, split);
    navigation.navigate('CardDetails', { productId: created.product_id });
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Create Contribution Card</Text>
      <SkeuoCard>
        <InputField label="Product Name" value={title} onChangeText={setTitle} placeholder="e.g. Rice Fund" />
        <InputField label="Total Amount" value={totalAmount} onChangeText={setTotalAmount} keyboardType="numeric" />
        <View style={styles.sliderBlock}>
          <Text style={styles.label}>Members Count: {membersCount}</Text>
          <Slider
            minimumValue={1}
            maximumValue={100}
            step={1}
            value={membersCount}
            onValueChange={setMembersCount}
            minimumTrackTintColor={Colors.accent}
            maximumTrackTintColor={Colors.border}
          />
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Auto Split</Text>
          <Switch value={autoSplit} onValueChange={setAutoSplit} />
        </View>
        {autoSplit ? (
          <Text style={styles.splitLabel}>Split Amount: {splitAmount}</Text>
        ) : (
          <InputField label="Split Amount" value={manualSplit} onChangeText={setManualSplit} keyboardType="numeric" />
        )}
        <InputField label="Deadline (optional)" value={deadline} onChangeText={setDeadline} placeholder="YYYY-MM-DD" />
        <InputField label="Notes (optional)" value={notes} onChangeText={setNotes} multiline />
        <PrimaryButton title="Create Card" onPress={onSave} />
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
    fontSize: 26,
    color: Colors.textPrimary,
    marginBottom: 12,
  },
  sliderBlock: {
    marginBottom: 12,
  },
  label: {
    color: Colors.textSecondary,
    marginBottom: 6,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  splitLabel: {
    color: Colors.textSecondary,
    marginBottom: 12,
  },
});

