/**
 * Engineering Input Validation Module
 * Real-time validation with engineering-appropriate constraints
 */

export interface ValidationRule {
  min?: number;
  max?: number;
  unit: string;
  label: string;
}

export interface ValidationResult {
  isValid: boolean;
  error?: string;
}

// Validation rules for beam calculator
export const beamValidationRules: Record<string, ValidationRule> = {
  span: { min: 0.5, max: 30, unit: 'm', label: 'Span Length' },
  deadLoad: { min: 0, max: 500, unit: 'kN/m', label: 'Dead Load' },
  liveLoad: { min: 0, max: 500, unit: 'kN/m', label: 'Live Load' },
  beamWidth: { min: 150, max: 2000, unit: 'mm', label: 'Beam Width' },
};

// Validation rules for column calculator
export const columnValidationRules: Record<string, ValidationRule> = {
  axialLoad: { min: 0.1, max: 50000, unit: 'kN', label: 'Axial Load' },
  momentX: { min: 0, max: 10000, unit: 'kN.m', label: 'Moment X' },
  momentY: { min: 0, max: 10000, unit: 'kN.m', label: 'Moment Y' },
  columnWidth: { min: 200, max: 2000, unit: 'mm', label: 'Column Width' },
  columnDepth: { min: 200, max: 2000, unit: 'mm', label: 'Column Depth' },
  columnHeight: { min: 1000, max: 20000, unit: 'mm', label: 'Column Height' },
  coverThickness: { min: 25, max: 100, unit: 'mm', label: 'Cover' },
};

// Validation rules for slab calculator
export const slabValidationRules: Record<string, ValidationRule> = {
  longSpan: { min: 1, max: 20, unit: 'm', label: 'Long Span' },
  shortSpan: { min: 1, max: 20, unit: 'm', label: 'Short Span' },
  deadLoad: { min: 0, max: 50, unit: 'kN/m²', label: 'Dead Load' },
  liveLoad: { min: 0, max: 50, unit: 'kN/m²', label: 'Live Load' },
  cover: { min: 15, max: 100, unit: 'mm', label: 'Cover' },
};

// Validation rules for foundation calculator
export const foundationValidationRules: Record<string, ValidationRule> = {
  columnLoad: { min: 0.1, max: 50000, unit: 'kN', label: 'Column Load' },
  momentX: { min: 0, max: 5000, unit: 'kN.m', label: 'Moment X' },
  momentY: { min: 0, max: 5000, unit: 'kN.m', label: 'Moment Y' },
  columnWidth: { min: 200, max: 1500, unit: 'mm', label: 'Column Width' },
  columnDepth: { min: 200, max: 1500, unit: 'mm', label: 'Column Depth' },
  bearingCapacity: { min: 50, max: 2000, unit: 'kN/m²', label: 'Bearing Capacity' },
  embedmentDepth: { min: 0.3, max: 5, unit: 'm', label: 'Embedment Depth' },
};

// Validation rules for retaining wall calculator
export const retainingWallValidationRules: Record<string, ValidationRule> = {
  wallHeight: { min: 1, max: 15, unit: 'm', label: 'Wall Height' },
  stemThicknessTop: { min: 150, max: 800, unit: 'mm', label: 'Stem Top Thickness' },
  stemThicknessBottom: { min: 200, max: 1500, unit: 'mm', label: 'Stem Bottom Thickness' },
  baseWidth: { min: 500, max: 10000, unit: 'mm', label: 'Base Width' },
  baseThickness: { min: 200, max: 1500, unit: 'mm', label: 'Base Thickness' },
  toeWidth: { min: 100, max: 3000, unit: 'mm', label: 'Toe Width' },
  surchargeLoad: { min: 0, max: 100, unit: 'kN/m²', label: 'Surcharge Load' },
  allowableBearingPressure: { min: 50, max: 2000, unit: 'kN/m²', label: 'Bearing Capacity' },
  backfillSlope: { min: 0, max: 45, unit: '°', label: 'Backfill Slope' },
};

/**
 * Validate a single input value against its rule
 */
export function validateInput(
  value: number | string,
  rule: ValidationRule
): ValidationResult {
  const numValue = typeof value === 'string' ? parseFloat(value) : value;
  
  // Check if it's a valid number
  if (isNaN(numValue)) {
    return {
      isValid: false,
      error: `${rule.label} must be a valid number`,
    };
  }
  
  // Check minimum
  if (rule.min !== undefined && numValue < rule.min) {
    return {
      isValid: false,
      error: `${rule.label} must be at least ${rule.min} ${rule.unit}`,
    };
  }
  
  // Check maximum
  if (rule.max !== undefined && numValue > rule.max) {
    return {
      isValid: false,
      error: `${rule.label} cannot exceed ${rule.max} ${rule.unit}`,
    };
  }
  
  return { isValid: true };
}

// Alias for backwards compatibility
export const validateField = (value: number, rule: ValidationRule): string | null => {
  const result = validateInput(value, rule);
  return result.isValid ? null : (result.error || 'Invalid value');
};

// Check if errors object has any errors
export const hasErrors = (errors: Record<string, string>): boolean => {
  return Object.keys(errors).length > 0;
};

/**
 * Validate all inputs against their rules
 */
export function validateAllInputs(
  inputs: Record<string, number | string>,
  rules: Record<string, ValidationRule>
): Record<string, string> {
  const errors: Record<string, string> = {};
  
  for (const [field, rule] of Object.entries(rules)) {
    const value = inputs[field];
    if (value !== undefined && value !== '') {
      const result = validateInput(value, rule);
      if (!result.isValid && result.error) {
        errors[field] = result.error;
      }
    }
  }
  
  return errors;
}

/**
 * Check if all required fields have values
 */
export function hasRequiredFields(
  inputs: Record<string, any>,
  requiredFields: string[]
): boolean {
  return requiredFields.every(field => {
    const value = inputs[field];
    return value !== undefined && value !== '' && !isNaN(Number(value));
  });
}
