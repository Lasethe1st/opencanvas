import { ExternalLink, Link2, Loader2, Unlink } from 'lucide-react';
import { useEffect } from 'react';
import type { InspirationStatus } from '../../../shared/inspiration';
import { api } from '../../lib/api';
import { connectProvider, disconnectProvider, loadProviders, useInspiration } from '../../lib/inspiration';
import { Button, cx } from '../../ui/primitives.jsx';

const STATUS_LABEL: Record<InspirationStatus, string> = {
  connected: 'Connected',
  'needs-auth': 'Not connected',
  unavailable: 'Unavailable',
};

/** Inspiration sources and their real connection state. Nothing is searched unless a provider is connected. */
export function InspirationProviders() {
  const providers = useInspiration((s) => s.providers);
  const connecting = useInspiration((s) => s.connecting);
  useEffect(() => {
    void loadProviders();
  }, []);
  if (!providers?.length) return null;
  return (
    <div className="providers">
      {providers.map((p) => {
        const waiting = connecting === p.id;
        return (
          <div key={p.id} className="provider">
            <div className="provider__head">
              <span className="provider__name">{p.name}</span>
              <span className={cx('provider__status', p.status === 'connected' && 'is-connected')}>
                {waiting ? 'Waiting for the browser…' : p.status === 'connected' && p.account ? `Connected as @${p.account}` : STATUS_LABEL[p.status]}
              </span>
            </div>
            <p className="provider__detail">{p.detail}</p>
            {p.workaround && <p className="provider__detail">{p.workaround}</p>}
            <div className="provider__actions">
              {p.status === 'connected' ? (
                <Button size="sm" variant="ghost" icon={<Unlink size={12} />} onClick={() => void disconnectProvider(p.id)}>
                  Disconnect
                </Button>
              ) : waiting ? (
                <Button size="sm" variant="ghost" onClick={() => void disconnectProvider(p.id)}>
                  Cancel
                </Button>
              ) : (
                p.canConnect && (
                  <Button size="sm" variant="primary" icon={connecting ? <Loader2 size={12} className="ai-spin" /> : <Link2 size={12} />} disabled={!!connecting} onClick={() => void connectProvider(p.id)}>
                    Connect {p.name}
                  </Button>
                )
              )}
              {p.docsUrl && (
                <Button size="sm" variant="ghost" icon={<ExternalLink size={12} />} onClick={() => void api.publish.open(p.docsUrl!)}>
                  How {p.name} connects
                </Button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
