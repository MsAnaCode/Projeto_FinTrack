import { Pressable, StyleSheet, Text, type ButtonProps } from 'react-native';
import { colors } from '../theme';

export default function ActionButton({ title, onPress, disabled, accessibilityLabel, testID }: ButtonProps) {
  const danger = /excluir|desconectar/i.test(title);
  const secondary = /cancelar|sair|fechar/i.test(title);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityState={{ disabled: !!disabled }}
      testID={testID}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        danger && styles.danger,
        secondary && styles.secondary,
        pressed && styles.pressed,
        disabled && styles.disabled,
      ]}
    >
      <Text style={[styles.label, danger && styles.dangerLabel, secondary && styles.secondaryLabel]}>
        {title}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 46,
    backgroundColor: colors.primary,
    borderRadius: 14,
    paddingHorizontal: 18,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.primary,
  },
  label: {
    color: '#041320',
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'center',
    letterSpacing: 0.2,
  },
  secondary: {
    backgroundColor: colors.surfaceCard,
    borderColor: colors.borderSubtle,
  },
  secondaryLabel: {
    color: colors.ink,
    fontWeight: '600',
  },
  danger: {
    backgroundColor: 'rgba(244, 63, 94, 0.14)',
    borderColor: 'rgba(244, 63, 94, 0.35)',
  },
  dangerLabel: {
    color: colors.expense,
    fontWeight: '700',
  },
  pressed: {
    opacity: 0.78,
  },
  disabled: {
    opacity: 0.4,
  },
});

