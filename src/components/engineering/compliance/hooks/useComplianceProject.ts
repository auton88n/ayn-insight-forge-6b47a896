import { useState, useCallback } from 'react';
import { supabaseApi } from '@/lib/supabaseApi';
import { tokenStore } from '@/lib/spineAuth';
import { toast } from 'sonner';

export interface ComplianceProject {
  id?: string;
  user_id: string;
  project_name: string;
  location_country: string;
  location_state_province: string;
  location_city: string;
  location_zip_postal: string;
  code_system: string;
  climate_zone_id?: string;
  building_type: string;
  num_storeys: number;
  has_basement: boolean;
  has_garage: boolean;
  garage_attached: boolean;
  has_fuel_burning_appliance: boolean;
}

export function useComplianceProject(userId: string) {
  const [project, setProject] = useState<ComplianceProject>({
    user_id: userId,
    project_name: '',
    location_country: 'US',
    location_state_province: '',
    location_city: '',
    location_zip_postal: '',
    code_system: 'IRC_2024',
    building_type: 'single_family',
    num_storeys: 1,
    has_basement: false,
    has_garage: false,
    garage_attached: false,
    has_fuel_burning_appliance: false,
  });

  const [saving, setSaving] = useState(false);

  const updateProject = useCallback((updates: Partial<ComplianceProject>) => {
    setProject(prev => {
      const next = { ...prev, ...updates };
      if (updates.location_country === 'US') next.code_system = 'IRC_2024';
      if (updates.location_country === 'CA') next.code_system = 'NBC_2025';
      return next;
    });
  }, []);

  const saveProject = useCallback(async () => {
    setSaving(true);
    try {
      const token = tokenStore.getAccessToken() || '';
      const result = await supabaseApi.post<any[]>('compliance_projects', token, project);
      const row = Array.isArray(result) ? result[0] : (result as any);
      const id = row?.id as string | undefined;
      if (id) setProject(prev => ({ ...prev, id }));
      toast.success('Project saved');
      return id ?? null;
    } catch (err) {
      toast.error('Failed to save project');
      return null;
    } finally {
      setSaving(false);
    }
  }, [project]);

  return { project, updateProject, saveProject, saving };
}
