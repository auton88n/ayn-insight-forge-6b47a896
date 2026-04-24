import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { ComplianceInput } from '../utils/complianceEngine';
import { toast } from 'sonner';

export interface ExtractedInput extends ComplianceInput {
  confidence: number;
}

interface AnalysisResult {
  inputs: ExtractedInput[];
  notes: string;
  storeys_detected: number;
}

type AnalysisPhase = 'idle' | 'uploading' | 'analyzing' | 'extracting' | 'done' | 'error';

const ACCEPTED_TYPES = ['application/pdf', 'image/png', 'image/jpeg', 'image/jpg'];
const MAX_SIZE = 10 * 1024 * 1024; // 10MB

export function useFloorPlanAnalysis() {
  const [phase, setPhase] = useState<AnalysisPhase>('idle');
  const [extractedInputs, setExtractedInputs] = useState<ExtractedInput[]>([]);
  const [notes, setNotes] = useState('');
  const [storeysDetected, setStoreysDetected] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState('');

  const validateFile = useCallback((file: File): string | null => {
    if (!ACCEPTED_TYPES.includes(file.type)) {
      return 'Please upload a PDF, PNG, or JPG file.';
    }
    if (file.size > MAX_SIZE) {
      return 'File size must be under 10MB.';
    }
    return null;
  }, []);

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        // Strip data URL prefix to get raw base64
        const base64 = result.split(',')[1];
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const analyzeFile = useCallback(async (file: File, unitSystem: string, codeSystem: string) => {
    const validationError = validateFile(file);
    if (validationError) {
      toast.error(validationError);
      return;
    }

    setError(null);
    setFileName(file.name);
    setPhase('uploading');

    try {
      setPhase('uploading');
      const base64 = await fileToBase64(file);

      setPhase('analyzing');
      const { data, error: fnError } = await supabase.functions.invoke('analyze-floor-plan', {
        body: {
          file_base64: base64,
          file_type: file.type,
          unit_system: unitSystem,
          code_system: codeSystem,
        },
      });

      if (fnError) throw new Error(fnError.message || 'Analysis failed');
      if (data?.error) throw new Error(data.error);

      setPhase('extracting');
      const result = data as AnalysisResult;
      setExtractedInputs(result.inputs || []);
      setNotes(result.notes || '');
      setStoreysDetected(result.storeys_detected || 1);
      setPhase('done');

      toast.success(`Extracted ${result.inputs?.length || 0} items from your floor plan`);
    } catch (e: any) {
      console.error('Floor plan analysis error:', e);
      setError(e.message || 'Failed to analyze floor plan');
      setPhase('error');
      toast.error(e.message || 'Failed to analyze floor plan');
    }
  }, [validateFile]);

  const updateInput = useCallback((index: number, updates: Partial<ExtractedInput>) => {
    setExtractedInputs(prev => prev.map((item, i) => i === index ? { ...item, ...updates } : item));
  }, []);

  const removeInput = useCallback((index: number) => {
    setExtractedInputs(prev => prev.filter((_, i) => i !== index));
  }, []);

  const addInput = useCallback((input: ExtractedInput) => {
    setExtractedInputs(prev => [...prev, input]);
  }, []);

  const reset = useCallback(() => {
    setPhase('idle');
    setExtractedInputs([]);
    setNotes('');
    setStoreysDetected(1);
    setError(null);
    setFileName('');
  }, []);

  // Convert ExtractedInput[] to ComplianceInput[] (strip confidence)
  const getComplianceInputs = useCallback((): ComplianceInput[] => {
    return extractedInputs.map(({ confidence, ...rest }) => rest);
  }, [extractedInputs]);

  return {
    phase,
    extractedInputs,
    notes,
    storeysDetected,
    error,
    fileName,
    analyzeFile,
    updateInput,
    removeInput,
    addInput,
    reset,
    getComplianceInputs,
    validateFile,
  };
}
