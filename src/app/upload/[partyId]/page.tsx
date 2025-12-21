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
} from '@mui/icons-material';
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
}

export default function UploadPage() {
  const params = useParams();
  const router = useRouter();
  const partyId = params.partyId as string;
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

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
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const countdownTimerRef = useRef<NodeJS.Timeout | null>(null);
  const supabaseRef = useRef(createClient());

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
    const channel = supabase.channel(`tv-state:${partyId}`);

    channel
      .on('broadcast', { event: 'state' }, ({ payload }) => {
        setTvState(payload as TVState);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [partyId, activeTab]);

  // Send navigation command to TV
  const sendNavigationCommand = useCallback((action: 'prev' | 'next') => {
    const supabase = supabaseRef.current;
    const channel = supabase.channel(`tv-control:${partyId}`);
    
    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        channel.send({
          type: 'broadcast',
          event: 'navigate',
          payload: { action },
        });
        // Unsubscribe after sending
        setTimeout(() => {
          supabase.removeChannel(channel);
        }, 100);
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
            <Typography variant="h6" gutterBottom>
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
            <CardMedia
              component="img"
              image={pendingPhoto.preview}
              alt="Preview"
              className={styles.previewImage}
            />
          </Card>

          <Box className={styles.commentSection}>
            <TextField
              fullWidth
              multiline
              rows={2}
              placeholder="Add a comment (optional)..."
              value={pendingPhoto.comment}
              onChange={handleCommentChange}
              disabled={isUploading}
              className={styles.commentField}
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
            <Typography variant="body1" color="text.secondary">
              📷 Photo {tvState.currentIndex + 1} of {tvState.totalPhotos}
            </Typography>
            {tvState.uploaderName && (
              <Typography variant="body2" color="text.secondary">
                by {tvState.uploaderName}
              </Typography>
            )}
            {tvState.comment && (
              <Typography variant="body2" color="text.secondary" fontStyle="italic">
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

  return (
    <Box className={styles.pageContainer}>
      <Container maxWidth="sm" className={styles.container}>
        <Box className={styles.header}>
          <Typography variant="h5" component="h1" gutterBottom>
            Hi {displayName}! 👋
          </Typography>
          <Typography variant="body2" color="text.secondary" gutterBottom>
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
          {activeTab === 0 ? renderCameraTab() : renderRemoteTab()}
        </Box>
      </Container>

      {/* Bottom Navigation */}
      <Paper className={styles.bottomNav} elevation={3}>
        <BottomNavigation
          value={activeTab}
          onChange={(_, newValue) => setActiveTab(newValue)}
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
        </BottomNavigation>
      </Paper>
    </Box>
  );
}
