import { useState, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { API_ENDPOINTS } from '@/constants/apiEndpoints';
import type { ChartAnalysisResult, ChartAnalyzerStep } from '@/types/chartAnalyzer.types';

export function useChartAnalyzer() {
  const [step, setStep] = useState<ChartAnalyzerStep>('idle');
  const [result, setResult] = useState<ChartAnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const analyzeChart = useCallback(async (file: File) => {
    setError(null);
    setResult(null);

    // Preview
    const preview = URL.createObjectURL(file);
    setPreviewUrl(preview);

    try {
      setStep('uploading');
      const base64 = await fileToBase64(file);

      setStep('analyzing');
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('Please log in to use Chart Analyzer');

      const res = await supabase.functions.invoke(API_ENDPOINTS.ANALYZE_TRADING_CHART, {
        body: { imageBase64: base64, sessionId: null },
      });

      if (res.error) {
        // supabase.functions.invoke may put the parsed body in res.data even on error
        const bodyError = res.data?.error;
        // Also try to parse from the error context
        let contextError: string | undefined;
        try {
          const ctx = (res.error as any)?.context;
          if (ctx instanceof Response) {
            const body = await ctx.json();
            contextError = body?.error;
          }
        } catch {}
        throw new Error(bodyError || contextError || res.error.message || 'Analysis failed');
      }

      setResult(res.data as ChartAnalysisResult);
      setStep('done');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Analysis failed';
      setError(msg);
      setStep('error');
    }
  }, []);

  const reset = useCallback(() => {
    setStep('idle');
    setResult(null);
    setError(null);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
  }, [previewUrl]);

  return { step, result, error, previewUrl, fileInputRef, analyzeChart, reset };
}
