/**
 * GET /api/parties - List all parties with stats
 * POST /api/parties - Create a new party
 */

import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { generateJoinToken, hashJoinToken } from '@/lib/auth/tokens';
import { generateUniquePartyName } from '@/lib/party-names';

export async function GET() {
  try {
    const supabase = createServerClient();
    
    // Get all parties
    const { data: parties, error } = await supabase
      .from('parties')
      .select('id, name, status, created_at, admin_pin_hash')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Failed to fetch parties:', error);
      return NextResponse.json(
        { error: 'Failed to fetch parties' },
        { status: 500 }
      );
    }

    // Get counts for each party
    const partiesWithCounts = await Promise.all(
      (parties ?? []).map(async (party) => {
        const { count: photoCount } = await supabase
          .from('photos')
          .select('*', { count: 'exact', head: true })
          .eq('party_id', party.id);

        const { count: uploaderCount } = await supabase
          .from('uploaders')
          .select('*', { count: 'exact', head: true })
          .eq('party_id', party.id);

        return {
          id: party.id,
          name: party.name,
          status: party.status,
          createdAt: party.created_at,
          photoCount: photoCount ?? 0,
          uploaderCount: uploaderCount ?? 0,
          requiresPin: !!party.admin_pin_hash,
        };
      })
    );

    return NextResponse.json(partiesWithCounts);
  } catch (error) {
    console.error('Party list error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST() {
  try {
    const supabase = createServerClient();
    
    // Generate a join token for guests
    const joinToken = generateJoinToken();
    const joinTokenHash = hashJoinToken(joinToken);

    // Generate a unique party name
    const partyName = await generateUniquePartyName(async (name) => {
      const { data } = await supabase
        .from('parties')
        .select('id')
        .eq('name', name)
        .single();
      return data !== null;
    });

    // Create the party
    const { data: party, error } = await supabase
      .from('parties')
      .insert({
        name: partyName,
        status: 'active',
        join_token_hash: joinTokenHash,
      })
      .select('id, name, status, created_at')
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
      name: party.name,
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
