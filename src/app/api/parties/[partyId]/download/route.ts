/**
 * GET /api/parties/[partyId]/download - Download all original photos as ZIP
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, STORAGE_BUCKET } from '@/lib/supabase/server';
import archiver from 'archiver';

function logDownloadContext(level: 'info' | 'warn' | 'error', message: string, context: Record<string, unknown> = {}) {
  const timestamp = new Date().toISOString();
  const logData = {
    timestamp,
    level: level.toUpperCase(),
    service: 'api.parties.download',
    message,
    ...context
  };
  console.log(JSON.stringify(logData));
}

interface RouteParams {
  params: Promise<{ partyId: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  const requestId = Math.random().toString(36).substring(2, 10);
  const startTime = Date.now();
  
  try {
    const { partyId } = await params;
    
    logDownloadContext('info', 'Party download request received', {
      requestId,
      partyId
    });
    
    const supabase = createServerClient();

    // Get party info
    const partyQueryStart = Date.now();
    const { data: party, error: partyError } = await supabase
      .from('parties')
      .select('id')
      .eq('id', partyId)
      .single();

    if (partyError || !party) {
      logDownloadContext('warn', 'Party not found for download', {
        requestId,
        partyId,
        queryTime: Date.now() - partyQueryStart,
        error: partyError?.message
      });
      return NextResponse.json(
        { error: 'Party not found' },
        { status: 404 }
      );
    }

    logDownloadContext('info', 'Party found, fetching photos', {
      requestId,
      partyId,
      partyQueryTime: Date.now() - partyQueryStart
    });

    // Get all photos for this party
    const photosQueryStart = Date.now();
    const { data: photos, error: photosError } = await supabase
      .from('photos')
      .select('id, original_path, original_mime, uploader:uploaders(display_name)')
      .eq('party_id', partyId)
      .order('created_at', { ascending: true });

    if (photosError) {
      logDownloadContext('error', 'Failed to fetch photos for download', {
        requestId,
        partyId,
        photosQueryTime: Date.now() - photosQueryStart,
        error: photosError.message,
        errorCode: photosError.code
      });
      return NextResponse.json(
        { error: 'Failed to get photos' },
        { status: 500 }
      );
    }

    if (!photos || photos.length === 0) {
      logDownloadContext('warn', 'No photos available for download', {
        requestId,
        partyId,
        photosQueryTime: Date.now() - photosQueryStart,
        photoCount: 0
      });
      return NextResponse.json(
        { error: 'No photos to download' },
        { status: 404 }
      );
    }

    logDownloadContext('info', 'Photos fetched, creating archive', {
      requestId,
      partyId,
      photoCount: photos.length,
      photosQueryTime: Date.now() - photosQueryStart
    });

    // Create a readable stream for the response
    const archiveStart = Date.now();
    const archive = archiver('zip', {
      zlib: { level: 5 }, // Compression level
    });

    // Create a pass-through stream to convert to Web ReadableStream
    const chunks: Uint8Array[] = [];
    
    archive.on('data', (chunk: Buffer) => {
      chunks.push(new Uint8Array(chunk));
    });

    // Add each photo to the archive
    let photoIndex = 1;
    let successCount = 0;
    let failCount = 0;
    
    for (const photo of photos) {
      try {
        // Download the original file from storage
        const downloadStart = Date.now();
        const { data: fileData, error: downloadError } = await supabase.storage
          .from(STORAGE_BUCKET)
          .download(photo.original_path);

        if (downloadError || !fileData) {
          failCount++;
          logDownloadContext('warn', 'Failed to download individual photo for archive', {
            requestId,
            partyId,
            photoId: photo.id,
            photoPath: photo.original_path,
            downloadTime: Date.now() - downloadStart,
            error: downloadError?.message || 'No data'
          });
          continue;
        }

        // Determine file extension from path
        const ext = photo.original_path.split('.').pop() || 'jpg';
        
        // Create filename with uploader name if available
        const uploaderName = (photo.uploader as { display_name: string | null } | null)?.display_name || 'Anonymous';
        const safeUploaderName = uploaderName.replace(/[^a-zA-Z0-9]/g, '_');
        const fileName = `${String(photoIndex).padStart(3, '0')}_${safeUploaderName}.${ext}`;

        // Convert Blob to Buffer and append to archive
        const buffer = Buffer.from(await fileData.arrayBuffer());
        archive.append(buffer, { name: fileName });
        
        successCount++;
        photoIndex++;
      } catch (err) {
        failCount++;
        logDownloadContext('error', 'Error processing photo for archive', {
          requestId,
          partyId,
          photoId: photo.id,
          error: err instanceof Error ? err.message : 'Unknown error'
        });
      }
    }

    logDownloadContext('info', 'Photos processed, finalizing archive', {
      requestId,
      partyId,
      totalPhotos: photos.length,
      successCount,
      failCount,
      archiveProcessingTime: Date.now() - archiveStart
    });

    // Finalize the archive
    await archive.finalize();

    // Combine all chunks into a single buffer
    const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
    const zipBuffer = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
      zipBuffer.set(chunk, offset);
      offset += chunk.length;
    }

    // Generate filename with timestamp
    const timestamp = new Date().toISOString().slice(0, 10);
    const filename = `photobooze_${partyId.slice(0, 8)}_${timestamp}.zip`;

    const totalTime = Date.now() - startTime;
    logDownloadContext('info', 'Download archive completed successfully', {
      requestId,
      partyId,
      filename,
      zipSizeBytes: zipBuffer.length,
      photosIncluded: successCount,
      photosFailed: failCount,
      archiveTime: Date.now() - archiveStart,
      totalTime
    });

    return new NextResponse(zipBuffer, {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': String(zipBuffer.length),
      },
    });
  } catch (error) {
    const totalTime = Date.now() - startTime;
    logDownloadContext('error', 'Unexpected error in download', {
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
