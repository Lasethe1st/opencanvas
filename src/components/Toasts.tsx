import { useStore } from '../lib/store';
import { Toasts as ToastStack } from '../ui/Overlays.jsx';

export function Toasts() {
  const toasts = useStore((s) => s.toasts);
  return <ToastStack toasts={toasts} />;
}
