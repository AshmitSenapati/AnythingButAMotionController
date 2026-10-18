import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Colors, Radii, Spacing } from '../constants/theme';

interface SensitivitySliderProps {
  value: number; // 0.5 to 2.5
  onChange: (val: number) => void;
}

const PRESETS = [
  { label: '0.7x', value: 0.7, caption: 'Precise' },
  { label: '1.0x', value: 1.0, caption: 'Normal' },
  { label: '1.5x', value: 1.5, caption: 'Fast' },
  { label: '2.0x', value: 2.0, caption: 'Nitro' },
];

export function SensitivitySlider({ value, onChange }: SensitivitySliderProps) {
  const stepDown = () => {
    const next = Math.max(0.5, Math.round((value - 0.1) * 10) / 10);
    onChange(next);
  };

  const stepUp = () => {
    const next = Math.min(2.5, Math.round((value + 0.1) * 10) / 10);
    onChange(next);
  };

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <View>
          <Text style={styles.eyebrow}>MOTION SENSITIVITY</Text>
          <Text style={styles.caption}>Response multiplier</Text>
        </View>

        <View style={styles.stepperContainer}>
          <TouchableOpacity
            style={styles.stepButton}
            onPress={stepDown}
            disabled={value <= 0.5}
            accessibilityLabel="Decrease Sensitivity"
          >
            <Text style={styles.stepButtonText}>−</Text>
          </TouchableOpacity>

          <View style={styles.valueBadge}>
            <Text style={styles.valueText}>{value.toFixed(1)}x</Text>
          </View>

          <TouchableOpacity
            style={styles.stepButton}
            onPress={stepUp}
            disabled={value >= 2.5}
            accessibilityLabel="Increase Sensitivity"
          >
            <Text style={styles.stepButtonText}>+</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.presetsRow}>
        {PRESETS.map((p) => {
          const isSelected = Math.abs(value - p.value) < 0.05;
          return (
            <TouchableOpacity
              key={p.label}
              style={[
                styles.presetButton,
                isSelected && styles.presetButtonSelected,
              ]}
              onPress={() => onChange(p.value)}
            >
              <Text
                style={[
                  styles.presetText,
                  isSelected && styles.presetTextSelected,
                ]}
              >
                {p.label}
              </Text>
              <Text
                style={[
                  styles.presetCaption,
                  isSelected && styles.presetCaptionSelected,
                ]}
              >
                {p.caption}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: Colors.card,
    borderRadius: Radii.lg,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    padding: Spacing.four,
    marginBottom: Spacing.four,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.three,
  },
  eyebrow: {
    color: Colors.textMuted,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1.5,
    fontFamily: 'monospace',
  },
  caption: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
    marginTop: 2,
  },
  stepperContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#090d16',
    borderRadius: Radii.sm,
    borderWidth: 1,
    borderColor: '#1a2336',
    padding: 2,
  },
  stepButton: {
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  stepButtonText: {
    color: Colors.cyan,
    fontSize: 18,
    fontWeight: '700',
  },
  valueBadge: {
    paddingHorizontal: Spacing.two,
  },
  valueText: {
    color: Colors.primary,
    fontSize: 14,
    fontWeight: '800',
    fontFamily: 'monospace',
  },
  presetsRow: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  presetButton: {
    flex: 1,
    backgroundColor: '#090d16',
    borderRadius: Radii.sm,
    borderWidth: 1,
    borderColor: '#1a2336',
    paddingVertical: Spacing.two,
    alignItems: 'center',
  },
  presetButtonSelected: {
    borderColor: 'rgba(212, 255, 0, 0.5)',
    backgroundColor: 'rgba(212, 255, 0, 0.1)',
    shadowColor: Colors.primary,
    shadowOpacity: 0.25,
    shadowRadius: 6,
  },
  presetText: {
    color: Colors.textSecondary,
    fontSize: 13,
    fontWeight: '800',
    fontFamily: 'monospace',
  },
  presetTextSelected: {
    color: Colors.primary,
  },
  presetCaption: {
    color: Colors.textMuted,
    fontSize: 9,
    marginTop: 2,
  },
  presetCaptionSelected: {
    color: '#e2ff66',
  },
});
