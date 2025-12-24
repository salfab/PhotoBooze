#!/usr/bin/env node

/**
 * Complete development environment setup script
 * Starts Supabase and creates the storage bucket
 */

import { execSync } from 'child_process';
import { existsSync } from 'fs';
import { createClient } from '@supabase/supabase-js';

const ENV_FILE = '.env.local';

console.log('🚀 Setting up PhotoBooze development environment...\n');

// Check if .env.local exists
if (!existsSync(ENV_FILE)) {
  console.error('❌ .env.local file not found!');
  console.error('\nPlease create .env.local with the following content:');
  console.error(`
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH
SUPABASE_SERVICE_ROLE_KEY=<paste_service_role_key_from_supabase_start>
SESSION_SECRET=dev-session-secret-change-in-production-32chars!!
NEXT_PUBLIC_APP_URL=http://localhost:3000
  `);
  console.error('\nRun "npx supabase start" first to get the SERVICE_ROLE_KEY');
  process.exit(1);
}

// Load environment variables
const envContent = await import('fs').then(fs => fs.promises.readFile(ENV_FILE, 'utf-8'));
const envVars = Object.fromEntries(
  envContent.split('\n')
    .filter(line => line && !line.startsWith('#'))
    .map(line => line.split('='))
    .filter(([key]) => key)
);

const supabaseUrl = envVars.NEXT_PUBLIC_SUPABASE_URL?.trim();
const serviceRoleKey = envVars.SUPABASE_SERVICE_ROLE_KEY?.trim();

if (!serviceRoleKey || !serviceRoleKey.startsWith('eyJ')) {
  console.error('❌ Invalid or missing SUPABASE_SERVICE_ROLE_KEY in .env.local');
  console.error('\nRun "npx supabase start" and copy the SERVICE_ROLE_KEY (long JWT token)');
  process.exit(1);
}

// Create storage bucket
console.log('🗄️  Setting up storage bucket...');

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

const bucketName = 'photobooze-images';

try {
  const { data: buckets, error: listError } = await supabase.storage.listBuckets();
  
  if (listError) {
    console.error('❌ Error listing buckets:', listError.message);
    console.error('\nMake sure Supabase is running: npx supabase start');
    process.exit(1);
  }

  const existingBucket = buckets.find(b => b.name === bucketName);

  if (existingBucket) {
    console.log('✅ Storage bucket already exists');
    
    // Ensure the bucket is public
    if (!existingBucket.public) {
      console.log('⚠️  Bucket is not public, updating...');
      const { error: updateError } = await supabase.storage.updateBucket(bucketName, {
        public: true,
        fileSizeLimit: 26214400,
        allowedMimeTypes: ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/heic', 'image/heif'],
      });
      
      if (updateError) {
        console.error('❌ Error updating bucket to public:', updateError.message);
        process.exit(1);
      }
      console.log('✅ Bucket updated to public');
    }
  } else {
    const { error } = await supabase.storage.createBucket(bucketName, {
      public: true,
      fileSizeLimit: 26214400, // 25MB
      allowedMimeTypes: ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/heic', 'image/heif'],
    });

    if (error) {
      console.error('❌ Error creating bucket:', error.message);
      process.exit(1);
    }

    console.log('✅ Storage bucket created successfully');
  }
} catch (error) {
  console.error('❌ Unexpected error:', error.message);
  process.exit(1);
}

console.log('\n✨ Setup complete! You can now run: pnpm dev\n');
