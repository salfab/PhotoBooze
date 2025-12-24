/**
 * Image processing constants.
 */

export const IMAGE = {
  /** Maximum dimension for TV-optimized images */
  TV_MAX_WIDTH: 1920,
  TV_MAX_HEIGHT: 1080,
  
  /** Quality setting for TV images (0-1) */
  TV_QUALITY: 0.8,
  
  /** Quality setting for original JPEG compression */
  JPEG_QUALITY: 0.90,
  
  /** Maximum dimension for original images */
  ORIGINAL_MAX_SIZE: 4096,
  
  /** Maximum file size for storage optimization (3MB) */
  MAX_FILE_SIZE_BYTES: 3 * 1024 * 1024,
  
  /** Minimum savings threshold to justify TV version (300KB) */
  MIN_TV_SAVINGS_BYTES: 300 * 1024,
} as const;

export const IMAGE_QUALITY_LEVELS = [
  { quality: 0.90, label: 'High quality' },
  { quality: 0.85, label: 'Good quality' },
  { quality: 0.80, label: 'Standard quality' },
] as const;

export const IMAGE_RESIZE_LEVELS = [
  { size: 4096, quality: 0.90, label: '4K' },
  { size: 3072, quality: 0.85, label: '3K' },
  { size: 2048, quality: 0.80, label: '2K' },
] as const;

/** Valid PIN format: exactly 6 digits */
export const PIN_FORMAT_REGEX = /^\d{6}$/;

/** PIN length */
export const PIN_LENGTH = 6;
