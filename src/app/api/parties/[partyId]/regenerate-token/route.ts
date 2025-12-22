/**
 * POST /api/parties/[id]/regenerate-token - Generate a new join token for an existing party
 */

import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { generateJoinToken, hashJoinToken, verifyPin } from '@/lib/auth/tokens';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ partyId: string }> }
) {
  try {
    const supabase = createServerClient();
    const { partyId } = await params;
    
    // Check if the party requires a PIN
    const { data: party, error: fetchError } = await supabase
      .from('parties')
      .select('admin_pin_hash')
      .eq('id', partyId)
      .single();

    if (fetchError) {
      console.error('Failed to fetch party:', fetchError);
      return NextResponse.json(
        { error: 'Failed to fetch party' },
        { status: 500 }
      );
    }

    // If party has a PIN set, verify it
    if (party.admin_pin_hash) {
      let body;
      try {
        body = await request.json();
      } catch (e) {
        // No body provided
        body = {};
      }
      const { pin } = body;

      if (!pin) {
        return NextResponse.json(
          { error: 'PIN required', code: 'MISSING_PIN' },
          { status: 422 }
        );
      }

      if (!verifyPin(pin, party.admin_pin_hash)) {
        return NextResponse.json(
          { error: 'Invalid PIN', code: 'INVALID_PIN' },
          { status: 403 }
        );
      }
    }

    // Generate a new join token
    const joinToken = generateJoinToken();
    const joinTokenHash = hashJoinToken(joinToken);

    // Update the party with the new token hash
    const { error } = await supabase
      .from('parties')
      .update({ join_token_hash: joinTokenHash })
      .eq('id', partyId);

    if (error) {
      console.error('Failed to update party token:', error);
      return NextResponse.json(
        { error: 'Failed to regenerate token' },
        { status: 500 }
      );
    }

    return NextResponse.json({ joinToken });
  } catch (error) {
    console.error('Token regeneration error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
