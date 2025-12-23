/**
 * POST /api/photos/prepare-upload
 * Generate signed upload URLs for direct client-to-Supabase uploads
 * Returns metadata needed for client to upload and create DB record
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, STORAGE_BUCKET, getOriginalPath, getTvPath } from '@/lib/supabase/server';
import { verifySession } from '@/lib/auth/session';
import { v4 as uuidv4 } from 'uuid';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface PrepareUploadRequest {
  originalExt: string;
  createTvVersion: boolean; // Whether client will create separate TV file
}

export async function POST(request: NextRequest) {
  try {
    // Step 1: Authenticate
    const sessionToken = request.cookies.get('photobooze_session')?.value;
    if (!sessionToken) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const session = await verifySession(sessionToken);
    if (!session) {
      return NextResponse.json({ error: 'Invalid session' }, { status: 401 });
    }

    const { partyId, uploaderId } = session;

    // Step 2: Parse request
    const body = await request.json() as PrepareUploadRequest;
    const { originalExt, createTvVersion } = body;

    if (!originalExt) {
      return NextResponse.json({ error: 'Missing originalExt' }, { status: 400 });
    }

    // Step 3: Validate party is active
    const supabase = createServerClient();
    const { data: party, error: partyError } = await supabase
      .from('parties')
      .select('status')
      .eq('id', partyId)
      .single();

    if (partyError || !party || party.status !== 'active') {
      return NextResponse.json({ error: 'Party is not accepting photos' }, { status: 403 });
    }

    // Step 4: Generate photo ID and paths
    const photoId = uuidv4();
    const originalPath = getOriginalPath(partyId, photoId, originalExt);
    const tvPath = createTvVersion ? getTvPath(partyId, photoId) : null;

    // Step 5: Create signed upload URLs (5 minute expiry)
    const expiresIn = 300; // 5 minutes

    const { data: originalSignedData, error: originalSignedError } = await supabase.storage
      .from(STORAGE_BUCKET)
      .createSignedUploadUrl(originalPath, { upsert: false });

    if (originalSignedError || !originalSignedData) {
      console.error('Failed to create signed URL for original:', originalSignedError);
      return NextResponse.json({ error: 'Failed to create upload URL' }, { status: 500 });
    }

    let tvSignedData = null;
    if (tvPath) {
      const { data, error: tvSignedError } = await supabase.storage
        .from(STORAGE_BUCKET)
        .createSignedUploadUrl(tvPath, { upsert: false });

      if (tvSignedError || !data) {
        console.error('Failed to create signed URL for TV:', tvSignedError);
        return NextResponse.json({ error: 'Failed to create TV upload URL' }, { status: 500 });
      }

      tvSignedData = data;
    }

    // Step 6: Return upload metadata
    return NextResponse.json({
      photoId,
      uploaderId,
      partyId,
      originalPath,
      originalSignedUrl: originalSignedData.signedUrl,
      originalToken: originalSignedData.token,
      tvPath: tvPath || null,
      tvSignedUrl: tvSignedData?.signedUrl || null,
      tvToken: tvSignedData?.token || null,
      expiresIn, // Seconds until URLs expire
    });

  } catch (error) {
    console.error('Prepare upload error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
