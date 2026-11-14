import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// Every icon in the right panel comes from Hugeicons: through the app's wrappers (lib/hugeicons, lib/home-icons, lib/layer-icons)
// or @hugeicons directly. No other icon library, no hand-drawn <svg>.
const files = [
  'src/components/Inspector.tsx',
  'src/ui/primitives.jsx',
  'src/components/ui/dropdown-menu.tsx',
  ...readdirSync('src/components/inspector').filter((f) => /\.(tsx|ts|jsx)$/.test(f)).map((f) => join('src/components/inspector', f)),
];
const ALLOWED = /(\/lib\/hugeicons|\/lib\/home-icons|\/lib\/layer-icons|@hugeicons\/)/;
const ICON_LIBS = /from ['"](lucide-react|@phosphor-icons\/[^'"]*|react-icons[^'"]*|@radix-ui\/react-icons|@tabler\/icons[^'"]*)['"]/;

for (const file of files) {
  test(`right panel icons are Hugeicons: ${file}`, () => {
    const src = readFileSync(file, 'utf8');
    assert.ok(!ICON_LIBS.test(src), 'imports an icon library other than Hugeicons');
    assert.ok(!/<svg[\s>]/.test(src), 'draws an inline <svg>; use a Hugeicons icon');
    for (const m of src.matchAll(/^import\s[^;]*from\s+['"]([^'"]+)['"]/gms)) {
      const spec = m[1];
      if (/icons?['"]?$/i.test(spec) || /hugeicons|home-icons|layer-icons/.test(spec)) assert.match(spec, ALLOWED, `unexpected icon import ${spec}`);
    }
  });
}
