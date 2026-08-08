import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Shield, AlertTriangle } from 'lucide-react';

interface TermsModalProps {
  open: boolean;
  onAccept: (consent: { privacy: boolean; terms: boolean; aiDisclaimer: boolean }) => void;
}

const SummarySection = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div className="space-y-2">
    <h3 className="font-semibold text-white text-sm tracking-wide">{title}</h3>
    <div className="text-white/60 text-sm leading-relaxed space-y-1.5">
      {children}
    </div>
  </div>
);

const BulletList = ({ items }: { items: string[] }) => (
  <ul className="space-y-1 pl-3 border-l border-white/10">
    {items.map((item, i) => (
      <li key={i} className="text-white/55 text-xs">• {item}</li>
    ))}
  </ul>
);

export const TermsModal = ({ open, onAccept }: TermsModalProps) => {
  const [hasRead, setHasRead] = useState(false);
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [acceptAI, setAcceptAI] = useState(false);

  const handleAccept = () => {
    if (hasRead && acceptTerms && acceptAI) {
      onAccept({ privacy: hasRead, terms: acceptTerms, aiDisclaimer: acceptAI });
    }
  };

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] z-[9999] bg-neutral-950 border border-white/20 backdrop-blur-xl p-0 overflow-hidden flex flex-col">
        <DialogDescription className="sr-only">
          Review and accept AYN's Privacy Policy and Terms of Service to continue using the platform.
        </DialogDescription>
        {/* Header */}
        <div className="text-center pt-8 pb-4 px-6 border-b border-white/10">
          <div className="flex items-center justify-center gap-2 mb-3">
            <Shield className="w-5 h-5 text-white/60" />
            <h2 className="text-2xl font-bold text-white tracking-tight">PRIVACY POLICY & TERMS OF SERVICE</h2>
          </div>
          <div className="flex justify-center gap-6 text-xs text-white/40 mb-4">
            <span><span className="text-white/60">Last Updated:</span> February 7, 2026</span>
            <span><span className="text-white/60">Effective:</span> February 7, 2026</span>
          </div>
          <p className="text-sm text-white/50 max-w-sm mx-auto">
            Please review the key highlights below, then read the full documents before accepting.
          </p>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-6">
          <div className="space-y-6 py-6">
            {/* What AYN Is */}
            <SummarySection title="ABOUT AYN">
              <p className="text-white/60 text-sm">
                AYN is an AI-powered platform providing business consulting, engineering tools, 
                document analysis, and general AI assistance. Available globally from Nova Scotia, Canada.
              </p>
            </SummarySection>

            {/* Key Terms */}
            <SummarySection title="KEY TERMS HIGHLIGHTS">
              <BulletList items={[
                "All payments are final and non-refundable",
                "One account per person; sharing accounts is prohibited",
                "You retain ownership of content you submit",
                "AI-generated outputs are your responsibility to verify",
                "Prohibited: illegal content, bypassing limits, reverse engineering, spam",
                "Violations may result in account suspension or termination",
                "Governed by Nova Scotia, Canada law"
              ]} />
            </SummarySection>

            {/* AI Disclaimer */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-500" />
                <h3 className="font-semibold text-amber-400 text-sm">AI & ENGINEERING DISCLAIMER</h3>
              </div>
              <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg">
                <BulletList items={[
                  "AYN may produce inaccurate or incomplete responses",
                  "NOT professional advice (legal, medical, financial, engineering)",
                  "All engineering outputs require review by a licensed Professional Engineer (PE)",
                  "Engineering tools are for reference only — not construction documents",
                  "Users assume all risks from AI-generated information",
                  "AYN is provided \"as is\" without warranties of any kind"
                ]} />
              </div>
            </div>

            {/* Privacy Highlights */}
            <SummarySection title="PRIVACY HIGHLIGHTS">
              <BulletList items={[
                "We collect: account info, messages, usage data, device info",
                "AI prompts processed by: OpenAI, Anthropic, Google",
                "We do NOT sell your personal data",
                "Data encrypted in transit and at rest",
                "You can delete your data at any time",
                "Compliant with PIPEDA, GDPR, and CCPA"
              ]} />
            </SummarySection>

            {/* Contact */}
            <div className="text-center text-xs text-white/40 pt-2">
              <p>Questions? Contact us at <span className="text-white/60">support@ayn.careers</span></p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex-shrink-0 px-6 pb-6 pt-4 border-t border-white/10 space-y-4">
          <p className="text-center text-xs text-white/30">© 2026 AYN. All rights reserved.</p>
          
          <div className="flex items-start space-x-3">
            <Checkbox 
              id="hasRead" 
              checked={hasRead}
              onCheckedChange={(checked) => setHasRead(checked as boolean)}
              className="border-white/30 data-[state=checked]:bg-white data-[state=checked]:text-neutral-950"
            />
            <label htmlFor="hasRead" className="text-sm leading-5 text-white/70 cursor-pointer">
              I have read and understood the{' '}
              <a href="/privacy" target="_blank" rel="noopener noreferrer" className="text-white underline hover:text-white/80">
                Privacy Policy
              </a>
            </label>
          </div>

          <div className="flex items-start space-x-3">
            <Checkbox 
              id="acceptTerms" 
              checked={acceptTerms}
              onCheckedChange={(checked) => setAcceptTerms(checked as boolean)}
              disabled={!hasRead}
              className="border-white/30 data-[state=checked]:bg-white data-[state=checked]:text-neutral-950 disabled:opacity-30"
            />
            <label htmlFor="acceptTerms" className="text-sm leading-5 text-white/70 cursor-pointer">
              I accept the{' '}
              <a href="/terms" target="_blank" rel="noopener noreferrer" className="text-white underline hover:text-white/80">
                Terms of Service
              </a>
              {' '}including the no-refund policy
            </label>
          </div>

          <div className="flex items-start space-x-3">
            <Checkbox 
              id="acceptAI" 
              checked={acceptAI}
              onCheckedChange={(checked) => setAcceptAI(checked as boolean)}
              disabled={!acceptTerms}
              className="border-white/30 data-[state=checked]:bg-amber-500 data-[state=checked]:text-white disabled:opacity-30"
            />
            <label htmlFor="acceptAI" className="text-sm leading-5 text-white/70 cursor-pointer">
              I understand AYN is AI with limitations and engineering outputs require Professional Engineer (PE) review
            </label>
          </div>

          <Button
            onClick={handleAccept}
            disabled={!hasRead || !acceptTerms || !acceptAI}
            className="w-full bg-white text-neutral-950 hover:bg-white/90 disabled:opacity-30 disabled:cursor-not-allowed font-medium"
          >
            Accept & Continue
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
