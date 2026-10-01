// Magic byte signatures for file type validation
// These are the first bytes of different file types that help identify the actual content
const FILE_SIGNATURES: Record<string, number[][]> = {
  'application/pdf': [[0x25, 0x50, 0x44, 0x46]], // %PDF
  'image/jpeg': [[0xFF, 0xD8, 0xFF]],
  'image/png': [[0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]],
  'image/gif': [[0x47, 0x49, 0x46, 0x38, 0x37, 0x61], [0x47, 0x49, 0x46, 0x38, 0x39, 0x61]], // GIF87a, GIF89a
  'image/webp': [[0x52, 0x49, 0x46, 0x46]], // RIFF (WebP starts with RIFF)
  'image/bmp': [[0x42, 0x4D]], // BM
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': [[0x50, 0x4B, 0x03, 0x04]], // ZIP (xlsx)
  'application/vnd.ms-excel': [[0xD0, 0xCF, 0x11, 0xE0]], // OLE compound document
};

// Suspicious patterns that may indicate malicious content
const SUSPICIOUS_PATTERNS = [
  /<script[\s>]/i,           // JavaScript in documents
  /javascript:/i,            // JavaScript URLs
  /<iframe[\s>]/i,           // Embedded frames
  /on\w+\s*=/i,              // Event handlers (onclick, onload, etc.)
  /eval\s*\(/i,              // eval() calls
  /document\.(write|cookie)/i, // DOM manipulation
  /<embed[\s>]/i,            // Embedded objects
  /<object[\s>]/i,           // Object tags
  /base64,/i,                // Base64 data URIs (potential for hidden content)
  /vbscript:/i,              // VBScript
  /data:text\/html/i,        // Data URLs with HTML
];

// Patterns specifically dangerous in PDFs
const PDF_SUSPICIOUS_PATTERNS = [
  /\/JavaScript/i,           // JavaScript action in PDF
  /\/Launch/i,               // Launch action (external program)
  /\/OpenAction.*\/JavaScript/i, // Auto-execute JavaScript
  /\/AA\s/i,                 // Additional actions
  /\/EmbeddedFile/i,         // Embedded files
  /\/URI\s*\(/i,             // URI actions
];

// Dangerous file extensions that should never be allowed
const DANGEROUS_EXTENSIONS = [
  'exe', 'dll', 'bat', 'cmd', 'com', 'msi', 'scr', 'pif',
  'vbs', 'vbe', 'js', 'jse', 'ws', 'wsf', 'wsc', 'wsh',
  'ps1', 'psm1', 'psd1', 'ps1xml', 'psc1', 'psc2',
  'hta', 'jar', 'php', 'asp', 'aspx', 'cgi', 'pl',
  'sh', 'bash', 'zsh', 'reg', 'inf', 'lnk', 'url',
];

export interface FileValidationResult {
  isValid: boolean;
  error?: string;
  warnings?: string[];
}

/**
 * Validates a file's magic bytes against its declared MIME type
 */
export async function validateMagicBytes(file: File): Promise<FileValidationResult> {
  const expectedSignatures = FILE_SIGNATURES[file.type];
  
  // If we don't have signatures for this type, skip magic byte check
  // but still do other validations
  if (!expectedSignatures) {
    return { isValid: true };
  }

  try {
    const buffer = await file.slice(0, 16).arrayBuffer();
    const bytes = new Uint8Array(buffer);

    const matchesSignature = expectedSignatures.some(signature => 
      signature.every((byte, index) => bytes[index] === byte)
    );

    if (!matchesSignature) {
      return {
        isValid: false,
        error: 'File content does not match its declared type. The file may be corrupted or misnamed.',
      };
    }

    return { isValid: true };
  } catch {
    return {
      isValid: false,
      error: 'Unable to read file for validation.',
    };
  }
}

/**
 * Checks file content for suspicious patterns
 */
export async function scanForMaliciousContent(file: File): Promise<FileValidationResult> {
  const warnings: string[] = [];
  
  // Only scan text-based files
  const textTypes = [
    'text/plain', 'text/html', 'text/xml', 'text/csv',
    'application/json', 'application/xml', 'image/svg+xml',
    'application/pdf',
  ];

  if (!textTypes.some(type => file.type.includes(type) || file.type === type)) {
    return { isValid: true };
  }

  try {
    // Read first 1MB for scanning
    const slice = file.slice(0, 1024 * 1024);
    const text = await slice.text();

    // Check for general suspicious patterns
    for (const pattern of SUSPICIOUS_PATTERNS) {
      if (pattern.test(text)) {
        warnings.push(`Potentially dangerous content detected: ${pattern.source}`);
      }
    }

    // Additional checks for PDFs
    if (file.type === 'application/pdf') {
      for (const pattern of PDF_SUSPICIOUS_PATTERNS) {
        if (pattern.test(text)) {
          return {
            isValid: false,
            error: 'This PDF contains potentially dangerous active content and cannot be uploaded.',
          };
        }
      }
    }

    // SVG files need special attention
    if (file.type === 'image/svg+xml') {
      if (/<script/i.test(text) || /javascript:/i.test(text) || /on\w+=/i.test(text)) {
        return {
          isValid: false,
          error: 'This SVG contains executable code and cannot be uploaded.',
        };
      }
    }

    return {
      isValid: true,
      warnings: warnings.length > 0 ? warnings : undefined,
    };
  } catch {
    return { isValid: true }; // Don't block on read errors
  }
}

/**
 * Validates file extension is not in the dangerous list
 */
export function validateFileExtension(fileName: string): FileValidationResult {
  const extension = fileName.split('.').pop()?.toLowerCase() || '';
  
  if (DANGEROUS_EXTENSIONS.includes(extension)) {
    return {
      isValid: false,
      error: `Files with .${extension} extension are not allowed for security reasons.`,
    };
  }

  // Check for double extensions (e.g., file.jpg.exe)
  const parts = fileName.toLowerCase().split('.');
  if (parts.length > 2) {
    const hasHiddenDangerousExt = parts.slice(1).some(ext => DANGEROUS_EXTENSIONS.includes(ext));
    if (hasHiddenDangerousExt) {
      return {
        isValid: false,
        error: 'This file has a suspicious double extension and cannot be uploaded.',
      };
    }
  }

  return { isValid: true };
}

/**
 * Sanitizes filename to prevent path traversal and special character attacks
 */
export function sanitizeFileName(fileName: string): string {
  // Remove path traversal attempts
  let sanitized = fileName.replace(/\.\./g, '');
  
  // Remove directory separators
  sanitized = sanitized.replace(/[\/\\]/g, '');
  
  // Remove null bytes
  sanitized = sanitized.replace(/\0/g, '');
  
  // Remove other potentially dangerous characters
  sanitized = sanitized.replace(/[<>:"|?*]/g, '');
  
  // Limit length
  if (sanitized.length > 200) {
    const ext = sanitized.split('.').pop() || '';
    const name = sanitized.slice(0, 200 - ext.length - 1);
    sanitized = `${name}.${ext}`;
  }

  return sanitized || 'unnamed_file';
}

/**
 * Comprehensive file validation combining all checks
 */
export async function validateFile(file: File): Promise<FileValidationResult> {
  // Check extension first
  const extResult = validateFileExtension(file.name);
  if (!extResult.isValid) return extResult;

  // Validate magic bytes
  const magicResult = await validateMagicBytes(file);
  if (!magicResult.isValid) return magicResult;

  // Scan for malicious content
  const scanResult = await scanForMaliciousContent(file);
  if (!scanResult.isValid) return scanResult;

  return {
    isValid: true,
    warnings: scanResult.warnings,
  };
}
