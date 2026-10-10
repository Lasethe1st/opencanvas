# OpenCanvas

A desktop visual development environment for React + Vite projects. Edit visually on a live canvas or in code — the source files stay the single source of truth.

## Getting started

```bash
npm install
npm run dev      # renderer dev server + Electron with live reload
npm start        # production build, then launch
```

Behind a corporate proxy or TLS-intercepting antivirus on Windows, `npm install` may fail with `UNABLE_TO_VERIFY_LEAF_SIGNATURE`; set `NODE_OPTIONS=--use-system-ca` first.

## Tests

```bash
npm run typecheck
npm test          # source transforms, project workflow, preview server, export
npm run test:e2e  # drives the built Electron app end to end (add -- --skip-install to skip building the exported ZIP)
```

The E2E run creates a blank project, inserts elements, navigates the canvas, edits styles and text (in the inspector and inline on the canvas), uses undo/redo, writes a mobile override from the mobile frame, adds and resizes frames, exports a ZIP, installs and builds it outside the app, then reopens it as an existing project and edits it visually and in Monaco. Screenshots land in `tests/e2e/screenshots`.

## Where the UI comes from

OpenCanvas v1 was designed in Open Canvas Light. The design project (`opencanvas-v1-ui`) was built and polished inside Light, then exported with Light's ZIP export. The exported files are used here unchanged:

- `src/ui/*.jsx`: the presentational components (top bar, panels, tree rows, canvas, inspector, code view, start screen, dialogs). The free canvas, tool rail and Frames panel components (`FreeCanvas`, `ToolRail`, `FramesPanel`) were added afterwards in the same style. Each has a `.d.ts` next to it so the TypeScript containers get prop types.
- `src/styles/tokens.css` and `src/styles/ui.css`: design tokens (light and dark) and component styles.
- `src/styles/open-canvas.css`: the rules Light wrote for the visual edits made during design. They target the `data-oc` keys that are still on the exported components.

`src/styles/app.css` holds the few app-only styles that the design did not need. To restyle the app, edit the design project in Light (or OpenCanvas), export it again and copy these files back.

## Architecture

| Layer | Location | Responsibility |
| --- | --- | --- |
| Main process | `electron/main.ts`, `electron/services/*` | Projects, file system (path-traversal safe), structured edits, history, preview process, export |
| Preload | `electron/preload.ts` | Exposes the typed `window.oc` API (context isolation, sandbox, no Node in the renderer) |
| Renderer | `src/components`, `src/lib` | Containers that connect editor state and actions to the UI: top bar, tool rail, Layers/Files/Frames, free canvas, inspector, Monaco code view |
| Design system | `src/ui`, `src/styles` | Presentational components and CSS exported from the design project (see below) |
| Preview server | `electron/preview-server.ts` | Vite dev server in a child process; injects `data-oc-id="file:line:col"` source ids and the bridge |
| Bridge | `preview-runtime/bridge.js` | Runs inside each frame's iframe: hover/selection/linked overlays, element tree, inline text editing, keyboard and zoom forwarding via `postMessage` |
| Source transforms | `shared/source/*` | Babel-located JSX edits applied as minimal text splices; PostCSS-managed style rules |

**How a visual edit works:** the canvas reports the selected element's source id → the main process locates the JSX node with `@babel/parser` → it splices only the affected text (attribute, text child, inserted/removed element) → style edits give the element a stable `data-oc` key and write a rule to `src/open-canvas.css` (breakpoint overrides go into `@media (max-width: …)` blocks) → every write is a `ChangeSet` recorded for undo/redo → Vite HMR updates the preview and the selection is restored.

**Canvas:** the page is shown in several frames at once (Desktop, Tablet and Mobile by default) on a free canvas. Scroll to pan, Ctrl/Cmd+scroll or pinch to zoom, and hold Space (or use the Hand tool, H) to drag. Add frames from presets or a custom size in the tool rail or the Frames tab; drag a frame's label to move it and its edges to resize it, with smart guides and an 8px grid (hold Alt to disable snapping). Selection is mirrored across frames. The frame you click is active: its width decides which scope style edits go to (Base, Tablet or Mobile overrides), shown on the frame label and in the inspector. Frame positions, sizes and the camera are saved per project in the app's local storage, never in the project, and have their own undo/redo (Ctrl+Alt+Z, or the buttons in the bottom-right navigation).

**Inline text:** double-click (or double-tap) a heading, paragraph, span, link, button, label or list item to edit its text on the canvas. Enter commits, Shift+Enter inserts a line break (written as `<br />`), Escape cancels, and clicking elsewhere commits. Paste is plain text and each edit is one undo step. Text that mixes elements or expressions, or a file with unsaved code changes, shows an explanation with "Open in code" instead.

**Theme:** the editor supports System, Light and Dark themes (theme menu in the top bar and on the start screen). The choice is saved locally, applies to the code editor and the native window frame, and never changes the project being edited. Because Electron's native theme also drives `prefers-color-scheme`, a project with its own dark-mode media queries will preview its dark variant while the editor is dark.

**Files:** the Files panel creates, renames and deletes files and folders inline (hover a row). Both Files and Layers have a search field that filters the tree and keeps matching items' parents visible. Text-file renames and deletes are undoable; binary files (images, fonts) are moved without a history entry. Editing `package.json` or `vite.config.*` reloads the project and restarts the preview, and dependencies declared but missing from `node_modules` show an "Install dependencies" banner. Installs can be cancelled.

Template projects without `node_modules` are previewed in managed mode using the editor's own React/Vite, so they work instantly; nothing is written into the project. Imported projects that have `node_modules` run with their own `vite.config`.

## Limitations

- Preview supports React + Vite projects. Next.js and Create React App projects are detected and can be edited in code, but are not previewed.
- Visual editing targets host JSX elements (`div`, `h1`, `img`, …) in files under `src/`. Elements rendered by `.map()` share one source location, so an edit applies to every item.
- Visual style edits are written as attribute-selector rules in `src/open-canvas.css`. A more specific selector in the project's own CSS can still win; the inspector shows computed values so this is visible.
- Breakpoints are read from existing `max-width` media queries (default 1024px / 640px). `min-width` (mobile-first) setups are not mapped.
- Reordering is via Layers move up/down and the selection actions; there is no drag-and-drop nesting yet.
- Undo/redo covers editor commands and Monaco saves. It refuses to revert a file that was changed outside the app since that step.
- Renaming a file does not rewrite the imports that point at it.
- The AI Edit selection action is a placeholder and is not connected to a model.
- Exports exclude `node_modules`, build output, `.git`, caches and `.env*` files (except `.env.example`).
