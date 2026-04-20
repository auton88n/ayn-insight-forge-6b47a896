import { useState, useCallback } from 'react';
import { adminApi } from '@/lib/adminApi';
import type { BuildingCodeId } from '@/lib/buildingCodes';

export interface CalculationHistoryItem {
  id: string;
  calculation_type: string;
  inputs: Record<string, any>;
  outputs: Record<string, any>;
  ai_analysis: Record<string, any> | null;
  building_code?: BuildingCodeId;
  created_at: string;
}

export interface EngineeringActivityItem {
  id: string;
  activity_type: string;
  summary: string;
  details: Record<string, any>;
  created_at: string;
}

export const useEngineeringHistory = (userId: string | undefined) => {
  const [calculationHistory, setCalculationHistory] = useState<CalculationHistoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const fetchHistory = useCallback(async () => {
    if (!userId) return;

    setIsLoading(true);
    try {
      const { data } = await adminApi.from('calculation_history')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(50);

      setCalculationHistory((data || []).map((item: any) => ({
        ...item,
        inputs: item.inputs as Record<string, any>,
        outputs: item.outputs as Record<string, any>,
        ai_analysis: item.ai_analysis as Record<string, any> | null,
      })));
    } catch (err) {
      if (import.meta.env.DEV) {
        console.error('Error fetching calculation history:', err);
      }
    } finally {
      setIsLoading(false);
    }
  }, [userId]);

  const logActivity = useCallback(async (
    activityType: string,
    summary: string,
    details: Record<string, any>
  ) => {
    if (!userId) return;

    try {
      await adminApi.from('engineering_activity').insert([{
        user_id: userId,
        activity_type: activityType,
        summary,
        details,
      }]);
    } catch (err) {
      if (import.meta.env.DEV) {
        console.error('Error logging engineering activity:', err);
      }
    }
  }, [userId]);

  const saveCalculation = useCallback(async (
    calculationType: string,
    inputs: Record<string, any>,
    outputs: Record<string, any>,
    aiAnalysis?: Record<string, any>,
    buildingCode?: BuildingCodeId
  ) => {
    if (!userId) return null;

    try {
      const enrichedInputs = buildingCode
        ? { ...inputs, buildingCode }
        : inputs;

      const { data: rows } = await adminApi.from('calculation_history').insert([{
        user_id: userId,
        calculation_type: calculationType,
        inputs: enrichedInputs,
        outputs: outputs,
        ai_analysis: aiAnalysis || null,
      }]);
      const data = Array.isArray(rows) ? rows[0] : rows;

      await logActivity(
        `${calculationType}_calculation`,
        generateActivitySummary(calculationType, enrichedInputs, outputs),
        { inputs: enrichedInputs, outputs, aiAnalysis, buildingCode }
      );

      return data;
    } catch (err) {
      if (import.meta.env.DEV) {
        console.error('Error saving calculation:', err);
      }
      return null;
    }
  }, [userId, logActivity]);

  const deleteCalculation = useCallback(async (calculationId: string) => {
    if (!userId) return false;

    try {
      await adminApi.from('calculation_history')
        .delete()
        .eq('id', calculationId)
        .eq('user_id', userId);

      setCalculationHistory(prev => prev.filter(c => c.id !== calculationId));
      return true;
    } catch (err) {
      if (import.meta.env.DEV) {
        console.error('Error deleting calculation:', err);
      }
      return false;
    }
  }, [userId]);

  return {
    calculationHistory,
    isLoading,
    fetchHistory,
    saveCalculation,
    logActivity,
    deleteCalculation,
  };
};

function generateActivitySummary(
  type: string,
  inputs: Record<string, any>,
  outputs: Record<string, any>
): string {
  switch (type) {
    case 'beam':
      return `Beam design: ${inputs.span}m span, ${inputs.deadLoad}+${inputs.liveLoad} kN/m load → ${outputs.beamWidth}x${outputs.totalDepth}mm, ${outputs.mainReinforcementCount}Ø${outputs.mainReinforcementSize} bars`;
    case 'foundation':
      return `Foundation design: ${inputs.columnLoad}kN load → ${outputs.length}x${outputs.width}m, ${outputs.depth}mm depth, ${outputs.concreteVolume?.toFixed(2) || '?'}m³ concrete`;
    case 'column':
      return `Column design: ${inputs.axialLoad}kN, ${inputs.columnWidth}x${inputs.columnDepth}mm`;
    case 'slab':
      return `Slab design: ${inputs.length}x${inputs.width}mm, ${inputs.thickness}mm thick`;
    case 'retaining_wall':
      return `Retaining wall: ${inputs.wallHeight}m height`;
    default:
      return `${type} calculation completed`;
  }
}
