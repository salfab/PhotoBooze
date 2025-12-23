/**
 * GET /api/parties - List all parties with stats
 * POST /api/parties - Create a new party
 * Enhanced with comprehensive logging and error handling
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { generateJoinToken, hashJoinToken } from '@/lib/auth/tokens';
import { generateUniquePartyName } from '@/lib/party-names';
import type { PartyWithOptionalPin } from '@/types/database';
import { requiresPin } from '@/types/database';

// Enhanced logging utility
function logPartiesContext(level: 'info' | 'warn' | 'error', message: string, context: Record<string, any>) {
  const timestamp = new Date().toISOString();
  const logData = {
    timestamp,
    level,
    message,
    service: 'api/parties',
    ...context
  };
  console[level === 'info' ? 'log' : level](`[${timestamp}] PartiesAPI:`, message, JSON.stringify(logData, null, 2));
}

export async function GET() {
  const requestId = Math.random().toString(36).substring(2, 10);
  const startTime = Date.now();
  
  try {
    logPartiesContext('info', 'Parties list request received', {
      requestId
    });
    
    const supabase = createServerClient();
    
    // Get all parties - use a type-safe query that may or may not include admin_pin_hash
    const partiesQueryStart = Date.now();
    let parties: PartyWithOptionalPin[] | null = null;
    let error: any = null;

    // Try with admin_pin_hash first
    const { data: fullParties, error: fullError } = await supabase
      .from('parties')
      .select('id, name, status, created_at, admin_pin_hash')
      .order('created_at', { ascending: false });

    if (fullError && (fullError.message?.includes('admin_pin_hash') || fullError.code === '42703')) {
      logPartiesContext('warn', 'Admin PIN column not found - querying without PIN support', {
        requestId,
        queryTime: Date.now() - partiesQueryStart,
        originalError: fullError.message
      });
      
      // Fallback to basic query without admin_pin_hash
      const { data: basicParties, error: basicError } = await supabase
        .from('parties')
        .select('id, name, status, created_at')
        .order('created_at', { ascending: false });
      
      // Map to PartyWithOptionalPin type (admin_pin_hash will be undefined)
      parties = basicParties as PartyWithOptionalPin[] | null;
      error = basicError;
    } else {
      // Successfully got parties with admin_pin_hash
      parties = fullParties as PartyWithOptionalPin[] | null;
      error = fullError;
    }

    if (error) {
      logPartiesContext('error', 'Failed to fetch parties', {
        requestId,
        queryTime: Date.now() - partiesQueryStart,
        error: error.message,
        errorCode: error.code,
        errorDetails: error
      });
      return NextResponse.json(
        { error: 'Failed to fetch parties' },
        { status: 500 }
      );
    }

    logPartiesContext('info', 'Parties fetched, getting counts', {
      requestId,
      partiesCount: parties?.length || 0,
      partiesQueryTime: Date.now() - partiesQueryStart
    });

    // Get counts for each party
    const countsQueryStart = Date.now();
    const partiesWithCounts = await Promise.all(
      (parties ?? []).map(async (party) => {
        const { count: photoCount, error: photoError } = await supabase
          .from('photos')
          .select('*', { count: 'exact', head: true })
          .eq('party_id', party.id);

        const { count: uploaderCount, error: uploaderError } = await supabase
          .from('uploaders')
          .select('*', { count: 'exact', head: true })
          .eq('party_id', party.id);

        if (photoError || uploaderError) {
          logPartiesContext('warn', 'Failed to get counts for party', {
            requestId,
            partyId: party.id,
            photoError: photoError?.message,
            uploaderError: uploaderError?.message
          });
        }

        return {
          id: party.id,
          name: party.name,
          status: party.status,
          createdAt: party.created_at,
          photoCount: photoCount ?? 0,
          uploaderCount: uploaderCount ?? 0,
          requiresPin: requiresPin(party),
        };
      })
    );

    const totalTime = Date.now() - startTime;
    logPartiesContext('info', 'Parties list completed successfully', {
      requestId,
      partiesReturned: partiesWithCounts.length,
      countsQueryTime: Date.now() - countsQueryStart,
      totalTime
    });

    return NextResponse.json(partiesWithCounts);
  } catch (error) {
    const totalTime = Date.now() - startTime;
    logPartiesContext('error', 'Unexpected error in parties list', {
      requestId,
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

export async function POST() {
  const requestId = Math.random().toString(36).substring(2, 10);
  const startTime = Date.now();
  
  try {
    logPartiesContext('info', 'Party creation request received', {
      requestId
    });
    
    const supabase = createServerClient();
    
    // Generate a join token for guests
    const tokenGenerationStart = Date.now();
    const joinToken = generateJoinToken();
    const joinTokenHash = hashJoinToken(joinToken);
    const tokenTime = Date.now() - tokenGenerationStart;

    logPartiesContext('info', 'Tokens generated, creating unique party name', {
      requestId,
      tokenGenerationTime: tokenTime
    });

    // Generate a unique party name
    const nameGenerationStart = Date.now();
    const partyName = await generateUniquePartyName(async (name) => {
      const { data } = await supabase
        .from('parties')
        .select('id')
        .eq('name', name)
        .single();
      return data !== null;
    });
    const nameGenerationTime = Date.now() - nameGenerationStart;

    logPartiesContext('info', 'Unique party name generated, creating party', {
      requestId,
      partyName,
      nameGenerationTime
    });

    // Create the party (without join_token_hash - using new table instead)
    const partyCreationStart = Date.now();
    const { data: party, error } = await supabase
      .from('parties')
      .insert({
        name: partyName,
        status: 'active'
      } as any)
      .select('id, name, status, created_at')
      .single();

    if (error) {
      logPartiesContext('error', 'Failed to create party in database', {
        requestId,
        partyCreationTime: Date.now() - partyCreationStart,
        error: error.message,
        errorCode: error.code,
        errorDetails: error
      });
      return NextResponse.json(
        { error: 'Failed to create party' },
        { status: 500 }
      );
    }

    // Store the join token in the separate table
    const tokenStoreStart = Date.now();
    const { error: tokenError } = await supabase
      .from('party_join_tokens' as any)
      .insert({
        party_id: party.id,
        token: joinToken
      });

    if (tokenError) {
      logPartiesContext('error', 'Failed to store join token', {
        requestId,
        partyId: party.id,
        tokenStoreTime: Date.now() - tokenStoreStart,
        error: tokenError.message,
        errorCode: tokenError.code
      });
      
      // Clean up the party if token storage fails
      await supabase.from('parties').delete().eq('id', party.id);
      
      return NextResponse.json(
        { error: 'Failed to create party' },
        { status: 500 }
      );
    }

    const totalTime = Date.now() - startTime;
    logPartiesContext('info', 'Party created successfully', {
      requestId,
      partyId: party.id,
      partyName: party.name,
      partyCreationTime: Date.now() - partyCreationStart,
      tokenGenerationTime: tokenTime,
      tokenStoreTime: Date.now() - tokenStoreStart,
      nameGenerationTime,
      totalTime
    });

    return NextResponse.json({
      id: party.id,
      name: party.name,
      status: party.status,
      createdAt: party.created_at,
      joinToken, // Only returned once - client should save/display this
    });
  } catch (error) {
    const totalTime = Date.now() - startTime;
    logPartiesContext('error', 'Unexpected error in party creation', {
      requestId,
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
