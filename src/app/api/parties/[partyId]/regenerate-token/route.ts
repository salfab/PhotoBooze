/**
 * POST /api/parties/[id]/regenerate-token - Generate a new join token for an existing party
 */

import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { generateJoinToken, hashJoinToken } from '@/lib/auth/tokens';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ partyId: string }> }
) {
  try {
    const supabase = createServerClient();
    const { partyId } = await params;

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
