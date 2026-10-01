import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { supabaseApi } from '@/lib/supabaseApi';
import { toast } from 'sonner';
import imageCompression from 'browser-image-compression';
import { getErrorMessage, ErrorCodes } from '@/lib/errorMessages';

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];

interface UseAvatarUploadOptions {
  userId: string;
  accessToken: string;
}

export const useAvatarUpload = ({ userId, accessToken }: UseAvatarUploadOptions) => {
  const [isUploading, setIsUploading] = useState(false);

  const validateImage = (file: File): boolean => {
    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
      toast.error(getErrorMessage(ErrorCodes.UPLOAD_INVALID_TYPE).description);
      return false;
    }

    if (file.size > MAX_FILE_SIZE) {
      toast.error(getErrorMessage(ErrorCodes.UPLOAD_TOO_LARGE).description);
      return false;
    }

    return true;
  };

  const compressImage = async (file: File): Promise<File> => {
    const options = {
      maxSizeMB: 1,
      maxWidthOrHeight: 400,
      useWebWorker: true,
      fileType: file.type,
    };

    try {
      return await imageCompression(file, options);
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error('Image compression error:', error);
      }
      return file;
    }
  };

  const uploadAvatar = async (file: File): Promise<string | null> => {
    if (!validateImage(file)) {
      return null;
    }

    if (!userId || !accessToken) {
      toast.error(getErrorMessage(ErrorCodes.AUTH_SESSION_EXPIRED).description);
      return null;
    }

    setIsUploading(true);

    try {
      // Compress the image
      const compressedFile = await compressImage(file);

      // Get file extension
      const fileExt = file.name.split('.').pop();
      const fileName = `avatar.${fileExt}`;
      const filePath = `${userId}/${fileName}`;

      // Delete old avatar if exists (keep using supabase.storage for storage operations)
      const { data: existingFiles } = await supabase.storage
        .from('avatars')
        .list(userId);

      if (existingFiles && existingFiles.length > 0) {
        await supabase.storage
          .from('avatars')
          .remove(existingFiles.map(f => `${userId}/${f.name}`));
      }

      // Upload new avatar
      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, compressedFile, {
          cacheControl: '3600',
          upsert: true,
        });

      if (uploadError) {
        if (import.meta.env.DEV) {
          console.error('Upload error:', uploadError);
        }
        toast.error(getErrorMessage(ErrorCodes.UPLOAD_FAILED).description);
        return null;
      }

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('avatars')
        .getPublicUrl(filePath);

      // Update profile with avatar URL using REST API
      await supabaseApi.patch(
        `profiles?user_id=eq.${userId}`,
        accessToken,
        { avatar_url: publicUrl }
      );

      toast.success('Profile photo updated!');
      return publicUrl;
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error('Avatar upload error:', error);
      }
      toast.error(getErrorMessage(ErrorCodes.UPLOAD_FAILED).description);
      return null;
    } finally {
      setIsUploading(false);
    }
  };

  const removeAvatar = async (): Promise<boolean> => {
    if (!userId || !accessToken) {
      toast.error(getErrorMessage(ErrorCodes.AUTH_SESSION_EXPIRED).description);
      return false;
    }

    setIsUploading(true);

    try {
      // Delete from storage (keep using supabase.storage)
      const { data: existingFiles } = await supabase.storage
        .from('avatars')
        .list(userId);

      if (existingFiles && existingFiles.length > 0) {
        await supabase.storage
          .from('avatars')
          .remove(existingFiles.map(f => `${userId}/${f.name}`));
      }

      // Update profile using REST API
      await supabaseApi.patch(
        `profiles?user_id=eq.${userId}`,
        accessToken,
        { avatar_url: null }
      );

      toast.success('Profile photo removed');
      return true;
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error('Avatar removal error:', error);
      }
      toast.error(getErrorMessage(ErrorCodes.GENERIC).description);
      return false;
    } finally {
      setIsUploading(false);
    }
  };

  return {
    uploadAvatar,
    removeAvatar,
    isUploading,
  };
};
