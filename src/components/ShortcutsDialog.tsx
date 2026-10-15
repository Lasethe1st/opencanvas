import { Fragment, useEffect } from 'react';
import { SHORTCUT_GROUPS } from '../lib/shortcuts';
import { setState, useStore } from '../lib/store';
import { Dialog } from '../ui/Overlays.jsx';

export function ShortcutsDialog() {
  const open = useStore((s) => s.shortcutsOpen);
  useEffect(() => {
    if (open) document.querySelector<HTMLElement>('.shortcuts-dialog')?.focus();
  }, [open]);
  if (!open) return null;
  const close = () => setState({ shortcutsOpen: false });
  return (
    <Dialog title="Keyboard shortcuts" className="dialog shortcuts-dialog" onClose={close} onKeyDown={(e) => {
        if (e.key !== 'Escape') return;
        e.stopPropagation();
        close();
      }} tabIndex={-1}>
      <div className="shortcuts">
        {SHORTCUT_GROUPS.map((group) => (
          <section key={group.title} className="shortcuts__group">
            <h3>{group.title}</h3>
            <dl>
              {group.items.map((item) => (
                <Fragment key={item.label}>
                  <dt>{item.label}</dt>
                  <dd>
                    {item.keys.map((combo, i) => (
                      <Fragment key={i}>
                        {i > 0 && <span className="shortcuts__or">or</span>}
                        <span className="shortcuts__combo">
                          {combo.map((k) => (
                            <kbd key={k}>{k}</kbd>
                          ))}
                        </span>
                      </Fragment>
                    ))}
                  </dd>
                </Fragment>
              ))}
            </dl>
          </section>
        ))}
      </div>
    </Dialog>
  );
}
