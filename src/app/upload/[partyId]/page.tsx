'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  Container,
  Box,
  Typography,
  Button,
  Alert,
  CircularProgress,
  TextField,
  IconButton,
  Fab,
  Card,
  CardMedia,
  BottomNavigation,
  BottomNavigationAction,
  Paper,
  Switch,
  FormControlLabel,
} from '@mui/material';
import {
  CameraAlt as CameraIcon,
  PhotoLibrary as GalleryIcon,
  Send as SendIcon,
  Close as CloseIcon,
  Tv as TvIcon,
  Timer as TimerIcon,
  SettingsRemote as RemoteIcon,
  NavigateBefore as PrevIcon,
  NavigateNext as NextIcon,
  QrCode2 as QrCodeIcon,
} from '@mui/icons-material';
import QRCode from 'qrcode';
import { processImage, type ProcessedImage } from '@/lib/image';
import { createClient } from '@/lib/supabase/client';
import styles from './page.module.css';

interface UploadedPhoto {
  id: string;
  name: string;
  size: number;
  comment?: string;
}

interface PendingPhoto {
  file: File;
  preview: string;
  comment: string;
}

interface TVState {
  currentIndex: number;
  totalPhotos: number;
  uploaderName?: string;
  comment?: string;
  photoUrl?: string;
  isFullscreen?: boolean;
}

export default function UploadPage() {
  const params = useParams();
  const router = useRouter();
  const partyId = params.partyId as string;
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const commentInputRef = useRef<HTMLInputElement>(null);

  const [displayName, setDisplayName] = useState<string>('');
  const [pendingPhoto, setPendingPhoto] = useState<PendingPhoto | null>(null);
  const [uploadedPhotos, setUploadedPhotos] = useState<UploadedPhoto[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const [showCamera, setShowCamera] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const [activeTab, setActiveTab] = useState(0);
  const [tvState, setTvState] = useState<TVState | null>(null);
  const [partyName, setPartyName] = useState<string | null>(null);
  const [qrCodeUrl, setQrCodeUrl] = useState<string>('');
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const countdownTimerRef = useRef<NodeJS.Timeout | null>(null);
  const supabaseRef = useRef(createClient());

  // Sync activeTab with URL hash
  useEffect(() => {
    const hash = window.location.hash.slice(1); // Remove the '#'
    if (hash === 'camera') setActiveTab(0);
    else if (hash === 'remote') setActiveTab(1);
    else if (hash === 'share') setActiveTab(2);
    else if (!hash) setActiveTab(0); // Default to camera
  }, []);

  // Get user's display name from session
  useEffect(() => {
    async function getSessionInfo() {
      try {
        const sessionRes = await fetch('/api/session');
        if (sessionRes.ok) {
          const session = await sessionRes.json();
          if (session.authenticated && session.partyId === partyId) {
            // Fetch uploader details to get display name
            const uploaderRes = await fetch(`/api/uploaders/${session.uploaderId}`);
            if (uploaderRes.ok) {
              const uploader = await uploaderRes.json();
              setDisplayName(uploader.display_name || 'Guest');
            }
            
            // Fetch party details to get party name
            const partyRes = await fetch(`/api/parties/${partyId}`);
            if (partyRes.ok) {
              const party = await partyRes.json();
              setPartyName(party.name || null);
            }
          } else {
            router.push('/');
          }
        } else {
          router.push('/');
        }
      } catch {
        router.push('/');
      }
    }
    getSessionInfo();
  }, [partyId, router]);

  // Generate QR code for party join URL
  useEffect(() => {
    async function generateQR() {
      try {
        const joinUrl = `${window.location.origin}/upload/${partyId}`;
        const qrDataUrl = await QRCode.toDataURL(joinUrl, {
          width: 300,
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

  // Detect if mobile device
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent));
    };
    checkMobile();
  }, []);

  // Listen for TV state broadcasts (for remote control)
  useEffect(() => {
    if (activeTab !== 1) return; // Only listen when on Remote tab

    const supabase = supabaseRef.current;
    const stateChannel = supabase.channel(`tv-state:${partyId}`);

    stateChannel
      .on('broadcast', { event: 'state' }, ({ payload }) => {
        console.log('TV state received:', payload);
        setTvState(payload as TVState);
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log('Remote subscribed to TV state, requesting current state...');
          // Request current state from TV after subscribing
          requestTvState();
        }
      });

    return () => {
      supabase.removeChannel(stateChannel);
    };
  }, [partyId, activeTab]);

  // Request current state from TV
  const requestTvState = useCallback(() => {
    const supabase = supabaseRef.current;
    const controlChannel = supabase.channel(`tv-control:${partyId}`);
    
    controlChannel.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        console.log('Sending request-state command');
        controlChannel.send({
          type: 'broadcast',
          event: 'request-state',
          payload: {},
        });
        // Unsubscribe after a longer delay to ensure delivery
        setTimeout(() => {
          supabase.removeChannel(controlChannel);
        }, 500);
      }
    });
  }, [partyId]);

  // Send navigation command to TV
  const sendNavigationCommand = useCallback((action: 'prev' | 'next') => {
    const supabase = supabaseRef.current;
    const channel = supabase.channel(`tv-control:${partyId}`);
    
    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        console.log('Sending navigation command:', action);
        channel.send({
          type: 'broadcast',
          event: 'navigate',
          payload: { action },
        });
        // Unsubscribe after a longer delay to ensure delivery
        setTimeout(() => {
          supabase.removeChannel(channel);
        }, 500);
      }
    });
  }, [partyId]);

  // Send fullscreen toggle command to TV
  const sendToggleFullscreen = useCallback(() => {
    const supabase = supabaseRef.current;
    const channel = supabase.channel(`tv-control:${partyId}`);
    
    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        console.log('Sending toggle-fullscreen command');
        channel.send({
          type: 'broadcast',
          event: 'toggle-fullscreen',
          payload: {},
        });
        // Unsubscribe after a longer delay to ensure delivery
        setTimeout(() => {
          supabase.removeChannel(channel);
        }, 500);
      }
    });
  }, [partyId]);

  const sendShowQRCommand = useCallback(() => {
    const supabase = supabaseRef.current;
    const channel = supabase.channel(`tv-control:${partyId}`);
    
    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        console.log('Sending show QR command');
        channel.send({
          type: 'broadcast',
          event: 'show-qr',
          payload: {},
        });
        setTimeout(() => {
          supabase.removeChannel(channel);
        }, 500);
      }
    });
  }, [partyId]);

  const uploadPhoto = useCallback(async (
    file: File,
    processed: ProcessedImage,
    comment: string
  ): Promise<UploadedPhoto | null> => {
    try {
      const formData = new FormData();
      formData.append('original', new Blob([processed.original], { type: processed.originalMime }), `original.${processed.originalExt}`);
      formData.append('tv', new Blob([processed.tv], { type: processed.tvMime }), 'tv.jpg');
      formData.append('originalMime', processed.originalMime);
      formData.append('originalExt', processed.originalExt);
      if (comment) {
        formData.append('comment', comment);
      }

      const response = await fetch('/api/photos', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Upload failed');
      }

      const result = await response.json();

      return {
        id: result.id,
        name: file.name,
        size: file.size,
        comment,
      };
    } catch (err) {
      throw err;
    }
  }, []);

  const handleFileSelect = useCallback((file: File) => {
    if (!file.type.startsWith('image/') && 
        !file.name.toLowerCase().endsWith('.heic') && 
        !file.name.toLowerCase().endsWith('.heif')) {
      setError('Please select an image file');
      return;
    }

    // Create preview
    const preview = URL.createObjectURL(file);
    setPendingPhoto({
      file,
      preview,
      comment: '',
    });
    setError(null);
  }, []);

  const handleCameraClick = useCallback(async () => {
    // On mobile, use native camera input
    if (isMobile) {
      cameraInputRef.current?.click();
      return;
    }

    // On desktop, use webcam
    try {
      setError(null);
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user' },
        audio: false,
      });
      
      streamRef.current = stream;
      setShowCamera(true);
      
      // Wait for next tick to ensure video element is rendered
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      }, 100);
    } catch (err) {
      console.error('Camera access error:', err);
      setError('Could not access camera. Please check permissions.');
      // Fallback to file input
      cameraInputRef.current?.click();
    }
  }, [isMobile]);

  const handleCapturePhoto = useCallback(() => {
    if (!videoRef.current || !streamRef.current) return;

    const video = videoRef.current;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    ctx.drawImage(video, 0, 0);
    
    // Convert canvas to blob
    canvas.toBlob((blob) => {
      if (!blob) return;
      
      const file = new File([blob], `photo-${Date.now()}.jpg`, { type: 'image/jpeg' });
      
      // Stop camera
      streamRef.current?.getTracks().forEach(track => track.stop());
      streamRef.current = null;
      setShowCamera(false);
      
      // Show preview
      const preview = URL.createObjectURL(file);
      setPendingPhoto({
        file,
        preview,
        comment: '',
      });
    }, 'image/jpeg', 0.9);
  }, []);

  const handleTimerCapture = useCallback(() => {
    setCountdown(5);
    
    const timer = setInterval(() => {
      setCountdown(prev => {
        if (prev === null || prev <= 1) {
          clearInterval(timer);
          countdownTimerRef.current = null;
          handleCapturePhoto();
          return null;
        }
        return prev - 1;
      });
    }, 1000);
    
    countdownTimerRef.current = timer;
  }, [handleCapturePhoto]);

  const handleCancelCamera = useCallback(() => {
    if (countdownTimerRef.current) {
      clearInterval(countdownTimerRef.current);
      countdownTimerRef.current = null;
    }
    setCountdown(null);
    streamRef.current?.getTracks().forEach(track => track.stop());
    streamRef.current = null;
    setShowCamera(false);
  }, []);

  const handleGalleryClick = useCallback(() => {
    galleryInputRef.current?.click();
  }, []);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFileSelect(e.target.files[0]);
      e.target.value = ''; // Reset input
    }
  }, [handleFileSelect]);

  const handleCommentChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (pendingPhoto) {
      setPendingPhoto({ ...pendingPhoto, comment: e.target.value });
    }
  }, [pendingPhoto]);

  const handleSendPhoto = useCallback(async () => {
    if (!pendingPhoto) return;

    setIsUploading(true);
    setError(null);

    try {
      const processed = await processImage(pendingPhoto.file);
      const uploaded = await uploadPhoto(pendingPhoto.file, processed, pendingPhoto.comment);
      
      if (uploaded) {
        setUploadedPhotos(prev => [...prev, uploaded]);
        setUploadSuccess(true);
        setTimeout(() => setUploadSuccess(false), 2000);
      }

      // Clean up
      URL.revokeObjectURL(pendingPhoto.preview);
      setPendingPhoto(null);
      
      // Focus comment field after a short delay to allow UI to update
      setTimeout(() => {
        commentInputRef.current?.focus();
      }, 100);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setIsUploading(false);
    }
  }, [pendingPhoto, uploadPhoto]);

  const handleCancelPhoto = useCallback(() => {
    if (pendingPhoto) {
      URL.revokeObjectURL(pendingPhoto.preview);
      setPendingPhoto(null);
    }
  }, [pendingPhoto]);

  // Cleanup camera stream on unmount
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
      if (countdownTimerRef.current) {
        clearInterval(countdownTimerRef.current);
      }
    };
  }, []);

  const openTvView = useCallback(() => {
    window.open(`/tv/${partyId}`, '_blank');
  }, [partyId]);

  // Render Camera Tab content
  const renderCameraTab = () => (
    <>
      {!pendingPhoto && !showCamera ? (
        <>
          <Box className={styles.buttonContainer}>
            <Fab
              color="primary"
              className={styles.cameraButton}
              onClick={handleCameraClick}
              disabled={isUploading}
            >
              <CameraIcon fontSize="large" />
            </Fab>
            <Typography variant="h6" gutterBottom sx={{ color: 'text.primary', opacity: 0.7 }}>
              Take a Photo
            </Typography>
            <Typography variant="body2" color="text.secondary" gutterBottom>
              or
            </Typography>
            <Button
              variant="outlined"
              size="large"
              startIcon={<GalleryIcon />}
              onClick={handleGalleryClick}
              disabled={isUploading}
              fullWidth
              className={styles.galleryButton}
            >
              Choose from Gallery
            </Button>
          </Box>

          <Button
            variant="text"
            startIcon={<TvIcon />}
            onClick={openTvView}
            fullWidth
            className={styles.tvButton}
          >
            Open TV Display
          </Button>
        </>
      ) : showCamera ? (
        <Box className={styles.cameraContainer}>
          <Box className={styles.previewHeader}>
            <IconButton
              onClick={handleCancelCamera}
              className={styles.closeButton}
            >
              <CloseIcon />
            </IconButton>
          </Box>

          <Box className={styles.videoContainer}>
            <video
              ref={videoRef}
              autoPlay
              playsInline
              className={styles.video}
            />
            
            {countdown !== null && (
              <Box className={styles.countdownOverlay}>
                <Typography variant="h1" className={styles.countdownText}>
                  {countdown}
                </Typography>
              </Box>
            )}
          </Box>

          <Box className={styles.captureSection}>
            <IconButton
              color="primary"
              size="large"
              onClick={handleTimerCapture}
              disabled={countdown !== null}
              className={styles.timerButton}
            >
              <TimerIcon fontSize="large" />
            </IconButton>
            <Fab
              color="primary"
              size="large"
              onClick={handleCapturePhoto}
              disabled={countdown !== null}
              className={styles.captureButton}
            >
              <CameraIcon fontSize="large" />
            </Fab>
          </Box>
        </Box>
      ) : pendingPhoto ? (
        <Box className={styles.previewContainer}>
          <Box className={styles.previewHeader}>
            <IconButton
              onClick={handleCancelPhoto}
              className={styles.closeButton}
              disabled={isUploading}
            >
              <CloseIcon />
            </IconButton>
          </Box>

          <Card className={styles.previewCard}>
            <Box className={styles.polaroidImageContainer}>
              <CardMedia
                component="img"
                image={pendingPhoto.preview}
                alt="Preview"
                className={styles.previewImage}
              />
            </Box>
            <Box className={styles.polaroidCaption}>
              <TextField
                inputRef={commentInputRef}
                fullWidth
                multiline
                rows={2}
                placeholder="Add a comment (optional)..."
                value={pendingPhoto.comment}
                onChange={handleCommentChange}
                disabled={isUploading}
                className={styles.commentField}
                variant="outlined"
                size="small"
              />
              <IconButton
                color="primary"
                size="large"
                onClick={handleSendPhoto}
                disabled={isUploading}
                className={styles.sendButton}
              >
                {isUploading ? <CircularProgress size={24} /> : <SendIcon />}
              </IconButton>
            </Box>
          </Card>
        </Box>
      ) : null}
    </>
  );

  // Render Remote Tab content
  const renderRemoteTab = () => (
    <Box className={styles.remoteContainer}>
      <Typography variant="h6" gutterBottom>
        TV Remote Control
      </Typography>
      
      {tvState ? (
        <>
          <Box className={styles.remoteStatus}>
            <Typography variant="body1" sx={{ color: '#1a1a1a' }}>
              📷 Photo {tvState.currentIndex + 1} of {tvState.totalPhotos}
            </Typography>
            {tvState.uploaderName && (
              <Typography variant="body2" sx={{ color: '#1a1a1a' }}>
                by {tvState.uploaderName}
              </Typography>
            )}
            {tvState.comment && (
              <Typography variant="body2" sx={{ color: '#1a1a1a', fontStyle: 'italic' }}>
                &ldquo;{tvState.comment}&rdquo;
              </Typography>
            )}
          </Box>

          <Box className={styles.remoteControls}>
            <Fab
              color="primary"
              size="large"
              onClick={() => sendNavigationCommand('prev')}
              disabled={tvState.currentIndex === 0}
              className={styles.navButton}
            >
              <PrevIcon fontSize="large" />
            </Fab>
            
            <Fab
              color="primary"
              size="large"
              onClick={() => sendNavigationCommand('next')}
              disabled={tvState.currentIndex >= tvState.totalPhotos - 1}
              className={styles.navButton}
            >
              <NextIcon fontSize="large" />
            </Fab>
          </Box>

          {/* Fullscreen toggle switch */}
          <FormControlLabel
            control={
              <Switch
                checked={tvState.isFullscreen || false}
                onChange={sendToggleFullscreen}
                disabled={!tvState.photoUrl}
                color="secondary"
              />
            }
            label="Fullscreen on TV"
            className={styles.fullscreenSwitch}
          />
        </>
      ) : (
        <Box className={styles.remoteWaiting}>
          <CircularProgress size={40} />
          <Typography variant="body1" color="text.secondary" sx={{ mt: 2 }}>
            Connecting to TV...
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Make sure the TV view is open
          </Typography>
          <Button
            variant="outlined"
            startIcon={<TvIcon />}
            onClick={openTvView}
            sx={{ mt: 2 }}
          >
            Open TV Display
          </Button>
        </Box>
      )}
    </Box>
  );

  const renderQRTab = () => (
    <Box className={styles.remoteContainer}>
      <Typography variant="h6" gutterBottom>Share Party</Typography>
      {qrCodeUrl ? (
        <>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2, textAlign: 'center' }}>
            Scan this QR code to join the party
          </Typography>
          <Box 
            onClick={sendShowQRCommand}
            sx={{ 
              backgroundColor: 'white', 
              padding: '1rem', 
              borderRadius: '16px',
              boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              '&:hover': {
                boxShadow: '0 6px 16px rgba(0, 0, 0, 0.15)',
                transform: 'translateY(-2px)',
              },
              '&:active': {
                transform: 'translateY(0)',
              },
            }}
          >
            <img src={qrCodeUrl} alt="Party QR Code" className={styles.qrCodeImage} />
            <Typography 
              variant="body2" 
              sx={{ 
                mt: 1.5,
                textAlign: 'center',
                color: 'primary.main',
                fontWeight: 500,
              }}
            >
              Tap to show on TV
            </Typography>
          </Box>
        </>
      ) : (
        <CircularProgress />
      )}
    </Box>
  );

  return (
    <Box className={styles.pageContainer}>
      <Container maxWidth="sm" className={styles.container}>
        <Box className={styles.header}>
          {partyName && (
            <Typography variant="h6" sx={{ color: 'rgba(255, 255, 255, 0.8)', mb: 1 }}>
              🎉 {partyName}
            </Typography>
          )}
          <Typography variant="h5" component="h1" gutterBottom>
            Hi {displayName}! 👋
          </Typography>
          <Typography variant="body2" gutterBottom sx={{ color: 'rgba(255, 255, 255, 0.9)' }}>
            {uploadedPhotos.length} {uploadedPhotos.length === 1 ? 'photo' : 'photos'} shared
          </Typography>
        </Box>

        {error && (
          <Alert severity="error" onClose={() => setError(null)} className={styles.alert}>
            {error}
          </Alert>
        )}

        {uploadSuccess && (
          <Alert severity="success" className={styles.alert}>
            Photo uploaded successfully! 🎉
          </Alert>
        )}

        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handleInputChange}
          className={styles.hiddenInput}
        />

        <input
          ref={galleryInputRef}
          type="file"
          accept="image/*,.heic,.heif"
          onChange={handleInputChange}
          className={styles.hiddenInput}
        />

        <Box className={styles.tabContent}>
          {activeTab === 0 ? renderCameraTab() : activeTab === 1 ? renderRemoteTab() : renderQRTab()}
        </Box>
      </Container>

      {/* Bottom Navigation */}
      <Paper className={styles.bottomNav} elevation={3}>
        <BottomNavigation
          value={activeTab}
          onChange={(_, newValue) => {
            setActiveTab(newValue);
            const tabs = ['camera', 'remote', 'share'];
            window.history.pushState(null, '', `#${tabs[newValue]}`);
          }}
          showLabels
        >
          <BottomNavigationAction 
            label="Camera" 
            icon={<CameraIcon />} 
          />
          <BottomNavigationAction 
            label="Remote" 
            icon={<RemoteIcon />} 
          />
          <BottomNavigationAction 
            label="Share" 
            icon={<QrCodeIcon />} 
          />
        </BottomNavigation>
      </Paper>
    </Box>
  );
}
