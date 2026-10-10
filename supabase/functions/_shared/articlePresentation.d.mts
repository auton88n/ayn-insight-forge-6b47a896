export function presentArticle<T extends {
  source_data?: object | null;
  category?: string | null;
  city?: string | null;
  kind?: string;
  body_md?: string;
}>(article: T): T & {
  title: string;
  dek: string;
  meta_description: string;
  body_md: string;
  faq: null;
};
