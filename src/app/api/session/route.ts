import { NextRequest, NextResponse } from 'next/server';
import { verifySession } from '@/lib/auth/session';

export async function GET(request: NextRequest) {
  try {
    const sessionToken = request.cookies.get('photobooze_session')?.value;
    if (!sessionToken) {
      return NextResponse.json({ authenticated: false }, { status: 200 });
    }

    const session = await verifySession(sessionToken);
    if (!session) {
      return NextResponse.json({ authenticated: false }, { status: 200 });
    }

    return NextResponse.json({
      authenticated: true,
      partyId: session.partyId,
      uploaderId: session.uploaderId,
    });
  } catch (error) {
    console.error('Session check error:', error);
    return NextResponse.json({ authenticated: false }, { status: 500 });
  }
}
