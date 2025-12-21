'use client';

import { useState, useEffect, useCallback } from 'react';
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
} from '@mui/material';
import { CameraAlt as CameraIcon } from '@mui/icons-material';
import styles from './page.module.css';

export default function JoinPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  
  const partyId = params.partyId as string;
  const token = searchParams.get('token');

  const [displayName, setDisplayName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [validating, setValidating] = useState(true);
  const [partyValid, setPartyValid] = useState(false);

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

  const handleJoin = useCallback(async () => {
    if (!token) return;

    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          partyId,
          token,
          displayName: displayName.trim() || null,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to join party');
      }

      // Redirect to upload page
      router.push(`/upload/${partyId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to join party');
    } finally {
      setLoading(false);
    }
  }, [partyId, token, displayName, router]);

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
    </Container>
  );
}
