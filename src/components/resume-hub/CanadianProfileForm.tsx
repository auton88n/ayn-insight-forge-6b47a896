/**
 * CanadianProfileForm.tsx
 *
 * A guided, section-by-section form that collects everything Canadian
 * employers ask for on job application forms — organized the same way
 * real Canadian ATS systems present the questions.
 *
 * Sections:
 *  1. Personal Information       — name, contact, address (with province)
 *  2. Work Authorization         — legally eligible, work permit type
 *  3. Professional Links         — LinkedIn, GitHub, portfolio, Indeed
 *  4. Availability & Preferences — start date, job type, salary, relocation
 *  5. Education & Credentials    — highest education, certifications, languages
 *  6. Skills & Experience        — years of experience, management, industries
 *  7. Pre-Screening Questions    — criminal record, background check consent,
 *                                  driver's licence (if job requires driving),
 *                                  equity self-ID (voluntary)
 *  8. Default Short Answers      — "Tell me about yourself", "Why do you want
 *                                  this role?", salary expectation, references
 *
 * All data maps directly to the user_profile_data table columns:
 *   legal_first_name, legal_last_name, preferred_name, email, phone,
 *   address (jsonb), work_auth (jsonb), links (jsonb),
 *   demographics (jsonb), default_answers (jsonb)
 */

import { useState, useEffect, forwardRef, useImperativeHandle } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Loader2, CheckCircle2, ChevronDown, ChevronUp, Info } from "lucide-react";
import { cn } from "@/lib/utils";

interface ResumeBasics { name?: string; email?: string; phone?: string; title?: string; summary?: string; location?: string; links?: Array<{ label: string; url: string }> }
interface ResumeWork { company?: string; title?: string; start?: string; end?: string; bullets?: string[] }
interface ResumeEducation { school?: string; degree?: string; field?: string; end?: string }
interface ParsedResume { basics?: ResumeBasics; work?: ResumeWork[]; education?: ResumeEducation[]; skills?: string[] }
interface Props { userId: string; resumeData?: ParsedResume; hideSaveButton?: boolean }

export interface CanadianProfileFormHandle { save: () => Promise<void> }

// ── Canadian provinces & territories ──────────────────────────────────────────
const CA_PROVINCES = [
  "Alberta", "British Columbia", "Manitoba", "New Brunswick",
  "Newfoundland and Labrador", "Northwest Territories", "Nova Scotia",
  "Nunavut", "Ontario", "Prince Edward Island", "Quebec", "Saskatchewan",
  "Yukon",
];

// ── Work authorization options (what Canadian ATS systems show) ───────────────
const WORK_AUTH_OPTIONS = [
  { value: "citizen", label: "Canadian Citizen" },
  { value: "permanent_resident", label: "Permanent Resident (PR)" },
  { value: "open_work_permit", label: "Open Work Permit" },
  { value: "closed_work_permit", label: "Employer-Specific Work Permit" },
  { value: "pgwp", label: "Post-Graduation Work Permit (PGWP)" },
  { value: "study_permit_coop", label: "Study Permit (Co-op / Intern)" },
  { value: "iec", label: "International Experience Canada (IEC)" },
  { value: "not_eligible", label: "Not currently authorized to work in Canada" },
];

// ── Employment type preferences ───────────────────────────────────────────────
const JOB_TYPES = ["Full-time", "Part-time", "Contract / Fixed-term", "Casual / Temporary", "Internship / Co-op", "Volunteer"];

// ── Canadian languages ────────────────────────────────────────────────────────
const LANGUAGE_LEVELS = ["None", "Basic", "Conversational", "Professional", "Native / Bilingual"];

// ── Industries (common Canadian ATS dropdown) ─────────────────────────────────
const INDUSTRIES = [
  "Technology / Software", "Finance / Banking", "Healthcare / Pharma",
  "Government / Public Sector", "Oil & Gas / Energy", "Construction / Engineering",
  "Retail / Consumer Goods", "Education", "Legal / Compliance",
  "Marketing / Advertising", "Manufacturing", "Logistics / Supply Chain",
  "Non-Profit / NGO", "Media / Entertainment", "Real Estate", "Other",
];

// ── Highest education ─────────────────────────────────────────────────────────
const EDUCATION_LEVELS = [
  "High School Diploma / GED",
  "College Diploma (1-2 year)",
  "Advanced Diploma (3 year)",
  "Bachelor's Degree",
  "Postgraduate Certificate / Diploma",
  "Master's Degree",
  "Doctoral Degree (PhD)",
  "Professional Designation (P.Eng, CPA, etc.)",
  "Some College / University (no degree)",
  "Prefer not to say",
];

// ── Section wrapper ───────────────────────────────────────────────────────────
function Section({
  title, subtitle, children, defaultOpen = true,
}: { title: string; subtitle?: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-border">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-muted/30 transition-colors"
      >
        <div>
          <p className="font-semibold text-sm">{title}</p>
          {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-muted-foreground shrink-0" /> : <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />}
      </button>
      {open && <div className="px-5 pb-5 pt-1 space-y-4 border-t border-border">{children}</div>}
    </div>
  );
}

// ── Field label with optional tooltip ────────────────────────────────────────
function FieldLabel({ label, tip }: { label: string; tip?: string }) {
  return (
    <label className="flex items-center gap-1.5 text-xs font-mono uppercase tracking-wider text-muted-foreground mb-1.5">
      {label}
      {tip && (
        <span className="group relative cursor-help">
          <Info className="w-3 h-3 text-muted-foreground/50" />
          <span className="absolute left-5 bottom-0 z-20 hidden group-hover:block w-56 text-xs bg-popover border border-border rounded p-2 text-foreground shadow-md normal-case tracking-normal">
            {tip}
          </span>
        </span>
      )}
    </label>
  );
}

// ── Checkbox ──────────────────────────────────────────────────────────────────
function CheckRow({ label, checked, onChange, tip }: { label: string; checked: boolean; onChange: (v: boolean) => void; tip?: string }) {
  return (
    <label className="flex items-start gap-3 cursor-pointer group">
      <div
        className={cn(
          "mt-0.5 w-4 h-4 rounded-sm border-2 shrink-0 flex items-center justify-center transition-all",
          checked ? "bg-foreground border-foreground" : "border-muted-foreground/40 group-hover:border-foreground"
        )}
        onClick={() => onChange(!checked)}
      >
        {checked && <CheckCircle2 className="w-3 h-3 text-background" />}
      </div>
      <span className="text-sm leading-relaxed">
        {label}
        {tip && <span className="text-muted-foreground text-xs ml-1">({tip})</span>}
      </span>
    </label>
  );
}

// ── Radio group ───────────────────────────────────────────────────────────────
function RadioGroup({
  label, options, value, onChange, tip,
}: { label: string; options: { value: string; label: string }[]; value: string; onChange: (v: string) => void; tip?: string }) {
  return (
    <div>
      <FieldLabel label={label} tip={tip} />
      <div className="flex flex-wrap gap-2">
        {options.map(opt => (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={cn(
              "px-3 py-1.5 text-xs border rounded-none font-mono transition-all",
              value === opt.value
                ? "bg-foreground text-background border-foreground"
                : "bg-transparent border-border text-muted-foreground hover:border-foreground hover:text-foreground"
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Multi-checkbox row ────────────────────────────────────────────────────────
function MultiSelect({
  label, options, selected, onChange, tip,
}: { label: string; options: string[]; selected: string[]; onChange: (v: string[]) => void; tip?: string }) {
  const toggle = (opt: string) =>
    onChange(selected.includes(opt) ? selected.filter(s => s !== opt) : [...selected, opt]);
  return (
    <div>
      <FieldLabel label={label} tip={tip} />
      <div className="flex flex-wrap gap-2">
        {options.map(opt => (
          <button
            key={opt}
            type="button"
            onClick={() => toggle(opt)}
            className={cn(
              "px-3 py-1.5 text-xs border rounded-none font-mono transition-all",
              selected.includes(opt)
                ? "bg-foreground text-background border-foreground"
                : "bg-transparent border-border text-muted-foreground hover:border-foreground hover:text-foreground"
            )}
          >
            {opt}
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Progress bar ──────────────────────────────────────────────────────────────
function ProfileCompletion({ pct }: { pct: number }) {
  const color = pct >= 80 ? "bg-emerald-500" : pct >= 50 ? "bg-amber-500" : "bg-rose-500";
  return (
    <div className="mb-6">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs font-mono uppercase tracking-widest text-muted-foreground">Profile completion</span>
        <span className={cn("text-xs font-bold font-mono", pct >= 80 ? "text-emerald-500" : pct >= 50 ? "text-amber-500" : "text-rose-500")}>
          {pct}%
        </span>
      </div>
      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
        <div className={cn("h-full transition-all duration-700 rounded-full", color)} style={{ width: `${pct}%` }} />
      </div>
      <p className="text-xs text-muted-foreground mt-1.5">
        AYN autofills using whatever fields are saved. The more you add, the more application questions it can answer for you.
      </p>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Main component
// ═══════════════════════════════════════════════════════════════════════════════
const CanadianProfileForm = forwardRef<CanadianProfileFormHandle, Props>(function CanadianProfileForm({ userId, resumeData, hideSaveButton }, ref) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  // ── Section 1: Personal ──────────────────────────────────────────────────
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [preferredName, setPreferredName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [addressLine1, setAddressLine1] = useState("");
  const [addressLine2, setAddressLine2] = useState("");
  const [city, setCity] = useState("");
  const [province, setProvince] = useState("");
  const [postalCode, setPostalCode] = useState("");

  // ── Section 2: Work Auth ─────────────────────────────────────────────────
  const [legallyEligible, setLegallyEligible] = useState("");   // yes | no
  const [workAuthType, setWorkAuthType] = useState("");
  const [workPermitExpiry, setWorkPermitExpiry] = useState("");
  const [requiresSponsorship, setRequiresSponsorship] = useState(false);

  // ── Section 3: Links ─────────────────────────────────────────────────────
  const [linkedin, setLinkedin] = useState("");
  const [github, setGithub] = useState("");
  const [portfolio, setPortfolio] = useState("");
  const [indeed, setIndeed] = useState("");

  // ── Section 4: Availability ──────────────────────────────────────────────
  const [availableFrom, setAvailableFrom] = useState("");
  const [jobTypes, setJobTypes] = useState<string[]>([]);
  const [salaryExpectation, setSalaryExpectation] = useState("");
  const [salaryType, setSalaryType] = useState("yearly"); // yearly | hourly
  const [willingToRelocate, setWillingToRelocate] = useState("");
  const [willingToTravel, setWillingToTravel] = useState("");
  const [remotePreference, setRemotePreference] = useState("");

  // ── Section 5: Education & Language ─────────────────────────────────────
  const [highestEducation, setHighestEducation] = useState("");
  const [fieldOfStudy, setFieldOfStudy] = useState("");
  const [englishLevel, setEnglishLevel] = useState("");
  const [frenchLevel, setFrenchLevel] = useState("");
  const [otherLanguages, setOtherLanguages] = useState("");
  const [certifications, setCertifications] = useState("");

  // ── Section 6: Experience ────────────────────────────────────────────────
  const [yearsExperience, setYearsExperience] = useState("");
  const [managementExperience, setManagementExperience] = useState("");
  const [industries, setIndustries] = useState<string[]>([]);

  // ── Section 7: Pre-Screening ─────────────────────────────────────────────
  const [criminalRecord, setCriminalRecord] = useState("");
  const [backgroundCheckConsent, setBackgroundCheckConsent] = useState(false);
  const [hasDriversLicence, setHasDriversLicence] = useState("");
  const [licenceClass, setLicenceClass] = useState("");
  // Equity self-ID (voluntary, Federal Employment Equity Act)
  const [equityWoman, setEquityWoman] = useState(false);
  const [equityIndigenous, setEquityIndigenous] = useState(false);
  const [equityVisibleMinority, setEquityVisibleMinority] = useState(false);
  const [equityDisability, setEquityDisability] = useState(false);
  const [equityPreferNotToSay, setEquityPreferNotToSay] = useState(false);

  // ── Section 8: Default answers ───────────────────────────────────────────
  const [aboutMe, setAboutMe] = useState("");
  const [whyThisRole, setWhyThisRole] = useState("");
  const [greatestStrength, setGreatestStrength] = useState("");
  const [greatestWeakness, setGreatestWeakness] = useState("");
  const [referencesAvailable, setReferencesAvailable] = useState("");

  // ── Load ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    supabase.from("user_profile_data").select("*").eq("user_id", userId).maybeSingle().then(({ data }) => {
      if (!data) return;
      setFirstName(data.legal_first_name ?? "");
      setLastName(data.legal_last_name ?? "");
      setPreferredName(data.preferred_name ?? "");
      setEmail(data.email ?? "");
      setPhone(data.phone ?? "");

      const addr = (data.address ?? {}) as Record<string, string>;
      setAddressLine1(addr.line1 ?? "");
      setAddressLine2(addr.line2 ?? "");
      setCity(addr.city ?? "");
      setProvince(addr.province ?? addr.state ?? "");
      setPostalCode(addr.postal_code ?? "");

      const wa = (data.work_auth ?? {}) as Record<string, unknown>;
      setLegallyEligible(String(wa.legally_eligible ?? ""));
      setWorkAuthType(String(wa.type ?? ""));
      setWorkPermitExpiry(String(wa.permit_expiry ?? ""));
      setRequiresSponsorship(Boolean(wa.requires_sponsorship));

      const lk = (data.links ?? {}) as Record<string, string>;
      setLinkedin(lk.linkedin ?? "");
      setGithub(lk.github ?? "");
      setPortfolio(lk.portfolio ?? "");
      setIndeed(lk.indeed ?? "");

      const da = (data.default_answers ?? {}) as Record<string, unknown>;
      setAvailableFrom(String(da.available_from ?? ""));
      setJobTypes((da.job_types as string[]) ?? []);
      setSalaryExpectation(String(da.salary_expectation ?? ""));
      setSalaryType(String(da.salary_type ?? "yearly"));
      setWillingToRelocate(String(da.willing_to_relocate ?? ""));
      setWillingToTravel(String(da.willing_to_travel ?? ""));
      setRemotePreference(String(da.remote_preference ?? ""));
      setHighestEducation(String(da.highest_education ?? ""));
      setFieldOfStudy(String(da.field_of_study ?? ""));
      setEnglishLevel(String(da.english_level ?? ""));
      setFrenchLevel(String(da.french_level ?? ""));
      setOtherLanguages(String(da.other_languages ?? ""));
      setCertifications(String(da.certifications ?? ""));
      setYearsExperience(String(da.years_experience ?? ""));
      setManagementExperience(String(da.management_experience ?? ""));
      setIndustries((da.industries as string[]) ?? []);
      setCriminalRecord(String(da.criminal_record ?? ""));
      setBackgroundCheckConsent(Boolean(da.background_check_consent));
      setHasDriversLicence(String(da.has_drivers_licence ?? ""));
      setLicenceClass(String(da.licence_class ?? ""));
      setEquityWoman(Boolean(da.equity_woman));
      setEquityIndigenous(Boolean(da.equity_indigenous));
      setEquityVisibleMinority(Boolean(da.equity_visible_minority));
      setEquityDisability(Boolean(da.equity_disability));
      setEquityPreferNotToSay(Boolean(da.equity_prefer_not_to_say));
      setAboutMe(String(da.about_me ?? ""));
      setWhyThisRole(String(da.why_this_role ?? ""));
      setGreatestStrength(String(da.greatest_strength ?? ""));
      setGreatestWeakness(String(da.greatest_weakness ?? ""));
      setReferencesAvailable(String(da.references_available ?? ""));
    });
  }, [userId]);

  // ── Auto-fill from parsed resume ─────────────────────────────────────────
  // Fires when a resume is uploaded — pre-fills personal info fields
  // without overwriting anything already saved. User can then review & save.
  useEffect(() => {
    if (!resumeData) return;
    const b = resumeData.basics ?? {};

    // Split full name into first / last
    if (b.name && !firstName && !lastName) {
      const parts = b.name.trim().split(/\s+/);
      if (parts.length >= 2) {
        setFirstName(parts[0]);
        setLastName(parts.slice(1).join(" "));
      } else if (parts.length === 1) {
        setFirstName(parts[0]);
      }
    }
    if (b.email && !email) setEmail(b.email);
    if (b.phone && !phone) setPhone(b.phone);

    // LinkedIn / Portfolio from links array
    if (resumeData.basics?.links) {
      for (const link of resumeData.basics.links) {
        const url = link.url ?? "";
        const label = (link.label ?? "").toLowerCase();
        if (!linkedin && (label.includes("linkedin") || url.includes("linkedin.com"))) setLinkedin(url);
        if (!portfolio && (label.includes("portfolio") || label.includes("website") || url.includes("github"))) setPortfolio(url);
        if (!github && url.includes("github.com")) setGithub(url);
      }
    }

    // Education — pull highest degree + field
    if (resumeData.education?.length && !highestEducation) {
      const edu = resumeData.education[0];
      if (edu.degree) setHighestEducation(edu.degree);
      if (edu.field) setFieldOfStudy(edu.field);
    }

    // Years experience — estimate from work history
    if (resumeData.work?.length && !yearsExperience) {
      const firstJob = resumeData.work[resumeData.work.length - 1];
      const startYear = parseInt(firstJob?.start ?? "0");
      if (startYear > 2000) {
        const yrs = new Date().getFullYear() - startYear;
        if (yrs > 0 && yrs < 50) setYearsExperience(String(yrs));
      }
    }

    // Summary → About Me (if not already set)
    if (b.summary && !aboutMe) setAboutMe(b.summary);

    // Location parsing — "Toronto, ON" or "Toronto, Ontario, Canada"
    if (b.location && !city) {
      const parts = b.location.split(",").map((p: string) => p.trim());
      if (parts[0]) setCity(parts[0]);
      if (parts[1]) setProvince(parts[1].substring(0, 2).toUpperCase());
    }
  }, [resumeData]);

  // ── Completion % ─────────────────────────────────────────────────────────
  const fields = [
    firstName, lastName, email, phone, city, province, postalCode,
    legallyEligible, workAuthType,
    linkedin,
    availableFrom, jobTypes.length > 0 ? "ok" : "",
    highestEducation,
    englishLevel,
    yearsExperience,
    criminalRecord,
    aboutMe,
  ];
  const completionPct = Math.round((fields.filter(Boolean).length / fields.length) * 100);

  // ── Save ─────────────────────────────────────────────────────────────────
  const save = async () => {
    setBusy(true);
    try {
      const { error } = await supabase.from("user_profile_data").upsert({
        user_id: userId,
        legal_first_name: firstName,
        legal_last_name: lastName,
        preferred_name: preferredName,
        email,
        phone,
        address: {
          line1: addressLine1, line2: addressLine2,
          city, province, state: province, postal_code: postalCode, country: "Canada",
        },
        links: { linkedin, github, portfolio, indeed },
        default_answers: {
          available_from: availableFrom,
          job_types: jobTypes,
          salary_expectation: salaryExpectation,
          salary_type: salaryType,
          willing_to_relocate: willingToRelocate,
          willing_to_travel: willingToTravel,
          remote_preference: remotePreference,
          highest_education: highestEducation,
          field_of_study: fieldOfStudy,
          english_level: englishLevel,
          french_level: frenchLevel,
          other_languages: otherLanguages,
          certifications,
          years_experience: yearsExperience,
          management_experience: managementExperience,
          industries,
          criminal_record: criminalRecord,
          background_check_consent: backgroundCheckConsent,
          has_drivers_licence: hasDriversLicence,
          licence_class: licenceClass,
          equity_woman: equityWoman,
          equity_indigenous: equityIndigenous,
          equity_visible_minority: equityVisibleMinority,
          equity_disability: equityDisability,
          equity_prefer_not_to_say: equityPreferNotToSay,
          about_me: aboutMe,
          why_this_role: whyThisRole,
          greatest_strength: greatestStrength,
          greatest_weakness: greatestWeakness,
          references_available: referencesAvailable,
        },
      });
      if (error) throw error;
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
      if (!hideSaveButton) toast({ title: "Profile saved", description: "Your autofill profile is up to date." });
    } catch (e: unknown) {
      if (!hideSaveButton) toast({ title: "Save failed", description: e instanceof Error ? e.message : "Error", variant: "destructive" });
      throw e instanceof Error ? e : new Error("Save failed");
    } finally { setBusy(false); }
  };

  useImperativeHandle(ref, () => ({ save }), [save]);


  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4 max-w-3xl">
      <ProfileCompletion pct={completionPct} />

      {/* ── Resume auto-fill notice ── */}
      {resumeData && (
        <div className="flex items-start gap-3 p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-sm">
          <span className="text-emerald-600 text-lg leading-none mt-0.5">✓</span>
          <div>
            <p className="font-semibold text-emerald-800">Profile pre-filled from your resume</p>
            <p className="text-emerald-700 text-xs mt-0.5">Name, email, phone, education and other details were auto-populated. Review each section below and click Save Profile when done.</p>
          </div>
        </div>
      )}

      {/* ── 1. Personal ── */}
      <Section title="Personal Information" subtitle="Your legal name and contact details exactly as they appear on ID">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <FieldLabel label="Legal First Name" />
            <Input value={firstName} onChange={e => setFirstName(e.target.value)} placeholder="e.g. Ghazi" />
          </div>
          <div>
            <FieldLabel label="Legal Last Name" />
            <Input value={lastName} onChange={e => setLastName(e.target.value)} placeholder="e.g. Aldhyaei" />
          </div>
          <div className="col-span-2">
            <FieldLabel label="Preferred / Display Name" tip="What you go by day-to-day. Some forms ask for this separately." />
            <Input value={preferredName} onChange={e => setPreferredName(e.target.value)} placeholder="e.g. Jerry (optional)" />
          </div>
          <div>
            <FieldLabel label="Email Address" />
            <Input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" />
          </div>
          <div>
            <FieldLabel label="Phone Number" tip="Include country code for international. Canadian format: 416-555-0100" />
            <Input value={phone} onChange={e => setPhone(e.target.value)} placeholder="e.g. 416-555-0100" />
          </div>
        </div>

        <div>
          <FieldLabel label="Street Address" />
          <Input value={addressLine1} onChange={e => setAddressLine1(e.target.value)} placeholder="123 Main Street" />
        </div>
        <div>
          <FieldLabel label="Apt / Suite / Unit (optional)" />
          <Input value={addressLine2} onChange={e => setAddressLine2(e.target.value)} placeholder="Apt 4B" />
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div className="col-span-1">
            <FieldLabel label="City" />
            <Input value={city} onChange={e => setCity(e.target.value)} placeholder="Toronto" />
          </div>
          <div className="col-span-1">
            <FieldLabel label="Province / Territory" />
            <Select value={province} onValueChange={setProvince}>
              <SelectTrigger className="rounded-none"><SelectValue placeholder="Select province" /></SelectTrigger>
              <SelectContent>
                {CA_PROVINCES.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="col-span-1">
            <FieldLabel label="Postal Code" tip="Canadian format: A1A 1A1" />
            <Input value={postalCode} onChange={e => setPostalCode(e.target.value.toUpperCase())} placeholder="M5H 2N2" maxLength={7} />
          </div>
        </div>
      </Section>


      {/* ── 3. Professional Links ── */}
      <Section title="Professional Links" subtitle="URLs that go directly into online application forms">
        <div className="grid gap-3">
          <div>
            <FieldLabel label="LinkedIn Profile URL" />
            <Input value={linkedin} onChange={e => setLinkedin(e.target.value)} placeholder="https://linkedin.com/in/yourname" />
          </div>
          <div>
            <FieldLabel label="GitHub Profile URL" />
            <Input value={github} onChange={e => setGithub(e.target.value)} placeholder="https://github.com/yourname" />
          </div>
          <div>
            <FieldLabel label="Portfolio / Website URL" />
            <Input value={portfolio} onChange={e => setPortfolio(e.target.value)} placeholder="https://yourname.com" />
          </div>
          <div>
            <FieldLabel label="Indeed Profile URL" tip="Some Canadian employers (especially retail & hospitality) pull from Indeed" />
            <Input value={indeed} onChange={e => setIndeed(e.target.value)} placeholder="https://ca.indeed.com/r/..." />
          </div>
        </div>
      </Section>

      {/* ── 4. Availability & Preferences ── */}
      <Section title="Availability & Job Preferences" subtitle="Commonly asked on every Canadian online application form">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <FieldLabel label="Earliest Start Date" tip="When can you start? Most forms ask for a specific date." />
            <Input type="date" value={availableFrom} onChange={e => setAvailableFrom(e.target.value)} />
          </div>
          <div>
            <FieldLabel label="Salary Expectation" tip="You can leave this blank — AYN will skip fields it doesn't have data for" />
            <div className="flex gap-2">
              <Input
                value={salaryExpectation}
                onChange={e => setSalaryExpectation(e.target.value)}
                placeholder="e.g. 95000"
                className="flex-1"
              />
              <Select value={salaryType} onValueChange={setSalaryType}>
                <SelectTrigger className="w-28 rounded-none"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="yearly">/ year</SelectItem>
                  <SelectItem value="hourly">/ hour</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <MultiSelect
          label="Employment Types You Are Interested In"
          options={JOB_TYPES}
          selected={jobTypes}
          onChange={setJobTypes}
        />

        <RadioGroup
          label="Willing to relocate within Canada?"
          options={[
            { value: "yes", label: "Yes" },
            { value: "no", label: "No" },
            { value: "maybe", label: "Open to discussion" },
          ]}
          value={willingToRelocate}
          onChange={setWillingToRelocate}
        />

        <RadioGroup
          label="Willing to travel for work?"
          options={[
            { value: "none", label: "No travel" },
            { value: "occasional", label: "Up to 25%" },
            { value: "frequent", label: "Up to 50%" },
            { value: "extensive", label: "50%+" },
          ]}
          value={willingToTravel}
          onChange={setWillingToTravel}
        />

        <RadioGroup
          label="Work location preference"
          options={[
            { value: "onsite", label: "On-site" },
            { value: "hybrid", label: "Hybrid" },
            { value: "remote", label: "Remote" },
            { value: "flexible", label: "Flexible" },
          ]}
          value={remotePreference}
          onChange={setRemotePreference}
        />
      </Section>

      {/* ── 5. Education & Language ── */}
      <Section title="Education, Languages & Certifications" subtitle="Standard education questions on Canadian applications" defaultOpen={false}>
        <div>
          <FieldLabel label="Highest Level of Education Completed" />
          <Select value={highestEducation} onValueChange={setHighestEducation}>
            <SelectTrigger className="rounded-none"><SelectValue placeholder="Select education level" /></SelectTrigger>
            <SelectContent>
              {EDUCATION_LEVELS.map(l => <SelectItem key={l} value={l}>{l}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <FieldLabel label="Field of Study / Major" />
          <Input value={fieldOfStudy} onChange={e => setFieldOfStudy(e.target.value)} placeholder="e.g. Computer Science, Business Administration" />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <FieldLabel label="English Proficiency" tip="Canada's primary language" />
            <Select value={englishLevel} onValueChange={setEnglishLevel}>
              <SelectTrigger className="rounded-none"><SelectValue placeholder="Select level" /></SelectTrigger>
              <SelectContent>
                {LANGUAGE_LEVELS.map(l => <SelectItem key={l} value={l}>{l}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <FieldLabel label="French Proficiency" tip="Required for federal jobs and Quebec roles" />
            <Select value={frenchLevel} onValueChange={setFrenchLevel}>
              <SelectTrigger className="rounded-none"><SelectValue placeholder="Select level" /></SelectTrigger>
              <SelectContent>
                {LANGUAGE_LEVELS.map(l => <SelectItem key={l} value={l}>{l}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div>
          <FieldLabel label="Other Languages (optional)" />
          <Input value={otherLanguages} onChange={e => setOtherLanguages(e.target.value)} placeholder="e.g. Arabic (Native), Spanish (Conversational)" />
        </div>

        <div>
          <FieldLabel label="Professional Certifications / Designations" tip="e.g. PMP, CPA, P.Eng, AWS Certified, LEED" />
          <Textarea
            value={certifications}
            onChange={e => setCertifications(e.target.value)}
            placeholder="List your certifications, one per line"
            rows={3}
          />
        </div>
      </Section>

      {/* ── 6. Experience ── */}
      <Section title="Experience & Industry" subtitle="Lets AYN match you to jobs and calibrate your resume score" defaultOpen={false}>
        <RadioGroup
          label="Total Years of Professional Work Experience"
          options={[
            { value: "0-1", label: "0–1 years" },
            { value: "2-4", label: "2–4 years" },
            { value: "5-7", label: "5–7 years" },
            { value: "8-12", label: "8–12 years" },
            { value: "13+", label: "13+ years" },
          ]}
          value={yearsExperience}
          onChange={setYearsExperience}
        />

        <RadioGroup
          label="People Management Experience"
          options={[
            { value: "none", label: "None" },
            { value: "indirect", label: "Indirect / mentoring" },
            { value: "1-5", label: "1–5 direct reports" },
            { value: "6-15", label: "6–15 direct reports" },
            { value: "16+", label: "16+ direct reports" },
          ]}
          value={managementExperience}
          onChange={setManagementExperience}
        />

        <MultiSelect
          label="Industries You Have Worked In"
          options={INDUSTRIES}
          selected={industries}
          onChange={setIndustries}
          tip="Select all that apply"
        />
      </Section>

      {/* ── 7. Pre-Screening ── */}
      <Section title="Pre-Screening Questions" subtitle="Questions Canadian employers legally ask at the application stage" defaultOpen={false}>

        <RadioGroup
          label="Have you ever been convicted of a criminal offence?"
          options={[
            { value: "no", label: "No" },
            { value: "yes", label: "Yes" },
            { value: "prefer_not", label: "Prefer not to say" },
          ]}
          value={criminalRecord}
          onChange={setCriminalRecord}
        />



        <RadioGroup
          label="Do you hold a valid Canadian driver's licence?"
          tip="Only include if driving is relevant to the roles you are applying for"
          options={[
            { value: "no", label: "No" },
            { value: "g2", label: "Yes — Class G2" },
            { value: "g", label: "Yes — Class G (full)" },
            { value: "az", label: "Yes — Class A/Z (truck/bus)" },
          ]}
          value={hasDriversLicence}
          onChange={setHasDriversLicence}
        />

        {!["no", ""].includes(hasDriversLicence) && (
          <div>
            <FieldLabel label="Province of Licence Issuance" />
            <Input value={licenceClass} onChange={e => setLicenceClass(e.target.value)} placeholder="e.g. Ontario" />
          </div>
        )}

        {/* Employment Equity Self-ID — voluntary, under Federal Employment Equity Act */}
        <div className="border border-border p-4 space-y-3">
          <div>
            <p className="text-sm font-medium">Employment Equity Self-Identification</p>
            <p className="text-xs text-muted-foreground mt-1">
              Federal employers and many large Canadian companies ask employees to voluntarily self-identify under the <em>Employment Equity Act</em>.
              This information is kept confidential and is used only for workforce equity reporting. It is entirely optional.
            </p>
          </div>
          <CheckRow label="Woman" checked={equityWoman} onChange={setEquityWoman} />
          <CheckRow label="Indigenous Person (First Nations, Métis, or Inuit)" checked={equityIndigenous} onChange={setEquityIndigenous} />
          <CheckRow label="Member of a Visible Minority" checked={equityVisibleMinority} onChange={setEquityVisibleMinority}
            tip="Per the Employment Equity Act: persons other than Aboriginal peoples who are non-Caucasian in race or non-white in colour" />
          <CheckRow label="Person with a Disability" checked={equityDisability} onChange={setEquityDisability} />
          <CheckRow label="I prefer not to answer any equity questions" checked={equityPreferNotToSay} onChange={setEquityPreferNotToSay} />
        </div>
      </Section>

      {/* ── 8. Default Answers ── */}
      <Section title="Default Short Answers" subtitle="Pre-written answers AYN can paste into open-text fields on job applications" defaultOpen={false}>
        <p className="text-xs text-muted-foreground">
          These are your go-to answers for the most common open questions. AYN uses them as-is, or tailors them to the job.
          Write in first person. No length limits here — AYN will trim to fit the form's character limit.
        </p>

        <div>
          <FieldLabel label="Tell us about yourself / Professional summary" />
          <Textarea
            value={aboutMe}
            onChange={e => setAboutMe(e.target.value)}
            placeholder="2–4 sentences covering your role, years of experience, key skills, and what you're looking for."
            rows={4}
          />
        </div>

        <div>
          <FieldLabel label="Why do you want this role / Why are you applying?" />
          <Textarea
            value={whyThisRole}
            onChange={e => setWhyThisRole(e.target.value)}
            placeholder="Generic answer that AYN personalizes per job. Focus on your motivation and what you bring."
            rows={4}
          />
        </div>

        <div>
          <FieldLabel label="What is your greatest professional strength?" />
          <Textarea
            value={greatestStrength}
            onChange={e => setGreatestStrength(e.target.value)}
            placeholder="Give one clear strength with a brief example."
            rows={3}
          />
        </div>

        <div>
          <FieldLabel label="What is an area you are working to improve?" tip="Canadian interviewers often ask this instead of 'greatest weakness'" />
          <Textarea
            value={greatestWeakness}
            onChange={e => setGreatestWeakness(e.target.value)}
            placeholder="Be honest and brief. Include what you are doing to improve."
            rows={3}
          />
        </div>

        <div>
          <FieldLabel label="References" tip="Many Canadian forms ask 'References available upon request?' or ask for contact details" />
          <Textarea
            value={referencesAvailable}
            onChange={e => setReferencesAvailable(e.target.value)}
            placeholder="e.g. 'Available upon request. Three professional references including two managers and one peer.'"
            rows={2}
          />
        </div>
      </Section>

      {/* ── Save button ── */}
      {!hideSaveButton && (
        <div className="pt-2 flex items-center gap-4">
          <Button
            size="lg"
            onClick={save}
            disabled={busy}
            className="h-12 px-10 rounded-none font-mono uppercase tracking-wider hover:shadow-xl transition-all"
          >
            {busy
              ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Saving...</>
              : saved
              ? <><CheckCircle2 className="w-4 h-4 mr-2 text-emerald-500" />Saved</>
              : "Save Profile"}
          </Button>
          <p className="text-xs text-muted-foreground">
            Your data is private and encrypted. Only you and AYN can access it.
          </p>
        </div>
      )}
    </div>
  );
});

export default CanadianProfileForm;

