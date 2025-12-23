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
    const { partyId, token, displayName, confirm } = body;

    logJoinContext('info', 'Join request received', {
      requestId,
      partyId,
      hasToken: !!token,
      tokenLength: token?.length,
      displayName: displayName || 'anonymous',
      confirm: !!confirm,
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
      .select('id, status')
      .eq('id', partyId)
      .single();

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

    // Get the join token for this party
    const { data: tokenData, error: tokenError } = await supabase
      .from('party_join_tokens' as any)
      .select('token')
      .eq('party_id', partyId)
      .single() as { data: { token: string } | null; error: any };

    logJoinContext('info', 'Party and token query completed', {
      requestId,
      partyId,
      partyQueryTime: Date.now() - partyQueryStart,
      partyFound: !!party,
      partyStatus: party?.status,
      hasJoinToken: !!tokenData?.token,
      tokenError: tokenError?.message
    });

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
    if (tokenError || !tokenData?.token) {
      logJoinContext('error', 'Party missing join token', {
        requestId,
        partyId,
        configurationError: 'no_join_token',
        tokenError: tokenError?.message
      });
      return NextResponse.json(
        { error: 'Party is not configured for joining' },
        { status: 403 }
      );
    }
    
    const tokenVerificationStart = Date.now();
    const storedToken = tokenData.token;
    const tokenValid = token === storedToken; // Direct comparison instead of hash verification
    
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

    // Create the uploader record or return existing one if name already exists
    const uploaderCreateStart = Date.now();
    let uploader = null;
    let uploaderError = null;
    
    // If display name is provided, check if an uploader with this name already exists
    if (displayName) {
      const { data: existingUploader } = await supabase
        .from('uploaders')
        .select('id, display_name')
        .eq('party_id', partyId)
        .eq('display_name', displayName)
        .single();
      
      if (existingUploader) {
        // If existing uploader found but no confirmation, ask for confirmation
        if (!confirm) {
          logJoinContext('info', 'Existing uploader found, requesting confirmation', {
            requestId,
            partyId,
            uploaderId: existingUploader.id,
            displayName: existingUploader.display_name
          });
          
          return NextResponse.json({
            requiresConfirmation: true,
            message: `Welcome back! You were already in this party as "${displayName}". Do you want to continue with your existing photos?`,
            existingUploader: {
              id: existingUploader.id,
              displayName: existingUploader.display_name
            }
          }, { status: 200 });
        }
        
        // Confirmation provided, return the existing uploader
        uploader = existingUploader;
        
        logJoinContext('info', 'Confirmed return of existing uploader', {
          requestId,
          partyId,
          uploaderId: uploader.id,
          displayName: uploader.display_name,
          action: 'confirmed_takeover'
        });
      }
    }
    
    // If no existing uploader found, create a new one
    if (!uploader) {
      const result = await supabase
        .from('uploaders')
        .insert({
          party_id: partyId,
          display_name: displayName || null,
        })
        .select('id, display_name')
        .single();
      
      uploader = result.data;
      uploaderError = result.error;
    }

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
