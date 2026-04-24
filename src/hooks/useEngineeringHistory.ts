import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';
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

  // Fetch calculation history
  const fetchHistory = useCallback(async () => {
    if (!userId) return;
    
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('calculation_history')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      
      setCalculationHistory((data || []).map(item => ({
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

  // Log engineering activity (for AYN context)
  const logActivity = useCallback(async (
    activityType: string,
    summary: string,
    details: Record<string, any>
  ) => {
    if (!userId) return;

    try {
      await supabase
        .from('engineering_activity')
        .insert({
          user_id: userId,
          activity_type: activityType,
          summary,
          details: details as Json,
        });
    } catch (err) {
      if (import.meta.env.DEV) {
        console.error('Error logging engineering activity:', err);
      }
    }
  }, [userId]);

  // Save a calculation to history
  const saveCalculation = useCallback(async (
    calculationType: string,
    inputs: Record<string, any>,
    outputs: Record<string, any>,
    aiAnalysis?: Record<string, any>,
    buildingCode?: BuildingCodeId
  ) => {
    if (!userId) return null;

    try {
      // Include building code in inputs for storage
      const enrichedInputs = buildingCode 
        ? { ...inputs, buildingCode } 
        : inputs;

      const { data, error } = await supabase
        .from('calculation_history')
        .insert({
          user_id: userId,
          calculation_type: calculationType,
          inputs: enrichedInputs as Json,
          outputs: outputs as Json,
          ai_analysis: aiAnalysis as Json || null,
        })
        .select()
        .single();

      if (error) throw error;

      // Also log to engineering_activity for AYN context
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

  // Delete a calculation from history
  const deleteCalculation = useCallback(async (calculationId: string) => {
    if (!userId) return false;

    try {
      const { error } = await supabase
        .from('calculation_history')
        .delete()
        .eq('id', calculationId)
        .eq('user_id', userId);

      if (error) throw error;
      
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

// Helper to generate human-readable summaries
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
      return `Column design: ${inputs.axialLoad}kN, ${inputs.columnWidth}x${inputs.columnDepth}mm → Steel ratio ${((outputs.requiredSteelArea / (inputs.columnWidth * inputs.columnDepth)) * 100).toFixed(2)}%`;
    
    case 'grading':
      return `Grading design: Cut ${outputs.totalCutVolume?.toLocaleString() || '?'}m³, Fill ${outputs.totalFillVolume?.toLocaleString() || '?'}m³, Net ${outputs.netVolume?.toLocaleString() || '?'}m³`;
    
    default:
      return `${type} calculation completed`;
  }
}
