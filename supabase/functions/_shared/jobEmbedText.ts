// What gets turned into a vector for a job posting. Title and level first, because they carry the
// most signal about what the role actually is, then the start of the description (where the
// responsibilities and requirements live). Boilerplate at the end of a posting (benefits, equal
// opportunity statements) adds noise, so the description is cut short.
export interface JobEmbedFields {
  title?: string | null;
  company?: string | null;
  category?: string | null;
  seniority?: string | null;
  location?: string | null;
  description?: string | null;
}

const DESCRIPTION_CHARS = 2500;

export function jobEmbedInput(j: JobEmbedFields): string {
  const head = [
    j.title ? `Job title: ${j.title}` : "",
    j.seniority ? `Level: ${String(j.seniority).replace(/_/g, " ")}` : "",
    j.category ? `Field: ${String(j.category).replace(/_/g, " ")}` : "",
  ].filter(Boolean).join("\n");
  const body = String(j.description || "").replace(/\s+/g, " ").trim().slice(0, DESCRIPTION_CHARS);
  return `${head}\n${body}`.trim();
}
