import dotenv from 'dotenv';
import { put, list, del } from '@vercel/blob';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';

// Load environment variables from .env file
dotenv.config();

/**
 * Batch Avatar Upload Script
 * 
 * Uploads all images from the resources/images directory to Vercel Blob
 * Automatically optimizes images using sharp before upload
 * 
 * Usage:
 *   npm run upload-avatars
 * 
 * Environment Variables Required:
 *   VERCEL_BLOB_READ_WRITE_TOKEN - Token for Vercel Blob access
 */

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const IMAGES_DIR = path.join(__dirname, 'resources', 'images');
const BLOB_PREFIX = 'avatars/';
const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];

/**
 * Validate environment setup
 */
function validateEnvironment() {
  if (!process.env.VERCEL_BLOB_READ_WRITE_TOKEN) {
    console.error('❌ ERROR: VERCEL_BLOB_READ_WRITE_TOKEN environment variable not set');
    console.error('   Please set your Vercel Blob token before running this script');
    process.exit(1);
  }
  
  if (!fs.existsSync(IMAGES_DIR)) {
    console.error(`❌ ERROR: Images directory not found: ${IMAGES_DIR}`);
    process.exit(1);
  }
  
  console.log('✓ Environment validated');
}

/**
 * Get all image files from resources/images directory
 */
function getImageFiles() {
  const files = fs.readdirSync(IMAGES_DIR);
  return files.filter(file => 
    IMAGE_EXTENSIONS.includes(path.extname(file).toLowerCase())
  );
}

/**
 * Convert image to WebP format
 * WebP provides superior compression compared to PNG/JPG
 */
async function convertToWebP(filePath) {
  try {
    const buffer = await sharp(filePath)
      .webp({ quality: 80 })
      .toBuffer();
    return buffer;
  } catch (error) {
    console.warn(`⚠ Could not convert ${path.basename(filePath)} to WebP: ${error.message}`);
    // Fall back to original file
    return fs.readFileSync(filePath);
  }
}

/**
 * Get MIME type from file extension
 */
function getMimeType(filename) {
  const ext = path.extname(filename).toLowerCase();
  const mimeTypes = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.webp': 'image/webp'
  };
  return mimeTypes[ext] || 'image/jpeg';
}

/**
 * Upload a single image to Vercel Blob
 */
async function uploadImage(filename) {
  const filePath = path.join(IMAGES_DIR, filename);
  
  try {
    console.log(`⏳ Converting ${filename} to WebP...`);
    
    // Convert image to WebP
    const buffer = await convertToWebP(filePath);
    const fileSize = buffer.length;
    
    // Get base name without extension
    const blobName = path.parse(filename).name;
    const blobPath = `${BLOB_PREFIX}${blobName}`;
    
    // Delete old versions (jpg, jpeg, png, gif, webp)
    const oldExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
    for (const ext of oldExtensions) {
      if (ext !== '.webp') { // Skip webp for now
        try {
          await del([`${BLOB_PREFIX}${blobName}${ext}`]);
          console.log(`   ✓ Deleted old ${blobName}${ext}`);
        } catch (e) {
          // File might not exist, continue
        }
      }
    }
    
    // Upload new WebP version
    const blob = await put(`${blobPath}.webp`, buffer, {
      contentType: 'image/webp',
      access: 'public'
    });
    
    const sizeKB = (fileSize / 1024).toFixed(2);
    console.log(`✓ ${filename} → ${sizeKB} KB (as WebP)`);
    console.log(`  URL: ${blob.url}`);
    
    return {
      success: true,
      filename: `${blobName}.webp`,
      url: blob.url,
      size: fileSize
    };
  } catch (error) {
    console.error(`✗ Failed to upload ${filename}: ${error.message}`);
    return {
      success: false,
      filename,
      error: error.message
    };
  }
}

/**
 * List all avatars currently in Vercel Blob
 */
async function listAvatars() {
  try {
    console.log('\n📋 Avatars in Vercel Blob:');
    const { blobs } = await list({
      prefix: BLOB_PREFIX
    });
    
    if (blobs.length === 0) {
      console.log('   (none)');
      return;
    }
    
    blobs.forEach((blob, index) => {
      const sizeKB = (blob.size / 1024).toFixed(2);
      console.log(`   ${index + 1}. ${blob.pathname.replace(BLOB_PREFIX, '')} - ${sizeKB} KB`);
    });
  } catch (error) {
    console.error(`Failed to list avatars: ${error.message}`);
  }
}

/**
 * Delete an avatar from Vercel Blob
 */
async function deleteAvatar(filename) {
  try {
    const blobName = path.parse(filename).name;
    const blobPath = `${BLOB_PREFIX}${blobName}`;
    
    await del([blobPath]);
    console.log(`✓ Deleted ${filename}`);
    return true;
  } catch (error) {
    console.error(`Failed to delete ${filename}: ${error.message}`);
    return false;
  }
}

/**
 * Main execution
 */
async function main() {
  console.log('═══════════════════════════════════════════');
  console.log('  Vercel Blob Avatar Upload Manager');
  console.log('═══════════════════════════════════════════\n');

  // Validate environment
  validateEnvironment();

  // Get local image files
  const imageFiles = getImageFiles();
  
  if (imageFiles.length === 0) {
    console.log(`⚠ No image files found in ${IMAGES_DIR}`);
    console.log('   Supported formats: jpg, jpeg, png, gif, webp');
    console.log('   → All will be converted to WebP for efficient storage');
    process.exit(0);
  }

  console.log(`\n📁 Found ${imageFiles.length} image(s) to convert to WebP:\n`);

  // Upload all images
  const results = [];
  for (const filename of imageFiles) {
    const result = await uploadImage(filename);
    results.push(result);
  }

  // Summary
  const successful = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;

  console.log('\n═══════════════════════════════════════════');
  console.log(`\n📊 Upload Summary:`);
  console.log(`   Successful: ${successful}/${imageFiles.length}`);
  if (failed > 0) {
    console.log(`   Failed: ${failed}/${imageFiles.length}`);
  }

  // List all avatars
  await listAvatars();

  console.log('\n═══════════════════════════════════════════\n');

  // Exit with appropriate code
  process.exit(failed > 0 ? 1 : 0);
}

// Run the script
main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
