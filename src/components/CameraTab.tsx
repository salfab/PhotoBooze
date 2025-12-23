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
import { createClient } from '@/lib/supabase/client';
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
  const [uploadProgress, setUploadProgress] = useState<number>(0);

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
    const inputFileSizeMB = (file.size / (1024 * 1024)).toFixed(2);
    const originalSizeMB = (processed.original.size / (1024 * 1024)).toFixed(2);
    const tvSizeMB = processed.tv ? (processed.tv.size / (1024 * 1024)).toFixed(2) : 'N/A';
    
    console.log('🚀 Starting direct upload:', {
      inputFile: `${inputFileSizeMB}MB`,
      processedOriginal: `${originalSizeMB}MB`,
      processedTV: processed.tv ? `${tvSizeMB}MB` : 'using same as original',
      useSameForTv: processed.useSameForTv,
      compressionRatio: ((file.size / processed.original.size) * 100).toFixed(1) + '%',
      analysis: processed.analysis
    });
    
    try {
      setUploadProgress(5);
      
      // Step 1: Get signed upload URLs
      const prepareResponse = await fetch('/api/photos/prepare-upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          originalExt: processed.originalExt,
          createTvVersion: !processed.useSameForTv && !!processed.tv
        })
      });

      if (!prepareResponse.ok) {
        const data = await prepareResponse.json();
        throw new Error(data.error || 'Failed to prepare upload');
      }

      const uploadMeta = await prepareResponse.json();
      console.log('✅ Upload URLs prepared:', uploadMeta.photoId);
      
      setUploadProgress(10);

      // Step 2: Upload original to Supabase Storage using signed URL
      console.log('📤 Uploading original...');
      const originalUpload = await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) {
            const percentOriginal = Math.round((e.loaded / e.total) * 40); // 10-50%
            setUploadProgress(10 + percentOriginal);
          }
        };
        
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve();
          } else {
            reject(new Error(`Original upload failed: ${xhr.status} ${xhr.statusText}`));
          }
        };
        
        xhr.onerror = () => reject(new Error('Network error uploading original'));
        
        xhr.open('PUT', uploadMeta.originalSignedUrl);
        xhr.setRequestHeader('Content-Type', processed.originalMime);
        xhr.send(processed.original);
      });

      console.log('✅ Original uploaded');
      setUploadProgress(50);

      // Step 3: Upload TV version (if separate)
      if (!processed.useSameForTv && processed.tv && uploadMeta.tvSignedUrl) {
        console.log('📤 Uploading TV version...');
        await new Promise<void>((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          
          xhr.upload.onprogress = (e) => {
            if (e.lengthComputable) {
              const percentTv = Math.round((e.loaded / e.total) * 30); // 50-80%
              setUploadProgress(50 + percentTv);
            }
          };
          
          xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) {
              resolve();
            } else {
              reject(new Error(`TV upload failed: ${xhr.status} ${xhr.statusText}`));
            }
          };
          
          xhr.onerror = () => reject(new Error('Network error uploading TV version'));
          
          xhr.open('PUT', uploadMeta.tvSignedUrl);
          xhr.setRequestHeader('Content-Type', 'image/jpeg');
          xhr.send(processed.tv);
        });
        
        console.log('✅ TV version uploaded');
      }
      
      setUploadProgress(80);

      // Step 4: Create database record using Supabase client
      console.log('💾 Creating database record...');
      const supabase = createClient();
      
      const { data: photo, error: dbError } = await supabase
        .from('photos')
        .insert({
          id: uploadMeta.photoId,
          party_id: uploadMeta.partyId,
          uploader_id: uploadMeta.uploaderId,
          original_path: uploadMeta.originalPath,
          tv_path: uploadMeta.tvPath || uploadMeta.originalPath, // Use original if no separate TV
          original_mime: processed.originalMime,
          tv_mime: 'image/jpeg',
          original_bytes: processed.original.size,
          tv_bytes: processed.tv?.size || processed.original.size,
          comment: comment || null,
        })
        .select('id, created_at')
        .single();

      if (dbError || !photo) {
        console.error('❌ Database insert failed:', dbError);
        throw new Error(dbError?.message || 'Failed to save photo record');
      }

      console.log('✅ Upload complete:', photo.id);
      setUploadProgress(100);

      return {
        id: photo.id,
        name: file.name,
        size: file.size,
        comment,
      };
    } catch (err) {
      console.error('❌ Upload failed:', err);
      throw err;
    } finally {
      // Reset progress after a short delay
      setTimeout(() => setUploadProgress(0), 500);
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
              {isUploading ? (
                <Box sx={{ position: 'relative', display: 'inline-flex' }}>
                  <CircularProgress 
                    variant={uploadProgress > 0 ? "determinate" : "indeterminate"}
                    value={uploadProgress}
                    size={24}
                  />
                  {uploadProgress > 0 && (
                    <Box
                      sx={{
                        top: 0,
                        left: 0,
                        bottom: 0,
                        right: 0,
                        position: 'absolute',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Typography
                        variant="caption"
                        component="div"
                        color="text.secondary"
                        sx={{ fontSize: '8px' }}
                      >
                        {`${Math.round(uploadProgress)}%`}
                      </Typography>
                    </Box>
                  )}
                </Box>
              ) : (
                <SendIcon />
              )}
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
