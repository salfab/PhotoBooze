'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import {
  Box,
  Typography,
  CircularProgress,
} from '@mui/material';
import QRCode from 'qrcode';
import { createClient } from '@/lib/supabase/client';
import styles from '@/app/upload/[partyId]/page.module.css';

interface ShareTabProps {
  partyId: string;
}

export default function ShareTab({ partyId }: ShareTabProps) {
  const [qrCodeUrl, setQrCodeUrl] = useState<string>('');
  const [showingQR, setShowingQR] = useState(false);
  const supabaseRef = useRef(createClient());

  // Generate QR code for party join URL
  useEffect(() => {
    async function generateQR() {
      try {
        const joinUrl = `${window.location.origin}/upload/${partyId}`;
        const qrDataUrl = await QRCode.toDataURL(joinUrl, {
          width: 300,
          margin: 2,
          color: {
            dark: '#000000',
            light: '#ffffff',
          },
        });
        setQrCodeUrl(qrDataUrl);
      } catch (err) {
        console.error('Failed to generate QR code:', err);
      }
    }
    generateQR();
  }, [partyId]);

  const sendShowQRCommand = useCallback(() => {
    const supabase = supabaseRef.current;
    const channel = supabase.channel(`tv-control:${partyId}`);
    
    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        console.log('Sending toggle QR command');
        channel.send({
          type: 'broadcast',
          event: 'toggle-qr',
          payload: {},
        });
        setShowingQR(prev => {
          const newState = !prev;
          if (newState) {
            setTimeout(() => {
              setShowingQR(false);
            }, 60000);
          }
          return newState;
        });
        setTimeout(() => {
          supabase.removeChannel(channel);
        }, 500);
      }
    });
  }, [partyId]);

  return (
    <Box className={styles.remoteContainer}>
      <Typography variant="h6" sx={{ color: '#1a1a1a' }} gutterBottom>
        Share Party
      </Typography>
      {qrCodeUrl ? (
        <>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2, textAlign: 'center' }}>
            Scan this QR code to join the party
          </Typography>
          <Box 
            onClick={sendShowQRCommand}
            sx={{ 
              backgroundColor: 'white', 
              padding: '1rem', 
              borderRadius: '16px',
              boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              '&:hover': {
                boxShadow: '0 6px 16px rgba(0, 0, 0, 0.15)',
                transform: 'translateY(-2px)',
              },
              '&:active': {
                transform: 'translateY(0)',
              },
            }}
          >
            <img src={qrCodeUrl} alt="Party QR Code" className={styles.qrCodeImage} />
            <Typography 
              variant="body2" 
              sx={{ 
                mt: 1.5,
                textAlign: 'center',
                color: 'primary.main',
                fontWeight: 500,
              }}
            >
              Tap to show on TV
            </Typography>
          </Box>
        </>
      ) : (
        <CircularProgress />
      )}
    </Box>
  );
}
