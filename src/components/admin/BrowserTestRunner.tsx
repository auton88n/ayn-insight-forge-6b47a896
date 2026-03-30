import React, { useState, useCallback, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Progress } from '@/components/ui/progress';
import { 
  Play, 
  CheckCircle2, 
  XCircle, 
  Clock, 
  Monitor,
  Loader2,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Terminal,
  HelpCircle,
  History
} from 'lucide-react';
import { browserTestRunner, BrowserTestResult, TestProgress } from '@/lib/browserTestRunner';
import { userJourneyTests, getTestsByCategory } from '@/lib/userJourneyTests';
import { adminSupabase as supabase } from '@/admin-app/adminSupabase';
import { toast } from 'sonner';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

interface BrowserTestRunnerProps {
  onResultsUpdate?: () => void;
}

interface TestRun {
  id: string;
  created_at: string;
  passed_tests: number;
  failed_tests: number;
  total_tests: number;
  duration_ms: number;
}

const BrowserTestRunnerComponent: React.FC<BrowserTestRunnerProps> = ({ onResultsUpdate }) => {
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState<TestProgress | null>(null);
  const [results, setResults] = useState<BrowserTestResult[]>([]);
  const [expandedResults, setExpandedResults] = useState<Set<string>>(new Set());
  const [showHelp, setShowHelp] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [recentRuns, setRecentRuns] = useState<TestRun[]>([]);
  const [liveLog, setLiveLog] = useState<string[]>([]);

  const loadRecentRuns = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('test_runs')
        .select('id, created_at, passed_tests, failed_tests, total_tests, duration_ms')
        .eq('run_name', 'User Journey Tests')
        .order('created_at', { ascending: false })
        .limit(5);
      
      if (!error && data) {
        setRecentRuns(data as TestRun[]);
      }
    } catch (e) {
      console.error('Failed to load recent runs:', e);
    }
  }, []);

  // Load recent test runs
  useEffect(() => {
    loadRecentRuns();
  }, [loadRecentRuns]);

  const saveResultsToDatabase = useCallback(async (testResults: BrowserTestResult[]) => {
    try {
      const { data: runData, error: runError } = await supabase
        .from('test_runs')
        .insert({
          run_name: 'User Journey Tests',
          total_tests: testResults.length,
          passed_tests: testResults.filter(r => r.status === 'passed').length,
          failed_tests: testResults.filter(r => r.status === 'failed').length,
          skipped_tests: testResults.filter(r => r.status === 'skipped').length,
          duration_ms: testResults.reduce((sum, r) => sum + r.duration_ms, 0),
        })
        .select()
        .single();

      if (runError) throw runError;

      const resultsToInsert = testResults.map(result => ({
        run_id: runData.id,
        test_suite: 'user-journey',
        test_name: result.name,
        status: result.status,
        duration_ms: result.duration_ms,
        error_message: result.error_message || null,
        browser: 'Browser DOM',
      }));

      const { error: resultsError } = await supabase
        .from('test_results')
        .insert(resultsToInsert);

      if (resultsError) throw resultsError;

      toast.success('Results saved');
      onResultsUpdate?.();
      loadRecentRuns();
    } catch (error) {
      console.error('Failed to save results:', error);
      toast.error('Failed to save results');
    }
  }, [onResultsUpdate, loadRecentRuns]);

  const handleProgress = useCallback((prog: TestProgress) => {
    setProgress(prog);
    setLiveLog(prog.stepLogs.slice(-10)); // Keep last 10 log entries
  }, []);

  const runAllUserTests = useCallback(async () => {
    setIsRunning(true);
    setResults([]);
    setLiveLog([]);
    
    // Enable safe mode to prevent navigation
    browserTestRunner.setSafeMode(true);
    browserTestRunner.setProgressCallback(handleProgress);
    
    try {
      const allResults: BrowserTestResult[] = [];
      const totalTests = userJourneyTests.length;
      
      for (let i = 0; i < userJourneyTests.length; i++) {
        const test = userJourneyTests[i];
        browserTestRunner.setTestContext(test.name, i + 1, totalTests);
        
        const result = await browserTestRunner.runTest(test.name, test.run);
        allResults.push(result);
        setResults([...allResults]);
        
        // Small delay between tests
        await browserTestRunner.wait(200);
      }
      
      setProgress(null);
      await saveResultsToDatabase(allResults);
      
      const passed = allResults.filter(r => r.status === 'passed').length;
      const failed = allResults.filter(r => r.status === 'failed').length;
      
      if (failed === 0) {
        toast.success(`All ${passed} tests passed!`);
      } else {
        toast.warning(`${passed} passed, ${failed} failed`);
      }
    } catch (error) {
      console.error('Test run failed:', error);
      toast.error('Test run failed');
    } finally {
      setIsRunning(false);
      setProgress(null);
      browserTestRunner.setProgressCallback(null);
    }
  }, [handleProgress, saveResultsToDatabase]);

  const runCategoryTests = useCallback(async (category: string) => {
    setIsRunning(true);
    setResults([]);
    setLiveLog([]);
    
    browserTestRunner.setSafeMode(true);
    browserTestRunner.setProgressCallback(handleProgress);
    
    try {
      const categories = getTestsByCategory();
      const categoryTests = categories[category] || [];
      const allResults: BrowserTestResult[] = [];
      
      for (let i = 0; i < categoryTests.length; i++) {
        const test = categoryTests[i];
        browserTestRunner.setTestContext(test.name, i + 1, categoryTests.length);
        
        const result = await browserTestRunner.runTest(test.name, test.run);
        allResults.push(result);
        setResults([...allResults]);
        
        await browserTestRunner.wait(200);
      }
      
      await saveResultsToDatabase(allResults);
      
      const passed = allResults.filter(r => r.status === 'passed').length;
      const failed = allResults.filter(r => r.status === 'failed').length;
      
      toast.info(`${category}: ${passed} passed, ${failed} failed`);
    } catch (error) {
      console.error('Category test failed:', error);
      toast.error('Category test failed');
    } finally {
      setIsRunning(false);
      setProgress(null);
      browserTestRunner.setProgressCallback(null);
    }
  }, [handleProgress, saveResultsToDatabase]);

  const toggleExpanded = (testName: string) => {
    setExpandedResults(prev => {
      const next = new Set(prev);
      if (next.has(testName)) {
        next.delete(testName);
      } else {
        next.add(testName);
      }
      return next;
    });
  };

  const categories = getTestsByCategory();
  const passedCount = results.filter(r => r.status === 'passed').length;
  const failedCount = results.filter(r => r.status === 'failed').length;
  const progressPercent = progress ? (progress.testIndex / progress.totalTests) * 100 : 0;

  return (
    <Card className="border-border/50">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Monitor className="h-5 w-5 text-primary" />
            Browser User Journey Tests
          </CardTitle>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowHelp(!showHelp)}
            >
              <HelpCircle className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowHistory(!showHistory)}
            >
              <History className="h-4 w-4" />
            </Button>
            <Button
              onClick={runAllUserTests}
              disabled={isRunning}
              size="sm"
              className="gap-2"
            >
              {isRunning ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Running...
                </>
              ) : (
                <>
                  <Play className="h-4 w-4" />
                  Run All Tests
                </>
              )}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Help Section */}
        <Collapsible open={showHelp} onOpenChange={setShowHelp}>
          <CollapsibleContent>
            <div className="p-4 bg-muted/30 rounded-lg mb-4 text-sm space-y-2">
              <h4 className="font-semibold flex items-center gap-2">
                <HelpCircle className="h-4 w-4" />
                How Browser Tests Work
              </h4>
              <p className="text-muted-foreground">
                These tests simulate real user interactions directly in your browser - clicking buttons, 
                filling forms, and checking if elements appear correctly.
              </p>
              <div className="grid grid-cols-2 gap-2 mt-2">
                <div className="p-2 bg-background rounded">
                  <span className="font-medium">Navigation</span>
                  <p className="text-xs text-muted-foreground">Verifies pages load correctly</p>
                </div>
                <div className="p-2 bg-background rounded">
                  <span className="font-medium">Auth</span>
                  <p className="text-xs text-muted-foreground">Tests login/signup modals</p>
                </div>
                <div className="p-2 bg-background rounded">
                  <span className="font-medium">Chat</span>
                  <p className="text-xs text-muted-foreground">Tests messaging features</p>
                </div>
                <div className="p-2 bg-background rounded">
                  <span className="font-medium">Forms</span>
                  <p className="text-xs text-muted-foreground">Tests inputs and uploads</p>
                </div>
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                ⚠️ Tests run in "safe mode" to avoid navigating away from this panel.
              </p>
            </div>
          </CollapsibleContent>
        </Collapsible>

        {/* History Section */}
        <Collapsible open={showHistory} onOpenChange={setShowHistory}>
          <CollapsibleContent>
            <div className="p-4 bg-muted/30 rounded-lg mb-4">
              <h4 className="font-semibold flex items-center gap-2 mb-3">
                <History className="h-4 w-4" />
                Recent Test Runs
              </h4>
              {recentRuns.length === 0 ? (
                <p className="text-sm text-muted-foreground">No previous runs found</p>
              ) : (
                <div className="space-y-2">
                  {recentRuns.map((run) => (
                    <div key={run.id} className="flex items-center justify-between p-2 bg-background rounded text-sm">
                      <span className="text-muted-foreground">
                        {new Date(run.created_at).toLocaleString()}
                      </span>
                      <div className="flex items-center gap-3">
                        <span className="text-green-500">{run.passed_tests} ✓</span>
                        <span className="text-red-500">{run.failed_tests} ✗</span>
                        <Badge variant="outline">{run.duration_ms}ms</Badge>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </CollapsibleContent>
        </Collapsible>

        {/* Category Quick Run */}
        <div className="flex flex-wrap gap-2">
          {Object.entries(categories).map(([category, tests]) => (
            <Button
              key={category}
              variant="outline"
              size="sm"
              onClick={() => runCategoryTests(category)}
              disabled={isRunning}
              className="gap-1"
            >
              {category}
              <Badge variant="secondary" className="ml-1">
                {tests.length}
              </Badge>
            </Button>
          ))}
        </div>

        {/* Progress Bar & Current Test */}
        {isRunning && progress && (
          <div className="space-y-3 p-4 bg-muted/50 rounded-lg border border-primary/20">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">
                Test {progress.testIndex} of {progress.totalTests}
              </span>
              <span className="text-sm text-muted-foreground">
                {Math.round(progressPercent)}%
              </span>
            </div>
            <Progress value={progressPercent} className="h-2" />
            <div className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
              <span className="text-sm font-medium">{progress.currentTest}</span>
            </div>
            <div className="text-xs text-muted-foreground truncate">
              {progress.currentStep}
            </div>
          </div>
        )}

        {/* Live Log Terminal */}
        {isRunning && liveLog.length > 0 && (
          <div className="bg-zinc-900 rounded-lg p-3 border border-zinc-700">
            <div className="flex items-center gap-2 mb-2 text-zinc-400">
              <Terminal className="h-4 w-4" />
              <span className="text-xs font-mono">Live Log</span>
            </div>
            <ScrollArea className="h-24">
              <div className="font-mono text-xs space-y-1">
                {liveLog.map((log, i) => (
                  <div key={i} className="text-green-400 opacity-80">
                    {log.split('] ')[1] || log}
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>
        )}

        {/* Results Summary */}
        {results.length > 0 && !isRunning && (
          <div className="flex gap-4 p-3 bg-muted/30 rounded-lg">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-green-500" />
              <span className="text-sm font-medium">{passedCount} Passed</span>
            </div>
            <div className="flex items-center gap-2">
              <XCircle className="h-4 w-4 text-red-500" />
              <span className="text-sm font-medium">{failedCount} Failed</span>
            </div>
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm">
                {(results.reduce((sum, r) => sum + r.duration_ms, 0) / 1000).toFixed(1)}s
              </span>
            </div>
          </div>
        )}

        {/* Results List */}
        {results.length > 0 && (
          <ScrollArea className="h-[300px]">
            <div className="space-y-2">
              {results.map((result, index) => (
                <div
                  key={`${result.name}-${index}`}
                  className={`p-3 rounded-lg border ${
                    result.status === 'passed'
                      ? 'border-green-500/20 bg-green-500/5'
                      : result.status === 'failed'
                      ? 'border-red-500/20 bg-red-500/5'
                      : 'border-muted'
                  }`}
                >
                  <div 
                    className="flex items-center justify-between cursor-pointer"
                    onClick={() => toggleExpanded(result.name)}
                  >
                    <div className="flex items-center gap-2">
                      {result.status === 'passed' ? (
                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                      ) : result.status === 'failed' ? (
                        <XCircle className="h-4 w-4 text-red-500" />
                      ) : (
                        <RefreshCw className="h-4 w-4 text-muted-foreground" />
                      )}
                      <span className="font-medium text-sm">{result.name}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-xs">
                        {result.duration_ms}ms
                      </Badge>
                      {expandedResults.has(result.name) ? (
                        <ChevronUp className="h-4 w-4" />
                      ) : (
                        <ChevronDown className="h-4 w-4" />
                      )}
                    </div>
                  </div>
                  
                  {/* Expanded Details */}
                  {expandedResults.has(result.name) && (
                    <div className="mt-2 pt-2 border-t border-border/50">
                      {result.error_message && (
                        <div className="text-sm text-red-500 mb-2">
                          Error: {result.error_message}
                        </div>
                      )}
                      {result.step_details && result.step_details.length > 0 && (
                        <div className="space-y-1">
                          <span className="text-xs text-muted-foreground">Steps:</span>
                          <div className="text-xs font-mono bg-muted/50 p-2 rounded max-h-32 overflow-auto">
                            {result.step_details.map((step, i) => (
                              <div key={i} className="text-muted-foreground">
                                {step.split('] ')[1] || step}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </ScrollArea>
        )}

        {/* Empty State */}
        {results.length === 0 && !isRunning && (
          <div className="text-center py-8 text-muted-foreground">
            <Monitor className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p className="text-sm">Click "Run All Tests" to start browser-based testing</p>
            <p className="text-xs mt-1">Tests simulate real user interactions safely</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default BrowserTestRunnerComponent;
