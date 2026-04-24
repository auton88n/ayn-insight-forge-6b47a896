import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { 
  AlertDialog, 
  AlertDialogAction, 
  AlertDialogCancel, 
  AlertDialogContent, 
  AlertDialogDescription, 
  AlertDialogFooter, 
  AlertDialogHeader, 
  AlertDialogTitle, 
  AlertDialogTrigger 
} from '@/components/ui/alert-dialog';
import { 
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { 
  Brain, 
  Trash2, 
  Eye, 
  Loader2, 
  User, 
  Settings2, 
  FolderOpen,
  Clock,
  AlertTriangle
} from 'lucide-react';

interface Memory {
  id: string;
  memory_type: string;
  memory_key: string;
  memory_data: Record<string, any> | null;
  created_at: string | null;
  expires_at: string | null;
  priority: number | null;
}

interface MemoryManagementProps {
  userId: string;
}

const memoryTypeIcons: Record<string, React.ReactNode> = {
  profile: <User className="w-4 h-4" />,
  preference: <Settings2 className="w-4 h-4" />,
  project: <FolderOpen className="w-4 h-4" />,
  conversation: <Clock className="w-4 h-4" />,
};

const memoryTypeColors: Record<string, string> = {
  profile: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
  preference: 'bg-purple-500/10 text-purple-500 border-purple-500/20',
  project: 'bg-green-500/10 text-green-500 border-green-500/20',
  conversation: 'bg-orange-500/10 text-orange-500 border-orange-500/20',
};

export const MemoryManagement: React.FC<MemoryManagementProps> = ({ userId }) => {
  const { toast } = useToast();
  const [memories, setMemories] = useState<Memory[]>([]);
  const [loading, setLoading] = useState(false);
  const [isViewerOpen, setIsViewerOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [clearingAll, setClearingAll] = useState(false);

  const fetchMemories = useCallback(async () => {
    if (!userId) return;
    
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('user_memory')
        .select('*')
        .eq('user_id', userId)
        .order('priority', { ascending: true })
        .order('created_at', { ascending: false });

      if (error) throw error;
      setMemories((data || []).map(d => ({
        ...d,
        memory_data: typeof d.memory_data === 'object' && d.memory_data !== null ? d.memory_data as Record<string, any> : {}
      })));
    } catch (error) {
      console.error('Error fetching memories:', error);
      toast({
        title: 'Error',
        description: 'Failed to load memories',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [userId, toast]);

  useEffect(() => {
    if (isViewerOpen) {
      fetchMemories();
    }
  }, [isViewerOpen, userId, fetchMemories]);

  const handleDeleteMemory = async (memoryId: string) => {
    setDeletingId(memoryId);
    try {
      const { error } = await supabase
        .from('user_memory')
        .delete()
        .eq('id', memoryId)
        .eq('user_id', userId);

      if (error) throw error;

      setMemories(prev => prev.filter(m => m.id !== memoryId));
      toast({
        title: 'Memory Deleted',
        description: 'AYN will no longer remember this.',
      });
    } catch (error) {
      console.error('Error deleting memory:', error);
      toast({
        title: 'Error',
        description: 'Failed to delete memory',
        variant: 'destructive',
      });
    } finally {
      setDeletingId(null);
    }
  };

  const handleClearAllMemories = async () => {
    setClearingAll(true);
    try {
      const { error } = await supabase
        .from('user_memory')
        .delete()
        .eq('user_id', userId);

      if (error) throw error;

      setMemories([]);
      toast({
        title: 'All Memories Cleared',
        description: 'AYN has forgotten everything about you.',
      });
      setIsViewerOpen(false);
    } catch (error) {
      console.error('Error clearing memories:', error);
      toast({
        title: 'Error',
        description: 'Failed to clear memories',
        variant: 'destructive',
      });
    } finally {
      setClearingAll(false);
    }
  };

  const groupedMemories = memories.reduce((acc, memory) => {
    const type = memory.memory_type;
    if (!acc[type]) acc[type] = [];
    acc[type].push(memory);
    return acc;
  }, {} as Record<string, Memory[]>);

  // Format memory data for display in a human-readable way
  const formatMemoryDisplay = (memory: Memory): string => {
    if (!memory.memory_data) return 'No data';
    
    const data = memory.memory_data;
    
    // Simple value field
    if (data.value && typeof data.value === 'string') return data.value;
    
    // Project memory with title
    if (data.title) {
      let summary = String(data.title);
      
      // Add key specs if available
      if (data.keySpecs && typeof data.keySpecs === 'object') {
        const specs = data.keySpecs as Record<string, unknown>;
        const parts: string[] = [];
        
        if (specs.siteArea) parts.push(String(specs.siteArea));
        if (specs.totalSpaces) parts.push(`${specs.totalSpaces} spaces`);
        if (specs.efficiency) parts.push(`${specs.efficiency} efficiency`);
        if (specs.evSpaces) parts.push(`${specs.evSpaces} EV`);
        
        if (parts.length > 0) {
          summary += ` (${parts.slice(0, 3).join(', ')})`;
        }
      }
      
      return summary;
    }
    
    // Engineering calculation with type
    if (data.type && typeof data.type === 'string') {
      const type = data.type.charAt(0).toUpperCase() + data.type.slice(1);
      if (data.savedAt) {
        return `${type} design saved`;
      }
      return `${type} data`;
    }
    
    // Fallback: show first few meaningful fields
    const keys = Object.keys(data).filter(k => 
      !['id', 'created_at', 'updated_at', 'user_id'].includes(k)
    ).slice(0, 2);
    
    if (keys.length === 0) return 'Stored data';
    
    return keys.map(k => {
      const val = data[k];
      const strVal = typeof val === 'object' ? JSON.stringify(val).substring(0, 20) : String(val).substring(0, 30);
      return `${k.replace(/_/g, ' ')}: ${strVal}`;
    }).join(', ');
  };

  return (
    <Card className="p-6 bg-card/50 backdrop-blur-xl border-border/50">
      <div className="flex items-center gap-3 mb-6">
        <div className="p-2 rounded-xl bg-gradient-to-br from-primary/20 to-accent/20">
          <Brain className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h2 className="text-xl font-semibold">AYN Memory</h2>
          <p className="text-sm text-muted-foreground">
            Control what AYN remembers about you
          </p>
        </div>
      </div>

      <div className="space-y-4">
        {/* View Memories Button */}
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label className="text-sm font-medium">View My Memories</Label>
            <p className="text-sm text-muted-foreground">
              See what AYN remembers about you
            </p>
          </div>
          <Button 
            variant="outline" 
            onClick={() => setIsViewerOpen(true)}
            className="gap-2"
          >
            <Eye className="w-4 h-4" />
            View ({memories.length || '...'})
          </Button>
        </div>

        {/* Clear All Memories */}
        <div className="flex items-center justify-between pt-4 border-t border-border">
          <div className="space-y-0.5">
            <Label className="text-sm font-medium text-destructive">Clear All Memories</Label>
            <p className="text-sm text-muted-foreground">
              Make AYN forget everything about you
            </p>
          </div>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" className="gap-2">
                <Trash2 className="w-4 h-4" />
                Clear All
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle className="flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-destructive" />
                  Clear All Memories?
                </AlertDialogTitle>
                <AlertDialogDescription>
                  This will permanently delete all memories AYN has about you, including 
                  your name, preferences, and project history. This cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleClearAllMemories}
                  className="bg-destructive text-destructive-foreground"
                  disabled={clearingAll}
                >
                  {clearingAll ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Clearing...
                    </>
                  ) : (
                    'Clear All Memories'
                  )}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      {/* Memory Viewer Dialog */}
      <Dialog open={isViewerOpen} onOpenChange={setIsViewerOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Brain className="w-5 h-5 text-primary" />
              What AYN Remembers
            </DialogTitle>
          </DialogHeader>

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
            </div>
          ) : memories.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Brain className="w-12 h-12 mx-auto mb-4 opacity-30" />
              <p>AYN hasn't learned anything about you yet.</p>
              <p className="text-sm mt-1">Start chatting and AYN will remember helpful details!</p>
            </div>
          ) : (
            <ScrollArea className="h-[50vh] pr-4">
              <div className="space-y-6">
                {Object.entries(groupedMemories).map(([type, typeMemories]) => (
                  <div key={type}>
                    <div className="flex items-center gap-2 mb-3">
                      {memoryTypeIcons[type] || <Brain className="w-4 h-4" />}
                      <h3 className="font-medium capitalize">{type}</h3>
                      <Badge variant="secondary" className="text-xs">
                        {typeMemories.length}
                      </Badge>
                    </div>
                    <div className="space-y-2">
                      <AnimatePresence>
                        {typeMemories.map((memory) => (
                          <motion.div
                            key={memory.id}
                            initial={{ opacity: 0, y: -10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, x: -20 }}
                            className={`p-3 rounded-lg border ${memoryTypeColors[type] || 'bg-muted/30 border-border'}`}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex-1 min-w-0">
                                <p className="font-medium text-sm capitalize">
                                  {memory.memory_key.replace(/_/g, ' ')}
                                </p>
                                <p className="text-sm text-muted-foreground mt-1 break-words">
                                  {formatMemoryDisplay(memory)}
                                </p>
                                <p className="text-xs text-muted-foreground mt-2">
                                  Learned {memory.created_at ? new Date(memory.created_at).toLocaleDateString() : 'Unknown'}
                                </p>
                              </div>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                                onClick={() => handleDeleteMemory(memory.id)}
                                disabled={deletingId === memory.id}
                              >
                                {deletingId === memory.id ? (
                                  <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                  <Trash2 className="w-4 h-4" />
                                )}
                              </Button>
                            </div>
                          </motion.div>
                        ))}
                      </AnimatePresence>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
};

export default MemoryManagement;
