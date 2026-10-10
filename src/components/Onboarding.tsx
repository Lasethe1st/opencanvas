import { Clock3 } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { RecentProject, TemplateId, TemplateMeta } from '../../shared/types';
import { createProject, openProjectDialog, openRecent } from '../lib/actions';
import { api } from '../lib/api';
import { useStore } from '../lib/store';
import { Button } from '../ui/primitives.jsx';
import { CreateBar, RecentItem, RecentList, START_ICONS, StartOption, StartScreen, TemplateArt, TemplateCard, TemplateGrid } from '../ui/StartScreen.jsx';
import { ThemeMenu } from './ThemeMenu';

export function Onboarding() {
  const busy = useStore((s) => s.busy);
  const [templates, setTemplates] = useState<TemplateMeta[]>([]);
  const [recent, setRecent] = useState<RecentProject[]>([]);
  const [location, setLocation] = useState('');
  const [flow, setFlow] = useState<'blank' | 'template'>('template');
  const [selected, setSelected] = useState<TemplateId>('landing');
  const [name, setName] = useState('');

  useEffect(() => {
    void api.templates().then(setTemplates);
    void api.recentProjects().then(setRecent);
    void api.defaultLocation().then(setLocation);
  }, []);

  const current = flow === 'blank' ? 'blank' : selected;
  const meta = templates.find((t) => t.id === current);
  const create = () => void createProject(current, name || (flow === 'blank' ? 'Untitled project' : (meta?.name ?? 'My site')));

  return (
    <StartScreen
      themeMenu={<ThemeMenu />}
      options={
        <>
          <StartOption icon={START_ICONS.blank} title="Blank project" selected={flow === 'blank'} onClick={() => setFlow('blank')}>
            A minimal React + Vite app with an empty page.
          </StartOption>
          <StartOption icon={START_ICONS.template} title="Start from a template" selected={flow === 'template'} onClick={() => setFlow('template')}>
            Landing page, portfolio, dashboard or marketing site.
          </StartOption>
          <StartOption icon={START_ICONS.open} title="Open existing project" onClick={() => void openProjectDialog()}>
            Import a React + Vite folder from disk.
          </StartOption>
        </>
      }
      templates={
        flow === 'template' ? (
          <TemplateGrid title="Templates">
            {templates
              .filter((t) => t.id !== 'blank')
              .map((t) => (
                <TemplateCard key={t.id} art={<TemplateArt id={t.id} />} name={t.name} description={t.description} selected={selected === t.id} onClick={() => setSelected(t.id)} />
              ))}
          </TemplateGrid>
        ) : (
          <TemplateGrid title="Blank project">
            <TemplateCard art={<TemplateArt id="blank" />} name="Empty page" description="One App component and a stylesheet, ready for your first section." selected />
          </TemplateGrid>
        )
      }
      createBar={
        <CreateBar
          input={
            <input
              aria-label="Project name"
              placeholder={flow === 'blank' ? 'Project name' : `Project name (${meta?.name ?? ''})`}
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && create()}
            />
          }
          where={location && `Saved to ${location}`}
          button={
            <Button variant="primary" disabled={busy} onClick={create}>
              {busy ? 'Creating…' : flow === 'blank' ? 'Create blank project' : `Use ${meta?.name ?? 'template'}`}
            </Button>
          }
        />
      }
      recent={
        recent.length > 0 && (
          <RecentList>
            {recent.map((p) => (
              <RecentItem key={p.root} icon={<Clock3 size={14} />} name={p.name} path={p.root} onClick={() => void openRecent(p.root)} />
            ))}
          </RecentList>
        )
      }
    />
  );
}
