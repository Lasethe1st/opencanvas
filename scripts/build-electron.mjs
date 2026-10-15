import { build, context } from 'esbuild';

const watch = process.argv.includes('--watch');

const common = {
  bundle: true,
  platform: 'node',
  target: 'node20',
  packages: 'external',
  sourcemap: true,
  logLevel: 'info',
};

const targets = [
  { ...common, entryPoints: ['electron/main.ts'], outfile: 'dist-electron/main.cjs', format: 'cjs' },
  { ...common, entryPoints: ['electron/preload.ts'], outfile: 'dist-electron/preload.cjs', format: 'cjs' },
  { ...common, entryPoints: ['electron/preview-server.ts'], outfile: 'dist-electron/preview-server.mjs', format: 'esm' },
  { ...common, entryPoints: ['electron/next-server.ts'], outfile: 'dist-electron/next-server.mjs', format: 'esm' },
  { ...common, entryPoints: ['electron/next-oc-loader.ts'], outfile: 'dist-electron/next-oc-loader.cjs', format: 'cjs' },
  { ...common, entryPoints: ['electron/harness.ts'], outfile: 'dist-electron/harness.cjs', format: 'cjs' },
];

export async function buildElectron(onRebuild) {
  if (!watch && !onRebuild) {
    await Promise.all(targets.map((t) => build(t)));
    return;
  }
  const contexts = await Promise.all(
    targets.map((t) =>
      context({
        ...t,
        plugins: [{ name: 'notify', setup: (b) => b.onEnd((r) => r.errors.length === 0 && onRebuild?.(t.outfile)) }],
      }),
    ),
  );
  await Promise.all(contexts.map((c) => c.watch()));
  return contexts;
}

if (process.argv[1]?.endsWith('build-electron.mjs')) {
  await buildElectron();
}
