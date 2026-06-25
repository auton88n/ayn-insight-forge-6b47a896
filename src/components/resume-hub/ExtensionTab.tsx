import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Chrome, ExternalLink } from "lucide-react";
import CanadianProfileForm from "./CanadianProfileForm";

interface Props { userId: string }

export default function ExtensionTab({ userId }: Props) {
  const [email, setEmail] = useState("");

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user?.email) setEmail(data.user.email);
    });
  }, []);

  return (
    <div className="space-y-6">

      {/* Chrome extension card */}
      <Card className="p-5 space-y-4">
        <div>
          <h3 className="font-semibold flex items-center gap-2">
            <Chrome className="w-5 h-5" /> AYN Resume Tailor — Chrome Extension
          </h3>
          <p className="text-sm text-muted-foreground mt-1">
            Opens on any job posting. Detects keywords, shows your match, and tailors your resume in one click.
          </p>
        </div>

        {/* How it works */}
        <div className="space-y-2">
          <p className="text-xs font-mono uppercase tracking-widest text-muted-foreground">How it works</p>
          <ol className="space-y-2 text-sm text-muted-foreground">
            {[
              "Install from the Chrome Web Store",
              "Sign in with your AYN account — same email and password you use here",
              "Go to any job posting on LinkedIn, Indeed, Jobright, Greenhouse, and more",
              "Click the AYN icon — the job description fills in automatically",
              "See your keyword match score, then tailor your resume in one click",
            ].map((step, i) => (
              <li key={i} className="flex gap-3 list-none">
                <span className="font-mono text-foreground shrink-0 w-4">{i + 1}.</span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
        </div>

        {/* Install button */}
        <div className="border border-border p-4 space-y-3">
          <p className="text-xs font-mono uppercase tracking-widest text-muted-foreground">Install</p>
          <a
            href="https://chromewebstore.google.com/detail/ayn-resume-tailor/coming-soon"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-foreground text-background text-sm font-semibold hover:opacity-90 transition-opacity"
          >
            <Chrome className="w-4 h-4" />
            Add to Chrome — Free
            <ExternalLink className="w-3.5 h-3.5 opacity-60" />
          </a>
          <p className="text-xs text-muted-foreground">
            Your account links automatically when you sign in. No tokens, no setup steps.
          </p>
        </div>

        {/* Show current account */}
        {email && (
          <div className="text-xs text-muted-foreground border border-border px-3 py-2">
            Sign into the extension with: <span className="text-foreground font-mono">{email}</span>
          </div>
        )}
      </Card>

      {/* Canadian profile form */}
      <div>
        <div className="mb-4">
          <h3 className="font-semibold text-base">Canadian Job Application Profile</h3>
          <p className="text-xs text-muted-foreground mt-1">
            Fill in your details once. AYN uses this to autofill Canadian job application forms instantly.
          </p>
        </div>
        <CanadianProfileForm userId={userId} />
      </div>

    </div>
  );
}
