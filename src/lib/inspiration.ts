/** Inspiration providers as the editor sees them, shared by the provider list and the Savee panel. */
import { create } from 'zustand';
import type { InspirationProviderInfo } from '../../shared/inspiration';
import { errorMessage } from './actions';
import { api } from './api';
import { toast } from './store';

interface InspirationState {
  providers: InspirationProviderInfo[] | null;
  /** Provider waiting for the browser sign-in. */
  connecting: string | null;
}

export const useInspiration = create<InspirationState>(() => ({ providers: null, connecting: null }));

const replace = (info: InspirationProviderInfo) =>
  useInspiration.setState((s) => ({ providers: (s.providers ?? [info]).map((p) => (p.id === info.id ? info : p)) }));

export async function loadProviders() {
  try {
    useInspiration.setState({ providers: await api.inspiration.providers() });
  } catch {
    useInspiration.setState({ providers: [] });
  }
}

export async function connectProvider(id: string): Promise<boolean> {
  useInspiration.setState({ connecting: id });
  try {
    const info = await api.inspiration.connect(id);
    replace(info);
    toast(info.account ? `Savee connected as @${info.account}.` : `${info.name} connected.`, 'success');
    return true;
  } catch (err) {
    const message = errorMessage(err);
    if (!/cancelled/i.test(message)) toast(message, 'error');
    return false;
  } finally {
    useInspiration.setState({ connecting: null });
    void loadProviders();
  }
}

/** Also cancels a sign-in that is still waiting in the browser. */
export async function disconnectProvider(id: string) {
  try {
    replace(await api.inspiration.disconnect(id));
  } catch (err) {
    toast(errorMessage(err), 'error');
  }
}

/** A provider call failed because the sign-in is gone; show the provider as disconnected. */
export function refreshAfterError(message: string) {
  if (/connect (savee )?again|isn’t connected/i.test(message)) void loadProviders();
}
