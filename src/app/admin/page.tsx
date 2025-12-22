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
  TextField,
  Skeleton,
  Switch,
} from '@mui/material';
import {
  Add as AddIcon,
  QrCode2 as QrCodeIcon,
  Tv as TvIcon,
  Download as DownloadIcon,
  Delete as DeleteIcon,
  Stop as StopIcon,
  Edit as EditIcon,
  Check as CheckIcon,
  Close as CloseIcon,
  EmojiEvents as TrophyIcon,
  Lock as LockIcon,
  LockOpen as LockOpenIcon,
} from '@mui/icons-material';
import QRCode from 'qrcode';
import styles from './page.module.css';
import PartyStatsModal from '@/components/PartyStatsModal';
import PinEntryModal from '@/components/PinEntryModal';

interface Party {
  id: string;
  name?: string | null;
  status: 'active' | 'closed';
  createdAt: string;
  joinToken?: string;
  photoCount?: number;
  uploaderCount?: number;
  countdownTarget?: string | null;
  requiresPin?: boolean;
}

export default function AdminPage() {
  const [parties, setParties] = useState<Party[]>([]);
  const [loading, setLoading] = useState(false);
  const [isLoadingParties, setIsLoadingParties] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [qrDataUrls, setQrDataUrls] = useState<Record<string, string>>({});
  const [editingPartyId, setEditingPartyId] = useState<string | null>(null);
  const [editedName, setEditedName] = useState<string>('');
  const [statsModalParty, setStatsModalParty] = useState<Party | null>(null);
  const [pinModal, setPinModal] = useState<{ open: boolean; partyId: string | null; mode: 'set' | 'verify' | 'remove' }>({ open: false, partyId: null, mode: 'verify' });
  const [pinError, setPinError] = useState<string>('');
  const [pendingQrGeneration, setPendingQrGeneration] = useState<string | null>(null);

  const loadParties = useCallback(async () => {
    try {
      setIsLoadingParties(true);
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
    } finally {
      setIsLoadingParties(false);
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

  const updatePartyName = useCallback(async (partyId: string, newName: string) => {
    try {
      const response = await fetch(`/api/parties/${partyId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to update party name');
      }

      const updatedParty = await response.json();
      setParties(prev =>
        prev.map(p => (p.id === partyId ? { ...p, name: updatedParty.name } : p))
      );
      setEditingPartyId(null);
      setEditedName('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update party name');
    }
  }, []);

  const toggleCountdown = useCallback(async (partyId: string, currentTarget: string | null | undefined) => {
    try {
      // If currently set, clear it. Otherwise set to next midnight.
      let countdownTarget: string | null = null;
      if (!currentTarget) {
        // Calculate next midnight (start of next day)
        const now = new Date();
        const midnight = new Date(now);
        midnight.setHours(24, 0, 0, 0); // Next midnight
        countdownTarget = midnight.toISOString();
      }

      const response = await fetch(`/api/parties/${partyId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ countdownTarget }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to toggle countdown');
      }

      const updatedParty = await response.json();
      setParties(prev =>
        prev.map(p => (p.id === partyId ? { ...p, countdownTarget: updatedParty.countdownTarget } : p))
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to toggle countdown');
    }
  }, []);

  const startEditingName = useCallback((party: Party) => {
    setEditingPartyId(party.id);
    setEditedName(party.name || '');
  }, []);

  const cancelEditingName = useCallback(() => {
    setEditingPartyId(null);
    setEditedName('');
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

  const generateQrCode = useCallback(async (partyId: string, pin?: string) => {
    try {
      const response = await fetch(`/api/parties/${partyId}/regenerate-token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: pin ? JSON.stringify({ pin }) : undefined,
      });

      if (response.status === 422) {
        const data = await response.json();
        if (data.code === 'MISSING_PIN') {
          // PIN required - show PIN entry modal
          setPendingQrGeneration(partyId);
          setPinModal({ open: true, partyId, mode: 'verify' });
          setPinError('');
          return;
        }
      }

      if (response.status === 403) {
        const data = await response.json();
        if (data.code === 'INVALID_PIN') {
          setPinError('Invalid PIN. Please try again.');
          return;
        }
      }

      if (!response.ok) {
        throw new Error('Failed to generate QR code');
      }

      const { joinToken } = await response.json();
      const joinUrl = `${window.location.origin}/join/${partyId}?token=${joinToken}`;
      const qrDataUrl = await QRCode.toDataURL(joinUrl, {
        width: 300,
        margin: 2,
        color: {
          dark: '#000000',
          light: '#ffffff',
        },
      });

      setQrDataUrls(prev => ({ ...prev, [partyId]: qrDataUrl }));
      setParties(prev =>
        prev.map(p => (p.id === partyId ? { ...p, joinToken } : p))
      );

      // Close PIN modal on success
      setPinModal({ open: false, partyId: null, mode: 'verify' });
      setPendingQrGeneration(null);
      setPinError('');
    } catch (err) {
      setError('Failed to generate QR code');
    }
  }, []);

  const handlePinSubmit = useCallback(async (pin: string) => {
    if (!pinModal.partyId) return;

    if (pinModal.mode === 'set') {
      // Set PIN for party
      try {
        const response = await fetch(`/api/parties/${pinModal.partyId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pin }),
        });

        if (!response.ok) {
          const data = await response.json();
          setPinError(data.error || 'Failed to set PIN');
          return;
        }

        const updatedParty = await response.json();
        setParties(prev =>
          prev.map(p => (p.id === pinModal.partyId ? { ...p, requiresPin: updatedParty.requiresPin } : p))
        );
        setPinModal({ open: false, partyId: null, mode: 'verify' });
        setPinError('');
      } catch (err) {
        setPinError('Failed to set PIN');
      }
    } else if (pinModal.mode === 'remove') {
      // Remove PIN from party
      try {
        const response = await fetch(`/api/parties/${pinModal.partyId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pin: null, currentPin: pin }),
        });

        if (response.status === 403) {
          const data = await response.json();
          if (data.code === 'INVALID_PIN') {
            setPinError('Invalid PIN. Please try again.');
            return;
          }
        }

        if (!response.ok) {
          const data = await response.json();
          setPinError(data.error || 'Failed to remove PIN');
          return;
        }

        const updatedParty = await response.json();
        setParties(prev =>
          prev.map(p => (p.id === pinModal.partyId ? { ...p, requiresPin: updatedParty.requiresPin } : p))
        );
        setPinModal({ open: false, partyId: null, mode: 'verify' });
        setPinError('');
      } catch (err) {
        setPinError('Failed to remove PIN');
      }
    } else if (pinModal.mode === 'verify') {
      // Verify PIN for QR code generation
      if (pendingQrGeneration) {
        await generateQrCode(pendingQrGeneration, pin);
      }
    }
  }, [pinModal, pendingQrGeneration, generateQrCode]);

  const togglePinProtection = useCallback((partyId: string, currentlyHasPin: boolean) => {
    if (currentlyHasPin) {
      // Remove PIN
      setPinModal({ open: true, partyId, mode: 'remove' });
      setPinError('');
    } else {
      // Set PIN
      setPinModal({ open: true, partyId, mode: 'set' });
      setPinError('');
    }
  }, []);

  return (
    <Container maxWidth="md" className={styles.container}>
      <Box className={styles.header}>
        <Box sx={{ display: 'flex', justifyContent: 'center', mb: 3 }}>
          <Box
            component="img"
            src="/logo.png"
            alt="PhotoBooze"
            sx={{ height: 120, width: 'auto' }}
          />
        </Box>
        <Typography variant="h4" component="h1" gutterBottom sx={{ textAlign: 'center' }}>
          The Lobby
        </Typography>
        <Typography variant="body1" color="text.secondary" gutterBottom sx={{ textAlign: 'center' }}>
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
                <Box sx={{ flex: 1 }}>
                  {editingPartyId === party.id ? (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <TextField
                        value={editedName}
                        onChange={(e) => setEditedName(e.target.value)}
                        size="small"
                        autoFocus
                        fullWidth
                        placeholder="Enter party name"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            updatePartyName(party.id, editedName);
                          } else if (e.key === 'Escape') {
                            cancelEditingName();
                          }
                        }}
                      />
                      <IconButton
                        size="small"
                        onClick={() => updatePartyName(party.id, editedName)}
                        color="primary"
                      >
                        <CheckIcon />
                      </IconButton>
                      <IconButton
                        size="small"
                        onClick={cancelEditingName}
                      >
                        <CloseIcon />
                      </IconButton>
                    </Box>
                  ) : (
                    <>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Typography variant="h6" component="h2">
                          {party.name || `Party ${party.id.slice(0, 8)}...`}
                        </Typography>
                        <IconButton
                          size="small"
                          onClick={() => startEditingName(party)}
                          sx={{ opacity: 0.6, '&:hover': { opacity: 1 } }}
                        >
                          <EditIcon fontSize="small" />
                        </IconButton>
                        <Tooltip title={party.requiresPin ? 'Remove PIN Protection' : 'Add PIN Protection'}>
                          <IconButton
                            size="small"
                            onClick={() => togglePinProtection(party.id, !!party.requiresPin)}
                            sx={{ 
                              ml: -0.5,
                              color: party.requiresPin ? '#667eea' : 'rgba(0, 0, 0, 0.4)',
                              '&:hover': { 
                                color: '#667eea',
                                backgroundColor: 'rgba(102, 126, 234, 0.08)',
                              },
                            }}
                          >
                            {party.requiresPin ? <LockIcon fontSize="small" /> : <LockOpenIcon fontSize="small" />}
                          </IconButton>
                        </Tooltip>
                      </Box>
                      <Typography variant="body2" color="text.secondary">
                        Created {new Date(party.createdAt).toLocaleString()}
                      </Typography>
                    </>
                  )}
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
                <Button
                  variant="outlined"
                  size="small"
                  startIcon={<TrophyIcon />}
                  onClick={() => setStatsModalParty(party)}
                  sx={{ 
                    ml: 1,
                    fontSize: '0.7rem',
                    py: 0.25,
                    px: 1,
                    borderColor: '#667eea',
                    color: '#667eea',
                    '&:hover': { 
                      borderColor: '#764ba2',
                      backgroundColor: 'rgba(102, 126, 234, 0.08)',
                    },
                  }}
                >
                  Awards
                </Button>
              </Box>

              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 1 }}>
                <Typography variant="body2">
                  🎆 New Year&apos;s Eve mode
                </Typography>
                <Switch
                  checked={!!party.countdownTarget}
                  onChange={() => toggleCountdown(party.id, party.countdownTarget)}
                  size="small"
                />
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
                    onClick={() => generateQrCode(party.id)}
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

        {isLoadingParties ? (
          // Skeleton loading state
          Array.from({ length: 2 }).map((_, index) => (
            <Card key={index} className={styles.partyCard}>
              <CardContent>
                <Skeleton variant="text" width="60%" height={32} />
                <Skeleton variant="text" width="40%" height={24} sx={{ mt: 1 }} />
                <Box sx={{ display: 'flex', gap: 1, mt: 2 }}>
                  <Skeleton variant="rectangular" width={80} height={32} sx={{ borderRadius: 2 }} />
                  <Skeleton variant="rectangular" width={100} height={32} sx={{ borderRadius: 2 }} />
                </Box>
                <Box sx={{ display: 'flex', gap: 1, mt: 2 }}>
                  <Skeleton variant="circular" width={40} height={40} />
                  <Skeleton variant="circular" width={40} height={40} />
                  <Skeleton variant="circular" width={40} height={40} />
                  <Skeleton variant="circular" width={40} height={40} />
                </Box>
              </CardContent>
            </Card>
          ))
        ) : parties.length === 0 ? (
          <Box className={styles.emptyState}>
            <Typography variant="body1" color="text.secondary">
              No parties yet. Create one to get started!
            </Typography>
          </Box>
        ) : null}
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

      {/* Party Stats Modal */}
      <PartyStatsModal
        open={!!statsModalParty}
        onClose={() => setStatsModalParty(null)}
        partyId={statsModalParty?.id || ''}
        partyName={statsModalParty?.name || undefined}
      />

      {/* PIN Entry Modal */}
      <PinEntryModal
        open={pinModal.open}
        onClose={() => {
          setPinModal({ open: false, partyId: null, mode: 'verify' });
          setPinError('');
          setPendingQrGeneration(null);
        }}
        onSubmit={handlePinSubmit}
        mode={pinModal.mode}
        error={pinError}
      />
    </Container>
  );
}
