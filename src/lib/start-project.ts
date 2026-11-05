/** Turn a home brief into a live project and kick off the first AI build. */
import { createProject } from './actions';
import { sendToAi } from './ai';
import { completeOnboardingTask } from './onboarding';
import { copyAgentPrompt } from './prompt';
import { getState, setState } from './store';

const FIRST_REQUEST =
  'Build the first version of the home page now. The page is empty — write a full src/App.jsx with real sections (hero, content, footer), keep data-oc-name on elements, then style with set_styles. Do not only inspect or ask questions.';

/** Short project name from the first line of a brief. */
export function nameFromBrief(brief: string): string {
  const line = brief
    .split('\n')[0]
    ?.replace(/^["'\s]+|["'\s]+$/g, '')
    .trim() ?? '';
  if (!line) return 'Untitled project';
  if (line.length <= 48) return line;
  const cut = line.slice(0, 48).replace(/\s+\S*$/, '').trim();
  return cut || line.slice(0, 48);
}

/** Turn a user brief into an explicit first-build instruction the agent can act on. */
export function firstBuildRequest(brief: string): string {
  const text = brief.trim();
  if (!text) return FIRST_REQUEST;
  return `${text}

Build this as the first version of the home page now. The canvas is empty — rewrite src/App.jsx with real sections in one write_file (keep data-oc-name on meaningful elements), then set_styles. Put something visible on the page this turn; don't only inspect or ask clarifying questions.`;
}

/**
 * Create a blank project from a description, open the dock, and start the AI (or hand off a prompt).
 * This is the beginner core loop: describe → see a site → keep editing.
 */
export async function startProjectFromBrief(brief: string, opts?: { name?: string }): Promise<boolean> {
  const text = brief.trim();
  const name = (opts?.name?.trim() || nameFromBrief(text) || 'Untitled project').slice(0, 80);
  const ok = await createProject('blank', name);
  if (!ok) return false;
  completeOnboardingTask('describe');
  setState({ dockMode: 'input', mode: 'visual', interact: false, tool: 'select' });
  const request = firstBuildRequest(text);
  if (getState().aiStatus?.ready) {
    await sendToAi(request);
    return true;
  }
  setState({ dockDraft: text || FIRST_REQUEST });
  await copyAgentPrompt(request);
  return true;
}
