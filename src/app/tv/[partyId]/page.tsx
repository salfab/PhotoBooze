'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams } from 'next/navigation';
import { Box, Typography, CircularProgress } from '@mui/material';
import { createClient } from '@/lib/supabase/client';
import type { Photo, Uploader } from '@/types/database';
import styles from './page.module.css';

interface PhotoWithUploader extends Photo {
  uploader: Pick<Uploader, 'display_name'> | null;
}

const SLIDESHOW_INTERVAL = 5000; // 5 seconds per photo
const STORAGE_BUCKET = 'photobooze-images';

export default function TvPage() {
  const params = useParams();
  const partyId = params.partyId as string;
  
  const [photos, setPhotos] = useState<PhotoWithUploader[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Create supabase client once
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
          // Fetch the new photo with uploader info
          const { data: newPhoto } = await supabase
            .from('photos')
            .select('*, uploader:uploaders(display_name)')
            .eq('id', payload.new.id)
            .single();

          if (newPhoto) {
            setPhotos(prev => [...prev, newPhoto as PhotoWithUploader]);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [partyId, supabase]);

  // Slideshow timer
  useEffect(() => {
    if (photos.length <= 1) return;

    const timer = setInterval(() => {
      setCurrentIndex(prev => (prev + 1) % photos.length);
    }, SLIDESHOW_INTERVAL);

    return () => clearInterval(timer);
  }, [photos.length]);

  // Get public URL for TV image
  const getTvImageUrl = useCallback((photo: Photo): string => {
    const { data } = supabase.storage
      .from(STORAGE_BUCKET)
      .getPublicUrl(photo.tv_path);
    return data.publicUrl;
  }, [supabase]);

  if (loading) {
    return (
      <Box className={styles.container}>
        <CircularProgress size={60} />
        <Typography variant="h6" color="text.secondary" sx={{ mt: 2 }}>
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
          <Typography variant="h3" component="h1" gutterBottom>
            📷 Waiting for photos...
          </Typography>
          <Typography variant="h6" color="text.secondary">
            Guests can scan the QR code to start uploading
          </Typography>
          <Box className={styles.partyId}>
            <Typography variant="body2" color="text.secondary">
              Party ID: {partyId}
            </Typography>
          </Box>
        </Box>
      </Box>
    );
  }

  const currentPhoto = photos[currentIndex];
  const uploaderName = currentPhoto.uploader?.display_name || 'Anonymous';
  const imageUrl = getTvImageUrl(currentPhoto);

  return (
    <Box className={styles.container}>
      <Box 
        className={styles.slideshow}
        style={{
          backgroundImage: `url(${imageUrl})`,
        }}
      >
        <Box className={styles.overlay}>
          <Box className={styles.photoInfo}>
            <Typography variant="h6" className={styles.uploaderName}>
              📷 {uploaderName}
            </Typography>
            <Typography variant="body2" className={styles.photoCount}>
              {currentIndex + 1} / {photos.length}
            </Typography>
          </Box>
        </Box>
      </Box>
    </Box>
  );
}
