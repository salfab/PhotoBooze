/**
 * Client-side image processing utilities.
 * Handles HEIC conversion and resize for TV display.
 * All processing happens in the browser before upload.
 */

// Constants
const TV_MAX_WIDTH = 1920;
const TV_MAX_HEIGHT = 1080;
const TV_QUALITY = 0.8;
const JPEG_QUALITY = 0.98;
const ORIGINAL_MAX_SIZE = 4096; // Max dimension for original (4K)
const MAX_FILE_SIZE = 2 * 1024 * 1024; // 4MB limit for Vercel

/**
 * Check if a file is a HEIC/HEIF image.
 */
export function isHeicFile(file: File): boolean {
  const mimeType = file.type.toLowerCase();
  const fileName = file.name.toLowerCase();
  
  return (
    mimeType === 'image/heic' ||
    mimeType === 'image/heif' ||
    fileName.endsWith('.heic') ||
    fileName.endsWith('.heif')
  );
}

/**
 * Convert HEIC/HEIF image to JPEG blob.
 * Uses heic2any library.
 */
export async function convertHeicToJpeg(file: File): Promise<Blob> {
  // Dynamic import to avoid loading heic2any unless needed
  const heic2any = (await import('heic2any')).default;
  
  const result = await heic2any({
    blob: file,
    toType: 'image/jpeg',
    quality: JPEG_QUALITY,
  });
  
  // heic2any can return an array for multi-page HEIC files
  return Array.isArray(result) ? result[0] : result;
}

/**
 * Load an image from a blob into an HTMLImageElement.
 */
function loadImage(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(blob);
    
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load image'));
    };
    
    img.src = url;
  });
}

/**
 * Resize an image to fit within specified dimensions.
 * Returns JPEG blob.
 */
async function resizeImage(blob: Blob, maxWidth: number, maxHeight: number, quality: number): Promise<Blob> {
  const img = await loadImage(blob);
  
  let { width, height } = img;
  
  // Calculate scaling factor to fit within dimensions
  const scaleX = maxWidth / width;
  const scaleY = maxHeight / height;
  const scale = Math.min(scaleX, scaleY, 1); // Don't upscale
  
  width = Math.round(width * scale);
  height = Math.round(height * scale);
  
  // Create canvas and draw resized image
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Failed to get canvas context');
  }
  
  // Use better image smoothing for resize
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  
  ctx.drawImage(img, 0, 0, width, height);
  
  // Convert to JPEG blob
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (result) => {
        if (result) {
          resolve(result);
        } else {
          reject(new Error('Failed to create image blob'));
        }
      },
      'image/jpeg',
      quality
    );
  });
}

/**
 * Resize an image to fit within TV dimensions (1920x1080).
 * Returns JPEG blob.
 */
export async function resizeForTv(blob: Blob): Promise<Blob> {
  return resizeImage(blob, TV_MAX_WIDTH, TV_MAX_HEIGHT, TV_QUALITY);
}

/**
 * Check if original image needs resizing (too large in dimensions or file size).
 */
async function shouldResizeOriginal(blob: Blob): Promise<boolean> {
  // Check file size first
  if (blob.size > MAX_FILE_SIZE) {
    return true;
  }
  
  // Check dimensions
  const img = await loadImage(blob);
  return img.width > ORIGINAL_MAX_SIZE || img.height > ORIGINAL_MAX_SIZE;
}

/**
 * Process an image file for upload.
 * Returns both original (converted if HEIC) and TV-sized versions.
 */
export interface ProcessedImage {
  original: Blob;
  originalMime: string;
  originalExt: string;
  tv: Blob;
  tvMime: string;
}

export async function processImage(file: File): Promise<ProcessedImage> {
  let originalBlob: Blob;
  let originalMime: string;
  let originalExt: string;
  
  // Convert HEIC to JPEG if needed
  if (isHeicFile(file)) {
    originalBlob = await convertHeicToJpeg(file);
    originalMime = 'image/jpeg';
    originalExt = 'jpg';
  } else {
    originalBlob = file;
    originalMime = file.type;
    
    // Determine extension from mime type
    switch (file.type.toLowerCase()) {
      case 'image/jpeg':
        originalExt = 'jpg';
        break;
      case 'image/png':
        originalExt = 'png';
        break;
      case 'image/webp':
        originalExt = 'webp';
        break;
      default:
        originalExt = 'jpg';
    }
  }
  
  // Only resize/convert original if needed (too large in dimensions or file size)
  const needsResize = await shouldResizeOriginal(originalBlob);
  if (needsResize) {
    originalBlob = await resizeImage(originalBlob, ORIGINAL_MAX_SIZE, ORIGINAL_MAX_SIZE, JPEG_QUALITY);
    originalMime = 'image/jpeg';
    originalExt = 'jpg';
  }
  
  // Create TV-sized version
  const tvBlob = await resizeForTv(originalBlob);
  
  return {
    original: originalBlob,
    originalMime,
    originalExt,
    tv: tvBlob,
    tvMime: 'image/jpeg',
  };
}

/**
 * Get file size in human-readable format.
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
