// The work-related sections of the Profile form: skills, work history,
// certifications and licenses, education, and the derived signals. Extracted
// from ProfileTab.tsx; markup and behaviour are unchanged. Each takes only the
// slice of the career data it edits plus the update callbacks, so it re-renders
// when its own data changes rather than on every keystroke elsewhere on the page.
import type { Dispatch, SetStateAction } from "react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Trash2, ChevronDown } from "lucide-react";
import { LEVELS, LAST_USED, INDUSTRIES, SENIORITY_LEVELS, PRIMARY_FUNCTIONS, type SkillLevel, type LastUsed, type Skill, type Exp, type Edu, type Cert, type Derived, type Career } from "./profileTypes";
import { PlainField, OptionRow, BulkAdd, updateAt, removeAt } from "./ProfileFormPrimitives";
import { ExperienceCard } from "./ExperienceCard";

interface SkillsSectionProps {
  skills: Skill[];
  setCareer: Dispatch<SetStateAction<Career>>;
  queueSave: () => void;
}

export function SkillsSection({ skills, setCareer, queueSave }: SkillsSectionProps) {
  const [openSkill, setOpenSkill] = useState<number | null>(null);
  const [levelPromptDone, setLevelPromptDone] = useState(
    () => sessionStorage.getItem("ayn_skill_level_prompt") === "done"
  );
  const skillsWithLevel = skills.filter(s => !!s.level).length;
  const needsLevelPrompt = !levelPromptDone && skills.length > 0 && skillsWithLevel === 0;
  const updateSkill = (i: number, next: Skill) => { updateAt(setCareer, "skills", i, next); queueSave(); };
  return (
    <>
    {/* Skills */}
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold">Skills ({skills.length})</p>
        <span className="text-[11px]" style={{ color: "var(--rh-faint)" }}>
          {skillsWithLevel} of {skills.length} have a level
        </span>
      </div>

      {needsLevelPrompt && (
        <div className="rounded-md px-3 py-2 text-xs flex items-start justify-between gap-3" style={{ border: "1px solid var(--rh-accent)", background: "var(--rh-tint)" }}>
          <span className="leading-relaxed">
            Your skills came across as names only. Add a level to your top five, not all of them. That is
            what an employer search actually ranks on.
          </span>
          <button
            type="button"
            className="underline shrink-0"
            style={{ color: "var(--rh-accent-2)" }}
            onClick={() => { sessionStorage.setItem("ayn_skill_level_prompt", "done"); setLevelPromptDone(true); }}
          >
            Dismiss
          </button>
        </div>
      )}

      {skills.length === 0 && <p className="text-xs" style={{ color: "var(--rh-muted)" }}>No skills yet. Upload a resume and AYN fills these in.</p>}

      <div className="flex flex-wrap gap-1.5">
        {skills.map((s, i) => (
          <button
            key={i}
            type="button"
            onClick={() => setOpenSkill(openSkill === i ? null : i)}
            className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition-colors"
            style={openSkill === i ? { borderColor: "var(--rh-accent)", background: "var(--rh-tint)" } : { borderColor: "var(--rh-hair)" }}
          >
            <span className="font-medium">{s.name || "Untitled skill"}</span>
            {s.level && <span className="text-muted-foreground">{LEVELS.find(l => l.value === s.level)?.label}</span>}
            {s.last_used && <span className="text-muted-foreground">· {LAST_USED.find(l => l.value === s.last_used)?.label}</span>}
            <ChevronDown className="w-3 h-3 opacity-60" />
          </button>
        ))}
        <button
          type="button"
          className="inline-flex items-center gap-1 rounded-full border border-dashed border-border px-3 py-1 text-xs text-muted-foreground hover:text-foreground"
          onClick={() => { setCareer(p => ({ ...p, skills: [...p.skills, { name: "", level: null, years: null, last_used: null }] })); setOpenSkill(skills.length); }}
        >
          <Plus className="w-3 h-3" /> Add skill
        </button>
      </div>

      {openSkill !== null && skills[openSkill] && (
        <div className="rounded-lg border p-3 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Skill</Label>
              <Input
                value={skills[openSkill].name}
                onChange={e => updateSkill(openSkill, { ...skills[openSkill], name: e.target.value })}
                onBlur={queueSave}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Years (optional)</Label>
              <Input
                type="number"
                value={skills[openSkill].years ?? ""}
                onChange={e => updateSkill(openSkill, { ...skills[openSkill], years: e.target.value === "" ? null : Number(e.target.value) })}
                onBlur={queueSave}
              />
            </div>
          </div>
          <OptionRow
            label="Level"
            options={LEVELS}
            value={skills[openSkill].level ?? null}
            onChange={v => updateSkill(openSkill, { ...skills[openSkill], level: v as SkillLevel | null })}
          />
          <OptionRow
            label="Last used"
            options={LAST_USED}
            value={skills[openSkill].last_used ?? null}
            onChange={v => updateSkill(openSkill, { ...skills[openSkill], last_used: v as LastUsed | null })}
          />
          <div className="flex justify-between">
            <Button variant="ghost" size="sm" onClick={() => { removeAt(setCareer, "skills", openSkill); setOpenSkill(null); queueSave(); }}>
              <Trash2 className="w-3.5 h-3.5 mr-1.5" /> Remove
            </Button>
            <Button variant="outline" size="sm" onClick={() => setOpenSkill(null)}>Done</Button>
          </div>
        </div>
      )}

      <BulkAdd
        placeholder="Paste several skills separated by commas"
        onAdd={names => {
          setCareer(p => ({ ...p, skills: [...p.skills, ...names.map(n => ({ name: n, level: null, years: null, last_used: null }))] }));
          queueSave();
        }}
      />
    </div>
    </>
  );
}

interface WorkHistorySectionProps {
  experiences: Exp[];
  setCareer: Dispatch<SetStateAction<Career>>;
  updateExp: (index: number, next: Exp) => void;
  removeExp: (index: number) => void;
  queueSave: () => void;
}

export function WorkHistorySection({ experiences, setCareer, updateExp, removeExp, queueSave }: WorkHistorySectionProps) {
  return (
    <>
    {/* Work history — content visible by default */}
    <div className="space-y-2 pt-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">Work history ({experiences.length})</p>
        <Button variant="ghost" size="sm" onClick={() => setCareer(p => ({ ...p, experiences: [...p.experiences, { company: "", title: "", bullets: [""] }] }))}>
          <Plus className="w-4 h-4 mr-1" /> Add role
        </Button>
      </div>
      {experiences.length === 0 && <p className="text-xs text-muted-foreground">No roles yet.</p>}

      {experiences.map((e, i) => (
        <ExperienceCard key={i} exp={e} index={i} onChange={updateExp} onRemove={removeExp} onBlurSave={queueSave} />
      ))}
      <datalist id="ayn-industries">
        {INDUSTRIES.map(x => <option key={x} value={x} />)}
      </datalist>
    </div>
    </>
  );
}

interface CertificationsSectionProps {
  certifications: Cert[];
  setCareer: Dispatch<SetStateAction<Career>>;
  queueSave: () => void;
}

export function CertificationsSection({ certifications, setCareer, queueSave }: CertificationsSectionProps) {
  const updateCert = (i: number, next: Cert) => { updateAt(setCareer, "certifications", i, next); queueSave(); };
  return (
    <>
    {/* v3.338.0 -- reordered ahead of Education, and relabeled to name
        a license explicitly, not just a certificate: "for all resumes
        we have to have certification and license before education."
        The generated document (resumeDocs.ts's buildResumeBlocks) has
        always rendered this
        section before Education -- this form's own field order never
        matched that, so someone filling it out saw the opposite order
        from what their actual downloaded resume shows. Matched here. */}
    {/* Certifications & licenses */}
    <div className="space-y-2 pt-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">Certifications &amp; licenses ({certifications.length})</p>
        <Button variant="ghost" size="sm" onClick={() => setCareer(p => ({ ...p, certifications: [...p.certifications, { name: "" }] }))}>
          <Plus className="w-4 h-4 mr-1" /> Add certification or license
        </Button>
      </div>
      {certifications.length === 0 && <p className="text-xs text-muted-foreground">No certifications or licenses yet.</p>}
      {certifications.map((c, i) => (
        <div key={i} className="grid grid-cols-1 sm:grid-cols-3 gap-3 border rounded-lg p-3">
          <PlainField label="Certification or license" value={c.name} onChange={v => updateCert(i, { ...c, name: v })} onBlur={queueSave} placeholder="AWS Certified Solutions Architect, or Registered Nurse License" />
          <PlainField label="Issuer" value={c.issuer || ""} onChange={v => updateCert(i, { ...c, issuer: v })} onBlur={queueSave} placeholder="Amazon Web Services, or College of Nurses of Ontario" />
          <PlainField label="Year" value={c.year || ""} onChange={v => updateCert(i, { ...c, year: v })} onBlur={queueSave} />
          <div className="sm:col-span-3 flex justify-end">
            <Button variant="ghost" size="sm" onClick={() => { removeAt(setCareer, "certifications", i); queueSave(); }}>Remove</Button>
          </div>
        </div>
      ))}
    </div>
    </>
  );
}

interface EducationSectionProps {
  education: Edu[];
  setCareer: Dispatch<SetStateAction<Career>>;
  queueSave: () => void;
}

export function EducationSection({ education, setCareer, queueSave }: EducationSectionProps) {
  const updateEdu = (i: number, next: Edu) => { updateAt(setCareer, "education", i, next); queueSave(); };
  return (
    <>
    {/* Education */}
    <div className="space-y-2 pt-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">Education ({education.length})</p>
        <Button variant="ghost" size="sm" onClick={() => setCareer(p => ({ ...p, education: [...p.education, { school: "" }] }))}>
          <Plus className="w-4 h-4 mr-1" /> Add school
        </Button>
      </div>
      {education.length === 0 && <p className="text-xs text-muted-foreground">No education entries yet.</p>}
      {education.map((e, i) => (
        <div key={i} className="grid grid-cols-1 sm:grid-cols-2 gap-3 border rounded-lg p-3">
          <PlainField label="School" value={e.school} onChange={v => updateEdu(i, { ...e, school: v })} onBlur={queueSave} />
          <PlainField label="Degree" value={e.degree || ""} onChange={v => updateEdu(i, { ...e, degree: v })} onBlur={queueSave} placeholder="BSc" />
          <PlainField label="Field of study" value={e.field || ""} onChange={v => updateEdu(i, { ...e, field: v })} onBlur={queueSave} placeholder="Computer science" />
          <PlainField label="End year" value={e.end || ""} onChange={v => updateEdu(i, { ...e, end: v })} onBlur={queueSave} />
          <div className="sm:col-span-2 flex justify-end">
            <Button variant="ghost" size="sm" onClick={() => { removeAt(setCareer, "education", i); queueSave(); }}>Remove</Button>
          </div>
        </div>
      ))}
    </div>
    </>
  );
}

interface DerivedSectionProps {
  derived: Derived;
  setDerived: (key: keyof Derived, value: unknown) => void;
  queueSave: () => void;
}

/** Derived signals (years, seniority, function) and "what you are known for". */
export function DerivedSection({ derived, setDerived, queueSave }: DerivedSectionProps) {
  return (
    <>
    {/* Derived signals employers and scoring both use */}
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-4">
      <div className="space-y-1">
        <PlainField
          label="Total years of experience"
          type="number"
          value={derived.total_yoe == null ? "" : String(derived.total_yoe)}
          onChange={v => setDerived("total_yoe", v === "" ? undefined : Number(v))}
          onBlur={queueSave}
        />
        <p className="text-[11px] text-muted-foreground">Calculated from your earliest role. Overwrite it if that is wrong.</p>
      </div>
      {/* v3.71.0 fix: was free text with a comma-separated placeholder
          ("entry, mid, senior, staff") that read like a list of things to
          type in, not one example. Datalist keeps free entry (so an
          existing value is never lost) but suggests the same vocabulary
          the matcher itself scores seniority against. */}
      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">Seniority</Label>
        <Input
          list="ayn-seniority"
          value={derived.seniority || ""}
          onChange={ev => setDerived("seniority", ev.target.value)}
          onBlur={queueSave}
          placeholder="e.g. Senior"
        />
      </div>
      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">Primary function</Label>
        <Input
          list="ayn-functions"
          value={derived.primary_function || ""}
          onChange={ev => setDerived("primary_function", ev.target.value)}
          onBlur={queueSave}
          placeholder="e.g. Engineering"
        />
      </div>
      <datalist id="ayn-seniority">
        {SENIORITY_LEVELS.map(x => <option key={x} value={x} />)}
      </datalist>
      <datalist id="ayn-functions">
        {PRIMARY_FUNCTIONS.map(x => <option key={x} value={x} />)}
      </datalist>
    </div>

    {/* What you are known for */}
    <div className="space-y-1.5 pt-4">
      <Label className="text-xs text-muted-foreground">What you are known for (optional)</Label>
      <p className="text-[11px] text-muted-foreground">
        The two or three things you would want a hiring manager to know first. AYN uses these in cover
        letters and in the summary employers see.
      </p>
      {[0, 1, 2].map(idx => (
        <Input
          key={idx}
          value={(derived.known_for ?? [])[idx] ?? ""}
          placeholder={idx === 0 ? "Shipped payments infrastructure at scale" : "Add another"}
          onChange={ev => {
            const next = [...(derived.known_for ?? ["", "", ""])];
            while (next.length < 3) next.push("");
            next[idx] = ev.target.value;
            setDerived("known_for", next);
          }}
          onBlur={() => { setDerived("known_for", (derived.known_for ?? []).filter(Boolean)); queueSave(); }}
        />
      ))}
    </div>
    </>
  );
}
