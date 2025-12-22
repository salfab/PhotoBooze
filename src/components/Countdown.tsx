'use client';

import { useState, useEffect, useRef } from 'react';
import { Box } from '@mui/material';
import { motion, AnimatePresence } from 'framer-motion';

interface CountdownProps {
  countdownTarget: string | null;
}

export default function Countdown({ countdownTarget }: CountdownProps) {
  const [countdownDisplay, setCountdownDisplay] = useState<{ hours: number; minutes: number; seconds: number } | null>(null);
  const [finalCountdown, setFinalCountdown] = useState<number | null>(null);
  const [countdownKey, setCountdownKey] = useState(0);

  const celebrationTimerRef = useRef<NodeJS.Timeout | null>(null);
  const celebrationEndedRef = useRef(false);
  const countdownStartedRef = useRef(false);
  const preciseTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!countdownTarget) {
      setCountdownDisplay(null);
      setFinalCountdown(null);
      celebrationEndedRef.current = false;
      countdownStartedRef.current = false;
      return;
    }

    const triggerCelebration = () => {
      if (celebrationEndedRef.current) return;
      
      console.log('⏱️ Countdown has elapsed - triggering celebration');
      setCountdownDisplay(null);
      setFinalCountdown(prev => {
        if (prev !== 0) {
          setCountdownKey(k => k + 1);
          if (celebrationTimerRef.current) {
            clearTimeout(celebrationTimerRef.current);
          }
          celebrationTimerRef.current = setTimeout(() => {
            console.log('⏱️ Celebration ended, hiding overlay');
            celebrationEndedRef.current = true;
            setFinalCountdown(null);
          }, 15000);
        }
        return 0;
      });
    };

    const updateCountdown = () => {
      const target = new Date(countdownTarget);
      const now = new Date();
      const diff = target.getTime() - now.getTime();

      if (diff > 0) {
        countdownStartedRef.current = true;
        const totalSeconds = Math.floor(diff / 1000);
        const hours = Math.floor(diff / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((diff % (1000 * 60)) / 1000);
        setCountdownDisplay({ hours, minutes, seconds });
        console.log(`⏱️ Countdown display updated: ${hours}h ${minutes}m ${seconds}s (${diff}ms remaining)`);

        if (totalSeconds <= 10 && totalSeconds > 0) {
          setFinalCountdown(prev => {
            if (prev !== totalSeconds) {
              setCountdownKey(k => k + 1);
            }
            return totalSeconds;
          });
          
          // When showing "1", schedule precise celebration timing
          // Subtract 300ms to account for the exit animation duration
          if (totalSeconds === 1) {
            if (preciseTimerRef.current) {
              clearTimeout(preciseTimerRef.current);
            }
            const animationOffset = 300; // Match the exit animation duration
            const triggerIn = Math.max(0, diff - animationOffset);
            console.log(`⏱️ Scheduling celebration in ${triggerIn}ms (${diff}ms remaining, minus ${animationOffset}ms animation)`);
            preciseTimerRef.current = setTimeout(triggerCelebration, triggerIn);
          }
        } else if (totalSeconds > 10) {
          setFinalCountdown(null);
        }
        
        celebrationEndedRef.current = false;
      } else {
        if (celebrationEndedRef.current) {
          return;
        }
        
        if (!countdownStartedRef.current) {
          console.log('⏱️ Countdown already in the past, skipping display');
          celebrationEndedRef.current = true;
          setCountdownDisplay(null);
          setFinalCountdown(null);
          return;
        }
        
        triggerCelebration();
      }
    };

    updateCountdown();

    const interval = setInterval(updateCountdown, 1000);
    return () => {
      clearInterval(interval);
      if (celebrationTimerRef.current) {
        clearTimeout(celebrationTimerRef.current);
      }
      if (preciseTimerRef.current) {
        clearTimeout(preciseTimerRef.current);
      }
    };
  }, [countdownTarget]);

  return (
    <>
      {/* Countdown display - top right corner (hide during final countdown) */}
      {countdownDisplay && finalCountdown === null && (
        <Box sx={{
          position: 'absolute',
          top: 20,
          right: 20,
          backgroundColor: 'rgba(0, 0, 0, 0.7)',
          color: '#fff',
          padding: '12px 16px',
          borderRadius: '8px',
          fontSize: '32px',
          fontWeight: 'bold',
          fontFamily: 'Arial, Helvetica, sans-serif',
          zIndex: 1000,
          minWidth: '250px',
          textAlign: 'center',
        }}>
          {countdownDisplay.hours > 0 && `${String(countdownDisplay.hours).padStart(2, '0')}:`}
          {String(countdownDisplay.minutes).padStart(2, '0')}:
          {String(countdownDisplay.seconds).padStart(2, '0')}
        </Box>
      )}

      {/* Full-screen final countdown (last 10 seconds) */}
      <AnimatePresence>
        {finalCountdown !== null && (
          <motion.div
            key="final-countdown-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: 'rgba(0, 0, 0, 0.85)',
              zIndex: 2000,
            }}
          >
            <AnimatePresence mode="popLayout">
              <motion.div
                key={countdownKey}
                initial={{ scale: 0.5, opacity: 0 }}
                animate={finalCountdown === 0 
                  ? { 
                      scale: [1.3, 1.5, 1.3], 
                      opacity: 1,
                    }
                  : { scale: 1.5, opacity: 1 }
                }
                exit={{ scale: 1.8, opacity: 0 }}
                transition={finalCountdown === 0
                  ? {
                      scale: {
                        duration: 2,
                        repeat: Infinity,
                        ease: 'easeInOut',
                      },
                      opacity: { duration: 0.3 },
                    }
                  : { 
                      duration: 0.3,
                      ease: 'easeOut',
                    }
                }
                style={{
                  fontSize: finalCountdown === 0 ? '200px' : '300px',
                  fontWeight: 'bold',
                  color: '#fff',
                  textShadow: finalCountdown === 0 ? 'none' : '0 0 60px rgba(255, 215, 0, 0.8), 0 0 120px rgba(255, 215, 0, 0.4)',
                  fontFamily: 'system-ui, sans-serif',
                  filter: finalCountdown === 0 ? 'drop-shadow(0 0 40px rgba(255, 215, 0, 0.8))' : 'none',
                }}
              >
                {finalCountdown === 0 ? '🎉' : finalCountdown}
              </motion.div>
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
