import { useState } from 'react';
import { defaultDirection } from '../../shared/project-config';
import { createProject } from '../lib/actions';
import { sendToAi } from '../lib/ai';
import { copyAgentPrompt } from '../lib/prompt';
import { setState, useStore } from '../lib/store';
import { DirectionEditor, uploadPaths, type DirectionDraft } from './direction/DirectionEditor';
import { AiGenerate, ArrowLeft, Icon } from '@/components/lime/icon';
import { Button } from '@/components/lime/ui/button';
import { Field, FieldDescription, FieldLabel } from '@/components/lime/ui/field';
import { Input } from '@/components/lime/ui/input';
import { Textarea } from '@/components/lime/ui/textarea';

const FIRST_REQUEST = 'Build the first version of the home page, following the design direction.';

/** "Get help from AI": collect a direction, create the project with it, then hand the brief to the in-app AI or the user's own agent. */
export function ProjectSetup({ location, initialRequest = '', onBack }: { location: string; initialRequest?: string; onBack: () => void }) {
  const busy = useStore((s) => s.busy);
  const aiReady = useStore((s) => !!s.aiStatus?.ready);
  const [name, setName] = useState('');
  const [request, setRequest] = useState(initialRequest);
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
    <div className="flex h-full min-h-dvh flex-col bg-page text-fg">
      <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-2 border-b border-line bg-page px-4">
        <Button variant="ghost" size="icon" aria-label="Back" disabled={busy} onClick={onBack}>
          <Icon icon={ArrowLeft} size={20} />
        </Button>
        <h1 className="text-xl font-semibold leading-tight tracking-tight sm:text-2xl">Let’s define your visual direction</h1>
      </header>
      <main className="mx-auto w-full max-w-2xl flex-1 overflow-y-auto px-4 pt-4 pb-8 sm:px-6 sm:pt-8">
        <section className="flex flex-col gap-8">
          <div className="flex flex-col gap-3">
            <p className="text-sm text-fg-2">Everything here is optional and can be changed later from the dock. It’s saved with the project and shared with your AI agent.</p>
            <div className="flex max-w-md flex-col gap-4">
              <Field name="projectName">
                <FieldLabel>Project name</FieldLabel>
                <Input autoFocus placeholder="Untitled project" value={name} onChange={(e) => setName(e.target.value)} />
              </Field>
              <Field name="brief">
                <FieldLabel>What are you making?</FieldLabel>
                <Textarea
                  rows={3}
                  autoGrow
                  placeholder="A landing page for a coffee roaster with a shop and a story section"
                  value={request}
                  onChange={(e) => setRequest(e.target.value)}
                />
                <FieldDescription>A sentence or two is enough.</FieldDescription>
              </Field>
            </div>
          </div>
          <DirectionEditor draft={draft} onChange={setDraft} />
        </section>
      </main>
      <footer className="sticky bottom-0 border-t border-line bg-page px-4 pt-3 pb-4 sm:px-6">
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <p className="text-sm text-fg-2">
            {aiReady
              ? 'OpenCanvas creates the project, saves this direction and asks the AI to build the first version. You can follow along and undo it in one step.'
              : 'OpenCanvas creates the project and saves this direction. No AI is set up in Settings, so a prompt with your brief is copied for you to paste into Cursor, Claude or another agent.'}
            {location && <span> Saved to {location}.</span>}
          </p>
          <Button size="lg" className="w-full shrink-0 sm:w-auto" icon={<Icon icon={AiGenerate} size={16} />} pending={busy || undefined} disabled={busy} onClick={() => void generate()}>
            Generate with AI
          </Button>
        </div>
      </footer>
    </div>
  );
}
