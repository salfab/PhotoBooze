# ADR 002: Direct Supabase Uploads with Client-Side Storage Access

**Status:** Accepted  
**Date:** 2024-12-23  
**Decision Makers:** Development Team  
**Related:** ADR 001 (Type-Safe Admin PIN System)

## Context

Our initial architecture routed all photo uploads through a Next.js API endpoint (`/api/photos`) that:
- Received photos via FormData (multipart/form-data)
- Parsed files server-side using Next.js request handlers
- Uploaded to Supabase Storage from the API endpoint
- Created database records server-side

This approach had several limitations:
1. **Vercel Function Payload Limit:** Empirically determined ~4.3MB limit (not 4.5MB as documented), forcing aggressive client-side compression
2. **Aggressive Compression Required:** 3072px max, 0.85 JPEG quality, emergency fallbacks to 1920px@0.6
3. **Poor Image Quality on TV Display:** TV version at 1920x1080@0.8 showed heavy compression artifacts
4. **Complex Server Logic:** ~400 lines handling FormData parsing, buffer conversion, FormData overhead calculations, cleanup on errors
5. **Double Network Hop:** Client → Vercel → Supabase adds latency
6. **Limited Scalability:** Server CPU/memory used for image proxying

## Decision

We will migrate to **direct client-to-Supabase uploads** using signed URLs:

### Architecture Flow

```
Client (Browser)
    ↓
1. POST /api/photos/prepare-upload
   - Validates session & party status
   - Generates photo UUID
   - Creates signed upload URLs (5min expiry)
   - Returns: photoId, uploaderId, partyId, signed URLs, paths
    ↓
2. PUT to Supabase Storage (signed URL)
   - Upload original directly (no API proxy)
   - Upload TV version (if separate)
   - Progress tracking via XMLHttpRequest
    ↓
3. INSERT to photos table (Supabase client)
   - Client creates DB record directly
   - Secured by RLS policies
    ↓
✓ Upload complete
```

### Key Changes

**Image Processing Settings:**
- Max size: 3072px → **4096px** (4K quality)
- JPEG quality: 0.85 → **0.90** (better quality)
- File size limit: 4MB → **20MB** (Supabase 25MB with margin)
- **Removed:** Emergency compression fallbacks

**Upload Method:**
- **Old:** FormData → `/api/photos` → Supabase Storage → DB insert (server-side)
- **New:** Signed URLs → Direct Storage PUT → DB insert (client-side with RLS)

**Security Model:**
- **Old:** Session cookie → server validates → server uploads
- **New:** Session cookie → server generates signed URLs (5min expiry) → client uploads → RLS policy validates DB insert

**Progress Indication:**
- Added determinate progress indicator (0-100%) using XMLHttpRequest upload events
- Shows upload percentage to user during large file uploads

## Rationale

### Advantages

1. **Removes Vercel Payload Limit:** 4.3MB → 25MB (5.8x increase)
2. **Better Image Quality:** 4K resolution @ 0.90 quality vs 3K @ 0.85
3. **Simpler Architecture:** Removed ~400 lines of server-side FormData handling
4. **Faster Uploads:** Direct to storage (no API proxy hop)
5. **Lower Server Costs:** No CPU/memory for image proxying
6. **Better UX:** Real-time upload progress indicator
7. **Scalability:** Storage uploads don't consume Edge function execution time

### Trade-offs

1. **Less Server Control:** Cannot intercept/modify uploads server-side
2. **RLS Dependency:** Security relies on Supabase RLS policies being correct
3. **No Server-Side Validation:** File content validation happens client-side only
4. **Potential Orphaned Files:** If client crashes after upload but before DB insert
   - Mitigation: Accept this edge case, can add cleanup tool later
5. **More Complex Client Logic:** Client handles multi-step upload flow

### Why Acceptable Trade-offs

- **Security:** Signed URLs expire in 5 minutes, session validated before issuing
- **Data Integrity:** Party status validated before issuing upload URLs
- **Orphaned Files:** Rare edge case (network failure during DB insert), low priority
- **Client Complexity:** Worth it for 5.8x size increase and better quality

## Technical Details

### Signed Upload URLs

```typescript
// Server generates
const { data } = await supabase.storage
  .from('photobooze-images')
  .createSignedUploadUrl(path, { upsert: false });

// Returns: { signedUrl, token, path }
// Valid for: 5 minutes
```

### RLS Policy

```sql
CREATE POLICY "Allow photo inserts from clients"
ON photos
FOR INSERT
TO anon, authenticated
WITH CHECK (true);
```

**Why `WITH CHECK (true)`?**
- We don't use Supabase Auth (no `auth.uid()` available)
- Security enforced by:
  1. Signed URLs (5min expiry, validated party status)
  2. Server validates session before issuing URLs
  3. Client must have valid session cookie

### Progress Tracking

```typescript
const xhr = new XMLHttpRequest();
xhr.upload.onprogress = (e) => {
  if (e.lengthComputable) {
    const percent = Math.round((e.loaded / e.total) * 100);
    setUploadProgress(percent);
  }
};
xhr.open('PUT', signedUrl);
xhr.send(blob);
```

## Consequences

### Positive

1. **Users can upload higher quality photos** (4K instead of 3K)
2. **TV display shows better quality** (less compression artifacts)
3. **Faster development** (less server-side code to maintain)
4. **Better error messages** (client sees storage errors directly)
5. **Upload progress visibility** (percentage-based progress bar)

### Negative

1. **Cannot implement server-side image analysis** (e.g., NSFW detection)
   - Acceptable: Party photo app with trusted users
2. **Orphaned files possible** (upload succeeds, DB insert fails)
   - Acceptable: Can add cleanup tool later if needed
3. **Client-side complexity increased** (multi-step upload flow)
   - Acceptable: Well-structured async/await code with error handling

### Neutral

1. **Different error handling patterns** (client catches storage errors vs server errors)
2. **Database inserts visible in client code** (RLS policies must be correct)

## Alternatives Considered

### Alternative 1: Increase Vercel Function Payload Limit
- **Rejected:** No way to increase beyond ~4.5MB on serverless functions
- Would still have 4K+ photos hitting limit

### Alternative 2: Hybrid Approach (Server Confirmation Endpoint)
- **Considered:** Client uploads → server verifies → server inserts DB record
- **Rejected:** Adds complexity without security benefit (signed URLs already secure)
- Client can insert DB record directly with RLS policies

### Alternative 3: Background Job for Cleanup
- **Deferred:** Add orphaned file cleanup later if needed
- Current approach: Accept edge case of orphaned files
- Can implement admin cleanup button if becomes issue

## Implementation Notes

### Files Changed

1. **Created:** `src/app/api/photos/prepare-upload/route.ts` (~100 lines)
2. **Created:** `supabase/migrations/20241223000001_photos_insert_policy.sql`
3. **Updated:** `src/lib/image/process.ts` (quality settings, removed emergency compression)
4. **Updated:** `src/components/CameraTab.tsx` (direct upload with progress)
5. **Deleted:** `src/app/api/photos/route.ts` (~400 lines removed)

### Migration Strategy

- **Hard cutover:** No backward compatibility needed
- **Data:** No database migration required (table structure unchanged)
- **Deployment:** Deploy all changes atomically

## Monitoring

### Success Metrics

- [ ] Upload success rate >95%
- [ ] Average upload time <10s for 10MB photo
- [ ] Zero 413 errors (payload too large)
- [ ] User feedback on image quality improvement

### Failure Indicators

- [ ] Increased 500 errors from storage
- [ ] RLS policy violations
- [ ] Orphaned files accumulating (>100 files/month)

## References

- [Supabase Storage Signed URLs](https://supabase.com/docs/guides/storage/uploads/signed-urls)
- [Supabase RLS Policies](https://supabase.com/docs/guides/auth/row-level-security)
- Empirical upload limit testing (see Git history for test results)
- ADR 001: Type-Safe Admin PIN System

## Notes

This decision significantly improves user experience while simplifying the codebase. The trade-off of less server control is acceptable for a party photo app where upload speed and image quality matter more than server-side validation.

The removal of emergency compression fallbacks means users will see clear errors if their photos are too large (>20MB), rather than silently receiving heavily degraded images. This is a better user experience as users can retry with a different photo.
