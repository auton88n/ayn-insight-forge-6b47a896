import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { runComplianceChecks, type BuildingCode, type ComplianceInput, type ComplianceResult } from '../utils/complianceEngine';

export function useComplianceCheck() {
  const [results, setResults] = useState<ComplianceResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runCheck = useCallback(async (
    codeSystem: string,
    inputs: ComplianceInput[],
    projectConfig: {
      has_basement: boolean;
      has_garage: boolean;
      garage_attached: boolean;
      has_fuel_burning_appliance: boolean;
      num_storeys: number;
      building_type: string;
    }
  ) => {
    setLoading(true);
    setError(null);

    try {
      // Fetch building codes for this code system
      const { data: codes, error: fetchError } = await supabase
        .from('building_codes')
        .select('*')
        .eq('code_system', codeSystem);

      if (fetchError) throw fetchError;

      const checkResults = runComplianceChecks(
        inputs,
        (codes as unknown as BuildingCode[]) || [],
        projectConfig
      );

      setResults(checkResults);
      return checkResults;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to run compliance check';
      setError(msg);
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  const passed = results.filter(r => r.status === 'pass').length;
  const failed = results.filter(r => r.status === 'fail').length;
  const warnings = results.filter(r => r.status === 'warning').length;

  return { results, loading, error, runCheck, passed, failed, warnings };
}
