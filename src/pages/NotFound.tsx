import { useLocation, Link } from "react-router-dom";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { SEO } from "@/components/shared/SEO";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error("404: no route for", location.pathname);
  }, [location.pathname]);

  return (
    <div className="min-h-screen flex items-center justify-center px-6 py-16 bg-background">
      <SEO
        title="Page not found, AYN"
        description="This page does not exist on ayn.careers."
        noIndex={true}
      />
      <div className="w-full max-w-lg text-center">
        <p className="font-mono text-sm tracking-widest text-muted-foreground">404</p>
        <h1 className="mt-4 text-3xl font-semibold text-foreground sm:text-4xl">
          There is nothing at this address
        </h1>
        <p className="mt-4 text-base leading-relaxed text-muted-foreground">
          The page you asked for does not exist, or it belonged to something we retired.
          AYN is a job search product now: it reads the posting you are looking at, scores
          your match, and writes a resume and cover letter for that one job.
        </p>

        <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
          <Button asChild>
            <Link to="/">Back to the home page</Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/resume-hub">Open Resume Hub</Link>
          </Button>
        </div>

        <p className="mt-8 text-sm text-muted-foreground">
          Landed here from a link of ours? Tell us at{" "}
          <Link to="/help" className="underline underline-offset-4 hover:text-foreground">
            support
          </Link>{" "}
          and we will fix it.
        </p>
      </div>
    </div>
  );
};

export default NotFound;
