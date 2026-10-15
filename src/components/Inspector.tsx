import { AlignCenter, AlignJustify, AlignLeft, AlignRight, Code2, ImageUp, MousePointerClick } from 'lucide-react';
import { useEffect, useState } from 'react';
import { RETAGGABLE_TAGS, type StyleState } from '../../shared/types';
import { chooseImageForSelection, revealInCode, runEdit, setStyle, setTag } from '../lib/actions';
import { setState, useActiveBreakpoint, useStore } from '../lib/store';
import { InspectorHeader, KeyValue } from '../ui/Inspector.jsx';
import { Panel, PanelTitle } from '../ui/Panels.jsx';
import { Button, Field, InputShell, Notice, Segmented, SelectShell } from '../ui/primitives.jsx';
import { FrameworkLabel, PackageManagerLabel } from './BrandLogos';
import { SCOPE_LABEL } from './Canvas';
import { BoxModel } from './inspector/BoxModel';
import { FontPicker } from './inspector/FontPicker';
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
          <div className="content-locked">
            <p className="muted" style={{ margin: 0 }}>
              {info.textReason === 'expression'
                ? 'This text comes from a JavaScript expression, so it can only be changed in code.'
                : 'This text contains other elements, such as links or emphasis. Edit it in code so the markup stays intact.'}
            </p>
            <Button size="sm" icon={<Code2 size={13} />} onClick={() => revealInCode(info.file, info.line)}>
              Open in code
            </Button>
          </div>
        ))}
      {tag === 'img' && (
        <>
          <AttributeField name="src" label="Source" placeholder="/image.png or https://…" />
          <Button size="sm" icon={<ImageUp size={13} />} onClick={() => void chooseImageForSelection()}>
            Choose image…
          </Button>
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

function TagSelect({ disabled }: { disabled: boolean }) {
  const tag = useStore((s) => s.selection!.tag);
  if (!RETAGGABLE_TAGS.includes(tag)) return null;
  return (
    <Field label="Element">
      <SelectShell>
        <select aria-label="Element type" value={tag} disabled={disabled} onChange={(e) => void setTag(e.target.value)}>
          {RETAGGABLE_TAGS.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </SelectShell>
    </Field>
  );
}

function StateToggle() {
  const styleState = useStore((s) => s.styleState);
  return (
    <div className="state-toggle">
      <Segmented
        label="Style state"
        value={styleState}
        onChange={(id: StyleState) => setState({ styleState: id })}
        options={[
          { id: 'default', label: 'Default', text: 'Default' },
          { id: 'hover', label: 'Hover', text: 'Hover' },
        ]}
      />
      {styleState === 'hover' && <span className="muted">Changes apply on mouse-over. Press P to try them.</span>}
    </div>
  );
}

function LayoutSection({ disabled, grouped }: { disabled: boolean; grouped: boolean }) {
  const display = useStyleValue('display').value;
  const position = useStyleValue('position').value;
  const isFlex = display === 'flex' || display === 'inline-flex';
  const isGrid = display === 'grid' || display === 'inline-grid';
  return (
    <Section title="Layout">
      {!grouped && <TagSelect disabled={disabled} />}
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

function TypographySection({ disabled }: { disabled: boolean }) {
  return (
    <Section title="Typography">
      <FontPicker disabled={disabled} />
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
      <StyleInput prop="transform" label="Transform" placeholder="translateY(-2px)" disabled={disabled} />
      <StyleInput prop="transition" label="Transition" placeholder="all 0.2s ease" disabled={disabled} />
      <StyleSelect prop="cursor" label="Cursor" options={['auto', 'default', 'pointer', 'text', 'move', 'not-allowed']} disabled={disabled} />
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
        <div className="inspector-head__meta inspector-empty">
          <MousePointerClick size={20} aria-hidden="true" />
          <span>Select an element on the canvas or in Layers to edit it.</span>
        </div>
      </div>
      <Section title="Project">
        <KeyValue label="Framework">
          <FrameworkLabel framework={project.framework} />
        </KeyValue>
        <KeyValue label="Packages">
          <PackageManagerLabel manager={project.packageManager} suffix={packages} />
        </KeyValue>
        <KeyValue label="Entry">{project.entryFile ?? '—'}</KeyValue>
        <KeyValue label="Styles">{project.stylesFile}</KeyValue>
        <KeyValue label="Preview">
          {status.state === 'running' ? (
            <a className="kv-link" href={status.url} target="_blank" rel="noreferrer" title="Open in your browser">
              {status.url}
            </a>
          ) : (
            status.state
          )}
        </KeyValue>
      </Section>
      <Section title="Breakpoints">
        <KeyValue label="Tablet">≤ {project.breakpoints.tablet}px</KeyValue>
        <KeyValue label="Mobile">≤ {project.breakpoints.mobile}px</KeyValue>
        <p className="muted" style={{ margin: 0, lineHeight: 1.5 }}>
          {project.breakpoints.detected ? 'Detected from the project’s existing media queries.' : 'Defaults. No existing max-width media queries were found.'} Each frame edits the scope its width falls in; resize a frame or select an element in another frame to change scope.
        </p>
      </Section>
    </>
  );
}

function GroupHeader() {
  const selection = useStore((s) => s.selection)!;
  const group = useStore((s) => s.multiSelect);
  const names = [...group, selection].map((m) => m.name);
  return (
    <div className="inspector-head">
      <div className="inspector-head__row">
        <strong className="inspector-head__title">{names.length} elements</strong>
        <Button size="sm" variant="ghost" onClick={() => setState({ multiSelect: [] })}>
          Clear
        </Button>
      </div>
      <div className="inspector-head__meta" title={names.join(', ')}>
        Style changes apply to all of them. Values shown are from {selection.name}.
      </div>
    </div>
  );
}

export function Inspector() {
  const selection = useStore((s) => s.selection);
  const info = useStore((s) => s.sourceInfo);
  const sourceError = useStore((s) => s.sourceError);
  const project = useStore((s) => s.project)!;
  const width = useStore((s) => s.rightWidth);
  const scope = useActiveBreakpoint();
  const grouped = useStore((s) => s.multiSelect.length > 0);

  const disabled = !info || !project.editable;

  return (
    <Panel
      side="right"
      width={width}
      aria-label="Inspector"
      head={
        <>
          <PanelTitle>Inspector</PanelTitle>
          <span className="scope-tag">{SCOPE_LABEL[scope]}</span>
        </>
      }
      resizer={<Resizer value={width} min={260} max={440} invert onChange={(v) => setState({ rightWidth: v })} />}
    >
      {!selection ? (
        <PageSettings />
      ) : (
        <>
          {grouped ? <GroupHeader /> : <ElementHeader />}
          <StateToggle />
          {sourceError && <Notice>{sourceError}</Notice>}
          {!sourceError && !info && <div className="empty-note">Reading source…</div>}
          {!grouped && <ContentSection />}
          <LayoutSection disabled={disabled} grouped={grouped} />
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
