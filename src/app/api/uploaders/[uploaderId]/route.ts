import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ uploaderId: string }> }
) {
  try {
    const { uploaderId } = await params;
    const supabase = createServerClient();

    const { data: uploader, error } = await supabase
      .from('uploaders')
      .select('id, display_name, party_id, created_at')
      .eq('id', uploaderId)
      .single();

    if (error || !uploader) {
      return NextResponse.json(
        { error: 'Uploader not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(uploader);
  } catch (error) {
    console.error('Get uploader error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
