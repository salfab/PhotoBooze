'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import {
  Box,
  Typography,
  Button,
  Fab,
  CircularProgress,
  Switch,
  FormControlLabel,
  Dialog,
  DialogContent,
  DialogTitle,
} from '@mui/material';
import {
  Tv as TvIcon,
  NavigateBefore as PrevIcon,
  NavigateNext as NextIcon,
} from '@mui/icons-material';
import { createClient } from '@/lib/supabase/client';
import styles from '@/app/upload/[partyId]/page.module.css';

interface TVState {
  currentIndex: number;
  totalPhotos: number;
  uploaderName?: string;
  comment?: string;
  photoUrl?: string;
  isFullscreen?: boolean;
}

interface RemoteTabProps {
  partyId: string;
  openTvView: () => void;
}

export default function RemoteTab({ partyId, openTvView }: RemoteTabProps) {
  const [tvState, setTvState] = useState<TVState | null>(null);
  const [commentModalOpen, setCommentModalOpen] = useState(false);
  const supabaseRef = useRef(createClient());

  // Request current state from TV
  const requestTvState = useCallback(() => {
    const supabase = supabaseRef.current;
    const controlChannel = supabase.channel(`tv-control:${partyId}`);
    
    controlChannel.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        console.log('Sending request-state command');
        controlChannel.send({
          type: 'broadcast',
          event: 'request-state',
          payload: {},
        });
        setTimeout(() => {
          supabase.removeChannel(controlChannel);
        }, 500);
      }
    });
  }, [partyId]);

  // Listen for TV state broadcasts
  useEffect(() => {
    const supabase = supabaseRef.current;
    const stateChannel = supabase.channel(`tv-state:${partyId}`);

    stateChannel
      .on('broadcast', { event: 'state' }, ({ payload }) => {
        console.log('TV state received:', payload);
        setTvState(payload as TVState);
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log('Remote subscribed to TV state, requesting current state...');
          requestTvState();
        }
      });

    return () => {
      supabase.removeChannel(stateChannel);
    };
  }, [partyId, requestTvState]);

  // Send navigation command to TV
  const sendNavigationCommand = useCallback((action: 'prev' | 'next') => {
    const supabase = supabaseRef.current;
    const channel = supabase.channel(`tv-control:${partyId}`);
    
    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        console.log('Sending navigation command:', action);
        channel.send({
          type: 'broadcast',
          event: 'navigate',
          payload: { action },
        });
        setTimeout(() => {
          supabase.removeChannel(channel);
        }, 500);
      }
    });
  }, [partyId]);

  // Send fullscreen toggle command to TV
  const sendToggleFullscreen = useCallback(() => {
    const supabase = supabaseRef.current;
    const channel = supabase.channel(`tv-control:${partyId}`);
    
    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        console.log('Sending toggle-fullscreen command');
        channel.send({
          type: 'broadcast',
          event: 'toggle-fullscreen',
          payload: {},
        });
        setTimeout(() => {
          supabase.removeChannel(channel);
        }, 500);
      }
    });
  }, [partyId]);

  if (!tvState) {
    return (
      <Box className={styles.remoteContainer}>
        <Typography variant="h6" sx={{ color: '#1a1a1a' }} gutterBottom>
          TV Remote Control
        </Typography>
        <Box className={styles.remoteWaiting}>
          <CircularProgress size={40} />
          <Typography variant="body1" color="text.secondary" sx={{ mt: 2 }}>
            Connecting to TV...
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Make sure the TV view is open
          </Typography>
          <Button
            variant="outlined"
            startIcon={<TvIcon />}
            onClick={openTvView}
            sx={{ mt: 2 }}
          >
            Open TV Display
          </Button>
        </Box>
      </Box>
    );
  }

  return (
    <Box className={styles.remoteContainer}>
      <Typography variant="h6" sx={{ color: '#1a1a1a' }} gutterBottom>
        TV Remote Control
      </Typography>
      
      <Box className={styles.remoteStatus} sx={{ maxWidth: '300px', width: '100%', overflow: 'hidden' }}>
        <Typography variant="body1" sx={{ color: '#1a1a1a' }}>
          📷 Photo {tvState.currentIndex + 1} of {tvState.totalPhotos}
        </Typography>
        {tvState.uploaderName && (
          <Typography variant="body2" sx={{ color: '#1a1a1a' }}>
            by {tvState.uploaderName}
          </Typography>
        )}
        {tvState.comment && (
          <Typography 
            variant="body2" 
            onClick={() => setCommentModalOpen(true)}
            sx={{ 
              color: '#1a1a1a', 
              fontStyle: 'italic',
              cursor: 'pointer',
              display: 'block',
              width: '100%',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              '&:hover': {
                textDecoration: 'underline',
              },
            }}
          >
            {tvState.comment}
          </Typography>
        )}
      </Box>

      {/* Comment Modal */}
      <Dialog 
        open={commentModalOpen} 
        onClose={() => setCommentModalOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>
          💬 Comment
        </DialogTitle>
        <DialogContent>
          <Typography 
            sx={{ 
              fontStyle: 'italic',
              lineHeight: 1.6,
              maxHeight: '60vh',
              overflowY: 'auto',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}
          >
            {tvState.comment}
          </Typography>
        </DialogContent>
      </Dialog>

      <Box className={styles.remoteControls}>
        <Fab
          color="primary"
          size="large"
          onClick={() => sendNavigationCommand('prev')}
          disabled={tvState.currentIndex === 0}
          className={styles.navButton}
        >
          <PrevIcon fontSize="large" />
        </Fab>
        
        <Fab
          color="primary"
          size="large"
          onClick={() => sendNavigationCommand('next')}
          disabled={tvState.currentIndex >= tvState.totalPhotos - 1}
          className={styles.navButton}
        >
          <NextIcon fontSize="large" />
        </Fab>
      </Box>

      {/* Fullscreen toggle switch */}
      <FormControlLabel
        control={
          <Switch
            checked={tvState.isFullscreen || false}
            onChange={sendToggleFullscreen}
            disabled={!tvState.photoUrl}
            color="secondary"
          />
        }
        label="Fullscreen on TV"
        className={styles.fullscreenSwitch}
      />
    </Box>
  );
}
