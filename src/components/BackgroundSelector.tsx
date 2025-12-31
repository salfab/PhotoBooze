import { Box, Typography, ImageList, ImageListItem, alpha } from '@mui/material';
import { Check as CheckIcon } from '@mui/icons-material';

const BACKGROUNDS = [
  { id: 'new-years-eve.jpg', name: 'New Year\'s Eve' },
  { id: 'art-deco.jpg', name: 'Art Deco' },
  { id: 'berlin.jpg', name: 'Berlin' },
  { id: 'cossonay.jpg', name: 'Cossonay' },
];

interface BackgroundSelectorProps {
  selected: string;
  onChange: (background: string) => void;
  disabled?: boolean;
}

export default function BackgroundSelector({ selected, onChange, disabled }: BackgroundSelectorProps) {
  return (
    <Box sx={{ mt: 2 }}>
      <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: 'block' }}>
        Background
      </Typography>
      <ImageList cols={4} gap={8} sx={{ m: 0, overflow: 'visible' }}>
        {BACKGROUNDS.map((bg) => (
          <ImageListItem 
            key={bg.id}
            onClick={() => !disabled && onChange(bg.id)}
            sx={{ 
              cursor: disabled ? 'default' : 'pointer',
              position: 'relative',
              borderRadius: 1,
              overflow: 'hidden',
              border: selected === bg.id ? '2px solid #667eea' : '2px solid transparent',
              opacity: disabled ? 0.5 : 1,
              transition: 'all 0.2s',
              '&:hover': disabled ? {} : {
                transform: 'scale(1.05)',
                boxShadow: 2,
              },
            }}
          >
            <img
              src={`/backgrounds/${bg.id}`}
              alt={bg.name}
              loading="lazy"
              style={{ 
                width: '100%', 
                height: 60, 
                objectFit: 'cover',
                display: 'block',
              }}
            />
            {selected === bg.id && (
              <Box
                sx={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: alpha('#667eea', 0.3),
                }}
              >
                <CheckIcon sx={{ color: 'white', fontSize: 32 }} />
              </Box>
            )}
            <Typography
              variant="caption"
              sx={{
                position: 'absolute',
                bottom: 0,
                left: 0,
                right: 0,
                px: 0.5,
                py: 0.25,
                backgroundColor: 'rgba(0, 0, 0, 0.7)',
                color: 'white',
                fontSize: '0.65rem',
                textAlign: 'center',
              }}
            >
              {bg.name}
            </Typography>
          </ImageListItem>
        ))}
      </ImageList>
    </Box>
  );
}
