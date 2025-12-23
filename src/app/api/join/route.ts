/**
 * POST /api/join - Join a party as a guest with comprehensive logging
 * Validates the join token, creates an uploader record, and sets session cookie
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { verifyJoinToken, setSessionCookie } from '@/lib/auth';

// Enhanced logging utility
function logJoinContext(level: 'info' | 'warn' | 'error', message: string, context: Record<string, any>) {
  const timestamp = new Date().toISOString();
  const logData = {
    timestamp,
    level,
    message,
    service: 'api/join',
    ...context
  };
  console[level === 'info' ? 'log' : level](`[${timestamp}] JoinAPI:`, message, JSON.stringify(logData, null, 2));
}

export async function POST(request: NextRequest) {
  const requestId = Math.random().toString(36).substring(2, 10);
  const startTime = Date.now();
  
  try {
    const body = await request.json();
    const { partyId, token, displayName } = body;

    logJoinContext('info', 'Join request received', {
      requestId,
      partyId,
      hasToken: !!token,
      tokenLength: token?.length,
      displayName: displayName || 'anonymous',
      userAgent: request.headers.get('user-agent'),
      ip: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown'
    });

    if (!partyId || !token) {
      logJoinContext('error', 'Missing required parameters', {
        requestId,
        partyId: !!partyId,
        hasToken: !!token,
        validationFailed: 'missing_params'
      });
      return NextResponse.json(
        { error: 'Missing partyId or token' },
        { status: 400 }
      );
    }

    const supabase = createServerClient();

    // Get the party and verify the token
    const partyQueryStart = Date.now();
    const { data: party, error: partyError } = await supabase
      .from('parties')
      .select('id, status, join_token_hash')
      .eq('id', partyId)
      .single();

    logJoinContext('info', 'Party query completed', {
      requestId,
      partyId,
      partyQueryTime: Date.now() - partyQueryStart,
      partyFound: !!party,
      partyStatus: party?.status,
      hasJoinTokenHash: !!party?.join_token_hash
    });

    if (partyError || !party) {
      logJoinContext('error', 'Party lookup failed', {
        requestId,
        partyId,
        error: partyError?.message,
        errorCode: partyError?.code,
        errorDetails: partyError
      });
      return NextResponse.json(
        { error: 'Party not found' },
        { status: 404 }
      );
    }

    if (party.status !== 'active') {
      logJoinContext('warn', 'Attempted to join inactive party', {
        requestId,
        partyId,
        partyStatus: party.status,
        rejectionReason: 'party_inactive'
      });
      return NextResponse.json(
        { error: 'Party is no longer accepting guests' },
        { status: 403 }
      );
    }

    // Verify the join token
    if (!party.join_token_hash) {
      logJoinContext('error', 'Party missing join token hash', {
        requestId,
        partyId,
        configurationError: 'no_join_token_hash'
      });
      return NextResponse.json(
        { error: 'Party is not configured for joining' },
        { status: 403 }
      );
    }
    
    const tokenVerificationStart = Date.now();
    const tokenValid = verifyJoinToken(token, party.join_token_hash);
    
    logJoinContext('info', 'Token verification completed', {
      requestId,
      partyId,
      tokenValid,
      verificationTime: Date.now() - tokenVerificationStart,
      tokenLength: token.length
    });
    
    if (!tokenValid) {
      logJoinContext('warn', 'Invalid join token attempt', {
        requestId,
        partyId,
        tokenLength: token.length,
        securityEvent: 'invalid_token'
      });
      return NextResponse.json(
        { error: 'Invalid join token. The QR code may have expired. Please ask for a new one.' },
        { status: 403 }
      );
    }

    // Create the uploader record
    const uploaderCreateStart = Date.now();
    const { data: uploader, error: uploaderError } = await supabase
      .from('uploaders')
      .insert({
        party_id: partyId,
        display_name: displayName || null,
      })
      .select('id, display_name')
      .single();

    if (uploaderError || !uploader) {
      logJoinContext('error', 'Failed to create uploader record', {
        requestId,
        partyId,
        displayName,
        uploaderCreateTime: Date.now() - uploaderCreateStart,
        error: uploaderError?.message,
        errorCode: uploaderError?.code,
        errorDetails: uploaderError
      });
      return NextResponse.json(
        { error: 'Failed to join party' },
        { status: 500 }
      );
    }

    logJoinContext('info', 'Uploader created successfully', {
      requestId,
      partyId,
      uploaderId: uploader.id,
      displayName: uploader.display_name,
      uploaderCreateTime: Date.now() - uploaderCreateStart
    });

    // Set the session cookie
    const sessionStart = Date.now();
    await setSessionCookie(partyId, uploader.id);

    const totalTime = Date.now() - startTime;
    logJoinContext('info', 'Join completed successfully', {
      requestId,
      partyId,
      uploaderId: uploader.id,
      displayName: uploader.display_name,
      sessionSetTime: Date.now() - sessionStart,
      totalTime,
      performance: {
        totalTimeMs: totalTime,
        partyQueryMs: Date.now() - partyQueryStart,
        uploaderCreateMs: Date.now() - uploaderCreateStart
      }
    });

    return NextResponse.json({
      success: true,
      uploaderId: uploader.id,
      displayName: uploader.display_name,
    });
  } catch (error) {
    const totalTime = Date.now() - startTime;
    logJoinContext('error', 'Unexpected join error', {
      requestId: Math.random().toString(36).substring(2, 10),
      totalTime,
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      errorDetails: error
    });
    
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
