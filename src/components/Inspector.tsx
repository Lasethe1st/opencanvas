import { AlignCenter, AlignJustify, AlignLeft, AlignRight, Monitor, PanelRightClose, PanelRightOpen, SlidersHorizontal, Smartphone, Tablet } from 'lucide-react';
import { useEffect, useState } from 'react';
import { revealInCode, runEdit, setStyle } from '../lib/actions';
import { setState, useStore, VIEWPORT_BREAKPOINT } from '../lib/store';
import { BreakpointBanner, InspectorHeader, KeyValue } from '../ui/Inspector.jsx';
import { Panel, PanelTitle, Rail } from '../ui/Panels.jsx';
import { Field, IconButton, InputShell, Notice, SelectShell } from '../ui/primitives.jsx';
import { BoxModel } from './inspector/BoxModel';
import { ColorInput, CommitInput, CompactInput, CompactSelect, Section, StyleField, StyleInput, StyleSelect, ToggleGroup } from './inspector/fields';
import { useStyleValue } from './inspector/useStyleValue';
import { Resizer } from './Resizer';

const TEXT_TAGS = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'span', 'a', 'button', 'label', 'li', 'strong', 'em', 'small', 'summary', 'blockquote', 'figcaption', 'td', 'th']);
const FONT_WEIGHTS = ['100', '200', '300', '400', '500', '600', '700', '800', '900'];

function ElementHeader() {
  const selection = useStore((s) => s.selection)!;
  const info = useStore((s) => s.sourceInfo);
  const parentName = useStore((s) => {
    const find = (nodes: typeof s.domTree): string | null => {
      for (const n of nodes) {
        if (n.id === selection.parentId) return n.name;
        const sub = find(n.children);
        if (sub) return sub;
      }
      return null;
    };
    return selection.parentId ? find(s.domTree) : null;
  });
  const name = info?.name ?? selection.name;

  return (
    <InspectorHeader
      name={name}
      tag={selection.tag}
      parent={parentName}
      source={info ? `${info.file}:${info.line}` : null}
      onSource={() => info && revealInCode(info.file, info.line)}
      onRename={(next) => {
        const value = next.trim();
        if (info && value && value !== name) void runEdit({ type: 'rename', id: selection.id, name: value }, `Rename to ${value}`);
      }}
    />
  );
}

function AttributeField({ name, label, placeholder }: { name: string; label: string; placeholder?: string }) {
  const selection = useStore((s) => s.selection)!;
  const info = useStore((s) => s.sourceInfo);
  return (
    <Field label={label}>
      <InputShell>
        <CommitInput value={info?.attributes[name] ?? ''} placeholder={placeholder} disabled={!info} onCommit={(v) => void runEdit({ type: 'setAttribute', id: selection.id, name, value: v }, `Set ${name}`)} />
      </InputShell>
    </Field>
  );
}

function AttributeSelect({ name, label, options, fallback }: { name: string; label: string; options: [string, string][]; fallback: string }) {
  const selection = useStore((s) => s.selection)!;
  const info = useStore((s) => s.sourceInfo)!;
  return (
    <Field label={label}>
      <SelectShell>
        <select value={info.attributes[name] ?? fallback} onChange={(e) => void runEdit({ type: 'setAttribute', id: selection.id, name, value: e.target.value }, `Set ${name}`)}>
          {options.map(([value, text]) => (
            <option key={value} value={value}>
              {text}
            </option>
          ))}
        </select>
      </SelectShell>
    </Field>
  );
}

function ContentSection() {
  const selection = useStore((s) => s.selection)!;
  const info = useStore((s) => s.sourceInfo);
  const [draft, setDraft] = useState(info?.text ?? '');
  useEffect(() => setDraft(info?.text ?? ''), [info?.text, info?.id]);
  if (!info) return null;
  const tag = selection.tag;
  const isText = TEXT_TAGS.has(tag);
  const hasSpecific = tag === 'img' || tag === 'a' || tag === 'button' || tag === 'input' || tag === 'textarea' || tag === 'form';
  if (!isText && !hasSpecific) return null;

  return (
    <Section title="Content">
      {isText &&
        (info.textEditable ? (
          <textarea
            id="oc-text-field"
            className="textarea"
            aria-label="Text content"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => draft !== info.text && void runEdit({ type: 'setText', id: selection.id, text: draft }, 'Edit text')}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                e.currentTarget.blur();
              }
            }}
          />
        ) : (
          <p className="muted" style={{ margin: 0 }}>
            Text contains nested elements or expressions. Edit it in code view.
          </p>
        ))}
      {tag === 'img' && (
        <>
          <AttributeField name="src" label="Source" placeholder="/image.png or https://…" />
          <AttributeField name="alt" label="Alt text" placeholder="Describe the image" />
          <StyleSelect prop="object-fit" label="Fit" options={['fill', 'contain', 'cover', 'none', 'scale-down']} />
        </>
      )}
      {tag === 'a' && (
        <>
          <AttributeField name="href" label="Link" placeholder="https://… or #section" />
          <AttributeSelect name="target" label="Target" fallback="" options={[['', 'Same tab'], ['_blank', 'New tab']]} />
        </>
      )}
      {tag === 'button' && <AttributeSelect name="type" label="Type" fallback="submit" options={[['button', 'button'], ['submit', 'submit'], ['reset', 'reset']]} />}
      {(tag === 'input' || tag === 'textarea') && (
        <>
          <AttributeField name="placeholder" label="Placeholder" />
          <AttributeField name="name" label="Name" />
          {tag === 'input' && <AttributeField name="type" label="Type" placeholder="text" />}
        </>
      )}
    </Section>
  );
}

function LayoutSection({ disabled }: { disabled: boolean }) {
  const display = useStyleValue('display').value;
  const position = useStyleValue('position').value;
  const isFlex = display === 'flex' || display === 'inline-flex';
  const isGrid = display === 'grid' || display === 'inline-grid';
  return (
    <Section title="Layout">
      <StyleSelect prop="display" label="Display" options={['block', 'inline', 'inline-block', 'flex', 'inline-flex', 'grid', 'none']} disabled={disabled} />
      <StyleSelect prop="position" label="Position" options={['static', 'relative', 'absolute', 'fixed', 'sticky']} disabled={disabled} />
      {position !== 'static' && position && (
        <div className="grid-2">
          <CompactInput prop="top" prefix="T" disabled={disabled} />
          <CompactInput prop="right" prefix="R" disabled={disabled} />
          <CompactInput prop="bottom" prefix="B" disabled={disabled} />
          <CompactInput prop="left" prefix="L" disabled={disabled} />
        </div>
      )}
      <div className="grid-2">
        <CompactInput prop="width" prefix="W" disabled={disabled} />
        <CompactInput prop="height" prefix="H" disabled={disabled} />
        <CompactInput prop="min-width" prefix="Min W" disabled={disabled} />
        <CompactInput prop="min-height" prefix="Min H" disabled={disabled} />
        <CompactInput prop="max-width" prefix="Max W" disabled={disabled} />
        <CompactInput prop="max-height" prefix="Max H" disabled={disabled} />
      </div>
      <StyleSelect prop="overflow" label="Overflow" options={['visible', 'hidden', 'auto', 'scroll', 'clip']} disabled={disabled} />
      {isFlex && (
        <>
          <StyleSelect prop="flex-direction" label="Direction" options={['row', 'row-reverse', 'column', 'column-reverse']} disabled={disabled} />
          <StyleSelect prop="flex-wrap" label="Wrap" options={['nowrap', 'wrap', 'wrap-reverse']} disabled={disabled} />
        </>
      )}
      {(isFlex || isGrid) && (
        <>
          <StyleSelect prop="justify-content" label="Justify" options={['normal', 'flex-start', 'center', 'flex-end', 'space-between', 'space-around', 'space-evenly', 'start', 'end']} disabled={disabled} />
          <StyleSelect prop="align-items" label="Align" options={['normal', 'stretch', 'flex-start', 'center', 'flex-end', 'baseline', 'start', 'end']} disabled={disabled} />
          <StyleInput prop="gap" label="Gap" placeholder="16px" disabled={disabled} />
        </>
      )}
      {isGrid && (
        <>
          <StyleInput prop="grid-template-columns" label="Columns" placeholder="repeat(3, 1fr)" disabled={disabled} />
          <StyleInput prop="grid-template-rows" label="Rows" placeholder="auto" disabled={disabled} />
        </>
      )}
    </Section>
  );
}

function FontField({ disabled }: { disabled: boolean }) {
  const value = useStyleValue('font-family');
  return (
    <StyleField label="Font" value={value}>
      <InputShell inherited={value.state !== 'set'} onReset={value.state === 'set' ? () => void setStyle('font-family', '') : undefined}>
        <CommitInput value={value.value} list="oc-fonts" disabled={disabled} onCommit={(v) => void setStyle('font-family', v)} />
      </InputShell>
    </StyleField>
  );
}

function TypographySection({ disabled }: { disabled: boolean }) {
  return (
    <Section title="Typography">
      <datalist id="oc-fonts">
        <option value="inherit" />
        <option value="system-ui, sans-serif" />
        <option value="Inter, system-ui, sans-serif" />
        <option value="Georgia, serif" />
        <option value="'Times New Roman', serif" />
        <option value="ui-monospace, monospace" />
      </datalist>
      <FontField disabled={disabled} />
      <div className="grid-2">
        <CompactInput prop="font-size" prefix="Size" disabled={disabled} />
        <CompactInput prop="line-height" prefix="Line" disabled={disabled} />
        <CompactInput prop="letter-spacing" prefix="Spacing" disabled={disabled} />
        <CompactSelect prop="font-weight" prefix="Weight" options={FONT_WEIGHTS} disabled={disabled} />
      </div>
      <ToggleGroup
        prop="text-align"
        label="Align"
        disabled={disabled}
        options={[
          { value: 'left', icon: <AlignLeft size={13} />, title: 'Left' },
          { value: 'center', icon: <AlignCenter size={13} />, title: 'Center' },
          { value: 'right', icon: <AlignRight size={13} />, title: 'Right' },
          { value: 'justify', icon: <AlignJustify size={13} />, title: 'Justify' },
        ]}
      />
      <StyleSelect prop="text-decoration" label="Decoration" options={['none', 'underline', 'line-through', 'overline']} disabled={disabled} />
      <StyleSelect prop="text-transform" label="Transform" options={['none', 'uppercase', 'lowercase', 'capitalize']} disabled={disabled} />
      <ColorInput prop="color" label="Color" disabled={disabled} />
    </Section>
  );
}

function AppearanceSection({ disabled }: { disabled: boolean }) {
  return (
    <Section title="Appearance">
      <ColorInput prop="background-color" label="Background" disabled={disabled} />
      <StyleInput prop="background-image" label="Bg image" placeholder="url(/bg.jpg)" disabled={disabled} />
      <StyleInput prop="opacity" label="Opacity" placeholder="1" disabled={disabled} />
      <div className="grid-2">
        <CompactInput prop="border-width" prefix="Border" disabled={disabled} />
        <CompactInput prop="border-radius" prefix="Radius" disabled={disabled} />
      </div>
      <StyleSelect prop="border-style" label="Border style" options={['none', 'solid', 'dashed', 'dotted', 'double']} disabled={disabled} />
      <ColorInput prop="border-color" label="Border color" disabled={disabled} />
      <StyleInput prop="box-shadow" label="Shadow" placeholder="0 4px 12px rgba(0,0,0,.1)" disabled={disabled} />
      <StyleSelect prop="visibility" label="Visibility" options={['visible', 'hidden']} disabled={disabled} />
    </Section>
  );
}

function PageSettings() {
  const project = useStore((s) => s.project)!;
  const status = useStore((s) => s.previewStatus);
  const packages = project.hasNodeModules
    ? project.missingDependencies.length
      ? ` · ${project.missingDependencies.length} missing`
      : ' · installed'
    : project.managedPreview
      ? ' · editor-provided'
      : ' · not installed';
  return (
    <>
      <div className="inspector-head">
        <div className="inspector-head__row">
          <strong className="inspector-head__title">Page</strong>
        </div>
        <div className="inspector-head__meta">Select an element on the canvas or in Layers to edit it.</div>
      </div>
      <Section title="Project">
        <KeyValue label="Framework">{project.framework === 'vite-react' ? 'React + Vite' : project.framework}</KeyValue>
        <KeyValue label="Packages">
          {project.packageManager}
          {packages}
        </KeyValue>
        <KeyValue label="Entry">{project.entryFile ?? '—'}</KeyValue>
        <KeyValue label="Styles">{project.stylesFile}</KeyValue>
        <KeyValue label="Preview">{status.state === 'running' ? status.url : status.state}</KeyValue>
      </Section>
      <Section title="Breakpoints">
        <KeyValue label="Tablet">≤ {project.breakpoints.tablet}px</KeyValue>
        <KeyValue label="Mobile">≤ {project.breakpoints.mobile}px</KeyValue>
        <p className="muted" style={{ margin: 0, lineHeight: 1.5 }}>
          {project.breakpoints.detected ? 'Detected from the project’s existing media queries.' : 'Defaults. No existing max-width media queries were found.'} Switch the viewport in the top bar to edit breakpoint overrides.
        </p>
      </Section>
    </>
  );
}

export function Inspector() {
  const selection = useStore((s) => s.selection);
  const info = useStore((s) => s.sourceInfo);
  const sourceError = useStore((s) => s.sourceError);
  const viewport = useStore((s) => s.viewport);
  const project = useStore((s) => s.project)!;
  const width = useStore((s) => s.rightWidth);
  const collapsed = useStore((s) => s.rightCollapsed);
  const bp = VIEWPORT_BREAKPOINT[viewport];

  if (collapsed) {
    return (
      <Rail side="right">
        <IconButton label="Show inspector" onClick={() => setState({ rightCollapsed: false })}>
          <PanelRightOpen size={15} />
        </IconButton>
        <IconButton label="Inspector" onClick={() => setState({ rightCollapsed: false })}>
          <SlidersHorizontal size={15} />
        </IconButton>
      </Rail>
    );
  }

  const disabled = !info || !project.editable;
  const BpIcon = bp === 'tablet' ? Tablet : bp === 'mobile' ? Smartphone : Monitor;

  return (
    <Panel
      side="right"
      width={width}
      aria-label="Inspector"
      head={
        <>
          <PanelTitle>Inspector</PanelTitle>
          <IconButton size="sm" label="Hide inspector" onClick={() => setState({ rightCollapsed: true })}>
            <PanelRightClose size={14} />
          </IconButton>
        </>
      }
      resizer={<Resizer value={width} min={260} max={440} invert onChange={(v) => setState({ rightWidth: v })} />}
    >
      {!selection ? (
        <PageSettings />
      ) : (
        <>
          <ElementHeader />
          {bp !== 'base' && (
            <BreakpointBanner icon={<BpIcon size={14} />}>
              Editing {viewport} overrides (max-width: {bp === 'tablet' ? project.breakpoints.tablet : project.breakpoints.mobile}px). Base styles stay unchanged.
            </BreakpointBanner>
          )}
          {sourceError && <Notice>{sourceError}</Notice>}
          {!sourceError && !info && <div className="empty-note">Reading source…</div>}
          <ContentSection />
          <LayoutSection disabled={disabled} />
          <Section title="Spacing">
            <BoxModel disabled={disabled} />
          </Section>
          <TypographySection disabled={disabled} />
          <AppearanceSection disabled={disabled} />
          <p className="empty-note legend">
            <span className="marker marker--set" /> set at this breakpoint <span className="marker marker--inherited" /> inherited
            <br />
            Other values are computed from the page.
          </p>
        </>
      )}
    </Panel>
  );
}
