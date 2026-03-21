import { put } from '@vercel/blob';
import busboy from 'busboy';

/**
 * Vercel serverless function to handle avatar uploads to Vercel Blob
 * 
 * Accepts multipart form data with:
 * - file: The image file to upload
 * - filename: Optional custom filename (defaults to UUID)
 * 
 * Returns JSON response with:
 * - url: The permanent URL of the uploaded blob
 * - contentType: The MIME type of the uploaded file
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
      }
    });

    // Wait for busboy to finish processing
    await new Promise((resolve, reject) => {
      bb.on('close', resolve);
      bb.on('error', reject);
    });

    // Validate that a file was provided
    if (!fileBuffer) {
      return res.status(400).json({ error: 'No file provided' });
    }

    // Generate filename if not provided
    if (!filename) {
      filename = `avatar-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    }

    // Remove extension if present in filename, we'll add it based on MIME type
    const baseName = filename.split('.')[0];
    
    // Determine file extension from content type
    const extensionMap = {
      'image/jpeg': '.jpg',
      'image/jpg': '.jpg',
      'image/png': '.png',
      'image/gif': '.gif',
      'image/webp': '.webp',
      'image/svg+xml': '.svg'
    };
    
    const extension = extensionMap[contentType] || '.jpg';
    const finalFilename = `avatars/${baseName}${extension}`;

    // Upload to Vercel Blob
    const blob = await put(finalFilename, fileBuffer, {
      contentType,
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
