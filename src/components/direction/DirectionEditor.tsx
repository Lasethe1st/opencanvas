import { ChevronDown, FileCode2, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import type { PickedImage } from '../../../shared/api';
import { firstFamily } from '../../../shared/fonts';
import type { DesignSystemConfig, DirectionConfig } from '../../../shared/project-config';
import { errorMessage } from '../../lib/actions';
import { api } from '../../lib/api';
import { loadFontPreview, useGoogleFonts } from '../../lib/fonts';
import { plural } from '../../lib/plural';
import { toast } from '../../lib/store';
import { Button, IconButton } from '../../ui/primitives.jsx';
import { FontMenu } from '../inspector/FontPicker';
import { DirectionPicker } from './DirectionPicker';
import { IconPackPicker } from './IconPackPicker';
import { InspirationProviders } from './InspirationProviders';
import { ReferenceManager } from './ReferenceManager';

export function DirectionSection({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="direction-section">
      <h3 className="direction-section__title">{title}</h3>
      {hint && <p className="direction-section__hint">{hint}</p>}
      {children}
    </section>
  );
}

/** Preferred typeface for new work, chosen from the same catalogue as the inspector's font picker. */
export function FontChoice({ value, onChange }: { value: string | null; onChange: (v: string | null) => void }) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const catalog = useGoogleFonts(true);
  useEffect(() => {
    const font = value && catalog?.fonts.find((f) => f.family.toLowerCase() === value.toLowerCase());
    if (font) loadFontPreview(font);
  }, [catalog, value]);
  const close = useCallback((refocus: boolean) => {
    setOpen(false);
    if (refocus) trigger.current?.focus();
  }, []);
  return (
    <div className="font-choice">
      <button ref={trigger} type="button" className="font-choice__trigger" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <span style={{ fontFamily: value ? `'${value}', system-ui` : undefined }}>{value ?? 'No preference'}</span>
        <ChevronDown size={13} aria-hidden />
      </button>
      {value && (
        <IconButton size="sm" label="Clear font" onClick={() => onChange(null)}>
          <X size={12} />
        </IconButton>
      )}
      {open && trigger.current && <FontMenu anchor={trigger.current} current={value ?? ''} onClose={close} onPick={(stack) => onChange(firstFamily(stack) || stack)} />}
    </div>
  );
}

/** Imports tokens from a CSS or token JSON file. The tokens are saved as context; nothing in the project changes. */
export function DesignSystemImport({ value, onChange }: { value: DesignSystemConfig | null; onChange: (v: DesignSystemConfig | null) => void }) {
  const [busy, setBusy] = useState(false);
  const pick = async () => {
    setBusy(true);
    try {
      const system = await api.direction.importDesignSystem();
      if (system) onChange(system);
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setBusy(false);
    }
  };
  if (!value) {
    return (
      <Button size="sm" icon={<FileCode2 size={13} />} disabled={busy} onClick={() => void pick()}>
        {busy ? 'Reading…' : 'Import CSS or tokens JSON'}
      </Button>
    );
  }
  const entries = Object.entries(value.tokens);
  const colors = entries.filter(([, v]) => /^(#|rgb|hsl|oklch|oklab|color\()/i.test(v)).slice(0, 12);
  return (
    <div className="ds-summary">
      <div className="ds-summary__head">
        <FileCode2 size={14} aria-hidden />
        <span className="ds-summary__file">{value.file}</span>
        <span className="ds-summary__count">{plural(entries.length, 'token', 'tokens')}</span>
        <Button size="sm" variant="ghost" disabled={busy} onClick={() => void pick()}>
          Replace
        </Button>
        <IconButton size="sm" label="Remove design system" onClick={() => onChange(null)}>
          <X size={12} />
        </IconButton>
      </div>
      {colors.length > 0 && (
        <div className="ds-summary__swatches" aria-label="Colour tokens">
          {colors.map(([k, v]) => (
            <span key={k} className="ds-summary__swatch" style={{ background: v }} title={`${k}: ${v}`} />
          ))}
        </div>
      )}
    </div>
  );
}

export interface DirectionDraft {
  direction: DirectionConfig;
  pending: Record<string, PickedImage>;
}

/** All direction settings. Used by project setup and by the Direction popup in the dock. */
export function DirectionEditor({ draft, onChange, compact }: { draft: DirectionDraft; onChange: (d: DirectionDraft) => void; compact?: boolean }) {
  const { direction, pending } = draft;
  const set = (patch: Partial<DirectionConfig>) => onChange({ direction: { ...direction, ...patch }, pending });
  return (
    <div className={`direction-editor${compact ? ' is-compact' : ''}`}>
      <DirectionSection title="Visual style" hint="Drag the point, or focus it and use the arrow keys.">
        <DirectionPicker value={direction.visualStyle} onChange={(visualStyle) => set({ visualStyle })} compact={compact} />
      </DirectionSection>
      <DirectionSection title="Typeface">
        <FontChoice value={direction.font} onChange={(font) => set({ font })} />
      </DirectionSection>
      <DirectionSection title="Icons">
        <IconPackPicker value={direction.iconPack} onChange={(iconPack) => set({ iconPack })} />
      </DirectionSection>
      <DirectionSection title="Design system" hint="Optional. Tokens are shared with your AI agent as context.">
        <DesignSystemImport value={direction.designSystem} onChange={(designSystem) => set({ designSystem })} />
      </DirectionSection>
      <DirectionSection title="References" hint="Saved inside the project in .opencanvas so they travel with it.">
        <ReferenceManager value={direction.references} pending={pending} onChange={(references, p) => onChange({ direction: { ...direction, references }, pending: p ?? pending })} />
      </DirectionSection>
      {!compact && (
        <DirectionSection title="Inspiration sources">
          <InspirationProviders />
        </DirectionSection>
      )}
    </div>
  );
}

/** Reference id → picked file path, the shape the main process copies from. */
export const uploadPaths = (pending: Record<string, PickedImage>) => Object.fromEntries(Object.entries(pending).map(([id, p]) => [id, p.file]));
