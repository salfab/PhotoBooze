'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import {
  Box,
  Typography,
  Button,
  TextField,
  IconButton,
  Fab,
  Card,
  CardMedia,
  CircularProgress,
} from '@mui/material';
import {
  CameraAlt as CameraIcon,
  PhotoLibrary as GalleryIcon,
  Send as SendIcon,
  Close as CloseIcon,
  Tv as TvIcon,
  Timer as TimerIcon,
} from '@mui/icons-material';
import { processImage, type ProcessedImage } from '@/lib/image';
import styles from '@/app/upload/[partyId]/page.module.css';

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

interface CameraTabProps {
  partyId: string;
  onPhotoUploaded: (photo: UploadedPhoto) => void;
  onError: (error: string | null) => void;
  onUploadSuccess: () => void;
  isUploading: boolean;
  setIsUploading: (uploading: boolean) => void;
  openTvView: () => void;
}

export default function CameraTab({
  partyId,
  onPhotoUploaded,
  onError,
  onUploadSuccess,
  isUploading,
  setIsUploading,
  openTvView,
}: CameraTabProps) {
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const commentInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const countdownTimerRef = useRef<NodeJS.Timeout | null>(null);

  const [pendingPhoto, setPendingPhoto] = useState<PendingPhoto | null>(null);
  const [showCamera, setShowCamera] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [isMobile, setIsMobile] = useState(false);

  // Detect if mobile device
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent));
    };
    checkMobile();
  }, []);

  // Auto-focus comment input when photo preview loads
  useEffect(() => {
    if (pendingPhoto && commentInputRef.current) {
      setTimeout(() => {
        commentInputRef.current?.focus();
      }, 100);
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

  const uploadPhoto = useCallback(async (
    file: File,
    processed: ProcessedImage,
    comment: string
  ): Promise<UploadedPhoto | null> => {
    // Calculate sizes for detailed error reporting
    const inputFileSizeMB = (file.size / (1024 * 1024)).toFixed(2);
    const originalSizeMB = (processed.original.size / (1024 * 1024)).toFixed(2);
    const originalSizeKB = Math.round(processed.original.size / 1024);
    const tvSizeMB = processed.tv ? (processed.tv.size / (1024 * 1024)).toFixed(2) : 'N/A';
    const tvSizeKB = processed.tv ? Math.round(processed.tv.size / 1024) : 0;
    const totalFilesMB = ((processed.original.size + (processed.tv?.size || 0)) / (1024 * 1024)).toFixed(2);
    const totalFilesKB = Math.round((processed.original.size + (processed.tv?.size || 0)) / 1024);
    
    // Estimate FormData overhead (boundaries, headers, field names)
    const commentBytes = comment ? comment.length : 0;
    const estimatedOverheadBytes = 500 + commentBytes; // Conservative estimate
    const estimatedTotalKB = totalFilesKB + Math.round(estimatedOverheadBytes / 1024);
    
    console.log('🚀 Uploading photo:', {
      inputFile: `${inputFileSizeMB}MB`,
      processedOriginal: `${originalSizeMB}MB (${originalSizeKB}KB)`,
      processedTV: processed.tv ? `${tvSizeMB}MB (${tvSizeKB}KB)` : 'using same as original',
      totalFiles: `${totalFilesMB}MB (${totalFilesKB}KB)`,
      estimatedFormData: `~${estimatedTotalKB}KB`,
      useSameForTv: processed.useSameForTv,
      compressionRatio: ((file.size / processed.original.size) * 100).toFixed(1) + '%',
      analysis: processed.analysis
    });
    
    try {
      const formData = new FormData();
      formData.append('original', new Blob([processed.original], { type: processed.originalMime }), `original.${processed.originalExt}`);
      
      // Only append TV file if it's different from original
      if (!processed.useSameForTv && processed.tv) {
        formData.append('tv', new Blob([processed.tv], { type: processed.tvMime }), 'tv.jpg');
      }
      
      formData.append('originalMime', processed.originalMime);
      formData.append('originalExt', processed.originalExt);
      formData.append('useSameForTv', processed.useSameForTv.toString()); // New flag for server
      
      if (comment) {
        formData.append('comment', comment);
      }

      const response = await fetch('/api/photos', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        // Special handling for 413 Payload Too Large
        if (response.status === 413) {
          console.error('❌ 413 Upload failed - sizes:', {
            inputFile: `${inputFileSizeMB}MB`,
            processedOriginal: `${originalSizeMB}MB (${originalSizeKB}KB)`,
            processedTV: processed.tv ? `${tvSizeMB}MB (${tvSizeKB}KB)` : 'N/A',
            totalFiles: `${totalFilesMB}MB (${totalFilesKB}KB)`,
            estimatedFormData: `~${estimatedTotalKB}KB`
          });
          
          throw new Error(
            `Upload failed: Request too large (413). ` +
            `Input: ${inputFileSizeMB}MB → Processed: ${originalSizeMB}MB original` +
            (processed.tv && !processed.useSameForTv ? ` + ${tvSizeMB}MB TV` : '') +
            ` = ${totalFilesMB}MB total files (est. ${estimatedTotalKB}KB with FormData overhead). ` +
            `Server limit appears to be ~4.3MB. Try a lower resolution image.`
          );
        }
        
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
      onError('Please select an image file');
      return;
    }

    const preview = URL.createObjectURL(file);
    setPendingPhoto({
      file,
      preview,
      comment: '',
    });
    onError(null);
  }, [onError]);

  const handleCameraClick = useCallback(async () => {
    if (isMobile) {
      cameraInputRef.current?.click();
      return;
    }

    try {
      onError(null);
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user' },
        audio: false,
      });
      
      streamRef.current = stream;
      setShowCamera(true);
      
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      }, 100);
    } catch (err) {
      console.error('Camera access error:', err);
      onError('Could not access camera. Please check permissions.');
      cameraInputRef.current?.click();
    }
  }, [isMobile, onError]);

  const handleCapturePhoto = useCallback(() => {
    if (!videoRef.current || !streamRef.current) return;

    const video = videoRef.current;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    ctx.drawImage(video, 0, 0);
    
    canvas.toBlob((blob) => {
      if (!blob) return;
      
      const file = new File([blob], `photo-${Date.now()}.jpg`, { type: 'image/jpeg' });
      
      streamRef.current?.getTracks().forEach(track => track.stop());
      streamRef.current = null;
      setShowCamera(false);
      
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
      e.target.value = '';
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
    onError(null);

    try {
      const processed = await processImage(pendingPhoto.file);
      const uploaded = await uploadPhoto(pendingPhoto.file, processed, pendingPhoto.comment);
      
      if (uploaded) {
        onPhotoUploaded(uploaded);
        onUploadSuccess();
      }

      URL.revokeObjectURL(pendingPhoto.preview);
      setPendingPhoto(null);
      
      setTimeout(() => {
        commentInputRef.current?.focus();
      }, 100);
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setIsUploading(false);
    }
  }, [pendingPhoto, uploadPhoto, onPhotoUploaded, onUploadSuccess, onError, setIsUploading]);

  const handleCancelPhoto = useCallback(() => {
    if (pendingPhoto) {
      URL.revokeObjectURL(pendingPhoto.preview);
      setPendingPhoto(null);
    }
  }, [pendingPhoto]);

  if (showCamera) {
    return (
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
    );
  }

  if (pendingPhoto) {
    return (
      <Box className={styles.previewContainer}>
        <Card className={styles.previewCard} sx={{ borderRadius: 0 }}>
          <Box className={styles.previewHeader}>
            <IconButton
              onClick={handleCancelPhoto}
              className={styles.closeButton}
              disabled={isUploading}
            >
              <CloseIcon />
            </IconButton>
          </Box>
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
      </Box>
    );
  }

  return (
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
    </>
  );
}
