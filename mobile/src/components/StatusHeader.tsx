import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Colors, Radii, Spacing } from '../constants/theme';
import { ConnectionStatus, SensorStatus } from '../types';

interface StatusHeaderProps {
  connectionStatus: ConnectionStatus;
  sensorStatus: SensorStatus;
  latencyMs: number | null;
  onOpenSettings: () => void;
  onOpenHelp: () => void;
}

export function StatusHeader({
  connectionStatus,
  sensorStatus,
  latencyMs,
  onOpenSettings,
  onOpenHelp,
}: StatusHeaderProps) {
  const getConnectionBadge = () => {
    switch (connectionStatus) {
      case 'connected':
        return {
          label: 'ONLINE',
          bg: 'rgba(212, 255, 0, 0.12)',
          border: 'rgba(212, 255, 0, 0.35)',
          color: Colors.primary,
        };
      case 'connecting':
        return {
          label: 'CONNECTING',
          bg: 'rgba(255, 183, 3, 0.12)',
          border: 'rgba(255, 183, 3, 0.35)',
          color: Colors.warning,
        };
      case 'reconnecting':
        return {
          label: 'RECONNECTING',
          bg: 'rgba(255, 183, 3, 0.12)',
          border: 'rgba(255, 183, 3, 0.35)',
          color: Colors.warning,
        };
      case 'error':
        return {
          label: 'ERROR',
          bg: 'rgba(255, 77, 109, 0.12)',
          border: 'rgba(255, 77, 109, 0.35)',
          color: Colors.danger,
        };
      default:
        return {
          label: 'OFFLINE',
          bg: '#121722',
          border: Colors.cardBorder,
          color: Colors.textMuted,
        };
    }
  };

  const getSensorBadge = () => {
    switch (sensorStatus) {
      case 'active':
        return { label: 'GYRO STREAMING', color: Colors.cyan };
      case 'available':
        return { label: 'GYRO READY', color: Colors.cyan };
      case 'denied':
        return { label: 'GYRO DENIED', color: Colors.danger };
      default:
        return { label: 'TOUCH ONLY', color: Colors.textMuted };
    }
  };

  const connBadge = getConnectionBadge();
  const sensBadge = getSensorBadge();

  return (
    <View style={styles.container}>
      <View style={styles.topRow}>
        <View style={styles.brandRow}>
          <View style={styles.logoBadge}>
            <Text style={styles.logoText}>🎮</Text>
          </View>
          <View>
            <Text style={styles.eyebrow}>MOBILE CONTROLLER</Text>
            <Text style={styles.title}>
              Anything but a <Text style={styles.titleAccent}>Game Controller</Text>
            </Text>
          </View>
        </View>

        <View style={styles.actionsRow}>
          <TouchableOpacity
            style={styles.iconButton}
            onPress={onOpenHelp}
            accessibilityLabel="Help & Troubleshooting"
          >
            <Text style={styles.iconButtonText}>?</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.iconButton}
            onPress={onOpenSettings}
            accessibilityLabel="Server Settings"
          >
            <Text style={styles.iconButtonText}>⚙</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.badgesRow}>
        <View
          style={[
            styles.badge,
            { backgroundColor: connBadge.bg, borderColor: connBadge.border },
          ]}
        >
          <View style={[styles.dot, { backgroundColor: connBadge.color }]} />
          <Text style={[styles.badgeText, { color: connBadge.color }]}>
            {connBadge.label}
          </Text>
        </View>

        <View style={[styles.badge, styles.secondaryBadge]}>
          <Text style={[styles.badgeText, { color: sensBadge.color }]}>
            ● {sensBadge.label}
          </Text>
        </View>

        {latencyMs !== null && (
          <View style={[styles.badge, styles.latencyBadge]}>
            <Text style={styles.latencyText}>⚡ {latencyMs}ms</Text>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.three,
    paddingBottom: Spacing.three,
    backgroundColor: Colors.background,
    borderBottomWidth: 1,
    borderBottomColor: Colors.cardBorder,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.two,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    flex: 1,
    marginRight: Spacing.two,
  },
  logoBadge: {
    width: 38,
    height: 38,
    borderRadius: Radii.sm,
    backgroundColor: '#0e131d',
    borderWidth: 1,
    borderColor: 'rgba(212, 255, 0, 0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: Colors.primary,
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  logoText: {
    color: Colors.primary,
    fontSize: 20,
    fontWeight: '800',
  },
  eyebrow: {
    color: Colors.textMuted,
    fontSize: 9,
    letterSpacing: 2,
    fontWeight: '700',
    fontFamily: 'monospace',
  },
  title: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0.3,
    lineHeight: 18,
  },
  titleAccent: {
    color: Colors.primary,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  iconButton: {
    width: 36,
    height: 36,
    borderRadius: Radii.sm,
    backgroundColor: '#121722',
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconButtonText: {
    color: Colors.textSecondary,
    fontSize: 15,
    fontWeight: '600',
  },
  badgesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    flexWrap: 'wrap',
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: Radii.xs,
    borderWidth: 1,
  },
  secondaryBadge: {
    backgroundColor: '#0e131d',
    borderColor: Colors.cardBorder,
  },
  latencyBadge: {
    backgroundColor: 'rgba(0, 240, 255, 0.1)',
    borderColor: 'rgba(0, 240, 255, 0.25)',
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 6,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.8,
    fontFamily: 'monospace',
  },
  latencyText: {
    fontSize: 10,
    fontWeight: '700',
    color: Colors.cyan,
    fontFamily: 'monospace',
  },
});
