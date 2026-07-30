import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Modal } from './Modal';
import { HELP_SECTIONS, searchHelp } from '../lib/help';
import type { HelpBlock } from '../lib/help';

/** Render the manual's tiny inline markup: **bold** and `code`. */
function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) return <strong key={i}>{part.slice(2, -2)}</strong>;
    if (part.startsWith('`') && part.endsWith('`')) return <code key={i}>{part.slice(1, -1)}</code>;
    return part;
  });
}

function Block({ block }: { block: HelpBlock }) {
  switch (block.t) {
    case 'p':
      return <p>{inline(block.text)}</p>;
    case 'h':
      return <h4>{inline(block.text)}</h4>;
    case 'ul':
      return (
        <ul>
          {block.items.map((it, i) => (
            <li key={i}>{inline(it)}</li>
          ))}
        </ul>
      );
    case 'steps':
      return (
        <ol>
          {block.items.map((it, i) => (
            <li key={i}>{inline(it)}</li>
          ))}
        </ol>
      );
  }
}

interface Props {
  /** Section to scroll to when the panel opens (e.g. the active tab's). */
  initialId: string;
  onClose: () => void;
}

/**
 * In-app manual: searchable, with a table of contents. Esc, focus trapping and
 * focus restore come from the shared Modal shell.
 */
export function HelpPanel({ initialId, onClose }: Props) {
  const [query, setQuery] = useState('');
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const visible = useMemo(() => searchHelp(query), [query]);

  // Jump to the contextual section once, on mount.
  useEffect(() => {
    const el = bodyRef.current?.querySelector(`[data-help-id="${initialId}"]`);
    if (el) el.scrollIntoView({ block: 'start' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const jumpTo = (id: string) => {
    const el = bodyRef.current?.querySelector(`[data-help-id="${id}"]`);
    if (el) el.scrollIntoView({ block: 'start', behavior: 'smooth' });
  };

  return (
    <Modal open onClose={onClose} label="Handleiding" cardClass="targets-card help-card">
      <div className="help-head">
        <div className="busy-title">❓ Handleiding</div>
        <input
          type="search"
          className="help-search"
          placeholder="Zoeken… (bv. fase, export, notch)"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          // Verified: Esc pressed inside this type=search field never reaches
          // the dialog, so it would not close from the very field that has
          // focus on open. Closing here keeps the pre-Modal behaviour (focus
          // then falls to <body> instead of the ❓ button — same as before).
          onKeyDown={(e) => {
            if (e.key === 'Escape') onClose();
          }}
          autoFocus
        />
        <button type="button" onClick={onClose} title="Sluiten (Esc)" aria-label="Handleiding sluiten">
          ✕
        </button>
      </div>
      <div className="help-layout">
        <nav className="help-toc" aria-label="Inhoudsopgave">
          {HELP_SECTIONS.map((s) => {
            const hit = visible.some((v) => v.id === s.id);
            return (
              <button
                key={s.id}
                type="button"
                className={hit ? '' : 'muted'}
                disabled={!hit}
                onClick={() => jumpTo(s.id)}
              >
                {s.title}
              </button>
            );
          })}
        </nav>
        <div className="help-body" ref={bodyRef}>
          {visible.length === 0 && (
            <p className="sub">Niets gevonden voor “{query}” — probeer een ander woord.</p>
          )}
          {visible.map((s) => (
            <section key={s.id} data-help-id={s.id}>
              <h3>{s.title}</h3>
              {s.blocks.map((b, i) => (
                <Block key={i} block={b} />
              ))}
            </section>
          ))}
        </div>
      </div>
    </Modal>
  );
}
