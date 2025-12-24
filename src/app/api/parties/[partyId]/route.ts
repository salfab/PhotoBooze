/**
 * GET /api/parties/[partyId] - Get party details
 * PATCH /api/parties/[partyId] - Update party name or status
 * DELETE /api/parties/[partyId] - Delete party and all data
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, STORAGE_BUCKET, getPartyFolder } from '@/lib/supabase/server';
import { hashPin, verifyPin } from '@/lib/auth/tokens';
import { createLogger, generateRequestId } from '@/lib/logging';

const log = createLogger('api.parties.detail');

interface RouteParams {
  params: Promise<{ partyId: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  const requestId = generateRequestId();
  const startTime = Date.now();
  
  try {
    const { partyId } = await params;
    
    log('info', 'Party detail request received', {
      requestId,
      partyId
    });
    
    const supabase = createServerClient();

    // Get party details
    const partyQueryStart = Date.now();
    const { data: party, error } = await supabase
      .from('parties')
      .select('id, name, status, created_at, countdown_target')
      .eq('id', partyId)
      .single();

    if (error || !party) {
      log('warn', 'Party not found', {
        requestId,
        partyId,
        queryTime: Date.now() - partyQueryStart,
        error: error?.message
      });
      return NextResponse.json(
        { error: 'Party not found' },
        { status: 404 }
      );
    }

    log('info', 'Party found, getting counts', {
      requestId,
      partyId: party.id,
      partyName: party.name,
      partyQueryTime: Date.now() - partyQueryStart
    });

    // Get photo count
    const countsStart = Date.now();
    const { count: photoCount, error: photoError } = await supabase
      .from('photos')
      .select('*', { count: 'exact', head: true })
      .eq('party_id', partyId);

    // Get uploader count
    const { count: uploaderCount, error: uploaderError } = await supabase
      .from('uploaders')
      .select('*', { count: 'exact', head: true })
      .eq('party_id', partyId);

    if (photoError || uploaderError) {
      log('warn', 'Failed to get counts for party detail', {
        requestId,
        partyId,
        photoError: photoError?.message,
        uploaderError: uploaderError?.message
      });
    }

    const totalTime = Date.now() - startTime;
    log('info', 'Party detail completed successfully', {
      requestId,
      partyId,
      photoCount: photoCount ?? 0,
      uploaderCount: uploaderCount ?? 0,
      countsTime: Date.now() - countsStart,
      totalTime
    });

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
    const totalTime = Date.now() - startTime;
    log('error', 'Unexpected error in party detail', {
      requestId,
      partyId: (await params).partyId,
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

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const requestId = Math.random().toString(36).substring(2, 10);
  const startTime = Date.now();
  
  try {
    const { partyId } = await params;
    
    log('info', 'Party update request received', {
      requestId,
      partyId
    });
    
    const body = await request.json();
    const supabase = createServerClient();

    // Handle name updates
    if (body.name !== undefined) {
      log('info', 'Processing name update', {
        requestId,
        partyId,
        newName: body.name,
        nameType: typeof body.name
      });
      
      if (!body.name || typeof body.name !== 'string' || body.name.trim().length === 0) {
        log('warn', 'Invalid name provided for update', {
          requestId,
          partyId,
          providedName: body.name,
          nameType: typeof body.name
        });
        return NextResponse.json(
          { error: 'Name is required and must be a non-empty string' },
          { status: 400 }
        );
      }

      // Check if name is already taken by another party
      const nameCheckStart = Date.now();
      const { data: existingParty, error: nameCheckError } = await supabase
        .from('parties')
        .select('id')
        .eq('name', body.name.trim())
        .neq('id', partyId)
        .single();

      if (nameCheckError && nameCheckError.code !== 'PGRST116') {
        log('error', 'Failed to check name availability', {
          requestId,
          partyId,
          nameCheckTime: Date.now() - nameCheckStart,
          error: nameCheckError.message
        });
      }

      if (existingParty) {
        log('warn', 'Name already taken by another party', {
          requestId,
          partyId,
          requestedName: body.name.trim(),
          conflictingPartyId: existingParty.id,
          nameCheckTime: Date.now() - nameCheckStart
        });
        return NextResponse.json(
          { error: 'This name is already taken by another party' },
          { status: 409 }
        );
      }

      const updateStart = Date.now();
      const { data: party, error } = await supabase
        .from('parties')
        .update({ name: body.name.trim() })
        .eq('id', partyId)
        .select('id, name, status, created_at')
        .single();

      if (error || !party) {
        log('error', 'Failed to update party name', {
          requestId,
          partyId,
          updateTime: Date.now() - updateStart,
          error: error?.message
        });
        return NextResponse.json(
          { error: 'Party not found' },
          { status: 404 }
        );
      }

      const totalTime = Date.now() - startTime;
      log('info', 'Party name updated successfully', {
        requestId,
        partyId,
        oldName: '[unknown]',
        newName: party.name,
        nameCheckTime: Date.now() - nameCheckStart,
        updateTime: Date.now() - updateStart,
        totalTime
      });

      return NextResponse.json({
        id: party.id,
        name: party.name,
        status: party.status,
        createdAt: party.created_at,
      });
    }

    // Handle status updates
    if (body.status && ['active', 'closed'].includes(body.status)) {
      log('info', 'Processing status update', {
        requestId,
        partyId,
        newStatus: body.status
      });
      
      const updateStart = Date.now();
      const { data: party, error } = await supabase
        .from('parties')
        .update({ status: body.status })
        .eq('id', partyId)
        .select('id, name, status, created_at')
        .single();

      if (error || !party) {
        log('error', 'Failed to update party status', {
          requestId,
          partyId,
          updateTime: Date.now() - updateStart,
          error: error?.message
        });
        return NextResponse.json(
          { error: 'Party not found' },
          { status: 404 }
        );
      }

      const totalTime = Date.now() - startTime;
      log('info', 'Party status updated successfully', {
        requestId,
        partyId,
        newStatus: party.status,
        updateTime: Date.now() - updateStart,
        totalTime
      });

      return NextResponse.json({
        id: party.id,
        name: party.name,
        status: party.status,
        createdAt: party.created_at,
      });
    }

    // Handle countdown target updates
    if (body.countdownTarget !== undefined) {
      log('info', 'Processing countdown target update', {
        requestId,
        partyId,
        newCountdownTarget: body.countdownTarget
      });
      
      const updateStart = Date.now();
      const { data: party, error } = await supabase
        .from('parties')
        .update({ countdown_target: body.countdownTarget })
        .eq('id', partyId)
        .select('id, name, status, created_at, countdown_target')
        .single();

      if (error || !party) {
        log('error', 'Failed to update countdown target', {
          requestId,
          partyId,
          updateTime: Date.now() - updateStart,
          error: error?.message
        });
        return NextResponse.json(
          { error: 'Party not found' },
          { status: 404 }
        );
      }

      const totalTime = Date.now() - startTime;
      log('info', 'Countdown target updated successfully', {
        requestId,
        partyId,
        newCountdownTarget: party.countdown_target,
        updateTime: Date.now() - updateStart,
        totalTime
      });

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
        log('info', 'Processing PIN removal', {
          requestId,
          partyId,
          hasCurrentPin: !!body.currentPin
        });
        
        // Remove PIN - require current PIN for verification
        if (!body.currentPin) {
          log('warn', 'Missing current PIN for removal', {
            requestId,
            partyId
          });
          return NextResponse.json(
            { error: 'Current PIN required to remove PIN', code: 'MISSING_CURRENT_PIN' },
            { status: 422 }
          );
        }

        // Fetch current PIN hash
        const pinCheckStart = Date.now();
        let { data: currentParty, error: pinFetchError } = await supabase
          .from('parties')
          .select('admin_pin_hash')
          .eq('id', partyId)
          .single();
        
        // Handle case where admin_pin_hash column doesn't exist
        if (pinFetchError && (pinFetchError.message?.includes('admin_pin_hash') || pinFetchError.code === '42703')) {
          log('warn', 'Admin PIN column not found - feature disabled', {
            requestId,
            partyId,
            pinCheckTime: Date.now() - pinCheckStart
          });
          return NextResponse.json(
            { error: 'PIN feature not available' },
            { status: 400 }
          );
        }

        const adminPinHash = (currentParty as any)?.admin_pin_hash;
        if (pinFetchError || !adminPinHash) {
          log('error', 'Failed to fetch current PIN or no PIN set', {
            requestId,
            partyId,
            pinCheckTime: Date.now() - pinCheckStart,
            error: pinFetchError?.message,
            hasPinHash: !!adminPinHash
          });
          return NextResponse.json(
            { error: 'No PIN set for this party' },
            { status: 400 }
          );
        }

        const verifyStart = Date.now();
        if (!verifyPin(body.currentPin, adminPinHash)) {
          log('warn', 'Invalid current PIN provided for removal', {
            requestId,
            partyId,
            verifyTime: Date.now() - verifyStart
          });
          return NextResponse.json(
            { error: 'Invalid current PIN', code: 'INVALID_PIN' },
            { status: 403 }
          );
        }

        // Remove PIN
        const updateStart = Date.now();
        const { data: party, error } = await supabase
          .from('parties')
          .update({ admin_pin_hash: null })
          .eq('id', partyId)
          .select('id, name, status, created_at')
          .single();

        if (error || !party) {
          log('error', 'Failed to remove PIN from party', {
            requestId,
            partyId,
            updateTime: Date.now() - updateStart,
            error: error?.message
          });
          return NextResponse.json(
            { error: 'Party not found' },
            { status: 404 }
          );
        }

        const totalTime = Date.now() - startTime;
        log('info', 'PIN removed successfully', {
          requestId,
          partyId,
          pinCheckTime: Date.now() - pinCheckStart,
          verifyTime: Date.now() - verifyStart,
          updateTime: Date.now() - updateStart,
          totalTime
        });

        return NextResponse.json({
          id: party.id,
          name: party.name,
          status: party.status,
          createdAt: party.created_at,
          requiresPin: false,
        });
      } else {
        log('info', 'Processing PIN creation/update', {
          requestId,
          partyId,
          pinFormat: /^\d{6}$/.test(body.pin) ? 'valid' : 'invalid'
        });
        
        // Set PIN - validate it's 6 digits
        if (!/^\d{6}$/.test(body.pin)) {
          log('warn', 'Invalid PIN format provided', {
            requestId,
            partyId,
            pinLength: body.pin?.length,
            pinPattern: typeof body.pin === 'string' ? body.pin.replace(/./g, '*') : 'non-string'
          });
          return NextResponse.json(
            { error: 'PIN must be exactly 6 digits', code: 'INVALID_PIN_FORMAT' },
            { status: 400 }
          );
        }

        const hashStart = Date.now();
        const pinHash = hashPin(body.pin);
        const hashTime = Date.now() - hashStart;
        
        const updateStart = Date.now();
        const { data: party, error } = await supabase
          .from('parties')
          .update({ admin_pin_hash: pinHash })
          .eq('id', partyId)
          .select('id, name, status, created_at')
          .single();

        if (error || !party) {
          log('error', 'Failed to set PIN for party', {
            requestId,
            partyId,
            updateTime: Date.now() - updateStart,
            error: error?.message
          });
          return NextResponse.json(
            { error: 'Party not found' },
            { status: 404 }
          );
        }

        const totalTime = Date.now() - startTime;
        log('info', 'PIN set successfully', {
          requestId,
          partyId,
          hashTime,
          updateTime: Date.now() - updateStart,
          totalTime
        });

        return NextResponse.json({
          id: party.id,
          name: party.name,
          status: party.status,
          createdAt: party.created_at,
          requiresPin: true,
        });
      }
    }

    log('warn', 'Invalid update request - no valid fields provided', {
      requestId,
      partyId,
      providedFields: Object.keys(body)
    });
    
    return NextResponse.json(
      { error: 'Invalid update' },
      { status: 400 }
    );
  } catch (error) {
    const totalTime = Date.now() - startTime;
    log('error', 'Unexpected error in party update', {
      requestId,
      partyId: (await params).partyId,
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

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const requestId = Math.random().toString(36).substring(2, 10);
  const startTime = Date.now();
  
  try {
    const { partyId } = await params;
    
    log('info', 'Party deletion request received', {
      requestId,
      partyId
    });
    
    const supabase = createServerClient();

    // First, delete all photos from storage (including subdirectories)
    const partyFolder = getPartyFolder(partyId);
    
    log('info', 'Listing storage files for deletion', {
      requestId,
      partyId,
      partyFolder,
      bucket: STORAGE_BUCKET
    });
    
    // List files in all subdirectories: original/ and tv/
    const listStart = Date.now();
    const allFiles: string[] = [];
    
    // List files in original/ subdirectory
    const { data: originalFiles, error: originalListError } = await supabase.storage
      .from(STORAGE_BUCKET)
      .list(`${partyFolder}/original`, { limit: 1000 });
    
    if (originalListError) {
      log('error', 'Failed to list original files', {
        requestId,
        partyId,
        error: originalListError.message
      });
    } else if (originalFiles && originalFiles.length > 0) {
      allFiles.push(...originalFiles.map(f => `${partyFolder}/original/${f.name}`));
    }
    
    // List files in tv/ subdirectory
    const { data: tvFiles, error: tvListError } = await supabase.storage
      .from(STORAGE_BUCKET)
      .list(`${partyFolder}/tv`, { limit: 1000 });
    
    if (tvListError) {
      log('error', 'Failed to list TV files', {
        requestId,
        partyId,
        error: tvListError.message
      });
    } else if (tvFiles && tvFiles.length > 0) {
      allFiles.push(...tvFiles.map(f => `${partyFolder}/tv/${f.name}`));
    }

    const fileCount = allFiles.length;
    let storageRemoveTime = 0;
    
    log('info', 'Storage files listed, proceeding with deletion', {
      requestId,
      partyId,
      listTime: Date.now() - listStart,
      fileCount
    });

    if (allFiles && allFiles.length > 0) {
      
      const removeStart = Date.now();
      const { error: removeError } = await supabase.storage
        .from(STORAGE_BUCKET)
        .remove(allFiles);

      storageRemoveTime = Date.now() - removeStart;

      if (removeError) {
        log('error', 'Failed to remove storage files', {
          requestId,
          partyId,
          removeTime: storageRemoveTime,
          bucket: STORAGE_BUCKET,
          fileCount: allFiles.length,
          error: removeError.message
        });
        return NextResponse.json(
          { 
            error: 'Failed to remove storage files',
            details: `Bucket: ${STORAGE_BUCKET}, Files: ${allFiles.length}, Error: ${removeError.message}`
          },
          { status: 500 }
        );
      }

      log('info', 'Storage files removed successfully', {
        requestId,
        partyId,
        removeTime: storageRemoveTime,
        filesRemoved: allFiles.length
      });
    }

    // Delete photos records (cascade will handle this, but be explicit)
    const photoDeleteStart = Date.now();
    const { error: photoDeleteError } = await supabase
      .from('photos')
      .delete()
      .eq('party_id', partyId);

    if (photoDeleteError) {
      log('warn', 'Failed to delete photo records', {
        requestId,
        partyId,
        photoDeleteTime: Date.now() - photoDeleteStart,
        error: photoDeleteError.message
      });
    } else {
      log('info', 'Photo records deleted', {
        requestId,
        partyId,
        photoDeleteTime: Date.now() - photoDeleteStart
      });
    }

    // Delete uploaders
    const uploaderDeleteStart = Date.now();
    const { error: uploaderDeleteError } = await supabase
      .from('uploaders')
      .delete()
      .eq('party_id', partyId);

    if (uploaderDeleteError) {
      log('warn', 'Failed to delete uploader records', {
        requestId,
        partyId,
        uploaderDeleteTime: Date.now() - uploaderDeleteStart,
        error: uploaderDeleteError.message
      });
    } else {
      log('info', 'Uploader records deleted', {
        requestId,
        partyId,
        uploaderDeleteTime: Date.now() - uploaderDeleteStart
      });
    }

    // Delete the party
    const partyDeleteStart = Date.now();
    const { error } = await supabase
      .from('parties')
      .delete()
      .eq('id', partyId);

    if (error) {
      log('error', 'Failed to delete party record', {
        requestId,
        partyId,
        partyDeleteTime: Date.now() - partyDeleteStart,
        error: error.message,
        errorCode: error.code
      });
      return NextResponse.json(
        { error: 'Failed to delete party' },
        { status: 500 }
      );
    }

    const totalTime = Date.now() - startTime;
    log('info', 'Party deletion completed successfully', {
      requestId,
      partyId,
      fileCount,
      storageListTime: Date.now() - listStart,
      storageRemoveTime,
      photoDeleteTime: Date.now() - photoDeleteStart,
      uploaderDeleteTime: Date.now() - uploaderDeleteStart,
      partyDeleteTime: Date.now() - partyDeleteStart,
      totalTime
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    const totalTime = Date.now() - startTime;
    log('error', 'Unexpected error in party deletion', {
      requestId,
      partyId: (await params).partyId,
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
