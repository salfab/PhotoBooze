/**
 * POST /api/photos - Upload a photo
 * Receives pre-processed original and TV versions from client
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, STORAGE_BUCKET, getOriginalPath, getTvPath } from '@/lib/supabase/server';
import { verifySession } from '@/lib/auth/session';
import { v4 as uuidv4 } from 'uuid';

const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25MB

// Configure route for larger payloads
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60; // 60 seconds max execution

export async function POST(request: NextRequest) {
  try {
    // Verify session from cookie
    const sessionToken = request.cookies.get('photobooze_session')?.value;
    if (!sessionToken) {
      return NextResponse.json(
        { error: 'Not authenticated' },
        { status: 401 }
      );
    }

    const session = await verifySession(sessionToken);
    if (!session) {
      return NextResponse.json(
        { error: 'Invalid session' },
        { status: 401 }
      );
    }

    const { partyId, uploaderId } = session;

    // Parse form data
    const formData = await request.formData();
    const originalFile = formData.get('original') as File | null;
    const tvFile = formData.get('tv') as File | null;
    const originalMime = formData.get('originalMime') as string | null;
    const originalExt = formData.get('originalExt') as string | null;
    const comment = formData.get('comment') as string | null;

    if (!originalFile || !tvFile) {
      return NextResponse.json(
        { error: 'Missing original or TV file' },
        { status: 400 }
      );
    }

    // Validate file sizes
    if (originalFile.size > MAX_FILE_SIZE || tvFile.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: 'File too large (max 25MB)' },
        { status: 400 }
      );
    }

    const supabase = createServerClient();

    // Verify party is still active
    const { data: party, error: partyError } = await supabase
      .from('parties')
      .select('status')
      .eq('id', partyId)
      .single();

    if (partyError || !party || party.status !== 'active') {
      return NextResponse.json(
        { error: 'Party is not accepting photos' },
        { status: 403 }
      );
    }

    // Generate photo ID and paths
    const photoId = uuidv4();
    const ext = originalExt || 'jpg';
    const originalPath = getOriginalPath(partyId, photoId, ext);
    const tvPath = getTvPath(partyId, photoId);

    // Convert Files to ArrayBuffer for upload
    const originalBuffer = await originalFile.arrayBuffer();
    const tvBuffer = await tvFile.arrayBuffer();

    // Upload original
    const { error: originalError } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(originalPath, originalBuffer, {
        contentType: originalMime || 'image/jpeg',
        upsert: false,
      });

    if (originalError) {
      console.error('Failed to upload original:', originalError);
      return NextResponse.json(
        { error: 'Failed to upload original photo' },
        { status: 500 }
      );
    }

    // Upload TV version
    const { error: tvError } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(tvPath, tvBuffer, {
        contentType: 'image/jpeg',
        upsert: false,
      });

    if (tvError) {
      // Cleanup original if TV upload fails
      await supabase.storage.from(STORAGE_BUCKET).remove([originalPath]);
      console.error('Failed to upload TV version:', tvError);
      return NextResponse.json(
        { error: 'Failed to upload TV photo' },
        { status: 500 }
      );
    }

    // Create photo record in database
    const { data: photo, error: dbError } = await supabase
      .from('photos')
      .insert({
        id: photoId,
        party_id: partyId,
        uploader_id: uploaderId,
        original_path: originalPath,
        tv_path: tvPath,
        original_mime: originalMime,
        tv_mime: 'image/jpeg',
        original_bytes: originalFile.size,
        tv_bytes: tvFile.size,
        comment: comment || null,
      })
      .select('id, created_at')
      .single();

    if (dbError || !photo) {
      // Cleanup storage if database insert fails
      await supabase.storage.from(STORAGE_BUCKET).remove([originalPath, tvPath]);
      console.error('Failed to create photo record:', dbError);
      return NextResponse.json(
        { error: 'Failed to save photo' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      id: photo.id,
      createdAt: photo.created_at,
    });
  } catch (error) {
    console.error('Photo upload error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
