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
  LinearProgress,
  Card,
  CardContent,
  Stack,
  Chip,
} from '@mui/material';
import {
  CameraAlt as CameraIcon,
  CloudUpload as UploadIcon,
  CheckCircle as SuccessIcon,
  Tv as TvIcon,
} from '@mui/icons-material';
import { processImage, type ProcessedImage } from '@/lib/image';
import styles from './page.module.css';

interface UploadedPhoto {
  id: string;
  name: string;
  size: number;
}

interface UploadProgress {
  fileName: string;
  status: 'processing' | 'uploading' | 'done' | 'error';
  progress: number;
  error?: string;
}

export default function UploadPage() {
  const params = useParams();
  const router = useRouter();
  const partyId = params.partyId as string;
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [uploads, setUploads] = useState<UploadProgress[]>([]);
  const [uploadedPhotos, setUploadedPhotos] = useState<UploadedPhoto[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  // Check if user has session for this party
  useEffect(() => {
    async function checkSession() {
      try {
        const response = await fetch(`/api/parties/${partyId}`);
        if (!response.ok) {
          router.push('/');
        }
      } catch {
        router.push('/');
      }
    }
    checkSession();
  }, [partyId, router]);

  const uploadPhoto = useCallback(async (
    file: File,
    processed: ProcessedImage,
    index: number
  ): Promise<UploadedPhoto | null> => {
    // Update to uploading status
    setUploads(prev => prev.map((u, i) => 
      i === index ? { ...u, status: 'uploading', progress: 50 } : u
    ));

    try {
      const formData = new FormData();
      formData.append('original', new Blob([processed.original], { type: processed.originalMime }), `original.${processed.originalExt}`);
      formData.append('tv', new Blob([processed.tv], { type: processed.tvMime }), 'tv.jpg');
      formData.append('originalMime', processed.originalMime);
      formData.append('originalExt', processed.originalExt);

      const response = await fetch('/api/photos', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Upload failed');
      }

      const result = await response.json();

      // Update to done status
      setUploads(prev => prev.map((u, i) => 
        i === index ? { ...u, status: 'done', progress: 100 } : u
      ));

      return {
        id: result.id,
        name: file.name,
        size: file.size,
      };
    } catch (err) {
      setUploads(prev => prev.map((u, i) => 
        i === index ? { 
          ...u, 
          status: 'error', 
          error: err instanceof Error ? err.message : 'Upload failed' 
        } : u
      ));
      return null;
    }
  }, []);

  const handleFiles = useCallback(async (files: FileList) => {
    const fileArray = Array.from(files).filter(f => 
      f.type.startsWith('image/') || 
      f.name.toLowerCase().endsWith('.heic') || 
      f.name.toLowerCase().endsWith('.heif')
    );

    if (fileArray.length === 0) {
      setError('Please select image files');
      return;
    }

    setError(null);
    setIsUploading(true);

    // Initialize upload progress for all files
    const initialProgress: UploadProgress[] = fileArray.map(f => ({
      fileName: f.name,
      status: 'processing',
      progress: 0,
    }));
    setUploads(prev => [...prev, ...initialProgress]);
    const baseIndex = uploads.length;

    // Process and upload each file
    for (let i = 0; i < fileArray.length; i++) {
      const file = fileArray[i];
      const index = baseIndex + i;

      try {
        // Process image (HEIC conversion + TV resize)
        setUploads(prev => prev.map((u, j) => 
          j === index ? { ...u, progress: 25 } : u
        ));

        const processed = await processImage(file);

        // Upload
        const uploaded = await uploadPhoto(file, processed, index);
        if (uploaded) {
          setUploadedPhotos(prev => [...prev, uploaded]);
        }
      } catch (err) {
        setUploads(prev => prev.map((u, j) => 
          j === index ? { 
            ...u, 
            status: 'error', 
            error: err instanceof Error ? err.message : 'Processing failed' 
          } : u
        ));
      }
    }

    setIsUploading(false);
  }, [uploads.length, uploadPhoto]);

  const handleFileSelect = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFiles(e.target.files);
      e.target.value = ''; // Reset input
    }
  }, [handleFiles]);

  const openTvView = useCallback(() => {
    window.open(`/tv/${partyId}`, '_blank');
  }, [partyId]);

  return (
    <Container maxWidth="sm" className={styles.container}>
      <Box className={styles.header}>
        <CameraIcon className={styles.icon} />
        <Typography variant="h4" component="h1" gutterBottom>
          Upload Photos
        </Typography>
        <Chip 
          label={`${uploadedPhotos.length} uploaded`} 
          color="primary" 
          size="small" 
        />
      </Box>

      {error && (
        <Alert severity="error" onClose={() => setError(null)} className={styles.alert}>
          {error}
        </Alert>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,.heic,.heif"
        multiple
        onChange={handleInputChange}
        className={styles.hiddenInput}
      />

      <Box 
        className={styles.uploadArea}
        onClick={handleFileSelect}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === 'Enter' && handleFileSelect()}
      >
        <UploadIcon className={styles.uploadIcon} />
        <Typography variant="h6" gutterBottom>
          Tap to select photos
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Supports JPEG, PNG, WebP, HEIC
        </Typography>
      </Box>

      <Button
        variant="outlined"
        startIcon={<TvIcon />}
        onClick={openTvView}
        fullWidth
        className={styles.tvButton}
      >
        Open TV Display
      </Button>

      {uploads.length > 0 && (
        <Stack spacing={2} className={styles.uploadList}>
          {uploads.map((upload, index) => (
            <Card key={index} className={styles.uploadCard}>
              <CardContent className={styles.uploadCardContent}>
                <Box className={styles.uploadInfo}>
                  <Typography variant="body2" noWrap className={styles.fileName}>
                    {upload.fileName}
                  </Typography>
                  {upload.status === 'done' && (
                    <SuccessIcon color="success" fontSize="small" />
                  )}
                  {upload.status === 'error' && (
                    <Typography variant="caption" color="error">
                      {upload.error}
                    </Typography>
                  )}
                </Box>
                {(upload.status === 'processing' || upload.status === 'uploading') && (
                  <Box className={styles.progressContainer}>
                    <LinearProgress 
                      variant="determinate" 
                      value={upload.progress} 
                      className={styles.progress}
                    />
                    <Typography variant="caption" color="text.secondary">
                      {upload.status === 'processing' ? 'Processing...' : 'Uploading...'}
                    </Typography>
                  </Box>
                )}
              </CardContent>
            </Card>
          ))}
        </Stack>
      )}

      {isUploading && (
        <Box className={styles.loadingOverlay}>
          <CircularProgress />
        </Box>
      )}
    </Container>
  );
}
