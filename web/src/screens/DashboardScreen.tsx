import React, { useCallback, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { SkeuoCard } from '../components/SkeuoCard';
import { PrimaryButton } from '../components/PrimaryButton';
import { ProgressBar } from '../components/ProgressBar';
import { Colors } from '../theme/colors';
import { Typography } from '../theme/typography';
import { getProductSummaries, ProductSummary } from '../db/repository';

export const DashboardScreen = () => {
  const navigation = useNavigation<any>();
  const [cards, setCards] = useState<ProductSummary[]>([]);
  const [query, setQuery] = useState('');

  const load = useCallback(async () => {
    const data = await getProductSummaries();
    setCards(data);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const filtered = cards.filter(c => c.title.toLowerCase().includes(query.toLowerCase()));
  const total = cards.length;
  const completed = cards.filter(c => c.paid_members >= c.total_members && c.total_members > 0).length;
  const active = total - completed;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Dashboard</Text>
        <Pressable onPress={() => navigation.navigate('Settings')}>
          <Text style={styles.link}>Settings</Text>
        </Pressable>
      </View>
      <View style={styles.statsRow}>
        <SkeuoCard style={styles.statCard}><Text style={styles.statValue}>{total}</Text><Text style={styles.statLabel}>Total Cards</Text></SkeuoCard>
        <SkeuoCard style={styles.statCard}><Text style={styles.statValue}>{active}</Text><Text style={styles.statLabel}>Active</Text></SkeuoCard>
        <SkeuoCard style={styles.statCard}><Text style={styles.statValue}>{completed}</Text><Text style={styles.statLabel}>Completed</Text></SkeuoCard>
      </View>

      <TextInput
        style={styles.search}
        placeholder="Search cards"
        placeholderTextColor={Colors.textSecondary}
        value={query}
        onChangeText={setQuery}
      />

      <PrimaryButton title="Create New Card" onPress={() => navigation.navigate('CreateCard')} />

      <FlatList
        data={filtered}
        keyExtractor={item => item.product_id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => {
          const progress = item.total_members ? item.paid_members / item.total_members : 0;
          return (
            <Pressable onPress={() => navigation.navigate('CardDetails', { productId: item.product_id })}>
              <SkeuoCard style={styles.card}>
                <Text style={styles.cardTitle}>{item.title}</Text>
                <Text style={styles.cardMeta}>Members: {item.total_members} | Paid: {item.paid_members}</Text>
                <Text style={styles.cardMeta}>Total: {item.total_amount} | Collected: {item.total_collected}</Text>
                <ProgressBar progress={progress} />
              </SkeuoCard>
            </Pressable>
          );
        }}
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
    fontSize: 28,
    color: Colors.textPrimary,
  },
  link: {
    color: Colors.accent,
    fontWeight: '600',
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  statCard: {
    flex: 1,
    alignItems: 'center',
    marginHorizontal: 4,
  },
  statValue: {
    fontSize: 22,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  statLabel: {
    color: Colors.textSecondary,
  },
  search: {
    backgroundColor: Colors.surfaceAlt,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: Colors.textPrimary,
    marginBottom: 12,
  },
  list: {
    paddingTop: 12,
    paddingBottom: 80,
  },
  card: {
    marginBottom: 12,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: 4,
  },
  cardMeta: {
    color: Colors.textSecondary,
    marginBottom: 6,
  },
});
