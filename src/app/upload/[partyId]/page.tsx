'use client';

import { useParams } from 'next/navigation';
import {
  Container,
  Box,
  Typography,
} from '@mui/material';
import { CameraAlt as CameraIcon } from '@mui/icons-material';
import styles from './page.module.css';

export default function UploadPage() {
  const params = useParams();
  const partyId = params.partyId as string;

  return (
    <Container maxWidth="sm" className={styles.container}>
      <Box className={styles.header}>
        <CameraIcon className={styles.icon} />
        <Typography variant="h4" component="h1" gutterBottom>
          Upload Photos
        </Typography>
        <Typography variant="body1" color="text.secondary">
          Party: {partyId.slice(0, 8)}...
        </Typography>
      </Box>

      <Box className={styles.uploadArea}>
        <Typography variant="body1" color="text.secondary">
          Photo upload coming soon...
        </Typography>
      </Box>
    </Container>
  );
}
