import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';

function logUploaderContext(level: 'info' | 'warn' | 'error', message: string, context: Record<string, unknown> = {}) {
  const timestamp = new Date().toISOString();
  const logData = {
    timestamp,
    level: level.toUpperCase(),
    service: 'api.uploaders',
    message,
    ...context
  };
  console.log(JSON.stringify(logData));
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ uploaderId: string }> }
) {
  const requestId = Math.random().toString(36).substring(2, 10);
  const startTime = Date.now();
  
  try {
    const { uploaderId } = await params;
    
    logUploaderContext('info', 'Uploader details request received', {
      requestId,
      uploaderId
    });
    
    const supabase = createServerClient();

    const queryStart = Date.now();
    const { data: uploader, error } = await supabase
      .from('uploaders')
      .select('id, display_name, party_id, created_at')
      .eq('id', uploaderId)
      .single();

    if (error || !uploader) {
      logUploaderContext('warn', 'Uploader not found', {
        requestId,
        uploaderId,
        queryTime: Date.now() - queryStart,
        error: error?.message
      });
      return NextResponse.json(
        { error: 'Uploader not found' },
        { status: 404 }
      );
    }

    const totalTime = Date.now() - startTime;
    logUploaderContext('info', 'Uploader details retrieved successfully', {
      requestId,
      uploaderId,
      uploaderName: uploader.display_name,
      partyId: uploader.party_id,
      queryTime: Date.now() - queryStart,
      totalTime
    });

    return NextResponse.json(uploader);
  } catch (error) {
    const totalTime = Date.now() - startTime;
    logUploaderContext('error', 'Unexpected error in uploader details', {
      requestId,
      uploaderId: (await params).uploaderId,
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
