/**
 * POST /api/parties/[id]/regenerate-token - Generate a new join token for an existing party
 */

import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { generateJoinToken, hashJoinToken, verifyPin } from '@/lib/auth/tokens';

function logRegenerateTokenContext(level: 'info' | 'warn' | 'error', message: string, context: Record<string, unknown> = {}) {
  const timestamp = new Date().toISOString();
  const logData = {
    timestamp,
    level: level.toUpperCase(),
    service: 'api.parties.regenerate-token',
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
    
    logRegenerateTokenContext('info', 'Token regeneration request received', {
      requestId,
      partyId
    });
    
    // Check if the party requires a PIN
    const partyFetchStart = Date.now();
    const { data: party, error: fetchError } = await supabase
      .from('parties')
      .select('admin_pin_hash')
      .eq('id', partyId)
      .single();

    if (fetchError) {
      logRegenerateTokenContext('error', 'Failed to fetch party for token regeneration', {
        requestId,
        partyId,
        fetchTime: Date.now() - partyFetchStart,
        error: fetchError.message,
        errorCode: fetchError.code
      });
      return NextResponse.json(
        { error: 'Failed to fetch party' },
        { status: 500 }
      );
    }

    logRegenerateTokenContext('info', 'Party fetched, checking PIN requirements', {
      requestId,
      partyId,
      requiresPin: !!party.admin_pin_hash,
      fetchTime: Date.now() - partyFetchStart
    });

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
        logRegenerateTokenContext('warn', 'PIN required but not provided for token regeneration', {
          requestId,
          partyId
        });
        return NextResponse.json(
          { error: 'PIN required', code: 'MISSING_PIN' },
          { status: 422 }
        );
      }

      const verifyStart = Date.now();
      if (!verifyPin(pin, party.admin_pin_hash)) {
        logRegenerateTokenContext('warn', 'Invalid PIN provided for token regeneration', {
          requestId,
          partyId,
          verifyTime: Date.now() - verifyStart
        });
        return NextResponse.json(
          { error: 'Invalid PIN', code: 'INVALID_PIN' },
          { status: 403 }
        );
      }
      
      logRegenerateTokenContext('info', 'PIN verified successfully', {
        requestId,
        partyId,
        verifyTime: Date.now() - verifyStart
      });
    }

    // Generate a new join token
    const tokenGenerationStart = Date.now();
    const joinToken = generateJoinToken();
    const joinTokenHash = hashJoinToken(joinToken);
    const tokenGenerationTime = Date.now() - tokenGenerationStart;

    logRegenerateTokenContext('info', 'New token generated, updating party', {
      requestId,
      partyId,
      tokenGenerationTime
    });

    // Update the party with the new token hash
    const updateStart = Date.now();
    const { error } = await supabase
      .from('parties')
      .update({ join_token_hash: joinTokenHash })
      .eq('id', partyId);

    if (error) {
      logRegenerateTokenContext('error', 'Failed to update party with new token', {
        requestId,
        partyId,
        updateTime: Date.now() - updateStart,
        error: error.message,
        errorCode: error.code
      });
      return NextResponse.json(
        { error: 'Failed to regenerate token' },
        { status: 500 }
      );
    }

    const totalTime = Date.now() - startTime;
    logRegenerateTokenContext('info', 'Token regeneration completed successfully', {
      requestId,
      partyId,
      requiresPin: !!party.admin_pin_hash,
      tokenGenerationTime,
      updateTime: Date.now() - updateStart,
      totalTime
    });

    return NextResponse.json({ joinToken });
  } catch (error) {
    const totalTime = Date.now() - startTime;
    logRegenerateTokenContext('error', 'Unexpected error in token regeneration', {
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
