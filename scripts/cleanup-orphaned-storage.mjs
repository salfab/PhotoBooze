#!/usr/bin/env node

/**
 * Cleanup orphaned storage files
 * This script removes files from storage that don't have corresponding database records
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error('❌ Required environment variables:');
  console.error('   NEXT_PUBLIC_SUPABASE_URL');
  console.error('   SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

const STORAGE_BUCKET = 'photobooze-images';
const DRY_RUN = process.argv.includes('--dry-run');

async function main() {
  console.log('🧹 Starting storage cleanup...');
  console.log(`   Mode: ${DRY_RUN ? 'DRY RUN (no changes will be made)' : 'LIVE (files will be deleted)'}`);
  console.log('');

  // Get all parties from database
  const { data: parties, error: partiesError } = await supabase
    .from('parties')
    .select('id');

  if (partiesError) {
    console.error('❌ Failed to fetch parties:', partiesError.message);
    process.exit(1);
  }

  const validPartyIds = new Set(parties.map(p => p.id));
  console.log(`✅ Found ${validPartyIds.size} active parties in database`);
  console.log('');

  // List all folders in storage
  const { data: folders, error: listError } = await supabase.storage
    .from(STORAGE_BUCKET)
    .list('parties', { limit: 1000 });

  if (listError) {
    console.error('❌ Failed to list storage folders:', listError.message);
    process.exit(1);
  }

  console.log(`📁 Found ${folders?.length || 0} party folders in storage`);
  console.log('');

  if (!folders || folders.length === 0) {
    console.log('✅ No folders found in storage, nothing to clean up');
    return;
  }

  // Find orphaned folders
  const orphanedFolders = folders.filter(folder => !validPartyIds.has(folder.name));
  
  if (orphanedFolders.length === 0) {
    console.log('✅ No orphaned folders found');
    return;
  }

  console.log(`🗑️  Found ${orphanedFolders.length} orphaned party folders:`);
  orphanedFolders.forEach(folder => {
    console.log(`   • ${folder.name}`);
  });
  console.log('');

  // Calculate total files to delete
  let totalFiles = 0;
  const filesToDelete = [];

  for (const folder of orphanedFolders) {
    const partyFolder = `parties/${folder.name}`;
    
    // List files in original/ subdirectory
    const { data: originalFiles } = await supabase.storage
      .from(STORAGE_BUCKET)
      .list(`${partyFolder}/original`, { limit: 1000 });
    
    if (originalFiles && originalFiles.length > 0) {
      const paths = originalFiles.map(f => `${partyFolder}/original/${f.name}`);
      filesToDelete.push(...paths);
      totalFiles += originalFiles.length;
    }
    
    // List files in tv/ subdirectory
    const { data: tvFiles } = await supabase.storage
      .from(STORAGE_BUCKET)
      .list(`${partyFolder}/tv`, { limit: 1000 });
    
    if (tvFiles && tvFiles.length > 0) {
      const paths = tvFiles.map(f => `${partyFolder}/tv/${f.name}`);
      filesToDelete.push(...paths);
      totalFiles += tvFiles.length;
    }
  }

  console.log(`📊 Total orphaned files: ${totalFiles}`);
  console.log('');

  if (totalFiles === 0) {
    console.log('✅ No orphaned files to delete');
    return;
  }

  if (DRY_RUN) {
    console.log('🔍 DRY RUN: Files that would be deleted:');
    filesToDelete.forEach(path => {
      console.log(`   • ${path}`);
    });
    console.log('');
    console.log('💡 Run without --dry-run to actually delete these files');
    return;
  }

  // Delete files in batches of 100
  console.log('🗑️  Deleting orphaned files...');
  const batchSize = 100;
  let deleted = 0;
  let failed = 0;

  for (let i = 0; i < filesToDelete.length; i += batchSize) {
    const batch = filesToDelete.slice(i, i + batchSize);
    
    const { error: deleteError } = await supabase.storage
      .from(STORAGE_BUCKET)
      .remove(batch);

    if (deleteError) {
      console.error(`❌ Failed to delete batch ${Math.floor(i / batchSize) + 1}:`, deleteError.message);
      failed += batch.length;
    } else {
      deleted += batch.length;
      console.log(`   ✓ Deleted ${deleted}/${totalFiles} files`);
    }
  }

  console.log('');
  console.log('🎉 Cleanup complete:');
  console.log(`   ✅ Deleted: ${deleted} files`);
  if (failed > 0) {
    console.log(`   ❌ Failed: ${failed} files`);
  }
  
  // Calculate approximate storage saved (assuming average 2MB per file)
  const mbSaved = (deleted * 2).toFixed(1);
  console.log(`   💾 Approximate storage freed: ~${mbSaved} MB`);
}

main().catch(err => {
  console.error('❌ Unexpected error:', err);
  process.exit(1);
});
