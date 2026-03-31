import React, { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { 
  CheckCircle2, 
  XCircle, 
  Shield, 
  Zap, 
  Calculator,
  Globe,
  Clock, 
  Timer, 
  ChevronDown, 
  ChevronUp,
  TestTube2
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { formatDistanceToNow } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';

interface TestResult {
  id: string;
  test_suite: string;
  test_name: string;
  status: string;
  duration_ms: number | null;
  error_message?: string | null;
  browser?: string | null;
  created_at: string;
}

interface TestRun {
  id: string;
  run_name: string | null;
  total_tests: number | null;
  passed_tests: number | null;
  failed_tests: number | null;
  created_at: string;
}

interface TestDetail {
  name: string;
  status: 'passed' | 'failed' | 'skipped';
  duration: number | null;
  error: string | null;
  browser: string | null;
  failedStep?: string | null;
  suggestion?: string | null;
}

// Parse structured error message into parts
const parseErrorMessage = (error: string | null): { message: string; step: string | null; suggestion: string | null } => {
  if (!error) return { message: '', step: null, suggestion: null };
  
  const parts = error.split(' | ');
  return {
    message: parts[0] || error,
    step: parts[1]?.replace('Step ', '') || null,
    suggestion: parts[2]?.replace('💡 ', '') || null,
  };
};

interface StatusCard {
  id: string;
  title: string;
  icon: React.ReactNode;
  status: 'good' | 'warning' | 'error';
  summary: string;
  passRate: number;
  totalDuration: number;
  tests: TestDetail[];
  lastRun: string;
}

interface SimpleStatusCardsProps {
  testResults?: TestResult[];
  testRuns?: TestRun[];
}

const getSuiteIcon = (suite: string) => {
  const lowerSuite = suite.toLowerCase();
  if (lowerSuite.includes('security') || lowerSuite.includes('auth')) {
    return <Shield className="h-5 w-5" />;
  }
  if (lowerSuite.includes('performance') || lowerSuite.includes('stress')) {
    return <Zap className="h-5 w-5" />;
  }
  if (lowerSuite.includes('engineering') || lowerSuite.includes('calculator')) {
    return <Calculator className="h-5 w-5" />;
  }
  if (lowerSuite.includes('i18n') || lowerSuite.includes('language')) {
    return <Globe className="h-5 w-5" />;
  }
  return <TestTube2 className="h-5 w-5" />;
};

const formatDuration = (ms: number | null): string => {
  if (ms === null || ms === 0) return '-';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
};

const SimpleStatusCards = ({ testResults = [], testRuns = [] }: SimpleStatusCardsProps) => {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  
  // Group results by test suite
  const suiteGroups = testResults.reduce((acc, result) => {
    const suite = result.test_suite || 'unknown';
    if (!acc[suite]) {
      acc[suite] = [];
    }
    acc[suite].push(result);
    return acc;
  }, {} as Record<string, TestResult[]>);

  // Create status cards from grouped results
  const cards: StatusCard[] = Object.entries(suiteGroups).map(([suite, results]) => {
    const passed = results.filter(r => r.status === 'passed').length;
    const failed = results.filter(r => r.status === 'failed').length;
    const total = results.length;
    const passRate = total > 0 ? Math.round((passed / total) * 100) : 0;
    
    let status: 'good' | 'warning' | 'error' = 'good';
    if (failed > 0) status = 'error';
    else if (passed < total) status = 'warning';
    
    const sortedResults = [...results].sort((a, b) => 
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
    
    const latestResult = sortedResults[0];
    const lastRun = latestResult 
      ? formatDistanceToNow(new Date(latestResult.created_at), { addSuffix: true })
      : 'never';

    const totalDuration = results.reduce((sum, r) => sum + (r.duration_ms || 0), 0);

    const tests: TestDetail[] = sortedResults.map(r => ({
      name: r.test_name,
      status: r.status as 'passed' | 'failed' | 'skipped',
      duration: r.duration_ms,
      error: r.error_message || null,
      browser: r.browser || null
    }));

    return {
      id: suite,
      title: suite.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
      icon: getSuiteIcon(suite),
      status,
      summary: `${passed}/${total} tests passing`,
      passRate,
      totalDuration,
      tests,
      lastRun
    };
  });

  // Add empty state card if no data
  if (cards.length === 0) {
    cards.push({
      id: 'no-data',
      title: 'No Test Data',
      icon: <Clock className="h-5 w-5" />,
      status: 'warning',
      summary: 'Run tests to see results',
      passRate: 0,
      totalDuration: 0,
      tests: [],
      lastRun: 'never'
    });
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'good':
        return {
          bg: 'bg-emerald-500/10 border-emerald-500/20',
          text: 'text-emerald-400',
          badge: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
        };
      case 'warning':
        return {
          bg: 'bg-amber-500/10 border-amber-500/20',
          text: 'text-amber-400',
          badge: 'bg-amber-500/20 text-amber-400 border-amber-500/30'
        };
      case 'error':
        return {
          bg: 'bg-red-500/10 border-red-500/20',
          text: 'text-red-400',
          badge: 'bg-red-500/20 text-red-400 border-red-500/30'
        };
      default:
        return {
          bg: 'bg-muted/50 border-border',
          text: 'text-muted-foreground',
          badge: 'bg-muted text-muted-foreground border-border'
        };
    }
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {cards.map((card) => {
        const colors = getStatusColor(card.status);
        const isExpanded = expandedId === card.id;
        const failedTests = card.tests.filter(t => t.status === 'failed');
        
        return (
          <Card 
            key={card.id}
            className={`${colors.bg} border cursor-pointer transition-all hover:shadow-lg`}
            onClick={() => setExpandedId(isExpanded ? null : card.id)}
          >
            <CardContent className="p-4">
              {/* Header */}
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="text-primary">{card.icon}</span>
                  <span className="font-semibold">{card.title}</span>
                </div>
                <Badge className={`${colors.badge} border text-xs`}>
                  {card.passRate}%
                </Badge>
              </div>

              {/* Summary Stats */}
              <div className="flex items-center justify-between text-sm text-muted-foreground mb-2">
                <span>{card.summary}</span>
                <div className="flex items-center gap-1">
                  <Timer className="w-3.5 h-3.5" />
                  <span>{formatDuration(card.totalDuration)}</span>
                </div>
              </div>

              {/* Last Run */}
              <div className="flex items-center gap-1 text-xs text-muted-foreground/70">
                <Clock className="w-3 h-3" />
                <span>Last run {card.lastRun}</span>
              </div>

              {/* Failed Tests Preview */}
              {failedTests.length > 0 && !isExpanded && (
                <div className="mt-3 pt-2 border-t border-border/30">
                  <div className="flex items-start gap-1.5 text-xs text-red-400">
                    <XCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                    <div>
                      <span className="font-medium">{failedTests.length} failed: </span>
                      <span className="text-red-400/80">
                        {failedTests[0].name}
                        {failedTests.length > 1 && ` +${failedTests.length - 1} more`}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* Expand Indicator */}
              <div className="flex justify-center mt-2">
                {isExpanded ? (
                  <ChevronUp className="w-4 h-4 text-muted-foreground/50" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-muted-foreground/50" />
                )}
              </div>
              
              {/* Expanded Details */}
              <AnimatePresence>
                {isExpanded && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden"
                  >
                    <div className="mt-3 pt-3 border-t border-border/50">
                      <ScrollArea className="max-h-64">
                        <div className="space-y-2 pr-2">
                          {card.tests.map((test, i) => {
                            const parsedError = parseErrorMessage(test.error);
                            
                            return (
                              <div 
                                key={i} 
                                className={`p-3 rounded-md text-sm ${
                                  test.status === 'failed' 
                                    ? 'bg-red-500/10 border border-red-500/20' 
                                    : 'bg-background/50 border border-border/30'
                                }`}
                              >
                                {/* Test Name & Meta */}
                                <div className="flex items-start justify-between gap-2">
                                  <div className="flex items-center gap-2 flex-1 min-w-0">
                                    {test.status === 'passed' ? (
                                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                                    ) : (
                                      <XCircle className="w-4 h-4 text-red-400 shrink-0" />
                                    )}
                                    <span className="font-medium">{test.name}</span>
                                  </div>
                                  <div className="flex items-center gap-2 shrink-0 text-xs text-muted-foreground">
                                    {test.browser && (
                                      <span className="bg-muted/50 px-1.5 py-0.5 rounded text-[11px]">
                                        {test.browser}
                                      </span>
                                    )}
                                    <span className="font-mono">{formatDuration(test.duration)}</span>
                                  </div>
                                </div>
                                
                                {/* Error Details for Failed Tests */}
                                {test.status === 'failed' && parsedError.message && (
                                  <div className="mt-3 ml-6 space-y-2 text-xs">
                                    {/* Error Message */}
                                    <div className="bg-red-500/5 border border-red-500/20 rounded-md p-2">
                                      <div className="flex items-start gap-2">
                                        <XCircle className="w-3.5 h-3.5 text-red-400 shrink-0 mt-0.5" />
                                        <span className="text-red-300 leading-relaxed">{parsedError.message}</span>
                                      </div>
                                    </div>
                                    
                                    {/* Failed Step */}
                                    {parsedError.step && (
                                      <div className="flex items-center gap-2 text-amber-400/80">
                                        <span className="text-[10px] bg-amber-500/20 px-1.5 py-0.5 rounded">📍 FAILED AT</span>
                                        <span>{parsedError.step}</span>
                                      </div>
                                    )}
                                    
                                    {/* Suggestion */}
                                    {parsedError.suggestion && (
                                      <div className="bg-blue-500/10 border border-blue-500/20 rounded-md p-2">
                                        <div className="flex items-start gap-2">
                                          <span className="text-blue-400">💡</span>
                                          <span className="text-blue-300/90">{parsedError.suggestion}</span>
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </ScrollArea>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
};

export default SimpleStatusCards;