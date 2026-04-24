import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Save, X, Loader2, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';

import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import type { Json } from '@/integrations/supabase/types';

interface SaveDesignDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved?: () => void;
  userId?: string;
  calculationType: string;
  inputs: Record<string, any>;
  outputs: Record<string, any> | null;
  defaultTitle?: string;
}

// Map calculation types to friendly names
const typeLabels: Record<string, string> = {
  beam: 'Beam Design',
  foundation: 'Foundation Design',
  column: 'Column Design',
  slab: 'Slab Design',
  retaining_wall: 'Retaining Wall',
  parking: 'Parking Layout',
  grading: 'Grading Design',
};

// Generate key specs based on calculation type
function generateKeySpecs(type: string, inputs: Record<string, any>, outputs: Record<string, any> | null): Record<string, any> {
  switch (type) {
    case 'beam':
      return {
        span: `${inputs.span || 0}m`,
        load: `${(inputs.deadLoad || 0) + (inputs.liveLoad || 0)} kN/m`,
        size: outputs ? `${outputs.beamWidth || 0}x${outputs.totalDepth || 0}mm` : 'Pending',
        reinforcement: outputs ? `${outputs.mainReinforcementCount || 0}Ø${outputs.mainReinforcementSize || 0}` : 'Pending',
      };
    case 'foundation':
      return {
        load: `${inputs.columnLoad || 0}kN`,
        size: outputs ? `${outputs.length || 0}x${outputs.width || 0}m` : 'Pending',
        depth: outputs ? `${outputs.depth || 0}mm` : 'Pending',
        concrete: outputs ? `${outputs.concreteVolume?.toFixed(2) || 0}m³` : 'Pending',
      };
    case 'column':
      return {
        axialLoad: `${inputs.axialLoad || 0}kN`,
        size: `${inputs.columnWidth || 0}x${inputs.columnDepth || 0}mm`,
        height: `${inputs.columnHeight || 0}mm`,
        type: inputs.columnType || 'tied',
      };
    case 'slab':
      return {
        dimensions: `${inputs.length || 0}x${inputs.width || 0}mm`,
        thickness: `${inputs.thickness || 0}mm`,
        type: inputs.slabType || 'one_way',
        load: `${(inputs.deadLoad || 0) + (inputs.liveLoad || 0)} kN/m²`,
      };
    case 'retaining_wall':
      return {
        height: `${inputs.wallHeight || 0}m`,
        stemThickness: `${inputs.stemThicknessBottom || 0}mm`,
        baseWidth: `${inputs.baseWidth || 0}mm`,
        soilPressure: `${inputs.soilDensity || 0} kN/m³`,
      };
    case 'parking':
      return {
        siteArea: `${(parseFloat(inputs.siteLength || '0') * parseFloat(inputs.siteWidth || '0')).toLocaleString()}m²`,
        totalSpaces: outputs?.layout?.totalSpaces || outputs?.totalSpaces || 0,
        accessibleSpaces: outputs?.layout?.accessibleSpaces || outputs?.accessibleSpaces || 0,
        evSpaces: outputs?.layout?.evSpaces || outputs?.evSpaces || 0,
        efficiency: outputs?.efficiency ? `${outputs.efficiency}%` : 'N/A',
      };
    case 'grading':
      return {
        cutVolume: outputs?.totalCutVolume ? `${outputs.totalCutVolume.toLocaleString()}m³` : 'N/A',
        fillVolume: outputs?.totalFillVolume ? `${outputs.totalFillVolume.toLocaleString()}m³` : 'N/A',
        netVolume: outputs?.netVolume ? `${outputs.netVolume.toLocaleString()}m³` : 'N/A',
        maxSlope: outputs?.maxSlope ? `${outputs.maxSlope}%` : 'N/A',
      };
    default:
      return {};
  }
}

export const SaveDesignDialog: React.FC<SaveDesignDialogProps> = ({
  isOpen,
  onClose,
  onSaved,
  userId,
  calculationType,
  inputs,
  outputs,
  defaultTitle,
}) => {
  const [title, setTitle] = useState(defaultTitle || `${typeLabels[calculationType] || calculationType} - ${new Date().toLocaleDateString()}`);
  const [description, setDescription] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    if (!userId) {
      toast({
        title: 'Not Authenticated',
        description: 'Please sign in to save designs to your portfolio.',
        variant: 'destructive',
      });
      return;
    }

    if (!title.trim()) {
      toast({
        title: 'Title Required',
        description: 'Please enter a title for your design.',
        variant: 'destructive',
      });
      return;
    }

    setIsSaving(true);

    try {
      // First, save to calculation_history
      const { data: calcData, error: calcError } = await supabase
        .from('calculation_history')
        .insert({
          user_id: userId,
          calculation_type: calculationType,
          inputs: inputs as Json,
          outputs: (outputs || {}) as Json,
        })
        .select()
        .single();

      if (calcError) throw calcError;

      // Then save to engineering_portfolio
      const keySpecs = generateKeySpecs(calculationType, inputs, outputs);

      const { error: portfolioError } = await supabase
        .from('engineering_portfolio')
        .insert({
          user_id: userId,
          calculation_id: calcData.id,
          title: title.trim(),
          description: description.trim() || null,
          project_type: calculationType,
          key_specs: keySpecs as Json,
          is_public: false,
        });

      if (portfolioError) throw portfolioError;

      // Also save to user memory for AYN context
      try {
        await supabase.rpc('upsert_user_memory', {
          _user_id: userId,
          _memory_type: 'project',
          _memory_key: `saved_${calculationType}_${title.toLowerCase().replace(/\s+/g, '_').slice(0, 30)}`,
          _memory_data: {
            type: calculationType,
            title: title.trim(),
            keySpecs: Object.fromEntries(
              Object.entries(keySpecs).slice(0, 5)
            ),
            savedAt: new Date().toISOString()
          },
          _priority: 2
        });
        if (import.meta.env.DEV) {
          console.log('[SaveDesignDialog] Design saved to user memory for AYN');
        }
      } catch (memoryError) {
        if (import.meta.env.DEV) {
          console.error('[SaveDesignDialog] Failed to save to memory:', memoryError);
        }
        // Non-blocking - design still saved to portfolio
      }

      toast({
        title: 'Design Saved!',
        description: `"${title}" has been added to your portfolio.`,
      });

      onSaved?.();
      onClose();
      
      // Reset form
      setTitle('');
      setDescription('');
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error('Error saving design:', error);
      }
      toast({
        title: 'Save Failed',
        description: 'Could not save design to portfolio. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm"
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          className="w-full max-w-md mx-4 bg-card border border-border rounded-2xl shadow-2xl overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-border">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-gradient-to-br from-primary/20 to-accent/20">
                <Save className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h3 className="font-semibold">Save to Portfolio</h3>
                <p className="text-xs text-muted-foreground">
                  {typeLabels[calculationType] || calculationType}
                </p>
              </div>
            </div>
            <Button variant="ghost" size="icon" onClick={onClose} className="h-8 w-8">
              <X className="w-4 h-4" />
            </Button>
          </div>

          {/* Form */}
          <div className="p-4 space-y-4">
            {/* Title */}
            <div className="space-y-2">
              <Label htmlFor="title" className="text-sm font-medium">
                Design Title *
              </Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Enter a descriptive title..."
                className="h-10"
              />
            </div>

            {/* Description */}
            <div className="space-y-2">
              <Label htmlFor="description" className="text-sm font-medium">
                Notes / Description
              </Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Add any notes about this design..."
                rows={3}
                className="resize-none"
              />
            </div>

            {/* Key Specs Preview */}
            <div className="p-3 bg-muted/30 rounded-lg space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Key Specifications
              </p>
              <div className="grid grid-cols-2 gap-2">
                {Object.entries(generateKeySpecs(calculationType, inputs, outputs)).slice(0, 4).map(([key, value]) => (
                  <div key={key} className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground capitalize">{key.replace(/([A-Z])/g, ' $1').trim()}:</span>
                    <span className="font-medium">{String(value)}</span>
                  </div>
                ))}
              </div>
            </div>

          </div>

          {/* Actions */}
          <div className="flex items-center gap-3 p-4 border-t border-border bg-muted/20">
            <Button variant="outline" onClick={onClose} className="flex-1">
              Cancel
            </Button>
            <Button 
              onClick={handleSave} 
              disabled={isSaving || !title.trim()}
              className="flex-1 gap-2"
            >
              {isSaving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  Save Design
                </>
              )}
            </Button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

export default SaveDesignDialog;
