// Performance pass: one work-history card, extracted from ProfileTab.tsx and
// wrapped in React.memo. ProfileTab holds every field on the page in one
// component, so typing a character into one role's Title used to re-render
// every other role's whole form (each with many fields plus a bullet list).
// A card now re-renders only when its own `exp` object changes: updateAt
// replaces only the edited element, so untouched roles keep the same object
// identity and are skipped. Markup and behaviour are otherwise identical to
// the old inline block.
import { memo } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Plus, X } from "lucide-react";
import type { Exp } from "./profileTypes";
import { PlainField } from "./ProfileFormPrimitives";

interface ExperienceCardProps {
  exp: Exp;
  index: number;
  onChange: (index: number, next: Exp) => void;
  onRemove: (index: number) => void;
  onBlurSave: () => void;
}

function ExperienceCardImpl({ exp: e, index: i, onChange: updateExp, onRemove, onBlurSave: queueSave }: ExperienceCardProps) {
  return (
    <div className="rounded-lg border p-3 space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <PlainField label="Title" value={e.title} onChange={v => updateExp(i, { ...e, title: v })} onBlur={queueSave} />
        <PlainField label="Company" value={e.company} onChange={v => updateExp(i, { ...e, company: v })} onBlur={queueSave} />
        <PlainField label="Start" value={e.start || ""} onChange={v => updateExp(i, { ...e, start: v })} onBlur={queueSave} placeholder="2022-01" />
        <PlainField
          label="End"
          value={e.current ? "Present" : (e.end || "")}
          onChange={v => updateExp(i, { ...e, end: v })}
          onBlur={queueSave}
          placeholder="2024-06"
          disabled={e.current}
        />
        <PlainField label="Location" value={e.location || ""} onChange={v => updateExp(i, { ...e, location: v })} onBlur={queueSave} placeholder="City, or Remote" />
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Industry or domain</Label>
          <Input
            list="ayn-industries"
            value={e.industry || ""}
            onChange={ev => updateExp(i, { ...e, industry: ev.target.value })}
            onBlur={queueSave}
            placeholder="Fintech, healthcare, enterprise SaaS"
          />
        </div>
        <PlainField
          label="Team size managed (optional)"
          type="number"
          value={e.team_size == null ? "" : String(e.team_size)}
          onChange={v => updateExp(i, { ...e, team_size: v === "" ? null : Number(v) })}
          onBlur={queueSave}
        />
        <label className="flex items-center justify-between rounded-md border px-3 py-2 text-sm self-end">
          <span>Current role</span>
          {/* Turning this on clears End (shown disabled with "Present"
              above); turning it off hands End back for a real date. */}
          <Switch checked={!!e.current} onCheckedChange={v => updateExp(i, { ...e, current: v, end: v ? "" : e.end })} />
        </label>
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center gap-2">
          <Label className="text-xs text-muted-foreground">Achievements</Label>
          {e.bullets_from_resume && <Badge variant="outline" className="text-[10px] font-normal">From your resume</Badge>}
        </div>
        <p className="text-[11px] text-muted-foreground">
          These are the lines tailoring rewrites for each job. Empty here means tailoring has nothing to work with.
        </p>
        {(e.bullets ?? []).map((b, bi) => (
          <div key={bi} className="flex gap-2">
            <Textarea
              rows={2}
              value={b}
              placeholder="Cut checkout latency by 40 percent for 2 million monthly users"
              onChange={ev => {
                const next = [...(e.bullets ?? [])];
                next[bi] = ev.target.value;
                updateExp(i, { ...e, bullets: next });
              }}
              onBlur={queueSave}
            />
            <Button variant="ghost" size="icon" onClick={() => {
              updateExp(i, { ...e, bullets: (e.bullets ?? []).filter((_, j) => j !== bi) });
            }}><X className="w-4 h-4" /></Button>
          </div>
        ))}
        {(e.bullets ?? []).length < 5 && (
          <Button variant="ghost" size="sm" onClick={() => updateExp(i, { ...e, bullets: [...(e.bullets ?? []), ""] })}>
            <Plus className="w-3.5 h-3.5 mr-1" /> Add achievement
          </Button>
        )}
        {(e.bullets ?? []).filter(Boolean).length > 0 && (e.bullets ?? []).filter(Boolean).length < 2 && (
          <p className="text-[11px] text-muted-foreground">Two to five achievements give tailoring enough to choose from.</p>
        )}
      </div>

      <div className="flex justify-end">
        <Button variant="ghost" size="sm" onClick={() => onRemove(i)}>Remove role</Button>
      </div>
    </div>
  );
}

export const ExperienceCard = memo(ExperienceCardImpl);
