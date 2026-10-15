/** The in-app AI: one conversation per open project, driving the same tools external agents use over MCP. */
import { randomUUID } from 'node:crypto';
import { APPROVAL_TOOLS, type AiEvent, type AiSettings } from '../../shared/ai';
import type { AiTurnContext } from '../../shared/api';
import type { McpContent, McpTool } from './mcp';
import { redact } from './ai-keys';
import { AiProviderError, streamChat, type ChatMessage, type ChatPart, type Fetcher, type ToolCall, type ToolDef, type ToolResult } from './ai-providers';

export const MAX_STEPS = 30;
const MAX_TOOL_TEXT = 24_000;
/** Screenshots are kept for this many recent requests; older ones are replaced by a note to save tokens. */
const KEEP_IMAGES_FOR_TURNS = 2;

export interface AgentDeps {
  fetcher: Fetcher;
  settings(): AiSettings;
  key(): string | null;
  /** Known secrets, scrubbed from anything sent to the editor. */
  secrets(): string[];
  /** Tools bound to a turn, so their edits are grouped into one undo step. */
  tools(turnId: string, request: string): McpTool[];
  /** Project, pages and design direction, as text for the system prompt. */
  projectContext(): string;
  emit(event: AiEvent): void;
  /** Runs a shell command in the project folder, after the user allowed it. Without it the AI has no run_command tool. */
  runCommand?(command: string, opts: { longRunning: boolean; signal: AbortSignal }): Promise<CommandOutcome>;
  /** Folder commands run in, shown on the approval card. */
  commandCwd?(): string;
}

export interface CommandOutcome {
  exitCode: number | null;
  status: 'exited' | 'running' | 'timed-out' | 'stopped';
  output: string;
  title: string;
}

/** Tail of command output the AI sees. */
export const COMMAND_OUTPUT_LIMIT = 8 * 1024;

const RUN_COMMAND: ToolDef = {
  name: 'run_command',
  description:
    'Runs one shell command in the project folder (PowerShell on Windows, the login shell elsewhere) and returns its exit code and the end of its output. The user must allow every command, and sees it run in a terminal tab. Use it for things only a command can do, like installing a package or running the build or tests; edit files with the file tools instead. For dev servers or watchers set long_running: true, which returns after about 15 seconds and leaves the process running in its tab. Other commands are stopped after 2 minutes.',
  inputSchema: {
    type: 'object',
    properties: {
      command: { type: 'string', description: 'The exact command line.' },
      reason: { type: 'string', description: 'One short sentence telling the user why this command is needed.' },
      long_running: { type: 'boolean', description: 'True for servers and watchers that keep running.' },
    },
    required: ['command', 'reason'],
  },
};

const ASK_USER: ToolDef = {
  name: 'ask_user',
  description:
    'Asks the user a clarifying question and waits for the answer. Use it only when the request is ambiguous in a way that would change the result (for example how many items, which page, or a choice between clearly different directions). Offer 2 to 5 short options. Do not ask about things the design direction already answers.',
  inputSchema: {
    type: 'object',
    properties: {
      question: { type: 'string', description: 'One short question.' },
      options: { type: 'array', items: { type: 'string' }, minItems: 2, maxItems: 5, description: 'Short answers the user can pick.' },
      allow_text: { type: 'boolean', description: 'Let the user type their own answer (default true).' },
    },
    required: ['question', 'options'],
  },
};

const APP_RULES = `You are the AI designer built into OpenCanvas. You edit the user's open project directly through tools; every change appears live on the canvas.

How to work in this app:
- Keep replies short. Say what you are about to do in one sentence, do it with tools, then summarise what changed in one or two sentences.
- Follow the design direction below for new work: its style, typeface, icon pack, tokens and references.
- If the request is ambiguous in a way that changes the result, call ask_user once with a few short options instead of guessing. Never ask more than two questions in one reply.
- All edits from one reply become a single undo step for the user, so make complete, coherent changes.
- git_commit, git_publish, go_live, import_files and run_command need the user's permission each time; the app asks them for you. If they decline, accept it and carry on without that step.
- Never reveal or ask for API keys or tokens.`;

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** Short present-tense description of a tool call for the activity list. */
export function describeCall(name: string, args: Record<string, any>, tools: McpTool[]): string {
  const count = Array.isArray(args.ids) ? args.ids.length : 1;
  switch (name) {
    case 'set_styles':
      return `Styling ${plural(count, 'element')}${args.breakpoint && args.breakpoint !== 'base' ? ` (${args.breakpoint})` : ''}`;
    case 'insert_jsx':
      return 'Inserting new elements';
    case 'insert_element':
      return `Inserting ${args.kind ?? 'an element'}`;
    case 'set_text':
      return 'Changing text';
    case 'remove_elements':
      return `Removing ${plural(count, 'element')}`;
    case 'write_file':
      return `Writing ${args.path ?? 'a file'}`;
    case 'read_file':
      return `Reading ${args.path ?? 'a file'}`;
    case 'screenshot':
      return `Taking a screenshot at ${args.width ?? 1440}px`;
    case 'get_outline':
      return 'Reading the page structure';
    case 'get_design_direction':
      return 'Reading your design direction';
    case 'ask_user':
      return 'Asking you a question';
    case 'run_command':
      return `Running ${String(args.command ?? 'a command').slice(0, 60)}`;
    default:
      return tools.find((t) => t.name === name)?.title ?? name.replace(/_/g, ' ');
  }
}

/** What will happen if the user allows a gated tool call. */
export function approvalSummary(name: string, args: Record<string, any>): string {
  switch (name) {
    case 'git_commit':
      return `Commit every change in the project with the message “${String(args.message ?? '').slice(0, 120)}”.`;
    case 'git_publish':
      return args.remote ? `Commit outstanding changes and push the project to ${args.remote}.` : 'Commit outstanding changes and push the project to GitHub, creating a repository on your account if none is connected.';
    case 'go_live':
      return 'Commit outstanding changes, push to GitHub and publish the site on Vercel.';
    case 'import_files': {
      const paths: string[] = Array.isArray(args.paths) ? args.paths.map(String) : [];
      return `Copy ${plural(paths.length, 'file')} from your computer into ${args.dir || 'public'}: ${paths.slice(0, 4).join(', ')}${paths.length > 4 ? '…' : ''}`;
    }
    case 'run_command': {
      const reason = String(args.reason ?? '').trim().slice(0, 200);
      return `${reason ? `${reason} ` : ''}It runs in a terminal tab${args.long_running ? ' and keeps running until you stop it' : ' and is stopped after 2 minutes'}.`;
    }
    default:
      return `Run ${name}.`;
  }
}

function toParts(content: McpContent[]): ChatPart[] {
  return content.map((c) => (c.type === 'text' ? { type: 'text', text: c.text.length > MAX_TOOL_TEXT ? `${c.text.slice(0, MAX_TOOL_TEXT)}\n…(truncated)` : c.text } : { type: 'image', mimeType: c.mimeType, data: c.data }));
}

function elementIdOf(args: Record<string, any>, content: McpContent[]): string | null {
  const fromText = content.find((c): c is { type: 'text'; text: string } => c.type === 'text' && /Element id: \S+/.test(c.text));
  if (fromText) return /Element id: (\S+)/.exec(fromText.text)![1];
  if (Array.isArray(args.ids) && typeof args.ids[0] === 'string') return args.ids[0];
  return typeof args.id === 'string' ? args.id : null;
}

function describeTurnContext(ctx: AiTurnContext | undefined): string {
  if (!ctx) return '';
  const lines: string[] = [];
  if (ctx.page) lines.push(`The user is looking at the page "${ctx.page.name}" (${ctx.page.path}).`);
  if (ctx.frameWidth) lines.push(`Active frame width: ${Math.round(ctx.frameWidth)}px.`);
  if (ctx.selection) lines.push(`Selected element: <${ctx.selection.tag}> "${ctx.selection.name}" (id ${ctx.selection.id}). "This", "it" or "here" most likely means this element.`);
  return lines.length ? `[Editor context]\n${lines.join('\n')}\n\n` : '';
}

type Pending = { turnId: string; resolve: (value: string) => void; reject: (err: Error) => void; kind: 'question' | 'approval' };

export class AiAgent {
  private history: ChatMessage[] = [];
  private abort: AbortController | null = null;
  private pending = new Map<string, Pending>();
  private turnId: string | null = null;
  /** Bumped by reset, so a turn that is still winding down can't write into the new conversation. */
  private epoch = 0;

  constructor(private deps: AgentDeps) {}

  get busy() {
    return !!this.turnId;
  }

  reset() {
    this.cancel();
    this.history = [];
    this.epoch++;
    this.turnId = null;
    this.abort = null;
  }

  cancel() {
    this.abort?.abort();
    for (const [id, p] of this.pending) {
      p.reject(Object.assign(new Error('Stopped.'), { name: 'AbortError' }));
      this.pending.delete(id);
    }
  }

  answer(id: string, value: string) {
    const p = this.pending.get(id);
    if (!p || p.kind !== 'question') return;
    this.pending.delete(id);
    const answer = String(value ?? '').trim().slice(0, 2000) || '(no answer)';
    this.deps.emit({ turnId: p.turnId, type: 'resolved', id, answer });
    p.resolve(answer);
  }

  approve(id: string, allow: boolean) {
    const p = this.pending.get(id);
    if (!p || p.kind !== 'approval') return;
    this.pending.delete(id);
    const answer = allow === true ? 'Allowed' : 'Declined';
    this.deps.emit({ turnId: p.turnId, type: 'resolved', id, answer });
    p.resolve(answer);
  }

  /** Starts a turn and returns its id; the turn runs in the background and reports through events. */
  send(request: string, ctx?: AiTurnContext): string {
    const text = String(request ?? '').trim();
    if (!text) throw new AiProviderError('Type what you’d like to change first.');
    if (this.turnId) throw new AiProviderError('The AI is still working on your last request. Stop it or wait for it to finish.');
    const turnId = randomUUID();
    this.turnId = turnId;
    this.abort = new AbortController();
    this.deps.emit({ turnId, type: 'start', request: text });
    void this.run(turnId, text, ctx, this.abort.signal);
    return turnId;
  }

  private waitFor(turnId: string, kind: Pending['kind'], id: string, signal: AbortSignal): Promise<string> {
    return new Promise((resolve, reject) => {
      if (signal.aborted) return reject(Object.assign(new Error('Stopped.'), { name: 'AbortError' }));
      this.pending.set(id, { turnId, resolve, reject, kind });
    });
  }

  private trimImages() {
    const userTurns = this.history.map((m, i) => (m.role === 'user' ? i : -1)).filter((i) => i >= 0);
    const keepFrom = userTurns.length > KEEP_IMAGES_FOR_TURNS ? userTurns[userTurns.length - KEEP_IMAGES_FOR_TURNS] : 0;
    const strip = (parts: ChatPart[]) => parts.map((p): ChatPart => (p.type === 'image' ? { type: 'text', text: '(an earlier screenshot was removed)' } : p));
    this.history = this.history.map((m, i) => {
      if (i >= keepFrom) return m;
      if (m.role === 'user') return { ...m, content: strip(m.content) };
      if (m.role === 'tool') return { ...m, results: m.results.map((r) => ({ ...r, content: strip(r.content) })) };
      return m;
    });
  }

  private async run(turnId: string, request: string, ctx: AiTurnContext | undefined, signal: AbortSignal) {
    const { deps } = this;
    const tools = deps.tools(turnId, request).filter((t) => t.name !== 'undo' && t.name !== 'redo');
    const toolDefs: ToolDef[] = [...tools.map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema })), ASK_USER, ...(deps.runCommand ? [RUN_COMMAND] : [])];
    const system = `${APP_RULES}\n\n${deps.projectContext()}`;
    const turn: ChatMessage[] = [{ role: 'user', content: [{ type: 'text', text: describeTurnContext(ctx) + request }] }];
    const epoch = this.epoch;
    let stopped = false;
    try {
      for (let step = 0; ; step++) {
        if (step >= MAX_STEPS) {
          const note = `\n\nI stopped after ${MAX_STEPS} steps so this doesn’t run away. Ask me to continue if there’s more to do.`;
          deps.emit({ turnId, type: 'text', delta: note });
          turn.push({ role: 'assistant', text: note.trim(), toolCalls: [] });
          break;
        }
        let streamed = '';
        let response;
        try {
          response = await streamChat(
            {
              settings: deps.settings(),
              key: deps.key(),
              system,
              messages: [...this.history, ...turn],
              tools: toolDefs,
              signal,
              onText: (delta) => {
                streamed += delta;
                deps.emit({ turnId, type: 'text', delta });
              },
            },
            deps.fetcher,
          );
        } catch (err) {
          if (streamed) turn.push({ role: 'assistant', text: streamed, toolCalls: [] });
          throw err;
        }
        turn.push({ role: 'assistant', text: response.text, toolCalls: response.toolCalls });
        if (!response.toolCalls.length) break;
        const results: ToolResult[] = [];
        try {
          for (const call of response.toolCalls) results.push(await this.runTool(turnId, call, tools, signal));
        } finally {
          for (const call of response.toolCalls.slice(results.length)) results.push({ callId: call.id, name: call.name, content: [{ type: 'text', text: 'Stopped by the user before this ran.' }], isError: true });
          turn.push({ role: 'tool', results });
        }
        if (response.text.trim()) deps.emit({ turnId, type: 'text', delta: '\n\n' });
      }
    } catch (err) {
      if ((err as Error)?.name === 'AbortError' || signal.aborted) stopped = true;
      else deps.emit({ turnId, type: 'error', message: redact((err as Error)?.message ?? String(err), deps.secrets()) });
    } finally {
      const last = turn[turn.length - 1];
      if (last.role !== 'assistant' || last.toolCalls.length) turn.push({ role: 'assistant', text: stopped ? '(Stopped by the user.)' : '(The reply ended early.)', toolCalls: [] });
      if (epoch === this.epoch) {
        this.history.push(...turn);
        this.trimImages();
      }
      for (const [id, p] of this.pending) if (p.turnId === turnId) this.pending.delete(id);
      if (this.turnId === turnId) {
        this.turnId = null;
        this.abort = null;
      }
      deps.emit({ turnId, type: 'done', stopped });
    }
  }

  private async runTool(turnId: string, call: ToolCall, tools: McpTool[], signal: AbortSignal): Promise<ToolResult> {
    const { deps } = this;
    const fail = (message: string): ToolResult => ({ callId: call.id, name: call.name, content: [{ type: 'text', text: message }], isError: true });
    if (signal.aborted) throw Object.assign(new Error('Stopped.'), { name: 'AbortError' });
    if (call.args.__invalid_json) return fail('Your tool arguments were not valid JSON. Send the call again with a valid JSON object.');

    if (call.name === 'ask_user') {
      const question = String(call.args.question ?? '').trim();
      const options = (Array.isArray(call.args.options) ? call.args.options : []).map(String).filter(Boolean).slice(0, 5);
      if (!question) return fail('"question" is required.');
      const id = randomUUID();
      deps.emit({ turnId, type: 'question', question: { id, question, options, allowText: call.args.allow_text !== false } });
      const answer = await this.waitFor(turnId, 'question', id, signal);
      return { callId: call.id, name: call.name, content: [{ type: 'text', text: `The user answered: ${answer}` }], isError: false };
    }

    if (call.name === 'run_command') return this.runCommand(turnId, call, signal);

    const tool = tools.find((t) => t.name === call.name);
    if (!tool) return fail(`There is no tool called ${call.name}.`);

    if ((APPROVAL_TOOLS as readonly string[]).includes(call.name)) {
      const id = randomUUID();
      deps.emit({ turnId, type: 'approval', approval: { id, tool: call.name, summary: approvalSummary(call.name, call.args) } });
      const decision = await this.waitFor(turnId, 'approval', id, signal);
      if (decision !== 'Allowed') return fail('The user declined this action. Do not try it again in this reply; carry on without it or explain what they can do instead.');
    }

    deps.emit({ turnId, type: 'tool-start', callId: call.id, tool: call.name, summary: describeCall(call.name, call.args, tools) });
    try {
      const content = await tool.run(call.args);
      deps.emit({ turnId, type: 'tool-end', callId: call.id, ok: true, summary: describeCall(call.name, call.args, tools), elementId: elementIdOf(call.args, content) });
      return { callId: call.id, name: call.name, content: toParts(content), isError: false };
    } catch (err) {
      const message = redact((err as Error)?.message ?? String(err), deps.secrets());
      deps.emit({ turnId, type: 'tool-end', callId: call.id, ok: false, summary: message });
      return fail(message);
    }
  }

  private async runCommand(turnId: string, call: ToolCall, signal: AbortSignal): Promise<ToolResult> {
    const { deps } = this;
    const fail = (message: string): ToolResult => ({ callId: call.id, name: call.name, content: [{ type: 'text', text: message }], isError: true });
    if (!deps.runCommand) return fail('There is no tool called run_command.');
    const command = String(call.args.command ?? '').trim();
    if (!command) return fail('"command" is required.');
    if (command.length > 2000) return fail('That command is too long. Keep it under 2000 characters.');
    const longRunning = call.args.long_running === true;

    const id = randomUUID();
    deps.emit({ turnId, type: 'approval', approval: { id, tool: call.name, summary: approvalSummary(call.name, call.args), command, cwd: deps.commandCwd?.() } });
    const decision = await this.waitFor(turnId, 'approval', id, signal);
    if (decision !== 'Allowed') return fail('The user declined this command. Do not run it again in this reply; carry on without it or tell them how to run it themselves.');

    const summary = describeCall(call.name, call.args, []);
    deps.emit({ turnId, type: 'tool-start', callId: call.id, tool: call.name, summary });
    try {
      const run = await deps.runCommand(command, { longRunning, signal });
      const secrets = deps.secrets();
      const tail = redact(run.output.length > COMMAND_OUTPUT_LIMIT ? `…${run.output.slice(-COMMAND_OUTPUT_LIMIT)}` : run.output, secrets).trim();
      const status =
        run.status === 'exited'
          ? `Exited with code ${run.exitCode ?? 'unknown'}.`
          : run.status === 'running'
            ? `Still running in the terminal tab "${run.title}". The user can stop it there.`
            : run.status === 'timed-out'
              ? 'Stopped after 2 minutes without finishing.'
              : 'Stopped by the user.';
      const ok = run.status === 'running' || (run.status === 'exited' && run.exitCode === 0);
      deps.emit({ turnId, type: 'tool-end', callId: call.id, ok, summary: ok ? summary : `${summary}: ${status}` });
      if (run.status === 'stopped') throw Object.assign(new Error('Stopped.'), { name: 'AbortError' });
      return { callId: call.id, name: call.name, content: [{ type: 'text', text: `${status}\n\nOutput:\n${tail || '(no output)'}` }], isError: !ok };
    } catch (err) {
      if ((err as Error)?.name === 'AbortError') throw err;
      const message = redact((err as Error)?.message ?? String(err), deps.secrets());
      deps.emit({ turnId, type: 'tool-end', callId: call.id, ok: false, summary: message });
      return fail(message);
    }
  }
}