import { ArrowLeft, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { defaultDirection } from '../../shared/project-config';
import { createProject } from '../lib/actions';
import { sendToAi } from '../lib/ai';
import { copyAgentPrompt } from '../lib/prompt';

const FIRST_REQUEST = 'Build the first version of the home page, following the design direction.';
import { setState, useStore } from '../lib/store';
import { Button } from '../ui/primitives.jsx';
import { DirectionEditor, DirectionSection, uploadPaths, type DirectionDraft } from './direction/DirectionEditor';

/** "Get help from AI": collect a direction, create the project with it, then hand the brief to the in-app AI or the user's own agent. */
export function ProjectSetup({ location, onBack }: { location: string; onBack: () => void }) {
  const busy = useStore((s) => s.busy);
  const aiReady = useStore((s) => !!s.aiStatus?.ready);
  const [name, setName] = useState('');
  const [request, setRequest] = useState('');
  const [draft, setDraft] = useState<DirectionDraft>({ direction: defaultDirection(), pending: {} });

  const generate = async () => {
    const ok = await createProject('blank', name.trim() || 'Untitled project', { direction: draft.direction, uploads: uploadPaths(draft.pending) });
    if (!ok) return;
    if (aiReady) {
      setState({ dockMode: 'input' });
      if (await sendToAi(request.trim() || FIRST_REQUEST)) return;
    }
    setState({ dockDraft: request, dockMode: 'input' });
    if (!aiReady) await copyAgentPrompt(request);
  };

  return (
    <div className="setup">
      <header className="setup__bar">
        <Button variant="ghost" size="sm" icon={<ArrowLeft size={14} />} disabled={busy} onClick={onBack}>
          Back
        </Button>
      </header>
      <main className="setup__scroll">
        <div className="setup__content">
          <h1 className="setup__title">Let’s define your visual direction.</h1>
          <p className="setup__lead">Everything here is optional and can be changed later from the dock. It’s saved with the project and shared with your AI agent.</p>
          <div className="direction-editor">
            <DirectionSection title="Project name">
              <input className="setup__input" autoFocus aria-label="Project name" placeholder="Untitled project" value={name} onChange={(e) => setName(e.target.value)} />
            </DirectionSection>
            <DirectionSection title="What are you making?" hint="A sentence or two is enough, for example “A landing page for a coffee roaster with a shop and a story section.”">
              <textarea className="setup__input setup__textarea" aria-label="What are you making?" rows={3} value={request} onChange={(e) => setRequest(e.target.value)} />
            </DirectionSection>
          </div>
          <DirectionEditor draft={draft} onChange={setDraft} />
        </div>
      </main>
      <footer className="setup__foot">
        <p className="setup__note">
          {aiReady
            ? 'OpenCanvas creates the project, saves this direction and asks the AI to build the first version. You can follow along and undo it in one step.'
            : 'OpenCanvas creates the project and saves this direction. No AI is set up in Settings, so a prompt with your brief is copied for you to paste into Cursor, Claude or another agent.'}
          {location && <span className="setup__where"> Saved to {location}.</span>}
        </p>
        <Button variant="primary" icon={<Sparkles size={14} />} disabled={busy} onClick={() => void generate()}>
          {busy ? 'Creating…' : 'Generate with AI'}
        </Button>
      </footer>
    </div>
  );
}
