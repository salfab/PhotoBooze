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
  EmojiObjects as PromptIcon,
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
  const [idlePromptsEnabled, setIdlePromptsEnabled] = useState(true);
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

  // Send show prompt command to TV
  const sendShowPrompt = useCallback(() => {
    const supabase = supabaseRef.current;
    const channel = supabase.channel(`tv-control:${partyId}`);
    
    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        console.log('Sending show-prompt command');
        channel.send({
          type: 'broadcast',
          event: 'show-prompt',
          payload: {},
        });
        setTimeout(() => {
          supabase.removeChannel(channel);
        }, 500);
      }
    });
  }, [partyId]);

  // Send toggle idle prompts command to TV
  const sendToggleIdlePrompts = useCallback(() => {
    const supabase = supabaseRef.current;
    const channel = supabase.channel(`tv-control:${partyId}`);
    const newState = !idlePromptsEnabled;
    
    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        console.log('Sending toggle-idle-prompts command:', newState);
        channel.send({
          type: 'broadcast',
          event: 'toggle-idle-prompts',
          payload: { enabled: newState },
        });
        setIdlePromptsEnabled(newState);
        setTimeout(() => {
          supabase.removeChannel(channel);
        }, 500);
      }
    });
  }, [partyId, idlePromptsEnabled]);

  if (!tvState) {
    return (
      <Box className={styles.remoteContainer}>
        <Box sx={{ 
          textAlign: 'center', 
          py: 4,
          px: 2,
          background: 'white',
          borderRadius: '20px',
          boxShadow: '0 4px 16px rgba(0, 0, 0, 0.06)',
        }}>
          <CircularProgress size={48} sx={{ color: '#667eea', mb: 2 }} />
          <Typography variant="h6" sx={{ color: '#1a202c', fontWeight: 600, mb: 1 }}>
            Connecting to TV...
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            Make sure the TV view is open
          </Typography>
          <Button
            variant="contained"
            startIcon={<TvIcon />}
            onClick={openTvView}
            sx={{ 
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              color: 'white',
              px: 3,
              py: 1.5,
              borderRadius: '12px',
              textTransform: 'none',
              fontWeight: 600,
              boxShadow: '0 4px 12px rgba(102, 126, 234, 0.3)',
              '&:hover': {
                background: 'linear-gradient(135deg, #5568d3 0%, #66418c 100%)',
                transform: 'translateY(-2px)',
                boxShadow: '0 6px 16px rgba(102, 126, 234, 0.4)',
              },
            }}
          >
            Open TV Display
          </Button>
        </Box>
      </Box>
    );
  }

  return (
    <Box className={styles.remoteContainer} sx={{ alignItems: 'center', width: '100%' }}>
      {/* Current Photo Status */}
      <Box className={styles.remoteStatus} sx={{ width: '100%', maxWidth: '340px' }}>
        <Typography variant="h6" sx={{ color: '#667eea', fontWeight: 700, mb: 0.5 }}>
          📷 Photo {tvState.currentIndex + 1} of {tvState.totalPhotos}
        </Typography>
        {tvState.uploaderName && (
          <Typography variant="body2" sx={{ color: 'rgba(17,24,39,0.7)', fontSize: '0.9rem' }}>
            by <strong>{tvState.uploaderName}</strong>
          </Typography>
        )}
        {tvState.comment && (
          <Typography 
            variant="body2" 
            onClick={() => setCommentModalOpen(true)}
            sx={{ 
              color: 'rgba(17,24,39,0.8)', 
              fontStyle: 'italic',
              cursor: 'pointer',
              display: 'block',
              width: '100%',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              mt: 1,
              padding: '8px 12px',
              background: 'rgba(102, 126, 234, 0.06)',
              borderRadius: '8px',
              transition: 'all 0.2s ease',
              '&:hover': {
                background: 'rgba(102, 126, 234, 0.12)',
                color: '#667eea',
              },
            }}
          >
            💬 {tvState.comment}
          </Typography>
        )}
      </Box>

      {/* Comment Modal */}
      <Dialog 
        open={commentModalOpen} 
        onClose={() => setCommentModalOpen(false)}
        maxWidth="sm"
        fullWidth
        PaperProps={{
          sx: {
            background: 'linear-gradient(135deg, #ffffff 0%, #f4f6ff 100%)',
            boxShadow: '0 6px 24px rgba(16,24,40,0.08)',
          },
        }}
      >
        <DialogTitle sx={{ color: '#3b3f72', fontWeight: 600 }}>
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
              color: 'rgba(17,24,39,0.9)',
            }}
          >
            {tvState.comment}
          </Typography>
        </DialogContent>
      </Dialog>

      <Box className={styles.remoteControls} sx={{ width: '100%', maxWidth: '340px' }}>
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
      <Box sx={{ display: 'flex', justifyContent: 'center', width: '100%', maxWidth: '340px' }}>
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
          sx={{ width: '100%', m: 0 }}
        />
      </Box>

      {/* Show Prompt Button */}
      <Box sx={{ display: 'flex', justifyContent: 'center', width: '100%', maxWidth: '340px' }}>
        <Button
          variant="contained"
          startIcon={<PromptIcon />}
          onClick={sendShowPrompt}
          sx={{
            width: '100%',
            py: 1.5,
            borderRadius: '16px',
            textTransform: 'none',
            fontWeight: 600,
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            boxShadow: '0 4px 16px rgba(102, 126, 234, 0.3)',
            '&:hover': {
              background: 'linear-gradient(135deg, #5568d3 0%, #66418c 100%)',
              boxShadow: '0 6px 20px rgba(102, 126, 234, 0.4)',
              transform: 'translateY(-2px)',
            },
            transition: 'all 0.3s ease',
          }}
        >
          Show Prompt on TV
        </Button>
      </Box>

      {/* Idle Prompts Toggle Switch */}
      <Box sx={{ display: 'flex', justifyContent: 'center', width: '100%', maxWidth: '340px' }}>
        <FormControlLabel
          control={
            <Switch
              checked={idlePromptsEnabled}
              onChange={sendToggleIdlePrompts}
              color="secondary"
            />
          }
          label="Auto Idle Prompts"
          className={styles.idlePromptsSwitch}
          sx={{ width: '100%', m: 0 }}
        />
      </Box>
    </Box>
  );
}
