'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import {
  Box,
  Typography,
  CircularProgress,
} from '@mui/material';
import { createClient } from '@/lib/supabase/client';
import { generateQrCodeDataUrl } from '@/lib/utils/qrcode';
import { useBroadcastCommand, TV_EVENTS } from '@/hooks';
import { TIMING } from '@/lib/constants';
import styles from '@/app/upload/[partyId]/page.module.css';

interface ShareTabProps {
  partyId: string;
}

export default function ShareTab({ partyId }: ShareTabProps) {
  const [qrCodeUrl, setQrCodeUrl] = useState<string>('');
  const [showingQR, setShowingQR] = useState(false);
  const broadcast = useBroadcastCommand(partyId);

  // Generate QR code for party join URL
  useEffect(() => {
    async function generateQR() {
      try {
        const joinUrl = `${window.location.origin}/upload/${partyId}`;
        const qrDataUrl = await generateQrCodeDataUrl(joinUrl);
        setQrCodeUrl(qrDataUrl);
      } catch (err) {
        console.error('Failed to generate QR code:', err);
      }
    }
    generateQR();
  }, [partyId]);

  const sendShowQRCommand = useCallback(() => {
    broadcast(TV_EVENTS.TOGGLE_QR);
    setShowingQR(prev => {
      const newState = !prev;
      if (newState) {
        setTimeout(() => {
          setShowingQR(false);
        }, TIMING.QR_OVERLAY_TIMEOUT_MS);
      }
      return newState;
    });
  }, [broadcast]);

  return (
    <Box className={styles.remoteContainer}>
      {qrCodeUrl ? (
        <Box sx={{ 
          display: 'flex', 
          flexDirection: 'column', 
          alignItems: 'center',
          gap: 2,
          width: '100%',
        }}>
          {/* QR Code Card */}
          <Box 
            onClick={sendShowQRCommand}
            sx={{ 
              backgroundColor: 'white', 
              padding: '1.5rem', 
              borderRadius: '20px',
              boxShadow: '0 4px 16px rgba(0, 0, 0, 0.08)',
              cursor: 'pointer',
              transition: 'all 0.3s ease',
              maxWidth: '350px',
              width: '100%',
              border: '2px solid rgba(102, 126, 234, 0.1)',
              '&:hover': {
                boxShadow: '0 8px 24px rgba(102, 126, 234, 0.2)',
                transform: 'translateY(-4px)',
                borderColor: 'rgba(102, 126, 234, 0.3)',
              },
              '&:active': {
                transform: 'translateY(-2px)',
              },
            }}
          >
            <Typography 
              variant="h6" 
              sx={{ 
                color: '#1a202c',
                fontWeight: 600,
                textAlign: 'center',
                mb: 2,
              }}
            >
              Scan and Join
            </Typography>
            <img 
              src={qrCodeUrl} 
              alt="Party QR Code" 
              style={{ 
                width: '100%', 
                height: 'auto',
                display: 'block',
                borderRadius: '12px',
              }} 
            />
            <Box sx={{
              mt: 2,
              p: 1.5,
              background: 'linear-gradient(135deg, rgba(102, 126, 234, 0.08) 0%, rgba(118, 75, 162, 0.08) 100%)',
              borderRadius: '12px',
              textAlign: 'center',
            }}>
              <Typography 
                variant="body2" 
                sx={{ 
                  color: '#667eea',
                  fontWeight: 600,
                  fontSize: '0.9rem',
                }}
              >
                Tap to display on TV
              </Typography>
            </Box>
          </Box>
        </Box>
      ) : (
        <Box sx={{ 
          textAlign: 'center',
          py: 4,
          background: 'white',
          borderRadius: '20px',
          boxShadow: '0 4px 16px rgba(0, 0, 0, 0.06)',
          width: '100%',
        }}>
          <CircularProgress sx={{ color: '#667eea' }} />
          <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
            Generating QR code...
          </Typography>
        </Box>
      )}
    </Box>
  );
}
