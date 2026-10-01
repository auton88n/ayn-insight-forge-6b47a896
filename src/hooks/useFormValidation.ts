import { useState, useCallback } from 'react';
import { z } from 'zod';

// Translation key mappings for validation messages
export const ValidationMessages = {
  requiredName: 'form.requiredName',
  requiredEmail: 'form.requiredEmail',
  invalidEmail: 'form.invalidEmail',
  nameTooLong: 'form.nameTooLong',
  emailTooLong: 'form.emailTooLong',
  messageTooLong: 'form.messageTooLong',
  selectIndustry: 'form.selectIndustry',
  selectAgentType: 'form.selectAgentType',
  selectBudget: 'form.selectBudget',
  selectTimeline: 'form.selectTimeline',
  selectFollowerCount: 'form.selectFollowerCount',
  selectContentNiche: 'form.selectContentNiche',
  useCaseRequired: 'form.useCaseRequired',
  useCaseTooLong: 'form.useCaseTooLong',
  companyRequired: 'form.companyRequired',
  processesRequired: 'form.processesRequired',
} as const;

// Base validation schema for common fields
export const baseApplicationSchema = z.object({
  fullName: z.string()
    .trim()
    .min(1, { message: ValidationMessages.requiredName })
    .max(100, { message: ValidationMessages.nameTooLong }),
  email: z.string()
    .trim()
    .min(1, { message: ValidationMessages.requiredEmail })
    .email({ message: ValidationMessages.invalidEmail })
    .max(255, { message: ValidationMessages.emailTooLong }),
  phone: z.string()
    .max(20, { message: 'form.tooLong' })
    .optional()
    .or(z.literal('')),
  message: z.string()
    .max(2000, { message: ValidationMessages.messageTooLong })
    .optional()
    .or(z.literal(''))
});

// Content Creator Sites specific schema
export const contentCreatorSchema = baseApplicationSchema.extend({
  instagram: z.string().max(50).optional().or(z.literal('')),
  tiktok: z.string().max(50).optional().or(z.literal('')),
  youtube: z.string().max(100).optional().or(z.literal('')),
  followerCount: z.string().min(1, { message: ValidationMessages.selectFollowerCount }),
  contentNiche: z.string().min(1, { message: ValidationMessages.selectContentNiche }),
  desiredFeatures: z.string().max(1000).optional().or(z.literal('')),
  budget: z.string().min(1, { message: ValidationMessages.selectBudget }),
  timeline: z.string().min(1, { message: ValidationMessages.selectTimeline })
});

// AI Agents specific schema
export const aiAgentsSchema = baseApplicationSchema.extend({
  companyName: z.string().max(100).optional().or(z.literal('')),
  industry: z.string().min(1, { message: ValidationMessages.selectIndustry }),
  agentType: z.string().min(1, { message: ValidationMessages.selectAgentType }),
  useCase: z.string()
    .trim()
    .min(1, { message: ValidationMessages.useCaseRequired })
    .max(2000, { message: ValidationMessages.useCaseTooLong }),
  integrations: z.string().max(1000).optional().or(z.literal('')),
  budget: z.string().min(1, { message: ValidationMessages.selectBudget }),
  timeline: z.string().min(1, { message: ValidationMessages.selectTimeline })
});

// Automation specific schema
export const automationSchema = baseApplicationSchema.extend({
  companyName: z.string()
    .trim()
    .min(1, { message: ValidationMessages.companyRequired })
    .max(100, { message: 'form.nameTooLong' }),
  industry: z.string().min(1, { message: ValidationMessages.selectIndustry }),
  currentTools: z.array(z.string()).optional(),
  processesToAutomate: z.string()
    .trim()
    .min(1, { message: ValidationMessages.processesRequired })
    .max(2000, { message: 'form.messageTooLong' }),
  painPoints: z.string().max(1000).optional().or(z.literal('')),
  budget: z.string().min(1, { message: ValidationMessages.selectBudget }),
  timeline: z.string().min(1, { message: ValidationMessages.selectTimeline })
});

// AI Employee specific schema
export const aiEmployeeSchema = baseApplicationSchema.extend({
  companyName: z.string().max(100).optional().or(z.literal('')),
  industry: z.string().optional().or(z.literal('')),
  teamSize: z.string().optional().or(z.literal('')),
  roles: z.string().max(500).optional().or(z.literal('')),
  workload: z.string().optional().or(z.literal('')),
  budget: z.string().optional().or(z.literal(''))
});

export type FormErrors<T> = Partial<Record<keyof T, string>>;

export function useFormValidation<T extends z.ZodSchema>(schema: T, translate?: (key: string) => string) {
  const [errors, setErrors] = useState<FormErrors<z.infer<T>>>({});
  const [touched, setTouched] = useState<Partial<Record<keyof z.infer<T>, boolean>>>({});

  // Helper to translate error message if translator provided
  const translateMessage = useCallback((message: string): string => {
    if (translate && message.startsWith('form.')) {
      return translate(message);
    }
    return message;
  }, [translate]);

  const validateField = useCallback((field: keyof z.infer<T>, value: unknown, allData: z.infer<T>) => {
    try {
      // Create a partial schema for just this field
      const result = schema.safeParse({ ...allData, [field]: value });
      
      if (!result.success) {
        const fieldError = result.error.errors.find(e => e.path[0] === field);
        if (fieldError) {
          setErrors(prev => ({ ...prev, [field]: translateMessage(fieldError.message) }));
          return false;
        }
      }
      
      setErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[field];
        return newErrors;
      });
      return true;
    } catch {
      return true;
    }
  }, [schema, translateMessage]);

  const validateForm = useCallback((data: z.infer<T>): boolean => {
    const result = schema.safeParse(data);
    
    if (!result.success) {
      const newErrors: FormErrors<z.infer<T>> = {};
      result.error.errors.forEach(err => {
        const field = err.path[0] as keyof z.infer<T>;
        if (!newErrors[field]) {
          newErrors[field] = translateMessage(err.message);
        }
      });
      setErrors(newErrors);
      
      // Mark all fields with errors as touched
      const newTouched: Partial<Record<keyof z.infer<T>, boolean>> = {};
      Object.keys(newErrors).forEach(key => {
        newTouched[key as keyof z.infer<T>] = true;
      });
      setTouched(prev => ({ ...prev, ...newTouched }));
      
      return false;
    }
    
    setErrors({});
    return true;
  }, [schema, translateMessage]);

  const handleBlur = useCallback((field: keyof z.infer<T>) => {
    setTouched(prev => ({ ...prev, [field]: true }));
  }, []);

  const getFieldError = useCallback((field: keyof z.infer<T>): string | undefined => {
    return touched[field] ? errors[field] : undefined;
  }, [errors, touched]);

  const clearErrors = useCallback(() => {
    setErrors({});
    setTouched({});
  }, []);

  return {
    errors,
    touched,
    validateField,
    validateForm,
    handleBlur,
    getFieldError,
    clearErrors
  };
}
