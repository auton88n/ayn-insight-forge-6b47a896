import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Progress } from '@/components/ui/progress';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { 
  CheckCircle, 
  XCircle, 
  AlertTriangle,
  Search,
  ChevronDown,
  ChevronRight,
  Copy,
  Download,
  Server,
  Clock,
  Zap,
  Shield,
  Bug
} from 'lucide-react';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';

interface EndpointResult {
  endpoint: string;
  tests: {
    name: string;
    category: 'valid' | 'edge_case' | 'type_error' | 'security' | 'performance';
    status: 'passed' | 'failed' | 'slow';
    duration_ms: number;
    error?: string;
  }[];
  passRate: number;
  avgDuration: number;
}

interface ComprehensiveTestResultsProps {
  results?: EndpointResult[];
  summary?: {
    passRate: string;
    totalTests: number;
    passed: number;
    failed: number;
    avgDuration: number;
  };
  isLoading?: boolean;
}

const categoryColors: Record<string, string> = {
  valid: 'bg-green-500/10 text-green-600 border-green-500/20',
  edge_case: 'bg-yellow-500/10 text-yellow-600 border-yellow-500/20',
  type_error: 'bg-orange-500/10 text-orange-600 border-orange-500/20',
  security: 'bg-red-500/10 text-red-600 border-red-500/20',
  performance: 'bg-blue-500/10 text-blue-600 border-blue-500/20',
};

const categoryIcons: Record<string, React.ReactNode> = {
  valid: <CheckCircle className="h-3 w-3" />,
  edge_case: <AlertTriangle className="h-3 w-3" />,
  type_error: <Bug className="h-3 w-3" />,
  security: <Shield className="h-3 w-3" />,
  performance: <Zap className="h-3 w-3" />,
};

export const ComprehensiveTestResults: React.FC<ComprehensiveTestResultsProps> = ({
  results = [],
  summary,
  isLoading = false,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedEndpoints, setExpandedEndpoints] = useState<Set<string>>(new Set());
  const [filterCategory, setFilterCategory] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<string | null>(null);

  const filteredResults = results.filter(r => {
    if (searchQuery && !r.endpoint.toLowerCase().includes(searchQuery.toLowerCase())) {
      return false;
    }
    return true;
  }).map(r => ({
    ...r,
    tests: r.tests.filter(t => {
      if (filterCategory && t.category !== filterCategory) return false;
      if (filterStatus && t.status !== filterStatus) return false;
      return true;
    })
  })).filter(r => r.tests.length > 0);

  const toggleEndpoint = (endpoint: string) => {
    const newExpanded = new Set(expandedEndpoints);
    if (newExpanded.has(endpoint)) {
      newExpanded.delete(endpoint);
    } else {
      newExpanded.add(endpoint);
    }
    setExpandedEndpoints(newExpanded);
  };

  const expandAll = () => {
    setExpandedEndpoints(new Set(results.map(r => r.endpoint)));
  };

  const collapseAll = () => {
    setExpandedEndpoints(new Set());
  };

  const copyAsMarkdown = () => {
    const md = results.map(r => {
      const header = `## ${r.endpoint}\n- Pass Rate: ${r.passRate.toFixed(0)}%\n- Avg Duration: ${r.avgDuration.toFixed(0)}ms\n`;
      const tests = r.tests.map(t => 
        `  - [${t.status === 'passed' ? '✓' : '✗'}] ${t.name} (${t.category}) - ${t.duration_ms}ms${t.error ? `\n    Error: ${t.error}` : ''}`
      ).join('\n');
      return header + tests;
    }).join('\n\n');
    
    navigator.clipboard.writeText(md);
    toast.success('Copied to clipboard');
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'passed': return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'failed': return <XCircle className="h-4 w-4 text-red-500" />;
      case 'slow': return <Clock className="h-4 w-4 text-yellow-500" />;
      default: return <AlertTriangle className="h-4 w-4 text-muted-foreground" />;
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <div className="animate-pulse space-y-4">
            <div className="h-4 bg-muted rounded w-3/4 mx-auto" />
            <div className="h-4 bg-muted rounded w-1/2 mx-auto" />
            <div className="h-4 bg-muted rounded w-2/3 mx-auto" />
          </div>
          <p className="text-sm text-muted-foreground mt-4">Running comprehensive tests...</p>
        </CardContent>
      </Card>
    );
  }

  if (results.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <Server className="h-12 w-12 text-muted-foreground mx-auto mb-4 opacity-50" />
          <p className="text-muted-foreground">No comprehensive test results yet</p>
          <p className="text-xs text-muted-foreground mt-1">Run "Full System Test" to see endpoint-by-endpoint breakdown</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Server className="h-5 w-5 text-purple-500" />
            Comprehensive Test Results
          </CardTitle>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={copyAsMarkdown}>
              <Copy className="h-4 w-4 mr-1" /> Copy
            </Button>
          </div>
        </div>
        
        {/* Summary Bar */}
        {summary && (
          <div className="grid grid-cols-4 gap-3 mt-3">
            <div className="bg-muted/50 rounded-lg p-2 text-center">
              <p className="text-2xl font-bold text-green-500">{summary.passRate}</p>
              <p className="text-xs text-muted-foreground">Pass Rate</p>
            </div>
            <div className="bg-muted/50 rounded-lg p-2 text-center">
              <p className="text-2xl font-bold">{summary.totalTests}</p>
              <p className="text-xs text-muted-foreground">Total Tests</p>
            </div>
            <div className="bg-muted/50 rounded-lg p-2 text-center">
              <p className="text-2xl font-bold text-red-500">{summary.failed}</p>
              <p className="text-xs text-muted-foreground">Failed</p>
            </div>
            <div className="bg-muted/50 rounded-lg p-2 text-center">
              <p className="text-2xl font-bold text-blue-500">{summary.avgDuration}ms</p>
              <p className="text-xs text-muted-foreground">Avg Time</p>
            </div>
          </div>
        )}
      </CardHeader>
      
      <CardContent>
        {/* Filters */}
        <div className="flex flex-wrap gap-2 mb-4">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search endpoints..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 h-8"
            />
          </div>
          
          <div className="flex gap-1">
            {['valid', 'edge_case', 'security', 'performance'].map(cat => (
              <Button
                key={cat}
                variant={filterCategory === cat ? 'default' : 'outline'}
                size="sm"
                className="h-8 text-xs"
                onClick={() => setFilterCategory(filterCategory === cat ? null : cat)}
              >
                {categoryIcons[cat]}
                <span className="ml-1 hidden sm:inline">{cat.replace('_', ' ')}</span>
              </Button>
            ))}
          </div>
          
          <div className="flex gap-1">
            <Button variant="ghost" size="sm" onClick={expandAll} className="h-8 text-xs">
              Expand All
            </Button>
            <Button variant="ghost" size="sm" onClick={collapseAll} className="h-8 text-xs">
              Collapse
            </Button>
          </div>
        </div>

        {/* Endpoint List */}
        <ScrollArea className="h-[500px]">
          <div className="space-y-2">
            <AnimatePresence>
              {filteredResults.map((endpoint, idx) => (
                <motion.div
                  key={endpoint.endpoint}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ delay: idx * 0.02 }}
                >
                  <Collapsible 
                    open={expandedEndpoints.has(endpoint.endpoint)}
                    onOpenChange={() => toggleEndpoint(endpoint.endpoint)}
                  >
                    <CollapsibleTrigger asChild>
                      <div className={`p-3 rounded-lg border cursor-pointer hover:bg-muted/50 transition-colors ${
                        endpoint.passRate === 100 ? 'border-green-500/30' : 
                        endpoint.passRate >= 80 ? 'border-yellow-500/30' : 'border-red-500/30'
                      }`}>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            {expandedEndpoints.has(endpoint.endpoint) ? (
                              <ChevronDown className="h-4 w-4 text-muted-foreground" />
                            ) : (
                              <ChevronRight className="h-4 w-4 text-muted-foreground" />
                            )}
                            <code className="text-sm font-mono bg-muted px-2 py-0.5 rounded">
                              {endpoint.endpoint}
                            </code>
                            <Badge variant="outline" className="text-xs">
                              {endpoint.tests.length} tests
                            </Badge>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="text-xs text-muted-foreground">
                              {endpoint.avgDuration.toFixed(0)}ms avg
                            </span>
                            <div className="flex items-center gap-1">
                              <Progress 
                                value={endpoint.passRate} 
                                className="w-16 h-2"
                              />
                              <span className={`text-xs font-medium ${
                                endpoint.passRate === 100 ? 'text-green-500' :
                                endpoint.passRate >= 80 ? 'text-yellow-500' : 'text-red-500'
                              }`}>
                                {endpoint.passRate.toFixed(0)}%
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </CollapsibleTrigger>
                    
                    <CollapsibleContent>
                      <div className="ml-6 mt-2 space-y-1 border-l-2 border-muted pl-4">
                        {endpoint.tests.map((test, testIdx) => (
                          <div 
                            key={testIdx}
                            className="flex items-center justify-between p-2 rounded hover:bg-muted/30 text-sm"
                          >
                            <div className="flex items-center gap-2">
                              {getStatusIcon(test.status)}
                              <span className="font-medium">{test.name}</span>
                              <Badge variant="outline" className={`text-xs ${categoryColors[test.category]}`}>
                                {categoryIcons[test.category]}
                                <span className="ml-1">{test.category.replace('_', ' ')}</span>
                              </Badge>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-muted-foreground">
                                {test.duration_ms}ms
                              </span>
                              {test.error && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-6 text-xs text-red-500"
                                  onClick={() => {
                                    navigator.clipboard.writeText(test.error || '');
                                    toast.success('Error copied');
                                  }}
                                >
                                  <Copy className="h-3 w-3 mr-1" /> Error
                                </Button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
};

export default ComprehensiveTestResults;
