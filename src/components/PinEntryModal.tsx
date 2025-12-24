'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Dialog, DialogTitle, DialogContent, DialogActions, Button, Box, TextField } from '@mui/material';
import LockIcon from '@mui/icons-material/Lock';

interface PinEntryModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (pin: string) => void;
  mode: 'set' | 'verify' | 'remove';
  error?: string;
}

export default function PinEntryModal({ open, onClose, onSubmit, mode, error }: PinEntryModalProps) {
  const [pin, setPin] = useState<string[]>(Array(6).fill(''));
  const [currentPin, setCurrentPin] = useState<string[]>(Array(6).fill(''));
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  const getTitle = () => {
    switch (mode) {
      case 'set':
        return 'Set Admin PIN';
      case 'verify':
        return 'Enter Admin PIN';
      case 'remove':
        return 'Remove PIN Protection';
    }
  };

  const getDescription = () => {
    switch (mode) {
      case 'set':
        return 'Choose a 6-digit PIN to protect QR code generation';
      case 'verify':
        return 'Enter your 6-digit PIN to continue';
      case 'remove':
        return 'Enter your current PIN to remove protection';
    }
  };

  const handlePinChange = (index: number, value: string, isCurrentPin: boolean = false) => {
    // Only allow digits
    if (value && !/^\d$/.test(value)) return;

    const newPin = isCurrentPin ? [...currentPin] : [...pin];
    newPin[index] = value;
    
    if (isCurrentPin) {
      setCurrentPin(newPin);
    } else {
      setPin(newPin);
    }

    // Auto-focus next input
    if (value && index < 5) {
      const nextRef = isCurrentPin ? inputRefs.current[index + 7] : inputRefs.current[index + 1];
      nextRef?.focus();
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent, isCurrentPin: boolean = false) => {
    if (e.key === 'Backspace') {
      const currentPinArray = isCurrentPin ? currentPin : pin;
      
      if (!currentPinArray[index] && index > 0) {
        const prevRef = isCurrentPin ? inputRefs.current[index + 5] : inputRefs.current[index - 1];
        prevRef?.focus();
      }
    }
  };

  const handleSubmit = useCallback(() => {
    if (mode === 'remove') {
      const currentPinValue = currentPin.join('');
      if (currentPinValue.length === 6) {
        onSubmit(currentPinValue);
      }
    } else {
      const pinValue = pin.join('');
      if (pinValue.length === 6) {
        onSubmit(pinValue);
      }
    }
  }, [mode, currentPin, pin, onSubmit]);

  const handlePaste = (e: React.ClipboardEvent, isCurrentPin: boolean = false) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData('text');
    const digits = pastedData.replace(/\D/g, '').slice(0, 6);
    
    if (digits.length > 0) {
      const newPin = Array(6).fill('');
      for (let i = 0; i < digits.length; i++) {
        newPin[i] = digits[i];
      }
      
      if (isCurrentPin) {
        setCurrentPin(newPin);
      } else {
        setPin(newPin);
      }

      // Focus the next empty input or the last input
      const nextIndex = Math.min(digits.length, 5);
      const ref = isCurrentPin ? inputRefs.current[nextIndex + 6] : inputRefs.current[nextIndex];
      ref?.focus();
    }
  };

  const resetInputs = () => {
    setPin(Array(6).fill(''));
    setCurrentPin(Array(6).fill(''));
  };

  useEffect(() => {
    if (open) {
      resetInputs();
      // Focus first input when modal opens
      setTimeout(() => {
        if (mode === 'remove') {
          inputRefs.current[6]?.focus();
        } else {
          inputRefs.current[0]?.focus();
        }
      }, 100);
    }
  }, [open, mode]);

  const isComplete = mode === 'remove' 
    ? currentPin.every(d => d !== '')
    : pin.every(d => d !== '');

  // Auto-submit when PIN is complete
  useEffect(() => {
    if (isComplete && open) {
      // Small delay for better UX - user can see the last digit before submit
      const timer = setTimeout(() => {
        handleSubmit();
      }, 150);
      
      return () => clearTimeout(timer);
    }
  }, [isComplete, open, handleSubmit]);

  return (
    <Dialog 
      open={open} 
      onClose={onClose}
      maxWidth="xs"
      fullWidth
      PaperProps={{
        sx: {
          background: 'linear-gradient(135deg, #ffffff 0%, #f4f6ff 100%)',
          backdropFilter: 'blur(6px)',
          border: '1px solid rgba(102, 126, 234, 0.12)',
          boxShadow: '0 6px 24px rgba(16,24,40,0.08)'
        }
      }}
    >
      <DialogTitle sx={{ 
        display: 'flex', 
        alignItems: 'center', 
        gap: 1.5,
        color: '#3b3f72',
        pb: 1
      }}>
        <LockIcon />
        {getTitle()}
      </DialogTitle>
      
      <DialogContent>
        <Box sx={{ pt: 1 }}>
          <Box sx={{ 
            color: 'rgba(17,24,39,0.8)', 
            fontSize: '0.9rem',
            mb: 3,
            textAlign: 'center'
          }}>
            {getDescription()}
          </Box>

          {mode === 'remove' && (
            <>
              <Box sx={{ 
                color: 'rgba(255, 255, 255, 0.6)', 
                fontSize: '0.75rem',
                mb: 1,
                textAlign: 'center',
                textTransform: 'uppercase',
                letterSpacing: '0.5px'
              }}>
                Current PIN
              </Box>
              <Box sx={{ 
                display: 'flex', 
                gap: 1.5, 
                justifyContent: 'center',
                mb: 3
              }}>
                {currentPin.map((digit, index) => (
                  <TextField
                    key={`current-${index}`}
                    inputRef={el => inputRefs.current[index + 6] = el}
                    value={digit}
                    onChange={(e) => handlePinChange(index, e.target.value, true)}
                    onKeyDown={(e) => handleKeyDown(index, e as any, true)}
                    onPaste={(e) => handlePaste(e, true)}
                    inputProps={{
                      maxLength: 1,
                      style: { 
                        textAlign: 'center',
                        fontSize: '1.4rem',
                        fontWeight: 600,
                        padding: '10px 0',
                      },
                      type: 'text',
                      inputMode: 'numeric',
                      pattern: '[0-9]*'
                    }}
                    sx={{
                      width: '50px',
                      '& .MuiOutlinedInput-root': {
                        background: 'linear-gradient(180deg, rgba(102,126,234,0.03), rgba(255,255,255,0.6))',
                        '& fieldset': {
                          borderColor: 'rgba(16,24,40,0.08)',
                        },
                        '&:hover fieldset': {
                          borderColor: 'rgba(16,24,40,0.18)',
                        },
                        '&.Mui-focused fieldset': {
                          borderColor: '#667eea',
                          borderWidth: '2px',
                        },
                      },
                      '& input': {
                        color: '#0f172a',
                        WebkitTextSecurity: 'disc',
                      }
                    }}
                  />
                ))}
              </Box>
            </>
          )}

          {mode !== 'remove' && (
            <>
              <Box sx={{ 
                display: 'flex', 
                gap: 1.5, 
                justifyContent: 'center',
                mb: 2
              }}>
                {pin.map((digit, index) => (
                  <TextField
                    key={index}
                    inputRef={el => inputRefs.current[index] = el}
                    value={digit}
                    onChange={(e) => handlePinChange(index, e.target.value)}
                    onKeyDown={(e) => handleKeyDown(index, e as any)}
                    onPaste={handlePaste}
                    inputProps={{
                      maxLength: 1,
                      style: { 
                        textAlign: 'center',
                        fontSize: '1.4rem',
                        fontWeight: 600,
                        padding: '10px 0',
                      },
                      type: 'text',
                      inputMode: 'numeric',
                      pattern: '[0-9]*'
                    }}
                    sx={{
                      width: '50px',
                      '& .MuiOutlinedInput-root': {
                        background: 'linear-gradient(180deg, rgba(102,126,234,0.03), rgba(255,255,255,0.6))',
                        '& fieldset': {
                          borderColor: 'rgba(16,24,40,0.08)',
                        },
                        '&:hover fieldset': {
                          borderColor: 'rgba(16,24,40,0.18)',
                        },
                        '&.Mui-focused fieldset': {
                          borderColor: '#667eea',
                          borderWidth: '2px',
                        },
                      },
                      '& input': {
                        color: '#0f172a',
                        WebkitTextSecurity: mode === 'set' ? 'none' : 'disc',
                      }
                    }}
                  />
                ))}
              </Box>
            </>
          )}

          {error && (
            <Box sx={{ 
              color: '#b91c1c', 
              fontSize: '0.9rem',
              mt: 2,
              textAlign: 'center',
              p: 1.5,
              background: 'rgba(249, 115, 115, 0.08)',
              borderRadius: 1,
              border: '1px solid rgba(239,68,68,0.15)'
            }}>
              {error}
            </Box>
          )}
        </Box>
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 3 }}>
        <Button 
          onClick={onClose}
          sx={{ 
            color: 'rgba(17,24,39,0.7)',
            '&:hover': {
              background: 'rgba(17,24,39,0.04)',
            }
          }}
        >
          Cancel
        </Button>
        <Button 
          onClick={handleSubmit}
          disabled={!isComplete}
          variant="contained"
          sx={{ 
            background: 'linear-gradient(135deg, #667eea 0%, #8b5cf6 100%)',
            '&:hover': {
              background: 'linear-gradient(135deg, #5568d3 0%, #7c3aed 100%)',
            },
            '&.Mui-disabled': {
              background: 'rgba(102, 126, 234, 0.18)',
              color: 'rgba(17,24,39,0.3)',
            }
          }}
        >
          {mode === 'remove' ? 'Remove PIN' : mode === 'set' ? 'Set PIN' : 'Verify'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
