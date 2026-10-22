# Design system architecture

## Source of truth

Each OpenCanvas project stores its design system in `.opencanvas/design-system.json`.

- Tokens (primitive + semantic), themes, component registry metadata, and a short change history live there.
- Generated CSS custom properties are written to `src/design-tokens.css` and imported by the project entry so the live preview updates when tokens change.
- Per-element canvas styles remain in `src/open-canvas.css` (`data-oc` rules). Prefer `var(--token)` over literals when binding to the system.

The legacy `direction.designSystem` flat snapshot (imported CSS/JSON for AI context) is migrated into the document on open/import. Direction still holds taste/references; the engine owns tokens.

## Override vs shared token

| User intent | Behavior |
|-------------|----------|
| Change one element | Write a local style (literal or `var(--token)`). Do **not** edit the shared token. |
| Edit token | Update the document → regenerate CSS → all `var(--…)` usages update. |
| Create token from value | Add a semantic token, then replace the element style with `var(--…)`. |

## Themes

Themes share the same token ids. Light values live on `:root`; dark overrides on `[data-theme="dark"]` / `.dark`. Preview theme switching sets `data-theme` on the preview document when supported.

## AI

Agents should call `get_design_system` / `get_design_direction` before inventing colors or components, prefer existing semantic tokens, and summarize impact before broad token edits.
