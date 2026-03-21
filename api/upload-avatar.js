import { put } from '@vercel/blob';
import busboy from 'busboy';
import sharp from 'sharp';
import dotenv from 'dotenv';

// Load environment variables for local testing
dotenv.config();

/**
 * Vercel serverless function to handle avatar uploads to Vercel Blob
 * 
 * Accepts multipart form data with:
 * - file: The image file to upload (optional if imageUrl is provided)
 * - imageUrl: URL of image to download and process (optional if file provided)
 * - filename: Optional custom filename (defaults to UUID)
 * 
 * Returns JSON response with:
 * - filename: The WebP filename
 * - url: The permanent URL of the uploaded blob
 */
export default async function handler(req, res) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Check for VERCEL_BLOB_READ_WRITE_TOKEN environment variable
  if (!process.env.VERCEL_BLOB_READ_WRITE_TOKEN) {
    return res.status(500).json({ 
      error: 'Blob storage token not configured' 
    });
  }

  try {
    // Parse multipart form data
    const bb = busboy({ headers: req.headers });
    let fileBuffer = null;
    let filename = null;
    let imageUrl = null;
    let contentType = null;

    // Handle form fields and file uploads
    bb.on('file', (fieldname, file, info) => {
      if (fieldname === 'file') {
        const chunks = [];
        
        file.on('data', (chunk) => {
          chunks.push(chunk);
        });

        file.on('end', () => {
          fileBuffer = Buffer.concat(chunks);
          contentType = info.mimeType;
        });
      }
    });

    bb.on('field', (fieldname, val) => {
      if (fieldname === 'filename') {
        filename = val;
      } else if (fieldname === 'imageUrl') {
        imageUrl = val;
      }
    });

    // Wait for busboy to finish processing
    await new Promise((resolve, reject) => {
      bb.on('close', resolve);
      bb.on('error', reject);
    });

    // If a URL is provided instead of a file, fetch it
    if (!fileBuffer && imageUrl) {
      try {
        const response = await fetch(imageUrl);
        if (!response.ok) throw new Error(`Status ${response.status}`);
        
        const arrayBuffer = await response.arrayBuffer();
        fileBuffer = Buffer.from(arrayBuffer);
        
        contentType = response.headers.get('content-type') || 'application/octet-stream';
        
        // If filename is not provided, try to extract it from URL
        if (!filename) {
          try {
            const urlPath = new URL(imageUrl).pathname;
            filename = urlPath.split('/').pop() || `avatar-${Date.now()}`;
          } catch {
            // keep the fallback below
          }
        }
      } catch (err) {
        return res.status(400).json({ error: `Failed to fetch image from URL: ${err.message}` });
      }
    }

    // Validate that a file (or url) was provided
    if (!fileBuffer) {
      return res.status(400).json({ error: 'No file or imageUrl provided' });
    }

    // Generate filename if not provided
    if (!filename) {
      filename = `avatar-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    }

    // Convert everything to WebP!
    try {
      fileBuffer = await sharp(fileBuffer)
        .webp({ quality: 80 })
        .toBuffer();
    } catch (err) {
      return res.status(400).json({ error: `Failed to process image: ${err.message}` });
    }

    // Just use .webp for the blob path
    const baseName = filename.split('.')[0];
    const finalFilename = `avatars/${baseName}.webp`;

    // Upload to Vercel Blob
    const blob = await put(finalFilename, fileBuffer, {
      contentType: 'image/webp',
      access: 'public'
    });

    // Return just the filename for Supabase storage (frontend will construct full URL if needed)
    const justFilename = `${baseName}.webp`;
    
    return res.status(200).json({
      filename: justFilename,          // Store this in Supabase - just "avatar.webp"
      url: blob.url,                   // Full URL: https://xxx.blob.vercel-storage.com/avatars/avatar.webp
      pathname: blob.pathname          // Path: avatars/avatar.webp
    });

  } catch (error) {
    console.error('Avatar upload error:', error);
    return res.status(500).json({ 
      error: 'Failed to upload avatar',
      details: error.message 
    });
  }
}
