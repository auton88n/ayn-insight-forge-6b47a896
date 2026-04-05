import { corsHeaders as getCorsHeadersFn } from '../_shared/cors.ts';

// corsHeaders: static fallback using primary origin (from _shared/cors.ts)
const corsHeaders = getCorsHeadersFn({ headers: new Headers() } as Request);

interface TestScenario {
  name: string;
  description: string;
  steps: string[];
  expectedResult: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  category: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { feature, coverageType = 'comprehensive' } = await req.json();

    const scenarios = generateTestScenarios(feature, coverageType);

    return new Response(JSON.stringify({ success: true, scenarios, generatedAt: new Date().toISOString() }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

function generateTestScenarios(feature: string, coverageType: string): TestScenario[] {
  const scenarios: Record<string, TestScenario[]> = {
    authentication: [
      { name: 'Valid Login', description: 'User logs in with valid credentials', steps: ['Open auth modal', 'Enter valid email', 'Enter valid password', 'Click submit'], expectedResult: 'User is logged in and redirected to dashboard', severity: 'critical', category: 'auth' },
      { name: 'Invalid Credentials', description: 'User attempts login with wrong password', steps: ['Open auth modal', 'Enter valid email', 'Enter wrong password', 'Click submit'], expectedResult: 'Error message is displayed', severity: 'critical', category: 'auth' },
      { name: 'SQL Injection Attempt', description: 'Attempt SQL injection in login', steps: ['Enter "\'; DROP TABLE users; --" as email'], expectedResult: 'Input is sanitized, no error', severity: 'critical', category: 'security' },
      { name: 'XSS Prevention', description: 'Attempt XSS in input fields', steps: ['Enter "<script>alert(1)</script>" in name field'], expectedResult: 'Script is escaped or rejected', severity: 'critical', category: 'security' },
    ],
    engineering: [
      { name: 'Beam Calculation', description: 'Calculate beam with standard inputs', steps: ['Select beam calculator', 'Enter span: 6m', 'Enter load: 20 kN/m', 'Click calculate'], expectedResult: 'Valid results with reinforcement details', severity: 'high', category: 'calculator' },
      { name: 'Edge Case: Max Span', description: 'Test maximum span beam', steps: ['Enter span: 20m', 'Calculate'], expectedResult: 'Handles gracefully or shows warning', severity: 'medium', category: 'calculator' },
      { name: 'Invalid Input Handling', description: 'Enter negative values', steps: ['Enter span: -5', 'Click calculate'], expectedResult: 'Validation error shown', severity: 'high', category: 'validation' },
      { name: 'Rapid Calculations', description: 'Run 100 calculations quickly', steps: ['Click calculate 100 times rapidly'], expectedResult: 'No crashes, handles rate limiting', severity: 'high', category: 'stress' },
    ],
    chat: [
      { name: 'Basic Message', description: 'Send simple greeting', steps: ['Type "Hello"', 'Press Enter'], expectedResult: 'AI responds appropriately', severity: 'critical', category: 'chat' },
      { name: 'Arabic Language', description: 'Send Arabic message', steps: ['Type "مرحبا"', 'Send'], expectedResult: 'AI responds in Arabic', severity: 'high', category: 'i18n' },
      { name: 'Long Message', description: 'Send 10000 character message', steps: ['Enter very long text', 'Send'], expectedResult: 'Handled gracefully', severity: 'medium', category: 'stress' },
      { name: 'Empty Message', description: 'Attempt to send empty', steps: ['Clear input', 'Click send'], expectedResult: 'Prevented or handled', severity: 'low', category: 'validation' },
    ],
  };

  return scenarios[feature] || [
    { name: `${feature} Basic Test`, description: `Basic functionality test for ${feature}`, steps: ['Navigate to feature', 'Perform basic action'], expectedResult: 'Feature works correctly', severity: 'medium', category: feature },
  ];
}
