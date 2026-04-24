import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { 
  Calculator, CheckCircle, XCircle, AlertTriangle, Play, Loader2, Clock, 
  ChevronDown, ChevronRight, FileText, Beaker, Target, Code, Car, Mountain
} from 'lucide-react';
import { adminSupabase as supabase } from '@/admin-app/adminSupabase';
import { toast } from 'sonner';

interface OutputCheck {
  field: string;
  expected: { min: number; max: number; unit: string };
  actual: number | undefined;
  passed: boolean;
}

interface TestCaseResult {
  testName: string;
  inputs: Record<string, unknown>;
  expectedOutputs: Record<string, { min: number; max: number; unit: string }>;
  actualOutputs: Record<string, unknown>;
  passed: boolean;
  outputChecks: OutputCheck[];
}

interface ValidationCheck {
  name: string;
  passed: boolean;
  expected: string;
  actual: string;
  standard: string;
  severity: 'critical' | 'warning' | 'info';
}

interface ValidationResult {
  calculator: string;
  overallAccuracy: number;
  grade: string;
  standardsCompliance: { ACI_318: boolean; CSA_A23_3: boolean; EUROCODE_2: boolean };
  checks: ValidationCheck[];
  testResults: TestCaseResult[];
  issues: string[];
  suggestions: string[];
}

interface StoredResults {
  results: ValidationResult[];
  summary: { overallAccuracy: number; overallGrade: string };
  timestamp: number;
}

const STORAGE_KEY = 'engineering_benchmark_results';

const EngineeringBenchmark: React.FC = () => {
  const [isRunning, setIsRunning] = useState(false);
  const [results, setResults] = useState<ValidationResult[]>([]);
  const [summary, setSummary] = useState<{ overallAccuracy: number; overallGrade: string } | null>(null);
  const [lastRun, setLastRun] = useState<Date | null>(null);
  const [expandedCalculators, setExpandedCalculators] = useState<Set<string>>(new Set());
  const [expandedTests, setExpandedTests] = useState<Set<string>>(new Set());

  // Load persisted results on mount
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        const parsed: StoredResults = JSON.parse(stored);
        setResults(parsed.results);
        setSummary(parsed.summary);
        setLastRun(new Date(parsed.timestamp));
      } catch (e) {
        console.error('Failed to parse stored results:', e);
      }
    }
  }, []);

  const runValidation = async () => {
    setIsRunning(true);
    try {
      const { data, error } = await supabase.functions.invoke('engineering-ai-validator', {
        body: { calculators: ['beam', 'column', 'foundation', 'slab', 'retaining-wall', 'parking', 'grading'] }
      });
      
      if (error) throw error;
      
      const newResults = data.results || [];
      const newSummary = data.summary;
      const now = new Date();
      
      setResults(newResults);
      setSummary(newSummary);
      setLastRun(now);
      
      // Auto-expand all calculators after run
      setExpandedCalculators(new Set(newResults.map((r: ValidationResult) => r.calculator)));
      
      // Persist to localStorage
      const toStore: StoredResults = {
        results: newResults,
        summary: newSummary,
        timestamp: now.getTime()
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(toStore));
      
      toast.success(`Validation complete: ${newSummary?.overallGrade} grade (${newSummary?.overallAccuracy}%)`);
    } catch (err) {
      toast.error('Validation failed');
      console.error(err);
    } finally {
      setIsRunning(false);
    }
  };
  
  const formatTimeAgo = (date: Date) => {
    const mins = Math.floor((Date.now() - date.getTime()) / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  };

  const getGradeColor = (grade: string) => {
    if (grade.startsWith('A')) return 'text-green-500';
    if (grade.startsWith('B')) return 'text-blue-500';
    if (grade.startsWith('C')) return 'text-yellow-500';
    return 'text-red-500';
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return 'text-red-500 bg-red-500/10';
      case 'warning': return 'text-yellow-500 bg-yellow-500/10';
      default: return 'text-green-500 bg-green-500/10';
    }
  };

  const toggleCalculator = (calculator: string) => {
    const newSet = new Set(expandedCalculators);
    if (newSet.has(calculator)) {
      newSet.delete(calculator);
    } else {
      newSet.add(calculator);
    }
    setExpandedCalculators(newSet);
  };

  const toggleTest = (testKey: string) => {
    const newSet = new Set(expandedTests);
    if (newSet.has(testKey)) {
      newSet.delete(testKey);
    } else {
      newSet.add(testKey);
    }
    setExpandedTests(newSet);
  };

  const formatValue = (value: unknown): string => {
    if (value === undefined || value === null) return 'N/A';
    if (typeof value === 'number') return value.toFixed(2);
    if (typeof value === 'boolean') return value ? 'true' : 'false';
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between flex-wrap gap-2">
        <CardTitle className="flex items-center gap-2">
          <Calculator className="h-5 w-5" />
          Engineering Accuracy Benchmark
        </CardTitle>
        <div className="flex items-center gap-2">
          {lastRun && (
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {formatTimeAgo(lastRun)}
            </span>
          )}
          <Button onClick={runValidation} disabled={isRunning} size="sm">
            {isRunning ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Play className="h-4 w-4 mr-2" />}
            {isRunning ? 'Validating...' : 'Run Validation'}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {summary && (
          <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
            <div>
              <p className="text-sm text-muted-foreground">Overall Accuracy</p>
              <p className="text-2xl font-bold">{summary.overallAccuracy}%</p>
            </div>
            <div className={`text-4xl font-bold ${getGradeColor(summary.overallGrade)}`}>
              {summary.overallGrade}
            </div>
          </div>
        )}

        <div className="space-y-3">
            {results.map((result) => (
              <Collapsible 
                key={result.calculator} 
                open={expandedCalculators.has(result.calculator)}
                onOpenChange={() => toggleCalculator(result.calculator)}
              >
                <div className="border rounded-lg overflow-hidden">
                  <CollapsibleTrigger className="w-full">
                    <div className="flex items-center justify-between p-3 hover:bg-muted/50 transition-colors">
                      <div className="flex items-center gap-2">
                        {expandedCalculators.has(result.calculator) ? (
                          <ChevronDown className="h-4 w-4" />
                        ) : (
                          <ChevronRight className="h-4 w-4" />
                        )}
                        {result.calculator === 'parking' && <Car className="h-4 w-4 text-blue-500" />}
                        {result.calculator === 'grading' && <Mountain className="h-4 w-4 text-amber-500" />}
                        {!['parking', 'grading'].includes(result.calculator) && <Calculator className="h-4 w-4 text-muted-foreground" />}
                        <span className="font-medium capitalize">{result.calculator.replace('-', ' ')} {result.calculator === 'parking' ? 'Designer' : result.calculator === 'grading' ? 'Designer' : 'Calculator'}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="flex gap-1 flex-wrap">
                          {result.calculator === 'parking' ? (
                            <>
                              <Badge variant="outline" className={`text-xs ${result.standardsCompliance.ACI_318 ? 'text-green-600' : 'text-red-600'}`}>
                                {result.standardsCompliance.ACI_318 ? <CheckCircle className="h-3 w-3 mr-1" /> : <XCircle className="h-3 w-3 mr-1" />}ADA
                              </Badge>
                              <Badge variant="outline" className="text-xs text-blue-600">ITE</Badge>
                            </>
                          ) : result.calculator === 'grading' ? (
                            <>
                              <Badge variant="outline" className={`text-xs ${result.standardsCompliance.ACI_318 ? 'text-green-600' : 'text-red-600'}`}>
                                {result.standardsCompliance.ACI_318 ? <CheckCircle className="h-3 w-3 mr-1" /> : <XCircle className="h-3 w-3 mr-1" />}ASCE
                              </Badge>
                              <Badge variant="outline" className="text-xs text-blue-600">Drainage</Badge>
                            </>
                          ) : (
                            result.standardsCompliance.ACI_318 ? (
                              <Badge variant="outline" className="text-green-600 text-xs"><CheckCircle className="h-3 w-3 mr-1" />ACI</Badge>
                            ) : (
                              <Badge variant="destructive" className="text-xs"><XCircle className="h-3 w-3 mr-1" />ACI</Badge>
                            )
                          )}
                        </div>
                        <span className={`font-bold ${getGradeColor(result.grade)}`}>{result.grade}</span>
                        <span className="text-sm text-muted-foreground">{result.overallAccuracy}%</span>
                      </div>
                    </div>
                    <Progress value={result.overallAccuracy} className="h-1" />
                  </CollapsibleTrigger>
                  
                  <CollapsibleContent>
                    <div className="p-3 border-t space-y-4">
                      {/* Test Cases Section */}
                      {result.testResults && result.testResults.length > 0 && (
                        <div className="space-y-2">
                          <h4 className="text-sm font-semibold flex items-center gap-2">
                            <Beaker className="h-4 w-4" />
                            Test Cases ({result.testResults.filter(t => t.passed).length}/{result.testResults.length} passed)
                          </h4>
                          {result.testResults.map((test, idx) => {
                            const testKey = `${result.calculator}-${idx}`;
                            return (
                              <Collapsible 
                                key={testKey}
                                open={expandedTests.has(testKey)}
                                onOpenChange={() => toggleTest(testKey)}
                              >
                                <div className="border rounded-md overflow-hidden bg-background">
                                  <CollapsibleTrigger className="w-full">
                                    <div className="flex items-center justify-between p-2 hover:bg-muted/30 transition-colors">
                                      <div className="flex items-center gap-2">
                                        {expandedTests.has(testKey) ? (
                                          <ChevronDown className="h-3 w-3" />
                                        ) : (
                                          <ChevronRight className="h-3 w-3" />
                                        )}
                                        {test.passed ? (
                                          <CheckCircle className="h-4 w-4 text-green-500" />
                                        ) : (
                                          <XCircle className="h-4 w-4 text-red-500" />
                                        )}
                                        <span className="text-sm font-medium">{test.testName}</span>
                                      </div>
                                      <span className="text-xs text-muted-foreground">
                                        {test.outputChecks.filter(c => c.passed).length}/{test.outputChecks.length} outputs passed
                                      </span>
                                    </div>
                                  </CollapsibleTrigger>
                                  
                                  <CollapsibleContent>
                                    <div className="p-3 border-t space-y-3 bg-muted/20">
                                      {/* Inputs */}
                                      <div>
                                        <h5 className="text-xs font-semibold text-muted-foreground mb-1 flex items-center gap-1">
                                          <Code className="h-3 w-3" /> Inputs
                                        </h5>
                                        <div className="grid grid-cols-2 md:grid-cols-4 gap-1 text-xs">
                                          {Object.entries(test.inputs).map(([key, value]) => (
                                            <div key={key} className="bg-background rounded px-2 py-1">
                                              <span className="text-muted-foreground">{key}:</span>{' '}
                                              <span className="font-mono">{formatValue(value)}</span>
                                            </div>
                                          ))}
                                        </div>
                                      </div>
                                      
                                      {/* Output Checks */}
                                      <div>
                                        <h5 className="text-xs font-semibold text-muted-foreground mb-1 flex items-center gap-1">
                                          <Target className="h-3 w-3" /> Output Validation
                                        </h5>
                                        <div className="space-y-1">
                                          {test.outputChecks.map((check, cIdx) => (
                                            <div 
                                              key={cIdx} 
                                              className={`flex items-center justify-between text-xs rounded px-2 py-1.5 ${
                                                check.passed ? 'bg-green-500/10' : 'bg-red-500/10'
                                              }`}
                                            >
                                              <div className="flex items-center gap-2">
                                                {check.passed ? (
                                                  <CheckCircle className="h-3 w-3 text-green-500" />
                                                ) : (
                                                  <XCircle className="h-3 w-3 text-red-500" />
                                                )}
                                                <span className="font-mono">{check.field}</span>
                                              </div>
                                              <div className="flex items-center gap-4">
                                                <span className="text-muted-foreground">
                                                  Expected: <span className="font-mono">{check.expected.min} - {check.expected.max}{check.expected.unit}</span>
                                                </span>
                                                <span className={check.passed ? 'text-green-600' : 'text-red-600'}>
                                                  Actual: <span className="font-mono font-semibold">
                                                    {check.actual !== undefined ? `${check.actual}${check.expected.unit}` : 'N/A'}
                                                  </span>
                                                </span>
                                              </div>
                                            </div>
                                          ))}
                                        </div>
                                      </div>
                                    </div>
                                  </CollapsibleContent>
                                </div>
                              </Collapsible>
                            );
                          })}
                        </div>
                      )}
                      
                      {/* Compliance Checks Section */}
                      {result.checks && result.checks.length > 0 && (
                        <div className="space-y-2">
                          <h4 className="text-sm font-semibold flex items-center gap-2">
                            <FileText className="h-4 w-4" />
                            Code Compliance Checks ({result.checks.filter(c => c.passed).length}/{result.checks.length})
                          </h4>
                          <div className="space-y-1">
                            {result.checks.map((check, idx) => (
                              <div 
                                key={idx} 
                                className={`text-xs rounded px-2 py-1.5 ${getSeverityColor(check.passed ? 'info' : check.severity)}`}
                              >
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-2">
                                    {check.passed ? (
                                      <CheckCircle className="h-3 w-3" />
                                    ) : check.severity === 'critical' ? (
                                      <XCircle className="h-3 w-3" />
                                    ) : (
                                      <AlertTriangle className="h-3 w-3" />
                                    )}
                                    <span className="font-medium">{check.name}</span>
                                    <Badge variant="outline" className="text-[10px] h-4">{check.standard}</Badge>
                                  </div>
                                </div>
                                <div className="mt-1 pl-5 flex gap-4 text-muted-foreground">
                                  <span>Expected: <span className="font-mono">{check.expected}</span></span>
                                  <span>Actual: <span className={`font-mono ${check.passed ? 'text-green-600' : 'text-red-600'}`}>{check.actual}</span></span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      
                      {/* Issues */}
                      {result.issues.length > 0 && (
                        <div className="space-y-1">
                          <h4 className="text-sm font-semibold text-red-500 flex items-center gap-2">
                            <AlertTriangle className="h-4 w-4" />
                            Issues ({result.issues.length})
                          </h4>
                          <ul className="text-xs space-y-1">
                            {result.issues.map((issue, idx) => (
                              <li key={idx} className="text-muted-foreground pl-4 border-l-2 border-red-500/30">
                                {issue}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      
                      {/* Suggestions */}
                      {result.suggestions.length > 0 && (
                        <div className="space-y-1">
                          <h4 className="text-sm font-semibold text-blue-500">Suggestions</h4>
                          <ul className="text-xs space-y-1">
                            {result.suggestions.map((suggestion, idx) => (
                              <li key={idx} className="text-muted-foreground pl-4 border-l-2 border-blue-500/30">
                                {suggestion}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  </CollapsibleContent>
                </div>
              </Collapsible>
            ))}
        </div>

        {results.length === 0 && !isRunning && (
          <p className="text-center text-muted-foreground py-8">
            Click "Run Validation" to benchmark all 7 engineering tools (Beam, Column, Foundation, Slab, Retaining Wall, Parking Designer, Grading Designer) against ACI 318, ADA, ASCE and Eurocode 2 standards
          </p>
        )}
      </CardContent>
    </Card>
  );
};

export default EngineeringBenchmark;
