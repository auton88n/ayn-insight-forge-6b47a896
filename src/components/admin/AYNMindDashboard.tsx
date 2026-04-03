import { useState, useEffect, useMemo } from 'react';
import { adminSupabase as supabase } from '@/admin-app/adminSupabase';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Brain, Lightbulb, Eye, MessageCircle, TrendingUp, Smile, ChevronDown, RefreshCw, Loader2, Target, Zap, Mail } from 'lucide-react';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';

type MindEntryType = 'observation' | 'idea' | 'thought' | 'trend' | 'mood' | 'telegram_admin' | 'telegram_ayn' | 'sales_lead' | 'initiative' | 'sales_draft';
type FilterType = 'all' | 'idea' | 'observation' | 'thought' | 'trend' | 'mood' | 'sales_lead' | 'initiative' | 'sales_draft';

interface MindEntry {
  id: string;
  type: string;
  content: string;
  context: Record<string, unknown> | null;
  created_at: string;
  shared_with_admin: boolean;
}

const TYPE_CONFIG: Record<string, { icon: React.ElementType; label: string; color: string; gradient: string }> = {
  idea: { icon: Lightbulb, label: 'Idea', color: 'text-amber-500', gradient: 'from-amber-500/10 to-yellow-500/10' },
  observation: { icon: Eye, label: 'Observation', color: 'text-blue-500', gradient: 'from-blue-500/10 to-cyan-500/10' },
  thought: { icon: MessageCircle, label: 'Thought', color: 'text-purple-500', gradient: 'from-purple-500/10 to-violet-500/10' },
  trend: { icon: TrendingUp, label: 'Trend', color: 'text-emerald-500', gradient: 'from-emerald-500/10 to-teal-500/10' },
  mood: { icon: Smile, label: 'Mood', color: 'text-rose-500', gradient: 'from-rose-500/10 to-pink-500/10' },
  sales_lead: { icon: Target, label: 'Sales Lead', color: 'text-orange-500', gradient: 'from-orange-500/10 to-red-500/10' },
  initiative: { icon: Zap, label: 'Initiative', color: 'text-indigo-500', gradient: 'from-indigo-500/10 to-blue-500/10' },
  sales_draft: { icon: Mail, label: 'Email Draft', color: 'text-teal-500', gradient: 'from-teal-500/10 to-emerald-500/10' },
};

const FILTERS: { value: FilterType; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'idea', label: 'Ideas' },
  { value: 'observation', label: 'Observations' },
  { value: 'thought', label: 'Thoughts' },
  { value: 'trend', label: 'Trends' },
  { value: 'mood', label: 'Mood' },
  { value: 'sales_lead', label: 'Sales Leads' },
  { value: 'initiative', label: 'Initiatives' },
  { value: 'sales_draft', label: 'Email Drafts' },
];

const ENTRY_TYPES = ['observation', 'idea', 'thought', 'trend', 'mood', 'sales_lead', 'initiative', 'sales_draft'];

const MindEntryCard = ({ entry }: { entry: MindEntry }) => {
  const [isOpen, setIsOpen] = useState(false);
  const config = TYPE_CONFIG[entry.type] || TYPE_CONFIG.observation;
  const Icon = config.icon;
  const hasContext = entry.context && Object.keys(entry.context).length > 0;

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <div className={cn("rounded-xl border border-border/50 bg-gradient-to-r p-4 transition-all", config.gradient)}>
        <CollapsibleTrigger asChild>
          <button className="w-full text-left">
            <div className="flex items-start gap-3">
              <div className={cn("mt-0.5 p-1.5 rounded-lg bg-background/80", config.color)}>
                <Icon className="w-4 h-4" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <Badge variant="outline" className="text-xs font-medium">
                    {config.label}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {format(new Date(entry.created_at), 'MMM d, yyyy · h:mm a')}
                  </span>
                </div>
                <p className="text-sm text-foreground leading-relaxed">{entry.content}</p>
              </div>
              {hasContext && (
                <ChevronDown className={cn("w-4 h-4 text-muted-foreground transition-transform shrink-0 mt-1", isOpen && "rotate-180")} />
              )}
            </div>
          </button>
        </CollapsibleTrigger>
        {hasContext && (
          <CollapsibleContent>
            <div className="mt-3 ml-10 p-3 rounded-lg bg-background/60 border border-border/30">
              <p className="text-xs font-medium text-muted-foreground mb-2">Context</p>
              <pre className="text-xs text-foreground/80 whitespace-pre-wrap font-mono overflow-x-auto">
                {JSON.stringify(entry.context, null, 2)}
              </pre>
            </div>
          </CollapsibleContent>
        )}
      </div>
    </Collapsible>
  );
};

export const AYNMindDashboard = () => {
  const [entries, setEntries] = useState<MindEntry[]>([]);
  const [filter, setFilter] = useState<FilterType>('all');
  const [isLoading, setIsLoading] = useState(true);

  const fetchEntries = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('ayn_mind')
        .select('*')
        .in('type', ENTRY_TYPES)
        .order('created_at', { ascending: false })
        .limit(200);

      if (error) throw error;
      setEntries((data as unknown as MindEntry[]) || []);
    } catch (err) {
      console.error('Failed to fetch AYN mind entries:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchEntries();

    const channel = supabase
      .channel('ayn-mind-realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'ayn_mind' }, (payload) => {
        const newEntry = payload.new as MindEntry;
        if (ENTRY_TYPES.includes(newEntry.type)) {
          setEntries(prev => [newEntry, ...prev]);
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  const filtered = useMemo(() => {
    if (filter === 'all') return entries;
    return entries.filter(e => e.type === filter);
  }, [entries, filter]);

  const latestMood = useMemo(() => entries.find(e => e.type === 'mood'), [entries]);
  const latestObservation = useMemo(() => entries.find(e => e.type === 'observation'), [entries]);

  const healthScore = useMemo(() => {
    if (!latestObservation?.context) return null;
    const ctx = latestObservation.context as Record<string, unknown>;
    return ctx.health_score ?? ctx.healthScore ?? null;
  }, [latestObservation]);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const t of ENTRY_TYPES) c[t] = entries.filter(e => e.type === t).length;
    return c;
  }, [entries]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 text-white shadow-lg">
            <Brain className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-foreground">AYN's Mind</h2>
            <p className="text-sm text-muted-foreground">Observations, ideas, sales leads, and initiatives</p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={fetchEntries} disabled={isLoading}>
          <RefreshCw className={cn("w-4 h-4 mr-2", isLoading && "animate-spin")} />
          Refresh
        </Button>
      </div>

      {/* Status Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <Card className="border-border/50">
          <CardContent className="p-4 flex items-center gap-3">
            <Smile className="w-5 h-5 text-rose-500" />
            <div>
              <p className="text-xs text-muted-foreground">Current Mood</p>
              <p className="text-sm font-semibold capitalize">{latestMood?.content?.slice(0, 50) || 'Unknown'}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border/50">
          <CardContent className="p-4 flex items-center gap-3">
            <Eye className="w-5 h-5 text-blue-500" />
            <div>
              <p className="text-xs text-muted-foreground">Health Score</p>
              <p className="text-sm font-semibold">{healthScore !== null ? `${healthScore}%` : 'N/A'}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border/50">
          <CardContent className="p-4 flex items-center gap-3">
            <Target className="w-5 h-5 text-orange-500" />
            <div>
              <p className="text-xs text-muted-foreground">Sales Leads</p>
              <p className="text-sm font-semibold">{counts.sales_lead || 0}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border/50">
          <CardContent className="p-4 flex items-center gap-3">
            <Zap className="w-5 h-5 text-indigo-500" />
            <div>
              <p className="text-xs text-muted-foreground">Initiatives</p>
              <p className="text-sm font-semibold">{counts.initiative || 0}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        {FILTERS.map(f => (
          <Button
            key={f.value}
            variant={filter === f.value ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilter(f.value)}
            className="rounded-full"
          >
            {f.label}
            {f.value !== 'all' && (
              <span className="ml-1.5 text-xs opacity-70">
                {counts[f.value] || 0}
              </span>
            )}
          </Button>
        ))}
      </div>

      {/* Entries */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <Card className="border-border/50">
          <CardContent className="p-8 text-center">
            <Brain className="w-8 h-8 mx-auto text-muted-foreground/50 mb-2" />
            <p className="text-sm text-muted-foreground">No entries found for this filter.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map(entry => (
            <MindEntryCard key={entry.id} entry={entry} />
          ))}
        </div>
      )}
    </div>
  );
};
