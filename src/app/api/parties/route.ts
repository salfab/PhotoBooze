/**
 * POST /api/parties - Create a new party
 * Returns the party ID and join token (for QR code generation)
 */

import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { generateJoinToken, hashJoinToken } from '@/lib/auth/tokens';

export async function POST() {
  try {
    const supabase = createServerClient();
    
    // Generate a join token for guests
    const joinToken = generateJoinToken();
    const joinTokenHash = hashJoinToken(joinToken);

    // Create the party
    const { data: party, error } = await supabase
      .from('parties')
      .insert({
        status: 'active',
        join_token_hash: joinTokenHash,
      })
      .select('id, status, created_at')
      .single();

    if (error) {
      console.error('Failed to create party:', error);
      return NextResponse.json(
        { error: 'Failed to create party' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      id: party.id,
      status: party.status,
      createdAt: party.created_at,
      joinToken, // Only returned once - client should save/display this
    });
  } catch (error) {
    console.error('Party creation error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
