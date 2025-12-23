/**
 * Client-side image processing utilities.
 * Handles HEIC conversion and resize for TV display.
 * All processing happens in the browser before upload.
 */

// Constants
const TV_MAX_WIDTH = 1920;
const TV_MAX_HEIGHT = 1080;
const TV_QUALITY = 0.8;
const JPEG_QUALITY = 0.90; // Increased from 0.85 for better quality
const ORIGINAL_MAX_SIZE = 4096; // Increased from 3072 to 4096 (4K quality)
const MAX_FILE_SIZE = 20 * 1024 * 1024; // Increased from 4MB to 20MB (Supabase limit with margin)

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
 * Analyze if creating a separate TV version is beneficial.
 * Returns analysis of potential savings and efficiency.
 */
async function analyzeTvVersionBenefit(originalBlob: Blob): Promise<{
  shouldCreateSeparate: boolean;
  expectedSavings: number;
  resolutionReduction: number;
  reason: string;
}> {
  const img = await loadImage(originalBlob);
  
  // Calculate what TV dimensions would be
  const scaleX = TV_MAX_WIDTH / img.width;
  const scaleY = TV_MAX_HEIGHT / img.height;
  const scale = Math.min(scaleX, scaleY, 1);
  
  const tvWidth = Math.round(img.width * scale);
  const tvHeight = Math.round(img.height * scale);
  const resolutionReduction = ((img.width * img.height) - (tvWidth * tvHeight)) / (img.width * img.height);
  
  // Case 1: Already TV-sized or smaller
  if (img.width <= TV_MAX_WIDTH && img.height <= TV_MAX_HEIGHT) {
    // Still create separate if file is large (>1.5MB) - compression might help
    if (originalBlob.size <= 1.5 * 1024 * 1024) {
      return {
        shouldCreateSeparate: false,
        expectedSavings: 0,
        resolutionReduction,
        reason: 'Already TV-sized and file small enough (<1.5MB)'
      };
    }
    
    // Try compression estimation for large files at TV size
    const expectedCompressedSize = originalBlob.size * 0.6; // Estimate 40% compression
    if (expectedCompressedSize > originalBlob.size * 0.8) {
      return {
        shouldCreateSeparate: false,
        expectedSavings: 0,
        resolutionReduction,
        reason: 'Compression wouldn\'t provide significant savings'
      };
    }
  }
  
  // Case 2: Minimal resolution reduction and small file
  if (resolutionReduction < 0.2 && originalBlob.size < 2 * 1024 * 1024) {
    return {
      shouldCreateSeparate: false,
      expectedSavings: 0,
      resolutionReduction,
      reason: 'Minimal resolution reduction (<20%) and file already small (<2MB)'
    };
  }
  
  // Estimate potential file size savings
  const estimatedSizeReduction = resolutionReduction * 0.8; // Conservative estimate
  const expectedSavings = originalBlob.size * estimatedSizeReduction;
  
  // Case 3: Expected savings too small to justify
  if (expectedSavings < 300 * 1024) { // Less than 300KB savings
    return {
      shouldCreateSeparate: false,
      expectedSavings,
      resolutionReduction,
      reason: 'Expected savings too small (<300KB)'
    };
  }
  
  // Worth creating separate TV version
  return {
    shouldCreateSeparate: true,
    expectedSavings,
    resolutionReduction,
    reason: `Significant savings expected: ${(expectedSavings / (1024 * 1024)).toFixed(1)}MB`
  };
}

/**
 * Try format optimization (compression) without resizing.
 */
async function tryFormatOptimization(blob: Blob, targetQuality: number): Promise<{
  optimizedBlob: Blob;
  sizeDifference: number;
  compressionRatio: number;
}> {
  const img = await loadImage(blob);
  const canvas = document.createElement('canvas');
  canvas.width = img.width;
  canvas.height = img.height;
  
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Failed to get canvas context');
  
  // Use high quality settings for recompression
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0);
  
  const optimized = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (result) => result ? resolve(result) : reject(new Error('Format optimization failed')),
      'image/jpeg',
      targetQuality
    );
  });
  
  return {
    optimizedBlob: optimized,
    sizeDifference: blob.size - optimized.size,
    compressionRatio: optimized.size / blob.size
  };
}

/**
 * Process an image file for upload with smart optimization.
 * Returns both original (converted if HEIC) and TV-sized versions, or indicates if same file should be used.
 */
export interface ProcessedImage {
  original: Blob;
  originalMime: string;
  originalExt: string;
  tv: Blob | null; // null if should use original
  tvMime: string;
  useSameForTv: boolean; // true if TV should use original file
  analysis: {
    originalProcessed: boolean;
    tvAnalysis: {
      shouldCreateSeparate: boolean;
      expectedSavings: number;
      resolutionReduction: number;
      reason: string;
    };
    formatOptimization?: {
      sizeDifference: number;
      compressionRatio: number;
    };
  };
}

export async function processImage(file: File): Promise<ProcessedImage> {
  console.log(`🖼️ Processing image: ${file.name} (${formatFileSize(file.size)})`);
  
  let originalBlob: Blob;
  let originalMime: string;
  let originalExt: string;
  
  // Step 1: Handle HEIC conversion (mandatory)
  if (isHeicFile(file)) {
    console.log('🔄 Converting HEIC to JPEG...');
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
  
  let originalProcessed = false;
  let formatOptimization: { sizeDifference: number; compressionRatio: number } | undefined;
  
  // Step 2: Check if original needs processing
  let needsResizing = await shouldResizeOriginal(originalBlob);
  
  if (needsResizing) {
    console.log('⚠️ Image needs processing (too large)');
    
    // Try format optimization first (avoid resizing if possible)
    try {
      const optimization = await tryFormatOptimization(originalBlob, JPEG_QUALITY);
      formatOptimization = {
        sizeDifference: optimization.sizeDifference,
        compressionRatio: optimization.compressionRatio
      };
      
      console.log(`🗜️ Format optimization: ${formatFileSize(optimization.sizeDifference)} saved (${(optimization.compressionRatio * 100).toFixed(1)}% of original)`);
      
      // Check if compression alone solved the size issue
      if (optimization.optimizedBlob.size <= MAX_FILE_SIZE) {
        const img = await loadImage(optimization.optimizedBlob);
        if (img.width <= ORIGINAL_MAX_SIZE && img.height <= ORIGINAL_MAX_SIZE) {
          originalBlob = optimization.optimizedBlob;
          originalMime = 'image/jpeg';
          originalExt = 'jpg';
          needsResizing = false;
          originalProcessed = true;
          console.log('✅ Format optimization sufficient, avoiding resize');
        }
      }
    } catch (err) {
      console.warn('Format optimization failed, proceeding with resize:', err);
    }
  }
  
  // Step 3: Resize only if format optimization wasn't enough
  if (needsResizing) {
    console.log('📏 Resizing required after format optimization');
    originalBlob = await resizeImage(originalBlob, ORIGINAL_MAX_SIZE, ORIGINAL_MAX_SIZE, JPEG_QUALITY);
    originalMime = 'image/jpeg';
    originalExt = 'jpg';
    originalProcessed = true;
  }
  
  // Step 4: Analyze TV version benefit
  console.log('📺 Analyzing TV version benefit...');
  const tvAnalysis = await analyzeTvVersionBenefit(originalBlob);
  
  console.log(`📺 TV analysis: ${tvAnalysis.reason}`);
  
  let tvBlob: Blob | null = null;
  let useSameForTv = true;
  
  if (tvAnalysis.shouldCreateSeparate) {
    console.log('📺 Creating separate TV version...');
    tvBlob = await resizeForTv(originalBlob);
    useSameForTv = false;
    console.log(`📺 TV version created: ${formatFileSize(tvBlob.size)} (${formatFileSize(tvAnalysis.expectedSavings)} saved)`);
  } else {
    console.log('📺 Using original as TV version (no separate file needed)');
  }
  
  const result = {
    original: originalBlob,
    originalMime,
    originalExt,
    tv: tvBlob,
    tvMime: 'image/jpeg',
    useSameForTv,
    analysis: {
      originalProcessed,
      tvAnalysis,
      formatOptimization
    }
  };

  console.log('🎉 Image processing complete:', {
    original: formatFileSize(result.original.size),
    tv: tvBlob ? formatFileSize(tvBlob.size) : 'Using original',
    storageSaved: useSameForTv && tvAnalysis.expectedSavings > 0 ? formatFileSize(tvAnalysis.expectedSavings) : '0B'
  });

  // Final safety check - if still over limit, throw error (no emergency compression)
  if (result.original.size > MAX_FILE_SIZE) {
    throw new Error(`Image too large after processing (${formatFileSize(result.original.size)}). Maximum size is ${formatFileSize(MAX_FILE_SIZE)}. Please try a smaller image.`);
  }

  return result;
}

/**
 * Get file size in human-readable format.
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
