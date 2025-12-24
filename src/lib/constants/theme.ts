/**
 * Theme color constants used throughout the application.
 */

export const COLORS = {
  /** Primary purple - used for main UI elements */
  primary: '#667eea',
  /** Secondary purple - used for gradients and accents */
  secondary: '#764ba2',
  /** Accent purple - used for highlights */
  accent: '#8b5cf6',
  /** Success green */
  success: '#10b981',
  /** Error red */
  error: '#ef4444',
  /** Warning amber */
  warning: '#f59e0b',
} as const;

export const GRADIENTS = {
  /** Primary gradient - used for buttons, headers, backgrounds */
  primary: `linear-gradient(135deg, ${COLORS.primary} 0%, ${COLORS.secondary} 100%)`,
  /** Overlay gradient - used for photo overlays */
  overlay: 'linear-gradient(to bottom, transparent 0%, rgba(0,0,0,0.7) 100%)',
} as const;

export const QR_CODE_CONFIG = {
  /** Default QR code width */
  width: 300,
  /** Large QR code width (for TV display) */
  widthLarge: 400,
  /** QR code margin */
  margin: 2,
  /** QR code colors */
  color: {
    dark: '#000000',
    light: '#ffffff',
  },
} as const;
