import { useEffect } from 'react';
import type { ReactNode } from 'react';
import { Dialog } from '@base-ui-components/react/dialog';

interface Props {
  open: boolean;
  /** Dismiss request (Esc, backdrop click, close button). The caller owns the
   *  decision: a dirty editor can refuse by simply not clearing its state. */
  onClose: () => void;
  /** Accessible name of the dialog (the visible title lives in `children`). */
  label: string;
  /** Extra classes on the card, e.g. "targets-card wizard-card". */
  cardClass?: string;
  children: ReactNode;
}

/**
 * The one modal shell: `.busy-overlay` backdrop + `.busy-card` panel, now on
 * base-ui's Dialog so Esc, dismissal, focus restore and the aria wiring are
 * the same in every popup (containment needs the `inert` below). Before this
 * each popup hand-rolled its own subset — Help and Catalog manager listened
 * for Esc, the wizard/targets/trap popups did not, and none of them trapped
 * or restored focus.
 *
 * Backdrop and popup are SIBLINGS in base-ui's portal (not nested like the old
 * markup), hence `.modal-card` centring the panel itself.
 *
 * NOT for the busy overlay: that one is deliberately non-modal (`role=status`,
 * a live region), it must not trap focus during a multi-minute run, and it
 * carries the 250 ms close-linger with its frozen body.
 */
export function Modal({ open, onClose, label, cardClass, children }: Props) {
  // base-ui only marks the app behind the dialog `aria-hidden`, so Tab still
  // walks into it — focus then sits in a subtree screen readers are told to
  // ignore, which is worse than the hand-rolled popups were. `inert` is the
  // real containment (unfocusable AND unclickable) and the dialog itself is
  // portalled to <body>, outside #root, so it stays interactive.
  useEffect(() => {
    if (!open) return undefined;
    const root = document.getElementById('root');
    if (!root) return undefined;
    root.setAttribute('inert', '');
    // Runs before base-ui restores focus to the opener — that element must not
    // be inert at that moment or the focus() call is a no-op.
    return () => root.removeAttribute('inert');
  }, [open]);

  return (
    <Dialog.Root
      open={open}
      // Stated explicitly (it is also the default): pointer blocking, scroll
      // lock and the focus guards all hang off this one flag.
      modal
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop className="busy-overlay" />
        <Dialog.Popup
          className={`busy-card modal-card${cardClass ? ` ${cardClass}` : ''}`}
          aria-label={label}
        >
          {children}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
