import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Lightbulb, Play, Loader2, AlertCircle, Clock, Zap } from 'lucide-react';
import { adminSupabase as supabase } from '@/admin-app/adminSupabase';
import { toast } from 'sonner';

interface Improvement {
  id: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  category: string;
  title: string;
  description: string;
  impact: string;
  effort: string;
}

const AIImprovements: React.FC = () => {
  const [isRunning, setIsRunning] = useState(false);
  const [improvements, setImprovements] = useState<Improvement[]>([]);
  const [aiAnalysis, setAiAnalysis] = useState<string>('');

  const runAnalysis = async () => {
    setIsRunning(true);
    try {
      const data: { improvements: any[]; aiAnalysis?: string } = { improvements: [], aiAnalysis: 'Analysis requires configuration' }; const error = null;
      if (error) throw error;
      
      setImprovements(data.improvements || []);
      setAiAnalysis(data.aiAnalysis || '');
      toast.success(`Found ${data.improvements?.length || 0} improvement opportunities`);
    } catch (err) {
      toast.error('Analysis failed');
    } finally {
      setIsRunning(false);
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'critical': return 'destructive';
      case 'high': return 'default';
      case 'medium': return 'secondary';
      default: return 'outline';
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <Lightbulb className="h-5 w-5" />
          AI Improvement Advisor
        </CardTitle>
        <Button onClick={runAnalysis} disabled={isRunning} size="sm">
          {isRunning ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Zap className="h-4 w-4 mr-2" />}
          Analyze
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {aiAnalysis && (
          <div className="p-4 bg-primary/5 rounded-lg border">
            <h4 className="font-medium mb-2 flex items-center gap-2">
              <Lightbulb className="h-4 w-4" /> AI Analysis
            </h4>
            <p className="text-sm text-muted-foreground whitespace-pre-line">{aiAnalysis}</p>
          </div>
        )}

        <div className="space-y-2">
          {improvements.slice(0, 10).map((imp) => (
            <div key={imp.id} className="p-3 border rounded-lg">
              <div className="flex items-start justify-between gap-2 mb-1">
                <span className="font-medium text-sm">{imp.title}</span>
                <Badge variant={getPriorityColor(imp.priority) as any}>{imp.priority}</Badge>
              </div>
              <p className="text-xs text-muted-foreground mb-2">{imp.description}</p>
              <div className="flex gap-2 text-xs">
                <span className="flex items-center gap-1"><AlertCircle className="h-3 w-3" />{imp.category}</span>
                <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{imp.effort}</span>
              </div>
            </div>
          ))}
        </div>

        {improvements.length === 0 && !isRunning && (
          <p className="text-center text-muted-foreground py-8">Click "Analyze" to get AI-powered improvement suggestions</p>
        )}
      </CardContent>
    </Card>
  );
};

export default AIImprovements;
