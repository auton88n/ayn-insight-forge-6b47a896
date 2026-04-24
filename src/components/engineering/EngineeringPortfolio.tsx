import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '@/integrations/supabase/client';
import { Briefcase, Plus, Eye, EyeOff, Trash2, ExternalLink, Loader2, Building2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import PortfolioCard from './PortfolioCard';

interface PortfolioItem {
  id: string;
  title: string;
  description: string | null;
  thumbnail_url: string | null;
  project_type: string;
  key_specs: Record<string, any> | null;
  is_public: boolean | null;
  created_at: string;
  calculation_id: string | null;
}

interface EngineeringPortfolioProps {
  userId: string | undefined;
  onAddToPortfolio?: () => void;
}

const EngineeringPortfolio = ({ userId, onAddToPortfolio }: EngineeringPortfolioProps) => {
  const [items, setItems] = useState<PortfolioItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isExpanded, setIsExpanded] = useState(false);
  const { toast } = useToast();

  const fetchPortfolio = useCallback(async () => {
    if (!userId) return;
    
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('engineering_portfolio')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      // Map data to ensure proper typing
      const mappedItems: PortfolioItem[] = (data || []).map(item => ({
        ...item,
        key_specs: item.key_specs as Record<string, any> | null,
      }));
      setItems(mappedItems);
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error('Error fetching portfolio:', error);
      }
    } finally {
      setIsLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    if (userId) {
      fetchPortfolio();
    }
  }, [userId, fetchPortfolio]);

  const togglePublic = async (itemId: string, currentState: boolean) => {
    try {
      const { error } = await supabase
        .from('engineering_portfolio')
        .update({ is_public: !currentState })
        .eq('id', itemId);

      if (error) throw error;

      setItems(prev => 
        prev.map(item => 
          item.id === itemId ? { ...item, is_public: !currentState } : item
        )
      );

      toast({
        title: !currentState ? 'Made Public' : 'Made Private',
        description: !currentState 
          ? 'This design is now visible in the public gallery.'
          : 'This design is now private.',
      });
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error('Error updating portfolio item:', error);
      }
      toast({
        title: "Couldn't Update Visibility",
        description: "Your changes weren't saved. Please try again.",
        variant: 'destructive',
      });
    }
  };

  const deleteItem = async (itemId: string) => {
    try {
      const { error } = await supabase
        .from('engineering_portfolio')
        .delete()
        .eq('id', itemId);

      if (error) throw error;

      setItems(prev => prev.filter(item => item.id !== itemId));

      toast({
        title: 'Removed',
        description: 'Design removed from portfolio.',
      });
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error('Error deleting portfolio item:', error);
      }
      toast({
        title: "Couldn't Remove Design",
        description: "Your design wasn't removed. Please try again.",
        variant: 'destructive',
      });
    }
  };

  if (!userId) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="mt-12"
    >
      {/* Portfolio Header */}
      <div 
        className="flex items-center justify-between p-4 bg-card rounded-xl border border-border cursor-pointer hover:bg-card/80 transition-colors"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-gradient-to-br from-amber-500 to-orange-500">
            <Briefcase className="w-5 h-5 text-white" />
          </div>
          <div>
            <h3 className="text-lg font-semibold">My Portfolio</h3>
            <p className="text-sm text-muted-foreground">
              {items.length} design{items.length !== 1 ? 's' : ''} saved
            </p>
          </div>
        </div>
        <motion.div
          animate={{ rotate: isExpanded ? 180 : 0 }}
          transition={{ duration: 0.2 }}
        >
          <Building2 className="w-5 h-5 text-muted-foreground" />
        </motion.div>
      </div>

      {/* Portfolio Content */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="overflow-hidden"
          >
            <div className="pt-4 space-y-4">
              {isLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                </div>
              ) : items.length === 0 ? (
                <div className="text-center py-12 bg-muted/30 rounded-xl border border-dashed border-border">
                  <Briefcase className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                  <h4 className="font-medium mb-2">No designs saved yet</h4>
                  <p className="text-sm text-muted-foreground mb-4">
                    Complete a calculation and save it to your portfolio
                  </p>
                  {onAddToPortfolio && (
                    <Button variant="outline" size="sm" onClick={onAddToPortfolio}>
                      <Plus className="w-4 h-4 mr-2" />
                      Add First Design
                    </Button>
                  )}
                </div>
              ) : (
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {items.map((item, index) => (
                    <PortfolioCard
                      key={item.id}
                      item={item}
                      index={index}
                      onTogglePublic={() => togglePublic(item.id, item.is_public ?? false)}
                      onDelete={() => deleteItem(item.id)}
                    />
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

export default EngineeringPortfolio;
