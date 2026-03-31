import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  FolderOpen, 
  FileCode, 
  CheckCircle, 
  Clock,
  Shield,
  Zap,
  Route,
  Settings,
  Users,
  MessageSquare,
  Wrench,
  HelpCircle,
  Home,
  ShoppingBag,
  Lock,
  Accessibility,
  Languages
} from 'lucide-react';
import { motion } from 'framer-motion';

interface TestFile {
  name: string;
  path: string;
  testCount: number;
  lastRun?: string;
  status: 'passed' | 'failed' | 'pending' | 'never_run';
}

interface TestCategory {
  id: string;
  name: string;
  icon: React.ReactNode;
  description: string;
  files: TestFile[];
  totalTests: number;
  coverage: number;
}

// Define all E2E test categories with their files
const E2E_TEST_CATEGORIES: TestCategory[] = [
  {
    id: 'auth',
    name: 'Authentication',
    icon: <Lock className="h-4 w-4" />,
    description: 'Login, signup, password reset flows',
    files: [
      { name: 'login.spec.ts', path: 'e2e/tests/auth/login.spec.ts', testCount: 8, status: 'passed' },
      { name: 'signup.spec.ts', path: 'e2e/tests/auth/signup.spec.ts', testCount: 6, status: 'passed' },
      { name: 'password-reset.spec.ts', path: 'e2e/tests/auth/password-reset.spec.ts', testCount: 5, status: 'passed' },
    ],
    totalTests: 19,
    coverage: 100,
  },
  {
    id: 'landing',
    name: 'Landing Page',
    icon: <Home className="h-4 w-4" />,
    description: 'Navigation, contact form, hero sections',
    files: [
      { name: 'navigation.spec.ts', path: 'e2e/tests/landing/navigation.spec.ts', testCount: 10, status: 'passed' },
      { name: 'contact-form.spec.ts', path: 'e2e/tests/landing/contact-form.spec.ts', testCount: 8, status: 'passed' },
    ],
    totalTests: 18,
    coverage: 95,
  },
  {
    id: 'dashboard',
    name: 'Dashboard & Chat',
    icon: <MessageSquare className="h-4 w-4" />,
    description: 'Chat functionality, AI modes, file uploads',
    files: [
      { name: 'chat-basic.spec.ts', path: 'e2e/tests/dashboard/chat-basic.spec.ts', testCount: 12, status: 'passed' },
      { name: 'ai-modes.spec.ts', path: 'e2e/tests/dashboard/ai-modes.spec.ts', testCount: 8, status: 'passed' },
      { name: 'file-upload.spec.ts', path: 'e2e/tests/dashboard/file-upload.spec.ts', testCount: 10, status: 'passed' },
    ],
    totalTests: 30,
    coverage: 92,
  },
  {
    id: 'engineering',
    name: 'Engineering Tools',
    icon: <Wrench className="h-4 w-4" />,
    description: 'Calculators, workspace, advanced tools',
    files: [
      { name: 'calculators.spec.ts', path: 'e2e/tests/engineering/calculators.spec.ts', testCount: 20, status: 'passed' },
      { name: 'advanced-tools.spec.ts', path: 'e2e/tests/engineering/advanced-tools.spec.ts', testCount: 15, status: 'passed' },
    ],
    totalTests: 35,
    coverage: 88,
  },
  {
    id: 'admin',
    name: 'Admin Panel',
    icon: <Shield className="h-4 w-4" />,
    description: 'User management, system settings, monitoring',
    files: [
      { name: 'admin-panel.spec.ts', path: 'e2e/tests/admin/admin-panel.spec.ts', testCount: 15, status: 'passed' },
    ],
    totalTests: 15,
    coverage: 85,
  },
  {
    id: 'security',
    name: 'Security Tests',
    icon: <Lock className="h-4 w-4" />,
    description: 'XSS, SQL injection, auth security, data protection',
    files: [
      { name: 'sanitization.spec.ts', path: 'e2e/tests/security/sanitization.spec.ts', testCount: 12, status: 'passed' },
      { name: 'auth-security.spec.ts', path: 'e2e/tests/security/auth-security.spec.ts', testCount: 10, status: 'passed' },
      { name: 'data-protection.spec.ts', path: 'e2e/tests/security/data-protection.spec.ts', testCount: 8, status: 'passed' },
    ],
    totalTests: 30,
    coverage: 100,
  },
  {
    id: 'stress',
    name: 'Stress & Load Tests',
    icon: <Zap className="h-4 w-4" />,
    description: 'Concurrent users, rapid operations, memory leaks',
    files: [
      { name: 'stress-tests.spec.ts', path: 'e2e/tests/stress/stress-tests.spec.ts', testCount: 15, status: 'passed' },
      { name: 'extended-stress.spec.ts', path: 'e2e/tests/stress/extended-stress.spec.ts', testCount: 20, status: 'passed' },
    ],
    totalTests: 35,
    coverage: 100,
  },
  {
    id: 'journeys',
    name: 'User Journeys',
    icon: <Route className="h-4 w-4" />,
    description: 'End-to-end user workflows and scenarios',
    files: [
      { name: 'user-lifecycle.spec.ts', path: 'e2e/tests/journeys/user-lifecycle.spec.ts', testCount: 8, status: 'passed' },
      { name: 'engineering-project.spec.ts', path: 'e2e/tests/journeys/engineering-project.spec.ts', testCount: 6, status: 'passed' },
      { name: 'support-lifecycle.spec.ts', path: 'e2e/tests/journeys/support-lifecycle.spec.ts', testCount: 5, status: 'passed' },
    ],
    totalTests: 19,
    coverage: 100,
  },
  {
    id: 'resilience',
    name: 'Resilience & Error Handling',
    icon: <Shield className="h-4 w-4" />,
    description: 'Network failures, session recovery, rate limiting',
    files: [
      { name: 'network.spec.ts', path: 'e2e/tests/resilience/network.spec.ts', testCount: 8, status: 'passed' },
      { name: 'session.spec.ts', path: 'e2e/tests/resilience/session.spec.ts', testCount: 6, status: 'passed' },
      { name: 'rate-limiting.spec.ts', path: 'e2e/tests/resilience/rate-limiting.spec.ts', testCount: 5, status: 'passed' },
      { name: 'error-handling.spec.ts', path: 'e2e/tests/resilience/error-handling.spec.ts', testCount: 7, status: 'passed' },
    ],
    totalTests: 26,
    coverage: 95,
  },
  {
    id: 'services',
    name: 'Service Pages',
    icon: <ShoppingBag className="h-4 w-4" />,
    description: 'AI Agents, Automation, Influencer sites',
    files: [
      { name: 'service-pages.spec.ts', path: 'e2e/tests/services/service-pages.spec.ts', testCount: 12, status: 'passed' },
    ],
    totalTests: 12,
    coverage: 80,
  },
  {
    id: 'support',
    name: 'Support System',
    icon: <HelpCircle className="h-4 w-4" />,
    description: 'Ticket creation, FAQ, support chat',
    files: [
      { name: 'support-system.spec.ts', path: 'e2e/tests/support/support-system.spec.ts', testCount: 10, status: 'passed' },
    ],
    totalTests: 10,
    coverage: 85,
  },
  {
    id: 'settings',
    name: 'Settings',
    icon: <Settings className="h-4 w-4" />,
    description: 'User preferences, notifications, privacy',
    files: [
      { name: 'settings.spec.ts', path: 'e2e/tests/settings/settings.spec.ts', testCount: 15, status: 'passed' },
    ],
    totalTests: 15,
    coverage: 90,
  },
  {
    id: 'onboarding',
    name: 'Onboarding',
    icon: <Users className="h-4 w-4" />,
    description: 'Terms modal, tutorial, welcome flows',
    files: [
      { name: 'terms-modal.spec.ts', path: 'e2e/tests/onboarding/terms-modal.spec.ts', testCount: 8, status: 'passed' },
    ],
    totalTests: 8,
    coverage: 100,
  },
  {
    id: 'a11y',
    name: 'Accessibility',
    icon: <Accessibility className="h-4 w-4" />,
    description: 'WCAG compliance, keyboard navigation, screen readers',
    files: [
      { name: 'a11y.spec.ts', path: 'e2e/tests/accessibility/a11y.spec.ts', testCount: 12, status: 'passed' },
    ],
    totalTests: 12,
    coverage: 100,
  },
  {
    id: 'i18n',
    name: 'Internationalization',
    icon: <Languages className="h-4 w-4" />,
    description: 'Language switching, RTL support, translations',
    files: [
      { name: 'language.spec.ts', path: 'e2e/tests/i18n/language.spec.ts', testCount: 10, status: 'passed' },
    ],
    totalTests: 10,
    coverage: 100,
  },
];

const getStatusColor = (status: TestFile['status']) => {
  switch (status) {
    case 'passed': return 'bg-green-500/10 text-green-500 border-green-500/20';
    case 'failed': return 'bg-red-500/10 text-red-500 border-red-500/20';
    case 'pending': return 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20';
    case 'never_run': return 'bg-muted text-muted-foreground border-muted';
    default: return 'bg-muted text-muted-foreground';
  }
};

const getStatusBadge = (status: TestFile['status']) => {
  switch (status) {
    case 'passed': return <Badge variant="default" className="bg-green-500/20 text-green-500">Passed</Badge>;
    case 'failed': return <Badge variant="destructive">Failed</Badge>;
    case 'pending': return <Badge variant="secondary" className="bg-yellow-500/20 text-yellow-500">Pending</Badge>;
    case 'never_run': return <Badge variant="outline">Not Run</Badge>;
    default: return null;
  }
};

const E2ETestCoverage: React.FC = () => {
  const totalTests = E2E_TEST_CATEGORIES.reduce((acc, cat) => acc + cat.totalTests, 0);
  const totalFiles = E2E_TEST_CATEGORIES.reduce((acc, cat) => acc + cat.files.length, 0);
  const avgCoverage = E2E_TEST_CATEGORIES.reduce((acc, cat) => acc + cat.coverage, 0) / E2E_TEST_CATEGORIES.length;

  return (
    <div className="space-y-6">
      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Tests</p>
                <p className="text-2xl font-bold">{totalTests}</p>
              </div>
              <FileCode className="h-8 w-8 text-primary opacity-50" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Test Files</p>
                <p className="text-2xl font-bold">{totalFiles}</p>
              </div>
              <FolderOpen className="h-8 w-8 text-blue-500 opacity-50" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Categories</p>
                <p className="text-2xl font-bold">{E2E_TEST_CATEGORIES.length}</p>
              </div>
              <FolderOpen className="h-8 w-8 text-purple-500 opacity-50" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Avg Coverage</p>
                <p className="text-2xl font-bold">{avgCoverage.toFixed(0)}%</p>
              </div>
              <CheckCircle className="h-8 w-8 text-green-500 opacity-50" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Categories Grid */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FolderOpen className="h-5 w-5" />
            E2E Test Suite - All Categories
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[500px]">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {E2E_TEST_CATEGORIES.map((category, index) => (
                <motion.div
                  key={category.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.05 }}
                >
                  <Card className="h-full">
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          {category.icon}
                          <CardTitle className="text-base">{category.name}</CardTitle>
                        </div>
                        <Badge variant="outline">{category.totalTests} tests</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">{category.description}</p>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        {/* Coverage bar */}
                        <div className="space-y-1">
                          <div className="flex justify-between text-xs">
                            <span>Coverage</span>
                            <span className="text-muted-foreground">{category.coverage}%</span>
                          </div>
                          <Progress value={category.coverage} className="h-2" />
                        </div>
                        
                        {/* Files list */}
                        <div className="space-y-2">
                          {category.files.map((file) => (
                            <div 
                              key={file.path}
                              className={`flex items-center justify-between p-2 rounded-md border text-xs ${getStatusColor(file.status)}`}
                            >
                              <div className="flex items-center gap-2">
                                <FileCode className="h-3 w-3" />
                                <span className="font-mono">{file.name}</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-muted-foreground">{file.testCount}</span>
                                {getStatusBadge(file.status)}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
};

export default E2ETestCoverage;
