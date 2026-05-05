import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Lock, ArrowLeft, Mail } from 'lucide-react';
import { SEO } from '@/components/shared/SEO';

const PolicySection = ({ number, title, children }: { number: string; title: string; children: React.ReactNode }) => (
  <div className="space-y-4" id={`section-${number}`}>
    <div className="flex items-center gap-3">
      <span className="w-8 h-8 rounded-full bg-white/10 border border-white/20 flex items-center justify-center text-sm font-bold text-white/80">
        {number}
      </span>
      <h3 className="text-lg font-semibold text-white tracking-wide">{title}</h3>
    </div>
    <div className="pl-11 space-y-4 text-white/70 text-sm leading-relaxed">
      {children}
    </div>
  </div>
);

const SubSection = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div className="space-y-2">
    <h4 className="text-white/90 font-medium">{title}</h4>
    {children}
  </div>
);

const BulletList = ({ items }: { items: string[] }) => (
  <ul className="space-y-2 pl-4 border-l-2 border-white/10">
    {items.map((item, i) => (
      <li key={i} className="text-white/60">• {item}</li>
    ))}
  </ul>
);

const Privacy = () => {
  return (
    <>
      <SEO 
        title="Privacy Policy - AYN"
        description="Learn how AYN collects, uses, and protects your personal information. Read our comprehensive privacy policy."
      />
      
      <div className="min-h-screen bg-background py-12 px-4">
        <div className="max-w-3xl mx-auto">
          <div className="mb-8">
            <Link to="/">
              <Button variant="ghost" className="text-white/60 hover:text-white hover:bg-white/10 mb-6">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Home
              </Button>
            </Link>
          </div>
          
          <Card className="bg-neutral-900/80 border border-white/10 backdrop-blur-xl p-8 md:p-12">
            {/* Title */}
            <div className="text-center mb-10 pb-8 border-b border-white/10">
              <div className="flex items-center justify-center gap-3 mb-4">
                <Lock className="w-6 h-6 text-white/60" />
                <h1 className="text-3xl font-bold text-white tracking-tight">Privacy Policy</h1>
              </div>
              <div className="flex justify-center gap-6 text-sm text-white/40 mb-4">
                <span><span className="text-white/60">Last Updated:</span> February 7, 2026</span>
                <span><span className="text-white/60">Effective:</span> February 7, 2026</span>
              </div>
              <p className="text-white/50 max-w-md mx-auto">
                Your privacy matters to us. This policy explains how we handle your data.
              </p>
            </div>

            {/* Content */}
            <div className="space-y-10">
              {/* Section 12 */}
              <PolicySection number="12" title="INFORMATION WE COLLECT">
                <p className="text-white/50 mb-4">We collect only what is necessary to operate and improve AYN.</p>
                
                <SubSection title="Information You Provide">
                  <BulletList items={[
                    "Email address and account credentials",
                    "Optional profile information (company name, business type, contact person)",
                    "Messages, prompts, and files you submit for AI processing",
                    "Feedback, ratings, and support requests",
                    "Payment information (processed by third-party providers)"
                  ]} />
                </SubSection>

                <SubSection title="Information Collected Automatically">
                  <BulletList items={[
                    "Conversation data and AI responses for session continuity",
                    "Language and usage preferences",
                    "Device type, browser, operating system, and screen resolution",
                    "General location data (city/country level via IP address)",
                    "Session activity, timestamps, and performance metrics",
                    "Error logs and diagnostic data"
                  ]} />
                </SubSection>

                <SubSection title="Cookies & Similar Technologies">
                  <p className="text-white/60">
                    We use essential cookies for authentication, session management, and security. 
                    See Section 19 for full cookie details.
                  </p>
                </SubSection>

                <SubSection title="AI Service Providers">
                  <p className="text-white/60 mb-2">
                    When you use AYN, your prompts are processed by third-party AI providers including:
                  </p>
                  <BulletList items={[
                    "OpenAI (GPT models)",
                    "Anthropic (Claude models)",
                    "Google (Gemini models)"
                  ]} />
                  <p className="text-white/50 mt-2">
                    Each provider has their own data handling policies. We send only the minimum data 
                    necessary to generate responses.
                  </p>
                </SubSection>
              </PolicySection>

              {/* Section 13 */}
              <PolicySection number="13" title="HOW WE USE YOUR INFORMATION">
                <SubSection title="Service Operation">
                  <BulletList items={[
                    "Provide and operate AYN's AI-powered services",
                    "Generate AI responses and maintain conversation context",
                    "Process payments and manage subscriptions"
                  ]} />
                </SubSection>
                <SubSection title="Improvement">
                  <BulletList items={[
                    "Improve platform performance, features, and reliability",
                    "Analyze usage patterns to enhance user experience",
                    "Develop new features and services"
                  ]} />
                </SubSection>
                <SubSection title="Security">
                  <BulletList items={[
                    "Protect against fraud, abuse, and security threats",
                    "Monitor for unauthorized access and suspicious activity",
                    "Enforce our Terms of Service and Acceptable Use Policy"
                  ]} />
                </SubSection>
                <SubSection title="Communications">
                  <BulletList items={[
                    "Send service-related notifications and updates",
                    "Respond to support requests and inquiries",
                    "Provide important account and security alerts"
                  ]} />
                </SubSection>
                <SubSection title="Legal Compliance">
                  <p className="text-white/60">
                    Comply with applicable laws, regulations, and legal processes.
                  </p>
                </SubSection>
              </PolicySection>

              {/* Section 14 */}
              <PolicySection number="14" title="INFORMATION SHARING & DISCLOSURE">
                <p className="text-white/50 mb-3 font-medium">We do not sell your personal data.</p>
                <SubSection title="Service Providers">
                  <p className="text-white/60 mb-2">
                    We share limited information with trusted service providers necessary to operate AYN:
                  </p>
                  <BulletList items={[
                    "AI providers (OpenAI, Anthropic, Google) for processing requests",
                    "Supabase for database and authentication infrastructure",
                    "Payment processors for secure transaction handling",
                    "Cloud hosting providers for infrastructure",
                    "Analytics services for performance monitoring"
                  ]} />
                </SubSection>
                <SubSection title="Legal Requirements">
                  <p className="text-white/60">
                    We may disclose information when required by law, court order, or government 
                    request, or to protect the rights, property, or safety of AYN, our users, or others.
                  </p>
                </SubSection>
                <SubSection title="Business Transfers">
                  <p className="text-white/60">
                    In the event of a merger, acquisition, or sale of assets, your information may be 
                    transferred. We will notify users of any such change.
                  </p>
                </SubSection>
                <SubSection title="Aggregated Data">
                  <p className="text-white/60">
                    We may share anonymized, aggregated data that cannot identify individual users 
                    for research or business purposes.
                  </p>
                </SubSection>
              </PolicySection>

              {/* Section 15 */}
              <PolicySection number="15" title="DATA SECURITY">
                <BulletList items={[
                  "Encryption: Data encrypted in transit (TLS/SSL) and at rest",
                  "Access Controls: Role-based access with principle of least privilege",
                  "Monitoring: Continuous security monitoring and threat detection",
                  "Development Practices: Secure coding standards and regular security reviews",
                  "Incident Response: Established procedures for security incident handling"
                ]} />
                <p className="text-white/50 mt-3">
                  While no system can be guaranteed 100% secure, protecting your data is a top priority. 
                  We continuously improve our security practices to meet modern standards.
                </p>
              </PolicySection>

              {/* Section 16 */}
              <PolicySection number="16" title="DATA RETENTION & DELETION">
                <SubSection title="Retention Periods">
                  <BulletList items={[
                    "Account data: Retained while your account is active",
                    "Conversation history: Retained until deleted by user or account closure",
                    "Payment records: Retained as required by tax and financial regulations",
                    "Security logs: Retained for up to 12 months",
                    "Analytics data: Aggregated and anonymized after 90 days"
                  ]} />
                </SubSection>
                <SubSection title="Your Deletion Rights">
                  <BulletList items={[
                    "Delete individual conversations at any time from your dashboard",
                    "Delete your entire account through account settings",
                    "Request data deletion by contacting support@aynn.io",
                    "Most data is removed within 30 days of deletion request",
                    "Some data may be retained to meet legal or security requirements"
                  ]} />
                </SubSection>
              </PolicySection>

              {/* Section 17 */}
              <PolicySection number="17" title="YOUR PRIVACY RIGHTS">
                <BulletList items={[
                  "Access: Request a copy of the personal data we hold about you",
                  "Correction: Request correction of inaccurate or incomplete data",
                  "Deletion: Request deletion of your personal data",
                  "Objection: Object to certain processing of your data",
                  "Withdrawal: Withdraw consent for optional data processing at any time"
                ]} />
                <SubSection title="Exercising Your Rights">
                  <p className="text-white/60">
                    To exercise any of these rights, contact us at support@aynn.io. We will respond 
                    to verified requests within 30 days.
                  </p>
                </SubSection>
              </PolicySection>

              {/* Section 18 */}
              <PolicySection number="18" title="INTERNATIONAL DATA TRANSFERS">
                <SubSection title="Cross-Border Processing">
                  <p className="text-white/60">
                    Your data may be processed in countries other than your country of residence, 
                    including Canada, the United States, and other jurisdictions where our service 
                    providers operate.
                  </p>
                </SubSection>
                <SubSection title="Safeguards">
                  <p className="text-white/60">
                    We ensure appropriate safeguards are in place for international transfers, including 
                    standard contractual clauses and compliance with applicable data protection frameworks.
                  </p>
                </SubSection>
                <SubSection title="Consent">
                  <p className="text-white/60">
                    By using AYN, you consent to the transfer and processing of your data in these jurisdictions.
                  </p>
                </SubSection>
              </PolicySection>

              {/* Section 19 */}
              <PolicySection number="19" title="COOKIES & TRACKING">
                <SubSection title="Types of Cookies We Use">
                  <BulletList items={[
                    "Essential: Required for authentication, security, and basic functionality",
                    "Functional: Remember your preferences and settings (language, theme)",
                    "Analytics: Help us understand usage patterns and improve the platform"
                  ]} />
                </SubSection>
                <SubSection title="Cookie Management">
                  <p className="text-white/60">
                    You can manage cookies through your browser settings. Disabling essential cookies 
                    may affect platform functionality. We do not use advertising or third-party tracking cookies.
                  </p>
                </SubSection>
                <SubSection title="Do Not Track">
                  <p className="text-white/60">
                    We respect Do Not Track (DNT) browser signals where technically feasible.
                  </p>
                </SubSection>
              </PolicySection>

              {/* Section 20 */}
              <PolicySection number="20" title="CHILDREN'S PRIVACY">
                <BulletList items={[
                  "AYN is intended for users aged 18 and older",
                  "We do not knowingly collect data from children under 18",
                  "If we discover we have collected data from a child, we will delete it promptly",
                  "Parents or guardians who believe their child has provided data may contact us for removal"
                ]} />
              </PolicySection>

              {/* Section 21 */}
              <PolicySection number="21" title="REGIONAL PRIVACY LAWS">
                <SubSection title="Canada (PIPEDA)">
                  <p className="text-white/60">
                    We comply with the Personal Information Protection and Electronic Documents Act. 
                    Canadian users may file complaints with the Office of the Privacy Commissioner of Canada.
                  </p>
                </SubSection>
                <SubSection title="European Union (GDPR)">
                  <p className="text-white/60">
                    EU residents have additional rights under the General Data Protection Regulation, 
                    including the right to data portability and the right to lodge a complaint with a 
                    supervisory authority.
                  </p>
                </SubSection>
                <SubSection title="California (CCPA)">
                  <p className="text-white/60">
                    California residents have the right to know what personal information is collected, 
                    request deletion, and opt out of the sale of personal information. We do not sell 
                    personal information.
                  </p>
                </SubSection>
                <SubSection title="Other Jurisdictions">
                  <p className="text-white/60">
                    We endeavor to comply with applicable data protection laws in all jurisdictions where 
                    we operate. Contact us if you have questions about regional privacy rights.
                  </p>
                </SubSection>
              </PolicySection>

              {/* Section 22 */}
              <PolicySection number="22" title="PRIVACY POLICY UPDATES">
                <BulletList items={[
                  "We may update this Privacy Policy from time to time",
                  "Material changes will be communicated via email or platform notification",
                  "The effective date at the top indicates when the latest changes took effect",
                  "Continued use of AYN after changes constitutes acceptance",
                  "Previous versions may be requested by contacting support"
                ]} />
              </PolicySection>

              {/* Section 23 */}
              <PolicySection number="23" title="CONTACT INFORMATION">
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Mail className="w-4 h-4 text-white/40" />
                    <p className="text-white/60">
                      <strong className="text-white/80">General Support:</strong> support@aynn.io
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Mail className="w-4 h-4 text-white/40" />
                    <p className="text-white/60">
                      <strong className="text-white/80">Data Protection Officer:</strong> dpo@aynn.io
                    </p>
                  </div>
                </div>
                <p className="text-white/50 mt-3">
                  You also have the right to lodge complaints with your local data protection regulatory authority.
                </p>
              </PolicySection>

              {/* Section 24 */}
              <PolicySection number="24" title="ACKNOWLEDGMENT & ACCEPTANCE">
                <p className="text-white/60">
                  By using AYN, you acknowledge that you have read, understood, and agree to this Privacy Policy. 
                  If you do not agree with any part of this policy, you should discontinue use of the platform.
                </p>
              </PolicySection>
            </div>

            {/* Version Block */}
            <div className="mt-10 p-4 bg-white/5 border border-white/10 rounded-lg text-center">
              <p className="text-white/40 text-xs">
                Document Version: 2.0 · Effective: February 7, 2026 · AYN Platform
              </p>
            </div>

            {/* Footer */}
            <div className="mt-8 pt-8 border-t border-white/10 text-center">
              <p className="text-white/30 text-sm">© 2026 AYN. All rights reserved.</p>
              <div className="mt-4 flex justify-center gap-4">
                <Link to="/terms" className="text-sm text-white/50 hover:text-white transition-colors">
                  Terms of Service
                </Link>
                <span className="text-white/20">•</span>
                <Link to="/#contact" className="text-sm text-white/50 hover:text-white transition-colors">
                  Contact Us
                </Link>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </>
  );
};

export default Privacy;
