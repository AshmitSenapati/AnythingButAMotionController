import React, { useEffect, useRef, useState } from 'react';
import {
  AppState,
  GestureResponderEvent,
  PanResponder,
  PanResponderGestureState,
  Platform,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Colors, Radii, Spacing } from '../constants/theme';

interface VirtualJoystickProps {
  onMove: (x: number, y: number) => void;
  onRelease: () => void;
  onEngagementChange?: (engaged: boolean) => void;
  disabled?: boolean;
}

const BASE_RADIUS = 88;
const KNOB_RADIUS = 30;
const MAX_TRAVEL = BASE_RADIUS - KNOB_RADIUS;

export function VirtualJoystick({
  onMove,
  onRelease,
  onEngagementChange,
  disabled = false,
}: VirtualJoystickProps) {
  const [knobPosition, setKnobPosition] = useState({ x: 0, y: 0 });
  const [isEngaged, setIsEngaged] = useState(false);
  const [activeCardinal, setActiveCardinal] = useState({
    n: false,
    s: false,
    e: false,
    w: false,
  });

  const onMoveRef = useRef(onMove);
  onMoveRef.current = onMove;

  const onReleaseRef = useRef(onRelease);
  onReleaseRef.current = onRelease;

  const onEngagementChangeRef = useRef(onEngagementChange);
  onEngagementChangeRef.current = onEngagementChange;

  const disabledRef = useRef(disabled);
  disabledRef.current = disabled;

  const resetToNeutral = () => {
    setKnobPosition({ x: 0, y: 0 });
    setIsEngaged(false);
    setActiveCardinal({ n: false, s: false, e: false, w: false });
    onEngagementChangeRef.current?.(false);
    onReleaseRef.current?.();
  };

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') {
        resetToNeutral();
      }
    });
    return () => sub.remove();
  }, []);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => !disabledRef.current,
      onStartShouldSetPanResponderCapture: () => !disabledRef.current,
      onMoveShouldSetPanResponder: () => !disabledRef.current,
      onMoveShouldSetPanResponderCapture: () => !disabledRef.current,
      onPanResponderTerminationRequest: () => false,

      onPanResponderGrant: () => {
        setIsEngaged(true);
        onEngagementChangeRef.current?.(true);
      },

      onPanResponderMove: (
        _evt: GestureResponderEvent,
        gestureState: PanResponderGestureState
      ) => {
        let dx = gestureState.dx;
        let dy = gestureState.dy;

        const distance = Math.hypot(dx, dy);
        if (distance > MAX_TRAVEL) {
          const angle = Math.atan2(dy, dx);
          dx = Math.cos(angle) * MAX_TRAVEL;
          dy = Math.sin(angle) * MAX_TRAVEL;
        }

        setKnobPosition({ x: dx, y: dy });

        const normX = Math.max(
          -1,
          Math.min(1, Number((dx / MAX_TRAVEL).toFixed(2)))
        );
        const normY = Math.max(
          -1,
          Math.min(1, Number((dy / MAX_TRAVEL).toFixed(2)))
        );

        setActiveCardinal({
          n: normY < -0.2,
          s: normY > 0.2,
          w: normX < -0.2,
          e: normX > 0.2,
        });

        onMoveRef.current(normX, normY);
      },

      onPanResponderRelease: () => {
        resetToNeutral();
      },

      onPanResponderTerminate: () => {
        resetToNeutral();
      },
    })
  ).current;

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <View style={styles.titleWrap}>
          <Text style={styles.eyebrow}>ANALOG CONTROLLER</Text>
          <Text style={styles.subtitle}>Precision Touch Joystick</Text>
        </View>

        <View
          style={[
            styles.statusPill,
            isEngaged && styles.statusPillActive,
          ]}
        >
          <View
            style={[
              styles.statusDot,
              isEngaged && styles.statusDotActive,
            ]}
          />
          <Text
            style={[
              styles.statusText,
              isEngaged && styles.statusTextActive,
            ]}
          >
            {isEngaged ? 'TRANSMITTING' : 'TOUCH TO STEER'}
          </Text>
        </View>
      </View>

      <View style={styles.joystickArea}>
        {/* Cardinal Arrow Indicators */}
        <View style={[styles.cardinalArrow, styles.arrowNorth, activeCardinal.n && styles.cardinalActive]}>
          <Text style={[styles.cardinalText, activeCardinal.n && styles.cardinalTextActive]}>▲</Text>
        </View>
        <View style={[styles.cardinalArrow, styles.arrowSouth, activeCardinal.s && styles.cardinalActive]}>
          <Text style={[styles.cardinalText, activeCardinal.s && styles.cardinalTextActive]}>▼</Text>
        </View>
        <View style={[styles.cardinalArrow, styles.arrowWest, activeCardinal.w && styles.cardinalActive]}>
          <Text style={[styles.cardinalText, activeCardinal.w && styles.cardinalTextActive]}>◀</Text>
        </View>
        <View style={[styles.cardinalArrow, styles.arrowEast, activeCardinal.e && styles.cardinalActive]}>
          <Text style={[styles.cardinalText, activeCardinal.e && styles.cardinalTextActive]}>▶</Text>
        </View>

        <View
          style={[
            styles.base,
            isEngaged && styles.baseActive,
            disabled && styles.baseDisabled,
            Platform.OS === 'web' && ({ touchAction: 'none' } as unknown as object),
          ]}
          {...panResponder.panHandlers}
        >
          {/* Concentric Guide Grid */}
          <View style={styles.outerRing} />
          <View style={styles.innerRing} />
          <View style={styles.axisX} />
          <View style={styles.axisY} />

          {/* Floating Analog Thumb Knob */}
          <View
            style={[
              styles.knob,
              {
                transform: [
                  { translateX: knobPosition.x },
                  { translateY: knobPosition.y },
                ],
              },
              isEngaged && styles.knobActive,
            ]}
          >
            <View style={styles.knobRim} />
            <View style={styles.knobCenter} />
          </View>
        </View>
      </View>

      <Text style={styles.caption}>
        Full 360° input · Locked in viewport to eliminate screen scrolling
      </Text>
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
    alignItems: 'center',
  },
  headerRow: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.three,
  },
  titleWrap: {
    flexDirection: 'column',
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
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: Radii.xs,
    backgroundColor: '#0a0d14',
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  statusPillActive: {
    backgroundColor: 'rgba(212, 255, 0, 0.1)',
    borderColor: 'rgba(212, 255, 0, 0.35)',
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.textMuted,
  },
  statusDotActive: {
    backgroundColor: Colors.primary,
    shadowColor: Colors.primary,
    shadowRadius: 6,
    shadowOpacity: 0.8,
  },
  statusText: {
    color: Colors.textSecondary,
    fontSize: 9,
    fontWeight: '700',
    fontFamily: 'monospace',
    letterSpacing: 0.8,
  },
  statusTextActive: {
    color: Colors.primary,
  },
  joystickArea: {
    width: BASE_RADIUS * 2 + 36,
    height: BASE_RADIUS * 2 + 36,
    justifyContent: 'center',
    alignItems: 'center',
    marginVertical: Spacing.two,
    position: 'relative',
  },
  cardinalArrow: {
    position: 'absolute',
    width: 22,
    height: 22,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1,
  },
  arrowNorth: { top: 0, alignSelf: 'center' },
  arrowSouth: { bottom: 0, alignSelf: 'center' },
  arrowWest: { left: 0, top: '50%', marginTop: -11 },
  arrowEast: { right: 0, top: '50%', marginTop: -11 },
  cardinalText: {
    fontSize: 11,
    color: '#2a364d',
    fontWeight: '900',
  },
  cardinalActive: {
    transform: [{ scale: 1.25 }],
  },
  cardinalTextActive: {
    color: Colors.primary,
  },
  base: {
    width: BASE_RADIUS * 2,
    height: BASE_RADIUS * 2,
    borderRadius: BASE_RADIUS,
    backgroundColor: '#090d16',
    borderWidth: 2,
    borderColor: '#1a2336',
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 10,
    elevation: 4,
  },
  baseActive: {
    borderColor: 'rgba(212, 255, 0, 0.45)',
    shadowColor: Colors.primary,
    shadowOpacity: 0.25,
    shadowRadius: 16,
  },
  baseDisabled: {
    opacity: 0.5,
  },
  outerRing: {
    width: BASE_RADIUS * 1.5,
    height: BASE_RADIUS * 1.5,
    borderRadius: (BASE_RADIUS * 1.5) / 2,
    borderWidth: 1,
    borderColor: '#162030',
    borderStyle: 'dashed',
    position: 'absolute',
  },
  innerRing: {
    width: BASE_RADIUS * 0.9,
    height: BASE_RADIUS * 0.9,
    borderRadius: (BASE_RADIUS * 0.9) / 2,
    borderWidth: 1,
    borderColor: '#1e2b42',
    position: 'absolute',
  },
  axisX: {
    width: '100%',
    height: 1,
    backgroundColor: '#141d2d',
    position: 'absolute',
  },
  axisY: {
    height: '100%',
    width: 1,
    backgroundColor: '#141d2d',
    position: 'absolute',
  },
  knob: {
    width: KNOB_RADIUS * 2,
    height: KNOB_RADIUS * 2,
    borderRadius: KNOB_RADIUS,
    backgroundColor: '#121824',
    borderWidth: 2,
    borderColor: 'rgba(0, 240, 255, 0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.6,
    shadowRadius: 8,
    elevation: 6,
  },
  knobActive: {
    backgroundColor: '#172233',
    borderColor: Colors.primary,
    shadowColor: Colors.primary,
    shadowOpacity: 0.6,
    shadowRadius: 12,
  },
  knobRim: {
    width: KNOB_RADIUS * 1.3,
    height: KNOB_RADIUS * 1.3,
    borderRadius: (KNOB_RADIUS * 1.3) / 2,
    borderWidth: 1,
    borderColor: 'rgba(212, 255, 0, 0.25)',
    position: 'absolute',
  },
  knobCenter: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: Colors.primary,
    shadowColor: Colors.primary,
    shadowOpacity: 0.9,
    shadowRadius: 8,
  },
  caption: {
    color: Colors.textMuted,
    fontSize: 10,
    fontFamily: 'monospace',
    textAlign: 'center',
    marginTop: Spacing.two,
  },
});
