'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import {
  Container,
  Box,
  Typography,
  TextField,
  Button,
  Alert,
  CircularProgress,
  Card,
  CardContent,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
} from '@mui/material';
import { CameraAlt as CameraIcon } from '@mui/icons-material';
import styles from './page.module.css';

interface ConfirmationState {
  open: boolean;
  message: string;
  existingUploader: { id: string; displayName: string } | null;
}

export default function JoinPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  
  const partyId = params.partyId as string;
  
  // Store token in a ref to prevent it from being lost during re-renders
  // useSearchParams can sometimes return null during navigation/state updates
  const tokenRef = useRef<string | null>(null);
  const urlToken = searchParams.get('token');
  
  // Capture token on first render when it's available
  if (urlToken && !tokenRef.current) {
    tokenRef.current = urlToken;
  }
  
  const token = tokenRef.current || urlToken;

  const [displayName, setDisplayName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [validating, setValidating] = useState(true);
  const [partyValid, setPartyValid] = useState(false);
  const [confirmation, setConfirmation] = useState<ConfirmationState>({
    open: false,
    message: '',
    existingUploader: null,
  });

  // Validate party and token on mount
  useEffect(() => {
    async function validateParty() {
      // Check for existing session first
      try {
        const sessionRes = await fetch('/api/session');
        if (sessionRes.ok) {
          const session = await sessionRes.json();
          if (session.authenticated && session.partyId === partyId) {
            router.replace(`/upload/${partyId}`);
            return;
          }
        }
      } catch (e) {
        console.error('Session check failed', e);
      }

      if (!token) {
        setError('Invalid or missing join link');
        setValidating(false);
        return;
      }

      try {
        const response = await fetch(`/api/parties/${partyId}`);
        if (!response.ok) {
          setError('Party not found');
          setValidating(false);
          return;
        }

        const party = await response.json();
        if (party.status !== 'active') {
          setError('This party is no longer accepting guests');
          setValidating(false);
          return;
        }

        setPartyValid(true);
      } catch {
        setError('Failed to validate party');
      } finally {
        setValidating(false);
      }
    }

    validateParty();
  }, [partyId, token]);

  const handleJoin = useCallback(async (confirmTakeover: boolean = false) => {
    if (!token) {
      setError('Join token is missing. Please scan the QR code again.');
      console.error('[JoinPage] handleJoin called but token is null/undefined');
      return;
    }

    setLoading(true);
    setError(null);

    console.log('[JoinPage] Joining party', { partyId, hasToken: !!token, displayName: displayName.trim() || null, confirmTakeover });

    try {
      const response = await fetch('/api/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          partyId,
          token,
          displayName: displayName.trim() || null,
          confirm: confirmTakeover,
        }),
      });

      const data = await response.json();
      console.log('[JoinPage] Join response', { status: response.status, data });

      if (!response.ok) {
        console.error('[JoinPage] Join failed', { status: response.status, error: data.error });
        throw new Error(data.error || 'Failed to join party');
      }

      // Check if confirmation is required (name already exists)
      if (data.requiresConfirmation) {
        console.log('[JoinPage] Confirmation required for existing user', data.existingUploader);
        setConfirmation({
          open: true,
          message: data.message,
          existingUploader: data.existingUploader,
        });
        setLoading(false);
        return;
      }

      // Successfully joined - redirect to upload page
      console.log('[JoinPage] Join successful, redirecting to upload page');
      router.push(`/upload/${partyId}`);
    } catch (err) {
      console.error('[JoinPage] Join error', err);
      setError(err instanceof Error ? err.message : 'Failed to join party');
      setLoading(false);
    }
  }, [partyId, token, displayName, router]);

  const handleConfirmTakeover = useCallback(() => {
    console.log('[JoinPage] User confirmed takeover');
    setConfirmation({ open: false, message: '', existingUploader: null });
    handleJoin(true);
  }, [handleJoin]);

  const handleCancelTakeover = useCallback(() => {
    console.log('[JoinPage] User cancelled takeover');
    setConfirmation({ open: false, message: '', existingUploader: null });
    setDisplayName('');
  }, []);

  if (validating) {
    return (
      <Container maxWidth="sm" className={styles.container}>
        <Box className={styles.loadingContainer}>
          <CircularProgress />
          <Typography variant="body1" color="text.secondary">
            Validating party...
          </Typography>
        </Box>
      </Container>
    );
  }

  if (!partyValid) {
    return (
      <Container maxWidth="sm" className={styles.container}>
        <Alert severity="error" className={styles.errorAlert}>
          {error || 'Unable to join this party'}
        </Alert>
      </Container>
    );
  }

  return (
    <Container maxWidth="sm" className={styles.container}>
      <Card className={styles.card}>
        <CardContent className={styles.cardContent}>
          <Box className={styles.header}>
            <CameraIcon className={styles.icon} />
            <Typography variant="h4" component="h1" gutterBottom>
              Join the Party!
            </Typography>
            <Typography variant="body1" color="text.secondary">
              Enter your name to start sharing photos
            </Typography>
          </Box>

          {error && (
            <Alert severity="error" onClose={() => setError(null)} className={styles.alert}>
              {error}
            </Alert>
          )}

          <Box component="form" onSubmit={(e) => { e.preventDefault(); handleJoin(); }} className={styles.form}>
            <TextField
              fullWidth
              label="Your Name (optional)"
              placeholder="Enter your name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              disabled={loading}
              autoFocus
            />

            <Button
              type="submit"
              variant="contained"
              size="large"
              fullWidth
              disabled={loading}
              startIcon={loading ? <CircularProgress size={20} color="inherit" /> : <CameraIcon />}
            >
              {loading ? 'Joining...' : 'Join & Start Uploading'}
            </Button>
          </Box>
        </CardContent>
      </Card>

      {/* Confirmation dialog for existing user takeover */}
      <Dialog
        open={confirmation.open}
        onClose={handleCancelTakeover}
        aria-labelledby="confirmation-dialog-title"
        aria-describedby="confirmation-dialog-description"
      >
        <DialogTitle id="confirmation-dialog-title">
          Welcome Back!
        </DialogTitle>
        <DialogContent>
          <DialogContentText id="confirmation-dialog-description">
            {confirmation.message}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCancelTakeover} color="inherit">
            Use Different Name
          </Button>
          <Button onClick={handleConfirmTakeover} variant="contained" autoFocus>
            Continue as {confirmation.existingUploader?.displayName}
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
}
