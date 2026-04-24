import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

// Cache for URL mappings to avoid re-saving
const urlCache = new Map<string, string>();

const normalizeImageUrl = (url: string): string => {
  // Fix occasional trailing quotes coming from upstream JSON formatting
  return (url || '').trim().replace(/^['"]+|['"]+$/g, '');
};

export const useImagePersistence = () => {
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isDalleUrl = useCallback((url: string): boolean => {
    return normalizeImageUrl(url).includes('oaidalleapiprodscus.blob.core.windows.net');
  }, []);

  const getPersistentUrl = useCallback(async (imageUrl: string): Promise<string> => {
    const normalizedUrl = normalizeImageUrl(imageUrl);

    // Check cache first
    if (urlCache.has(normalizedUrl)) {
      return urlCache.get(normalizedUrl)!;
    }

    // If not a DALL-E URL, return as-is
    if (!isDalleUrl(normalizedUrl)) {
      return normalizedUrl;
    }

    setIsSaving(true);
    setError(null);

    try {
      const { data, error: fnError } = await supabase.functions.invoke('save-generated-image', {
        body: { imageUrl: normalizedUrl }
      });

      if (fnError) {
        // Cache negative result to avoid repeated retries
        urlCache.set(normalizedUrl, normalizedUrl);
        throw new Error(fnError.message);
      }

      if (data?.error) {
        urlCache.set(normalizedUrl, normalizedUrl);
        throw new Error(data.error);
      }

      const permanentUrl = data?.permanentUrl ?? normalizedUrl;

      // Cache the mapping (and any unnormalized variant)
      urlCache.set(normalizedUrl, permanentUrl);
      if (normalizedUrl !== imageUrl) {
        urlCache.set(imageUrl, permanentUrl);
      }

      return permanentUrl;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save image';
      setError(message);
      throw err;
    } finally {
      setIsSaving(false);
    }
  }, [isDalleUrl]);

  const saveImageIfNeeded = useCallback(async (imageUrl: string): Promise<{ url: string; wasSaved: boolean }> => {
    const normalizedUrl = normalizeImageUrl(imageUrl);

    if (!isDalleUrl(normalizedUrl)) {
      return { url: normalizedUrl, wasSaved: false };
    }

    try {
      const permanentUrl = await getPersistentUrl(normalizedUrl);
      return { url: permanentUrl, wasSaved: permanentUrl !== normalizedUrl };
    } catch {
      // Don't block the UI if persistence fails
      return { url: normalizedUrl, wasSaved: false };
    }
  }, [isDalleUrl, getPersistentUrl]);

  return {
    getPersistentUrl,
    saveImageIfNeeded,
    isDalleUrl,
    isSaving,
    error,
    clearError: () => setError(null)
  };
};

// Utility function for use outside React components
export const persistDalleImage = async (imageUrl: string): Promise<string> => {
  const normalizedUrl = normalizeImageUrl(imageUrl);

  if (!normalizedUrl.includes('oaidalleapiprodscus.blob.core.windows.net')) {
    return normalizedUrl;
  }

  // Check cache
  if (urlCache.has(normalizedUrl)) {
    return urlCache.get(normalizedUrl)!;
  }

  const { data, error } = await supabase.functions.invoke('save-generated-image', {
    body: { imageUrl: normalizedUrl }
  });

  // Best-effort: never throw, and cache failures to avoid retry loops
  if (error || data?.error) {
    if (import.meta.env.DEV) {
      console.error('Failed to persist image:', error || data?.error);
    }
    urlCache.set(normalizedUrl, normalizedUrl);
    if (normalizedUrl !== imageUrl) urlCache.set(imageUrl, normalizedUrl);
    return normalizedUrl;
  }

  const permanentUrl = data?.permanentUrl ?? normalizedUrl;
  urlCache.set(normalizedUrl, permanentUrl);
  if (normalizedUrl !== imageUrl) urlCache.set(imageUrl, permanentUrl);
  return permanentUrl;
};
