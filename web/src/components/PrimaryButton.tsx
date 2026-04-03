import React from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { Colors } from '../theme/colors';
import { Typography } from '../theme/typography';

export const PrimaryButton: React.FC<{ title: string; onPress: () => void; disabled?: boolean }> = ({
  title,
  onPress,
  disabled,
}) => (
  <Pressable
    onPress={onPress}
    disabled={disabled}
    style={({ pressed }) => [styles.button, pressed && styles.pressed, disabled && styles.disabled]}
  >
    <Text style={styles.text}>{title}</Text>
  </Pressable>
);

const styles = StyleSheet.create({
  button: {
    backgroundColor: Colors.accent,
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: 14,
    alignItems: 'center',
    shadowColor: Colors.shadow,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18,
    shadowRadius: 12,
    elevation: 3,
  },
  pressed: {
    transform: [{ scale: 0.98 }],
  },
  disabled: {
    opacity: 0.5,
  },
  text: {
    color: '#fff',
    fontFamily: Typography.body,
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
});
