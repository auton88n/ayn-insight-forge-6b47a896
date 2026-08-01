// v3.32.0 — the Terms body now lives in src/content/legal/terms.md.
// The route is unchanged because it is indexed and linked from the signup
// consent checkbox.
import LegalPage from '@/components/legal/LegalPage';

export default function Terms() {
  return <LegalPage slug="terms" />;
}
