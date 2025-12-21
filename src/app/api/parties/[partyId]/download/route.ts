/**
 * GET /api/parties/[partyId]/download - Download all original photos as ZIP
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, STORAGE_BUCKET } from '@/lib/supabase/server';
import archiver from 'archiver';

interface RouteParams {
  params: Promise<{ partyId: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { partyId } = await params;
    const supabase = createServerClient();

    // Get party info
    const { data: party, error: partyError } = await supabase
      .from('parties')
      .select('id')
      .eq('id', partyId)
      .single();

    if (partyError || !party) {
      return NextResponse.json(
        { error: 'Party not found' },
        { status: 404 }
      );
    }

    // Get all photos for this party
    const { data: photos, error: photosError } = await supabase
      .from('photos')
      .select('id, original_path, original_mime, uploader:uploaders(display_name)')
      .eq('party_id', partyId)
      .order('created_at', { ascending: true });

    if (photosError) {
      console.error('Failed to get photos:', photosError);
      return NextResponse.json(
        { error: 'Failed to get photos' },
        { status: 500 }
      );
    }

    if (!photos || photos.length === 0) {
      return NextResponse.json(
        { error: 'No photos to download' },
        { status: 404 }
      );
    }

    // Create a readable stream for the response
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
    for (const photo of photos) {
      try {
        // Download the original file from storage
        const { data: fileData, error: downloadError } = await supabase.storage
          .from(STORAGE_BUCKET)
          .download(photo.original_path);

        if (downloadError || !fileData) {
          console.error(
            `Failed to download photo ${photo.id}:`,
            `Bucket: ${STORAGE_BUCKET}, Path: ${photo.original_path}, Error: ${downloadError?.message || 'No data'}`
          );
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

        photoIndex++;
      } catch (err) {
        console.error(`Error processing photo ${photo.id}:`, err);
      }
    }

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

    return new NextResponse(zipBuffer, {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': String(zipBuffer.length),
      },
    });
  } catch (error) {
    console.error('Download error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
