import { ExternalLink, ImagePlus, Link2, Star, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { PickedImage } from '../../../shared/api';
import { REFERENCE_ROLES, type DesignReference, type ReferenceRole } from '../../../shared/project-config';
import { errorMessage } from '../../lib/actions';
import { api } from '../../lib/api';
import { toast } from '../../lib/store';
import { Button, cx, IconButton } from '../../ui/primitives.jsx';
import { SaveePanel } from './SaveePanel';

const imageCache = new Map<string, Promise<string>>();

function useStoredImage(rel: string | null, pending?: PickedImage): string | null {
  const [src, setSrc] = useState<string | null>(pending?.dataUrl ?? null);
  useEffect(() => {
    if (pending) return setSrc(pending.dataUrl);
    if (!rel) return setSrc(null);
    let alive = true;
    if (!imageCache.has(rel)) imageCache.set(rel, api.direction.image(rel));
    imageCache
      .get(rel)!
      .then((url) => alive && setSrc(url))
      .catch(() => {
        imageCache.delete(rel);
        if (alive) setSrc(null);
      });
    return () => {
      alive = false;
    };
  }, [rel, pending]);
  return src;
}

const refId = () => `r${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

function titleFromUrl(url: string): string {
  try {
    const u = new URL(url);
    return u.hostname.replace(/^www\./, '') + (u.pathname.length > 1 ? u.pathname.replace(/\/$/, '') : '');
  } catch {
    return url;
  }
}

function ReferenceCard({
  item,
  pending,
  onChange,
  onRemove,
  onPrimary,
}: {
  item: DesignReference;
  pending?: PickedImage;
  onChange: (patch: Partial<DesignReference>) => void;
  onRemove: () => void;
  onPrimary: () => void;
}) {
  const src = useStoredImage(item.imagePath, pending);
  return (
    <li className={cx('ref-card', item.primary && 'is-primary')}>
      <div className="ref-card__thumb" aria-hidden>
        {src ? <img src={src} alt="" /> : <Link2 size={16} />}
      </div>
      <div className="ref-card__body">
        <div className="ref-card__head">
          <span className="ref-card__title" title={item.url ?? item.title}>
            {item.title}
          </span>
          <IconButton size="sm" label={item.primary ? 'Primary reference' : 'Make primary'} active={item.primary} aria-pressed={item.primary} onClick={onPrimary}>
            <Star size={12} fill={item.primary ? 'currentColor' : 'none'} />
          </IconButton>
          {item.url && (
            <IconButton size="sm" label="Open in browser" onClick={() => void api.publish.open(item.url!).catch((err) => toast(errorMessage(err), 'error'))}>
              <ExternalLink size={12} />
            </IconButton>
          )}
          <IconButton size="sm" label={`Remove ${item.title}`} onClick={onRemove}>
            <Trash2 size={12} />
          </IconButton>
        </div>
        <div className="ref-card__fields">
          <select className="ref-card__role" aria-label={`What to take from ${item.title}`} value={item.role} onChange={(e) => onChange({ role: e.target.value as ReferenceRole })}>
            {REFERENCE_ROLES.map((r) => (
              <option key={r.id} value={r.id}>
                {r.label}
              </option>
            ))}
          </select>
          <input className="ref-card__note" aria-label={`Note for ${item.title}`} placeholder="What do you like about it?" value={item.note} maxLength={1000} onChange={(e) => onChange({ note: e.target.value })} />
        </div>
      </div>
    </li>
  );
}

/** Links and uploaded images that describe the look you want. Uploads stay pending until the direction is saved. */
export function ReferenceManager({
  value,
  onChange,
  pending,
}: {
  value: DesignReference[];
  /** `nextPending` is passed when uploads change along with the list. */
  onChange: (v: DesignReference[], nextPending?: Record<string, PickedImage>) => void;
  pending: Record<string, PickedImage>;
}) {
  const [url, setUrl] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saveeOpen, setSaveeOpen] = useState(false);

  const add = (ref: DesignReference, image?: PickedImage) =>
    onChange([...value, { ...ref, primary: value.length === 0 }], image ? { ...pending, [ref.id]: image } : undefined);

  const addUrl = () => {
    const clean = url.trim();
    const full = /^https?:\/\//i.test(clean) ? clean : `https://${clean}`;
    try {
      new URL(full);
    } catch {
      setError('That doesn’t look like a web address.');
      return;
    }
    if (value.some((r) => r.url === full)) {
      setError('That reference is already in the list.');
      return;
    }
    setError(null);
    setUrl('');
    const savee = /(^|\.)savee\.(com|it)$/i.test(new URL(full).hostname);
    add({ id: refId(), title: titleFromUrl(full), url: full, imagePath: null, source: savee ? 'savee' : 'link', role: 'overall', note: '', primary: false, addedAt: Date.now(), tags: [], colors: [] });
  };

  const upload = async () => {
    try {
      const picked = await api.direction.pickImage();
      if (!picked) return;
      add({ id: refId(), title: picked.name, url: null, imagePath: null, source: 'upload', role: 'overall', note: '', primary: false, addedAt: Date.now(), tags: [], colors: [] }, picked);
    } catch (err) {
      toast(errorMessage(err), 'error');
    }
  };

  const remove = (id: string) => {
    const rest = value.filter((r) => r.id !== id);
    if (rest.length && !rest.some((r) => r.primary)) rest[0] = { ...rest[0], primary: true };
    if (pending[id]) {
      const next = { ...pending };
      delete next[id];
      onChange(rest, next);
    } else onChange(rest);
  };

  return (
    <div className="refs">
      <form
        className="refs__add"
        onSubmit={(e) => {
          e.preventDefault();
          if (url.trim()) addUrl();
        }}
      >
        <input
          value={url}
          onChange={(e) => {
            setUrl(e.target.value);
            setError(null);
          }}
          placeholder="Paste a link (Savee, Dribbble, a live site…)"
          aria-label="Reference link"
          aria-invalid={!!error || undefined}
          aria-describedby={error ? 'oc-ref-error' : undefined}
          spellCheck={false}
        />
        <Button size="sm" type="submit" disabled={!url.trim()}>
          Add
        </Button>
        <Button size="sm" type="button" icon={<ImagePlus size={13} />} onClick={() => void upload()}>
          Upload
        </Button>
        <Button size="sm" type="button" variant={saveeOpen ? 'primary' : 'default'} aria-expanded={saveeOpen} aria-controls="oc-savee" onClick={() => setSaveeOpen((v) => !v)}>
          Savee
        </Button>
      </form>
      {error && (
        <p id="oc-ref-error" className="refs__error" role="alert">
          {error}
        </p>
      )}
      {saveeOpen && (
        <div id="oc-savee">
          <SaveePanel existing={value} onAdd={add} />
        </div>
      )}
      {value.length > 0 ? (
        <ul className="refs__list">
          {value.map((r) => (
            <ReferenceCard
              key={r.id}
              item={r}
              pending={pending[r.id]}
              onChange={(patch) => onChange(value.map((x) => (x.id === r.id ? { ...x, ...patch } : x)))}
              onRemove={() => remove(r.id)}
              onPrimary={() => onChange(value.map((x) => ({ ...x, primary: x.id === r.id })))}
            />
          ))}
        </ul>
      ) : (
        <p className="refs__empty">No references yet. The star marks the one that matters most.</p>
      )}
    </div>
  );
}
