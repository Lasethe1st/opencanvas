import { Check, Monitor, Moon, Sun } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { ThemePreference } from '../../shared/types';
import { setThemePreference, useTheme } from '../lib/theme';
import { IconButton, Menu, MenuItem } from '../ui/primitives.jsx';

const OPTIONS: { id: ThemePreference; label: string; icon: typeof Sun }[] = [
  { id: 'system', label: 'System', icon: Monitor },
  { id: 'light', label: 'Light', icon: Sun },
  { id: 'dark', label: 'Dark', icon: Moon },
];

export function ThemeMenu() {
  const { preference, resolved } = useTheme();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const Icon = resolved === 'dark' ? Moon : Sun;

  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !ref.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('pointerdown', close);
    window.addEventListener('keydown', close);
    return () => {
      window.removeEventListener('pointerdown', close);
      window.removeEventListener('keydown', close);
    };
  }, [open]);

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <IconButton label="Theme" active={open} onClick={() => setOpen((v) => !v)} aria-haspopup="menu" aria-expanded={open}>
        <Icon size={15} />
      </IconButton>
      {open && (
        <Menu style={{ right: 0, top: 'calc(100% + 6px)', minWidth: 170 }}>
          <div className="menu-title">Theme</div>
          {OPTIONS.map(({ id, label, icon: OptionIcon }) => (
            <MenuItem
              key={id}
              role="menuitemradio"
              aria-checked={preference === id}
              icon={<OptionIcon size={14} />}
              hint={preference === id ? <Check size={14} /> : undefined}
              onClick={() => {
                setThemePreference(id);
                setOpen(false);
              }}
            >
              {label}
            </MenuItem>
          ))}
        </Menu>
      )}
    </div>
  );
}
