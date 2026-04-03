import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Colors } from '../theme/colors';

export const ProgressBar: React.FC<{ progress: number }> = ({ progress }) => (
  <View style={styles.track}>
    <View style={[styles.bar, { width: `${Math.min(100, Math.max(0, progress * 100))}%` }]} />
  </View>
);

const styles = StyleSheet.create({
  track: {
    height: 10,
    backgroundColor: Colors.surfaceAlt,
    borderRadius: 10,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  bar: {
    height: '100%',
    backgroundColor: Colors.accent,
  },
});
