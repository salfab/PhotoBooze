'use client';

import { useEffect, useState } from 'react';
import {
  Box,
  Fab,
  Dialog,
  DialogTitle,
  DialogContent,
  Typography,
  IconButton,
  List,
  ListItem,
  ListItemText,
  Chip,
} from '@mui/material';
import { 
  BugReport as BugIcon, 
  Close as CloseIcon,
  Clear as ClearIcon 
} from '@mui/icons-material';

interface LogEntry {
  timestamp: string;
  level: 'log' | 'warn' | 'error' | 'info';
  message: string;
  args: any[];
}

export default function MobileDebug() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [hasErrors, setHasErrors] = useState(false);

  useEffect(() => {
    // Only show on mobile devices or when debugging
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    const isDebug = window.location.search.includes('debug=true');
    
    if (!isMobile && !isDebug) {
      return;
    }

    const addLog = (level: LogEntry['level'], args: any[]) => {
      const message = args.map(arg => {
        if (typeof arg === 'object') {
          try {
            return JSON.stringify(arg, null, 2);
          } catch {
            return String(arg);
          }
        }
        return String(arg);
      }).join(' ');

      const logEntry: LogEntry = {
        timestamp: new Date().toLocaleTimeString(),
        level,
        message,
        args,
      };

      setLogs(prev => [...prev.slice(-49), logEntry]); // Keep last 50 logs
      
      if (level === 'error') {
        setHasErrors(true);
      }
    };

    // Override console methods
    const originalConsole = {
      log: console.log,
      warn: console.warn,
      error: console.error,
      info: console.info,
    };

    console.log = (...args) => {
      originalConsole.log(...args);
      addLog('log', args);
    };

    console.warn = (...args) => {
      originalConsole.warn(...args);
      addLog('warn', args);
    };

    console.error = (...args) => {
      originalConsole.error(...args);
      addLog('error', args);
    };

    console.info = (...args) => {
      originalConsole.info(...args);
      addLog('info', args);
    };

    // Capture unhandled errors
    const handleError = (event: ErrorEvent) => {
      addLog('error', [`Unhandled Error: ${event.message}`, `File: ${event.filename}:${event.lineno}`]);
    };

    const handleRejection = (event: PromiseRejectionEvent) => {
      addLog('error', [`Unhandled Promise Rejection:`, event.reason]);
    };

    window.addEventListener('error', handleError);
    window.addEventListener('unhandledrejection', handleRejection);

    // Cleanup
    return () => {
      console.log = originalConsole.log;
      console.warn = originalConsole.warn;
      console.error = originalConsole.error;
      console.info = originalConsole.info;
      window.removeEventListener('error', handleError);
      window.removeEventListener('unhandledrejection', handleRejection);
    };
  }, []);

  const clearLogs = () => {
    setLogs([]);
    setHasErrors(false);
  };

  const getLevelColor = (level: LogEntry['level']) => {
    switch (level) {
      case 'error': return '#f44336';
      case 'warn': return '#ff9800';
      case 'info': return '#2196f3';
      default: return '#4caf50';
    }
  };

  // Only render on mobile or when debug=true
  const isMobile = typeof window !== 'undefined' && /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  const isDebug = typeof window !== 'undefined' && window.location.search.includes('debug=true');
  
  if (!isMobile && !isDebug) {
    return null;
  }

  return (
    <>
      {/* Debug FAB */}
      <Fab
        color={hasErrors ? 'error' : 'primary'}
        size="small"
        onClick={() => setIsOpen(true)}
        sx={{
          position: 'fixed',
          top: 16,
          right: 16,
          zIndex: 9999,
          opacity: 0.8,
          '&:hover': { opacity: 1 }
        }}
      >
        <BugIcon />
      </Fab>

      {/* Debug Dialog */}
      <Dialog
        open={isOpen}
        onClose={() => setIsOpen(false)}
        maxWidth="md"
        fullWidth
        fullScreen
        sx={{
          zIndex: 10000,
          '& .MuiDialog-paper': {
            backgroundColor: '#000',
            color: '#fff',
          }
        }}
      >
        <DialogTitle sx={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center',
          backgroundColor: '#1a1a1a',
          color: '#fff'
        }}>
          <Typography variant="h6">Debug Console ({logs.length} logs)</Typography>
          <Box>
            <IconButton onClick={clearLogs} sx={{ color: 'white', mr: 1 }}>
              <ClearIcon />
            </IconButton>
            <IconButton onClick={() => setIsOpen(false)} sx={{ color: 'white' }}>
              <CloseIcon />
            </IconButton>
          </Box>
        </DialogTitle>
        
        <DialogContent sx={{ 
          padding: 0, 
          backgroundColor: '#000',
          color: '#fff'
        }}>
          {logs.length === 0 ? (
            <Box sx={{ p: 2, textAlign: 'center' }}>
              <Typography color="text.secondary">No console output yet</Typography>
            </Box>
          ) : (
            <List sx={{ maxHeight: '80vh', overflow: 'auto' }}>
              {logs.map((log, index) => (
                <ListItem 
                  key={index}
                  sx={{ 
                    borderBottom: '1px solid #333',
                    alignItems: 'flex-start',
                    display: 'block'
                  }}
                >
                  <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                    <Chip
                      label={log.level.toUpperCase()}
                      size="small"
                      sx={{
                        backgroundColor: getLevelColor(log.level),
                        color: 'white',
                        fontSize: '0.7rem',
                        mr: 1
                      }}
                    />
                    <Typography variant="caption" sx={{ color: '#888' }}>
                      {log.timestamp}
                    </Typography>
                  </Box>
                  <Typography 
                    sx={{ 
                      fontFamily: 'monospace',
                      fontSize: '0.8rem',
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                      color: '#fff'
                    }}
                  >
                    {log.message}
                  </Typography>
                </ListItem>
              ))}
            </List>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}