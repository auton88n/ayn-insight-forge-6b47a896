import { useState, useMemo } from 'react';
import { adminSupabase as supabase } from '@/admin-app/adminSupabase';
import { AlertTriangle, RefreshCw, Bug, Clock, User, ChevronDown, ChevronRight, CheckCircle, EyeOff, Wrench, Lightbulb, X } from 'lucide-react';
import { toast } from 'sonner';
import { useAdminErrorMonitoring, adminKeys } from '@/admin-app/hooks/useAdminQuery';
import { useQueryClient } from '@tanstack/react-query';

interface ErrorGroup {
  message: string;
  count: number;
  last_seen: string;
  first_seen: string;
  user_ids: string[];
  urls: string[];
  sample_stack: string | null;
  status: 'open' | 'resolved' | 'ignored';
  resolution_note?: string;
  fix_description?: string;
}

// Built-in fix suggestions for known error patterns
const FIX_SUGGESTIONS: Record<string, { cause: string; fix: string; severity: 'critical' | 'high' | 'low' }> = {
  'ClientSign is not defined': {
    cause: 'A variable `ClientSign` is referenced before it\'s defined. Likely a missing import or a component using a value from a context that hasn\'t loaded yet.',
    fix: 'Search codebase for `ClientSign` usage. Add proper import or check that the parent context/hook provides this value before the component renders. Add a null-check guard: `if (!ClientSign) return null`.',
    severity: 'critical',
  },
  'worldSignals is not defined': {
    cause: '`worldSignals` variable is used before being defined — likely an edge function or component is referencing a variable from `ayn-world-signals` that hasn\'t been imported or the function returned null.',
    fix: 'In the world-intelligence component, add: `const worldSignals = data?.worldSignals ?? []` before using it. Check that `ayn-world-signals` edge function is returning data correctly.',
    severity: 'high',
  },
  "text/html' is not a valid JavaScript MIME type": {
    cause: 'A JS/CSS import is returning an HTML page (404 error page) instead of the actual file. This happens when a chunk fails to load and the CDN returns a 404 HTML page.',
    fix: 'This is a Vite chunk loading issue. Force a hard refresh or redeploy. If persistent, check Hostinger deployment — the assets may not have been uploaded correctly. Run `npm run build` and redeploy.',
    severity: 'high',
  },
  'Failed to fetch dynamically imported module': {
    cause: 'A lazy-loaded React route or component chunk is failing to load. Old cached HTML referencing a chunk that no longer exists after a redeploy.',
    fix: 'Users need to hard-refresh (Ctrl+Shift+R). Add a service worker that clears cache on new deploy, or add a version check that forces reload when new code is detected.',
    severity: 'low',
  },
  'React.Children.only expected to receive a single React element child': {
    cause: 'A component using `React.Children.only()` received multiple children or null. Common with Radix UI primitives like `Tooltip`, `Dialog`, `Popover` when wrapping multiple elements.',
    fix: 'Find the component throwing this error (check component_stack). Wrap the children in a single `<span>` or `<div>`, or use `asChild` prop if it\'s a Radix component.',
    severity: 'low',
  },
  'Cannot read properties of undefined': {
    cause: 'Trying to access a property on an undefined variable. Likely a race condition where data is accessed before it\'s loaded.',
    fix: 'Add optional chaining: `obj?.property` instead of `obj.property`. Check the component_stack to find exactly which component and line.',
    severity: 'high',
  },
  'currentUsage is not defined': {
    cause: '`currentUsage` variable referenced before definition — likely in the usage tracking hook or subscription context.',
    fix: 'Search for `currentUsage` in the codebase and add a default value: `const currentUsage = usageData?.current ?? 0`.',
    severity: 'high',
  },
};

function getFix(message: string) {
  for (const [pattern, fix] of Object.entries(FIX_SUGGESTIONS)) {
    if (message.includes(pattern)) return fix;
  }
  return null;
}

function timeAgo(d: string) {
  const diff = Date.now() - new Date(d).getTime();
  const h = Math.floor(diff / 3600000);
  const dy = Math.floor(diff / 86400000);
  if (h < 1) return 'just now';
  if (h < 24) return `${h}h ago`;
  return `${dy}d ago`;
}

export const ErrorMonitoring = () => {
  const queryClient = useQueryClient();
  const { data: rpcData, isLoading: loading } = useAdminErrorMonitoring();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [timeRange, setTimeRange] = useState<'24h' | '7d' | '30d' | 'all'>('7d');
  const [showResolved, setShowResolved] = useState(false);
  const [fixingError, setFixingError] = useState<string | null>(null);
  const [noteInput, setNoteInput] = useState('');

  const { groups, totalErrors } = useMemo(() => {
    let rows = ((rpcData as any)?.errors || []);
    if (timeRange !== 'all') {
      const ms = { '24h': 86400000, '7d': 604800000, '30d': 2592000000 }[timeRange];
      const cutoff = new Date(Date.now() - ms).toISOString();
      rows = rows.filter((r: any) => r.created_at >= cutoff);
    }
    const resolutions = (rpcData as any)?.resolutions || [];
    const resMap = new Map((resolutions).map((r: any) => [r.error_pattern, r]));

    const map = new Map<string, ErrorGroup>();
    rows.forEach((r: any) => {
      const key = (r.error_message || 'Unknown error').slice(0, 120);
      if (!map.has(key)) {
        const res = resMap.get(key) as any;
        map.set(key, {
          message: key, count: 0, last_seen: r.created_at, first_seen: r.created_at,
          user_ids: [], urls: [], sample_stack: r.error_stack,
          status: res?.status || 'open',
          resolution_note: res?.resolution_note,
          fix_description: res?.fix_description,
        });
      }
      const g = map.get(key)!;
      g.count++;
      if (r.created_at > g.last_seen) g.last_seen = r.created_at;
      if (r.created_at < g.first_seen) g.first_seen = r.created_at;
      if (r.user_id && !g.user_ids.includes(r.user_id)) g.user_ids.push(r.user_id);
      if (r.url && !g.urls.includes(r.url)) g.urls.push(r.url);
    });

    const sorted = Array.from(map.values()).sort((a, b) => {
      if (a.status === 'open' && b.status !== 'open') return -1;
      if (a.status !== 'open' && b.status === 'open') return 1;
      return b.count - a.count;
    });
    return { groups: sorted, totalErrors: rows.length };
  }, [rpcData, timeRange]);

  const updateResolution = async (pattern: string, status: 'resolved' | 'ignored', note: string) => {
    const { error } = await supabase.from('error_group_resolutions').upsert({
      error_pattern: pattern,
      status,
      resolution_note: note,
      resolved_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'error_pattern' });

    if (error) { toast.error('Failed to update: ' + error.message); return; }

    toast.success(status === 'resolved' ? '✅ Marked as resolved' : '🙈 Ignored');
    setFixingError(null);
    setNoteInput('');
    queryClient.invalidateQueries({ queryKey: adminKeys.errorMonitoring() });
  };

  const reopen = async (pattern: string) => {
    const { error } = await supabase.from('error_group_resolutions')
      .update({ status: 'open', resolved_at: null, updated_at: new Date().toISOString() })
      .eq('error_pattern', pattern);
    if (error) { toast.error('Failed'); return; }
    toast.success('Reopened');
    queryClient.invalidateQueries({ queryKey: adminKeys.errorMonitoring() });
  };

  const severityColor = (count: number, status: string) => {
    if (status !== 'open') return 'bg-white/5 text-white/20 border-white/10';
    if (count > 100) return 'bg-red-500/20 text-red-400 border-red-500/30';
    if (count > 20) return 'bg-orange-500/20 text-orange-400 border-orange-500/30';
    if (count > 5) return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
    return 'bg-white/5 text-white/40 border-white/10';
  };

  const visible = groups.filter(g => showResolved || g.status === 'open');
  const openCount = groups.filter(g => g.status === 'open').length;
  const resolvedCount = groups.filter(g => g.status === 'resolved').length;

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-white font-semibold text-lg flex items-center gap-2">
            <Bug className="w-5 h-5 text-red-400" />Error Monitoring
          </h2>
          <p className="text-white/30 text-sm">{totalErrors} total errors — {openCount} open, {resolvedCount} resolved</p>
        </div>
        <div className="flex gap-2 items-center">
          <button onClick={() => setShowResolved(!showResolved)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${showResolved ? 'bg-white text-black' : 'bg-white/5 text-white/50 hover:bg-white/10'}`}>
            {showResolved ? 'Hide resolved' : 'Show resolved'}
          </button>
          {(['24h','7d','30d','all'] as const).map(t => (
            <button key={t} onClick={() => setTimeRange(t)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${timeRange === t ? 'bg-white text-black' : 'bg-white/5 text-white/50 hover:bg-white/10'}`}>{t}</button>
          ))}
          <button onClick={() => queryClient.invalidateQueries({ queryKey: adminKeys.errorMonitoring() })} disabled={loading} className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-white/50">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4">
          <div className="text-red-400 text-2xl font-bold">{groups.filter(g => g.count > 100 && g.status === 'open').length}</div>
          <div className="text-red-400/60 text-xs mt-1">Critical (&gt;100 occurrences)</div>
        </div>
        <div className="bg-orange-500/10 border border-orange-500/20 rounded-xl p-4">
          <div className="text-orange-400 text-2xl font-bold">{groups.filter(g => g.count > 5 && g.count <= 100 && g.status === 'open').length}</div>
          <div className="text-orange-400/60 text-xs mt-1">Warning (5–100)</div>
        </div>
        <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-4">
          <div className="text-green-400 text-2xl font-bold">{resolvedCount}</div>
          <div className="text-green-400/60 text-xs mt-1">Resolved / Ignored</div>
        </div>
      </div>

      {/* Error list */}
      <div className="space-y-2">
        {loading ? (
          <div className="text-center py-12 text-white/30">Loading errors...</div>
        ) : visible.length === 0 ? (
          <div className="text-center py-12 text-green-400/60 text-sm">🎉 All errors resolved!</div>
        ) : visible.map((g, i) => {
          const fix = getFix(g.message);
          const isExpanded = expanded === g.message;
          const isFixing = fixingError === g.message;
          return (
            <div key={i} className={`border rounded-xl overflow-hidden transition-all ${
              g.status === 'resolved' ? 'border-green-500/20 opacity-60' :
              g.status === 'ignored' ? 'border-white/5 opacity-40' : 'border-white/8'
            }`}>
              {/* Row */}
              <div className="flex items-center gap-3 px-4 py-3">
                <button onClick={() => setExpanded(isExpanded ? null : g.message)}
                  className="flex items-center gap-3 flex-1 min-w-0 text-left hover:opacity-80 transition-opacity">
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full border flex-shrink-0 ${severityColor(g.count, g.status)}`}>{g.count}</span>
                  <div className="flex-1 min-w-0">
                    <div className={`text-sm font-mono truncate ${g.status !== 'open' ? 'line-through text-white/30' : 'text-white/80'}`}>{g.message}</div>
                    <div className="text-white/25 text-xs flex items-center gap-3 mt-0.5">
                      <span className="flex items-center gap-1"><Clock className="w-3 h-3" />Last: {timeAgo(g.last_seen)}</span>
                      {g.user_ids.length > 0 && <span className="flex items-center gap-1"><User className="w-3 h-3" />{g.user_ids.length} user{g.user_ids.length > 1 ? 's' : ''}</span>}
                      {fix && g.status === 'open' && <span className="text-blue-400/70 flex items-center gap-1"><Lightbulb className="w-3 h-3" />Fix available</span>}
                      {g.status === 'resolved' && <span className="text-green-400/70 flex items-center gap-1"><CheckCircle className="w-3 h-3" />Resolved</span>}
                      {g.status === 'ignored' && <span className="text-white/30 flex items-center gap-1"><EyeOff className="w-3 h-3" />Ignored</span>}
                    </div>
                  </div>
                  {isExpanded ? <ChevronDown className="w-4 h-4 text-white/20 flex-shrink-0" /> : <ChevronRight className="w-4 h-4 text-white/20 flex-shrink-0" />}
                </button>

                {/* Action buttons */}
                {g.status === 'open' && (
                  <div className="flex gap-1.5 flex-shrink-0">
                    <button onClick={() => { setFixingError(isFixing ? null : g.message); setNoteInput(''); }}
                      className="px-2.5 py-1 rounded-lg bg-blue-500/15 text-blue-400 text-xs hover:bg-blue-500/25 transition-colors flex items-center gap-1">
                      <Wrench className="w-3 h-3" />Fix
                    </button>
                    <button onClick={() => updateResolution(g.message, 'ignored', 'Manually ignored')}
                      className="px-2.5 py-1 rounded-lg bg-white/5 text-white/30 text-xs hover:bg-white/10 transition-colors flex items-center gap-1">
                      <EyeOff className="w-3 h-3" />Ignore
                    </button>
                  </div>
                )}
                {g.status !== 'open' && (
                  <button onClick={() => reopen(g.message)}
                    className="px-2.5 py-1 rounded-lg bg-white/5 text-white/30 text-xs hover:bg-white/10 transition-colors">
                    Reopen
                  </button>
                )}
              </div>

              {/* Fix panel */}
              {isFixing && g.status === 'open' && (
                <div className="border-t border-blue-500/20 bg-blue-500/5 px-4 py-4 space-y-3">
                  {fix ? (
                    <>
                      <div>
                        <div className="text-blue-400 text-xs font-medium mb-1">🔍 Root Cause</div>
                        <p className="text-white/60 text-sm">{fix.cause}</p>
                      </div>
                      <div>
                        <div className="text-blue-400 text-xs font-medium mb-1">🔧 How to Fix</div>
                        <p className="text-white/70 text-sm bg-black/20 rounded-lg p-3 font-mono whitespace-pre-wrap">{fix.fix}</p>
                      </div>
                    </>
                  ) : (
                    <div className="text-white/40 text-sm">No automated fix available for this error. Add your own resolution note below.</div>
                  )}
                  <div>
                    <div className="text-white/40 text-xs mb-1">Resolution note (optional)</div>
                    <textarea value={noteInput} onChange={e => setNoteInput(e.target.value)}
                      placeholder="What did you do to fix this?"
                      rows={2} className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-white/70 text-sm resize-none focus:outline-none focus:border-white/30" />
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => updateResolution(g.message, 'resolved', noteInput || (fix?.fix || 'Manually resolved'))}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 hover:bg-green-500 text-white text-sm rounded-lg transition-colors">
                      <CheckCircle className="w-3.5 h-3.5" />Mark as Resolved
                    </button>
                    <button onClick={() => updateResolution(g.message, 'ignored', noteInput || 'Ignored')}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-white/5 hover:bg-white/10 text-white/50 text-sm rounded-lg transition-colors">
                      <EyeOff className="w-3.5 h-3.5" />Ignore
                    </button>
                    <button onClick={() => setFixingError(null)}
                      className="ml-auto px-3 py-1.5 text-white/30 text-sm hover:text-white/50 transition-colors">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}

              {/* Expanded details */}
              {isExpanded && (
                <div className="border-t border-white/8 px-4 py-3 bg-white/2 space-y-3">
                  <div className="grid grid-cols-2 gap-4 text-xs">
                    <div><span className="text-white/30">First seen:</span> <span className="text-white/50">{new Date(g.first_seen).toLocaleString()}</span></div>
                    <div><span className="text-white/30">Last seen:</span> <span className="text-white/50">{new Date(g.last_seen).toLocaleString()}</span></div>
                    <div><span className="text-white/30">Users affected:</span> <span className="text-white/50">{g.user_ids.length > 0 ? g.user_ids.length : 'anonymous'}</span></div>
                    <div><span className="text-white/30">Occurrences:</span> <span className="text-white/50">{g.count}</span></div>
                  </div>
                  {g.resolution_note && (
                    <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-3">
                      <div className="text-green-400 text-xs font-medium mb-1">Resolution note:</div>
                      <p className="text-white/60 text-xs">{g.resolution_note}</p>
                    </div>
                  )}
                  {g.sample_stack && (
                    <div>
                      <div className="text-white/30 text-xs mb-1">Stack trace:</div>
                      <pre className="text-white/40 text-xs bg-black/30 rounded-lg p-3 overflow-x-auto max-h-32 font-mono whitespace-pre-wrap">{g.sample_stack.slice(0, 600)}</pre>
                    </div>
                  )}
                  {g.urls.length > 0 && (
                    <div>
                      <div className="text-white/30 text-xs mb-1">Affected URLs:</div>
                      {g.urls.slice(0, 3).map((url, j) => (
                        <div key={j} className="text-white/40 text-xs font-mono truncate">{url}</div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
