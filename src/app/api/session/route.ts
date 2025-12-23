import { NextRequest, NextResponse } from 'next/server';
import { verifySession } from '@/lib/auth/session';

// Enhanced logging utility
function logSessionContext(level: 'info' | 'warn' | 'error', message: string, context: Record<string, any>) {
  const timestamp = new Date().toISOString();
  const logData = {
    timestamp,
    level,
    message,
    service: 'api/session',
    ...context
  };
  console[level === 'info' ? 'log' : level](`[${timestamp}] SessionAPI:`, message, JSON.stringify(logData, null, 2));
}

export async function GET(request: NextRequest) {
  const requestId = Math.random().toString(36).substring(2, 10);
  const startTime = Date.now();
  
  try {
    const sessionToken = request.cookies.get('photobooze_session')?.value;
    
    logSessionContext('info', 'Session check requested', {
      requestId,
      hasSessionToken: !!sessionToken,
      tokenLength: sessionToken?.length,
      userAgent: request.headers.get('user-agent'),
      ip: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown'
    });
    
    if (!sessionToken) {
      logSessionContext('info', 'No session token found', {
        requestId,
        result: 'unauthenticated',
        reason: 'no_token'
      });
      return NextResponse.json({ authenticated: false }, { status: 200 });
    }

    const verificationStart = Date.now();
    const session = await verifySession(sessionToken);
    
    if (!session) {
      logSessionContext('warn', 'Session verification failed', {
        requestId,
        result: 'unauthenticated',
        reason: 'invalid_session',
        verificationTime: Date.now() - verificationStart,
        tokenLength: sessionToken.length
      });
      return NextResponse.json({ authenticated: false }, { status: 200 });
    }

    const totalTime = Date.now() - startTime;
    logSessionContext('info', 'Session verified successfully', {
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
    logSessionContext('error', 'Session check error', {
      requestId,
      totalTime,
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      errorDetails: error
    });
    
    return NextResponse.json({ authenticated: false }, { status: 500 });
  }
}
