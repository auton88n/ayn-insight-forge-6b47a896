import { useState, useEffect } from 'react';
import { supabaseApi } from '@/lib/supabaseApi';
import { tokenStore } from '@/lib/spineAuth';

export interface ClimateZone {
  id: string;
  country: string;
  region: string;
  zone_code: string;
  frost_depth_mm: number;
  ground_snow_load_kpa: number;
  wind_speed_kmh: number;
  seismic_category: string;
  heating_degree_days: number;
  wall_insulation_min: string;
  ceiling_insulation_min: string;
  window_u_factor_max: number;
  air_sealing_max_ach50: number;
}

export function useClimateZone(country: string) {
  const [zones, setZones] = useState<ClimateZone[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!country) return;
    setLoading(true);
    const token = tokenStore.getAccessToken() || '';
    supabaseApi
      .get<ClimateZone[]>(`climate_zones?country=eq.${country}&order=region.asc`, token)
      .then((data) => {
        setZones(data || []);
        setLoading(false);
      })
      .catch(() => {
        setZones([]);
        setLoading(false);
      });
  }, [country]);

  return { zones, loading };
}
