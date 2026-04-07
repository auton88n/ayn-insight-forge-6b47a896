
Fix the overlap by adding real vertical separation below the map hero, not just padding inside the cards section.

1. Update the world hero wrapper in `src/pages/WorldIntelligence.tsx`
- Add responsive bottom margin to the map section itself, so the next cards start clearly lower.
- Use a larger gap on tablet/mobile where the overlap is happening most, for example `mb-8 sm:mb-10 md:mb-12`.

2. Keep the cards grid out of the map’s visual zone
- Reduce/remove the current reliance on `pt-6 sm:pt-8` for separation.
- Let the spacing come primarily from the hero container’s bottom margin so the cards are physically pushed down.

3. Tune the floating overlays around the map
- Slightly raise or tighten the Agent Society pill so it does not compete with the lower edge of the globe.
- If needed, adjust the HeatMap legend position on smaller screens so it sits a bit higher inside the map and leaves a cleaner boundary above the cards.

4. Preserve tablet layout quality
- Keep the current `md` side-by-side card layout, but ensure the first card row begins after the map section ends.
- Verify the fix specifically at the current tablet viewport (~768px wide), where the screenshot shows the issue.

Technical details
- Primary file: `src/pages/WorldIntelligence.tsx`
- Secondary file if needed: `src/components/dashboard/HeatMap2D.tsx`
- Most likely change:
```text
<Map hero container className/style>
  add bottom spacing here
↓
<cards wrapper>
  reduce compensating top padding if it becomes redundant
```
- Root cause: the map’s internal bottom overlays (like the Signal Key) visually extend to the lower edge, while the next section begins too close beneath it.
