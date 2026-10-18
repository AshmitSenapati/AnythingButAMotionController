import React from 'react';
import {
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Colors, Radii, Spacing } from '../constants/theme';

interface TroubleshootingModalProps {
  visible: boolean;
  onClose: () => void;
}

export function TroubleshootingModal({
  visible,
  onClose,
}: TroubleshootingModalProps) {
  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        <View style={styles.modalCard}>
          <View style={styles.headerRow}>
            <View>
              <Text style={styles.eyebrow}>GUIDE & RECOVERY</Text>
              <Text style={styles.title}>Troubleshooting</Text>
            </View>
            <TouchableOpacity style={styles.closeButton} onPress={onClose}>
              <Text style={styles.closeText}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.scrollArea}>
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>1. Phone Cannot Connect to Laptop</Text>
              <Text style={styles.bullet}>
                • <Text style={styles.bold}>Same Wi-Fi Network</Text>: Your iPhone
                and Windows laptop must be connected to the exact same Wi-Fi
                router/SSID. Cellular data must not interfere.
              </Text>
              <Text style={styles.bullet}>
                • <Text style={styles.bold}>Do Not Use "localhost"</Text>: On a
                real phone, <Text style={styles.code}>localhost</Text> refers to
                the phone itself. Tap the ⚙ icon and use your laptop's Wi-Fi IP
                (e.g. <Text style={styles.code}>http://192.168.1.150:3001</Text>).
              </Text>
              <Text style={styles.bullet}>
                • <Text style={styles.bold}>Windows Firewall</Text>: By default,
                Windows Defender Firewall blocks incoming TCP connections from
                other devices on the LAN. In PowerShell (Admin), run:
              </Text>
              <Text style={styles.codeBlock}>
                netsh advfirewall firewall add rule name="Node 3001" dir=in action=allow protocol=TCP localport=3001
              </Text>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>2. Room Code Rejection / Errors</Text>
              <Text style={styles.bullet}>
                • <Text style={styles.bold}>Room Not Found</Text>: Ensure the
                laptop game is open and actively displaying that room code.
              </Text>
              <Text style={styles.bullet}>
                • <Text style={styles.bold}>Room Occupied</Text>: Each room
                accepts exactly one controller. If another device joined, tap
                Unpair on that device first.
              </Text>
              <Text style={styles.bullet}>
                • <Text style={styles.bold}>Re-pairing</Text>: If you unpaired,
                you can enter the exact same code and tap Pair again immediately.
              </Text>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>3. Motion Sensors & Calibration</Text>
              <Text style={styles.bullet}>
                • <Text style={styles.bold}>Hold Steady</Text>: When you tap
                Calibrate Neutral Position, hold the phone at your natural resting
                angle (usually tilted ~30-45° upward in your hands).
              </Text>
              <Text style={styles.bullet}>
                • <Text style={styles.bold}>Deadzone & Smoothing</Text>: A 2.0°
                deadzone and exponential low-pass filter prevent resting hand
                tremors from causing ball drift.
              </Text>
              <Text style={styles.bullet}>
                • <Text style={styles.bold}>Sensors Denied</Text>: On iOS, ensure
                Motion & Orientation permissions are enabled in Settings &gt;
                Privacy &gt; Motion &amp; Fitness.
              </Text>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>4. Latency & Network Jitter</Text>
              <Text style={styles.bullet}>
                • The live latency indicator measures full round-trip time (RTT)
                over WebSocket. Typical 5GHz Wi-Fi is 5-25ms.
              </Text>
              <Text style={styles.bullet}>
                • If latency spikes &gt; 100ms, bring the phone closer to the
                Wi-Fi access point or avoid congested 2.4GHz bands.
              </Text>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>5. Backup Touch Joystick</Text>
              <Text style={styles.bullet}>
                • If sensors are unavailable or you prefer playing at a desk, use
                the on-screen Virtual Joystick to navigate without moving your
                phone.
              </Text>
            </View>
          </ScrollView>

          <TouchableOpacity style={styles.doneButton} onPress={onClose}>
            <Text style={styles.doneText}>Got It</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.four,
  },
  modalCard: {
    width: '100%',
    maxHeight: '85%',
    backgroundColor: Colors.card,
    borderRadius: Radii.lg,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    padding: Spacing.four,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.three,
  },
  eyebrow: {
    color: Colors.textMuted,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.5,
  },
  title: {
    color: '#f8fafc',
    fontSize: 18,
    fontWeight: '800',
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#0a101d',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeText: {
    color: Colors.textSecondary,
    fontSize: 14,
    fontWeight: '700',
  },
  scrollArea: {
    marginBottom: Spacing.three,
  },
  section: {
    backgroundColor: '#0a101d',
    borderRadius: Radii.md,
    padding: Spacing.three,
    borderWidth: 1,
    borderColor: '#1e293b',
    marginBottom: Spacing.three,
  },
  sectionTitle: {
    color: '#38bdf8',
    fontSize: 13,
    fontWeight: '800',
    marginBottom: Spacing.two,
  },
  bullet: {
    color: Colors.textSecondary,
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 6,
  },
  bold: {
    color: '#f8fafc',
    fontWeight: '700',
  },
  code: {
    color: Colors.primary,
    fontFamily: 'monospace',
    fontWeight: '700',
  },
  codeBlock: {
    color: Colors.primary,
    fontFamily: 'monospace',
    fontSize: 10,
    backgroundColor: '#05070e',
    padding: 8,
    borderRadius: 4,
    marginVertical: 4,
  },
  doneButton: {
    backgroundColor: Colors.primary,
    paddingVertical: Spacing.three,
    borderRadius: Radii.sm,
    alignItems: 'center',
  },
  doneText: {
    color: '#080a0f',
    fontWeight: '800',
    fontSize: 14,
    textTransform: 'uppercase',
  },
});
