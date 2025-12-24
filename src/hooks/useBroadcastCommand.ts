'use client';

import { useCallback, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { TIMING } from '@/lib/constants';

/**
 * Hook for broadcasting commands to TV displays via Supabase realtime channels.
 * Handles channel creation, subscription, message sending, and cleanup.
 * 
 * @param partyId - The party ID to broadcast to
 * @returns A function to send broadcast commands
 * 
 * @example
 * const broadcast = useBroadcastCommand('party-123');
 * 
 * // Send a navigation command
 * broadcast('navigate', { action: 'next' });
 * 
 * // Send a toggle command
 * broadcast('toggle-fullscreen', {});
 */
export function useBroadcastCommand(partyId: string) {
  const supabaseRef = useRef(createClient());

  const broadcast = useCallback(
    (event: string, payload: Record<string, unknown> = {}) => {
      const supabase = supabaseRef.current;
      const channel = supabase.channel(`tv-control:${partyId}`);

      channel.subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          channel.send({
            type: 'broadcast',
            event,
            payload,
          });
          // Clean up channel after message is sent
          setTimeout(() => {
            supabase.removeChannel(channel);
          }, TIMING.CHANNEL_CLEANUP_MS);
        }
      });
    },
    [partyId]
  );

  return broadcast;
}

/**
 * Predefined TV control events.
 */
export const TV_EVENTS = {
  /** Request current TV state */
  REQUEST_STATE: 'request-state',
  /** Navigate to previous/next photo */
  NAVIGATE: 'navigate',
  /** Toggle fullscreen mode */
  TOGGLE_FULLSCREEN: 'toggle-fullscreen',
  /** Show an idle prompt */
  SHOW_PROMPT: 'show-prompt',
  /** Toggle idle prompts on/off */
  TOGGLE_IDLE_PROMPTS: 'toggle-idle-prompts',
  /** Show/hide QR code overlay */
  TOGGLE_QR: 'toggle-qr',
} as const;

export type TvEvent = typeof TV_EVENTS[keyof typeof TV_EVENTS];
