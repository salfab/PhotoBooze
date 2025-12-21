'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams } from 'next/navigation';
import { Box, Typography, CircularProgress } from '@mui/material';
import { motion, AnimatePresence } from 'framer-motion';
import { createClient } from '@/lib/supabase/client';
import type { Photo, Uploader } from '@/types/database';
import styles from './page.module.css';

interface PhotoWithUploader extends Photo {
  uploader: Pick<Uploader, 'display_name'> | null;
}

const STORAGE_BUCKET = 'photobooze-images';
const MAX_VISIBLE_PHOTOS = 15;

// Generate consistent random values based on photo ID
function getScatterProps(photoId: string, index: number) {
  let hash = 0;
  for (let i = 0; i < photoId.length; i++) {
    hash = ((hash << 5) - hash) + photoId.charCodeAt(i);
    hash |= 0;
  }
  
  const random = (seed: number) => {
    const x = Math.sin(hash + seed) * 10000;
    return x - Math.floor(x);
  };

  return {
    rotate: (random(1) - 0.5) * 24, // -12 to +12 degrees
    x: (random(2) - 0.5) * 100,     // -50 to +50px
    y: (random(3) - 0.5) * 60,      // -30 to +30px
    zIndex: index,
  };
}

export default function TvPage() {
  const params = useParams();
  const partyId = params.partyId as string;
  
  const [photos, setPhotos] = useState<PhotoWithUploader[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const supabase = useMemo(() => createClient(), []);

  // Load initial photos
  useEffect(() => {
    async function loadPhotos() {
      const { data, error: fetchError } = await supabase
        .from('photos')
        .select('*, uploader:uploaders(display_name)')
        .eq('party_id', partyId)
        .order('created_at', { ascending: true });

      if (fetchError) {
        console.error('Failed to load photos:', fetchError);
        setError('Failed to load photos');
      } else {
        setPhotos(data as PhotoWithUploader[]);
        if (data && data.length > 0) {
          setCurrentIndex(data.length - 1);
        }
      }
      setLoading(false);
    }

    loadPhotos();
  }, [partyId, supabase]);

  // Subscribe to new photos via Realtime
  useEffect(() => {
    const channel = supabase
      .channel(`photos:${partyId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'photos',
          filter: `party_id=eq.${partyId}`,
        },
        async (payload) => {
          console.log('New photo received via Realtime:', payload.new);
          
          const { data: newPhoto, error: fetchError } = await supabase
            .from('photos')
            .select('*, uploader:uploaders(display_name)')
            .eq('id', payload.new.id)
            .single();

          if (fetchError) {
            console.error('Error fetching new photo:', fetchError);
            return;
          }

          if (newPhoto) {
            setPhotos(prev => {
              const updatedPhotos = [...prev, newPhoto as PhotoWithUploader];
              setCurrentIndex(updatedPhotos.length - 1);
              return updatedPhotos;
            });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [partyId, supabase]);

  // Subscribe to remote control commands
  useEffect(() => {
    const channel = supabase
      .channel(`tv-control:${partyId}`)
      .on('broadcast', { event: 'navigate' }, ({ payload }) => {
        console.log('Remote command received:', payload);
        if (payload.action === 'next') {
          setCurrentIndex(prev => Math.min(prev + 1, photos.length - 1));
        } else if (payload.action === 'prev') {
          setCurrentIndex(prev => Math.max(prev - 1, 0));
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [partyId, supabase, photos.length]);

  // Broadcast current state for remotes
  useEffect(() => {
    if (photos.length === 0) return;
    
    const currentPhoto = photos[currentIndex];
    const channel = supabase.channel(`tv-state:${partyId}`);
    
    channel.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        await channel.send({
          type: 'broadcast',
          event: 'state',
          payload: {
            currentIndex,
            totalPhotos: photos.length,
            currentPhoto: currentPhoto ? {
              id: currentPhoto.id,
              uploaderName: currentPhoto.uploader?.display_name || 'Anonymous',
              comment: currentPhoto.comment,
            } : null,
          },
        });
      }
    });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [partyId, supabase, currentIndex, photos]);

  const getTvImageUrl = useCallback((photo: Photo): string => {
    const { data } = supabase.storage
      .from(STORAGE_BUCKET)
      .getPublicUrl(photo.tv_path);
    return data.publicUrl;
  }, [supabase]);

  if (loading) {
    return (
      <Box className={styles.container}>
        <CircularProgress size={60} sx={{ color: 'white' }} />
        <Typography variant="h6" sx={{ mt: 2, color: 'white' }}>
          Loading slideshow...
        </Typography>
      </Box>
    );
  }

  if (error) {
    return (
      <Box className={styles.container}>
        <Typography variant="h4" color="error">
          {error}
        </Typography>
      </Box>
    );
  }

  if (photos.length === 0) {
    return (
      <Box className={styles.container}>
        <Box className={styles.waitingContainer}>
          <Typography variant="h3" component="h1" gutterBottom sx={{ color: 'white' }}>
            📷 Waiting for photos...
          </Typography>
          <Typography variant="h6" sx={{ color: 'rgba(255,255,255,0.7)' }}>
            Guests can scan the QR code to start uploading
          </Typography>
          <Box className={styles.partyId}>
            <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.5)' }}>
              Party ID: {partyId}
            </Typography>
          </Box>
        </Box>
      </Box>
    );
  }

  // Get visible photos (limit to MAX_VISIBLE_PHOTOS centered around current)
  const startIdx = Math.max(0, currentIndex - MAX_VISIBLE_PHOTOS + 1);
  const visiblePhotos = photos.slice(startIdx, currentIndex + 1);

  return (
    <Box className={styles.container}>
      {/* Photo stack */}
      <Box className={styles.stackContainer}>
        <AnimatePresence mode="popLayout">
          {visiblePhotos.map((photo, idx) => {
            const actualIndex = startIdx + idx;
            const isTop = actualIndex === currentIndex;
            const scatter = getScatterProps(photo.id, actualIndex);
            
            return (
              <motion.div
                key={photo.id}
                className={styles.polaroid}
                initial={{ 
                  opacity: 0, 
                  scale: 0.5, 
                  y: -200,
                  rotate: scatter.rotate - 30,
                }}
                animate={{ 
                  opacity: 1, 
                  scale: isTop ? 1 : 0.95,
                  x: scatter.x,
                  y: scatter.y,
                  rotate: scatter.rotate,
                  zIndex: scatter.zIndex,
                }}
                exit={{ 
                  opacity: 0,
                  scale: 0.8,
                  transition: { duration: 0.2 }
                }}
                transition={{ 
                  type: 'spring',
                  stiffness: 120,
                  damping: 14,
                  mass: 1,
                }}
                style={{ zIndex: scatter.zIndex }}
              >
                <div className={styles.polaroidInner}>
                  <img 
                    src={getTvImageUrl(photo)} 
                    alt={`Photo by ${photo.uploader?.display_name || 'Anonymous'}`}
                    className={styles.polaroidImage}
                    draggable={false}
                  />
                  <div className={styles.polaroidCaption}>
                    <span className={styles.polaroidAuthor}>
                      📷 {photo.uploader?.display_name || 'Anonymous'}
                    </span>
                    {photo.comment && (
                      <span className={styles.polaroidComment}>
                        "{photo.comment}"
                      </span>
                    )}
                  </div>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </Box>

      {/* Photo counter */}
      <Box className={styles.counter}>
        <Typography variant="body1">
          {currentIndex + 1} / {photos.length}
        </Typography>
      </Box>
    </Box>
  );
}
