import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SensitivitySlider } from '../components/SensitivitySlider';
import { ServerConfigModal } from '../components/ServerConfigModal';
import { StatusHeader } from '../components/StatusHeader';
import { TiltVisualizer } from '../components/TiltVisualizer';
import { TroubleshootingModal } from '../components/TroubleshootingModal';
import { VirtualJoystick } from '../components/VirtualJoystick';
import { Colors, Radii, Spacing } from '../constants/theme';
import { getStoredServerUrl } from '../services/config';
import { sensorService } from '../services/sensorService';
import { socketService } from '../services/socketService';
import {
  ConnectionStatus,
  ControlMode,
  MotionReading,
  RoomState,
  SensorStatus,
} from '../types';

export default function ControllerScreen() {
  const [serverUrl, setServerUrl] = useState('');
  const [connectionStatus, setConnectionStatus] =
    useState<ConnectionStatus>('disconnected');
  const [connectionError, setConnectionError] = useState<string>('');
  const [latencyMs, setLatencyMs] = useState<number | null>(null);

  const [roomCodeInput, setRoomCodeInput] = useState('');
  const [isPairing, setIsPairing] = useState(false);
  const [isPaired, setIsPaired] = useState(false);
  const [pairedRoom, setPairedRoom] = useState<string | null>(null);
  const [roomState, setRoomState] = useState<RoomState | null>(null);
  const [pairError, setPairError] = useState<string>('');

  const [sensorStatus, setSensorStatus] = useState<SensorStatus>('checking');
  const [motionReading, setMotionReading] = useState<MotionReading>({
    tilt: 0,
    acceleration: 0,
    normalizedX: 0,
    normalizedY: 0,
    rawX: 0,
    rawY: 0,
    rawZ: 0,
  });

  const [sensitivity, setSensitivity] = useState(1.0);
  const [controlMode, setControlMode] = useState<ControlMode>('motion');
  const [calibratedNotice, setCalibratedNotice] = useState(false);
  const [isJoystickActive, setIsJoystickActive] = useState(false);

  const [settingsVisible, setSettingsVisible] = useState(false);
  const [helpVisible, setHelpVisible] = useState(false);

  // Stable refs for high-frequency events
  const controlModeRef = useRef<ControlMode>(controlMode);
  controlModeRef.current = controlMode;

  const isPairedRef = useRef<boolean>(isPaired);
  isPairedRef.current = isPaired;

  const sensorStatusRef = useRef<SensorStatus>(sensorStatus);
  sensorStatusRef.current = sensorStatus;

  // Initialize server connection & sensors on mount
  useEffect(() => {
    let mounted = true;

    async function init() {
      const url = await getStoredServerUrl();
      if (!mounted) return;
      setServerUrl(url);
      socketService.connect(url);
      const status = await sensorService.checkAvailability();
      if (mounted) {
        setSensorStatus(status);
        sensorStatusRef.current = status;
      }
    }

    init();

    const unsubStatus = socketService.subscribeStatus((status, err) => {
      if (!mounted) return;
      setConnectionStatus(status);
      setConnectionError(err || '');
      const paired = socketService.getIsPaired();
      setIsPaired(paired);
      isPairedRef.current = paired;
      setPairedRoom(socketService.getPairedRoom());
    });

    const unsubLatency = socketService.subscribeLatency((latency) => {
      if (!mounted) return;
      setLatencyMs(latency);
    });

    const unsubRoom = socketService.subscribeRoomState((state) => {
      if (!mounted) return;
      setRoomState(state);
      const paired = socketService.getIsPaired();
      setIsPaired(paired);
      isPairedRef.current = paired;
      setPairedRoom(socketService.getPairedRoom());
    });

    const unsubSensors = sensorService.subscribeStatus((status) => {
      if (!mounted) return;
      setSensorStatus(status);
      sensorStatusRef.current = status;
    });

    const unsubData = sensorService.subscribeData((reading) => {
      if (!mounted) return;
      setMotionReading(reading);

      if (
        isPairedRef.current &&
        (controlModeRef.current === 'motion' || controlModeRef.current === 'hybrid')
      ) {
        socketService.sendControllerData(reading.tilt, reading.acceleration);
      }
    });

    return () => {
      mounted = false;
      unsubStatus();
      unsubLatency();
      unsubRoom();
      unsubSensors();
      unsubData();
      sensorService.stop();
    };
  }, []);

  const handleModeSwitch = useCallback(async (newMode: ControlMode) => {
    if (newMode === controlModeRef.current) return;

    setControlMode(newMode);
    controlModeRef.current = newMode;

    if (isPairedRef.current) {
      socketService.sendControllerData(0, 0);
    }

    setMotionReading({
      tilt: 0,
      acceleration: 0,
      normalizedX: 0,
      normalizedY: 0,
      rawX: 0,
      rawY: 0,
      rawZ: 0,
    });

    if (newMode === 'joystick') {
      sensorService.stop();
    } else {
      if (isPairedRef.current) {
        const started = await sensorService.start();
        if (started && !sensorService.isCalibrated()) {
          sensorService.calibrate();
        }
      }
    }
  }, []);

  const handlePair = async () => {
    const code = roomCodeInput.trim().toUpperCase();
    if (code.length !== 6) {
      setPairError('Enter the 6-character room token displayed on your laptop screen.');
      return;
    }

    setIsPairing(true);
    setPairError('');

    const res = await socketService.joinRoom(code);
    setIsPairing(false);

    if (res.success && res.roomCode) {
      setIsPaired(true);
      isPairedRef.current = true;
      setPairedRoom(res.roomCode);
      setPairError('');

      if (controlModeRef.current === 'motion' || controlModeRef.current === 'hybrid') {
        const started = await sensorService.start();
        if (started && !sensorService.isCalibrated()) {
          sensorService.calibrate();
        }
      }
    } else {
      setIsPaired(false);
      isPairedRef.current = false;
      setPairedRoom(null);
      let errMsg = res.error || 'Failed to bind to room session.';
      if (errMsg.toLowerCase().includes('not found')) {
        errMsg = `Room "${code}" not found. Verify the code on your laptop host screen.`;
      }
      setPairError(errMsg);
    }
  };

  const handleUnpair = async () => {
    setPairError('');
    sensorService.stop();
    sensorService.resetCalibration();
    setMotionReading({
      tilt: 0,
      acceleration: 0,
      normalizedX: 0,
      normalizedY: 0,
      rawX: 0,
      rawY: 0,
      rawZ: 0,
    });
    setIsPaired(false);
    isPairedRef.current = false;
    setPairedRoom(null);
    await socketService.leaveRoom();
  };

  const confirmUnpair = () => {
    Alert.alert(
      'Unlink Controller',
      `Disconnect this controller from session "${pairedRoom}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Unlink', style: 'destructive', onPress: handleUnpair },
      ]
    );
  };

  const handleCalibrate = () => {
    sensorService.calibrate();
    setCalibratedNotice(true);
    setTimeout(() => setCalibratedNotice(false), 2000);
  };

  const handleSensitivityChange = (val: number) => {
    setSensitivity(val);
    sensorService.setSensitivity(val);
  };

  const handleJoystickMove = useCallback((x: number, y: number) => {
    const tiltDegrees = x * 35;
    const accelDegrees = y * 35;

    if (
      isPairedRef.current &&
      (controlModeRef.current === 'joystick' || controlModeRef.current === 'hybrid')
    ) {
      socketService.sendControllerData(tiltDegrees, accelDegrees);
    }
  }, []);

  const handleJoystickRelease = useCallback(() => {
    if (
      isPairedRef.current &&
      (controlModeRef.current === 'joystick' || controlModeRef.current === 'hybrid')
    ) {
      socketService.sendControllerData(0, 0);
    }
  }, []);

  const handleServerSaved = (newUrl: string) => {
    setServerUrl(newUrl);
    setPairError('');
    socketService.connect(newUrl);
  };

  const isServerOnline = connectionStatus === 'connected';

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <StatusHeader
          connectionStatus={connectionStatus}
          sensorStatus={sensorStatus}
          latencyMs={latencyMs}
          onOpenSettings={() => setSettingsVisible(true)}
          onOpenHelp={() => setHelpVisible(true)}
        />

        <ScrollView
          style={styles.scrollArea}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          scrollEnabled={!isJoystickActive}
        >
          {/* Server Connection Error Alert */}
          {connectionStatus === 'error' && (
            <View style={styles.alertBanner}>
              <Text style={styles.alertTitle}>⚠️ Server Unreachable</Text>
              <Text style={styles.alertText}>
                {connectionError ||
                  `Could not establish Socket.IO connection at ${serverUrl || 'configured URL'}.`}
              </Text>
              <TouchableOpacity
                style={styles.alertAction}
                onPress={() => setSettingsVisible(true)}
              >
                <Text style={styles.alertActionText}>Configure Server Address ⚙</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* ================================================================
              SCREEN 1: LINK YOUR CONTROLLER (When Unpaired)
              ================================================================ */}
          {!isPaired ? (
            <View style={styles.pairingHeroCard}>
              <View style={styles.pairingCardHeader}>
                <Text style={styles.pairingEyebrow}>DEVICE LINK PROTOCOL</Text>
                <Text style={styles.pairingHeading}>LINK YOUR CONTROLLER</Text>
                <Text style={styles.pairingSubtitle}>
                  Enter the 6-character room token displayed on your laptop game screen.
                </Text>
              </View>

              <View style={styles.inputContainer}>
                <Text style={styles.inputLabel}>SESSION TOKEN</Text>
                <TextInput
                  style={styles.roomInput}
                  value={roomCodeInput}
                  onChangeText={(val) => {
                    setRoomCodeInput(val.toUpperCase().slice(0, 6));
                    setPairError('');
                  }}
                  placeholder="------"
                  placeholderTextColor="#2c3a50"
                  maxLength={6}
                  autoCapitalize="characters"
                  autoCorrect={false}
                  editable={!isPairing}
                />
              </View>

              <TouchableOpacity
                style={[
                  styles.joinButton,
                  (!isServerOnline ||
                    isPairing ||
                    roomCodeInput.trim().length !== 6) &&
                    styles.joinButtonDisabled,
                ]}
                onPress={handlePair}
                disabled={
                  !isServerOnline ||
                  isPairing ||
                  roomCodeInput.trim().length !== 6
                }
              >
                {isPairing ? (
                  <ActivityIndicator size="small" color="#080a0f" />
                ) : (
                  <Text style={styles.joinButtonText}>JOIN SESSION</Text>
                )}
              </TouchableOpacity>

              {pairError ? (
                <View style={styles.errorBox}>
                  <Text style={styles.errorText}>✕ {pairError}</Text>
                </View>
              ) : null}

              {/* Quick Server Switch Bar */}
              <View style={styles.serverQuickBar}>
                <Text style={styles.serverQuickLabel}>HOST:</Text>
                <TouchableOpacity
                  style={styles.serverQuickPill}
                  onPress={() => setSettingsVisible(true)}
                >
                  <Text style={styles.serverQuickUrl} numberOfLines={1}>
                    {serverUrl || 'Detecting...'}
                  </Text>
                  <Text style={styles.serverQuickIcon}>⚙</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            /* ================================================================
               SCREEN 2: DEDICATED CONTROLLER (When Paired)
               ================================================================ */
            <>
              {/* Session HUD Strip */}
              <View style={styles.hudCard}>
                <View style={styles.hudInfo}>
                  <View style={styles.hudTokenGroup}>
                    <Text style={styles.hudLabel}>ACTIVE SESSION</Text>
                    <View style={styles.hudTokenRow}>
                      <View style={styles.hudLiveDot} />
                      <Text style={styles.hudTokenValue}>{pairedRoom}</Text>
                    </View>
                  </View>

                  <View style={styles.hudStatusGroup}>
                    <Text style={styles.hudLabel}>HOST SCREEN</Text>
                    <Text
                      style={[
                        styles.hudStatusText,
                        {
                          color: roomState?.laptopConnected
                            ? Colors.primary
                            : Colors.warning,
                        },
                      ]}
                    >
                      {roomState?.laptopConnected ? '● ONLINE' : '○ STANDBY'}
                    </Text>
                  </View>
                </View>

                <TouchableOpacity
                  style={styles.unlinkButton}
                  onPress={confirmUnpair}
                  accessibilityLabel="Unlink controller from session"
                >
                  <Text style={styles.unlinkButtonText}>UNLINK</Text>
                </TouchableOpacity>
              </View>

              {/* Control Mode Segmented Selector */}
              <View style={styles.modeCard}>
                <View style={styles.modeHeader}>
                  <Text style={styles.modeLabel}>INPUT MODE</Text>
                  <Text style={styles.modeStatus}>
                    {controlMode.toUpperCase()} ENGAGED
                  </Text>
                </View>

                <View style={styles.modeTabs}>
                  <TouchableOpacity
                    style={[
                      styles.modeTab,
                      controlMode === 'motion' && styles.modeTabActive,
                    ]}
                    onPress={() => handleModeSwitch('motion')}
                  >
                    <Text
                      style={[
                        styles.modeTabText,
                        controlMode === 'motion' && styles.modeTabTextActive,
                      ]}
                    >
                      Tilt Motion
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      styles.modeTab,
                      controlMode === 'joystick' && styles.modeTabActive,
                    ]}
                    onPress={() => handleModeSwitch('joystick')}
                  >
                    <Text
                      style={[
                        styles.modeTabText,
                        controlMode === 'joystick' && styles.modeTabTextActive,
                      ]}
                    >
                      Joystick
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      styles.modeTab,
                      controlMode === 'hybrid' && styles.modeTabActive,
                    ]}
                    onPress={() => handleModeSwitch('hybrid')}
                  >
                    <Text
                      style={[
                        styles.modeTabText,
                        controlMode === 'hybrid' && styles.modeTabTextActive,
                      ]}
                    >
                      Hybrid
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Sensor Permission Notice */}
              {(sensorStatus === 'unavailable' || sensorStatus === 'denied') &&
                (controlMode === 'motion' || controlMode === 'hybrid') && (
                  <View style={styles.sensorWarningBox}>
                    <Text style={styles.sensorWarningTitle}>
                      ⚠️ Motion Sensors{' '}
                      {sensorStatus === 'denied' ? 'Permission Denied' : 'Unavailable'}
                    </Text>
                    <Text style={styles.sensorWarningText}>
                      Physical motion sensors are disabled. You can steer with full precision using Joystick mode.
                    </Text>
                    <TouchableOpacity
                      style={styles.switchJoystickBtn}
                      onPress={() => handleModeSwitch('joystick')}
                    >
                      <Text style={styles.switchJoystickBtnText}>
                        Switch to Joystick Mode 🕹
                      </Text>
                    </TouchableOpacity>
                  </View>
                )}

              {/* Virtual Joystick (in Joystick & Hybrid modes) */}
              {(controlMode === 'joystick' || controlMode === 'hybrid') && (
                <VirtualJoystick
                  onMove={handleJoystickMove}
                  onRelease={handleJoystickRelease}
                  onEngagementChange={setIsJoystickActive}
                  disabled={!isPaired}
                />
              )}

              {/* Motion Tilt Horizon & Calibration (in Motion & Hybrid modes) */}
              {(controlMode === 'motion' || controlMode === 'hybrid') && (
                <>
                  <TiltVisualizer
                    reading={motionReading}
                    isActive={isPaired && sensorStatus === 'active'}
                  />

                  <View style={styles.calibrationRow}>
                    <TouchableOpacity
                      style={[
                        styles.calibrateButton,
                        (!isPaired ||
                          sensorStatus === 'unavailable' ||
                          sensorStatus === 'denied') &&
                          styles.calibrateButtonDisabled,
                      ]}
                      onPress={handleCalibrate}
                      disabled={
                        !isPaired ||
                        sensorStatus === 'unavailable' ||
                        sensorStatus === 'denied'
                      }
                    >
                      <Text style={styles.calibrateButtonText}>
                        {calibratedNotice
                          ? '✓ ZERO POSITION SAVED'
                          : '🎯 CALIBRATE ZERO POSITION'}
                      </Text>
                    </TouchableOpacity>
                  </View>

                  <SensitivitySlider
                    value={sensitivity}
                    onChange={handleSensitivityChange}
                  />
                </>
              )}
            </>
          )}
        </ScrollView>

        {/* Configuration Modals */}
        <ServerConfigModal
          visible={settingsVisible}
          currentUrl={serverUrl}
          onClose={() => setSettingsVisible(false)}
          onSave={handleServerSaved}
        />

        <TroubleshootingModal
          visible={helpVisible}
          onClose={() => setHelpVisible(false)}
        />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  container: {
    flex: 1,
  },
  scrollArea: {
    flex: 1,
  },
  scrollContent: {
    padding: Spacing.four,
    paddingBottom: Spacing.six,
  },
  alertBanner: {
    backgroundColor: 'rgba(255, 77, 109, 0.1)',
    borderColor: 'rgba(255, 77, 109, 0.35)',
    borderWidth: 1,
    borderRadius: Radii.md,
    padding: Spacing.three,
    marginBottom: Spacing.four,
  },
  alertTitle: {
    color: Colors.danger,
    fontSize: 13,
    fontWeight: '800',
    marginBottom: 4,
  },
  alertText: {
    color: '#fca5a5',
    fontSize: 12,
    lineHeight: 16,
    marginBottom: Spacing.two,
  },
  alertAction: {
    alignSelf: 'flex-start',
    backgroundColor: '#3f1c1c',
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.three,
    borderRadius: Radii.xs,
  },
  alertActionText: {
    color: Colors.danger,
    fontSize: 11,
    fontWeight: '700',
  },

  /* Link Controller Pairing Hero Card */
  pairingHeroCard: {
    backgroundColor: Colors.card,
    borderRadius: Radii.lg,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    padding: Spacing.five,
    marginTop: Spacing.three,
    boxShadow: '0 8px 24px rgba(0, 0, 0, 0.4)',
  },
  pairingCardHeader: {
    marginBottom: Spacing.four,
  },
  pairingEyebrow: {
    fontFamily: 'monospace',
    fontSize: 9,
    letterSpacing: 2,
    color: Colors.primary,
    fontWeight: '700',
    marginBottom: 4,
  },
  pairingHeading: {
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.5,
    color: '#ffffff',
    marginBottom: 6,
  },
  pairingSubtitle: {
    fontSize: 13,
    lineHeight: 18,
    color: Colors.textSecondary,
  },
  inputContainer: {
    marginBottom: Spacing.four,
  },
  inputLabel: {
    fontFamily: 'monospace',
    fontSize: 9,
    letterSpacing: 1.5,
    color: Colors.textMuted,
    fontWeight: '700',
    marginBottom: 8,
  },
  roomInput: {
    backgroundColor: '#090d16',
    borderWidth: 1.5,
    borderColor: 'rgba(212, 255, 0, 0.4)',
    borderRadius: Radii.md,
    color: '#ffffff',
    fontSize: 28,
    fontWeight: '900',
    fontFamily: 'monospace',
    letterSpacing: 8,
    paddingVertical: Spacing.three,
    textAlign: 'center',
    textTransform: 'uppercase',
  },
  joinButton: {
    backgroundColor: Colors.primary,
    borderRadius: Radii.md,
    paddingVertical: Spacing.three + 2,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: Colors.primary,
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 4,
  },
  joinButtonDisabled: {
    opacity: 0.35,
    shadowOpacity: 0,
  },
  joinButtonText: {
    color: '#080a0f',
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 1,
    fontFamily: 'monospace',
  },
  errorBox: {
    backgroundColor: 'rgba(255, 77, 109, 0.12)',
    borderColor: 'rgba(255, 77, 109, 0.35)',
    borderWidth: 1,
    borderRadius: Radii.sm,
    padding: Spacing.three,
    marginTop: Spacing.three,
  },
  errorText: {
    color: Colors.danger,
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 16,
  },
  serverQuickBar: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: Spacing.four,
    gap: Spacing.two,
  },
  serverQuickLabel: {
    fontFamily: 'monospace',
    fontSize: 9,
    color: Colors.textMuted,
    fontWeight: '700',
    letterSpacing: 1,
  },
  serverQuickPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#090d16',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: Radii.xs,
    borderWidth: 1,
    borderColor: '#1a2336',
    gap: 6,
    flex: 1,
  },
  serverQuickUrl: {
    color: Colors.cyan,
    fontSize: 11,
    fontFamily: 'monospace',
    fontWeight: '600',
    flex: 1,
  },
  serverQuickIcon: {
    fontSize: 11,
    color: Colors.textMuted,
  },

  /* HUD Strip (When Paired) */
  hudCard: {
    backgroundColor: Colors.card,
    borderRadius: Radii.md,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    padding: Spacing.three,
    marginBottom: Spacing.three,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  hudInfo: {
    flexDirection: 'row',
    gap: Spacing.four,
    alignItems: 'center',
  },
  hudTokenGroup: {
    flexDirection: 'column',
  },
  hudLabel: {
    fontFamily: 'monospace',
    fontSize: 8,
    color: Colors.textMuted,
    fontWeight: '700',
    letterSpacing: 1,
    marginBottom: 2,
  },
  hudTokenRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  hudLiveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.primary,
    shadowColor: Colors.primary,
    shadowOpacity: 0.8,
    shadowRadius: 6,
  },
  hudTokenValue: {
    fontFamily: 'monospace',
    fontSize: 18,
    fontWeight: '900',
    color: '#ffffff',
    letterSpacing: 2,
  },
  hudStatusGroup: {
    flexDirection: 'column',
  },
  hudStatusText: {
    fontFamily: 'monospace',
    fontSize: 11,
    fontWeight: '700',
    marginTop: 3,
  },
  unlinkButton: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: Radii.xs,
    backgroundColor: 'rgba(255, 77, 109, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255, 77, 109, 0.35)',
  },
  unlinkButtonText: {
    color: Colors.danger,
    fontSize: 10,
    fontWeight: '800',
    fontFamily: 'monospace',
    letterSpacing: 0.8,
  },

  /* Mode Selector */
  modeCard: {
    backgroundColor: Colors.card,
    borderRadius: Radii.md,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    padding: Spacing.three,
    marginBottom: Spacing.three,
  },
  modeHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.two,
  },
  modeLabel: {
    fontFamily: 'monospace',
    fontSize: 9,
    color: Colors.textMuted,
    fontWeight: '700',
    letterSpacing: 1.5,
  },
  modeStatus: {
    fontFamily: 'monospace',
    fontSize: 9,
    color: Colors.primary,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  modeTabs: {
    flexDirection: 'row',
    backgroundColor: '#090d16',
    borderRadius: Radii.sm,
    padding: 3,
  },
  modeTab: {
    flex: 1,
    paddingVertical: Spacing.two,
    alignItems: 'center',
    borderRadius: Radii.xs,
  },
  modeTabActive: {
    backgroundColor: 'rgba(212, 255, 0, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(212, 255, 0, 0.4)',
  },
  modeTabText: {
    color: Colors.textMuted,
    fontSize: 11,
    fontWeight: '700',
    fontFamily: 'monospace',
  },
  modeTabTextActive: {
    color: Colors.primary,
  },

  /* Sensor Warning Box */
  sensorWarningBox: {
    backgroundColor: 'rgba(255, 183, 3, 0.1)',
    borderColor: 'rgba(255, 183, 3, 0.35)',
    borderWidth: 1,
    borderRadius: Radii.md,
    padding: Spacing.three,
    marginBottom: Spacing.three,
  },
  sensorWarningTitle: {
    color: Colors.warning,
    fontSize: 12,
    fontWeight: '800',
    marginBottom: 4,
  },
  sensorWarningText: {
    color: '#fed7aa',
    fontSize: 11,
    lineHeight: 15,
    marginBottom: Spacing.two,
  },
  switchJoystickBtn: {
    alignSelf: 'flex-start',
    backgroundColor: '#78350f',
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: Radii.xs,
  },
  switchJoystickBtnText: {
    color: '#fef3c7',
    fontSize: 11,
    fontWeight: '700',
  },

  /* Calibration Row */
  calibrationRow: {
    marginBottom: Spacing.four,
  },
  calibrateButton: {
    backgroundColor: 'rgba(212, 255, 0, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(212, 255, 0, 0.4)',
    borderRadius: Radii.md,
    paddingVertical: Spacing.three,
    alignItems: 'center',
    shadowColor: Colors.primary,
    shadowOpacity: 0.25,
    shadowRadius: 8,
  },
  calibrateButtonDisabled: {
    opacity: 0.35,
    borderColor: '#1a2336',
  },
  calibrateButtonText: {
    color: Colors.primary,
    fontSize: 13,
    fontWeight: '800',
    fontFamily: 'monospace',
    letterSpacing: 0.8,
  },
});
