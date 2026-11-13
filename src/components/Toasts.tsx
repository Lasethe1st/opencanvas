import { Toaster } from 'sonner';
import { useTheme } from '../lib/theme';

/** The one Sonner toaster for this window, styled with the app's tokens. */
export function Toasts() {
  const theme = useTheme().resolved;
  return (
    <Toaster
      theme={theme === 'dark' ? 'dark' : 'light'}
      position="bottom-right"
      offset={14}
      gap={8}
      toastOptions={{
        classNames: { toast: 'oc-toast', actionButton: 'oc-toast__action', title: 'oc-toast__title' },
      }}
    />
  );
}
