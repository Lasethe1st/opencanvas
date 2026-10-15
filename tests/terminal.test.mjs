import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import test, { after } from 'node:test';

const require = createRequire(import.meta.url);
const h = require('../dist-electron/harness.cjs');
const pty = require('@lydell/node-pty');

const managers = [];
after(() => {
  for (const m of managers) m.killAll();
  // ConPTY's helper threads can keep the event loop alive after every shell has exited.
  setTimeout(() => process.exit(process.exitCode ?? 0), 300).unref();
});

function manager(extra = {}) {
  const data = new Map();
  const exits = [];
  const m = new h.TerminalManager({
    spawn: (file, args, opts) => pty.spawn(file, args, opts),
    onData: (id, chunk) => data.set(id, (data.get(id) ?? '') + chunk),
    onExit: (e) => exits.push(e),
    ...extra,
  });
  managers.push(m);
  return { m, data, exits };
}

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'oc-term-'));
const node = (code) => ({ file: process.execPath, args: ['-e', code] });

async function until(check, ms = 15000, describe = () => '') {
  const start = Date.now();
  while (Date.now() - start < ms) {
    if (check()) return;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error(`timed out waiting ${describe()}`);
}

test('terminalEnv drops the editor’s own variables and keeps the user’s', () => {
  const env = h.terminalEnv({ PATH: '/bin', HOME: '/home/u', OC_MCP_PORT: '7777', OC_SAVEE_MCP_URL: 'x', ELECTRON_RUN_AS_NODE: '1' });
  assert.equal(env.PATH, '/bin');
  assert.equal(env.HOME, '/home/u');
  assert.equal(env.OC_MCP_PORT, undefined);
  assert.equal(env.OC_SAVEE_MCP_URL, undefined);
  assert.equal(env.ELECTRON_RUN_AS_NODE, undefined);
  assert.equal(env.TERM, 'xterm-256color');
});

test('a session streams real output, reports its exit code and runs in the project folder', async () => {
  const cwd = tmp();
  const { m, data, exits } = manager({ env: { ...process.env, OC_SECRET_THING: 'nope' } });
  const s = m.create({ cwd, command: node('console.log("cwd=" + process.cwd()); console.log("oc=" + (process.env.OC_SECRET_THING ?? "none")); process.exit(3)') });
  assert.equal(s.status, 'running');
  assert.equal(s.kind, 'user');
  assert.equal(s.title, 'Terminal 1');
  assert.equal(await m.waitForExit(s.id), 3);
  await until(() => exits.length === 1);
  await until(() => /oc=none/.test(data.get(s.id) ?? ''));
  const out = h.stripAnsi(data.get(s.id));
  assert.match(out, new RegExp(`cwd=${fs.realpathSync(cwd).replace(/[\\^$.*+?()[\]{}|]/g, '\\$&')}`, 'i'));
  assert.match(out, /oc=none/);
  assert.deepEqual(exits[0], { id: s.id, exitCode: 3 });
  assert.equal(m.get(s.id).status, 'exited');
  assert.match(m.scrollback(s.id), /oc=none/);
});

test('input reaches the process, and resize and rename apply', async () => {
  const { m, data } = manager();
  const shell = process.platform === 'win32' ? { file: 'cmd.exe', args: [] } : { file: '/bin/sh', args: [] };
  const s = m.create({ cwd: tmp(), command: shell });
  m.resize(s.id, 120, 30);
  m.resize(s.id, -5, 9999); // ignored
  await new Promise((r) => setTimeout(r, 800));
  m.write(s.id, 'echo got:hello\r');
  // The typed command is echoed back, so the output itself is the second occurrence.
  await until(() => (h.stripAnsi(data.get(s.id) ?? '').match(/got:hello/g) ?? []).length >= 2, 15000, () => JSON.stringify((data.get(s.id) ?? '').slice(-300)));
  m.write(s.id, 'exit 0\r');
  assert.equal(await m.waitForExit(s.id), 0);
  assert.equal(m.rename(s.id, '  Dev server  ').title, 'Dev server');
  assert.equal(m.rename(s.id, '   ').title, 'Dev server');
});

test('kill ends a long-running process and everything it started, and removes the session', async () => {
  const { m } = manager();
  const s = m.create({ cwd: tmp(), command: node('require("child_process").spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { stdio: "inherit" }); setInterval(() => {}, 1000)') });
  await new Promise((r) => setTimeout(r, 800));
  // ConPTY reports the pid once the process has started.
  const pid = m.get(s.id).pid;
  assert.ok(pid > 4, `a real pid (${pid})`);
  // node-pty keeps a handle to the shell, so ask the OS for the process list instead of process.kill(pid, 0).
  const descendants = () => {
    if (process.platform !== 'win32') return execSync(`pgrep -P ${pid} || true`).toString().trim().split(/\s+/).filter(Boolean);
    const out = execSync(`powershell -NoProfile -Command "(Get-CimInstance Win32_Process -Filter 'ParentProcessId=${pid}').ProcessId"`).toString();
    return out.split(/\s+/).filter(Boolean);
  };
  const kids = descendants();
  assert.ok(kids.length >= 1, 'the shell started a child process');
  m.kill(s.id);
  assert.equal(m.get(s.id), null);
  const alive = (pid) => {
    if (process.platform !== 'win32') {
      try {
        process.kill(Number(pid), 0);
        return true;
      } catch {
        return false;
      }
    }
    return execSync(`tasklist /FI "PID eq ${pid}" /NH`).toString().includes(String(pid));
  };
  await until(() => kids.every((pid) => !alive(pid)), 10000);
});

test('the session limit is enforced with a readable message', () => {
  const { m } = manager();
  const cwd = tmp();
  for (let i = 0; i < h.TERMINAL_LIMITS.maxSessions; i++) m.create({ cwd, command: node('setInterval(() => {}, 1000)') });
  assert.throws(() => m.create({ cwd, command: node('1') }), /up to 8 terminals/);
  m.killAll();
  assert.equal(m.list().length, 0);
});

test('a missing project folder is refused', () => {
  const { m } = manager();
  assert.throws(() => m.create({ cwd: path.join(tmp(), 'gone') }), /no longer exists/);
});

test('runCommand returns output and exit code, times out, keeps servers running, and stops on abort', async () => {
  const { m } = manager();
  const cwd = tmp();
  const created = [];
  const ok = await m.runCommand({ cwd, command: `node -e "console.log('built ok'); process.exit(2)"`, signal: new AbortController().signal, timeoutMs: 20000, onCreated: (s) => created.push(s) });
  assert.equal(ok.status, 'exited');
  assert.equal(ok.exitCode, 2);
  assert.match(ok.output, /built ok/);
  assert.equal(created[0].kind, 'ai');
  assert.equal(created[0].title, 'AI 1');

  const slow = await m.runCommand({ cwd, command: `node -e "setInterval(() => {}, 1000)"`, signal: new AbortController().signal, timeoutMs: 600 });
  assert.equal(slow.status, 'timed-out');
  assert.equal(m.get(slow.sessionId).status, 'running', 'the tab stays until the process is gone');
  await m.waitForExit(slow.sessionId);

  const server = await m.runCommand({ cwd, command: `node -e "console.log('listening'); setInterval(() => {}, 1000)"`, signal: new AbortController().signal, timeoutMs: 600, longRunning: true, settleMs: 1500 });
  assert.equal(server.status, 'running');
  assert.match(server.output, /listening/);
  assert.equal(m.get(server.sessionId).status, 'running');
  m.kill(server.sessionId);

  const ac = new AbortController();
  setTimeout(() => ac.abort(), 500);
  const stopped = await m.runCommand({ cwd, command: `node -e "setInterval(() => {}, 1000)"`, signal: ac.signal, timeoutMs: 20000 });
  assert.equal(stopped.status, 'stopped');
});

test('stripAnsi removes colour, cursor and title sequences', () => {
  assert.equal(h.stripAnsi('\x1b[32mgreen\x1b[0m \x1b]0;title\x07done\x1b[?25h'), 'green done');
});
