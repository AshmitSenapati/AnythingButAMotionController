export const Colors = {
  background: '#080a0f',
  backgroundElevated: '#0e1219',
  card: '#121722',
  cardElevated: '#161d2a',
  cardBorder: '#1c2536',
  cardBorderHighlight: '#2a354b',
  cardBorderGlow: 'rgba(212, 255, 0, 0.3)',
  primary: '#d4ff00', // Electric lime
  primaryDim: 'rgba(212, 255, 0, 0.12)',
  primaryGlow: 'rgba(212, 255, 0, 0.35)',
  secondary: '#00f0ff', // Cool cyan
  secondaryDim: 'rgba(0, 240, 255, 0.12)',
  secondaryGlow: 'rgba(0, 240, 255, 0.35)',
  cyan: '#00f0ff',
  cyanGlow: 'rgba(0, 240, 255, 0.35)',
  danger: '#ff4d6d',
  dangerDim: 'rgba(255, 77, 109, 0.15)',
  dangerGlow: 'rgba(255, 77, 109, 0.35)',
  warning: '#ffb703',
  warningDim: 'rgba(255, 183, 3, 0.15)',
  text: '#f4f6fa',
  textSecondary: '#8e9baa',
  textMuted: '#5e6b7d',
  dark: {
    background: '#080a0f',
    card: '#121722',
    text: '#f4f6fa',
  },
  light: {
    background: '#080a0f',
    card: '#121722',
    text: '#f4f6fa',
  },
} as const;

export const Spacing = {
  one: 4,
  two: 8,
  three: 12,
  four: 16,
  five: 24,
  six: 32,
  seven: 48,
} as const;

export const Radii = {
  xs: 4,
  sm: 6,
  md: 10,
  lg: 14,
  xl: 18,
  full: 9999,
} as const;
