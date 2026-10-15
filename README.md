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
npm test          # source transforms, project workflow, preview server, export, MCP server
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
| MCP server | `electron/services/mcp.ts`, `mcp-tools.ts` | Streamable HTTP JSON-RPC endpoint (localhost + bearer token); tools call the edit engine and hand each change to the renderer for its undo history |
| Preload | `electron/preload.ts` | Exposes the typed `window.oc` API (context isolation, sandbox, no Node in the renderer) |
| Renderer | `src/components`, `src/lib` | Containers that connect editor state and actions to the UI: top bar, tool rail, Layers/Files/Frames, free canvas, inspector, Monaco code view |
| Design system | `src/ui`, `src/styles` | Presentational components and CSS exported from the design project (see below) |
| Preview server | `electron/preview-server.ts` | Vite dev server in a child process; injects `data-oc-id="file:line:col"` source ids and the bridge |
| Bridge | `preview-runtime/bridge.js` | Runs inside each frame's iframe: hover/selection/linked overlays, element tree, inline text editing, keyboard and zoom forwarding via `postMessage` |
| Source transforms | `shared/source/*` | Babel-located JSX edits applied as minimal text splices; PostCSS-managed style rules |

**How a visual edit works:** the canvas reports the selected element's source id → the main process locates the JSX node with `@babel/parser` → it splices only the affected text (attribute, text child, inserted/removed element) → style edits give the element a stable `data-oc` key and write a rule to `src/open-canvas.css` (breakpoint overrides go into `@media (max-width: …)` blocks) → every write is a `ChangeSet` recorded for undo/redo → Vite HMR updates the preview and the selection is restored.

**Canvas:** the page is shown in several frames at once (Desktop, Tablet and Mobile by default) on a free canvas. Scroll to pan, Ctrl/Cmd+scroll or pinch to zoom, and hold Space (or use the Hand tool, H) to drag. Add frames from presets or a custom size in the tool rail or the Frames tab; drag a frame's label to move it and its edges to resize it, with smart guides and an 8px grid (hold Alt to disable snapping). Selection is mirrored across frames. The frame you click is active: its width decides which scope style edits go to (Base, Tablet or Mobile overrides), shown on the frame label and in the inspector. Frame positions, sizes and the camera are saved per project in the app's local storage, never in the project, and have their own undo/redo (Ctrl+Alt+Z, or the buttons in the bottom-right navigation).

**Inline text:** double-click (or double-tap) a heading, paragraph, span, link, button, label or list item to edit its text on the canvas. Enter commits, Shift+Enter inserts a line break (written as `<br />`), Escape cancels, and clicking elsewhere commits. Paste is plain text and each edit is one undo step. Text that mixes elements or expressions, or a file with unsaved code changes, shows an explanation with "Open in code" instead.

**Fonts:** the Font field in the inspector opens a searchable dropdown with the project's fonts, system fonts and the full Google Fonts catalogue, each previewed in its own typeface and filterable by category. Choosing a Google font writes the `font-family` rule and adds a single managed `<link data-oc-fonts>` to `index.html` in the same undo step, so the font also loads in exported builds. The catalogue is fetched from Google and cached for a week; offline, a bundled list of the 150 most popular fonts is used (`node scripts/update-google-fonts.mjs` refreshes it).

**Keyboard shortcuts:** press `?` or Ctrl/Cmd+/ (or the keyboard button at the bottom of the tool rail) for the full list. Highlights: Ctrl+D duplicate (the copy gets its own copied styles), Ctrl+G / Ctrl+Shift+G group in a container / ungroup, Tab / Shift+Tab next / previous sibling, Enter first child (or edit text), Shift+Enter parent, Ctrl+A select siblings, F2 rename, F / R / T / I / B / L insert section / container / text / image / button / link, `/` insert any element, P preview, Ctrl+E switch Visual and Code. Shortcuts work whether focus is in the editor or inside a preview frame, and stay out of the way while typing in a field.

**Numeric fields:** inspector fields accept arithmetic (`16/2` → `8`, `(20 + 4) * 1.5px` → `36px`; mixed units are left as typed). ArrowUp/ArrowDown step the value by 1 (Shift: 10, Alt: 0.1) and commit after a short pause, so a burst of presses is a single edit.

**Multiple selection:** Ctrl/Cmd+click a layer or Shift+click on the canvas to add or remove elements; Shift+click in Layers selects a range. Style changes and Delete then apply to every selected element as one undo step (content and attribute fields are hidden while several are selected). Escape or "Clear" returns to a single selection.

**Images and SVGs:** the Image tool opens a file picker, copies the chosen file into `public/` and inserts an `<img src="/name.svg">`. Image files dropped onto the canvas are inserted the same way, and the Files panel has an Import button and accepts files dragged from Explorer/Finder (dropped onto a folder row to import there). The "Choose image…" button on a selected `<img>` replaces its source. Importing text assets such as SVG joins the insert's undo step; binary images (PNG, JPEG, …) are copied without history.

**Git and GitHub:** the branch button in the top bar opens Source control. It can initialize a repository, set the commit name/email (stored in the project's local git config), list changes, commit, and push/pull. "Connect to GitHub" either creates a new repository on your account or connects an existing URL (`owner/repo` works as shorthand). Sign-in goes through Git Credential Manager, which ships with Git for Windows and opens GitHub's browser sign-in the first time; the token never reaches the editor UI. Pull only fast-forwards; diverged branches and conflicts need a terminal.

**MCP (AI agents):** the MCP button in the top bar starts a [Model Context Protocol](https://modelcontextprotocol.io) server so agents such as Cursor or Claude Code can work on the open project. "Add to Cursor" installs it in one click; "Copy mcp.json" and "Claude Code" copy the config for other setups:

```json
{ "mcpServers": { "opencanvas": { "url": "http://127.0.0.1:7457/mcp", "headers": { "Authorization": "Bearer <token from the MCP panel>" } } } }
```

Agents get tools to read the project (`get_project`, `list_files`, `read_file`, `get_outline`, `inspect_element`, `get_selection`), build and edit it (`insert_jsx`, `insert_element`, `set_styles` with breakpoint and hover support, `set_text`, `set_attribute`, `set_tag`, `rename_element`, `duplicate_elements`, `move_element`, `group_elements`, `ungroup_element`, `remove_elements`, `write_file`, `import_files`), see it (`screenshot` renders the live preview at any width) and `undo`/`redo`. Every agent edit goes through the same edit engine as the inspector, appears live on the canvas, selects the element it touched and is a normal undo step labelled "(agent)". The server is off until you turn it on, listens on 127.0.0.1 only, refuses browser origins and foreign Host headers, and requires the bearer token (regenerate it in the panel to disconnect every agent). Agents that only speak stdio can connect through `npx mcp-remote http://127.0.0.1:7457/mcp --header "Authorization: Bearer <token>"`.

**Hover states and element types:** the Default / Hover switch under the scope banner sends style edits to `[data-oc="…"]:hover` rules (per breakpoint, like everything else); press P to try them. The Element field in Layout changes an element's tag (div → section, h2 → h1, …) without touching its children or styles, and the insert menu now also has header, navigation, footer, list, form, input and text area. Appearance has Transform, Transition and Cursor fields.

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
