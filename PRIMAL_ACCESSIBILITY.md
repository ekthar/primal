# Primal · Accessibility statement

Phase 6 of the Primal OS PDF + UI redesign commits Primal to a practical
WCAG 2.2 AA baseline across both the web app and the generated PDF exports.
This document captures the current state, how it is enforced in code, and
what is explicitly deferred to future work.

## In scope (enforced today)

### Web application — WCAG 2.2 AA

| Criterion | How it is enforced |
|---|---|
| **1.3.1 Info and Relationships** | Semantic HTML primitives (`<main>`, `<nav>`, `<section>`, `<h1>`–`<h3>`) used consistently across pages; Radix UI primitives provide correct ARIA roles for dialogs, menus, tabs, selects. |
| **1.4.3 Contrast (Minimum)** | The Primal OS palette (paper `#FAFAF7`, ink `#0A0A0A`, accent `#7A1E22`, verify `#0F7B5C`) is contrast-audited in `tests/pdf-tokens.test.js` — every critical text/background pair must hit AA (≥ 4.5). The ink-red accent pair is additionally asserted at AAA (≥ 7). |
| **1.4.13 Content on Hover or Focus** | Tooltips (Radix `Tooltip`) remain dismissable and persistent per spec. |
| **2.1.1 Keyboard** | All interactive elements are keyboard reachable. The command palette (⌘K / Ctrl+K) gives keyboard users a first-class navigation + export path. |
| **2.3.3 Animation from Interactions** | `prefers-reduced-motion: reduce` globally squashes animations and transitions to 0.01ms. See `frontend/src/index.css`. |
| **2.4.1 Bypass Blocks** | "Skip to main content" link is the first focusable element on every protected page (`AppShell`), jumping to `<main id="main-content" tabIndex={-1}>`. |
| **2.4.7 Focus Visible** | Global `:focus-visible` rule applies a 2px `ring` outline on every tab-focused element. Existing `.focus-ring` utility continues to apply the same behavior on buttons via Tailwind. |
| **3.1.1 Language of Page** | `<html lang="en">` set in `pages/_document.js`. |

### PDF exports

| Criterion | How it is enforced |
|---|---|
| **Tagged PDF structure enabled** | `baseDocumentOptions()` sets `tagged: true`, `pdfVersion: '1.7'`, and `lang: 'en-US'` on every generated PDF (Application, Bracket, Division Bracket, Analytics, Season). Verified by `tests/pdf-tokens.test.js`. |
| **Document title displayed** | `displayTitle: true` makes readers show `Info.Title` instead of the filename. Each export supplies a meaningful title via `buildPdfInfo()`. |
| **Grayscale-safe state encoding** | Every status uses icon shape + text label + tonal band (see `STATUS_SPEC` in `pdfTokens.js`). Never color-only. Verified visually by Phase 1 smoke renders. |
| **Page numbers and signature** | `finalizePageRibbons()` stamps `Page N of M · SIG · timestamp` on every page so a lost page is always identifiable. |

## Explicitly deferred

- **Full PDF/UA (ISO 14289) certification.** This requires a complete
  structure tree with tagged paragraphs, alt text on every image via
  `/Alt` entries, and reading-order metadata. PDFKit's support is
  partial and would require a substantial rewrite of every template.
  The current exports are *tagged* but not *PDF/UA conformant*. A
  downstream pass (Phase 8+ or a dedicated accessibility sprint)
  should layer this on using tools like `pdfkit-tagged` or
  post-processing with `qpdf` / `veraPDF`.
- **Screen-reader verification of individual PDFs.** The base tagging
  is in place, but we have not yet run manual NVDA / JAWS / VoiceOver
  passes on each template. Pair this with PDF/UA work.
- **WCAG 2.2 AAA in the app.** The palette hits AAA for body text on
  paper, but several informational accents (amber warn, muted text
  tertiary) are at AA, not AAA. AAA is not a target for Phase 6.

## How to verify locally

```bash
cd backend-node && npm test            # 64 tests, including contrast audit
cd frontend && npx next build          # builds, lints, type-checks
```

To manually verify the skip-link on the web app: load any protected
page, press Tab once — the first focus stop should be the "Skip to main
content" button; pressing Enter should move focus past the sidebar
directly into `<main>`.

## Ownership

The Primal OS palette and tagged-PDF foundations live in
`backend-node/src/services/pdfTokens.js`. The frontend a11y primitives
live in `frontend/src/index.css` and `frontend/src/components/layout/AppShell.jsx`.
Any regressions to the contrast audit will fail CI.
