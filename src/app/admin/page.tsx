'use client';

import { useState, useCallback, useEffect } from 'react';
import {
  Container,
  Box,
  Typography,
  Button,
  Card,
  CardContent,
  Alert,
  CircularProgress,
  Stack,
  Chip,
  IconButton,
  Tooltip,
  Fab,
} from '@mui/material';
import {
  Add as AddIcon,
  QrCode2 as QrCodeIcon,
  Tv as TvIcon,
  Download as DownloadIcon,
  Delete as DeleteIcon,
  Stop as StopIcon,
} from '@mui/icons-material';
import QRCode from 'qrcode';
import styles from './page.module.css';

interface Party {
  id: string;
  name?: string | null;
  status: 'active' | 'closed';
  createdAt: string;
  joinToken?: string;
  photoCount?: number;
  uploaderCount?: number;
}

export default function AdminPage() {
  const [parties, setParties] = useState<Party[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [qrDataUrls, setQrDataUrls] = useState<Record<string, string>>({});

  const loadParties = useCallback(async () => {
    try {
      const response = await fetch('/api/parties');
      
      if (!response.ok) {
        throw new Error('Failed to load parties');
      }

      const data: Party[] = await response.json();
      setParties(data);

      // Generate QR codes for all parties
      const qrCodes: Record<string, string> = {};
      for (const party of data) {
        if (party.joinToken) {
          const joinUrl = `${window.location.origin}/join/${party.id}?token=${party.joinToken}`;
          const qrDataUrl = await QRCode.toDataURL(joinUrl, {
            width: 300,
            margin: 2,
            color: {
              dark: '#000000',
              light: '#ffffff',
            },
          });
          qrCodes[party.id] = qrDataUrl;
        }
      }
      setQrDataUrls(qrCodes);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load parties');
    }
  }, []);

  // Load existing parties on mount
  useEffect(() => {
    loadParties();
  }, [loadParties]);

  const createParty = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/parties', {
        method: 'POST',
      });

      if (!response.ok) {
        throw new Error('Failed to create party');
      }

      const party: Party & { joinToken: string } = await response.json();
      
      // Generate QR code for the join URL
      const joinUrl = `${window.location.origin}/join/${party.id}?token=${party.joinToken}`;
      const qrDataUrl = await QRCode.toDataURL(joinUrl, {
        width: 300,
        margin: 2,
        color: {
          dark: '#000000',
          light: '#ffffff',
        },
      });

      setQrDataUrls(prev => ({ ...prev, [party.id]: qrDataUrl }));
      setParties(prev => [{ ...party, photoCount: 0, uploaderCount: 0 }, ...prev]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create party');
    } finally {
      setLoading(false);
    }
  }, []);

  const closeParty = useCallback(async (partyId: string) => {
    try {
      const response = await fetch(`/api/parties/${partyId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'closed' }),
      });

      if (!response.ok) {
        throw new Error('Failed to close party');
      }

      setParties(prev =>
        prev.map(p => (p.id === partyId ? { ...p, status: 'closed' } : p))
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to close party');
    }
  }, []);

  const deleteParty = useCallback(async (partyId: string) => {
    if (!confirm('Are you sure you want to delete this party and all its photos?')) {
      return;
    }

    try {
      const response = await fetch(`/api/parties/${partyId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error('Failed to delete party');
      }

      setParties(prev => prev.filter(p => p.id !== partyId));
      setQrDataUrls(prev => {
        const next = { ...prev };
        delete next[partyId];
        return next;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete party');
    }
  }, []);

  const openTvView = useCallback((partyId: string) => {
    window.open(`/tv/${partyId}`, '_blank');
  }, []);

  const downloadPhotos = useCallback((partyId: string) => {
    window.open(`/api/parties/${partyId}/download`, '_blank');
  }, []);

  return (
    <Container maxWidth="md" className={styles.container}>
      <Box className={styles.header}>
        <Typography variant="h4" component="h1" gutterBottom>
          PhotoBooze Admin
        </Typography>
        <Typography variant="body1" color="text.secondary" gutterBottom>
          Create and manage party photo sessions
        </Typography>
      </Box>

      {error && (
        <Alert severity="error" onClose={() => setError(null)} className={styles.alert}>
          {error}
        </Alert>
      )}

      <Stack spacing={3} className={styles.partyList}>
        {parties.map(party => (
          <Card key={party.id} className={styles.partyCard}>
            <CardContent>
              <Box className={styles.partyHeader}>
                <Box>
                  <Typography variant="h6" component="h2">
                    {party.name || `Party ${party.id.slice(0, 8)}...`}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Created {new Date(party.createdAt).toLocaleString()}
                  </Typography>
                </Box>
                <Chip
                  label={party.status}
                  color={party.status === 'active' ? 'success' : 'default'}
                  size="small"
                />
              </Box>

              <Box className={styles.stats}>
                <Typography variant="body2">
                  📷 {party.photoCount ?? 0} photos
                </Typography>
                <Typography variant="body2">
                  👥 {party.uploaderCount ?? 0} guests
                </Typography>
              </Box>

              {qrDataUrls[party.id] ? (
                <Box className={styles.qrContainer}>
                  <a
                    href={`/join/${party.id}?token=${party.joinToken}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    title="Click to open join page"
                  >
                    <img
                      src={qrDataUrls[party.id]}
                      alt={`QR code for ${party.name || `party ${party.id.slice(0, 8)}`}`}
                      className={styles.qrCode}
                    />
                  </a>
                  <Typography variant="caption" color="text.secondary">
                    Guests scan this QR code to join
                  </Typography>
                </Box>
              ) : (
                <Box className={styles.qrContainer}>
                  <Button
                    variant="outlined"
                    size="small"
                    startIcon={<QrCodeIcon />}
                    onClick={async () => {
                      // Regenerate join token
                      try {
                        const response = await fetch(`/api/parties/${party.id}/regenerate-token`, {
                          method: 'POST',
                        });
                        if (response.ok) {
                          const { joinToken } = await response.json();
                          const joinUrl = `${window.location.origin}/join/${party.id}?token=${joinToken}`;
                          const qrDataUrl = await QRCode.toDataURL(joinUrl, {
                            width: 300,
                            margin: 2,
                            color: {
                              dark: '#000000',
                              light: '#ffffff',
                            },
                          });
                          setQrDataUrls(prev => ({ ...prev, [party.id]: qrDataUrl }));
                          setParties(prev =>
                            prev.map(p => (p.id === party.id ? { ...p, joinToken } : p))
                          );
                        }
                      } catch (err) {
                        setError('Failed to generate QR code');
                      }
                    }}
                  >
                    Generate QR Code
                  </Button>
                  <Typography variant="caption" color="text.secondary">
                    Create a new join link for this party
                  </Typography>
                </Box>
              )}

              <Box className={styles.actions}>
                <Tooltip title="Open TV Display">
                  <IconButton onClick={() => openTvView(party.id)} color="primary">
                    <TvIcon />
                  </IconButton>
                </Tooltip>

                <Tooltip title="Show QR Code">
                  <IconButton color="primary">
                    <QrCodeIcon />
                  </IconButton>
                </Tooltip>

                {party.status === 'active' && (
                  <Tooltip title="Close Party">
                    <IconButton onClick={() => closeParty(party.id)} color="warning">
                      <StopIcon />
                    </IconButton>
                  </Tooltip>
                )}

                <Tooltip title="Download All Photos">
                  <IconButton onClick={() => downloadPhotos(party.id)} color="primary">
                    <DownloadIcon />
                  </IconButton>
                </Tooltip>

                <Tooltip title="Delete Party">
                  <IconButton onClick={() => deleteParty(party.id)} color="error">
                    <DeleteIcon />
                  </IconButton>
                </Tooltip>
              </Box>
            </CardContent>
          </Card>
        ))}

        {parties.length === 0 && (
          <Box className={styles.emptyState}>
            <Typography variant="body1" color="text.secondary">
              No parties yet. Create one to get started!
            </Typography>
          </Box>
        )}
      </Stack>

      <Fab
        color="primary"
        aria-label="create party"
        onClick={createParty}
        disabled={loading}
        className={styles.fab}
        size="large"
      >
        {loading ? <CircularProgress size={24} color="inherit" /> : <AddIcon />}
      </Fab>
    </Container>
  );
}
