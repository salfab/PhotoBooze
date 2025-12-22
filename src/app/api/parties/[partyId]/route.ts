/**
 * GET /api/parties/[partyId] - Get party details
 * PATCH /api/parties/[partyId] - Update party name or status
 * DELETE /api/parties/[partyId] - Delete party and all data
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, STORAGE_BUCKET, getPartyFolder } from '@/lib/supabase/server';
import { hashPin, verifyPin } from '@/lib/auth/tokens';

interface RouteParams {
  params: Promise<{ partyId: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { partyId } = await params;
    const supabase = createServerClient();

    const { data: party, error } = await supabase
      .from('parties')
      .select('id, name, status, created_at, countdown_target')
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
      name: party.name,
      status: party.status,
      createdAt: party.created_at,
      countdownTarget: party.countdown_target,
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

    // Handle name updates
    if (body.name !== undefined) {
      if (!body.name || typeof body.name !== 'string' || body.name.trim().length === 0) {
        return NextResponse.json(
          { error: 'Name is required and must be a non-empty string' },
          { status: 400 }
        );
      }

      // Check if name is already taken by another party
      const { data: existingParty } = await supabase
        .from('parties')
        .select('id')
        .eq('name', body.name.trim())
        .neq('id', partyId)
        .single();

      if (existingParty) {
        return NextResponse.json(
          { error: 'This name is already taken by another party' },
          { status: 409 }
        );
      }

      const { data: party, error } = await supabase
        .from('parties')
        .update({ name: body.name.trim() })
        .eq('id', partyId)
        .select('id, name, status, created_at')
        .single();

      if (error || !party) {
        return NextResponse.json(
          { error: 'Party not found' },
          { status: 404 }
        );
      }

      return NextResponse.json({
        id: party.id,
        name: party.name,
        status: party.status,
        createdAt: party.created_at,
      });
    }

    // Handle status updates
    if (body.status && ['active', 'closed'].includes(body.status)) {
      const { data: party, error } = await supabase
        .from('parties')
        .update({ status: body.status })
        .eq('id', partyId)
        .select('id, name, status, created_at')
        .single();

      if (error || !party) {
        return NextResponse.json(
          { error: 'Party not found' },
          { status: 404 }
        );
      }

      return NextResponse.json({
        id: party.id,
        name: party.name,
        status: party.status,
        createdAt: party.created_at,
      });
    }

    // Handle countdown target updates
    if (body.countdownTarget !== undefined) {
      const { data: party, error } = await supabase
        .from('parties')
        .update({ countdown_target: body.countdownTarget })
        .eq('id', partyId)
        .select('id, name, status, created_at, countdown_target')
        .single();

      if (error || !party) {
        return NextResponse.json(
          { error: 'Party not found' },
          { status: 404 }
        );
      }

      return NextResponse.json({
        id: party.id,
        name: party.name,
        status: party.status,
        createdAt: party.created_at,
        countdownTarget: party.countdown_target,
      });
    }

    // Handle PIN updates (set or remove)
    if (body.pin !== undefined) {
      if (body.pin === null) {
        // Remove PIN - require current PIN for verification
        if (!body.currentPin) {
          return NextResponse.json(
            { error: 'Current PIN required to remove PIN', code: 'MISSING_CURRENT_PIN' },
            { status: 422 }
          );
        }

        // Fetch current PIN hash
        const { data: currentParty } = await supabase
          .from('parties')
          .select('admin_pin_hash')
          .eq('id', partyId)
          .single();

        if (!currentParty?.admin_pin_hash) {
          return NextResponse.json(
            { error: 'No PIN set for this party' },
            { status: 400 }
          );
        }

        if (!verifyPin(body.currentPin, currentParty.admin_pin_hash)) {
          return NextResponse.json(
            { error: 'Invalid current PIN', code: 'INVALID_PIN' },
            { status: 403 }
          );
        }

        // Remove PIN
        const { data: party, error } = await supabase
          .from('parties')
          .update({ admin_pin_hash: null })
          .eq('id', partyId)
          .select('id, name, status, created_at')
          .single();

        if (error || !party) {
          return NextResponse.json(
            { error: 'Party not found' },
            { status: 404 }
          );
        }

        return NextResponse.json({
          id: party.id,
          name: party.name,
          status: party.status,
          createdAt: party.created_at,
          requiresPin: false,
        });
      } else {
        // Set PIN - validate it's 6 digits
        if (!/^\d{6}$/.test(body.pin)) {
          return NextResponse.json(
            { error: 'PIN must be exactly 6 digits', code: 'INVALID_PIN_FORMAT' },
            { status: 400 }
          );
        }

        const pinHash = hashPin(body.pin);
        const { data: party, error } = await supabase
          .from('parties')
          .update({ admin_pin_hash: pinHash })
          .eq('id', partyId)
          .select('id, name, status, created_at')
          .single();

        if (error || !party) {
          return NextResponse.json(
            { error: 'Party not found' },
            { status: 404 }
          );
        }

        return NextResponse.json({
          id: party.id,
          name: party.name,
          status: party.status,
          createdAt: party.created_at,
          requiresPin: true,
        });
      }
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
    const { data: files, error: listError } = await supabase.storage
      .from(STORAGE_BUCKET)
      .list(partyFolder, { limit: 1000 });

    if (listError) {
      console.error('Failed to list storage files:', listError);
      return NextResponse.json(
        { 
          error: 'Failed to list storage files',
          details: `Bucket: ${STORAGE_BUCKET}, Path: ${partyFolder}, Error: ${listError.message}`
        },
        { status: 500 }
      );
    }

    if (files && files.length > 0) {
      const filePaths = files.map(f => `${partyFolder}/${f.name}`);
      const { error: removeError } = await supabase.storage
        .from(STORAGE_BUCKET)
        .remove(filePaths);

      if (removeError) {
        console.error('Failed to remove storage files:', removeError);
        return NextResponse.json(
          { 
            error: 'Failed to remove storage files',
            details: `Bucket: ${STORAGE_BUCKET}, Files: ${filePaths.length}, Error: ${removeError.message}`
          },
          { status: 500 }
        );
      }
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
