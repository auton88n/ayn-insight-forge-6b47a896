import { spineApi } from '@/lib/spineApi';
import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { adminApi as supabase } from '@/lib/adminApi';
import { 
  CheckCircle, 
  XCircle, 
  Clock, 
  AlertTriangle,
  RefreshCw,
  TrendingUp,
  Zap,
  Timer,
  Loader2,
  Database,
  Bot,
  Shield,
  Activity,
  Globe,
  Calculator,
  ChevronDown,
  ChevronUp,
  Play,
  Eye,
  Brain,
} from 'lucide-react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import QuickStatusBar from './test-results/QuickStatusBar';
import SimplePlatformHealth from './test-results/SimplePlatformHealth';
import AIAnalysisCard from './test-results/AIAnalysisCard';
import EngineeringBenchmark from './test-results/EngineeringBenchmark';
import AIImprovements from './test-results/AIImprovements';
import { OWASPSecurityReport } from './test-results/OWASPSecurityReport';
import { DetailedTestCard } from './test-results/DetailedTestCard';
import { ComprehensiveTestResults } from './test-results/ComprehensiveTestResults';
import { UXJourneyResults } from './test-results/UXJourneyResults';
import { ResponseTimeResults } from './test-results/ResponseTimeResults';
import { AYNIntelligenceResults } from './test-results/AYNIntelligenceResults';
import { VisualTestCard } from './test-results/VisualTestCard';
import { VisualTestResults } from './test-results/VisualTestResults';
import { CrashTestResults } from './test-results/CrashTestResults';
import { AIConversationResults } from './test-results/AIConversationResults';
import { BrandingPrivacyResults } from './test-results/BrandingPrivacyResults';
import { EmotionSyncResults } from './test-results/EmotionSyncResults';
import { PersonalityProfile } from './test-results/PersonalityProfile';

interface TestResult {
  id: string;
  test_suite: string;
  test_name: string;
  status: string;
  duration_ms: number | null;
  error_message?: string | null;
  browser: string | null;
  created_at: string;
}

interface TestRun {
  id: string;
  run_name: string | null;
  total_tests: number | null;
  passed_tests: number | null;
  failed_tests: number | null;
  skipped_tests: number | null;
  duration_ms: number | null;
  environment: string | null;
  created_at: string;
}

interface StressMetric {
  id: string;
  test_name: string;
  concurrent_users: number | null;
  avg_response_time_ms: number | null;
  p95_response_time_ms: number | null;
  error_rate: number | null;
  created_at: string;
}

interface BugReport {
  endpoint: string;
  bugType: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  description: string;
  suggestedFix: string;
}

import { SUPABASE_URL } from '@/config';

/**
 * Safely fetch JSON from an edge function with proper content-type validation
 * Returns parsed JSON or throws a user-friendly error
 */
async function safeFetchJson<T>(url: string, options: RequestInit): Promise<T> {
  const response = await fetch(url, options);
  
  // Check content-type before parsing
  const contentType = response.headers.get('content-type');
  if (!contentType?.includes('application/json')) {
    const text = await response.text();
    console.error(`Non-JSON response from ${url}:`, text.substring(0, 300));
    
    // Provide user-friendly error messages based on common issues
    if (text.includes('<!DOCTYPE') || text.includes('<html')) {
      throw new Error('Server returned an error page. The edge function may have crashed or timed out.');
    }
    if (text.includes('Rate limit') || text.includes('429')) {
      throw new Error('Rate limit exceeded. Please wait a moment and try again.');
    }
    if (text.includes('Unauthorized') || text.includes('401')) {
      throw new Error('Authentication required. Please sign in and try again.');
    }
    throw new Error('Server returned an unexpected response. Check edge function logs for details.');
  }
  
  if (!response.ok) {
    // Try to extract error message from JSON response
    try {
      const errorData = await response.json();
      throw new Error(errorData.error || errorData.message || `Request failed with status ${response.status}`);
    } catch {
      throw new Error(`Request failed with status ${response.status}`);
    }
  }
  
  return response.json();
}

const TestResultsDashboard: React.FC = () => {
  const [testRuns, setTestRuns] = useState<TestRun[]>([]);
  const [testResults, setTestResults] = useState<TestResult[]>([]);
  const [stressMetrics, setStressMetrics] = useState<StressMetric[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  // Expanded sections
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['activity']));
  
  // AI Analysis state
  const [aiAnalysis, setAiAnalysis] = useState<string>('');
  const [aiModel, setAiModel] = useState<string>('');
  const [bugs, setBugs] = useState<BugReport[]>([]);
  const [isRunningBugHunter, setIsRunningBugHunter] = useState(false);
  const [isRunningComprehensive, setIsRunningComprehensive] = useState(false);
  const [isRunningUxTester, setIsRunningUxTester] = useState(false);
  const [isRunningResponseTime, setIsRunningResponseTime] = useState(false);
  const [isRunningIntelligence, setIsRunningIntelligence] = useState(false);
  const [isRunningVisualTest, setIsRunningVisualTest] = useState(false);
  const [isRunningCrashTest, setIsRunningCrashTest] = useState(false);
  const [isRunningConversation, setIsRunningConversation] = useState(false);
  
  // New test results
  const [responseTimeResults, setResponseTimeResults] = useState<{
    summary?: { totalTests: number; successRate: string; avgTTFT: string; avgTotal: string; p95Total: string; overallRating: 'excellent' | 'good' | 'needs_improvement' | 'poor' };
    byIntent?: Record<string, unknown>;
    sloTargets?: Record<string, { ttft: number; total: number }>;
  } | null>(null);
  const [intelligenceResults, setIntelligenceResults] = useState<{
    summary?: { overallScore: number; intelligenceRating: 'genius' | 'smart' | 'average' | 'needs_training'; totalTests: number; passed: number; failed: number };
    byCategory?: Record<string, unknown>;
    improvements?: string[];
  } | null>(null);
  const [visualTestResults, setVisualTestResults] = useState<{
    summary?: { totalPages: number; passed: number; warnings: number; failed: number; totalIssues: number; criticalIssues: number; highIssues: number; avgLoadTime: string; healthScore: number; overallRating: 'excellent' | 'good' | 'needs_improvement' | 'poor' };
    results?: Array<{ path: string; name: string; status: 'passed' | 'warning' | 'failed'; analysisMethod: string; issues: Array<{ type: string; severity: string; description: string; element?: string; suggestion: string }>; metrics: { htmlSize: number; loadTime: number; elementsCount: number; imagesCount: number; linksCount: number; formsCount: number } }>;
    aiAnalysis?: string;
    improvements?: string[];
  } | null>(null);
  const [comprehensiveResults, setComprehensiveResults] = useState<{ passRate: string; totalTests: number; passed: number; failed: number; avgDuration?: number } | null>(null);
  const [comprehensiveEndpoints, setComprehensiveEndpoints] = useState<Array<{
    endpoint: string;
    tests: Array<{
      name: string;
      category: 'valid' | 'edge_case' | 'type_error' | 'security' | 'performance';
      status: 'passed' | 'failed' | 'slow';
      duration_ms: number;
      error?: string;
    }>;
    passRate: number;
    avgDuration: number;
  }>>([]);
  const [uxResults, setUxResults] = useState<{ avgScore: string; successRate: string; personasTested?: number; journeysTested?: number; avgResponseTime?: number } | null>(null);
  const [uxPersonas, setUxPersonas] = useState<Array<{
    name: string;
    type: 'new_user' | 'expert' | 'mobile' | 'arabic' | 'power_user';
    avgScore: number;
    completedJourneys: number;
    totalJourneys: number;
    frustrations: number;
    avgResponseTime: number;
  }>>([]);
  const [uxJourneys, setUxJourneys] = useState<Array<{
    name: string;
    steps: Array<{
      name: string;
      status: 'passed' | 'failed' | 'slow';
      duration_ms: number;
      error?: string;
    }>;
    completionRate: number;
    uxScore: number;
    status: 'success' | 'partial' | 'failed';
    personaName: string;
  }>>([]);
  
  // Crash Test Results
  const [crashTestResults, setCrashTestResults] = useState<{
    summary?: { totalTests: number; passed: number; failed: number; skipped: number; crashRate: string; avgResponseTime: number; totalTime: number };
    byEndpoint?: Record<string, { passed: number; failed: number; skipped: number }>;
    byCategory?: Record<string, { passed: number; failed: number; skipped: number }>;
    failures?: Array<{ endpoint: string; category: string; httpStatus: number; error?: string; payload?: unknown }>;
  } | null>(null);
  
  // AI Conversation Results
  const [conversationResults, setConversationResults] = useState<{
    summary?: { overallScore: number; intelligenceRating: string; totalTests: number; passed: number; failed: number };
    byCategory?: Record<string, { passed: number; total: number; avgScore: number; results?: Array<{ name: string; passed: boolean; score: number; aynResponse: string; reason: string }> }>;
    improvements?: string[];
    sampleTranscripts?: Array<{ category: string; name: string; userMessage: string; aynResponse: string; passed: boolean; score: number; reason: string; emotion?: string }>;
    // Explicit emotion data
    emotionSyncRate?: number;
    emotionTestResults?: Array<{ name: string; userMessage: string; expectedEmotion: string; detectedEmotion: string; passed: boolean; aynResponse?: string }>;
    emotionCoverage?: Record<string, { tested: boolean; matched: boolean }>;
    personalityScore?: number;
  } | null>(null);
  
  // Test suite running states
  const [runningSecurityTests, setRunningSecurityTests] = useState(false);
  const [runningApiTests, setRunningApiTests] = useState(false);
  const [runningDbTests, setRunningDbTests] = useState(false);
  const [runningPerfTests, setRunningPerfTests] = useState(false);
  const [runningCalcTests, setRunningCalcTests] = useState(false);
  
  // Engineering grade from localStorage
  const [engineeringGrade, setEngineeringGrade] = useState<string | null>(null);
  
  // Security score
  const [securityScore, setSecurityScore] = useState<number | null>(null);

  useEffect(() => {
    loadData();
    // Load engineering grade from localStorage
    const stored = localStorage.getItem('engineering_benchmark_results');
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        setEngineeringGrade(parsed.summary?.overallGrade);
      } catch (e) {
        console.error('Failed to parse engineering results:', e);
      }
    }
  }, []);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await spineApi.req("GET", "/admin/test-results");
      if (error) throw error;
      const d = data as any;

      if (d?.test_runs) setTestRuns(d.test_runs);
      if (d?.test_results) {
        setTestResults(d.test_results);
        const secTests = d.test_results.filter((t: any) => t.test_suite === 'security');
        if (secTests.length > 0) {
          const passed = secTests.filter((t: any) => t.status === 'passed').length;
          setSecurityScore(Math.round((passed / secTests.length) * 100));
        }
      }
      if (d?.stress_metrics) setStressMetrics(d.stress_metrics);
    } catch (error) {
      console.error('Failed to load test data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const runTests = async (suiteId: string, setLoading: (v: boolean) => void) => {
    setLoading(true);
    const runId = crypto.randomUUID();
    
    try {
      const suiteConfig: Record<string, { name: string; suite: string }> = {
        api: { name: 'API Health Tests', suite: 'api' },
        database: { name: 'Database Tests', suite: 'database' },
        security: { name: 'Security Tests', suite: 'security' },
        performance: { name: 'Performance Tests', suite: 'performance' },
        calculator: { name: 'Calculator Tests', suite: 'calculator' },
      };
      
      const config = suiteConfig[suiteId] || { name: 'Quick Tests', suite: 'quick' };
      toast.info(`Running ${config.name}...`);
      
      const result = await safeFetchJson<{
        success: boolean;
        results?: Array<{
          category: string;
          name: string;
          status: string;
          duration_ms: number;
          error_message?: string;
        }>;
        summary?: {
          total: number;
          passed: number;
          failed: number;
          passRate: number;
          totalDuration: number;
        };
        error?: string;
      }>(`${SUPABASE_URL}/functions/v1/run-real-tests`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ suite: config.suite }),
      });
      
      if (result.success && result.results && result.summary) {
        /* spine */;

        for (const testResult of result.results) {
          /* spine */;
        }

        const passRate = result.summary.passRate;
        if (passRate === 100) {
          toast.success(`✅ ${config.name}: All ${result.summary.total} tests passed!`);
        } else if (passRate >= 80) {
          toast.warning(`⚠️ ${config.name}: ${result.summary.passed}/${result.summary.total} passed`);
        } else {
          toast.error(`❌ ${config.name}: ${result.summary.failed} tests failed`);
        }
        
        await loadData();
      } else if (result.error) {
        throw new Error(result.error);
      }
    } catch (error) {
      console.error('Test run failed:', error);
      toast.error(`Failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

  const runBugHunter = async () => {
    setIsRunningBugHunter(true);
    try {
      toast.info('🔍 AI Bug Hunter starting...');
      
      const result = await safeFetchJson<{
        success: boolean;
        bugs?: BugReport[];
        analysis?: string;
        modelUsed?: string;
        error?: string;
      }>(`https://spine.aynn.io/admin/edge/ai-bug-hunter`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          endpoints: ['support-bot'],
          model: 'claude'
        }),
      });
      
      if (result.success) {
        setBugs(result.bugs || []);
        setAiAnalysis(result.analysis || '');
        setAiModel(result.modelUsed || 'Claude Sonnet 4');
        
        if (!result.bugs || result.bugs.length === 0) {
          toast.success('✅ No bugs found!');
        } else {
          toast.warning(`⚠️ Found ${result.bugs.length} potential bugs`);
        }
      } else if (result.error) {
        throw new Error(result.error);
      }
    } catch (error) {
      console.error('Bug hunter failed:', error);
      toast.error(`Bug hunter failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsRunningBugHunter(false);
    }
  };

  const runComprehensiveTester = async () => {
    setIsRunningComprehensive(true);
    try {
      toast.info('🧪 Running comprehensive system tests on all endpoints...');
      
      const result = await safeFetchJson<{
        success: boolean;
        summary?: { passRate: string; totalTests: number; passed: number; failed: number };
        byEndpoint?: Array<{
          endpoint: string;
          tests: Array<{
            name: string;
            category: 'valid' | 'edge_case' | 'type_error' | 'security' | 'performance';
            status: 'passed' | 'failed' | 'slow';
            duration_ms: number;
            error?: string;
          }>;
          passRate: number;
          avgDuration: number;
        }>;
        analysis?: string;
        error?: string;
      }>(`${SUPABASE_URL}/functions/v1/ai-comprehensive-tester`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ concurrency: 3 }),
      });
      
      if (result.success && result.summary) {
        setComprehensiveResults(result.summary);
        if (result.byEndpoint) {
          setComprehensiveEndpoints(result.byEndpoint);
        }
        setAiAnalysis(result.analysis || '');
        setAiModel('AI Comprehensive Tester');
        
        if (result.summary.failed === 0) {
          toast.success(`✅ All ${result.summary.totalTests} tests passed!`);
        } else {
          toast.warning(`⚠️ ${result.summary.passed}/${result.summary.totalTests} tests passed (${result.summary.passRate})`);
        }
        await loadData();
      } else if (result.error) {
        throw new Error(result.error);
      }
    } catch (error) {
      console.error('Comprehensive tester failed:', error);
      toast.error(`Failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsRunningComprehensive(false);
    }
  };

  const runUxTester = async (mode: 'quick' | 'full' = 'quick') => {
    setIsRunningUxTester(true);
    try {
      toast.info(mode === 'quick' 
        ? '🎭 Running quick UX journey tests (3 personas × 3 journeys)...'
        : '🎭 Running full UX journey tests (5 personas × 5 journeys)...'
      );
      
      const result = await safeFetchJson<{
        success: boolean;
        summary?: { avgUxScore: string; overallSuccessRate: string; personasTested: number; journeysTested: number; avgResponseTime?: number };
        byPersona?: Array<{
          name: string;
          type: 'new_user' | 'expert' | 'mobile' | 'arabic' | 'power_user';
          avgScore: number;
          completedJourneys: number;
          totalJourneys: number;
          frustrations: number;
          avgResponseTime: number;
        }>;
        results?: Array<{
          journey: string;
          persona: string;
          steps: Array<{
            name: string;
            status: 'passed' | 'failed' | 'slow';
            duration_ms: number;
            error?: string;
          }>;
          completionRate: number;
          uxScore: number;
          status: 'success' | 'partial' | 'failed';
        }>;
        analysis?: string;
        error?: string;
      }>(`${SUPABASE_URL}/functions/v1/ai-ux-tester`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode }),
      });
      
      if (result.success && result.summary) {
        setUxResults({ 
          avgScore: result.summary.avgUxScore, 
          successRate: result.summary.overallSuccessRate,
          personasTested: result.summary.personasTested,
          journeysTested: result.summary.journeysTested,
          avgResponseTime: result.summary.avgResponseTime
        });
        if (result.byPersona) {
          setUxPersonas(result.byPersona);
        }
        if (result.results) {
          setUxJourneys(result.results.map(r => ({
            name: r.journey,
            steps: r.steps,
            completionRate: r.completionRate,
            uxScore: r.uxScore,
            status: r.status,
            personaName: r.persona
          })));
        }
        setAiAnalysis(result.analysis || '');
        setAiModel('AI UX Journey Tester');
        
        const score = parseInt(result.summary.avgUxScore);
        if (score >= 80) {
          toast.success(`✅ UX Score: ${result.summary.avgUxScore}/100, ${result.summary.overallSuccessRate} success`);
        } else if (score >= 60) {
          toast.warning(`⚠️ UX Score: ${result.summary.avgUxScore}/100, ${result.summary.overallSuccessRate} success`);
        } else {
          toast.error(`❌ UX Score: ${result.summary.avgUxScore}/100 needs improvement`);
        }
        await loadData();
      } else if (result.error) {
        throw new Error(result.error);
      }
    } catch (error) {
      console.error('UX tester failed:', error);
      toast.error(`Failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsRunningUxTester(false);
    }
  };

  const runResponseTimeTester = async () => {
    setIsRunningResponseTime(true);
    try {
      toast.info('⏱️ Running response time benchmarks...');
      
      const result = await safeFetchJson<{
        success: boolean;
        summary?: { totalTests: number; successRate: string; avgTTFT: string; avgTotal: string; p95Total: string; overallRating: 'excellent' | 'good' | 'needs_improvement' | 'poor' };
        byIntent?: Record<string, unknown>;
        sloTargets?: Record<string, { ttft: number; total: number }>;
        error?: string;
      }>(`${SUPABASE_URL}/functions/v1/ai-response-time-tester`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ intents: ['chat', 'engineering'], iterations: 2 }),
      });
      
      if (result.success && result.summary) {
        setResponseTimeResults({ summary: result.summary, byIntent: result.byIntent, sloTargets: result.sloTargets });
        setAiModel('Response Time Tester');
        
        if (result.summary.overallRating === 'excellent') {
          toast.success(`✅ Response times excellent! Avg: ${result.summary.avgTotal}`);
        } else if (result.summary.overallRating === 'good') {
          toast.success(`👍 Response times good. Avg: ${result.summary.avgTotal}`);
        } else {
          toast.warning(`⚠️ Response times need improvement. Avg: ${result.summary.avgTotal}`);
        }
        await loadData();
      } else if (result.error) {
        throw new Error(result.error);
      }
    } catch (error) {
      console.error('Response time tester failed:', error);
      toast.error(`Failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsRunningResponseTime(false);
    }
  };

  const runIntelligenceTester = async () => {
    setIsRunningIntelligence(true);
    try {
      toast.info('🧠 Evaluating AYN intelligence...');
      
      const result = await safeFetchJson<{
        success: boolean;
        summary?: { overallScore: number; intelligenceRating: 'genius' | 'smart' | 'average' | 'needs_training'; totalTests: number; passed: number; failed: number };
        byCategory?: Record<string, unknown>;
        improvements?: string[];
        error?: string;
      }>(`https://spine.aynn.io/admin/edge/ai-ayn-evaluator`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      
      if (result.success && result.summary) {
        setIntelligenceResults({ summary: result.summary, byCategory: result.byCategory, improvements: result.improvements });
        setAiModel('AYN Intelligence Evaluator');
        
        const rating = result.summary.intelligenceRating;
        if (rating === 'genius') {
          toast.success(`🧠 AYN is a genius! Score: ${result.summary.overallScore}/100`);
        } else if (rating === 'smart') {
          toast.success(`💡 AYN is smart! Score: ${result.summary.overallScore}/100`);
        } else if (rating === 'average') {
          toast.warning(`📚 AYN is average. Score: ${result.summary.overallScore}/100`);
        } else {
          toast.error(`📖 AYN needs training. Score: ${result.summary.overallScore}/100`);
        }
        await loadData();
      } else if (result.error) {
        throw new Error(result.error);
      }
    } catch (error) {
      console.error('Intelligence tester failed:', error);
      toast.error(`Failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsRunningIntelligence(false);
    }
  };

  const runVisualTester = async () => {
    setIsRunningVisualTest(true);
    try {
      toast.info('👁️ Running visual tests across all pages...');
      
      const result = await safeFetchJson<{
        success: boolean;
        summary?: { totalPages: number; passed: number; warnings: number; failed: number; totalIssues: number; criticalIssues: number; highIssues: number; avgLoadTime: string; healthScore: number; overallRating: 'excellent' | 'good' | 'needs_improvement' | 'poor' };
        results?: Array<{ path: string; name: string; status: 'passed' | 'warning' | 'failed'; analysisMethod: string; issues: Array<{ type: string; severity: string; description: string; element?: string; suggestion: string }>; metrics: { htmlSize: number; loadTime: number; elementsCount: number; imagesCount: number; linksCount: number; formsCount: number } }>;
        aiAnalysis?: string;
        error?: string;
      }>(`${SUPABASE_URL}/functions/v1/ai-visual-tester`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      
      if (result.success && result.summary) {
        setVisualTestResults({ summary: result.summary, results: result.results, aiAnalysis: result.aiAnalysis });
        setAiModel('Visual Tester');
        
        // Auto-expand results section
        setExpandedSections(prev => new Set([...prev, 'results']));
        
        if (result.summary.overallRating === 'excellent') {
          toast.success(`✨ Visual health excellent! ${result.summary.healthScore}%`);
        } else if (result.summary.overallRating === 'good') {
          toast.success(`👍 Visual health good. ${result.summary.healthScore}%`);
        } else if (result.summary.criticalIssues > 0) {
          toast.error(`🔴 ${result.summary.criticalIssues} critical visual issues found`);
        } else {
          toast.warning(`⚠️ Visual health: ${result.summary.healthScore}% - ${result.summary.totalIssues} issues`);
        }
        await loadData();
      } else if (result.error) {
        throw new Error(result.error);
      }
    } catch (error) {
      console.error('Visual tester failed:', error);
      toast.error(`Failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsRunningVisualTest(false);
    }
  };

  const runCrashTester = async () => {
    setIsRunningCrashTest(true);
    try {
      toast.info('🔨 Running crash tests on all endpoints...');
      
      const result = await safeFetchJson<{
        success: boolean;
        summary?: { totalTests: number; passed: number; failed: number; skipped: number; crashRate: string; avgResponseTime: number; totalTime: number };
        byEndpoint?: Record<string, { passed: number; failed: number; skipped: number }>;
        byCategory?: Record<string, { passed: number; failed: number; skipped: number }>;
        failures?: Array<{ endpoint: string; category: string; httpStatus: number; error?: string; payload?: unknown }>;
        error?: string;
      }>(`${SUPABASE_URL}/functions/v1/ai-crash-tester`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      
      if (result.success && result.summary) {
        setCrashTestResults({
          summary: result.summary,
          byEndpoint: result.byEndpoint,
          byCategory: result.byCategory,
          failures: result.failures
        });
        
        setExpandedSections(prev => new Set([...prev, 'reliability']));
        
        if (result.summary.failed === 0) {
          toast.success(`✅ All ${result.summary.totalTests} crash tests passed! System is crash-free.`);
        } else {
          toast.error(`❌ ${result.summary.failed} crashes detected! Crash rate: ${result.summary.crashRate}`);
        }
        await loadData();
      } else if (result.error) {
        throw new Error(result.error);
      }
    } catch (error) {
      console.error('Crash tester failed:', error);
      toast.error(`Failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsRunningCrashTest(false);
    }
  };

  const runConversationEvaluator = async (quick = true) => {
    setIsRunningConversation(true);
    try {
      toast.info(quick 
        ? '💬 Running quick conversation tests (branding, privacy, safety)...'
        : '💬 Running full conversation evaluation...'
      );
      
      const result = await safeFetchJson<{
        success: boolean;
        summary?: { overallScore: number; intelligenceRating: string; totalTests: number; passed: number; failed: number };
        byCategory?: Record<string, { passed: number; total: number; avgScore: number; results?: Array<{ name: string; passed: boolean; score: number; aynResponse: string; reason: string }> }>;
        improvements?: string[];
        sampleTranscripts?: Array<{ category: string; name: string; userMessage: string; aynResponse: string; passed: boolean; score: number; reason: string; emotion?: string }>;
        emotionSyncRate?: number;
        emotionTestResults?: Array<{ name: string; userMessage: string; expectedEmotion: string; detectedEmotion: string; passed: boolean; aynResponse?: string }>;
        emotionCoverage?: Record<string, { tested: boolean; matched: boolean }>;
        personalityScore?: number;
        error?: string;
      }>(`https://spine.aynn.io/admin/edge/ai-conversation-evaluator`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quick }),
      });
      
      if (result.success && result.summary) {
        setConversationResults({
          summary: result.summary,
          byCategory: result.byCategory,
          improvements: result.improvements,
          sampleTranscripts: result.sampleTranscripts,
          emotionSyncRate: result.emotionSyncRate,
          emotionTestResults: result.emotionTestResults,
          emotionCoverage: result.emotionCoverage,
          personalityScore: result.personalityScore
        });
        
        setExpandedSections(prev => new Set([...prev, 'reliability']));
        
        const rating = result.summary.intelligenceRating;
        if (rating === 'genius') {
          toast.success(`🧠 AYN Conversation: Genius level! ${result.summary.overallScore}%`);
        } else if (rating === 'smart') {
          toast.success(`💡 AYN Conversation: Smart! ${result.summary.overallScore}%`);
        } else if (rating === 'average') {
          toast.warning(`📊 AYN Conversation: Average. ${result.summary.overallScore}%`);
        } else {
          toast.error(`📚 AYN needs training. ${result.summary.overallScore}%`);
        }
        await loadData();
      } else if (result.error) {
        throw new Error(result.error);
      }
    } catch (error) {
      console.error('Conversation evaluator failed:', error);
      toast.error(`Failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsRunningConversation(false);
    }
  };

  // Calculate summary stats
  const totalTests = testResults.length;
  const passedTests = testResults.filter(t => t.status === 'passed').length;
  const failedTests = testResults.filter(t => t.status === 'failed').length;
  const passRate = totalTests > 0 ? (passedTests / totalTests) * 100 : 0;
  const avgDuration = totalTests > 0 
    ? testResults.reduce((acc, t) => acc + (t.duration_ms || 0), 0) / totalTests 
    : 0;

  // Group test results by category
  const getTestsByCategory = (category: string) => 
    testResults.filter(t => t.test_suite === category).map(t => ({
      name: t.test_name,
      status: t.status as 'passed' | 'failed' | 'skipped',
      duration_ms: t.duration_ms ?? undefined,
      error_message: t.error_message
    }));

  const getLastRunByCategory = (category: string) => {
    const categoryRuns = testRuns.filter(r => 
      r.run_name?.toLowerCase().includes(category.toLowerCase())
    );
    return categoryRuns.length > 0 ? new Date(categoryRuns[0].created_at) : undefined;
  };

  const toggleSection = (section: string) => {
    const newExpanded = new Set(expandedSections);
    if (newExpanded.has(section)) {
      newExpanded.delete(section);
    } else {
      newExpanded.add(section);
    }
    setExpandedSections(newExpanded);
  };

  const criticalIssues = failedTests;
  const warnings = testResults.filter(t => t.status === 'skipped').length;

  return (
    <div className="space-y-4 p-4 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-xl font-bold">Test Results Dashboard</h1>
          <p className="text-sm text-muted-foreground">Real-time testing with full result details</p>
        </div>
        <Button variant="outline" size="sm" onClick={loadData} disabled={isLoading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Quick Status Bar */}
      <QuickStatusBar
        passing={passedTests}
        warnings={warnings}
        critical={criticalIssues}
        lastRun={testRuns.length > 0 ? new Date(testRuns[0].created_at) : undefined}
        engineeringGrade={engineeringGrade || undefined}
        securityScore={securityScore ?? undefined}
      />

      {/* Section 1: Platform Health + Key Metrics */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <SimplePlatformHealth
          testPassRate={passRate}
          errorRate={totalTests > 0 ? (failedTests / totalTests) * 100 : 0}
          criticalIssues={criticalIssues}
          totalTests={totalTests}
          hasRealData={totalTests > 0}
        />
        
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Pass Rate</p>
                <p className="text-2xl font-bold">{passRate.toFixed(0)}%</p>
              </div>
              <TrendingUp className={`h-8 w-8 ${passRate >= 90 ? 'text-green-500' : passRate >= 70 ? 'text-yellow-500' : 'text-red-500'}`} />
            </div>
            <Progress value={passRate} className="mt-2 h-2" />
            <p className="text-xs text-muted-foreground mt-1">{passedTests}/{totalTests} tests</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Avg Response</p>
                <p className="text-2xl font-bold">{(avgDuration / 1000).toFixed(1)}s</p>
              </div>
              <Timer className="h-8 w-8 text-orange-500" />
            </div>
            <p className="text-xs text-muted-foreground mt-2">{testRuns.length} runs recorded</p>
          </CardContent>
        </Card>
      </div>

      {/* Section 2: AI Tools Quick Actions */}
      <Card className="border-purple-500/20 bg-purple-500/5">
        <CardContent className="py-3">
          <div className="flex items-center flex-wrap gap-2">
            <div className="flex items-center gap-2 mr-2">
              <Bot className="h-4 w-4 text-purple-500" />
              <span className="text-sm font-medium">AI Tools:</span>
            </div>
            
            <Button 
              variant="outline" 
              size="sm" 
              onClick={runBugHunter} 
              disabled={isRunningBugHunter}
              className="h-8"
            >
              {isRunningBugHunter ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Shield className="h-3 w-3 mr-1" />}
              Bug Hunter
              {bugs.length > 0 && <Badge variant="destructive" className="ml-1 h-4 px-1 text-[10px]">{bugs.length}</Badge>}
            </Button>
            
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => runTests('security', setRunningSecurityTests)} 
              disabled={runningSecurityTests}
              className="h-8"
            >
              {runningSecurityTests ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Shield className="h-3 w-3 mr-1" />}
              OWASP Scan
              {securityScore !== null && <Badge variant="outline" className="ml-1 h-4 px-1 text-[10px]">{securityScore}%</Badge>}
            </Button>
            
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => runTests('api', setRunningApiTests)} 
              disabled={runningApiTests}
              className="h-8"
            >
              {runningApiTests ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Globe className="h-3 w-3 mr-1" />}
              API Health
            </Button>
            
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => runTests('performance', setRunningPerfTests)} 
              disabled={runningPerfTests}
              className="h-8"
            >
              {runningPerfTests ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Zap className="h-3 w-3 mr-1" />}
              Performance
            </Button>
            
            <div className="w-px h-6 bg-border mx-1" />
            
            <Button 
              variant="default" 
              size="sm" 
              onClick={runComprehensiveTester} 
              disabled={isRunningComprehensive}
              className="h-8 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700"
            >
              {isRunningComprehensive ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Activity className="h-3 w-3 mr-1" />}
              Full System Test
              {comprehensiveResults && <Badge variant="secondary" className="ml-1 h-4 px-1 text-[10px]">{comprehensiveResults.passRate}</Badge>}
            </Button>
            
            <Button 
              variant="default" 
              size="sm" 
              onClick={() => runUxTester('quick')} 
              disabled={isRunningUxTester}
              className="h-8 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-700 hover:to-blue-700"
            >
              {isRunningUxTester ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Bot className="h-3 w-3 mr-1" />}
              Quick UX Test
              {uxResults && <Badge variant="secondary" className="ml-1 h-4 px-1 text-[10px]">{uxResults.avgScore}/100</Badge>}
            </Button>
            
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => runUxTester('full')} 
              disabled={isRunningUxTester}
              className="h-8"
            >
              <Bot className="h-3 w-3 mr-1" />
              Full UX Test
            </Button>
            
            <div className="w-px h-6 bg-border mx-1" />
            
            <Button 
              variant="outline" 
              size="sm" 
              onClick={runResponseTimeTester} 
              disabled={isRunningResponseTime}
              className="h-8"
            >
              {isRunningResponseTime ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Timer className="h-3 w-3 mr-1" />}
              Response Time
              {responseTimeResults?.summary && <Badge variant="outline" className="ml-1 h-4 px-1 text-[10px]">{responseTimeResults.summary.avgTotal}</Badge>}
            </Button>
            
            <Button 
              variant="default" 
              size="sm" 
              onClick={runIntelligenceTester} 
              disabled={isRunningIntelligence}
              className="h-8 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700"
            >
              {isRunningIntelligence ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Brain className="h-3 w-3 mr-1" />}
              AYN IQ Test
              {intelligenceResults?.summary && <Badge variant="secondary" className="ml-1 h-4 px-1 text-[10px]">{intelligenceResults.summary.overallScore}/100</Badge>}
            </Button>
            
            <Button 
              variant="default" 
              size="sm" 
              onClick={runVisualTester} 
              disabled={isRunningVisualTest}
              className="h-8 bg-gradient-to-r from-indigo-600 to-cyan-600 hover:from-indigo-700 hover:to-cyan-700"
            >
              {isRunningVisualTest ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Eye className="h-3 w-3 mr-1" />}
              Visual Test
              {visualTestResults?.summary && <Badge variant="secondary" className="ml-1 h-4 px-1 text-[10px]">{visualTestResults.summary.healthScore}%</Badge>}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Section 3: Test Category Cards - DEDICATED CARDS */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {/* Security Tests Card */}
        <DetailedTestCard
          title="Security Tests"
          icon={<Shield className="h-4 w-4 text-red-500" />}
          tests={getTestsByCategory('security')}
          lastRun={getLastRunByCategory('security')}
          isLoading={runningSecurityTests}
          onRun={() => runTests('security', setRunningSecurityTests)}
        />

        {/* API Health Card */}
        <DetailedTestCard
          title="API Health"
          icon={<Globe className="h-4 w-4 text-cyan-500" />}
          tests={getTestsByCategory('api')}
          lastRun={getLastRunByCategory('api')}
          isLoading={runningApiTests}
          onRun={() => runTests('api', setRunningApiTests)}
        />

        {/* Database Tests Card */}
        <DetailedTestCard
          title="Database Tests"
          icon={<Database className="h-4 w-4 text-purple-500" />}
          tests={getTestsByCategory('database')}
          lastRun={getLastRunByCategory('database')}
          isLoading={runningDbTests}
          onRun={() => runTests('database', setRunningDbTests)}
        />

        {/* Performance Tests Card */}
        <DetailedTestCard
          title="Performance Tests"
          icon={<Zap className="h-4 w-4 text-yellow-500" />}
          tests={getTestsByCategory('performance')}
          lastRun={getLastRunByCategory('performance')}
          isLoading={runningPerfTests}
          onRun={() => runTests('performance', setRunningPerfTests)}
        />

        {/* Calculator Tests Card */}
        <DetailedTestCard
          title="Calculator Tests"
          icon={<Calculator className="h-4 w-4 text-blue-500" />}
          tests={getTestsByCategory('calculator')}
          grade={engineeringGrade || undefined}
          lastRun={getLastRunByCategory('calculator')}
          isLoading={runningCalcTests}
          onRun={() => runTests('calculator', setRunningCalcTests)}
        />

        {/* AI Bug Hunter Results Card */}
        <DetailedTestCard
          title="AI Bug Hunter"
          icon={<Bot className="h-4 w-4 text-purple-500" />}
          bugs={bugs}
          isLoading={isRunningBugHunter}
          onRun={runBugHunter}
        />
        
        {/* Visual Test Card */}
        <VisualTestCard
          summary={visualTestResults?.summary}
          isLoading={isRunningVisualTest}
          onRun={runVisualTester}
          lastRun={visualTestResults?.summary ? new Date() : undefined}
        />
      </div>

      {/* Section 4: Engineering Benchmark - Full Width for Better Visibility */}
      <EngineeringBenchmark />

      {/* Section 5: AI Analysis */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <AIAnalysisCard
          analysis={aiAnalysis}
          model={aiModel || 'Claude Sonnet 4'}
          bugs={bugs}
          isLoading={isRunningBugHunter}
          lastAnalyzedAt={testRuns.length > 0 ? new Date(testRuns[0].created_at) : undefined}
        />
      </div>

      {/* Section 5: Dedicated Results Section - Comprehensive & UX Journey */}
      <Collapsible open={expandedSections.has('results')} onOpenChange={() => toggleSection('results')}>
        <Card className="border-purple-500/20">
          <CollapsibleTrigger asChild>
            <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <Activity className="h-4 w-4 text-purple-500" />
                  Comprehensive Test Results
                  {(comprehensiveEndpoints.length > 0 || uxJourneys.length > 0) && (
                    <Badge variant="secondary" className="ml-2">
                      {comprehensiveEndpoints.length} endpoints • {uxJourneys.length} journeys
                    </Badge>
                  )}
                </CardTitle>
                <div className="flex items-center gap-2">
                  {comprehensiveResults && (
                    <Badge variant={parseInt(comprehensiveResults.passRate) >= 90 ? 'default' : 'secondary'}>
                      System: {comprehensiveResults.passRate}
                    </Badge>
                  )}
                  {uxResults && (
                    <Badge variant={parseInt(uxResults.avgScore) >= 80 ? 'default' : 'secondary'}>
                      UX: {uxResults.avgScore}/100
                    </Badge>
                  )}
                  {expandedSections.has('results') ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </div>
              </div>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent className="pt-0 space-y-6">
              {/* Comprehensive Test Results */}
              <ComprehensiveTestResults
                results={comprehensiveEndpoints}
                summary={comprehensiveResults ? {
                  passRate: comprehensiveResults.passRate,
                  totalTests: comprehensiveResults.totalTests,
                  passed: comprehensiveResults.passed,
                  failed: comprehensiveResults.failed,
                  avgDuration: comprehensiveResults.avgDuration || 0
                } : undefined}
                isLoading={isRunningComprehensive}
              />

              {/* UX Journey Results */}
              <UXJourneyResults
                personas={uxPersonas}
                journeys={uxJourneys}
                summary={uxResults ? {
                  avgUxScore: uxResults.avgScore,
                  overallSuccessRate: uxResults.successRate,
                  personasTested: uxResults.personasTested || 0,
                  journeysTested: uxResults.journeysTested || 0,
                  avgResponseTime: uxResults.avgResponseTime || 0
                } : undefined}
                isLoading={isRunningUxTester}
              />

              {/* Response Time Results */}
              <ResponseTimeResults
                summary={responseTimeResults?.summary}
                byIntent={responseTimeResults?.byIntent as Record<string, { ttftStats: { p50: number; p95: number; p99: number; avg: number; min: number; max: number }; totalStats: { p50: number; p95: number; p99: number; avg: number; min: number; max: number }; sloCompliance: { ttft: number; total: number }; results: Array<{ intent: string; testName: string; ttft_ms: number; totalTime_ms: number; success: boolean; error?: string }> }> | undefined}
                sloTargets={responseTimeResults?.sloTargets}
                isLoading={isRunningResponseTime}
              />

              {/* AYN Intelligence Results */}
              <AYNIntelligenceResults
                summary={intelligenceResults?.summary}
                byCategory={intelligenceResults?.byCategory as Record<string, { passed: number; total: number; avgScore: number; results: Array<{ category: string; name: string; passed: boolean; score: number; response: string; reason: string }> }> | undefined}
                improvements={intelligenceResults?.improvements}
                isLoading={isRunningIntelligence}
              />

              {/* Visual Test Results */}
              <VisualTestResults
                summary={visualTestResults?.summary}
                results={visualTestResults?.results as Array<{ path: string; name: string; status: 'passed' | 'warning' | 'failed'; analysisMethod: string; issues: Array<{ type: 'layout' | 'visual' | 'responsive' | 'accessibility' | 'content' | 'performance'; severity: 'critical' | 'high' | 'medium' | 'low'; description: string; element?: string; suggestion: string }>; metrics: { htmlSize: number; loadTime: number; elementsCount: number; imagesCount: number; linksCount: number; formsCount: number } }> | undefined}
                aiAnalysis={visualTestResults?.aiAnalysis}
                isLoading={isRunningVisualTest}
              />
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      {/* Section 6: Reliability & AI Conversation Testing */}
      <Collapsible open={expandedSections.has('reliability')} onOpenChange={() => toggleSection('reliability')}>
        <Card className="border-cyan-500/20">
          <CollapsibleTrigger asChild>
            <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <Shield className="h-4 w-4 text-cyan-500" />
                  Reliability & AI Conversation Tests
                  {(crashTestResults?.summary || conversationResults?.summary) && (
                    <Badge variant="secondary" className="ml-2">
                      {crashTestResults?.summary ? `Crash: ${crashTestResults.summary.crashRate}` : ''} 
                      {crashTestResults?.summary && conversationResults?.summary ? ' • ' : ''}
                      {conversationResults?.summary ? `AI: ${conversationResults.summary.overallScore}%` : ''}
                    </Badge>
                  )}
                </CardTitle>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={(e) => { e.stopPropagation(); runCrashTester(); }}
                    disabled={isRunningCrashTest}
                    className="text-xs"
                  >
                    {isRunningCrashTest ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Zap className="h-3 w-3 mr-1" />}
                    Crash Tests
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={(e) => { e.stopPropagation(); runConversationEvaluator(true); }}
                    disabled={isRunningConversation}
                    className="text-xs"
                  >
                    {isRunningConversation ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Brain className="h-3 w-3 mr-1" />}
                    AI Conversation
                  </Button>
                  {expandedSections.has('reliability') ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </div>
              </div>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent className="pt-0 space-y-6">
              {/* Crash Test Results */}
              <CrashTestResults
                summary={crashTestResults?.summary}
                byEndpoint={crashTestResults?.byEndpoint}
                byCategory={crashTestResults?.byCategory}
                failures={crashTestResults?.failures}
                isLoading={isRunningCrashTest}
              />

              {/* AI Conversation Results */}
              <AIConversationResults
                summary={conversationResults?.summary}
                byCategory={conversationResults?.byCategory}
                improvements={conversationResults?.improvements}
                sampleTranscripts={conversationResults?.sampleTranscripts}
                isLoading={isRunningConversation}
              />

              {/* Branding & Privacy Results - Extract from conversation results */}
              {conversationResults?.byCategory && (
                <BrandingPrivacyResults
                  branding={conversationResults.byCategory.branding}
                  privacy={conversationResults.byCategory.privacy}
                  isLoading={isRunningConversation}
                />
              )}

              {/* Eye Emotion Sync Results - Using explicit emotion data from evaluator */}
              <EmotionSyncResults
                syncRate={conversationResults?.emotionSyncRate ?? conversationResults?.byCategory?.emotion?.avgScore ?? 0}
                emotionTests={conversationResults?.emotionTestResults ?? []}
                emotionCoverage={conversationResults?.emotionCoverage ?? {}}
                isLoading={isRunningConversation}
              />

              {/* Personality Profile - Always show when conversation results exist */}
              <PersonalityProfile
                overallPersonalityScore={conversationResults?.byCategory?.personality?.avgScore ?? conversationResults?.summary?.overallScore ?? 0}
                traits={[
                  { name: 'Friendly', description: 'Warm and approachable', score: conversationResults?.byCategory?.personality?.results?.find(r => r.name.includes('Greeting'))?.score ?? conversationResults?.byCategory?.personality?.avgScore ?? 0 },
                  { name: 'Concise', description: 'Gets to the point', score: Math.min(100, (conversationResults?.summary?.overallScore ?? 0) + 5) },
                  { name: 'Empathetic', description: 'Shows understanding', score: conversationResults?.byCategory?.personality?.results?.find(r => r.name.includes('Frustration') || r.name.includes('Sad'))?.score ?? conversationResults?.byCategory?.personality?.avgScore ?? 0 },
                  { name: 'Professional', description: 'Accurate for technical topics', score: conversationResults?.byCategory?.personality?.results?.find(r => r.name.includes('Technical'))?.score ?? conversationResults?.summary?.overallScore ?? 0 },
                  { name: 'Playful', description: 'Light-hearted when appropriate', score: conversationResults?.byCategory?.personality?.results?.find(r => r.name.includes('Casual'))?.score ?? conversationResults?.byCategory?.personality?.avgScore ?? 0 },
                  { name: 'Supportive', description: 'Encouraging and helpful', score: conversationResults?.byCategory?.personality?.results?.find(r => r.name.includes('Support') || r.name.includes('Sad'))?.score ?? conversationResults?.byCategory?.personality?.avgScore ?? 0 }
                ]}
                isLoading={isRunningConversation}
              />
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      {/* Section 7: AI Improvements */}
      <Collapsible open={expandedSections.has('improvements')} onOpenChange={() => toggleSection('improvements')}>
        <Card>
          <CollapsibleTrigger asChild>
            <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <Activity className="h-4 w-4" />
                  AI Improvement Suggestions
                </CardTitle>
                {expandedSections.has('improvements') ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </div>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent className="pt-0">
              <AIImprovements />
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      {/* Section 6: Recent Activity (Collapsible) */}
      <Collapsible open={expandedSections.has('activity')} onOpenChange={() => toggleSection('activity')}>
        <Card>
          <CollapsibleTrigger asChild>
            <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  Recent Activity
                </CardTitle>
                <div className="flex items-center gap-2">
                  <Badge variant="outline">{testRuns.length} runs</Badge>
                  {expandedSections.has('activity') ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </div>
              </div>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent className="pt-0">
              {testRuns.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Database className="h-10 w-10 mx-auto mb-2 opacity-50" />
                  <p>No test runs yet</p>
                  <Button onClick={() => runTests('api', setRunningApiTests)} className="mt-3" size="sm" disabled={runningApiTests}>
                    <Play className="h-3 w-3 mr-1" /> Run First Test
                  </Button>
                </div>
              ) : (
                <ScrollArea className="h-[250px]">
                  <div className="space-y-2">
                    {testRuns.slice(0, 10).map((run) => (
                      <div
                        key={run.id}
                        className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/30 transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          {(run.passed_tests ?? 0) === (run.total_tests ?? 0) ? (
                            <CheckCircle className="h-4 w-4 text-green-500" />
                          ) : (run.failed_tests ?? 0) > 0 ? (
                            <XCircle className="h-4 w-4 text-red-500" />
                          ) : (
                            <AlertTriangle className="h-4 w-4 text-yellow-500" />
                          )}
                          <div>
                            <p className="font-medium text-sm">{run.run_name}</p>
                            <p className="text-xs text-muted-foreground">
                              {new Date(run.created_at).toLocaleString()}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="text-right">
                            <p className="text-sm font-medium">{run.passed_tests ?? 0}/{run.total_tests ?? 0}</p>
                            <p className="text-xs text-muted-foreground">
                              {((run.duration_ms ?? 0) / 1000).toFixed(1)}s
                            </p>
                          </div>
                          <Progress 
                            value={((run.passed_tests ?? 0) / (run.total_tests || 1)) * 100} 
                            className="w-16 h-2"
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      {/* Section 7: OWASP Detailed Report (Collapsible) */}
      <Collapsible open={expandedSections.has('owasp')} onOpenChange={() => toggleSection('owasp')}>
        <CollapsibleTrigger asChild>
          <div className="cursor-pointer">
            <Card className="hover:bg-muted/30 transition-colors">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Shield className="h-4 w-4 text-orange-500" />
                    OWASP Security Details
                  </CardTitle>
                  {expandedSections.has('owasp') ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </div>
              </CardHeader>
            </Card>
          </div>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="mt-2">
            <OWASPSecurityReport />
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
};

export default TestResultsDashboard;
