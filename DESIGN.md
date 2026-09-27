---
name: AYN workspace
description: Document-first working surfaces in AYN's existing charcoal and ember identity.
colors:
  ink: '#241e1a'
  muted: '#675e57'
  canvas: '#faf8f3'
  surface: '#ffffff'
  divider: '#d9d1c9'
  selected-text: '#913817'
  selected-surface: '#fae6db'
  focus: '#a43f21'
  ember: 'hsl(13 79% 57%)'
  ember-end: 'hsl(24 85% 58%)'
  public-canvas: 'hsl(36 38% 98%)'
  public-ink: 'hsl(20 14% 13%)'
typography:
  headline:
    fontFamily: 'Outfit, system-ui, sans-serif'
    fontSize: 32px
    fontWeight: 700
    lineHeight: 1.18
    letterSpacing: '-.025em'
  title:
    fontFamily: 'Outfit, Figtree, sans-serif'
    fontSize: 20px
    fontWeight: 600
    lineHeight: 1.4
  answer:
    fontFamily: 'Figtree, system-ui, sans-serif'
    fontSize: 15px
    lineHeight: 1.7
  button:
    fontFamily: 'Figtree, system-ui, sans-serif'
    fontSize: 14px
    fontWeight: 600
    lineHeight: 1.35
rounded:
  control: 8px
  panel: 12px
  chip: 999px
spacing:
  small: 8px
  medium: 16px
  large: 24px
components:
  button-primary:
    textColor: '{colors.ink}'
    rounded: '{rounded.control}'
    padding: '10px 16px'
  button-ghost:
    backgroundColor: '{colors.surface}'
    rounded: '{rounded.control}'
    padding: '10px 16px'
  help-topic-selected:
    backgroundColor: '{colors.selected-surface}'
    textColor: '{colors.selected-text}'
    rounded: '{rounded.control}'
    padding: 12px
---

# AYN design system

## Overview

Preserve the real AYN wordmark, charcoal/ember identity, and document-first workspace approved by the founder. This records the shared workspace and supporting-page treatment, not a claim that every legacy surface has been migrated.

Source evidence: `src/styles/workspace.css`, the inherited landing rules in `src/index.css`, and `src/components/landing/HomeTabs.tsx`. Product constraints remain in `PRODUCT.md`; surface strategy remains in `docs/design/workspace.md`. No new creative metaphor or imagery is established here.

## Colors

White working surfaces sit on warm paper. Charcoal carries content; muted text carries explanation. Ember marks primary actions and selected states. Keep the existing primary-button gradient from the landing stylesheet; do not invent a replacement brand color.

The public shell inherits `public-canvas` and `public-ink`; workspace fields and account surfaces use the separate `canvas` and `ink` values. These are not exact aliases. The existing gradient runs at 135 degrees from ember to ember-end. Focus uses the darker focus color. Gradient CSS belongs in the sidecar, not a `backgroundColor` token.

## Typography

Outfit headings, Figtree body text. Workspace headings use 32px desktop and 28px mobile; section titles use 20px. Body content uses 14–16px with generous line height. Keep answer prose within 70 characters per line where practical.

Supporting-page display headings use the headline token (700 weight); account workspace headings use 600 weight and 1.2 line height. Help topic titles use the title token, while feature titles use Outfit with a system-ui fallback. The 28px heading override begins at 900px. Leads use 16px/1.6 and a 68ch measure, becoming 15px at 640px. Answer text uses the answer token and a 70ch maximum.

## Layout

Use the shared shell and navigation rather than independently centering each page. Help has a topic column and an answer column, collapsing to wrapping topic controls on mobile. Pricing moves from four columns to two, then one. Search and document reading are distinct mobile modes.

The shell caps at 1320px, with 32px horizontal padding, reducing to 24px at 1100px and 20px at 900px. The navigation rail is 224px, or 68px when collapsed. Help uses a 220px topic column, an answer column up to 760px, and a 40px gap; at 700px it becomes one column with a 28px gap. Pricing uses 16px gaps and changes to two columns at 1200px and one at 480px. The feature directory uses two columns separated by 40px, becoming one at 700px. Job reading becomes a separate mode at 1023px. About retains a 720px reading cap and Contact a 640px form cap inside the shared shell.

## Elevation & Depth

Working panels are flat. Use neutral separators and surface differences rather than floating shadows or hover lifts. Existing dialogs retain their own overlay treatment.

Button background and border transitions and disclosure-chevron rotation use 150ms ease. Workspace reveal animations are disabled. Reduced motion shortens scoped animation and transition durations to .01ms and restores automatic scrolling. Inherited border-color hover feedback remains on tiles; flat does not mean all states are identical.

## Shapes

Controls use the control radius; standalone working panels use the panel radius. FAQ and help answers form a continuous list of disclosures, not stacks of rounded cards.

These are defaults, not a universal radius replacement: existing informational chips retain their pill shape, navigation links use 7px corners, and document previews use 2px corners. Feature directory entries have square edges and top dividers.

## Components

Preserve native disclosure keyboard behavior. Selected Help topics expose their state with aria-pressed. Focus uses a visible outline. Keep a clear primary action, readable disabled states, and the actual authentication and billing gates.

- Buttons: primary uses the retained ember gradient with ink text; ghost uses a white surface and divider border. Both use 10px by 16px padding and a 42px minimum height. Primary hover/active applies brightness(.98); disabled native buttons use .6 opacity. The existing inverted button remains on the Features closing section.
- Focus: links, buttons, inputs and summaries receive a 2px focus outline with 3px offset. The job-search field instead outlines its enclosing field on focus-within, with 2px offset.
- Help: topic controls have a 44px minimum height. Search filters question and answer text across topics, exposes a result count, and opens matching answers. Choosing a topic clears search. The sidecar's topic example is a state specimen, not a replacement for this React behavior.
- Disclosures: summaries use 16px semibold text and 20px vertical padding; answers have 24px bottom padding. The chevron rotates when the native details element opens.
- Pricing: panels use 24px by 20px padding. The featured plan retains its warm surface and ember border; current and busy plan buttons are disabled. Keep plan data in the application rather than copying prices into reusable design examples.
- Inputs: the sidecar records the custom job-search field. Help uses the existing shared Input with a 48px height, 8px radius and leading search icon; it is a separate implementation.

The sidecar contains framework-free component specimens with literal CSS where tokens are locally scoped and fallback values where inherited tokens are used. It adds no raster assets. Documentation verification is source-based; it does not certify live payment, authentication, or accessibility journeys.

## Do's and Don'ts

- Do preserve logo assets, prices, credit rules and document-generation behavior.
- Do verify narrow layouts and real interaction states, not just desktop screenshots.
- Don't add glass, decorative motion or repeated icon cards to make a page appear finished.
- Don't describe local fixture tests as production payment or authenticated-account verification.
