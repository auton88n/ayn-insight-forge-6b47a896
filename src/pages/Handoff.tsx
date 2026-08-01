import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";

/**
 * /handoff — extension bridge fallback (v1.9.55)
 * When the AYN Chrome extension is installed, `deep-link.js` intercepts this
 * URL before React mounts, stores the pending job, and redirects the tab to
 * the target URL. If the extension is NOT installed, this page renders and
 * offers manual continuation + an install prompt.
 */
export default function Handoff() {
  const [params] = useSearchParams();
  const jobUrl = params.get("job") || "";
  const [redirecting, setRedirecting] = useState(true);

  useEffect(() => {
    // Give deep-link.js ~600ms to fire. If we're still here, the extension
    // isn't installed — show the fallback UI.
    const t = setTimeout(() => setRedirecting(false), 600);
    return () => clearTimeout(t);
  }, []);

  if (redirecting) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background text-foreground">
        <p className="text-sm text-muted-foreground">Handing off to AYN…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background text-foreground p-6">
      <div className="max-w-md text-center space-y-4">
        <h1 className="text-2xl font-semibold">AYN extension not detected</h1>
        <p className="text-sm text-muted-foreground">
          Install the AYN extension to score this job and tailor your resume for it.
        </p>
        <div className="flex flex-col gap-2">
          {jobUrl && (
            <a
              href={jobUrl}
              className="inline-block px-4 py-2 rounded-md bg-orange-500 hover:bg-orange-600 text-white text-sm"
            >
              Continue to the job page
            </a>
          )}
          <a
            href="/resume-hub"
            className="text-xs text-muted-foreground underline"
          >
            Get the extension
          </a>
        </div>
      </div>
    </div>
  );
}
