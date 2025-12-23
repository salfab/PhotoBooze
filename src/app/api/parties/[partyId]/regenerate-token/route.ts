/**
 * POST /api/parties/[id]/regenerate-token - Get the existing join token for a party
 * (Renamed from regenerate-token but keeping URL for compatibility)
 */

import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { verifyPin } from '@/lib/auth/tokens';
import type { PartyWithOptionalPin } from '@/types/database';
import { getAdminPinHash, requiresPin } from '@/types/database';

function logGetTokenContext(level: 'info' | 'warn' | 'error', message: string, context: Record<string, unknown> = {}) {
  const timestamp = new Date().toISOString();
  const logData = {
    timestamp,
    level: level.toUpperCase(),
    service: 'api.parties.get-token',
    message,
    ...context
  };
  console.log(JSON.stringify(logData));
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ partyId: string }> }
) {
  const requestId = Math.random().toString(36).substring(2, 10);
  const startTime = Date.now();
  
  try {
    const supabase = createServerClient();
    const { partyId } = await params;
    
    logGetTokenContext('info', 'Get join token request received', {
      requestId,
      partyId
    });
    
    // Get the party - handle environments with or without admin PIN support
    const partyFetchStart = Date.now();
    let party: PartyWithOptionalPin | null = null;
    let fetchError: any = null;

    // Try to get party with admin PIN field
    const { data: fullParty, error: fullError } = await supabase
      .from('parties')
      .select('id, admin_pin_hash')
      .eq('id', partyId)
      .single();

    if (fullError && (fullError.message?.includes('admin_pin_hash') || fullError.code === '42703')) {
      logGetTokenContext('warn', 'Admin PIN column not found - PIN protection disabled', {
        requestId,
        partyId
      });
      
      // Fallback to basic party query
      const { data: basicParty, error: basicError } = await supabase
        .from('parties')
        .select('id')
        .eq('id', partyId)
        .single();
      
      party = basicParty as PartyWithOptionalPin | null;
      fetchError = basicError;
    } else {
      party = fullParty as PartyWithOptionalPin | null;
      fetchError = fullError;
    }

    if (fetchError || !party) {
      logGetTokenContext('error', 'Failed to fetch party for token retrieval', {
        requestId,
        partyId,
        fetchTime: Date.now() - partyFetchStart,
        error: fetchError?.message,
        errorCode: fetchError?.code
      });
      return NextResponse.json(
        { error: 'Failed to fetch party' },
        { status: 500 }
      );
    }

    // Get the join token for this party
    const { data: tokenData, error: tokenError } = await supabase
      .from('party_join_tokens' as any)
      .select('token')
      .eq('party_id', partyId)
      .single() as { data: { token: string } | null; error: any };

    if (tokenError || !tokenData?.token) {
      logGetTokenContext('error', 'Party has no join token configured', {
        requestId,
        partyId,
        fetchTime: Date.now() - partyFetchStart,
        tokenError: tokenError?.message
      });
      return NextResponse.json(
        { error: 'Party has no join token configured' },
        { status: 404 }
      );
    }

    const joinToken = tokenData.token;

    logGetTokenContext('info', 'Party fetched, checking PIN requirements', {
      requestId,
      partyId,
      requiresPin: requiresPin(party),
      fetchTime: Date.now() - partyFetchStart
    });

    // Check if party requires PIN authentication
    const adminPinHash = getAdminPinHash(party);
    if (adminPinHash) {
      let body;
      try {
        body = await request.json();
      } catch (e) {
        // No body provided
        body = {};
      }
      const { pin } = body;

      if (!pin) {
        logGetTokenContext('warn', 'PIN required but not provided for token retrieval', {
          requestId,
          partyId
        });
        return NextResponse.json(
          { error: 'PIN required', code: 'MISSING_PIN' },
          { status: 422 }
        );
      }

      const verifyStart = Date.now();
      if (!verifyPin(pin, adminPinHash)) {
        logGetTokenContext('warn', 'Invalid PIN provided for token retrieval', {
          requestId,
          partyId,
          verifyTime: Date.now() - verifyStart
        });
        return NextResponse.json(
          { error: 'Invalid PIN', code: 'INVALID_PIN' },
          { status: 403 }
        );
      }
      
      logGetTokenContext('info', 'PIN verified successfully', {
        requestId,
        partyId,
        verifyTime: Date.now() - verifyStart
      });
    }

    // Return the existing join token
    const totalTime = Date.now() - startTime;
    logGetTokenContext('info', 'Join token retrieved successfully', {
      requestId,
      partyId,
      requiresPin: requiresPin(party),
      fetchTime: Date.now() - partyFetchStart,
      totalTime
    });

    return NextResponse.json({ joinToken });

  } catch (error) {
    const totalTime = Date.now() - startTime;
    logGetTokenContext('error', 'Unexpected error in token retrieval', {
      requestId,
      partyId: (await params).partyId,
      totalTime,
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    });
    
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
