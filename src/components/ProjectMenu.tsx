/**
 * UI-3 — THE PROJECT MENU. Everything that acts on the WHOLE project lives
 * here, in the top bar, on every page: new, open, save, load an example, and
 * where the autosave stands.
 *
 * Why it exists (Sander, 15-11-2026): "Reset" and "Load KOAN demo data" sat in
 * the Your-project step between buttons that add ONE file, so they were found
 * in the wrong place, and Reset — which reloads the page and throws the whole
 * project away — sat one button from "Save project" with no confirmation.
 *
 * Two rules:
 *   1. Anything that REPLACES the current project (new, an example) asks first
 *      when there is work to lose, and offers the save in the same breath.
 *   2. Nothing here decides anything about a design: these are file actions.
 *
 * The menu is a plain <details>, closed on an outside click and on Esc — the
 * same disclosure pattern as the ⚙ preferences popover next to it.
 */
import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { t } from '../lib/i18n.ts';

export const PROJECT_MENU_VERSION = 'project-menu/1.0';

/** What a replacing action is about to do, while it waits for a yes. */
type Pending = { kind: 'new' } | { kind: 'example'; ways: 2 | 3 } | null;

export interface ProjectMenuProps {
  /** True when the project holds work a replace would throw away. */
  hasWork: boolean;
  canSave: boolean;
  onSave: () => void;
  onOpenFile: (e: ChangeEvent<HTMLInputElement>) => void;
  /** Clears the autosave and starts empty. Labelled "Reset" because that is
   *  the word people look for (Sander, 15-11-2026); it IS the new project. */
  onNew: () => void;
  onExample: (ways: 2 | 3) => void;
  /** "Restored from autosave" and the like — null when nothing to say. */
  autosaveNote: string | null;
}

export default function ProjectMenu(p: ProjectMenuProps) {
  const ref = useRef<HTMLDetailsElement>(null);
  const [pending, setPending] = useState<Pending>(null);

  const close = () => {
    if (ref.current) ref.current.open = false;
    setPending(null);
  };

  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      const el = ref.current;
      if (el?.open && !el.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && ref.current?.open) close();
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, []);

  const run = (what: NonNullable<Pending>) => {
    close();
    if (what.kind === 'new') p.onNew();
    else p.onExample(what.ways);
  };
  /** Rule 1: ask only when there is something to lose. */
  const ask = (what: NonNullable<Pending>) => (p.hasWork ? setPending(what) : run(what));

  return (
    <details className="project-menu" ref={ref} onToggle={(e) => !(e.currentTarget as HTMLDetailsElement).open && setPending(null)}>
      <summary title={t('New, open, save, examples — everything that acts on the whole project')}>
        <span aria-hidden="true">📁</span> {t('Project')} <span className="pm-caret" aria-hidden="true">▾</span>
      </summary>
      <div className="project-pop" role="menu">
        {pending ? (
          <div className="pm-confirm" role="alertdialog" aria-label={t('Replace the current project?')}>
            <strong>{pending.kind === 'new' ? t('Reset to a new, empty project?') : t('Load the example project?')}</strong>
            <p className="derived">
              {t('Your current project — measurements, filters, networks — is replaced. The component catalog stays. Save it first if you want to keep it.')}
            </p>
            <div className="pm-confirm-row">
              {p.canSave && (
                <button type="button" onClick={p.onSave}>
                  {t('Save project first')}
                </button>
              )}
              <button type="button" className="danger" onClick={() => run(pending)}>
                {pending.kind === 'new' ? t('Reset') : t('Load example')}
              </button>
              <button type="button" onClick={() => setPending(null)}>
                {t('Cancel')}
              </button>
            </div>
          </div>
        ) : (
          <>
            <button type="button" role="menuitem" onClick={() => ask({ kind: 'new' })}>
              {t('Reset — new, empty project…')}
            </button>
            <label className="pm-item" role="menuitem">
              {t('Open project…')}
              <input
                type="file"
                accept=".json,.adsproj"
                onChange={(e) => {
                  close();
                  p.onOpenFile(e);
                }}
                style={{ display: 'none' }}
              />
            </label>
            <button
              type="button"
              role="menuitem"
              disabled={!p.canSave}
              onClick={() => {
                close();
                p.onSave();
              }}
              title={t('Download everything (raw measurement files + design state) as one project file')}
            >
              {t('Save project')}
            </button>
            <div className="pm-sep" role="separator" />
            <span className="pm-label">{t('Example project (KOAN 2951)')}</span>
            <button
              type="button"
              role="menuitem"
              onClick={() => ask({ kind: 'example', ways: 3 })}
              title={t('Load the 3-way KOAN 2951 session of Aug 2026: woofer pair (measured together), mid and tweeter at 0–60°, near-field cones + port, LIMP impedances, and the cabinet/rig as entered — the full three-branch flow, no VituixCAD project needed')}
            >
              {t('3-way example')}
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => ask({ kind: 'example', ways: 2 })}
              title={t('Load the bundled KOAN 2951 mid + tweeter as a two-way (casus 1b, Aug 2026): the merged midrange, the gated tweeter, both impedances, the measured cabinet and the requirements that casebook states')}
            >
              {t('2-way example (mid + tweeter)')}
            </button>
            <div className="pm-sep" role="separator" />
            <span className="pm-note derived">
              {p.autosaveNote ? `${p.autosaveNote} · ` : ''}
              {t('autosaves locally on every change')}
            </span>
          </>
        )}
      </div>
    </details>
  );
}
