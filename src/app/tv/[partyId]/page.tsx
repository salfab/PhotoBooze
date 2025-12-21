'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
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
// Uses viewport dimensions for full-screen scatter
function getScatterProps(photoId: string, index: number, viewportWidth: number, viewportHeight: number) {
  let hash = 0;
  for (let i = 0; i < photoId.length; i++) {
    hash = ((hash << 5) - hash) + photoId.charCodeAt(i);
    hash |= 0;
  }
  
  const random = (seed: number) => {
    const x = Math.sin(hash + seed) * 10000;
    return x - Math.floor(x);
  };

  // Scatter across ~70% of viewport width and ~50% of viewport height
  const maxX = viewportWidth * 0.35;
  const maxY = viewportHeight * 0.25;

  return {
    rotate: (random(1) - 0.5) * 30, // -15 to +15 degrees
    x: (random(2) - 0.5) * maxX * 2, // -35vw to +35vw equivalent
    y: (random(3) - 0.5) * maxY * 2, // -25vh to +25vh equivalent
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
  const [viewport, setViewport] = useState({ width: 1920, height: 1080 });
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showQR, setShowQR] = useState(false);
  const [qrCodeUrl, setQrCodeUrl] = useState<string>('');
  
  const supabase = useMemo(() => createClient(), []);
  const stateChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const photosRef = useRef<PhotoWithUploader[]>([]);
  const qrTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Track viewport size for scatter calculations
  useEffect(() => {
    const updateViewport = () => {
      setViewport({ width: window.innerWidth, height: window.innerHeight });
    };
    updateViewport();
    window.addEventListener('resize', updateViewport);
    return () => window.removeEventListener('resize', updateViewport);
  }, []);

  // Generate QR code for party join URL
  useEffect(() => {
    async function generateQR() {
      try {
        const QRCode = (await import('qrcode')).default;
        const joinUrl = `${window.location.origin}/upload/${partyId}`;
        const qrDataUrl = await QRCode.toDataURL(joinUrl, {
          width: 400,
          margin: 2,
          color: {
            dark: '#000000',
            light: '#ffffff',
          },
        });
        setQrCodeUrl(qrDataUrl);
      } catch (err) {
        console.error('Failed to generate QR code:', err);
      }
    }
    generateQR();
  }, [partyId]);

  // Keep photosRef in sync with photos state
  useEffect(() => {
    photosRef.current = photos;
  }, [photos]);

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

  const getTvImageUrl = useCallback((photo: Photo): string => {
    const { data } = supabase.storage
      .from(STORAGE_BUCKET)
      .getPublicUrl(photo.tv_path);
    return data.publicUrl;
  }, [supabase]);

  // Function to broadcast current state - can be called on demand
  const broadcastCurrentState = useCallback(() => {
    if (!stateChannelRef.current) return;
    
    if (photos.length === 0) {
      // Broadcast "no photos" state
      console.log('Broadcasting TV state: No photos yet');
      stateChannelRef.current.send({
        type: 'broadcast',
        event: 'state',
        payload: {
          currentIndex: 0,
          totalPhotos: 0,
          uploaderName: null,
          comment: null,
          photoUrl: null,
          isFullscreen,
        },
      });
      return;
    }
    
    const currentPhoto = photos[currentIndex];
    const photoUrl = currentPhoto ? getTvImageUrl(currentPhoto) : null;
    
    console.log('Broadcasting TV state:', { currentIndex, totalPhotos: photos.length, isFullscreen });
    stateChannelRef.current.send({
      type: 'broadcast',
      event: 'state',
      payload: {
        currentIndex,
        totalPhotos: photos.length,
        uploaderName: currentPhoto?.uploader?.display_name || 'Anonymous',
        comment: currentPhoto?.comment || null,
        photoUrl,
        isFullscreen,
      },
    });
  }, [currentIndex, photos, getTvImageUrl, isFullscreen]);

  // Subscribe to remote control commands AND state requests
  useEffect(() => {
    const channel = supabase
      .channel(`tv-control:${partyId}`)
      .on('broadcast', { event: 'navigate' }, ({ payload }) => {
        console.log('Remote command received:', payload);
        if (payload.action === 'next') {
          setCurrentIndex(prev => Math.min(prev + 1, photosRef.current.length - 1));
        } else if (payload.action === 'prev') {
          setCurrentIndex(prev => Math.max(prev - 1, 0));
        }
      })
      .on('broadcast', { event: 'toggle-fullscreen' }, () => {
        console.log('Fullscreen toggle received from remote');
        setIsFullscreen(prev => !prev);
      })
      .on('broadcast', { event: 'request-state' }, () => {
        console.log('State request received from remote');
        // Broadcast current state immediately
        broadcastCurrentState();
      })
      .on('broadcast', { event: 'show-qr' }, () => {
        console.log('Show QR command received from remote');
        // Clear any existing timer
        if (qrTimerRef.current) {
          clearTimeout(qrTimerRef.current);
        }
        // Show QR code
        setShowQR(true);
        // Hide after 60 seconds
        qrTimerRef.current = setTimeout(() => {
          setShowQR(false);
          qrTimerRef.current = null;
        }, 60000);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      if (qrTimerRef.current) {
        clearTimeout(qrTimerRef.current);
      }
    };
  }, [partyId, supabase, broadcastCurrentState]);

  // Set up persistent state broadcast channel
  useEffect(() => {
    const channel = supabase.channel(`tv-state:${partyId}`);
    
    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        console.log('State broadcast channel ready');
        stateChannelRef.current = channel;
        // Broadcast current state immediately when channel is ready
        broadcastCurrentState();
      }
    });

    return () => {
      stateChannelRef.current = null;
      supabase.removeChannel(channel);
    };
  }, [partyId, supabase, broadcastCurrentState]);

  // Broadcast state when it changes (including isFullscreen)
  useEffect(() => {
    broadcastCurrentState();
  }, [broadcastCurrentState]);

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
      <Box className={`${styles.stackContainer} ${isFullscreen ? styles.blurred : ''}`}>
        <AnimatePresence mode="popLayout">
          {visiblePhotos.map((photo, idx) => {
            const actualIndex = startIdx + idx;
            const isTop = actualIndex === currentIndex;
            const scatter = getScatterProps(photo.id, actualIndex, viewport.width, viewport.height);
            
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
      <Box className={`${styles.counter} ${isFullscreen ? styles.blurred : ''}`}>
        <Typography variant="body1">
          {currentIndex + 1} / {photos.length}
        </Typography>
      </Box>

      {/* Fullscreen overlay - triggered by remote */}
      {isFullscreen && photos[currentIndex] && (
        <Box 
          className={styles.fullscreenOverlay} 
          onClick={() => setIsFullscreen(false)}
        >
          <div className={styles.fullscreenPolaroid}>
            <div className={styles.fullscreenPolaroidInner}>
              <img 
                src={getTvImageUrl(photos[currentIndex])} 
                alt={`Photo by ${photos[currentIndex].uploader?.display_name || 'Anonymous'}`}
                className={styles.fullscreenImage}
              />
              <div className={styles.fullscreenPolaroidCaption}>
                <span className={styles.fullscreenAuthor}>
                  📷 {photos[currentIndex].uploader?.display_name || 'Anonymous'}
                </span>
                {photos[currentIndex].comment && (
                  <span className={styles.fullscreenComment}>
                    "{photos[currentIndex].comment}"
                  </span>
                )}
              </div>
            </div>
          </div>
        </Box>
      )}

      {/* QR Code overlay - bottom right corner */}
      {showQR && qrCodeUrl && (
        <Box className={styles.qrOverlay}>
          <Box className={styles.qrCard}>
            <img src={qrCodeUrl} alt="Join Party QR Code" className={styles.qrImage} />
            <Typography variant="caption" className={styles.qrCaption}>
              scan to join
            </Typography>
          </Box>
        </Box>
      )}
    </Box>
  );
}
