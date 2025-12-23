/**
 * POST /api/photos - Upload a photo with comprehensive logging
 * Receives pre-processed original and TV versions from client
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, STORAGE_BUCKET, getOriginalPath, getTvPath } from '@/lib/supabase/server';
import { verifySession } from '@/lib/auth/session';
import { v4 as uuidv4 } from 'uuid';

const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25MB

// Utility for consistent logging with context
function logWithContext(level: 'info' | 'warn' | 'error', message: string, context: Record<string, any>) {
  const timestamp = new Date().toISOString();
  const logData = {
    timestamp,
    level,
    message,
    service: 'api/photos',
    ...context
  };
  
  console[level === 'info' ? 'log' : level](`[${timestamp}] PhotoUpload:`, message, JSON.stringify(logData, null, 2));
}

function formatBytes(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(2)}MB`;
}

// Configure route for larger payloads
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60; // 60 seconds max execution

export async function POST(request: NextRequest) {
  const requestId = uuidv4().substring(0, 8); // Short request ID for tracking
  const startTime = Date.now();
  
  logWithContext('info', 'Upload request started', {
    requestId,
    userAgent: request.headers.get('user-agent'),
    contentLength: request.headers.get('content-length'),
  });

  try {
    // Step 1: Authentication
    const sessionToken = request.cookies.get('photobooze_session')?.value;
    if (!sessionToken) {
      logWithContext('warn', 'Upload rejected - no session token', { requestId });
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const session = await verifySession(sessionToken);
    if (!session) {
      logWithContext('warn', 'Upload rejected - invalid session', { requestId });
      return NextResponse.json({ error: 'Invalid session' }, { status: 401 });
    }

    const { partyId, uploaderId } = session;
    
    logWithContext('info', 'Session verified', {
      requestId,
      partyId,
      uploaderId
    });

    // Step 2: Parse form data
    const parseStartTime = Date.now();
    const formData = await request.formData();
    const originalFile = formData.get('original') as File | null;
    const tvFile = formData.get('tv') as File | null;
    const originalMime = formData.get('originalMime') as string | null;
    const originalExt = formData.get('originalExt') as string | null;
    const comment = formData.get('comment') as string | null;
    const useSameForTv = formData.get('useSameForTv') as string | null; // New flag from client

    logWithContext('info', 'Form data parsed', {
      requestId,
      partyId,
      parseTime: Date.now() - parseStartTime,
      originalSize: originalFile?.size ? formatBytes(originalFile.size) : 'missing',
      tvSize: tvFile?.size ? formatBytes(tvFile.size) : 'missing',
      originalMime,
      originalExt,
      hasComment: !!comment,
      useSameForTv: useSameForTv === 'true'
    });

    if (!originalFile) {
      logWithContext('error', 'Missing original file', { requestId, partyId });
      return NextResponse.json({ error: 'Missing original file' }, { status: 400 });
    }

    // TV file is optional if client determined original should be used for TV
    if (!tvFile && useSameForTv !== 'true') {
      logWithContext('error', 'Missing TV file', { requestId, partyId });
      return NextResponse.json({ error: 'Missing TV file' }, { status: 400 });
    }

    // Step 3: File validation
    const filesToValidate = [originalFile];
    if (tvFile) filesToValidate.push(tvFile);
    
    for (const file of filesToValidate) {
      if (file.size > MAX_FILE_SIZE) {
        logWithContext('error', 'File size limit exceeded', {
          requestId,
          partyId,
          fileName: file.name,
          fileSize: formatBytes(file.size),
          limit: formatBytes(MAX_FILE_SIZE)
        });
        return NextResponse.json({ error: 'File too large (max 25MB)' }, { status: 400 });
      }
    }

    const supabase = createServerClient();

    // Step 4: Party validation
    const { data: party, error: partyError } = await supabase
      .from('parties')
      .select('status')
      .eq('id', partyId)
      .single();

    if (partyError || !party || party.status !== 'active') {
      logWithContext('error', 'Party validation failed', {
        requestId,
        partyId,
        partyFound: !!party,
        partyStatus: party?.status,
        partyError: partyError?.message
      });
      return NextResponse.json({ error: 'Party is not accepting photos' }, { status: 403 });
    }

    // Step 5: Generate paths and prepare upload
    const photoId = uuidv4();
    const ext = originalExt || 'jpg';
    const originalPath = getOriginalPath(partyId, photoId, ext);
    const tvPath = getTvPath(partyId, photoId);
    
    // Determine which path to use for TV display
    const shouldUseSeparateTvFile = tvFile && useSameForTv !== 'true';
    const tvDisplayPath = shouldUseSeparateTvFile ? tvPath : originalPath;

    logWithContext('info', 'Upload strategy determined', {
      requestId,
      partyId,
      photoId,
      originalPath,
      tvPath,
      tvDisplayPath,
      shouldUseSeparateTvFile,
      originalSize: formatBytes(originalFile.size),
      tvSize: tvFile ? formatBytes(tvFile.size) : 'N/A',
      storageSaving: shouldUseSeparateTvFile ? 'No' : formatBytes(tvFile?.size || 0)
    });

    // Step 6: Convert to buffers
    const bufferStartTime = Date.now();
    const originalBuffer = await originalFile.arrayBuffer();
    const tvBuffer = tvFile ? await tvFile.arrayBuffer() : null;
    
    logWithContext('info', 'Files converted to buffers', {
      requestId,
      partyId,
      photoId,
      bufferTime: Date.now() - bufferStartTime
    });

    // Step 7: Upload original to Supabase Storage
    const originalUploadStart = Date.now();
    const { error: originalError } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(originalPath, originalBuffer, {
        contentType: originalMime || 'image/jpeg',
        upsert: false,
      });

    if (originalError) {
      logWithContext('error', 'Original upload failed', {
        requestId,
        partyId,
        photoId,
        originalPath,
        uploadTime: Date.now() - originalUploadStart,
        error: originalError.message,
        errorDetails: originalError
      });
      return NextResponse.json({
        error: 'Failed to upload original photo',
        details: `Bucket: ${STORAGE_BUCKET}, Path: ${originalPath}, Error: ${originalError.message}`
      }, { status: 500 });
    }

    logWithContext('info', 'Original uploaded successfully', {
      requestId,
      partyId,
      photoId,
      originalPath,
      uploadTime: Date.now() - originalUploadStart,
      size: formatBytes(originalFile.size)
    });

    // Step 8: Upload TV version (only if separate file provided)
    let tvUploadTime = 0;
    if (shouldUseSeparateTvFile && tvBuffer) {
      const tvUploadStart = Date.now();
      const { error: tvError } = await supabase.storage
        .from(STORAGE_BUCKET)
        .upload(tvPath, tvBuffer, {
          contentType: 'image/jpeg',
          upsert: false,
        });

      tvUploadTime = Date.now() - tvUploadStart;

      if (tvError) {
        logWithContext('error', 'TV upload failed, cleaning up original', {
          requestId,
          partyId,
          photoId,
          tvPath,
          originalPath,
          uploadTime: tvUploadTime,
          error: tvError.message,
          errorDetails: tvError
        });
        
        // Cleanup original
        const { error: cleanupError } = await supabase.storage.from(STORAGE_BUCKET).remove([originalPath]);
        if (cleanupError) {
          logWithContext('error', 'Failed to cleanup original after TV upload failure', {
            requestId,
            partyId,
            photoId,
            originalPath,
            cleanupError: cleanupError.message
          });
        }

        return NextResponse.json({
          error: 'Failed to upload TV photo',
          details: `Bucket: ${STORAGE_BUCKET}, Path: ${tvPath}, Error: ${tvError.message}`
        }, { status: 500 });
      }

      logWithContext('info', 'TV version uploaded successfully', {
        requestId,
        partyId,
        photoId,
        tvPath,
        uploadTime: tvUploadTime,
        size: formatBytes(tvFile!.size)
      });
    } else {
      logWithContext('info', 'Skipping TV upload - using original for TV display', {
        requestId,
        partyId,
        photoId,
        storageSaved: tvFile ? formatBytes(tvFile.size) : 'N/A'
      });
    }

    // Step 9: Save to database
    const dbInsertStart = Date.now();
    const { data: photo, error: dbError } = await supabase
      .from('photos')
      .insert({
        id: photoId,
        party_id: partyId,
        uploader_id: uploaderId,
        original_path: originalPath,
        tv_path: tvDisplayPath, // Key: points to original or tv path as appropriate
        original_mime: originalMime,
        tv_mime: 'image/jpeg',
        original_bytes: originalFile.size,
        tv_bytes: tvFile?.size || originalFile.size, // If same file, record actual size
        comment: comment || null,
      })
      .select('id, created_at')
      .single();

    if (dbError || !photo) {
      logWithContext('error', 'Database insert failed, cleaning up storage', {
        requestId,
        partyId,
        photoId,
        originalPath,
        tvPath: shouldUseSeparateTvFile ? tvPath : 'N/A',
        dbInsertTime: Date.now() - dbInsertStart,
        error: dbError?.message,
        errorDetails: dbError
      });
      
      // Cleanup files
      const filesToCleanup = [originalPath];
      if (shouldUseSeparateTvFile) filesToCleanup.push(tvPath);
      
      const { error: cleanupError } = await supabase.storage.from(STORAGE_BUCKET).remove(filesToCleanup);
      if (cleanupError) {
        logWithContext('error', 'Failed to cleanup storage after DB insert failure', {
          requestId,
          partyId,
          photoId,
          files: filesToCleanup,
          cleanupError: cleanupError.message
        });
      }

      return NextResponse.json({ error: 'Failed to save photo' }, { status: 500 });
    }

    const totalTime = Date.now() - startTime;
    const totalBytes = originalFile.size + (tvFile?.size || 0);
    const actualStorageUsed = originalFile.size + (shouldUseSeparateTvFile && tvFile ? tvFile.size : 0);
    
    logWithContext('info', 'Upload completed successfully', {
      requestId,
      partyId,
      photoId,
      uploaderId,
      totalTime,
      dbInsertTime: Date.now() - dbInsertStart,
      tvUploadTime,
      originalSize: formatBytes(originalFile.size),
      tvSize: tvFile ? formatBytes(tvFile.size) : 'N/A',
      actualStorageUsed: formatBytes(actualStorageUsed),
      storageSaved: formatBytes(totalBytes - actualStorageUsed),
      efficiency: {
        storageEfficiencyPct: ((totalBytes - actualStorageUsed) / totalBytes * 100).toFixed(1),
        avgThroughputMBps: (totalBytes / (1024 * 1024)) / (totalTime / 1000)
      }
    });

    return NextResponse.json({
      id: photo.id,
      createdAt: photo.created_at,
    });

  } catch (error) {
    const totalTime = Date.now() - startTime;
    
    logWithContext('error', 'Unexpected error during upload', {
      requestId,
      totalTime,
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      errorDetails: error
    });
    
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
