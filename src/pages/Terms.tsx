import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Shield, ArrowLeft, AlertTriangle, Globe, Mail, MapPin, Building } from 'lucide-react';
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

const WarningBox = ({ children }: { children: React.ReactNode }) => (
  <div className="flex items-center gap-2 p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg mb-4">
    <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0" />
    <p className="text-amber-400 font-medium text-sm">{children}</p>
  </div>
);

const Terms = () => {
  return (
    <>
      <SEO 
        title="Terms of Service - AYN"
        description="Read AYN's Terms of Service including acceptable use, payment terms, AI disclaimers, and limitation of liability."
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
                <Shield className="w-6 h-6 text-white/60" />
                <h1 className="text-3xl font-bold text-white tracking-tight">Terms of Service</h1>
              </div>
              <div className="flex justify-center gap-6 text-sm text-white/40 mb-6">
                <span><span className="text-white/60">Last Updated:</span> February 7, 2026</span>
                <span><span className="text-white/60">Effective:</span> February 7, 2026</span>
              </div>

              {/* Platform Info */}
              <div className="grid grid-cols-2 gap-3 max-w-md mx-auto text-xs text-white/50">
                <div className="flex items-center gap-2">
                  <Globe className="w-3.5 h-3.5 text-white/40" />
                  <span>aynn.io</span>
                </div>
                <div className="flex items-center gap-2">
                  <Building className="w-3.5 h-3.5 text-white/40" />
                  <span>AYN Team</span>
                </div>
                <div className="flex items-center gap-2">
                  <MapPin className="w-3.5 h-3.5 text-white/40" />
                  <span>Nova Scotia, Canada</span>
                </div>
                <div className="flex items-center gap-2">
                  <Mail className="w-3.5 h-3.5 text-white/40" />
                  <span>support@aynn.io</span>
                </div>
              </div>
            </div>

            {/* Acceptance Intro */}
            <div className="mb-10 p-4 bg-white/5 border border-white/10 rounded-lg">
              <p className="text-white/60 text-sm leading-relaxed">
                By accessing or using AYN ("the Platform"), you agree to be bound by these Terms of Service. 
                If you do not agree to these terms, you must not use the Platform. These terms constitute a 
                legally binding agreement between you and AYN.
              </p>
            </div>

            {/* Content */}
            <div className="space-y-10">
              {/* Section 1 */}
              <PolicySection number="1" title="DESCRIPTION OF SERVICE">
                <SubSection title="Platform Overview">
                  <p className="text-white/60">
                    AYN is an AI-powered platform providing business consulting, 
                    document analysis, and general AI assistance. The platform integrates multiple AI 
                    models to deliver intelligent responses across various domains.
                  </p>
                </SubSection>
                <SubSection title="Global Availability">
                  <p className="text-white/60">
                    AYN is available globally and is not restricted to any specific geographic region. 
                    Users from any country may access and use the platform subject to these terms and 
                    applicable local laws.
                  </p>
                </SubSection>
                <SubSection title="Service Availability">
                  <BulletList items={[
                    "We strive for 99.9% uptime but do not guarantee uninterrupted service",
                    "Scheduled maintenance will be communicated in advance when possible",
                    "Emergency maintenance may occur without prior notice",
                    "Service features may be added, modified, or removed at our discretion"
                  ]} />
                </SubSection>
              </PolicySection>

              {/* Section 2 */}
              <PolicySection number="2" title="USER ACCOUNTS & ELIGIBILITY">
                <SubSection title="Account Creation">
                  <BulletList items={[
                    "You must be at least 18 years old to create an account",
                    "You must provide accurate and complete registration information",
                    "One account per person; sharing accounts is prohibited",
                    "Business accounts must be created by authorized representatives"
                  ]} />
                </SubSection>
                <SubSection title="Account Security">
                  <BulletList items={[
                    "You are responsible for maintaining the confidentiality of your credentials",
                    "You must notify us immediately of any unauthorized access",
                    "We are not liable for losses due to unauthorized use of your account",
                    "We may require additional verification for security purposes"
                  ]} />
                </SubSection>
                <SubSection title="Account Suspension & Termination">
                  <p className="text-white/60">
                    We reserve the right to suspend or terminate accounts that violate these terms, 
                    engage in fraudulent activity, or pose a security risk to the platform or other users.
                  </p>
                </SubSection>
              </PolicySection>

              {/* Section 3 */}
              <PolicySection number="3" title="ACCEPTABLE USE POLICY">
                <SubSection title="Permitted Uses">
                  <BulletList items={[
                    "Business consulting and analysis",
                    "Document analysis and summarization",
                    "General AI-assisted research and productivity"
                  ]} />
                </SubSection>
                <SubSection title="Prohibited Uses">
                  <BulletList items={[
                    "Generating illegal, harmful, or abusive content",
                    "Attempting to bypass safety filters or usage limits",
                    "Reverse engineering, scraping, or automated access",
                    "Impersonating others or misrepresenting AI outputs as human-generated",
                    "Using the platform for spam, phishing, or malware distribution",
                    "Sharing account credentials or reselling access",
                    "Any use that violates applicable laws or regulations"
                  ]} />
                </SubSection>
                <SubSection title="Consequences">
                  <p className="text-white/60">
                    Violations may result in content removal, account suspension, permanent ban, 
                    or legal action at our sole discretion.
                  </p>
                </SubSection>
              </PolicySection>

              {/* Section 4 */}
              <PolicySection number="4" title="INTELLECTUAL PROPERTY">
                <SubSection title="AYN's Intellectual Property">
                  <p className="text-white/60">
                    The AYN platform, including its design, code, algorithms, branding, and documentation, 
                    is owned by AYN and protected by intellectual property laws. You may not copy, modify, 
                    or distribute any part of the platform without express written permission.
                  </p>
                </SubSection>
                <SubSection title="User Content">
                  <BulletList items={[
                    "You retain ownership of content you submit to AYN",
                    "You grant AYN a limited license to process your content for service delivery",
                    "You are responsible for ensuring you have rights to content you submit",
                    "We do not claim ownership of your inputs or uploaded documents"
                  ]} />
                </SubSection>
                <SubSection title="AI-Generated Content">
                  <BulletList items={[
                    "AI outputs are generated based on your inputs and AI model capabilities",
                    "You may use AI-generated outputs for your purposes, subject to these terms",
                    "AYN does not guarantee originality or non-infringement of AI outputs",
                    "You are responsible for reviewing and verifying all AI-generated content"
                  ]} />
                </SubSection>
              </PolicySection>

              {/* Section 5 */}
              <PolicySection number="5" title="PAYMENT TERMS">
                <SubSection title="Subscription Plans">
                  <BulletList items={[
                    "Free tier with limited daily usage",
                    "Paid subscription plans with enhanced features and higher limits",
                    "Plan details and pricing are available on our website",
                    "We reserve the right to modify pricing with 30 days' notice"
                  ]} />
                </SubSection>
                <SubSection title="Billing">
                  <BulletList items={[
                    "Payments are processed through secure third-party payment processors",
                    "Subscriptions auto-renew unless cancelled before the renewal date",
                    "You are responsible for keeping payment information current",
                    "Failed payments may result in service interruption"
                  ]} />
                </SubSection>
                <SubSection title="Refund Policy">
                  <WarningBox>All payments are final and non-refundable.</WarningBox>
                  <BulletList items={[
                    "All subscription fees (monthly and annual) are non-refundable",
                    "If you cancel, your subscription remains active until the end of the current billing period",
                    "No partial refunds are provided for unused time or credits",
                    "Exceptions may be made at AYN's sole discretion for verified billing errors only"
                  ]} />
                </SubSection>
                <SubSection title="Disputes">
                  <p className="text-white/60">
                    Billing disputes must be raised within 30 days of the charge. 
                    Contact support@aynn.io with your account details and transaction information.
                  </p>
                </SubSection>
                <SubSection title="Maximum Liability">
                  <p className="text-white/60">
                    In no event shall our total liability exceed the lesser of:
                  </p>
                  <BulletList items={[
                    "The amount you paid to AYN in the 12 months preceding any claim",
                    "$100 USD (or equivalent in your local currency)"
                  ]} />
                  <p className="text-white/60">
                    This limitation applies to all claims, whether based on warranty, contract, tort, 
                    or any other legal theory, and regardless of whether AYN has been advised of the 
                    possibility of such damages.
                  </p>
                </SubSection>
              </PolicySection>

              {/* Section 6 */}
              <PolicySection number="6" title="AI LIMITATIONS & DISCLAIMERS">
                <SubSection title="General AI Limitations">
                  <WarningBox>AYN is an artificial intelligence system with inherent limitations.</WarningBox>
                  <BulletList items={[
                    "AYN may produce inaccurate, incomplete, or inappropriate responses",
                    "AI outputs should be treated as suggestions, not definitive answers",
                    "AYN's knowledge has a training cutoff and may not reflect current events",
                    "Response quality may vary based on input quality and complexity"
                  ]} />
                </SubSection>
                <SubSection title="Not Professional Advice">
                  <BulletList items={[
                    "AYN does NOT provide professional advice (legal, medical, financial, etc.)",
                    "Users should NOT rely solely on AYN's outputs for critical or professional decisions",
                    "All AI-generated information must be independently verified by the user",
                    "Always consult qualified professionals for important decisions"
                  ]} />
                </SubSection>

                <SubSection title="PDF & Document Analysis">
                  <BulletList items={[
                    "Document analysis results are AI-generated interpretations",
                    "Extracted data should be verified against original documents",
                    "AYN is not responsible for misinterpretation of document contents",
                    "Sensitive documents are processed according to our Privacy Policy"
                  ]} />
                </SubSection>
              </PolicySection>

              {/* Section 7 */}
              <PolicySection number="7" title="LIMITATION OF LIABILITY">
                <SubSection title="As-Is Service">
                  <p className="text-white/60">
                    AYN is provided "AS IS" and "AS AVAILABLE" without warranties of any kind, 
                    whether express, implied, or statutory, including but not limited to warranties 
                    of merchantability, fitness for a particular purpose, and non-infringement.
                  </p>
                </SubSection>
                <SubSection title="No Consequential Damages">
                  <p className="text-white/60">
                    In no event shall AYN, its operators, affiliates, or partners be liable for any 
                    indirect, incidental, special, consequential, or punitive damages, including but 
                    not limited to loss of profits, data, use, goodwill, or other intangible losses.
                  </p>
                </SubSection>
                <SubSection title="Liability Cap">
                  <p className="text-white/60">
                    Our total liability for any claims arising from or related to these terms or the 
                    service shall not exceed the amount you paid to AYN in the twelve (12) months 
                    preceding the claim.
                  </p>
                </SubSection>
                <SubSection title="Indemnification">
                  <p className="text-white/60">
                    You agree to indemnify and hold harmless AYN and its operators from any claims, 
                    damages, or expenses arising from your use of the platform, violation of these 
                    terms, or infringement of any third-party rights.
                  </p>
                </SubSection>
              </PolicySection>

              {/* Section 8 */}
              <PolicySection number="8" title="DATA & PRIVACY">
                <p className="text-white/60">
                  Your use of AYN is also governed by our Privacy Policy, which describes how we collect, 
                  use, and protect your personal information. By using AYN, you consent to our data practices 
                  as described in the Privacy Policy.
                </p>
                <p className="text-white/60 mt-2">
                  <Link to="/privacy" className="text-white underline hover:text-white/80 transition-colors">
                    Read our full Privacy Policy →
                  </Link>
                </p>
              </PolicySection>

              {/* Section 9 */}
              <PolicySection number="9" title="SERVICE MODIFICATIONS & TERMINATION">
                <BulletList items={[
                  "We may modify, suspend, or discontinue any part of the service at any time",
                  "Material changes will be communicated with reasonable notice",
                  "You may terminate your account at any time through account settings",
                  "Upon termination, your right to use the service ceases immediately",
                  "We may retain certain data as required by law or legitimate business purposes",
                  "Provisions that by their nature should survive termination will survive"
                ]} />
              </PolicySection>

              {/* Section 10 */}
              <PolicySection number="10" title="DISPUTE RESOLUTION">
                <SubSection title="Governing Law">
                  <p className="text-white/60">
                    These terms are governed by the laws of the Province of Nova Scotia, Canada, 
                    without regard to conflict of law principles.
                  </p>
                </SubSection>
                <SubSection title="Jurisdiction">
                  <p className="text-white/60">
                    Any disputes arising from these terms or your use of AYN shall be subject to the 
                    exclusive jurisdiction of the courts located in Nova Scotia, Canada.
                  </p>
                </SubSection>
                <SubSection title="Arbitration">
                  <p className="text-white/60">
                    For disputes under $10,000 CAD, we encourage resolution through informal negotiation 
                    first. If unresolved, disputes may be submitted to binding arbitration in accordance 
                    with applicable Canadian arbitration rules.
                  </p>
                </SubSection>
                <SubSection title="Class Action Waiver">
                  <p className="text-white/60">
                    You agree to resolve disputes individually and waive any right to participate in a 
                    class action, collective action, or representative proceeding.
                  </p>
                </SubSection>
              </PolicySection>

              {/* Section 11 */}
              <PolicySection number="11" title="MISCELLANEOUS">
                <BulletList items={[
                  "Entire Agreement: These terms, together with the Privacy Policy, constitute the entire agreement between you and AYN",
                  "Severability: If any provision is found unenforceable, the remaining provisions remain in effect",
                  "No Waiver: Failure to enforce any right does not constitute a waiver of that right",
                  "Assignment: We may assign our rights and obligations; you may not without our consent",
                  "Force Majeure: We are not liable for failures due to circumstances beyond our reasonable control",
                  "Updates: We may update these terms; continued use after changes constitutes acceptance"
                ]} />
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
                <Link to="/privacy" className="text-sm text-white/50 hover:text-white transition-colors">
                  Privacy Policy
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

export default Terms;
