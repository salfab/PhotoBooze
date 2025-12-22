'use client';

import { useState, useCallback, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  Container,
  Box,
  Typography,
  Alert,
  BottomNavigation,
  BottomNavigationAction,
  Paper,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
} from '@mui/material';
import {
  CameraAlt as CameraIcon,
  SettingsRemote as RemoteIcon,
  QrCode2 as QrCodeIcon,
} from '@mui/icons-material';
import CameraTab from '@/components/CameraTab';
import RemoteTab from '@/components/RemoteTab';
import ShareTab from '@/components/ShareTab';
import styles from './page.module.css';

interface UploadedPhoto {
  id: string;
  name: string;
  size: number;
  comment?: string;
}

export default function UploadPage() {
  const params = useParams();
  const router = useRouter();
  const partyId = params.partyId as string;

  const [displayName, setDisplayName] = useState<string>('');
  const [uploadedPhotos, setUploadedPhotos] = useState<UploadedPhoto[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const [activeTab, setActiveTab] = useState(0);
  const [partyName, setPartyName] = useState<string | null>(null);
  const [errorDialogOpen, setErrorDialogOpen] = useState(false);

  // Sync activeTab with URL hash
  useEffect(() => {
    const hash = window.location.hash.slice(1);
    if (hash === 'camera') setActiveTab(0);
    else if (hash === 'remote') setActiveTab(1);
    else if (hash === 'share') setActiveTab(2);
    else if (!hash) setActiveTab(0);
  }, []);

  // Get user's display name from session
  useEffect(() => {
    async function getSessionInfo() {
      try {
        const sessionRes = await fetch('/api/session');
        if (sessionRes.ok) {
          const session = await sessionRes.json();
          if (session.authenticated && session.partyId === partyId) {
            const uploaderRes = await fetch(`/api/uploaders/${session.uploaderId}`);
            if (uploaderRes.ok) {
              const uploader = await uploaderRes.json();
              setDisplayName(uploader.display_name || 'Guest');
            }
            
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

  const openTvView = useCallback(() => {
    window.open(`/tv/${partyId}`, '_blank');
  }, [partyId]);

  const handlePhotoUploaded = useCallback((photo: UploadedPhoto) => {
    setUploadedPhotos(prev => [...prev, photo]);
  }, []);

  const handleUploadSuccess = useCallback(() => {
    setUploadSuccess(true);
    setTimeout(() => setUploadSuccess(false), 2000);
  }, []);

  const renderActiveTab = () => {
    switch (activeTab) {
      case 0:
        return (
          <CameraTab
            partyId={partyId}
            onPhotoUploaded={handlePhotoUploaded}
            onError={setError}
            onUploadSuccess={handleUploadSuccess}
            isUploading={isUploading}
            setIsUploading={setIsUploading}
            openTvView={openTvView}
          />
        );
      case 1:
        return <RemoteTab partyId={partyId} openTvView={openTvView} />;
      case 2:
        return <ShareTab partyId={partyId} />;
      default:
        return null;
    }
  };

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
          <Alert 
            severity="error" 
            onClose={() => setError(null)} 
            className={styles.alert}
            onClick={() => error.length > 60 && setErrorDialogOpen(true)}
            sx={{ 
              cursor: error.length > 60 ? 'pointer' : 'default',
              '& .MuiAlert-message': {
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                maxWidth: '100%',
              }
            }}
          >
            {error.length > 60 ? `${error.substring(0, 60)}... (tap for more)` : error}
          </Alert>
        )}

        {/* Full Error Dialog */}
        <Dialog 
          open={errorDialogOpen} 
          onClose={() => setErrorDialogOpen(false)}
          maxWidth="sm"
          fullWidth
        >
          <DialogTitle>Error Details</DialogTitle>
          <DialogContent>
            <Typography sx={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
              {error}
            </Typography>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setErrorDialogOpen(false)}>Close</Button>
            <Button onClick={() => { setError(null); setErrorDialogOpen(false); }} color="error">
              Dismiss Error
            </Button>
          </DialogActions>
        </Dialog>

        {uploadSuccess && (
          <Alert severity="success" className={styles.alert}>
            Photo uploaded successfully! 🎉
          </Alert>
        )}

        <Box className={styles.tabContent}>
          {renderActiveTab()}
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
          sx={{
            background: 'transparent',
            height: '72px',
            '& .MuiBottomNavigationAction-root': {
              color: 'rgba(255, 255, 255, 0.7)',
              minWidth: '80px',
              padding: '8px 12px 10px',
              transition: 'all 0.3s ease',
              '&:hover': {
                color: 'rgba(255, 255, 255, 0.9)',
                transform: 'translateY(-2px)',
              },
              '&.Mui-selected': {
                color: '#ffffff',
                backgroundColor: 'rgba(255, 255, 255, 0.15)',
                borderRadius: '16px',
                fontWeight: 600,
                '& .MuiBottomNavigationAction-label': {
                  fontSize: '0.75rem',
                },
              },
              '& .MuiSvgIcon-root': {
                fontSize: '1.75rem',
              },
            },
          }}
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
