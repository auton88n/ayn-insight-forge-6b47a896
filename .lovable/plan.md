

## Translate Landing Page Fully to Arabic and French

### Problem
The `LandingChatInput.tsx` component has English-only placeholder texts. The rest of the landing page (Hero, LandingPage, Header, Footer) already has inline AR/FR translations.

### Changes

**1. `src/components/landing/LandingChatInput.tsx`**
- Accept `language` from `useLanguage()` context
- Replace the hardcoded English `placeholders` array with language-aware placeholders:
  - EN: "What's happening with oil prices?", "Analyze this market for me...", "What are the risks for my business?"
  - AR: "ماذا يحدث مع أسعار النفط؟", "حلل لي هذا السوق...", "ما المخاطر التي تواجه أعمالي؟"
  - FR: "Que se passe-t-il avec le prix du pétrole?", "Analysez ce marché pour moi...", "Quels sont les risques pour mon entreprise?"

**2. Fix pre-existing build errors** (unrelated but blocking)
- `ChatInput.tsx(657)`: Cast string to `AIMode` type
- `AgentSociety.tsx(909)`: Add missing `cn` import
- `usePredictionGraph.ts` & `PredictionControlPanel.tsx` & `WorldIntelligence.tsx`: Add `as any` casts for table names not yet in Supabase types

### Technical Details
- Use `useMemo` to derive the correct placeholder array based on `language`, so it updates reactively when the user switches language
- No changes needed to the i18n translation files since the landing page uses inline translations (consistent with existing pattern)

