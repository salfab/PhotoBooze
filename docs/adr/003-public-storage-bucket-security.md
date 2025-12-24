# ADR-003: Public Storage Bucket Security Model

**Status**: Pending Decision  
**Date**: 2024-12-24  
**Deciders**: Development Team  

## Context

PhotoBooze stores uploaded party photos in Supabase Storage. We need to decide whether the storage bucket should be **public** (accessible via direct URLs without authentication) or **private** (requiring signed URLs with authentication).

### Current Implementation
- Storage bucket: `photobooze-images`
- Bucket is configured as **public**
- Image URLs follow pattern: `http://.../storage/v1/object/public/photobooze-images/parties/{partyId}/original/{photoId}.jpg`
- Security relies on UUID obscurity (party IDs and photo IDs are UUIDs)

### Security Characteristics

#### Public Bucket (`public = true`)
**Pros:**
- Simple implementation - no server-side URL generation needed
- Faster access - no authentication checks
- URLs can be cached by CDNs
- Direct browser access for TV displays and mobile devices
- No risk of expired URLs breaking existing displays

**Cons:**
- Anyone with a URL can access the image indefinitely
- No way to revoke access to specific photos
- URLs are visible in browser DevTools, page source, network logs
- If a URL is shared outside the party, it remains accessible
- No audit trail of who accessed which photos
- Cannot implement time-limited access

#### Private Bucket (`public = false`)
**Pros:**
- Signed URLs with expiration (e.g., 1-hour validity)
- Can revoke access by closing party or deleting photos
- Audit trail possible (who generated signed URLs)
- More control over data access
- Compliance with privacy regulations (GDPR, etc.)

**Cons:**
- More complex implementation - server must generate signed URLs
- URLs expire and need refresh (TV displays must refresh)
- Additional server requests to generate URLs
- Potential for "URL expired" errors if displays run too long
- More API surface area (URL generation endpoint)

### Threat Model Analysis

**Current Public Bucket Threats:**
1. **URL Leakage**: User shares photo URL on social media → anyone can access
2. **Browser History**: URLs stored in browser history → discoverable later
3. **Network Monitoring**: URLs visible in network traffic (HTTPS mitigates)
4. **Shoulder Surfing**: Someone notes down URL from screen
5. **Post-Party Access**: Cannot revoke access after party ends

**Mitigations in Place:**
- UUIDs provide 128-bit entropy (~10^38 combinations)
- No API to list/browse photos without knowing IDs
- HTTPS encrypts URLs in transit (in production)
- No public directory listing

**Risk Assessment:**
- Probability of random URL guessing: **Negligible** (~10^-38)
- Probability of intentional URL sharing: **Low to Medium** (depends on user behavior)
- Impact of unauthorized access: **Low to Medium** (party photos, usually not sensitive)

### Use Case Considerations

**Party Photo Sharing Context:**
- Photos are meant to be shared within the party
- Guests expect photos to be visible to other attendees
- Typical content: fun party moments, group photos, celebrations
- User expectation: Photos remain accessible for memories/sharing

**Potential Sensitive Scenarios:**
- Private events (weddings, corporate events)
- Photos containing minors
- Content users might want removed later
- Compliance requirements (business events)

## Options

### Option 1: Keep Public Bucket (Status Quo)
Continue with public bucket, relying on UUID obscurity for security.

**Implementation:**
- No changes required
- Document the security model for users
- Add privacy notice about URL permanence

**Trade-offs:**
- ✅ Simple, working solution
- ✅ No performance impact
- ✅ No expired URL issues
- ❌ No revocation capability
- ❌ URLs permanent once known

### Option 2: Switch to Private Bucket with Signed URLs
Implement private bucket with time-limited signed URLs.

**Implementation Required:**
1. Update `config.toml`: `public = false`
2. Create API endpoint: `GET /api/photos/{photoId}/signed-url`
3. Update TV page to refresh URLs before expiry
4. Update mobile upload page to use signed URLs
5. Implement signed URL generation in server components

**Trade-offs:**
- ✅ Revocable access
- ✅ Time-limited URLs
- ✅ Better compliance posture
- ❌ More complex implementation
- ❌ Ongoing maintenance (URL refresh logic)
- ❌ Risk of expired URLs breaking displays

### Option 3: Hybrid Approach - Policy-Based Access
Keep public bucket but add Row-Level Security (RLS) policies on the `photos` table to control which users can access photo metadata. Images remain public if URL is known.

**Implementation:**
- Photos table has RLS policies
- Users can only query photos from parties they've joined
- Storage bucket remains public
- Metadata protected, files accessible if URL known

**Trade-offs:**
- ✅ Protects photo discovery
- ✅ Simpler than full private bucket
- ❌ Still no URL revocation
- ❌ Mixed security model (metadata protected, files open)

## Decision

**Status**: Pending Decision

We need to decide based on:
1. **Target audience**: Are users uploading sensitive content or casual party photos?
2. **Privacy requirements**: Do we need GDPR compliance, right-to-be-forgotten?
3. **User expectations**: Do users expect photos to be "deletable" later?
4. **Development resources**: Can we invest in signed URL infrastructure?

## Consequences

### If We Choose Option 1 (Public Bucket):
- **Positive**: Simple, reliable, fast implementation
- **Positive**: No maintenance overhead for URL management
- **Negative**: Must document security model clearly
- **Negative**: Cannot offer "delete photo" feature effectively
- **Risk**: Potential privacy concerns if users don't understand URL permanence

### If We Choose Option 2 (Private Bucket):
- **Positive**: Professional security model
- **Positive**: Can offer full photo deletion
- **Positive**: Better for business/enterprise use cases
- **Negative**: Significant implementation effort
- **Negative**: Ongoing complexity (URL refresh, expiry handling)
- **Risk**: URL expiry bugs could break live displays

### If We Choose Option 3 (Hybrid):
- **Positive**: Balances security and simplicity
- **Positive**: Protects against photo discovery
- **Negative**: Doesn't solve URL permanence issue
- **Negative**: May confuse users (some protection, not complete)

## Notes

- Current implementation works correctly with public bucket
- All tests pass with public bucket configuration
- Production deployments should use HTTPS to protect URLs in transit
- Consider adding a privacy policy explaining the security model
- Could implement Option 1 now and migrate to Option 2 later if needed

## References

- [Supabase Storage: Public vs Private Buckets](https://supabase.com/docs/guides/storage/security/access-control)
- [ADR-002: Direct Supabase Uploads](002-direct-supabase-uploads.md)
- Migration: `20241221000002_create_storage_bucket.sql`
- Config: `supabase/config.toml` - `[storage.buckets.photobooze-images]`
