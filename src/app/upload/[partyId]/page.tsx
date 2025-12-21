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
  Dialog,
  DialogContent,
} from '@mui/material';
import {
  CameraAlt as CameraIcon,
  PhotoLibrary as GalleryIcon,
  Send as SendIcon,
  Close as CloseIcon,
  Tv as TvIcon,
} from '@mui/icons-material';
import { processImage, type ProcessedImage } from '@/lib/image';
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

  const handleCameraClick = useCallback(() => {
    cameraInputRef.current?.click();
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

  const openTvView = useCallback(() => {
    window.open(`/tv/${partyId}`, '_blank');
  }, [partyId]);

  return (
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

      {!pendingPhoto && (
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
      )}

      {/* Photo preview and comment dialog */}
      <Dialog
        open={!!pendingPhoto}
        onClose={handleCancelPhoto}
        maxWidth="sm"
        fullWidth
        className={styles.photoDialog}
      >
        <DialogContent className={styles.dialogContent}>
          {pendingPhoto && (
            <>
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
            </>
          )}
        </DialogContent>
      </Dialog>
    </Container>
  );
}
