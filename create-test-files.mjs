// Quick test file creator
import fs from 'fs';
import path from 'path';

// Create test files of different sizes
const sizes = [
  { name: 'test-3mb.dat', sizeMB: 3 },
  { name: 'test-3p5mb.dat', sizeMB: 3.5 },
  { name: 'test-3p8mb.dat', sizeMB: 3.8 },
  { name: 'test-4mb.dat', sizeMB: 4 },
];

for (const { name, sizeMB } of sizes) {
  const bytes = Math.floor(sizeMB * 1024 * 1024);
  const buffer = Buffer.alloc(bytes, 0xFF);
  fs.writeFileSync(name, buffer);
  console.log(`Created ${name} (${sizeMB}MB)`);
}

console.log('Done!');
