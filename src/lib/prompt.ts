/** Prompt hand-off: without an AI provider set up, requests go to the user's own agent with the design brief attached. */
import { buildDesignContext } from '../../shared/design-context';
import { defaultDirection } from '../../shared/project-config';
import { getState, toast } from './store';

export function agentPrompt(request: string): string {
  const { project, projectConfig, mcp } = getState();
  const brief = buildDesignContext(projectConfig?.config.direction ?? defaultDirection(), {
    projectName: project?.name,
    pages: projectConfig?.pages,
    request: request.trim() || 'Build the first version of the home page.',
  });
  const how = mcp?.running
    ? 'OpenCanvas is connected over MCP: call get_design_direction and list_pages first, then make changes with the OpenCanvas tools so they show up live and can be undone.'
    : `Edit the project files directly${project ? ` in ${project.root}` : ''}. Keep edits small and readable; OpenCanvas reloads the canvas as files change.`;
  return `${brief}\n\n## How to work\n${how}\n`;
}

export async function copyAgentPrompt(request: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(agentPrompt(request));
    toast('Prompt copied. Paste it into Cursor, Claude or another agent.');
    return true;
  } catch {
    toast('Couldn’t copy to the clipboard.', 'error');
    return false;
  }
}
