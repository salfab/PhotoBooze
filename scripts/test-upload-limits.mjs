#!/usr/bin/env node

/**
 * Empirical Vercel Upload Limit Test
 * 
 * This script generates test images of varying sizes and attempts to upload them
 * to find the exact cutoff point for Vercel's request body limit.
 */

import { createCanvas } from 'canvas';
import FormData from 'form-data';
import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';

// Configuration
const API_URL = process.env.API_URL || 'http://localhost:3000';
const TEST_PARTY_ID = process.env.TEST_PARTY_ID; // You'll need to create a test party
const TEST_TOKEN = process.env.TEST_TOKEN; // You'll need a valid session token

// Test image sizes (in KB) - focused around suspected 4MB limit
const TEST_SIZES_KB = [
  500,   // 0.5MB - baseline
  1000,  // 1MB  
  2000,  // 2MB
  3000,  // 3MB
  3200,  // 3.2MB
  3400,  // 3.4MB
  3600,  // 3.6MB
  3700,  // 3.7MB
  3750,  // 3.75MB
  3800,  // 3.8MB - around where user saw failures
  3850,  // 3.85MB
  3900,  // 3.9MB
  3950,  // 3.95MB
  4000,  // 4MB - supposed FormData limit
  4050,  // 4.05MB
  4100,  // 4.1MB
  4200,  // 4.2MB
  4300,  // 4.3MB
  4400,  // 4.4MB
  4500,  // 4.5MB - documented Vercel limit
  4600,  // 4.6MB
  5000,  // 5MB
];

/**
 * Generate a test image of approximately the target size
 */
function generateTestImage(targetSizeKB) {
  // Calculate approximate dimensions for target file size
  // JPEG compression varies, so this is an approximation
  const targetBytes = targetSizeKB * 1024;
  
  // More aggressive estimate for JPEG with noise pattern
  const estimatedPixels = targetBytes / 2.5; // Adjusted for noisy content
  const dimension = Math.sqrt(estimatedPixels);
  
  const width = Math.max(200, Math.floor(dimension));
  const height = Math.max(200, Math.floor(dimension));
  
  console.log(`  Generating ${width}x${height} canvas for target ${targetSizeKB}KB...`);
  
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  
  // Fill with a noisy pattern to prevent over-compression
  for (let x = 0; x < width; x += 8) {
    for (let y = 0; y < height; y += 8) {
      const r = Math.floor(Math.random() * 255);
      const g = Math.floor(Math.random() * 255);
      const b = Math.floor(Math.random() * 255);
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      ctx.fillRect(x, y, 8, 8);
    }
  }
  
  // Add some text to make it more realistic
  ctx.fillStyle = 'black';
  ctx.font = '24px Arial';
  ctx.fillText(`Test Image ${targetSizeKB}KB`, 20, 40);
  ctx.fillText(`${width}x${height}`, 20, 70);
  ctx.fillText(`Target: ${targetSizeKB}KB`, 20, 100);
  
  // Generate with high quality to control size better
  const buffer = canvas.toBuffer('image/jpeg', { quality: 0.9 });
  
  // If we're way off target, try to adjust
  const actualSizeKB = Math.round(buffer.length / 1024);
  console.log(`  Generated: ${actualSizeKB}KB (target: ${targetSizeKB}KB)`);
  
  return buffer;
}

/**
 * Calculate FormData size including overhead
 */
function calculateFormDataSize(originalBuffer, formFields = {}) {\n  // Approximate FormData overhead calculation\n  // Each field has boundary markers, headers, etc.\n  const boundaryOverhead = 150; // Rough estimate per field\n  const fieldCount = Object.keys(formFields).length + 1; // +1 for file\n  const headerOverhead = 200; // Content-Type, etc.\n  \n  let totalSize = originalBuffer.length;\n  totalSize += fieldCount * boundaryOverhead;\n  totalSize += headerOverhead;\n  \n  // Add text field sizes\n  Object.values(formFields).forEach(value => {\n    if (typeof value === 'string') {\n      totalSize += value.length;\n    }\n  });\n  \n  return totalSize;\n}

/**
 * Attempt to upload a test image
 */
async function testUpload(imageBuffer, targetSizeKB) {
  try {
    const actualSizeKB = Math.round(imageBuffer.length / 1024);
    
    const formFields = {\n      originalMime: 'image/jpeg',\n      originalExt: 'jpg',\n      useSameForTv: 'true',\n      comment: `Test upload ${targetSizeKB}KB`\n    };\n    \n    const estimatedFormDataSize = calculateFormDataSize(imageBuffer, formFields);\n    const estimatedFormDataKB = Math.round(estimatedFormDataSize / 1024);\n    \n    const formData = new FormData();\n    \n    formData.append('original', imageBuffer, {\n      filename: `test-${targetSizeKB}kb.jpg`,\n      contentType: 'image/jpeg'\n    });\n    \n    Object.entries(formFields).forEach(([key, value]) => {\n      formData.append(key, value);\n    });\n    \n    console.log(`Testing ${targetSizeKB}KB (actual: ${actualSizeKB}KB, FormData: ~${estimatedFormDataKB}KB)...`);\n    \n    const headers = {};\n    if (TEST_TOKEN) {\n      headers['Cookie'] = `photobooze_session=${TEST_TOKEN}`;\n    }\n    \n    const response = await fetch(`${API_URL}/api/photos`, {\n      method: 'POST',\n      body: formData,\n      headers\n    });\n    \n    const success = response.ok;\n    const status = response.status;\n    const actualFormDataSize = formData.getLengthSync ? formData.getLengthSync() : estimatedFormDataSize;\n    const actualFormDataKB = Math.round(actualFormDataSize / 1024);\n    \n    let responseBody = '';\n    let errorMessage = '';\n    \n    try {\n      responseBody = await response.text();\n      if (!success) {\n        errorMessage = responseBody.substring(0, 300);\n      }\n    } catch (e) {\n      errorMessage = response.statusText;\n    }\n    \n    return {\n      targetSizeKB,\n      actualSizeKB,\n      estimatedFormDataKB,\n      actualFormDataKB,\n      formDataOverhead: actualFormDataKB - actualSizeKB,\n      success,\n      status,\n      errorMessage: errorMessage.trim(),\n      responseBody: success ? responseBody.substring(0, 200) : ''\n    };\n    \n  } catch (error) {\n    return {\n      targetSizeKB,\n      actualSizeKB: Math.round(imageBuffer.length / 1024),\n      estimatedFormDataKB: 0,\n      actualFormDataKB: 0,\n      formDataOverhead: 0,\n      success: false,\n      status: 'ERROR',\n      errorMessage: error.message.substring(0, 300),\n      responseBody: ''\n    };\n  }\n}

/**
 * Run the test suite
 */
async function runTests() {
  console.log('🧪 Starting Empirical Vercel Upload Limit Test');\n  console.log('='.repeat(50));\n  console.log(`API URL: ${API_URL}`);\n  console.log(`Test Party ID: ${TEST_PARTY_ID || 'Not set (may cause auth errors)'}`);\n  console.log(`Test Token: ${TEST_TOKEN ? 'Set' : 'Not set (may cause auth errors)'}`);\n  console.log(`Testing ${TEST_SIZES_KB.length} different image sizes...\\n`);\n  \n  const results = [];\n  let lastSuccessSize = 0;\n  let firstFailureSize = Infinity;\n  let lastSuccessFormDataSize = 0;\n  let firstFailureFormDataSize = Infinity;\n  \n  for (const sizeKB of TEST_SIZES_KB) {\n    console.log(`\\n--- Testing ${sizeKB}KB ---`);\n    const imageBuffer = generateTestImage(sizeKB);\n    const result = await testUpload(imageBuffer, sizeKB);\n    \n    results.push(result);\n    \n    if (result.success) {\n      lastSuccessSize = Math.max(lastSuccessSize, result.actualSizeKB);\n      lastSuccessFormDataSize = Math.max(lastSuccessFormDataSize, result.actualFormDataKB);\n      console.log(`✅ SUCCESS - File: ${result.actualSizeKB}KB, FormData: ${result.actualFormDataKB}KB, Overhead: ${result.formDataOverhead}KB`);\n    } else {\n      firstFailureSize = Math.min(firstFailureSize, result.actualSizeKB);\n      firstFailureFormDataSize = Math.min(firstFailureFormDataSize, result.actualFormDataKB);\n      console.log(`❌ FAILED (${result.status}) - File: ${result.actualSizeKB}KB, FormData: ${result.actualFormDataKB}KB`);\n      console.log(`   Error: ${result.errorMessage}`);\n    }\n    \n    // Small delay to avoid overwhelming the server\n    await new Promise(resolve => setTimeout(resolve, 1000));\n  }\n  \n  console.log('\\n' + '='.repeat(70));\n  console.log('📊 RESULTS SUMMARY');\n  console.log('='.repeat(70));\n  \n  console.log('\\nDetailed Results:');\n  console.log('Target | Actual | FormData | Overhead | Status | Result | Error');\n  console.log('-------|--------|----------|----------|--------|--------|---------');\n  \n  results.forEach(r => {\n    const status = r.success ? '✅ PASS' : '❌ FAIL';\n    const error = r.errorMessage.length > 30 ? r.errorMessage.substring(0, 30) + '...' : r.errorMessage;\n    console.log(`${String(r.targetSizeKB + 'KB').padStart(6)} | ${String(r.actualSizeKB + 'KB').padStart(6)} | ${String(r.actualFormDataKB + 'KB').padStart(8)} | ${String(r.formDataOverhead + 'KB').padStart(8)} | ${String(r.status).padStart(6)} | ${status.padStart(6)} | ${error}`);\n  });\n  \n  console.log(`\\n🎯 CRITICAL FINDINGS:`);\n  console.log('-'.repeat(30));\n  console.log(`Last successful file size: ${lastSuccessSize}KB`);\n  console.log(`First failed file size: ${firstFailureSize}KB`);\n  console.log(`Last successful FormData size: ${lastSuccessFormDataSize}KB`);\n  console.log(`First failed FormData size: ${firstFailureFormDataSize}KB`);\n  \n  if (lastSuccessFormDataSize > 0 && firstFailureFormDataSize < Infinity) {\n    const cutoffPoint = (lastSuccessFormDataSize + firstFailureFormDataSize) / 2;\n    const safeLimit = Math.floor(lastSuccessFormDataSize * 0.9);\n    console.log(`\\n🚨 EMPIRICAL CUTOFF POINT: ~${cutoffPoint.toFixed(0)}KB FormData`);\n    console.log(`🛡️  RECOMMENDED SAFE LIMIT: ${safeLimit}KB FormData (with 10% safety margin)`);\n    console.log(`📏 CLIENT-SIDE FILE LIMIT: ~${Math.floor(safeLimit * 0.85)}KB (accounting for FormData overhead)`);\n  }\n  \n  // Calculate average FormData overhead\n  const successfulResults = results.filter(r => r.success && r.formDataOverhead > 0);\n  if (successfulResults.length > 0) {\n    const avgOverhead = successfulResults.reduce((sum, r) => sum + r.formDataOverhead, 0) / successfulResults.length;\n    console.log(`\\n📊 AVERAGE FORMDATA OVERHEAD: ${avgOverhead.toFixed(1)}KB (${(avgOverhead / lastSuccessSize * 100).toFixed(1)}% of file size)`);\n  }\n  \n  // Save results to file\n  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');\n  const filename = `vercel-upload-test-${timestamp}.json`;\n  const reportData = {\n    testConfig: {\n      apiUrl: API_URL,\n      testSizes: TEST_SIZES_KB,\n      timestamp: new Date().toISOString()\n    },\n    findings: {\n      lastSuccessSize,\n      firstFailureSize,\n      lastSuccessFormDataSize,\n      firstFailureFormDataSize,\n      avgOverhead: successfulResults.length > 0 ? successfulResults.reduce((sum, r) => sum + r.formDataOverhead, 0) / successfulResults.length : 0\n    },\n    results\n  };\n  \n  fs.writeFileSync(filename, JSON.stringify(reportData, null, 2));\n  console.log(`\\n💾 Detailed results saved to: ${filename}`);\n}\n\n// Check if required dependencies are available\nasync function checkDependencies() {\n  try {\n    const canvas = await import('canvas');\n    const formData = await import('form-data');\n    const fetch = await import('node-fetch');\n    return true;\n  } catch (error) {\n    console.error('❌ Missing dependencies. Install with:');\n    console.error('npm install canvas form-data node-fetch');\n    console.error('\\nOn Windows, you may also need:');\n    console.error('npm install --global windows-build-tools');\n    console.error('npm config set msvs_version 2017');\n    return false;\n  }\n}\n\n// Main execution\nasync function main() {\n  const hasDependencies = await checkDependencies();\n  if (!hasDependencies) {\n    process.exit(1);\n  }\n  \n  if (!TEST_TOKEN) {\n    console.log('⚠️  Warning: TEST_TOKEN not set. You may get authentication errors.');\n    console.log('   Set it with: TEST_TOKEN=your_session_token npm run test-limits');\n  }\n  \n  if (!TEST_PARTY_ID) {\n    console.log('⚠️  Warning: TEST_PARTY_ID not set. You may get validation errors.');\n    console.log('   Set it with: TEST_PARTY_ID=your_test_party_id npm run test-limits');\n  }\n  \n  if (!process.env.API_URL) {\n    console.log('💡 Testing against localhost. To test production:');\n    console.log('   API_URL=https://your-app.vercel.app npm run test-limits\\n');\n  }\n  \n  console.log('Press Ctrl+C to cancel, or Enter to continue...\\n');\n  \n  // Wait for user confirmation\n  process.stdin.setRawMode(true);\n  process.stdin.resume();\n  process.stdin.on('data', (key) => {\n    if (key[0] === 3) { // Ctrl+C\n      process.exit(0);\n    } else if (key[0] === 13) { // Enter\n      process.stdin.setRawMode(false);\n      process.stdin.pause();\n      runTests().catch(console.error);\n    }\n  });\n}\n\nif (import.meta.url === `file://${process.argv[1]}`) {\n  main().catch(console.error);\n}