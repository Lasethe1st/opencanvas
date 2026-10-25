# Three.js in OpenCanvas

Standalone, first-class 3D editing for any compatible OpenCanvas project.

## How to use

1. Open **Pages** → add page → choose **3D / Three.js**.
2. OpenCanvas writes:
   - `src/scenes/<Name>.jsx` — managed React Three Fiber source (`@opencanvas-three scene`)
   - `.opencanvas/three/<pageId>.json` — serializable scene document
3. The workspace pane shows the 3D editor: hierarchy, viewport, materials/lights inspector.

## Architecture (reusable module)

| Path | Role |
|------|------|
| `shared/three/scene.ts` | Scene document model + hierarchy CRUD |
| `shared/three/sync-r3f.ts` | Visual ↔ R3F source generate/parse |
| `shared/three/export.ts` | R3F / JSON / vanilla Three.js export |
| `shared/three/shaders.ts` | Default GLSL for custom materials |
| `shared/three/assets.ts` | GLTF/GLB object helpers |
| `src/components/three/*` | Editor UI (viewport, hierarchy, inspector) |

Other projects can import `shared/three` without the Electron shell.

## Capabilities

| Capability | Status |
|------------|--------|
| 3D viewport (R3F + OrbitControls) | Done |
| Scene hierarchy (add/select/group/duplicate/rename/delete) | Done |
| Transform controls (move/rotate/scale) | Done |
| Materials, lights, shadows, environment | Done (PBR + basic + shader draft) |
| Camera fields (fov/near/far/position) | Done |
| GLTF/GLB import (project path / import dialog) | Done (runtime load via drei `Gltf`) |
| Code sync (managed R3F marker) | Done |
| Live preview in web projects | Partial — scene component is written into the project; embed it in a route for in-app preview |
| React Three Fiber workflows | Done (primary output) |
| Shader editing foundation | Done (vertex/fragment textareas + defaults) |
| Export R3F / JSON / vanilla | Done (clipboard) |
| WebGL cleanup / dispose | Done on viewport unmount |
| OBJ/FBX full importer pipeline | Incomplete — path accepted; full parse/convert not implemented |
| HDR/env map picker UI | Incomplete — `environment.envMap` in model only |
| Texture map file binding UI | Incomplete — `material.map` in model only |
| Nested group transform gizmo polish | Partial |
| Bidirectional sync for hand-edited JSX | Best-effort parse of managed files only |

## Verification notes (MCP)

| Channel | Result |
|---------|--------|
| **OpenCanvas MCP** (`user-opencanvas`) | Unavailable — live tool discovery failed (`mcp_auth` only; auth already in progress / error state). Could not exercise in-app MCP tools for 3D. |
| **Electron harness / unit tests** | Verified — `tests/three.test.mjs` (7/7): scene CRUD, R3F round-trip sync, export formats, shader draft, workspace page write (`src/scenes/*.jsx` + `.opencanvas/three/*.json`), asset path helpers. Also `tsc` clean; `tests/pages.test.mjs` still green. |
| **Browser MCP** (`localhost:5199`) | Reached home UI only; stub browser API does not open a full disk project, so the 3D editor pane / WebGL canvas was **not** MCP-verified in the browser preview. |
| **WebGL pixel / transform gizmo UX** | Not asserted in CI; requires Electron `npm start` and manual or computer-use smoke. |

Re-run: `npm run typecheck` and `node --test tests/three.test.mjs` (after `npm run build:electron`), or full `npm test`.

## Embedding a scene in a design page

Import the generated component from a design route, for example:

```jsx
import MainScene from './scenes/MainScene.jsx';

export default function App() {
  return (
    <div style={{ width: '100%', height: '100vh' }}>
      <MainScene />
    </div>
  );
}
```

Projects need `three`, `@react-three/fiber`, and `@react-three/drei` (already present in the OpenCanvas app; add them to user projects when embedding).
