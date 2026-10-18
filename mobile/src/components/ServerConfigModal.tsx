import React, { useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Colors, Radii, Spacing } from '../constants/theme';
import {
  detectLanHost,
  getDefaultServerUrl,
  isLocalhostAddress,
  PRODUCTION_SERVER_URL,
  resetServerUrl,
  saveServerUrl,
} from '../services/config';

interface ServerConfigModalProps {
  visible: boolean;
  currentUrl: string;
  onClose: () => void;
  onSave: (newUrl: string) => void;
}

export function ServerConfigModal({
  visible,
  currentUrl,
  onClose,
  onSave,
}: ServerConfigModalProps) {
  const [urlInput, setUrlInput] = useState(currentUrl);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    ok: boolean;
    message: string;
  } | null>(null);

  const detectedLan = detectLanHost();
  const isLocalhost = isLocalhostAddress(urlInput);

  const handleUseProductionRender = () => {
    setUrlInput(PRODUCTION_SERVER_URL);
    setTestResult(null);
  };

  const handleUseDetectedLan = () => {
    if (detectedLan) {
      setUrlInput(`http://${detectedLan}:3001`);
      setTestResult(null);
    }
  };

  const handleResetDefault = async () => {
    const def = await resetServerUrl();
    setUrlInput(def);
    setTestResult(null);
  };

  const handleTestConnection = async () => {
    setTesting(true);
    setTestResult(null);
    let target = urlInput.trim();
    if (!target.startsWith('http://') && !target.startsWith('https://')) {
      const isDomain =
        !isLocalhostAddress(target) &&
        !/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/.test(target);
      target = isDomain ? `https://${target}` : `http://${target}`;
    }
    target = target.replace(/\/+$/, '');

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4000);

      const res = await fetch(`${target}/health`, {
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (res.ok) {
        const data = await res.json();
        setTestResult({
          ok: true,
          message: `Server responded OK! (${data.activeRooms ?? 0} active rooms)`,
        });
      } else {
        setTestResult({
          ok: false,
          message: `Server returned HTTP status ${res.status}`,
        });
      }
    } catch (err: unknown) {
      const message =
        err instanceof Error && err.name === 'AbortError'
          ? 'Request timed out after 4 seconds.'
          : 'Could not connect. Check IP and Windows Firewall.';
      setTestResult({
        ok: false,
        message,
      });
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async () => {
    const saved = await saveServerUrl(urlInput);
    onSave(saved);
    onClose();
  };

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
              <Text style={styles.eyebrow}>SETTINGS</Text>
              <Text style={styles.title}>Backend Server Address</Text>
            </View>
            <TouchableOpacity style={styles.closeButton} onPress={onClose}>
              <Text style={styles.closeText}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.scrollArea}>
            <Text style={styles.description}>
              Configure the Socket.IO server URL that your phone connects to.
              On an iPhone, both your laptop and phone must be on the same
              Wi-Fi network.
            </Text>

            {isLocalhost && (
              <View style={styles.warningBox}>
                <Text style={styles.warningTitle}>⚠️ Note on Physical Devices</Text>
                <Text style={styles.warningText}>
                  "localhost" on a real iPhone refers to the phone itself, not
                  your laptop. Use your laptop's local Wi-Fi IP address (e.g.{' '}
                  <Text style={styles.codeText}>http://192.168.1.X:3001</Text>).
                </Text>
              </View>
            )}

            <View style={styles.inputContainer}>
              <Text style={styles.inputLabel}>SERVER URL</Text>
              <TextInput
                style={styles.input}
                value={urlInput}
                onChangeText={(text) => {
                  setUrlInput(text);
                  setTestResult(null);
                }}
                placeholder="http://192.168.1.100:3001"
                placeholderTextColor={Colors.textMuted}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
              />
            </View>

            <TouchableOpacity
              style={styles.prodButton}
              onPress={handleUseProductionRender}
            >
              <Text style={styles.prodButtonTitle}>
                ☁ Use Deployed Render Backend:
              </Text>
              <Text style={styles.prodButtonUrl} numberOfLines={1}>
                {PRODUCTION_SERVER_URL}
              </Text>
            </TouchableOpacity>

            {detectedLan && (
              <TouchableOpacity
                style={styles.suggestionButton}
                onPress={handleUseDetectedLan}
              >
                <Text style={styles.suggestionText}>
                  ⚡ Use detected Expo LAN IP:{' '}
                  <Text style={styles.suggestionIp}>
                    http://{detectedLan}:3001
                  </Text>
                </Text>
              </TouchableOpacity>
            )}

            <View style={styles.testRow}>
              <TouchableOpacity
                style={styles.testButton}
                onPress={handleTestConnection}
                disabled={testing || !urlInput.trim()}
              >
                {testing ? (
                  <ActivityIndicator size="small" color="#38bdf8" />
                ) : (
                  <Text style={styles.testButtonText}>Test Connection</Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.resetButton}
                onPress={handleResetDefault}
              >
                <Text style={styles.resetButtonText}>Reset Default</Text>
              </TouchableOpacity>
            </View>

            {testResult && (
              <View
                style={[
                  styles.resultBox,
                  testResult.ok ? styles.resultOk : styles.resultError,
                ]}
              >
                <Text
                  style={[
                    styles.resultText,
                    testResult.ok ? styles.resultTextOk : styles.resultTextError,
                  ]}
                >
                  {testResult.ok ? '✓ ' : '✕ '}
                  {testResult.message}
                </Text>
              </View>
            )}

            <View style={styles.infoSection}>
              <Text style={styles.infoTitle}>Troubleshooting Connection:</Text>
              <Text style={styles.infoStep}>
                • <Text style={styles.boldText}>Playing on Deployed Vercel</Text>: If
                playing the maze game on Vercel, select the Deployed Render Backend
                above. If connected to a local IP, the app will report "Room not found".
              </Text>
              <Text style={styles.infoStep}>
                • <Text style={styles.boldText}>Playing Locally</Text>: Ensure laptop
                and iPhone are on the same Wi-Fi and port 3001 is open.
              </Text>
            </View>
          </ScrollView>

          <View style={styles.footerRow}>
            <TouchableOpacity style={styles.cancelButton} onPress={onClose}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.saveButton} onPress={handleSave}>
              <Text style={styles.saveText}>Save & Connect</Text>
            </TouchableOpacity>
          </View>
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
    maxHeight: '90%',
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
    marginBottom: Spacing.four,
  },
  description: {
    color: Colors.textSecondary,
    fontSize: 13,
    lineHeight: 18,
    marginBottom: Spacing.three,
  },
  warningBox: {
    backgroundColor: '#2e1d0f',
    borderColor: '#b45309',
    borderWidth: 1,
    borderRadius: Radii.md,
    padding: Spacing.three,
    marginBottom: Spacing.three,
  },
  warningTitle: {
    color: '#fbbf24',
    fontSize: 12,
    fontWeight: '800',
    marginBottom: 4,
  },
  warningText: {
    color: '#fed7aa',
    fontSize: 12,
    lineHeight: 16,
  },
  codeText: {
    fontFamily: 'monospace',
    fontWeight: '700',
  },
  inputContainer: {
    marginBottom: Spacing.two,
  },
  inputLabel: {
    color: Colors.textMuted,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
    marginBottom: 6,
  },
  input: {
    backgroundColor: '#0a101d',
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    borderRadius: Radii.md,
    color: '#f8fafc',
    fontSize: 15,
    fontFamily: 'monospace',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
  },
  prodButton: {
    backgroundColor: 'rgba(212, 255, 0, 0.1)',
    borderColor: 'rgba(212, 255, 0, 0.35)',
    borderWidth: 1,
    borderRadius: Radii.md,
    padding: Spacing.two,
    marginBottom: Spacing.two,
  },
  prodButtonTitle: {
    color: Colors.primary,
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 2,
  },
  prodButtonUrl: {
    color: '#e2ff66',
    fontFamily: 'monospace',
    fontSize: 11,
    fontWeight: '600',
  },
  boldText: {
    color: '#f8fafc',
    fontWeight: '700',
  },
  suggestionButton: {
    backgroundColor: '#0c2238',
    borderColor: '#1e3a5f',
    borderWidth: 1,
    borderRadius: Radii.md,
    padding: Spacing.two,
    marginBottom: Spacing.three,
  },
  suggestionText: {
    color: '#38bdf8',
    fontSize: 12,
    fontWeight: '600',
  },
  suggestionIp: {
    fontFamily: 'monospace',
    fontWeight: '800',
  },
  testRow: {
    flexDirection: 'row',
    gap: Spacing.two,
    marginBottom: Spacing.three,
  },
  testButton: {
    flex: 1,
    backgroundColor: '#122340',
    borderWidth: 1,
    borderColor: '#38bdf8',
    borderRadius: Radii.md,
    paddingVertical: Spacing.two,
    alignItems: 'center',
    justifyContent: 'center',
  },
  testButtonText: {
    color: '#38bdf8',
    fontSize: 13,
    fontWeight: '700',
  },
  resetButton: {
    backgroundColor: '#0a101d',
    borderWidth: 1,
    borderColor: '#1e293b',
    borderRadius: Radii.md,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    alignItems: 'center',
    justifyContent: 'center',
  },
  resetButtonText: {
    color: Colors.textMuted,
    fontSize: 12,
  },
  resultBox: {
    borderRadius: Radii.md,
    padding: Spacing.two,
    borderWidth: 1,
    marginBottom: Spacing.three,
  },
  resultOk: {
    backgroundColor: '#0d281e',
    borderColor: '#10b981',
  },
  resultError: {
    backgroundColor: '#2b1414',
    borderColor: '#ef4444',
  },
  resultText: {
    fontSize: 12,
    fontWeight: '700',
  },
  resultTextOk: {
    color: Colors.primary,
  },
  resultTextError: {
    color: '#ff6b81',
  },
  infoSection: {
    backgroundColor: '#090d16',
    borderRadius: Radii.md,
    padding: Spacing.three,
    borderWidth: 1,
    borderColor: '#1a2336',
  },
  infoTitle: {
    color: '#f8fafc',
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 6,
  },
  infoStep: {
    color: Colors.textSecondary,
    fontSize: 11,
    lineHeight: 16,
    marginBottom: 4,
  },
  codeSnippet: {
    color: Colors.cyan,
    fontFamily: 'monospace',
    fontSize: 10,
    backgroundColor: '#05070e',
    padding: 6,
    borderRadius: 4,
    marginVertical: 4,
  },
  inlineCode: {
    color: Colors.primary,
    fontFamily: 'monospace',
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: Spacing.two,
    borderTopWidth: 1,
    borderTopColor: Colors.cardBorder,
    paddingTop: Spacing.three,
  },
  cancelButton: {
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.four,
    borderRadius: Radii.md,
  },
  cancelText: {
    color: Colors.textMuted,
    fontSize: 14,
    fontWeight: '600',
  },
  saveButton: {
    backgroundColor: '#10b981',
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.four,
    borderRadius: Radii.md,
  },
  saveText: {
    color: '#070b14',
    fontSize: 14,
    fontWeight: '800',
  },
});
