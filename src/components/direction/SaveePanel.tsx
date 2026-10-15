import { Check, ImageOff, Link2, Loader2, Plus, Search } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { PickedImage } from '../../../shared/api';
import type { InspirationBoard, InspirationResult } from '../../../shared/inspiration';
import type { DesignReference } from '../../../shared/project-config';
import { errorMessage } from '../../lib/actions';
import { api } from '../../lib/api';
import { connectProvider, disconnectProvider, loadProviders, refreshAfterError, useInspiration } from '../../lib/inspiration';
import { Button, cx, Segmented } from '../../ui/primitives.jsx';

const PROVIDER = 'savee';

const thumbs = new Map<string, Promise<PickedImage>>();

function thumbnail(url: string): Promise<PickedImage> {
  if (!thumbs.has(url)) {
    const p = api.inspiration.image(PROVIDER, url);
    p.catch(() => thumbs.delete(url));
    thumbs.set(url, p);
  }
  return thumbs.get(url)!;
}

/** Search Savee or browse your boards, and add saves as references. */
export function SaveePanel({ existing, onAdd }: { existing: DesignReference[]; onAdd: (ref: DesignReference, image?: PickedImage) => void }) {
  const info = useInspiration((s) => s.providers?.find((p) => p.id === PROVIDER) ?? null);
  const connecting = useInspiration((s) => s.connecting === PROVIDER);

  useEffect(() => {
    if (!info) void loadProviders();
  }, [info]);

  if (!info) return <p className="savee__note">Loading Savee…</p>;
  if (info.status !== 'connected') {
    return (
      <div className="savee">
        <p className="savee__note">{info.detail}</p>
        {info.canConnect && (
          <div className="savee__actions">
            {connecting ? (
              <>
                <span className="savee__waiting" role="status">
                  <Loader2 size={13} className="ai-spin" aria-hidden /> Approve the connection in your browser…
                </span>
                <Button size="sm" variant="ghost" onClick={() => void disconnectProvider(PROVIDER)}>
                  Cancel
                </Button>
              </>
            ) : (
              <Button size="sm" variant="primary" icon={<Link2 size={12} />} onClick={() => void connectProvider(PROVIDER)}>
                Connect Savee
              </Button>
            )}
          </div>
        )}
      </div>
    );
  }
  return <SaveeBrowser account={info.account ?? null} existing={existing} onAdd={onAdd} />;
}

type View = 'search' | 'boards';

function SaveeBrowser({ account, existing, onAdd }: { account: string | null; existing: DesignReference[]; onAdd: (ref: DesignReference, image?: PickedImage) => void }) {
  const [view, setView] = useState<View>('search');
  const [query, setQuery] = useState('');
  const [boards, setBoards] = useState<InspirationBoard[] | null>(null);
  const [board, setBoard] = useState('');
  const [results, setResults] = useState<InspirationResult[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (fn: () => Promise<InspirationResult[]>) => {
    setLoading(true);
    setError(null);
    try {
      setResults(await fn());
    } catch (err) {
      const message = errorMessage(err);
      setError(message);
      refreshAfterError(message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (view !== 'boards' || boards) return;
    api.inspiration.boards(PROVIDER).then(setBoards, (err) => {
      const message = errorMessage(err);
      setError(message);
      refreshAfterError(message);
      setBoards([]);
    });
  }, [view, boards]);

  const switchView = (next: View) => {
    setView(next);
    setResults(null);
    setError(null);
  };

  return (
    <div className="savee">
      <div className="savee__head">
        <Segmented
          label="Savee"
          value={view}
          onChange={switchView}
          options={[
            { id: 'search', label: 'Search Savee' },
            { id: 'boards', label: 'My boards' },
          ]}
        />
        <span className="savee__account">{account ? `@${account}` : 'Connected'}</span>
        <button type="button" className="git-link" onClick={() => void disconnectProvider(PROVIDER)}>
          Disconnect
        </button>
      </div>

      {view === 'search' ? (
        <form
          className="savee__search"
          onSubmit={(e) => {
            e.preventDefault();
            if (query.trim().length >= 2 && !loading) void run(() => api.inspiration.search(PROVIDER, query));
          }}
        >
          <Search size={13} aria-hidden />
          <input aria-label="Search Savee" placeholder="Search Savee, then press Enter" value={query} spellCheck={false} onChange={(e) => setQuery(e.target.value)} />
          <Button size="sm" type="submit" disabled={query.trim().length < 2 || loading}>
            Search
          </Button>
        </form>
      ) : (
        <select
          className="savee__board"
          aria-label="Board"
          value={board}
          disabled={!boards?.length}
          onChange={(e) => {
            setBoard(e.target.value);
            if (e.target.value) void run(() => api.inspiration.boardItems(PROVIDER, e.target.value));
          }}
        >
          <option value="">{!boards ? 'Loading boards…' : boards.length ? 'Choose a board' : 'No boards'}</option>
          {boards?.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name} ({b.count})
            </option>
          ))}
        </select>
      )}

      {view === 'search' && !results && !error && <p className="savee__note">Each search counts toward Savee’s limit of 200 a week (20 every 5 minutes). Browsing your boards doesn’t.</p>}
      {error && (
        <p className="refs__error" role="alert">
          {error}
        </p>
      )}
      {loading && (
        <p className="savee__note" role="status">
          <Loader2 size={12} className="ai-spin" aria-hidden /> Loading…
        </p>
      )}
      {results && !loading && (
        results.length ? (
          <ul className="savee__grid" aria-label="Savee results">
            {results.map((r) => (
              <SaveeTile key={r.id} item={r} added={existing.some((x) => x.url === r.url)} onAdd={onAdd} />
            ))}
          </ul>
        ) : (
          <p className="savee__note">Nothing found. Try a broader word.</p>
        )
      )}
    </div>
  );
}

function SaveeTile({ item, added, onAdd }: { item: InspirationResult; added: boolean; onAdd: (ref: DesignReference, image?: PickedImage) => void }) {
  const [image, setImage] = useState<PickedImage | null>(null);
  const [failed, setFailed] = useState(false);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    if (!item.imageUrl) return;
    let alive = true;
    thumbnail(item.imageUrl).then(
      (img) => alive && setImage(img),
      () => alive && setFailed(true),
    );
    return () => {
      alive = false;
    };
  }, [item.imageUrl]);

  const add = async () => {
    setAdding(true);
    const img = image ?? (item.imageUrl ? await thumbnail(item.imageUrl).catch(() => null) : null);
    onAdd(
      {
        id: `r${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
        title: item.title,
        url: item.url,
        imagePath: null,
        source: 'savee',
        role: 'overall',
        note: '',
        primary: false,
        addedAt: Date.now(),
        tags: item.tags,
        colors: item.colors,
      },
      img ?? undefined,
    );
    setAdding(false);
  };

  return (
    <li className={cx('savee-tile', added && 'is-added')}>
      <div className="savee-tile__thumb" style={!image && item.colors[0] ? { background: item.colors[0] } : undefined}>
        {image ? <img src={image.dataUrl} alt="" /> : failed || !item.imageUrl ? <ImageOff size={14} aria-hidden /> : null}
      </div>
      {item.colors.length > 0 && (
        <div className="savee-tile__colors" aria-hidden>
          {item.colors.slice(0, 5).map((c) => (
            <span key={c} style={{ background: c }} />
          ))}
        </div>
      )}
      <span className="savee-tile__title" title={item.title}>
        {item.title}
      </span>
      <button type="button" className="savee-tile__add" disabled={added || adding} onClick={() => void add()} aria-label={added ? `${item.title} is added` : `Add ${item.title} as a reference`}>
        {added ? <Check size={12} aria-hidden /> : adding ? <Loader2 size={12} className="ai-spin" aria-hidden /> : <Plus size={12} aria-hidden />}
        {added ? 'Added' : 'Add'}
      </button>
    </li>
  );
}
