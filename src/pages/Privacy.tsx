// v3.32.0 — the Privacy body now lives in src/content/legal/privacy.md.
// The route is unchanged because it is indexed and linked from the signup
// consent checkbox.
import LegalPage from '@/components/legal/LegalPage';

export default function Privacy() {
  return <LegalPage slug="privacy" />;
}
