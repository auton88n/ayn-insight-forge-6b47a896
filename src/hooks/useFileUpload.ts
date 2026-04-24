import { useState, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import imageCompression from 'browser-image-compression';
import { validateFile as validateFileSecurity } from '@/lib/fileValidation';
import type { FileAttachment, UseFileUploadReturn } from '@/types/dashboard.types';

// Allowed file types - exactly 16 extensions across 9 categories
const ALLOWED_TYPES = [
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

const MAX_SIZE = 10 * 1024 * 1024; // 10MB

export const useFileUpload = (userId: string): UseFileUploadReturn => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isDragOver, setIsDragOver] = useState(false);
  // Pre-uploaded attachment - ready to send immediately
  const [uploadedAttachment, setUploadedAttachment] = useState<FileAttachment | null>(null);
  // Track upload failure for retry functionality
  const [uploadFailed, setUploadFailed] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  // Validate file type and size
  const validateBasicFile = useCallback((file: File): boolean => {
    if (!ALLOWED_TYPES.includes(file.type)) {
      toast({
        title: "Unsupported File Type",
        description: "We support PDF, Excel, images, and text files.",
        variant: "destructive"
      });
      return false;
    }

    if (file.size > MAX_SIZE) {
      toast({
        title: "File Too Large",
        description: "Please choose a file smaller than 10MB.",
        variant: "destructive"
      });
      return false;
    }

    return true;
  }, [toast]);

  // Compress image files before upload
  const compressImage = useCallback(async (file: File): Promise<File> => {
    if (!file.type.startsWith('image/')) return file;

    try {
      const options = {
        maxSizeMB: 1,
        maxWidthOrHeight: 1920,
        useWebWorker: true
      };
      const compressedFile = await imageCompression(file, options);

      return compressedFile;
    } catch (error) {
      return file; // Return original if compression fails
    }
  }, []);

  const uploadFile = useCallback(async (file: File): Promise<FileAttachment | null> => {
    let isFailed = false;
    try {
      setIsUploading(true);
      setUploadFailed(false);
      setUploadProgress(5);

      // CRITICAL: Refresh session if token is expiring soon
      const { data: sessionData } = await supabase.auth.getSession();
      setUploadProgress(10);
      
      if (sessionData?.session) {
        const expiresAt = sessionData.session.expires_at;
        const fiveMinutesFromNow = Math.floor(Date.now() / 1000) + 300;
        
        if (expiresAt && expiresAt < fiveMinutesFromNow) {
          await supabase.auth.refreshSession();
        }
      }
      setUploadProgress(15);

      // Compress if image
      const processedFile = await compressImage(file);
      setUploadProgress(30);

      // Convert to base64
      const base64 = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result as string;
          resolve(result.split(',')[1]); // Remove data URL prefix
        };
        reader.readAsDataURL(processedFile);
      });
      setUploadProgress(50);

      // Simulate progress during upload (since we can't get real progress from edge function)
      const progressInterval = setInterval(() => {
        setUploadProgress(prev => Math.min(prev + 5, 90));
      }, 200);

      // Upload via edge function
      const { data, error } = await supabase.functions.invoke('file-upload', {
        body: {
          file: base64,
          fileName: processedFile.name,
          fileType: processedFile.type,
          userId
        }
      });

      clearInterval(progressInterval);

      if (error) throw error;

      setUploadProgress(100);
      setUploadFailed(false);

      return {
        url: data.fileUrl,
        name: data.fileName,
        type: data.fileType,
        size: processedFile.size
      };
    } catch (error) {
      toast({
        title: "Upload Failed",
        description: "We couldn't upload your file. Please try again.",
        variant: "destructive"
      });
      setUploadProgress(0);
      setUploadFailed(true);
      isFailed = true;
      return null;
    } finally {
      setIsUploading(false);
      // Reset progress after a brief delay to show completion (only if successful)
      setTimeout(() => {
        if (!isFailed) {
          setUploadProgress(0);
        }
      }, 500);
    }
  }, [userId, toast, compressImage]);

  // Handle file selection - immediately start upload (ChatGPT-style pre-upload)
  const handleFileSelect = useCallback(async (file: File | null) => {
    if (!file) return;
    
    // Basic type/size validation first (fast)
    if (!validateBasicFile(file)) return;

    // Comprehensive security validation (magic bytes, malicious content scan)
    try {
      const securityValidation = await validateFileSecurity(file);
      if (!securityValidation.isValid) {
        toast({
          title: "Security Check Failed",
          description: securityValidation.error || "File failed security validation",
          variant: "destructive"
        });
        return;
      }
      
      // Log warnings but allow file (non-blocking issues)
      if (securityValidation.warnings?.length) {
        console.warn('File security warnings:', securityValidation.warnings);
      }

      setSelectedFile(file);
      // Clear any previous uploaded attachment and failure state
      setUploadedAttachment(null);
      setUploadFailed(false);
      
      // Start upload immediately in background
      const attachment = await uploadFile(file);
      if (attachment) {
        setUploadedAttachment(attachment);
        toast({
          title: "File Ready",
          description: `${file.name} uploaded and ready to send.`,
        });
      }
      // If upload fails, error toast is shown by uploadFile
    } catch (error) {
      toast({
        title: "Validation Error",
        description: "Could not validate file. Please try again.",
        variant: "destructive"
      });
    }
  }, [validateBasicFile, uploadFile, toast]);

  // Retry failed upload
  const retryUpload = useCallback(async () => {
    if (!selectedFile) return;
    
    setUploadFailed(false);
    const attachment = await uploadFile(selectedFile);
    if (attachment) {
      setUploadedAttachment(attachment);
      toast({
        title: "File Ready",
        description: `${selectedFile.name} uploaded and ready to send.`,
      });
    }
  }, [selectedFile, uploadFile, toast]);

  // Clear uploaded attachment
  const clearUploadedAttachment = useCallback(() => {
    setUploadedAttachment(null);
  }, []);

  // Remove selected file and clear uploaded attachment
  const removeFile = useCallback(() => {
    setSelectedFile(null);
    setUploadedAttachment(null);
    setUploadFailed(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, []);

  // Drag and drop handlers
  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    // Only set dragOver to false if we're leaving the drop zone entirely
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setIsDragOver(false);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);

    // Check for folders using webkitGetAsEntry
    const items = Array.from(e.dataTransfer.items);
    for (const item of items) {
      const entry = item.webkitGetAsEntry?.();
      if (entry?.isDirectory) {
        toast({
          title: "Folders Not Supported",
          description: "Please upload individual files instead of folders.",
          variant: "destructive"
        });
        return;
      }
    }

    const files = Array.from(e.dataTransfer.files);
    
    if (files.length > 1) {
      toast({
        title: "One File at a Time",
        description: "Please drop only one file at a time.",
        variant: "destructive"
      });
      return;
    }

    const file = files[0];
    if (file) {
      handleFileSelect(file);
    }
  }, [handleFileSelect, toast]);

  return {
    selectedFile,
    isUploading,
    uploadProgress,
    isDragOver,
    fileInputRef,
    uploadFile,
    handleFileSelect,
    removeFile,
    handleDragEnter,
    handleDragLeave,
    handleDragOver,
    handleDrop,
    // Pre-upload state
    uploadedAttachment,
    clearUploadedAttachment,
    // Retry functionality
    uploadFailed,
    retryUpload,
  };
};
