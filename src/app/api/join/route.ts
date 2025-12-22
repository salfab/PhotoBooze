/**
 * POST /api/join - Join a party as a guest
 * Validates the join token, creates an uploader record, and sets session cookie
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { verifyJoinToken, setSessionCookie } from '@/lib/auth';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { partyId, token, displayName } = body;

    if (!partyId || !token) {
      return NextResponse.json(
        { error: 'Missing partyId or token' },
        { status: 400 }
      );
    }

    const supabase = createServerClient();

    // Get the party and verify the token
    const { data: party, error: partyError } = await supabase
      .from('parties')
      .select('id, status, join_token_hash')
      .eq('id', partyId)
      .single();

    if (partyError || !party) {
      return NextResponse.json(
        { error: 'Party not found' },
        { status: 404 }
      );
    }

    if (party.status !== 'active') {
      return NextResponse.json(
        { error: 'Party is no longer accepting guests' },
        { status: 403 }
      );
    }

    // Verify the join token
    if (!party.join_token_hash) {
      console.error('Party has no join_token_hash:', partyId);
      return NextResponse.json(
        { error: 'Party is not configured for joining' },
        { status: 403 }
      );
    }
    
    if (!verifyJoinToken(token, party.join_token_hash)) {
      console.error('Token verification failed for party:', partyId, 'token length:', token?.length);
      return NextResponse.json(
        { error: 'Invalid join token. The QR code may have expired. Please ask for a new one.' },
        { status: 403 }
      );
    }

    // Create the uploader record
    const { data: uploader, error: uploaderError } = await supabase
      .from('uploaders')
      .insert({
        party_id: partyId,
        display_name: displayName || null,
      })
      .select('id, display_name')
      .single();

    if (uploaderError || !uploader) {
      console.error('Failed to create uploader:', uploaderError);
      return NextResponse.json(
        { error: 'Failed to join party' },
        { status: 500 }
      );
    }

    // Set the session cookie
    await setSessionCookie(partyId, uploader.id);

    return NextResponse.json({
      success: true,
      uploaderId: uploader.id,
      displayName: uploader.display_name,
    });
  } catch (error) {
    console.error('Join party error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
