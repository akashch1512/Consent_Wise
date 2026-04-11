import { Platform } from 'react-native';

// ─── ConsentWise Design Tokens ────────────────────────────────────────────────
export const CW = {
  accent: '#6366f1',
  accent2: '#0ea5e9',
  good: '#16a34a',
  warn: '#d97706',
  bad: '#dc2626',
  bg: '#fdfbf5',
  surface: '#ffffff',
  text: '#0f172a',
  muted: '#64748b',
  border: 'rgba(99,102,241,0.12)',
};

export const Colors = {
  light: {
    text: CW.text,
    background: CW.bg,
    tint: CW.accent,
    icon: CW.muted,
    tabIconDefault: CW.muted,
    tabIconSelected: CW.accent,
  },
  dark: {
    text: '#ECEDEE',
    background: '#0f172a',
    tint: '#a5b4fc',
    icon: '#9BA1A6',
    tabIconDefault: '#9BA1A6',
    tabIconSelected: '#a5b4fc',
  },
};

export const Fonts = Platform.select({
  web: {
    sans: "'Inter', system-ui, -apple-system, sans-serif",
    mono: "monospace",
  },
  default: {
    sans: 'normal',
    mono: 'monospace',
  },
});
