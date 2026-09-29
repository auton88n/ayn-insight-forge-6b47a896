// The "what you are looking for" and "work eligibility" fields of the Profile
// form. Extracted from ProfileTab.tsx; markup and behaviour are unchanged.
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { WORK_COUNTRIES, EMPLOYMENT_TYPES, AVAILABILITY, COMPANY_STAGES, CURRENCIES, type WorkAuth, type Prefs } from "./profileTypes";
import { PlainField, MultiSelect, SingleSelect, Toggle, ChipList } from "./ProfileFormPrimitives";

interface LookingForFieldsProps {
  preferences: Prefs;
  setPref: (key: keyof Prefs, value: unknown) => void;
  queueSave: () => void;
}

export function LookingForFields({ preferences, setPref, queueSave }: LookingForFieldsProps) {
  return (
    <>
    <ChipList
      label="Desired titles"
      values={preferences.desired_titles || []}
      onChange={v => { setPref("desired_titles", v); queueSave(); }}
      placeholder="Add a title"
    />
    <ChipList
      label="Desired locations"
      hint="Where you want to work, not the same as your legal work eligibility below."
      values={preferences.desired_locations || []}
      onChange={v => { setPref("desired_locations", v); queueSave(); }}
      placeholder="Add a city or region"
    />
    <MultiSelect
      label="Employment type"
      options={EMPLOYMENT_TYPES}
      values={preferences.employment_types || []}
      onChange={v => { setPref("employment_types", v); queueSave(); }}
    />
    <SingleSelect
      label="Availability"
      options={AVAILABILITY}
      value={preferences.availability || ""}
      onChange={v => { setPref("availability", v); queueSave(); }}
    />
    <MultiSelect
      label="Company stage"
      options={COMPANY_STAGES}
      values={preferences.company_stages || []}
      onChange={v => { setPref("company_stages", v); queueSave(); }}
    />
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <PlainField
        label="Minimum salary"
        type="number"
        value={preferences.salary_min_usd == null ? "" : String(preferences.salary_min_usd)}
        onChange={v => setPref("salary_min_usd", v === "" ? undefined : Number(v))}
        onBlur={queueSave}
        placeholder="80000"
      />
      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">Currency</Label>
        <Input
          list="ayn-currencies"
          value={preferences.salary_currency || ""}
          onChange={ev => setPref("salary_currency", ev.target.value)}
          onBlur={queueSave}
          placeholder="e.g. CAD"
        />
        <datalist id="ayn-currencies">
          {CURRENCIES.map(x => <option key={x} value={x} />)}
        </datalist>
      </div>
      <Toggle label="Open to remote" value={!!preferences.open_to_remote} onChange={v => { setPref("open_to_remote", v); queueSave(); }} />
      <Toggle label="Open to relocation" value={!!preferences.open_to_relocation} onChange={v => { setPref("open_to_relocation", v); queueSave(); }} />
    </div>
    </>
  );
}

interface EligibilityFieldsProps {
  workAuth: WorkAuth;
  countries: string[];
  toggleCountry: (country: string) => void;
  /** Countries the person can work in that aren't their citizenship. */
  nonCitizenCountries: string[];
  setWA: (key: keyof WorkAuth, value: unknown) => void;
  queueSave: () => void;
}

export function EligibilityFields({ workAuth, countries, toggleCountry, nonCitizenCountries, setWA, queueSave }: EligibilityFieldsProps) {
  return (
    <>
    <div>
      <Label className="text-xs" style={{ color: "var(--rh-muted)" }}>Countries you can work in</Label>
      <p className="text-[11px]" style={{ color: "var(--rh-faint)" }}>Legal eligibility, separate from the cities you'd actually want to work in above.</p>
      <div className="flex flex-wrap gap-2 mt-1.5">
        {WORK_COUNTRIES.map(c => (
          <button
            key={c}
            type="button"
            onClick={() => toggleCountry(c)}
            className="px-3 py-1.5 text-xs rounded-md border transition-colors font-medium"
            style={countries.includes(c)
              ? { background: "var(--rh-gradient)", color: "#fff", borderColor: "transparent" }
              : { borderColor: "var(--rh-hair)", color: "var(--rh-muted)" }}
          >
            {c}
          </button>
        ))}
      </div>
    </div>
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <PlainField
        label="Citizenship"
        value={workAuth.citizenship || ""}
        onChange={v => setWA("citizenship", v)}
        onBlur={queueSave}
        placeholder="e.g. Canada"
      />
      {nonCitizenCountries.length > 0 && (
        <>
          <PlainField
            label="Work permit expires (optional)"
            type="date"
            value={workAuth.work_permit_expires || ""}
            onChange={v => setWA("work_permit_expires", v)}
            onBlur={queueSave}
          />
          {/* v3.71.0 — this was already asked in every scoring/tailoring
              prompt (WORK_AUTH: ..., visa=n/a) with no field anywhere to
              answer it, so the AI never once actually knew it. */}
          <PlainField
            label="Visa type (optional)"
            value={workAuth.visa_type || ""}
            onChange={v => setWA("visa_type", v)}
            onBlur={queueSave}
            placeholder="e.g. H-1B, TN, Work permit"
          />
        </>
      )}
      <Toggle label="I need sponsorship now" value={!!workAuth.needs_sponsorship_now} onChange={v => { setWA("needs_sponsorship_now", v); queueSave(); }} />
      <Toggle label="I will need sponsorship later" value={!!workAuth.needs_sponsorship_future} onChange={v => { setWA("needs_sponsorship_future", v); queueSave(); }} />
    </div>
    </>
  );
}
