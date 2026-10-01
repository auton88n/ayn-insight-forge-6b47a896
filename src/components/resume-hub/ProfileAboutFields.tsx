// The "About you" personal-details fields of the Profile form. Extracted from
// ProfileTab.tsx; markup and behaviour are unchanged.
import type { Derived, PersonalKey } from "./profileTypes";
import { SourcedField } from "./ProfileFormPrimitives";

type SourcedValue = { value: string; source: "resume" | "edited" | "none"; original?: string };

interface AboutYouFieldsProps {
  field: (key: PersonalKey) => SourcedValue;
  derivedField: (key: "current_title" | "current_company") => SourcedValue;
  setPersonalField: (key: PersonalKey, value: string) => void;
  setDerived: (key: keyof Derived, value: unknown) => void;
  queueSave: () => void;
}

export function AboutYouFields({ field, derivedField, setPersonalField, setDerived, queueSave }: AboutYouFieldsProps) {
  return (
    <>
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <SourcedField label="First name" f={field("first_name")} onChange={v => setPersonalField("first_name", v)} onBlur={queueSave} onRevert={v => { setPersonalField("first_name", v); queueSave(); }} />
      <SourcedField label="Last name" f={field("last_name")} onChange={v => setPersonalField("last_name", v)} onBlur={queueSave} onRevert={v => { setPersonalField("last_name", v); queueSave(); }} />
      <SourcedField label="Email" f={field("email")} onChange={v => setPersonalField("email", v)} onBlur={queueSave} onRevert={v => { setPersonalField("email", v); queueSave(); }} />
      <SourcedField label="Phone" f={field("phone")} onChange={v => setPersonalField("phone", v)} onBlur={queueSave} onRevert={v => { setPersonalField("phone", v); queueSave(); }} />
      <SourcedField label="Location" f={field("city")} onChange={v => setPersonalField("city", v)} onBlur={queueSave} placeholder="City, region" onRevert={v => { setPersonalField("city", v); queueSave(); }} />
      <SourcedField label="Current title" f={derivedField("current_title")} onChange={v => setDerived("current_title", v)} onBlur={queueSave} onRevert={v => { setDerived("current_title", v); queueSave(); }} />
      <SourcedField label="Current company" f={derivedField("current_company")} onChange={v => setDerived("current_company", v)} onBlur={queueSave} onRevert={v => { setDerived("current_company", v); queueSave(); }} />
      <SourcedField label="LinkedIn" f={field("linkedin")} onChange={v => setPersonalField("linkedin", v)} onBlur={queueSave} placeholder="https://" onRevert={v => { setPersonalField("linkedin", v); queueSave(); }} />
      <SourcedField label="GitHub" f={field("github")} onChange={v => setPersonalField("github", v)} onBlur={queueSave} placeholder="https://" onRevert={v => { setPersonalField("github", v); queueSave(); }} />
      <SourcedField label="Portfolio" f={field("portfolio")} onChange={v => setPersonalField("portfolio", v)} onBlur={queueSave} placeholder="https://" onRevert={v => { setPersonalField("portfolio", v); queueSave(); }} />
    </div>
    </>
  );
}
