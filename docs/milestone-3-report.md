# Milestone 3 report — Variants and build animation

## Shipped

### Variants
- Preview frames load with `?ocv=<id>`; the Vite plugin tags entry modules and propagates the tag through `src/` imports. Overrides are served from `.opencanvas/variants/<id>/…` while real project files stay untouched. CSS and `node_modules` remain shared.
- Shared types and limits in `shared/variants.ts` (`1–4` variants, 40 KB JSX cap, 7-day prune).
- Store in `electron/services/variants.ts`: propose → ready override, apply (one undo, stale when the file hash or element is gone), discard / discard set, gitignore + export exclusion.
- In-app generation uses a read-only tool set plus `ask_user` and `propose_variant`, with focused element / direction context. MCP exposes `propose_variant`, `list_variants`, and `apply_variant` (no approval gate).
- Dock Variants panel: empty / no-AI / selected / generating / cards with Show, Apply, Discard, Retry, Keep original, Discard all; keyboard Enter / A / Delete.
- Temporary canvas frames labelled `Variant A: …` sit below the source frame (store-only, never in `canvas.json`).

### Build animation
- `shared/build-stages.ts`: stages Grid → Padding → Layout → Skeleton → Finished Design; pure `reduceBuild` driven by `AiEvent`.
- Stage colour tokens (`--oc-stage-*`) for light and dark.
- Bridge `measure-subtree` returns boxes, padding, kind, and depth.
- `BuildOverlay` in the canvas world layer: legend, polite live region, ~400 ms derived stages, click / Escape to skip, reduced-motion swaps without motion, cleanup on finish / stop / fail.

## Verification

| Check | Result |
| --- | --- |
| `npm run typecheck` | Pass |
| Unit: `variants`, `build-stages`, `source`, `ai`, canvas, export-validate | Pass |
| Dock state fixtures | `variants-empty`, `variants-ready`, `variants-cards`, `variants-no-ai`, `build-grid`, `build-layout` |
| E2E (mock AI) | Added: generate 2 variants (source unchanged → apply → undo); structural insert shows `data-stage` and cleans up |

## Notes
- Variant frames are read-only for editor selection (selection messages from `variant:*` iframes are ignored).
- Structural tools that trigger the overlay: `insert_jsx`, `insert_element`, `write_file`, `propose_variant`. Style / text tools keep the light AI feedback path.
- Out of scope (milestone 4): integrated terminal polish beyond existing, react-router / Next import adapters, export validation expansion.
