# ADR-001: Client-Side Image Processing with Smart Optimization

**Status**: Accepted  
**Date**: 2024-12-23  
**Deciders**: Development Team  

## Context

PhotoBooze handles user-uploaded images that need to be displayed on both mobile devices and TV screens. The application faces several technical constraints and user experience requirements:

### Technical Constraints
- **Vercel Edge Function limits**: 4MB maximum file size for uploads
- **TV Display requirements**: 1920x1080 optimal resolution for performance
- **Network efficiency**: Large images impact loading times on TV displays
- **Format support**: HEIC images from iOS devices need conversion

### User Experience Goals
- Fast photo uploads without quality degradation
- Smooth TV slideshow performance
- Support for modern camera formats (HEIC/HEIF)
- No visible quality loss on TV displays

## Decision

Implement **client-side image processing with smart optimization** that creates separate versions only when beneficial:

### Core Strategy
1. **All processing happens client-side** before upload (no server processing)
2. **Smart TV version creation** based on cost-benefit analysis
3. **Format standardization** with HEIC→JPEG conversion
4. **Aggressive but quality-aware compression**

### Processing Pipeline

```typescript
// Original processing (always)
if (isHEIC) → convertToJPEG(quality: 0.98)
if (tooLarge) → resize(maxDim: 4096) + compress

// TV version analysis
analyzeBenefit() → {
  skipIf: alreadyTVSized + small(<1.5MB)
  skipIf: minimalReduction(<20%) + alreadySmall(<2MB) 
  skipIf: expectedSavings < 300KB
  createIf: significantSavings(>300KB)
}
```

### Key Parameters
- **Original max dimension**: 4096px (4K support)
- **TV target resolution**: 1920×1080  
- **JPEG quality**: 98% for originals, 80% for TV
- **Efficiency threshold**: 300KB minimum savings to justify separate TV version
- **File size limit**: 4MB total (Vercel constraint)

## Rationale

### Why Client-Side Processing?
- **Vercel Edge Functions** have strict memory/time limits making server-side processing unreliable
- **User devices** (especially modern phones) have powerful processors suitable for image processing
- **Network efficiency** - only upload optimized versions
- **Better error handling** - user can retry if processing fails

### Why Smart TV Version Creation?
- **Storage optimization** - don't create unnecessary duplicate files
- **Processing time** - skip redundant work for already-optimal images  
- **Bandwidth efficiency** - smaller TV versions load faster on displays
- **Quality preservation** - maintain original quality while optimizing for display context

### Why These Specific Thresholds?

**4096px original limit**: Supports 4K displays while preventing excessive memory usage
**300KB savings threshold**: Balances storage efficiency vs processing overhead
**20% resolution reduction minimum**: Avoids trivial optimizations that provide little benefit
**98% JPEG quality**: Visually lossless compression for originals

## Implementation Details

### Browser Compatibility
- **Canvas API** for resizing/compression (universal support)
- **Dynamic imports** for HEIC conversion (loading only when needed)
- **Progressive enhancement** - graceful degradation if processing fails

### Error Handling
```typescript
// Fallback strategy if client processing fails
uploadOriginal() // Better to upload unprocessed than fail completely
logProcessingError() // Monitor failure rates
```

### Performance Characteristics
- **Memory usage**: Processing images at full resolution requires ~100-300MB peak memory
- **Processing time**: 2-5 seconds for typical photos on modern devices
- **File size reduction**: 60-80% typical savings for TV versions
- **Quality impact**: Negligible visual difference on TV displays

## Alternatives Considered

### Server-Side Processing
**Rejected**: Vercel Edge Function limitations make this unreliable for large images

### Always Create TV Versions  
**Rejected**: Creates unnecessary storage overhead for images that are already TV-optimized

### WebP Format
**Rejected**: Broader JPEG compatibility preferred for TV displays and legacy devices

### Progressive JPEG
**Rejected**: Additional complexity without significant benefit for slideshow use case

## Consequences

### Positive
✅ **Reliable uploads** - no server-side processing bottlenecks  
✅ **Excellent TV performance** - optimized image sizes for display  
✅ **Modern format support** - seamless HEIC handling  
✅ **Storage efficiency** - smart decisions about when to create separate versions  
✅ **Quality preservation** - high-quality originals with context-aware optimization  

### Negative  
⚠️ **Client device dependency** - older devices may struggle with processing  
⚠️ **Battery usage** - image processing consumes device power  
⚠️ **Processing delay** - 2-5 second delay before upload begins  
⚠️ **JavaScript dependency** - no fallback for disabled JavaScript  

### Monitoring Requirements
- Track processing failure rates by device/browser
- Monitor upload success rates after processing 
- Measure actual file size savings achieved
- Track TV slideshow performance metrics

## Notes

This decision enables PhotoBooze to handle modern camera outputs while maintaining excellent performance on TV displays. The smart optimization prevents unnecessary processing while ensuring optimal user experience across all viewing contexts.

The client-side approach aligns with modern web architecture trends and provides better reliability than attempting complex image processing in serverless functions with strict resource limits.