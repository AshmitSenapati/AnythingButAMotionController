import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Colors, Radii, Spacing } from '../constants/theme';
import { MotionReading } from '../types';

interface TiltVisualizerProps {
  reading: MotionReading;
  isActive: boolean;
}

export function TiltVisualizer({ reading, isActive }: TiltVisualizerProps) {
  const maxDegrees = 45;
  const xOffset = Math.max(-1, Math.min(1, reading.tilt / maxDegrees)) * 48;
  const yOffset = Math.max(-1, Math.min(1, reading.acceleration / maxDegrees)) * 48;

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <View>
          <Text style={styles.eyebrow}>MOTION HORIZON</Text>
          <Text style={styles.subtitle}>Dual-Axis Gyro Telemetry</Text>
        </View>
        <Text style={[styles.statusLabel, isActive && styles.statusLabelActive]}>
          {isActive ? 'STREAMING 30HZ' : 'STANDBY'}
        </Text>
      </View>

      <View style={styles.visualizerRow}>
        <View style={styles.crosshairOuter}>
          <View style={styles.axisH} />
          <View style={styles.axisV} />
          <View style={styles.crosshairInner} />

          <View
            style={[
              styles.ball,
              {
                transform: [
                  { translateX: xOffset },
                  { translateY: yOffset },
                ],
                backgroundColor: isActive ? Colors.primary : Colors.textMuted,
                shadowColor: isActive ? Colors.primary : '#000',
              },
            ]}
          />
        </View>

        <View style={styles.readoutsContainer}>
          <View style={styles.readoutCard}>
            <Text style={styles.readoutTitle}>HORIZONTAL TILT (X)</Text>
            <Text style={[styles.readoutValue, { color: reading.tilt !== 0 ? Colors.cyan : Colors.textSecondary }]}>
              {reading.tilt > 0 ? `+${reading.tilt.toFixed(1)}°` : `${reading.tilt.toFixed(1)}°`}
            </Text>
            <View style={styles.barTrack}>
              <View
                style={[
                  styles.barFill,
                  {
                    width: `${Math.min(100, Math.abs(reading.normalizedX) * 100)}%`,
                    alignSelf: reading.normalizedX >= 0 ? 'flex-start' : 'flex-end',
                    backgroundColor: Colors.cyan,
                  },
                ]}
              />
            </View>
          </View>

          <View style={styles.readoutCard}>
            <Text style={styles.readoutTitle}>VERTICAL TILT (Y)</Text>
            <Text style={[styles.readoutValue, { color: reading.acceleration !== 0 ? Colors.primary : Colors.textSecondary }]}>
              {reading.acceleration > 0
                ? `+${reading.acceleration.toFixed(1)}°`
                : `${reading.acceleration.toFixed(1)}°`}
            </Text>
            <View style={styles.barTrack}>
              <View
                style={[
                  styles.barFill,
                  {
                    width: `${Math.min(100, Math.abs(reading.normalizedY) * 100)}%`,
                    alignSelf: reading.normalizedY >= 0 ? 'flex-start' : 'flex-end',
                    backgroundColor: Colors.primary,
                  },
                ]}
              />
            </View>
          </View>
        </View>
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
  subtitle: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
    marginTop: 2,
  },
  statusLabel: {
    color: Colors.textMuted,
    fontSize: 9,
    fontWeight: '700',
    fontFamily: 'monospace',
    letterSpacing: 0.8,
  },
  statusLabelActive: {
    color: Colors.cyan,
  },
  visualizerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.four,
  },
  crosshairOuter: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#090d16',
    borderWidth: 2,
    borderColor: '#1a2336',
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
    overflow: 'hidden',
  },
  crosshairInner: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 1,
    borderColor: '#1e2b42',
    borderStyle: 'dashed',
  },
  axisH: {
    position: 'absolute',
    width: '100%',
    height: 1,
    backgroundColor: '#162235',
  },
  axisV: {
    position: 'absolute',
    height: '100%',
    width: 1,
    backgroundColor: '#162235',
  },
  ball: {
    position: 'absolute',
    width: 20,
    height: 20,
    borderRadius: 10,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 8,
    elevation: 5,
  },
  readoutsContainer: {
    flex: 1,
    gap: Spacing.two,
  },
  readoutCard: {
    backgroundColor: '#0e131d',
    borderRadius: Radii.sm,
    padding: Spacing.two,
    borderWidth: 1,
    borderColor: '#1a2336',
  },
  readoutTitle: {
    color: Colors.textMuted,
    fontSize: 8,
    fontWeight: '700',
    letterSpacing: 0.8,
    fontFamily: 'monospace',
    marginBottom: 2,
  },
  readoutValue: {
    fontSize: 15,
    fontWeight: '800',
    fontFamily: 'monospace',
    marginBottom: 4,
  },
  barTrack: {
    height: 4,
    backgroundColor: '#141d2c',
    borderRadius: 2,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: 2,
  },
});
