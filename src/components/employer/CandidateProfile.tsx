// v3.12.0 — the candidate detail used to render `profile_text`, the newline
// blob built for the embedding model, straight into the dialog. It read like
// a debug dump ("Skills: Product management expert 9 years, LLM integration
// advanced 3 years, ...") and it printed labels for values that did not
// exist ("YoE: . Current title: ."). This renders the same facts as a
// profile: header, skills grouped by level, experience rows, education, and
// what they are looking for. Nothing renders when its value is empty.
import { Badge } from "@/components/ui/badge";
import { Briefcase, GraduationCap, MapPin, Award, Compass } from "lucide-react";
import type { CandidateProfileBlock } from "@/lib/employer";

const LEVEL_LABEL: Record<string, string> = {
  expert: "Expert",
  advanced: "Advanced",
  proficient: "Proficient",
  familiar: "Familiar",
  other: "Also listed",
};

function Section({ icon: Icon, title, children }: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
        <Icon className="w-3.5 h-3.5" />{title}
      </p>
      {children}
    </div>
  );
}

export function CandidateProfile({ profile, location }: { profile: CandidateProfileBlock; location?: string }) {
  const headerBits = [
    profile.current_title,
    profile.seniority,
    profile.years_experience != null ? `${profile.years_experience} years` : "",
    location,
  ].filter(Boolean);

  const hasSkills = profile.skills_by_level.some(g => g.skills.length > 0);

  return (
    <div className="rounded-xl border bg-muted/30 p-4 space-y-5">
      {/* Header */}
      {(headerBits.length > 0 || profile.known_for.length > 0) && (
        <div className="space-y-2">
          {headerBits.length > 0 && (
            <p className="text-sm font-medium flex items-center gap-1.5 flex-wrap">
              <MapPin className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
              {headerBits.join(" · ")}
            </p>
          )}
          {profile.known_for.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {profile.known_for.map(k => (
                <Badge key={k} variant="secondary" className="font-normal">{k}</Badge>
              ))}
            </div>
          )}
        </div>
      )}

      {hasSkills && (
        <Section icon={Award} title="Skills">
          <div className="space-y-2">
            {profile.skills_by_level.filter(g => g.skills.length > 0).map(g => (
              <div key={g.level} className="flex flex-wrap items-center gap-1.5">
                <span className="text-[11px] font-medium text-muted-foreground w-20 shrink-0">
                  {LEVEL_LABEL[g.level] || g.level}
                </span>
                {g.skills.map(s => (
                  <Badge key={s.name} variant="outline" className="font-normal">
                    {s.name}{s.years ? <span className="ml-1 text-muted-foreground">{s.years}y</span> : null}
                  </Badge>
                ))}
              </div>
            ))}
          </div>
        </Section>
      )}

      {profile.experience.length > 0 && (
        <Section icon={Briefcase} title="Experience">
          <ul className="divide-y divide-border/50 rounded-lg border border-border/50 bg-card">
            {profile.experience.map((e, i) => (
              <li key={`${e.title}-${e.company}-${i}`} className="px-3 py-2.5">
                <p className="text-sm font-medium leading-snug">
                  {[e.title, e.company].filter(Boolean).join(" at ")}
                </p>
                {(e.dates || e.industry) && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {[e.dates, e.industry].filter(Boolean).join(" · ")}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </Section>
      )}


      {profile.education.length > 0 && (
        <Section icon={GraduationCap} title="Education">
          <ul className="space-y-1">
            {profile.education.map((e, i) => (
              <li key={i} className="text-sm">{e.line}</li>
            ))}
          </ul>
        </Section>
      )}

      {profile.certifications.length > 0 && (
        <Section icon={Award} title="Certifications">
          <div className="flex flex-wrap gap-1.5">
            {profile.certifications.map(c => (
              <Badge key={c} variant="outline" className="font-normal">{c}</Badge>
            ))}
          </div>
        </Section>
      )}

      {profile.seeking.length > 0 && (
        <Section icon={Compass} title="What they are looking for">
          <p className="text-sm text-muted-foreground leading-relaxed">{profile.seeking.join(" · ")}</p>
        </Section>
      )}
    </div>
  );
}

export default CandidateProfile;
