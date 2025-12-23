/**
 * Client-side image processing utilities.
 * Handles HEIC conversion and resize for TV display.
 * All processing happens in the browser before upload.
 */

// Constants
const TV_MAX_WIDTH = 1920;
const TV_MAX_HEIGHT = 1080;
const TV_QUALITY = 0.8;
const JPEG_QUALITY = 0.90; // High quality for first attempt
const ORIGINAL_MAX_SIZE = 4096; // 4K quality max
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB limit (storage optimization)

// Multi-level compression quality settings
const QUALITY_LEVELS = [
  { quality: 0.90, label: 'High quality' },
  { quality: 0.85, label: 'Good quality' },
  { quality: 0.80, label: 'Standard quality' }
];

// Resize fallback dimensions
const RESIZE_LEVELS = [
  { size: 4096, quality: 0.90, label: '4K' },
  { size: 3072, quality: 0.85, label: '3K' },
  { size: 2048, quality: 0.80, label: '2K' }
];

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
 * Get dimensions of an image blob.
 */
async function getImageDimensions(blob: Blob): Promise<{ width: number; height: number }> {
  const img = await loadImage(blob);
  return { width: img.width, height: img.height };
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
 * Try multiple quality levels for compression without resizing.
 * Returns the best quality that fits under MAX_FILE_SIZE.
 */
async function tryMultiLevelCompression(blob: Blob): Promise<{
  success: boolean;
  optimizedBlob: Blob | null;
  qualityUsed?: number;
  label?: string;
  sizeDifference?: number;
}> {
  console.log('🔄 Trying multi-level compression...');
  
  for (const level of QUALITY_LEVELS) {
    try {
      const result = await tryFormatOptimization(blob, level.quality);
      
      console.log(`  • ${level.label} (${level.quality}): ${formatFileSize(result.optimizedBlob.size)}`);
      
      if (result.optimizedBlob.size <= MAX_FILE_SIZE) {
        console.log(`✅ Success with ${level.label}!`);
        return {
          success: true,
          optimizedBlob: result.optimizedBlob,
          qualityUsed: level.quality,
          label: level.label,
          sizeDifference: result.sizeDifference
        };
      }
    } catch (err) {
      console.warn(`  ⚠️ ${level.label} failed:`, err);
    }
  }
  
  console.log('❌ All compression levels failed');
  return { success: false, optimizedBlob: null };
}

/**
 * Try multiple resize levels if compression alone isn't enough.
 */
async function tryMultiLevelResize(blob: Blob): Promise<{
  success: boolean;
  resizedBlob: Blob | null;
  sizeUsed?: number;
  qualityUsed?: number;
  label?: string;
}> {
  console.log('📏 Trying multi-level resize...');
  
  for (const level of RESIZE_LEVELS) {
    try {
      const resized = await resizeImage(blob, level.size, level.size, level.quality);
      
      console.log(`  • ${level.label} (${level.size}px @ ${level.quality}): ${formatFileSize(resized.size)}`);
      
      if (resized.size <= MAX_FILE_SIZE) {
        console.log(`✅ Success with ${level.label}!`);
        return {
          success: true,
          resizedBlob: resized,
          sizeUsed: level.size,
          qualityUsed: level.quality,
          label: level.label
        };
      }
    } catch (err) {
      console.warn(`  ⚠️ ${level.label} failed:`, err);
    }
  }
  
  console.log('❌ All resize levels failed');
  return { success: false, resizedBlob: null };
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
  // Log original file info
  const originalDims = await getImageDimensions(file);
  console.log(`📸 ORIGINAL FILE: ${file.name}`);
  console.log(`   Resolution: ${originalDims.width}x${originalDims.height}`);
  console.log(`   Size: ${formatFileSize(file.size)}`);
  console.log(`   Type: ${file.type}`);
  
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
  let compressionStrategy = 'none';
  
  // Step 2: Check if image is too large
  if (originalBlob.size > MAX_FILE_SIZE) {
    console.log(`⚠️ Image too large: ${formatFileSize(originalBlob.size)} > ${formatFileSize(MAX_FILE_SIZE)}`);
    
    // Strategy 1: Try multi-level compression without resizing (preserves original dimensions)
    const compressionResult = await tryMultiLevelCompression(originalBlob);
    
    if (compressionResult.success && compressionResult.optimizedBlob) {
      originalBlob = compressionResult.optimizedBlob;
      originalMime = 'image/jpeg';
      originalExt = 'jpg';
      originalProcessed = true;
      compressionStrategy = `compression-${compressionResult.label}`;
      formatOptimization = {
        sizeDifference: compressionResult.sizeDifference || 0,
        compressionRatio: compressionResult.optimizedBlob.size / file.size
      };
      console.log(`✅ Compression succeeded, kept original dimensions`);
    } else {
      // Strategy 2: Compression failed, try multi-level resize
      console.log('⚠️ Compression insufficient, trying resize...');
      const resizeResult = await tryMultiLevelResize(originalBlob);
      
      if (resizeResult.success && resizeResult.resizedBlob) {
        originalBlob = resizeResult.resizedBlob;
        originalMime = 'image/jpeg';
        originalExt = 'jpg';
        originalProcessed = true;
        compressionStrategy = `resize-${resizeResult.label}`;
        console.log(`✅ Resize succeeded with ${resizeResult.label}`);
      } else {
        // Strategy 3: Everything failed, throw error
        throw new Error(
          `Image too large after all optimization attempts (${formatFileSize(originalBlob.size)}). ` +
          `Maximum size is ${formatFileSize(MAX_FILE_SIZE)}. Please try a smaller image.`
        );
      }
    }
  } else {
    // Check if dimensions need adjustment (even if size is OK)
    const img = await loadImage(originalBlob);
    if (img.width > ORIGINAL_MAX_SIZE || img.height > ORIGINAL_MAX_SIZE) {
      console.log(`📏 Dimensions too large (${img.width}x${img.height}), resizing to ${ORIGINAL_MAX_SIZE}px...`);
      originalBlob = await resizeImage(originalBlob, ORIGINAL_MAX_SIZE, ORIGINAL_MAX_SIZE, JPEG_QUALITY);
      originalMime = 'image/jpeg';
      originalExt = 'jpg';
      originalProcessed = true;
      compressionStrategy = 'resize-dimensions';
    } else {
      console.log(`✅ Image size OK: ${formatFileSize(originalBlob.size)}`);
    }
  }
  
  // Step 3: Analyze TV version benefit
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
  
  // Log final upload details
  const finalOriginalDims = await getImageDimensions(originalBlob);
  console.log(`\n📤 UPLOADING HIGH QUALITY VERSION:`);
  console.log(`   Resolution: ${finalOriginalDims.width}x${finalOriginalDims.height}`);
  console.log(`   Size: ${formatFileSize(originalBlob.size)}`);
  console.log(`   Processed: ${originalProcessed ? 'Yes' : 'No'} (${compressionStrategy})`);
  
  if (tvBlob) {
    const tvDims = await getImageDimensions(tvBlob);
    console.log(`\n📤 UPLOADING TV VERSION:`);
    console.log(`   Resolution: ${tvDims.width}x${tvDims.height}`);
    console.log(`   Size: ${formatFileSize(tvBlob.size)}`);
  } else {
    console.log(`\n📤 TV VERSION: Using high quality version (same file)`);
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
      formatOptimization,
      compressionStrategy
    }
  };

  console.log('🎉 Image processing complete:', {
    strategy: compressionStrategy,
    original: formatFileSize(result.original.size),
    tv: tvBlob ? formatFileSize(tvBlob.size) : 'Using original',
    storageSaved: useSameForTv && tvAnalysis.expectedSavings > 0 ? formatFileSize(tvAnalysis.expectedSavings) : '0B'
  });

  // Final safety check (should not reach here with new logic, but just in case)
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
