# Cloudinary Migration Plan

## Overview
Migrate from Supabase Storage to Cloudinary for image storage to gain 25x more storage capacity (25GB vs 1GB free tier).

## Current Architecture
- **Storage**: Supabase Storage (1GB free tier)
- **Upload flow**: Client → prepare-upload API → Direct upload to Supabase with signed URLs
- **Image processing**: Client-side compression/resizing (10MB limit, 4K max)
- **TV version**: Separate file stored at 1920x1080
- **Database**: Store paths (`parties/{party_id}/original/{photo_id}.jpg`)

## Cloudinary Benefits
- **25GB storage** (vs 1GB Supabase free tier)
- **25GB bandwidth/month**
- **Built-in transformations**: Resize/crop via URL parameters
- **CDN included**: Global fast delivery
- **Admin console**: Better bulk operations
- **Auto-optimization**: Format selection (WebP, AVIF), quality tuning

## Potential Simplifications with Cloudinary
1. **Remove client-side processing**: Upload original directly, let Cloudinary handle optimization
2. **On-demand TV versions**: Generate via URL instead of storing separate file
   - Original: `{cloudinary_url}/{public_id}.jpg`
   - TV: `{cloudinary_url}/w_1920,h_1080,q_80/{public_id}.jpg`
3. **Save storage**: Only store one version, generate sizes on-demand
4. **Bandwidth efficiency**: Cloudinary auto-selects best format (WebP for Chrome, etc.)

## Migration Steps

### Phase 1: Setup & Configuration
1. Create Cloudinary account (free tier)
2. Create separate dev/test account for local development
3. Install dependencies:
   ```bash
   pnpm add cloudinary @cloudinary/url-gen @cloudinary/react
   ```
4. Add environment variables:
   ```
   CLOUDINARY_CLOUD_NAME=
   CLOUDINARY_API_KEY=
   CLOUDINARY_API_SECRET=
   NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME=
   ```

### Phase 2: Database Schema Changes
1. Add new columns to `photos` table:
   ```sql
   ALTER TABLE photos ADD COLUMN cloudinary_public_id TEXT;
   ALTER TABLE photos ADD COLUMN cloudinary_version TEXT;
   ALTER TABLE photos ADD COLUMN cloudinary_format TEXT;
   ```
2. Keep existing `original_path` and `tv_path` for backward compatibility during migration

### Phase 3: Code Changes

#### 3.1 Create Cloudinary Upload API
**File**: `src/app/api/photos/upload-cloudinary/route.ts`
- Generate Cloudinary signed upload parameters
- Return signature, timestamp, and upload URL
- Client uploads directly to Cloudinary

#### 3.2 Update Client Upload Flow
**File**: `src/components/CameraTab.tsx`
- Replace `prepare-upload` call with `upload-cloudinary`
- Upload to Cloudinary instead of Supabase Storage
- Store `public_id` instead of paths in database

#### 3.3 Remove Client-Side Processing (Optional)
**File**: `src/lib/image/process.ts`
- Remove compression/resize logic (Cloudinary handles it)
- Keep only HEIC conversion if needed
- Or use Cloudinary's upload preset for auto-optimization

#### 3.4 Update TV Display
**File**: `src/app/tv/[partyId]/page.tsx`
- Generate Cloudinary URLs with transformations
- Use `w_1920,h_1080,q_auto` transformation
- Leverage Cloudinary's responsive images

#### 3.5 Update Download API
**File**: `src/app/api/parties/[partyId]/download/route.ts`
- Fetch originals from Cloudinary
- Use Cloudinary Admin API to list resources
- Generate download URLs

### Phase 4: Migration of Existing Images
1. Create migration script:
   ```javascript
   // scripts/migrate-to-cloudinary.mjs
   - Fetch all photos from database
   - Download from Supabase Storage
   - Upload to Cloudinary with matching public_id structure
   - Update database with cloudinary_public_id
   - Verify upload success before deleting from Supabase
   ```
2. Run migration in batches to avoid quota issues
3. Keep Supabase Storage active until migration complete

### Phase 5: Testing
1. Test upload flow with various image formats
2. Test TV display with Cloudinary transformations
3. Test download functionality
4. Test realtime photo updates
5. Load test bandwidth limits (25GB/month)
6. Verify HEIC handling

### Phase 6: Cleanup
1. Remove Supabase Storage policies
2. Remove old `original_path`/`tv_path` columns
3. Remove `src/lib/image/process.ts` (if using Cloudinary transformations)
4. Update documentation

## Trade-offs

### Pros
- ✅ 25x more storage (25GB vs 1GB)
- ✅ Better image optimization (auto WebP/AVIF)
- ✅ On-demand transformations (save storage)
- ✅ Global CDN included
- ✅ Better admin console

### Cons
- ❌ **No local development**: Always hits cloud API
- ❌ **Bandwidth limits**: 25GB/month (could be tight for popular parties)
- ❌ **Migration effort**: ~2-3 days of work
- ❌ **Testing complexity**: Need internet connection
- ❌ **Vendor lock-in**: Cloudinary-specific transformations

## Cost Analysis

### Supabase Storage Costs
- Free: 1GB storage
- Pro ($25/mo): 100GB storage, 200GB bandwidth
- Additional: $0.021/GB storage, $0.09/GB bandwidth

### Cloudinary Costs
- Free: 25GB storage, 25GB bandwidth, 25k transformations
- Plus ($99/mo): 160GB storage, 160GB bandwidth, 150k transformations
- Additional: Varies by usage

### Break-even Analysis
For PhotoBooze with ~100-200 photos per party:
- **Stay with Supabase**: If parties are infrequent (<5/year)
- **Switch to Cloudinary**: If planning many parties (>10/year) or high traffic

## Recommendation
**Wait until storage becomes an actual constraint**. Current setup with Supabase:
- Works well with local Docker development
- 1GB = ~100-200 high-quality photos with smart compression
- Simple architecture
- Easy to backup/migrate later

Only migrate if:
1. Approaching 1GB limit with real usage
2. Need better CDN performance globally
3. Want on-demand image transformations
4. Willing to sacrifice local development experience

## Alternative: Supabase Pro
Instead of Cloudinary, consider upgrading Supabase to Pro ($25/mo):
- ✅ Keep local development
- ✅ 100GB storage (4x cheaper than Cloudinary Plus)
- ✅ No code changes
- ✅ Keep existing architecture
- ❌ No built-in transformations
- ❌ No global CDN (but can add Cloudflare)

**Best approach**: Monitor storage usage, revisit when needed.
