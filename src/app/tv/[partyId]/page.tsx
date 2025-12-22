'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useParams } from 'next/navigation';
import { Box, Typography, CircularProgress } from '@mui/material';
import { motion, AnimatePresence } from 'framer-motion';
import { createClient } from '@/lib/supabase/client';
import type { Photo, Uploader } from '@/types/database';

type Guest = Pick<Uploader, 'id' | 'display_name' | 'created_at'>;
import Countdown from '@/components/Countdown';
import styles from './page.module.css';

interface PhotoWithUploader extends Photo {
  uploader: Pick<Uploader, 'display_name'> | null;
}

const STORAGE_BUCKET = 'photobooze-images';
const MAX_VISIBLE_PHOTOS = 20;

// Generate consistent random values based on photo ID
// Uses viewport dimensions for full-screen scatter
function getScatterProps(photoId: string, index: number, viewportWidth: number, viewportHeight: number) {
  let hash = 0;
  for (let i = 0; i < photoId.length; i++) {
    hash = ((hash << 5) - hash) + photoId.charCodeAt(i);
    hash |= 0;
  }
  
  // Better random distribution using multiple hash variations
  const random = (seed: number) => {
    const x = Math.sin((hash * seed) + seed * 12345) * 10000;
    return x - Math.floor(x);
  };

  // Also use the index to add more variation
  const indexVariation = Math.sin(index * 7919) * 0.5; // Prime number for better distribution

  // Scatter across ~70% of viewport width and ~50% of viewport height
  const maxX = viewportWidth * 0.35;
  const maxY = viewportHeight * 0.25;

  // Calculate raw position and add index-based variation
  const rawX = (random(2) - 0.5 + indexVariation * 0.3) * maxX * 2;
  const rawY = (random(3) - 0.5) * maxY * 2;

  return {
    rotate: (random(1) - 0.5) * 30, // -15 to +15 degrees
    x: Math.max(-maxX, Math.min(maxX, rawX)), // Clamp to bounds
    y: rawY,
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
  const [countdownTarget, setCountdownTarget] = useState<string | null>(null);
  const [guests, setGuests] = useState<Guest[]>([]);
  
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

  // Load guests and subscribe to new arrivals
  useEffect(() => {
    async function loadGuests() {
      const { data } = await supabase
        .from('uploaders')
        .select('id, display_name, created_at')
        .eq('party_id', partyId)
        .order('created_at', { ascending: true });
      
      if (data) {
        setGuests(data);
      }
    }

    loadGuests();

    // Subscribe to new guests joining
    const channel = supabase
      .channel(`guests:${partyId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'uploaders',
          filter: `party_id=eq.${partyId}`,
        },
        (payload) => {
          const newGuest = payload.new as Guest;
          console.log('👋 New guest joined:', newGuest.display_name);
          setGuests(prev => [...prev, newGuest]);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [partyId, supabase]);

  // Load party data and log countdown info
  useEffect(() => {
    async function loadPartyData() {
      try {
        const response = await fetch(`/api/parties/${partyId}`);
        if (response.ok) {
          const party = await response.json();          
          setCountdownTarget(party.countdownTarget);
          
          if (party.countdownTarget) {
            const target = new Date(party.countdownTarget);
            const now = new Date();
            const diff = target.getTime() - now.getTime();
            
            if (diff > 0) {
              const hours = Math.floor(diff / (1000 * 60 * 60));
              const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
              const seconds = Math.floor((diff % (1000 * 60)) / 1000);
              
              console.log(`⏱️ Countdown target: ${target.toLocaleString()}`);
              console.log(`⏱️ Time remaining: ${hours}h ${minutes}m ${seconds}s`);
            } else {
              console.log(`⏱️ Countdown has already elapsed at ${target.toLocaleString()}`);
            }
          } else {
            console.log('⏱️ No countdown target set for this party');
          }
        }
      } catch (err) {
        console.error('Failed to load party data:', err);
      }
    }

    loadPartyData();
  }, [partyId]);

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

  // Preload an image and return a promise that resolves when loaded
  const preloadImage = useCallback((url: string): Promise<void> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve();
      img.onerror = () => reject(new Error(`Failed to load image: ${url}`));
      img.src = url;
    });
  }, []);

  // Queue system for photo introductions (minimum 10 seconds between each)
  const photoQueueRef = useRef<PhotoWithUploader[]>([]);
  const isProcessingQueueRef = useRef(false);
  const lastPhotoAddedTimeRef = useRef<number>(0);
  const MIN_DISPLAY_TIME = 10000; // 10 seconds minimum between photos

  const processPhotoQueue = useCallback(async () => {
    if (isProcessingQueueRef.current || photoQueueRef.current.length === 0) {
      return;
    }

    isProcessingQueueRef.current = true;

    while (photoQueueRef.current.length > 0) {
      const timeSinceLastPhoto = Date.now() - lastPhotoAddedTimeRef.current;
      const waitTime = Math.max(0, MIN_DISPLAY_TIME - timeSinceLastPhoto);

      if (waitTime > 0) {
        console.log(`⏳ Waiting ${waitTime}ms before showing next photo (${photoQueueRef.current.length} in queue)`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }

      const nextPhoto = photoQueueRef.current.shift();
      if (nextPhoto) {
        console.log(`📸 Adding photo to deck (${photoQueueRef.current.length} remaining in queue)`);
        lastPhotoAddedTimeRef.current = Date.now();
        
        setPhotos(prev => {
          const updatedPhotos = [...prev, nextPhoto];
          setCurrentIndex(updatedPhotos.length - 1);
          return updatedPhotos;
        });
      }
    }

    isProcessingQueueRef.current = false;
  }, []);

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
            // Get the image URL and preload it before adding to queue
            const { data: urlData } = supabase.storage
              .from(STORAGE_BUCKET)
              .getPublicUrl(newPhoto.tv_path);
            
            try {
              console.log('Preloading image before queueing...');
              await preloadImage(urlData.publicUrl);
              console.log('Image preloaded, adding to queue');
              
              // Add to queue instead of directly to state
              photoQueueRef.current.push(newPhoto as PhotoWithUploader);
              processPhotoQueue();
            } catch (err) {
              console.error('Failed to preload image, adding to queue anyway:', err);
              photoQueueRef.current.push(newPhoto as PhotoWithUploader);
              processPhotoQueue();
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [partyId, supabase, preloadImage, processPhotoQueue]);

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
      .on('broadcast', { event: 'toggle-qr' }, () => {
        console.log('Toggle QR command received from remote');
        setShowQR(prev => {
          const newState = !prev;
          // Clear any existing timer
          if (qrTimerRef.current) {
            clearTimeout(qrTimerRef.current);
            qrTimerRef.current = null;
          }
          // Set timer if showing
          if (newState) {
            qrTimerRef.current = setTimeout(() => {
              setShowQR(false);
              qrTimerRef.current = null;
            }, 60000);
          }
          return newState;
        });
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
        <Box sx={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 4,
        }}>
          {/* Elegant QR Code Card */}
          <Box sx={{
            background: 'white',
            borderRadius: '24px',
            padding: '32px',
            boxShadow: '0 20px 60px rgba(0, 0, 0, 0.4)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            maxWidth: '400px',
          }}>
            <Typography variant="h4" sx={{ 
              color: '#333', 
              fontWeight: 600,
              mb: 1,
              textAlign: 'center',
            }}>
              📸 Join the Party!
            </Typography>
            <Typography variant="body1" sx={{ 
              color: '#666', 
              mb: 3,
              textAlign: 'center',
            }}>
              Scan to start sharing photos
            </Typography>
            {qrCodeUrl && (
              <Box sx={{
                background: '#f8f8f8',
                borderRadius: '16px',
                padding: '16px',
                mb: 2,
              }}>
                <img 
                  src={qrCodeUrl} 
                  alt="Scan to join" 
                  style={{ 
                    width: 250, 
                    height: 250, 
                    display: 'block',
                    borderRadius: '8px',
                  }} 
                />
              </Box>
            )}
            <Typography variant="caption" sx={{ color: '#999' }}>
              Photos will appear here automatically
            </Typography>
          </Box>

          {/* Guest List */}
          {guests.length > 0 && (
            <Box sx={{
              background: 'rgba(0, 0, 0, 0.5)',
              backdropFilter: 'blur(10px)',
              borderRadius: '16px',
              padding: '20px 32px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 1.5,
            }}>
              <Typography variant="body2" sx={{ 
                color: 'rgba(255, 255, 255, 0.7)',
                textTransform: 'uppercase',
                letterSpacing: '0.1em',
                fontSize: '0.75rem',
              }}>
                Guests at the party
              </Typography>
              <Box sx={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: 1,
                justifyContent: 'center',
                maxWidth: '500px',
              }}>
                <AnimatePresence>
                  {guests.map((guest) => (
                    <motion.div
                      key={guest.id}
                      initial={{ scale: 0, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                    >
                      <Box
                        sx={{
                          background: 'rgba(255, 255, 255, 0.15)',
                          borderRadius: '20px',
                          padding: '6px 14px',
                          color: 'white',
                          fontSize: '0.9rem',
                        }}
                      >
                        {guest.display_name || 'Guest'}
                      </Box>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </Box>
            </Box>
          )}
        </Box>

        {/* Countdown overlay */}
        <Countdown countdownTarget={countdownTarget} />
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
        <AnimatePresence>
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
                  scale: 0.8, 
                  y: -300,
                  x: 0,
                  rotate: scatter.rotate - 30,
                }}
                animate={{ 
                  opacity: 1, 
                  scale: isTop ? 1.5 : 1,
                  x: isTop ? 0 : scatter.x,
                  y: isTop ? 0 : scatter.y,
                  rotate: scatter.rotate,
                }}
                exit={{ 
                  opacity: 0,
                  scale: 0.8,
                  transition: { duration: 0.3 }
                }}
                transition={{ 
                  type: 'spring',
                  stiffness: 80,
                  damping: 18,
                  mass: 0.8,
                }}
                style={{ 
                  zIndex: isTop ? 1000 : scatter.zIndex,
                  willChange: 'transform, opacity',
                }}
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
                        {photo.comment}
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
                    {photos[currentIndex].comment}
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

      {/* Countdown overlay */}
      <Countdown countdownTarget={countdownTarget} />
    </Box>
  );
}
