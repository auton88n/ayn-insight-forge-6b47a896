import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders as getCorsHeadersFn } from '../_shared/cors.ts';

const corsHeaders = {
  ...getCorsHeadersFn({ headers: new Headers() } as Request),
  'Content-Security-Policy': "default-src 'self'; script-src 'none'; object-src 'none';",
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'X-XSS-Protection': '1; mode=block',
}

interface FileUploadRequest {
  file: string; // base64 encoded file
  fileName: string;
  fileType: string;
  userId: string;
}

// Allowed file types - exactly 16 extensions across 9 categories
const ALLOWED_FILE_TYPES = [
  // Documents
  'application/pdf',
  // Spreadsheets
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
  'application/vnd.ms-excel', // .xls
  'text/csv',
  // Text Files
  'text/plain',
  // Structured Data
  'application/json',
  'application/xml',
  'text/xml',
  'text/html',
  // Images (with AI vision analysis)
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/bmp',
  'image/svg+xml',
];

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

// Magic byte signatures for file type verification
const FILE_SIGNATURES: Record<string, number[][]> = {
  'application/pdf': [[0x25, 0x50, 0x44, 0x46]], // %PDF
  'image/jpeg': [[0xFF, 0xD8, 0xFF]],
  'image/png': [[0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]],
  'image/gif': [[0x47, 0x49, 0x46, 0x38, 0x37, 0x61], [0x47, 0x49, 0x46, 0x38, 0x39, 0x61]],
  'image/webp': [[0x52, 0x49, 0x46, 0x46]], // RIFF
  'image/bmp': [[0x42, 0x4D]], // BM
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': [[0x50, 0x4B, 0x03, 0x04]], // ZIP
  'application/vnd.ms-excel': [[0xD0, 0xCF, 0x11, 0xE0]], // OLE compound
};

// Dangerous file extensions
const DANGEROUS_EXTENSIONS = [
  'exe', 'dll', 'bat', 'cmd', 'com', 'msi', 'scr', 'pif',
  'vbs', 'vbe', 'js', 'jse', 'ws', 'wsf', 'wsc', 'wsh',
  'ps1', 'psm1', 'psd1', 'ps1xml', 'psc1', 'psc2',
  'hta', 'jar', 'php', 'asp', 'aspx', 'cgi', 'pl',
  'sh', 'bash', 'zsh', 'reg', 'inf', 'lnk', 'url',
];

// Suspicious patterns in file content
const SUSPICIOUS_PATTERNS = [
  /<script[\s>]/i,
  /javascript:/i,
  /<iframe[\s>]/i,
  /on\w+\s*=/i,
  /eval\s*\(/i,
  /document\.(write|cookie)/i,
  /<embed[\s>]/i,
  /<object[\s>]/i,
  /vbscript:/i,
  /data:text\/html/i,
];

// PDF-specific dangerous patterns
const PDF_DANGEROUS_PATTERNS = [
  /\/JavaScript/i,
  /\/Launch/i,
  /\/OpenAction.*\/JavaScript/i,
  /\/AA\s/i,
  /\/EmbeddedFile/i,
];

function validateMagicBytes(fileBuffer: Uint8Array, declaredType: string): boolean {
  const expectedSignatures = FILE_SIGNATURES[declaredType];
  
  // If we don't have signatures for this type, skip check
  if (!expectedSignatures) {
    return true;
  }

  return expectedSignatures.some(signature => 
    signature.every((byte, index) => fileBuffer[index] === byte)
  );
}

function validateFileExtension(fileName: string): { valid: boolean; error?: string } {
  const extension = fileName.split('.').pop()?.toLowerCase() || '';
  
  if (DANGEROUS_EXTENSIONS.includes(extension)) {
    return { valid: false, error: `Files with .${extension} extension are not allowed` };
  }

  // Check for double extensions
  const parts = fileName.toLowerCase().split('.');
  if (parts.length > 2) {
    const hasHiddenDanger = parts.slice(1).some(ext => DANGEROUS_EXTENSIONS.includes(ext));
    if (hasHiddenDanger) {
      return { valid: false, error: 'Suspicious double extension detected' };
    }
  }

  return { valid: true };
}

function scanForMaliciousContent(content: string, fileType: string): { safe: boolean; reason?: string } {
  // Check general suspicious patterns
  for (const pattern of SUSPICIOUS_PATTERNS) {
    if (pattern.test(content)) {
      return { safe: false, reason: 'Potentially dangerous content detected' };
    }
  }

  // Additional PDF checks
  if (fileType === 'application/pdf') {
    for (const pattern of PDF_DANGEROUS_PATTERNS) {
      if (pattern.test(content)) {
        return { safe: false, reason: 'PDF contains potentially dangerous active content' };
      }
    }
  }

  // SVG checks
  if (fileType === 'image/svg+xml') {
    if (/<script/i.test(content) || /javascript:/i.test(content) || /on\w+=/i.test(content)) {
      return { safe: false, reason: 'SVG contains executable code' };
    }
  }

  return { safe: true };
}

function sanitizeFileName(fileName: string): string {
  let sanitized = fileName
    .replace(/\.\./g, '')        // Remove path traversal
    .replace(/[\/\\]/g, '')      // Remove directory separators
    .replace(/\0/g, '')          // Remove null bytes
    .replace(/[<>:"|?*]/g, '')   // Remove dangerous characters
    .replace(/\s+/g, '_');       // Replace spaces with underscores
  
  // Limit length
  if (sanitized.length > 200) {
    const ext = sanitized.split('.').pop() || '';
    const name = sanitized.slice(0, 200 - ext.length - 1);
    sanitized = `${name}.${ext}`;
  }

  return sanitized || 'unnamed_file';
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Verify authentication
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('Missing authorization header');
    }

    const { data: { user }, error: userError } = await supabaseClient.auth.getUser(
      authHeader.replace('Bearer ', '')
    );

    if (userError || !user) {
      throw new Error('Unauthorized');
    }

    // SERVER-SIDE RATE LIMIT CHECK (50 uploads per hour)
    const { data: rateLimitResult, error: rateLimitError } = await supabaseClient
      .rpc('check_api_rate_limit', {
        p_user_id: user.id,
        p_endpoint: 'file-upload',
        p_max_requests: 50,
        p_window_minutes: 60
      });

    if (rateLimitError) {
      console.error('Rate limit check error:', rateLimitError);
    }

    if (rateLimitResult && rateLimitResult.length > 0 && !rateLimitResult[0].allowed) {
      const result = rateLimitResult[0];
      console.warn('Rate limit exceeded for file upload, user:', user.id);
      
      return new Response(
        JSON.stringify({ 
          error: 'Upload rate limit exceeded. Please try again later.',
          retryAfter: result.retry_after_seconds || 3600
        }),
        { 
          status: 429,
          headers: { 
            ...corsHeaders,
            'Content-Type': 'application/json',
            'Retry-After': String(result.retry_after_seconds || 3600)
          }
        }
      );
    }

    const { file, fileName, fileType, userId }: FileUploadRequest = await req.json();
    
    // Verify user can only upload their own files
    if (user.id !== userId) {
      throw new Error('Cannot upload files for other users');
    }

    // Sanitize filename
    const sanitizedFileName = sanitizeFileName(fileName);
    console.log('Received file upload request:', { 
      originalFileName: fileName, 
      sanitizedFileName, 
      fileType, 
      userId 
    });

    // Validate file extension
    const extValidation = validateFileExtension(sanitizedFileName);
    if (!extValidation.valid) {
      console.warn('Dangerous extension blocked:', { fileName, userId });
      return new Response(
        JSON.stringify({ error: extValidation.error }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate file type against allowed list
    if (!ALLOWED_FILE_TYPES.includes(fileType)) {
      console.warn('Disallowed file type:', { fileType, userId });
      return new Response(
        JSON.stringify({ error: 'File type not allowed' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Convert base64 to buffer
    const fileBuffer = Uint8Array.from(atob(file), c => c.charCodeAt(0));
    
    console.log('File size:', fileBuffer.length);

    // Validate file size
    if (fileBuffer.length > MAX_FILE_SIZE) {
      return new Response(
        JSON.stringify({ error: 'File size exceeds 10MB limit' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate magic bytes
    if (!validateMagicBytes(fileBuffer, fileType)) {
      console.warn('Magic byte mismatch:', { fileType, userId, fileName: sanitizedFileName });
      return new Response(
        JSON.stringify({ error: 'File content does not match its declared type' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Scan text-based files for malicious content
    const textTypes = ['text/plain', 'text/html', 'text/xml', 'text/csv', 
                       'application/json', 'application/xml', 'image/svg+xml', 
                       'application/pdf'];
    
    if (textTypes.includes(fileType)) {
      try {
        const decoder = new TextDecoder('utf-8', { fatal: false });
        const content = decoder.decode(fileBuffer.slice(0, 1024 * 1024)); // First 1MB
        
        const scanResult = scanForMaliciousContent(content, fileType);
        if (!scanResult.safe) {
          console.warn('Malicious content detected:', { 
            reason: scanResult.reason, 
            userId, 
            fileName: sanitizedFileName 
          });
          return new Response(
            JSON.stringify({ error: scanResult.reason || 'File contains suspicious content' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      } catch (e) {
        console.log('Could not scan file content, proceeding with upload');
      }
    }

    // Generate unique filename with sanitized name
    const timestamp = Date.now();
    const uniqueFileName = `${userId}/${timestamp}_${sanitizedFileName}`;
    
    console.log('Uploading file to path:', uniqueFileName);

    // Upload file to Supabase Storage
    const { data: uploadData, error: uploadError } = await supabaseClient.storage
      .from('attachments')
      .upload(uniqueFileName, fileBuffer, {
        contentType: fileType,
        upsert: false
      });

    if (uploadError) {
      console.error('Upload error:', uploadError);
      return new Response(
        JSON.stringify({ error: 'Failed to upload file' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('File uploaded successfully:', uploadData);

    // Get signed URL for the uploaded file
    const { data: urlData } = await supabaseClient.storage
      .from('attachments')
      .createSignedUrl(uniqueFileName, 60 * 60 * 24 * 7); // 7 days

    const fileUrl = urlData?.signedUrl || '';

    return new Response(
      JSON.stringify({
        success: true,
        fileUrl,
        fileName: sanitizedFileName,
        fileType,
        filePath: uniqueFileName
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );

  } catch (error) {
    console.error('Error in file upload:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
