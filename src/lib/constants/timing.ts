/**
 * Timing constants used throughout the application.
 * All values are in milliseconds unless otherwise noted.
 */

export const TIMING = {
  /** Delay before cleaning up Supabase channels */
  CHANNEL_CLEANUP_MS: 500,
  
  /** Auto-hide timeout for QR overlay */
  QR_OVERLAY_TIMEOUT_MS: 60000,
  
  /** Minimum time to display each photo on TV */
  MIN_PHOTO_DISPLAY_MS: 10000,
  
  /** Duration of celebration animation */
  CELEBRATION_DURATION_MS: 15000,
  
  /** Animation offset for staggered effects */
  ANIMATION_OFFSET_MS: 300,
  
  /** Generic debounce delay */
  DEBOUNCE_MS: 300,
  
  /** Toast/success message display time */
  TOAST_DURATION_MS: 2000,
  
  /** PIN auto-submit delay */
  PIN_AUTO_SUBMIT_MS: 150,
  
  /** Countdown timer interval */
  COUNTDOWN_INTERVAL_MS: 1000,
  
  /** Idle prompt rotation interval */
  IDLE_PROMPT_INTERVAL_MS: 20000,
  
  /** Time without photos before showing idle prompt */
  IDLE_THRESHOLD_MS: 120000,
} as const;

export const TIMING_SECONDS = {
  /** Session expiry time */
  SESSION_EXPIRY_HOURS: 12,
  
  /** Signed URL expiry time */
  SIGNED_URL_EXPIRY_SECONDS: 300,
} as const;
