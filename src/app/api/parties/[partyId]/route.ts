/**
 * GET /api/parties/[partyId] - Get party details
 * PATCH /api/parties/[partyId] - Update party status (close)
 * DELETE /api/parties/[partyId] - Delete party and all data
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, STORAGE_BUCKET, getPartyFolder } from '@/lib/supabase/server';

interface RouteParams {
  params: Promise<{ partyId: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { partyId } = await params;
    const supabase = createServerClient();

    const { data: party, error } = await supabase
      .from('parties')
      .select('id, status, created_at')
      .eq('id', partyId)
      .single();

    if (error || !party) {
      return NextResponse.json(
        { error: 'Party not found' },
        { status: 404 }
      );
    }

    // Get photo count
    const { count: photoCount } = await supabase
      .from('photos')
      .select('*', { count: 'exact', head: true })
      .eq('party_id', partyId);

    // Get uploader count
    const { count: uploaderCount } = await supabase
      .from('uploaders')
      .select('*', { count: 'exact', head: true })
      .eq('party_id', partyId);

    return NextResponse.json({
      id: party.id,
      status: party.status,
      createdAt: party.created_at,
      photoCount: photoCount ?? 0,
      uploaderCount: uploaderCount ?? 0,
    });
  } catch (error) {
    console.error('Get party error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const { partyId } = await params;
    const body = await request.json();
    const supabase = createServerClient();

    // Only allow status updates
    if (body.status && ['active', 'closed'].includes(body.status)) {
      const { data: party, error } = await supabase
        .from('parties')
        .update({ status: body.status })
        .eq('id', partyId)
        .select('id, status, created_at')
        .single();

      if (error || !party) {
        return NextResponse.json(
          { error: 'Party not found' },
          { status: 404 }
        );
      }

      return NextResponse.json({
        id: party.id,
        status: party.status,
        createdAt: party.created_at,
      });
    }

    return NextResponse.json(
      { error: 'Invalid update' },
      { status: 400 }
    );
  } catch (error) {
    console.error('Update party error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { partyId } = await params;
    const supabase = createServerClient();

    // First, delete all photos from storage
    const partyFolder = getPartyFolder(partyId);
    const { data: files } = await supabase.storage
      .from(STORAGE_BUCKET)
      .list(partyFolder, { limit: 1000 });

    if (files && files.length > 0) {
      const filePaths = files.map(f => `${partyFolder}/${f.name}`);
      await supabase.storage
        .from(STORAGE_BUCKET)
        .remove(filePaths);
    }

    // Delete photos records (cascade will handle this, but be explicit)
    await supabase
      .from('photos')
      .delete()
      .eq('party_id', partyId);

    // Delete uploaders
    await supabase
      .from('uploaders')
      .delete()
      .eq('party_id', partyId);

    // Delete the party
    const { error } = await supabase
      .from('parties')
      .delete()
      .eq('id', partyId);

    if (error) {
      return NextResponse.json(
        { error: 'Failed to delete party' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Delete party error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
