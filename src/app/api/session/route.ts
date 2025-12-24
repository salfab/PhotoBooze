import { NextRequest, NextResponse } from 'next/server';
import { verifySession } from '@/lib/auth/session';
import { createLogger, generateRequestId } from '@/lib/logging';

const log = createLogger('api.session');

export async function GET(request: NextRequest) {
  const requestId = generateRequestId();
  const startTime = Date.now();
  
  try {
    const sessionToken = request.cookies.get('photobooze_session')?.value;
    
    log('info', 'Session check requested', {
      requestId,
      hasSessionToken: !!sessionToken,
      tokenLength: sessionToken?.length,
      userAgent: request.headers.get('user-agent'),
      ip: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown'
    });
    
    if (!sessionToken) {
      log('info', 'No session token found', {
        requestId,
        result: 'unauthenticated',
        reason: 'no_token'
      });
      return NextResponse.json({ authenticated: false }, { status: 200 });
    }

    const verificationStart = Date.now();
    const session = await verifySession(sessionToken);
    
    if (!session) {
      log('warn', 'Session verification failed', {
        requestId,
        result: 'unauthenticated',
        reason: 'invalid_session',
        verificationTime: Date.now() - verificationStart,
        tokenLength: sessionToken.length
      });
      return NextResponse.json({ authenticated: false }, { status: 200 });
    }

    const totalTime = Date.now() - startTime;
    log('info', 'Session verified successfully', {
      requestId,
      result: 'authenticated',
      partyId: session.partyId,
      uploaderId: session.uploaderId,
      verificationTime: Date.now() - verificationStart,
      totalTime
    });

    return NextResponse.json({
      authenticated: true,
      partyId: session.partyId,
      uploaderId: session.uploaderId,
    });
  } catch (error) {
    const totalTime = Date.now() - startTime;
    log('error', 'Session check error', {
      requestId,
      totalTime,
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      errorDetails: error
    });
    
    return NextResponse.json({ authenticated: false }, { status: 500 });
  }
}
