'use client';

import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  Box,
  Typography,
  IconButton,
  CircularProgress,
  Divider,
} from '@mui/material';
import { Close as CloseIcon } from '@mui/icons-material';
import { motion, AnimatePresence } from 'framer-motion';

interface Trophy {
  emoji: string;
  title: string;
  description: string;
  winner: string | null;
  value?: string;
}

interface StatsData {
  trophies: Trophy[];
  summary: {
    totalPhotos: number;
    totalGuests: number;
    totalComments: number;
  };
}

interface PartyStatsModalProps {
  open: boolean;
  onClose: () => void;
  partyId: string;
  partyName?: string;
}

export default function PartyStatsModal({ open, onClose, partyId, partyName }: PartyStatsModalProps) {
  const [stats, setStats] = useState<StatsData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open && partyId) {
      setLoading(true);
      setError(null);
      fetch(`/api/parties/${partyId}/stats`)
        .then(res => {
          if (!res.ok) throw new Error('Failed to load stats');
          return res.json();
        })
        .then(data => {
          setStats(data);
          setLoading(false);
        })
        .catch(err => {
          setError(err.message);
          setLoading(false);
        });
    }
  }, [open, partyId]);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      PaperProps={{
        sx: {
          borderRadius: '20px',
          background: 'linear-gradient(180deg, #1a1a2e 0%, #16213e 100%)',
          color: 'white',
          overflow: 'hidden',
        },
      }}
    >
      <DialogTitle
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          py: 2,
        }}
      >
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 1 }}>
            🏆 Party Awards
          </Typography>
          {partyName && (
            <Typography variant="body2" sx={{ opacity: 0.9, mt: 0.5 }}>
              {partyName}
            </Typography>
          )}
        </Box>
        <IconButton onClick={onClose} sx={{ color: 'white' }}>
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <DialogContent sx={{ p: 0 }}>
        {loading && (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
            <CircularProgress sx={{ color: '#667eea' }} />
          </Box>
        )}

        {error && (
          <Box sx={{ p: 3, textAlign: 'center' }}>
            <Typography color="error">{error}</Typography>
          </Box>
        )}

        {stats && !loading && (
          <>
            {/* Summary Stats */}
            <Box
              sx={{
                display: 'flex',
                justifyContent: 'space-around',
                py: 2,
                px: 3,
                background: 'rgba(255,255,255,0.05)',
              }}
            >
              <Box sx={{ textAlign: 'center' }}>
                <Typography variant="h4" sx={{ fontWeight: 700, color: '#f093fb' }}>
                  {stats.summary.totalPhotos}
                </Typography>
                <Typography variant="caption" sx={{ opacity: 0.7 }}>Photos</Typography>
              </Box>
              <Box sx={{ textAlign: 'center' }}>
                <Typography variant="h4" sx={{ fontWeight: 700, color: '#4facfe' }}>
                  {stats.summary.totalGuests}
                </Typography>
                <Typography variant="caption" sx={{ opacity: 0.7 }}>Guests</Typography>
              </Box>
              <Box sx={{ textAlign: 'center' }}>
                <Typography variant="h4" sx={{ fontWeight: 700, color: '#43e97b' }}>
                  {stats.summary.totalComments}
                </Typography>
                <Typography variant="caption" sx={{ opacity: 0.7 }}>Comments</Typography>
              </Box>
            </Box>

            <Divider sx={{ borderColor: 'rgba(255,255,255,0.1)' }} />

            {/* Trophies */}
            <Box sx={{ p: 2 }}>
              <AnimatePresence>
                {stats.trophies.map((trophy, index) => (
                  <motion.div
                    key={trophy.title}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.08 }}
                  >
                    <Box
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 2,
                        p: 1.5,
                        mb: 1,
                        borderRadius: '12px',
                        background: trophy.winner
                          ? 'linear-gradient(135deg, rgba(255,255,255,0.1) 0%, rgba(255,255,255,0.05) 100%)'
                          : 'rgba(255,255,255,0.02)',
                        border: trophy.winner
                          ? '1px solid rgba(255,255,255,0.15)'
                          : '1px solid rgba(255,255,255,0.05)',
                        opacity: trophy.winner ? 1 : 0.5,
                      }}
                    >
                      <Box
                        sx={{
                          fontSize: '2rem',
                          width: 50,
                          height: 50,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          background: 'rgba(255,255,255,0.1)',
                          borderRadius: '12px',
                          flexShrink: 0,
                        }}
                      >
                        {trophy.emoji}
                      </Box>
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography
                          variant="subtitle1"
                          sx={{ fontWeight: 600, lineHeight: 1.2 }}
                        >
                          {trophy.title}
                        </Typography>
                        <Typography
                          variant="body2"
                          sx={{ opacity: 0.6, fontSize: '0.75rem' }}
                        >
                          {trophy.description}
                        </Typography>
                      </Box>
                      <Box sx={{ textAlign: 'right', flexShrink: 0 }}>
                        {trophy.winner ? (
                          <>
                            <Typography
                              variant="body2"
                              sx={{
                                fontWeight: 600,
                                color: '#f8e71c',
                                maxWidth: 120,
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {trophy.winner}
                            </Typography>
                            {trophy.value && (
                              <Typography
                                variant="caption"
                                sx={{ opacity: 0.6, fontSize: '0.7rem' }}
                              >
                                {trophy.value}
                              </Typography>
                            )}
                          </>
                        ) : (
                          <Typography
                            variant="body2"
                            sx={{ opacity: 0.4, fontStyle: 'italic' }}
                          >
                            No winner yet
                          </Typography>
                        )}
                      </Box>
                    </Box>
                  </motion.div>
                ))}
              </AnimatePresence>
            </Box>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
