#!/usr/bin/env node

import { createCanvas } from 'canvas';
import fs from 'fs';
import path from 'path';

console.log('🖼️  Generating test images...\n');

// Create test-images directory
const testDir = 'test-images';
if (!fs.existsSync(testDir)) {
  fs.mkdirSync(testDir);
}

// Test sizes focused around suspected limit
const testSizes = [3000, 3400, 3600, 3700, 3750, 3800, 3850, 3900, 4000];

for (const targetKB of testSizes) {
  const targetBytes = targetKB * 1024;
  const estimatedPixels = targetBytes / 2.5;
  const dimension = Math.sqrt(estimatedPixels);
  const width = Math.max(200, Math.floor(dimension));
  const height = Math.max(200, Math.floor(dimension));

  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  // Fill with noise to prevent compression
  for (let x = 0; x < width; x += 8) {
    for (let y = 0; y < height; y += 8) {
      const r = Math.floor(Math.random() * 255);
      const g = Math.floor(Math.random() * 255);
      const b = Math.floor(Math.random() * 255);
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      ctx.fillRect(x, y, 8, 8);
    }
  }

  // Add labels
  ctx.fillStyle = 'black';
  ctx.font = '30px Arial';
  ctx.fillText(`Test ${targetKB}KB`, 20, 50);

  const buffer = canvas.toBuffer('image/jpeg', { quality: 0.9 });
  const actualKB = Math.round(buffer.length / 1024);
  const filename = path.join(testDir, `test-${targetKB}kb-actual-${actualKB}kb.jpg`);
  
  fs.writeFileSync(filename, buffer);
  console.log(`✅ Generated: ${filename} (target: ${targetKB}KB, actual: ${actualKB}KB)`);
}

console.log('\n✅ All test images generated in test-images/ directory');
console.log('📁 Files ready for Playwright upload testing');
