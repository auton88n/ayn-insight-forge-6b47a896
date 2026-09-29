// v3.330.0 — extracted from ProfileTab.tsx as part of splitting that
// 1,874-line file into focused pieces. The small, self-contained form
// primitives the whole page is built from (Group, PlainField,
// SourcedField, OptionRow/OptionRowMulti, MultiSelect, SingleSelect,
// Toggle, BulkAdd, ChipList) plus the two generic array-update helpers
// (updateAt/removeAt) that operate on the Career type these primitives
// feed. Pure code movement, zero logic changes.
//
// v3.172.0 — extended the same Charcoal & Ember system onto Profile that
// Browse Jobs, Saved jobs, Home, Proposals and Assessments already picked
// up in this same pass. Fixed at these shared primitives every field group
// on the page is built from, not at each of the ~30 individual call sites
// in ProfileTab.tsx, so the whole page picks up the system from one real
// fix instead of dozens of copy-pasted ones. Found the same un-tokened-
// button bug this app has already fixed in several other places
// (employer-surface, contact-surface, settings-surface, resume-hub.css's
// own button.bg-foreground retint): OptionRow/OptionRowMulti's own
// active-chip state used shadcn's bare `bg-primary`, which resolves to
// this app's default near-black, not AYN's own ember — every selected
// chip on this entire page (seniority, work eligibility, employment
// type, dozens of others) was rendering black instead of on-brand.
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ChevronDown, Undo2, X } from "lucide-react";
import type { Career } from "./profileTypes";

// v3.235.0 -- the heading here was plain rh-display at 15px, no accent,
// no more visual weight than the muted description line right under it.
// The marketing pages' own section headings all carry a short ember
// accent mark ahead of the eyebrow text (.lp-eyebrow::before); this is
// the same signature scaled down for a dense, repeated form section
// rather than a full page heading.
export function Group({ id, title, line, children, hidden = false }: { id: string; title: string; line: string; children: React.ReactNode; hidden?: boolean }) {
  const key = `ayn_profile_group_${id}`;
  const [open, setOpen] = useState(() => { try { return sessionStorage.getItem(key) !== 'closed'; } catch { return true; } });
  const toggle = () => setOpen(o => { try { sessionStorage.setItem(key, o ? 'closed' : 'open'); } catch { /* optional view preference */ } return !o; });
  return (
    <Card hidden={hidden} className="p-4 sm:p-6 rounded-xl ayn-profile-group" style={{ borderColor: "var(--rh-hair)", boxShadow: "var(--rh-shadow-card)" }}>
      <button type="button" onClick={toggle} aria-expanded={open} aria-controls={`profile-group-${id}`} className="w-full flex items-start justify-between gap-3 text-left">
        <div>
          <h3 className="rh-display flex items-center gap-2" style={{ fontSize: 16.5 }}>
            {title}
          </h3>
          <p className="text-xs mt-1" style={{ color: "var(--rh-muted)" }}>{line}</p>
        </div>
        <ChevronDown className={`w-4 h-4 mt-1 shrink-0 transition-transform ${open ? "" : "-rotate-90"}`} style={{ color: "var(--rh-faint)" }} />
      </button>
      {open && <div id={`profile-group-${id}`} className="space-y-4 mt-4">{children}</div>}
    </Card>
  );
}

export function PlainField({
  label, value, onChange, onBlur, placeholder, type, disabled,
}: {
  label: string; value: string; onChange: (v: string) => void; onBlur?: () => void; placeholder?: string; type?: string; disabled?: boolean;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs" style={{ color: "var(--rh-muted)" }}>{label}</Label>
      <Input value={value} onChange={e => onChange(e.target.value)} onBlur={onBlur} placeholder={placeholder} type={type} disabled={disabled} />
    </div>
  );
}

export function SourcedField({
  label, f, onChange, onBlur, onRevert, placeholder, type,
}: {
  label: string;
  f: { value: string; source: "resume" | "edited" | "none"; original?: string };
  onChange: (v: string) => void;
  onBlur?: () => void;
  onRevert?: (original: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs" style={{ color: "var(--rh-muted)" }}>{label}</Label>
      <Input value={f.value} onChange={e => onChange(e.target.value)} onBlur={onBlur} placeholder={placeholder} type={type} />
      {f.source === "resume" && <p className="text-[11px]" style={{ color: "var(--rh-faint)" }}>From your resume</p>}
      {f.source === "edited" && (
        <p className="text-[11px] flex items-center gap-1.5" style={{ color: "var(--rh-faint)" }}>
          Edited by you
          <button
            type="button"
            className="inline-flex items-center gap-1 underline"
            style={{ color: "var(--rh-accent-2)" }}
            onClick={() => onRevert?.(f.original || "")}
          >
            <Undo2 className="w-3 h-3" /> Use resume value
          </button>
        </p>
      )}
    </div>
  );
}

export function OptionRow({
  label, options, value, onChange,
}: {
  label: string;
  options: { value: string; label: string }[];
  value: string | null;
  onChange: (v: string | null) => void;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs" style={{ color: "var(--rh-muted)" }}>{label}</Label>
      <div className="flex flex-wrap gap-1.5">
        {options.map(o => {
          const active = value === o.value;
          return (
            <button
              key={o.value}
              type="button"
              onClick={() => onChange(active ? null : o.value)}
              className="px-2.5 py-1 text-xs rounded-md border transition-colors font-medium"
              style={active
                ? { background: "var(--rh-gradient)", color: "#fff", borderColor: "transparent" }
                : { borderColor: "var(--rh-hair)", color: "var(--rh-muted)" }}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function MultiSelect({ label, options, values, onChange }: { label: string; options: string[]; values: string[]; onChange: (v: string[]) => void }) {
  return (
    <OptionRowMulti label={label} options={options} values={values} onChange={onChange} />
  );
}

export function OptionRowMulti({ label, options, values, onChange }: { label: string; options: string[]; values: string[]; onChange: (v: string[]) => void }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs" style={{ color: "var(--rh-muted)" }}>{label}</Label>
      <div className="flex flex-wrap gap-1.5">
        {options.map(o => {
          const on = values.includes(o);
          return (
            <button
              key={o}
              type="button"
              onClick={() => onChange(on ? values.filter(v => v !== o) : [...values, o])}
              className="px-2.5 py-1 text-xs rounded-md border transition-colors font-medium"
              style={on
                ? { background: "var(--rh-gradient)", color: "#fff", borderColor: "transparent" }
                : { borderColor: "var(--rh-hair)", color: "var(--rh-muted)" }}
            >
              {o}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function SingleSelect({ label, options, value, onChange }: { label: string; options: string[]; value: string; onChange: (v: string) => void }) {
  return (
    <OptionRow
      label={label}
      options={options.map(o => ({ value: o, label: o }))}
      value={value || null}
      onChange={v => onChange(v || "")}
    />
  );
}

export function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center justify-between rounded-md border px-3 py-2 text-sm" style={{ borderColor: "var(--rh-hair)" }}>
      <span>{label}</span>
      <Switch checked={value} onCheckedChange={onChange} />
    </label>
  );
}

export function BulkAdd({ placeholder, onAdd }: { placeholder: string; onAdd: (values: string[]) => void }) {
  const [draft, setDraft] = useState("");
  const commit = () => {
    const names = draft.split(/[,\n]/).map(s => s.trim()).filter(Boolean);
    if (!names.length) return;
    onAdd(names);
    setDraft("");
  };
  return (
    <div className="flex gap-2">
      <Input
        placeholder={placeholder}
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); commit(); } }}
      />
      <Button type="button" variant="outline" size="sm" onClick={commit}>Add</Button>
    </div>
  );
}

export function ChipList({ label, hint, values, onChange, placeholder }: { label: string; hint?: string; values: string[]; onChange: (v: string[]) => void; placeholder?: string }) {
  const [draft, setDraft] = useState("");
  const add = () => {
    const v = draft.trim();
    if (!v) return;
    onChange([...values, v]);
    setDraft("");
  };
  return (
    <div className="space-y-1">
      <Label className="text-xs" style={{ color: "var(--rh-muted)" }}>{label}</Label>
      {hint && <p className="text-[11px]" style={{ color: "var(--rh-faint)" }}>{hint}</p>}
      <div className="flex flex-wrap gap-1 mb-1">
        {values.map((v, i) => (
          <span key={i} className="inline-flex items-center gap-1 text-xs font-semibold rounded-full px-2.5 py-1" style={{ background: "var(--rh-trust-tint)", color: "var(--rh-trust)" }}>
            {v}
            <button onClick={() => onChange(values.filter((_, j) => j !== i))} className="opacity-60 hover:opacity-100"><X className="w-3 h-3" /></button>
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <Input placeholder={placeholder} value={draft} onChange={e => setDraft(e.target.value)} onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); add(); } }} />
        <Button type="button" variant="outline" size="sm" onClick={add}>Add</Button>
      </div>
    </div>
  );
}

export function updateAt<K extends "skills" | "experiences" | "education" | "certifications">(
  setCareer: React.Dispatch<React.SetStateAction<Career>>, key: K, i: number, value: Career[K][number]
) {
  setCareer(p => {
    const arr = [...p[key]] as Career[K];
    (arr as unknown as Array<Career[K][number]>)[i] = value;
    return { ...p, [key]: arr };
  });
}

export function removeAt<K extends "skills" | "experiences" | "education" | "certifications">(
  setCareer: React.Dispatch<React.SetStateAction<Career>>, key: K, i: number
) {
  setCareer(p => {
    const arr = (p[key] as unknown as Array<Career[K][number]>).filter((_, j) => j !== i);
    return { ...p, [key]: arr as Career[K] };
  });
}
