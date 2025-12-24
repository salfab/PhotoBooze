import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { createLogger, generateRequestId } from '@/lib/logging';

const log = createLogger('api.parties.stats');

interface UploaderStats {
  id: string;
  display_name: string;
  photo_count: number;
  total_comment_length: number;
  comments_count: number;
  last_photo_at: string | null;
  first_photo_at: string | null;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ partyId: string }> }
) {
  const requestId = generateRequestId();
  const startTime = Date.now();
  
  try {
    const { partyId } = await params;
    
    log('info', 'Party stats request received', {
      requestId,
      partyId
    });
    
    const supabase = createServerClient();

    // Get all photos with their uploaders
    const photosQueryStart = Date.now();
    const { data: photos, error: photosError } = await supabase
      .from('photos')
      .select(`
        id,
        created_at,
        comment,
        uploader_id,
        uploader:uploaders(id, display_name)
      `)
      .eq('party_id', partyId)
      .order('created_at', { ascending: true });

    if (photosError) {
      log('error', 'Failed to fetch photos for stats', {
        requestId,
        partyId,
        photosQueryTime: Date.now() - photosQueryStart,
        error: photosError.message,
        errorCode: photosError.code
      });
      return NextResponse.json({ error: photosError.message }, { status: 500 });
    }

    log('info', 'Photos fetched, getting uploaders', {
      requestId,
      partyId,
      photoCount: photos?.length || 0,
      photosQueryTime: Date.now() - photosQueryStart
    });

    // Get all uploaders for this party
    const uploadersQueryStart = Date.now();
    const { data: uploaders, error: uploadersError } = await supabase
      .from('uploaders')
      .select('id, display_name, created_at')
      .eq('party_id', partyId)
      .order('created_at', { ascending: true });

    if (uploadersError) {
      log('error', 'Failed to fetch uploaders for stats', {
        requestId,
        partyId,
        uploadersQueryTime: Date.now() - uploadersQueryStart,
        error: uploadersError.message,
        errorCode: uploadersError.code
      });
      return NextResponse.json({ error: uploadersError.message }, { status: 500 });
    }

    log('info', 'Uploaders fetched, building stats', {
      requestId,
      partyId,
      uploaderCount: uploaders?.length || 0,
      uploadersQueryTime: Date.now() - uploadersQueryStart
    });

    // Build stats per uploader
    const statsProcessingStart = Date.now();
    const uploaderStatsMap = new Map<string, UploaderStats>();

  // Initialize all uploaders (even those with 0 photos)
  for (const uploader of uploaders || []) {
    uploaderStatsMap.set(uploader.id, {
      id: uploader.id,
      display_name: uploader.display_name || 'Anonymous',
      photo_count: 0,
      total_comment_length: 0,
      comments_count: 0,
      last_photo_at: null,
      first_photo_at: null,
    });
  }

  // Aggregate photo data
  for (const photo of photos || []) {
    const uploaderId = photo.uploader_id;
    const stats = uploaderStatsMap.get(uploaderId);
    if (stats) {
      stats.photo_count++;
      if (photo.comment) {
        stats.total_comment_length += photo.comment.length;
        stats.comments_count++;
      }
      if (!stats.first_photo_at) {
        stats.first_photo_at = photo.created_at;
      }
      stats.last_photo_at = photo.created_at;
    }
  }

  const uploaderStats = Array.from(uploaderStatsMap.values());
  const now = new Date();

  // Calculate trophies
  const trophies: Array<{
    emoji: string;
    title: string;
    description: string;
    winner: string | null;
    value?: string;
  }> = [];

  // 📸 Shutterbug - Most photos
  const mostPhotos = uploaderStats
    .filter(u => u.photo_count > 0)
    .sort((a, b) => b.photo_count - a.photo_count)[0];
  trophies.push({
    emoji: '📸',
    title: 'Shutterbug',
    description: 'Most photos taken',
    winner: mostPhotos?.display_name || null,
    value: mostPhotos ? `${mostPhotos.photo_count} photos` : undefined,
  });

  // 📝 Storyteller - Longest total comments
  const longestComments = uploaderStats
    .filter(u => u.total_comment_length > 0)
    .sort((a, b) => b.total_comment_length - a.total_comment_length)[0];
  trophies.push({
    emoji: '📝',
    title: 'Storyteller',
    description: 'Wrote the most in comments',
    winner: longestComments?.display_name || null,
    value: longestComments ? `${longestComments.total_comment_length} characters` : undefined,
  });

  // 🤫 Strong Silent Type - Most photos with fewest comments
  const silentType = uploaderStats
    .filter(u => u.photo_count >= 3)
    .sort((a, b) => {
      const ratioA = a.comments_count / a.photo_count;
      const ratioB = b.comments_count / b.photo_count;
      return ratioA - ratioB;
    })[0];
  trophies.push({
    emoji: '🤫',
    title: 'Strong Silent Type',
    description: 'Photos speak louder than words',
    winner: silentType?.display_name || null,
    value: silentType ? `${silentType.comments_count}/${silentType.photo_count} commented` : undefined,
  });

  // 🍺 Probably Drunk - Longest time since last photo (for people who posted at least once)
  const activeUploaders = uploaderStats.filter(u => u.last_photo_at);
  const probablyDrunk = activeUploaders
    .map(u => ({
      ...u,
      timeSinceLast: now.getTime() - new Date(u.last_photo_at!).getTime(),
    }))
    .sort((a, b) => b.timeSinceLast - a.timeSinceLast)[0];
  
  if (probablyDrunk && probablyDrunk.timeSinceLast > 30 * 60 * 1000) { // At least 30 mins
    const mins = Math.floor(probablyDrunk.timeSinceLast / (1000 * 60));
    trophies.push({
      emoji: '🍺',
      title: 'Probably Drunk',
      description: "Haven't posted in a while...",
      winner: probablyDrunk.display_name,
      value: mins >= 60 ? `${Math.floor(mins / 60)}h ${mins % 60}m ago` : `${mins}m ago`,
    });
  } else {
    trophies.push({
      emoji: '🍺',
      title: 'Probably Drunk',
      description: "Haven't posted in a while...",
      winner: null,
    });
  }

  // ⚡ Speed Demon - Shortest time between first and last photo (with 5+ photos)
  const speedDemons = uploaderStats
    .filter(u => u.photo_count >= 5 && u.first_photo_at && u.last_photo_at)
    .map(u => ({
      ...u,
      duration: new Date(u.last_photo_at!).getTime() - new Date(u.first_photo_at!).getTime(),
    }))
    .filter(u => u.duration > 0)
    .sort((a, b) => (b.photo_count / b.duration) - (a.photo_count / a.duration))[0];
  trophies.push({
    emoji: '⚡',
    title: 'Speed Demon',
    description: 'Fastest photo rate',
    winner: speedDemons?.display_name || null,
    value: speedDemons 
      ? `${speedDemons.photo_count} photos in ${Math.ceil(speedDemons.duration / 60000)}min`
      : undefined,
  });

  // 🦥 Fashionably Late - Joined but hasn't posted yet
  const wallflowers = uploaderStats.filter(u => u.photo_count === 0);
  trophies.push({
    emoji: '🦥',
    title: 'Wallflower',
    description: 'Joined but camera-shy',
    winner: wallflowers.length > 0 ? wallflowers.map(w => w.display_name).join(', ') : null,
    value: wallflowers.length > 0 ? `${wallflowers.length} guest${wallflowers.length > 1 ? 's' : ''}` : undefined,
  });

  // 🎯 First Blood - First photo of the party
  const firstPhoto = photos?.[0];
  const firstBlood = firstPhoto 
    ? uploaderStats.find(u => u.id === firstPhoto.uploader_id)
    : null;
  trophies.push({
    emoji: '🎯',
    title: 'First Blood',
    description: 'Took the first photo',
    winner: firstBlood?.display_name || null,
  });

  // 🌟 Life of the Party - Most engagement (photos + comments combined)
  const lifeOfParty = uploaderStats
    .map(u => ({ ...u, engagement: u.photo_count + u.comments_count }))
    .sort((a, b) => b.engagement - a.engagement)[0];
  trophies.push({
    emoji: '🌟',
    title: 'Life of the Party',
    description: 'Most photos + comments',
    winner: lifeOfParty?.engagement > 0 ? lifeOfParty.display_name : null,
    value: lifeOfParty?.engagement > 0 
      ? `${lifeOfParty.photo_count} 📷 + ${lifeOfParty.comments_count} 💬` 
      : undefined,
  });

  // 📖 Novelist - Single longest comment
  const longestSingleComment = photos
    ?.filter(p => p.comment)
    .sort((a, b) => (b.comment?.length || 0) - (a.comment?.length || 0))[0];
  const novelist = longestSingleComment
    ? uploaderStats.find(u => u.id === longestSingleComment.uploader_id)
    : null;
  trophies.push({
    emoji: '📖',
    title: 'Novelist',
    description: 'Wrote the longest single comment',
    winner: novelist?.display_name || null,
    value: longestSingleComment?.comment 
      ? `${longestSingleComment.comment.length} chars` 
      : undefined,
  });

  const statsProcessingTime = Date.now() - statsProcessingStart;
  const totalTime = Date.now() - startTime;
  
  log('info', 'Party stats completed successfully', {
    requestId,
    partyId,
    totalPhotos: photos?.length || 0,
    totalUploaders: uploaders?.length || 0,
    totalComments: photos?.filter(p => p.comment).length || 0,
    trophiesGenerated: trophies.length,
    photosQueryTime: Date.now() - photosQueryStart,
    uploadersQueryTime: Date.now() - uploadersQueryStart,
    statsProcessingTime,
    totalTime
  });

  return NextResponse.json({
    trophies,
    summary: {
      totalPhotos: photos?.length || 0,
      totalGuests: uploaders?.length || 0,
      totalComments: photos?.filter(p => p.comment).length || 0,
    },
  });
  } catch (error) {
    const totalTime = Date.now() - startTime;
    log('error', 'Unexpected error in party stats', {
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
