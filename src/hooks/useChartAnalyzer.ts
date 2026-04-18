import { useState, useRef, useCallback } from 'react';
import { spineAuth } from '@/lib/spineAuth';
import { spineApi } from '@/lib/spineApi';
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
      const { data: { session } } = await spineAuth.getSession();
      if (!session?.access_token) throw new Error('Please log in to use Chart Analyzer');

      const data = await spineApi.analyzeChart(base64, '', '');
      setResult(data as ChartAnalysisResult);
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
