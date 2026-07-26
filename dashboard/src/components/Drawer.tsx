/**
 * Slide-out side panel from the right, used for drill-down detail views.
 */

import { useEffect, useRef, type ReactNode } from 'react';
import { useFocusTrap } from '../hooks/useFocusTrap';

interface DrawerProps {
  isOpen: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}

export function Drawer({ isOpen, title, onClose, children, footer }: DrawerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  useFocusTrap(containerRef, isOpen);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  return (
    <div className={`drawer-overlay ${isOpen ? 'drawer-overlay--open' : ''}`} onClick={onClose} aria-hidden={!isOpen}>
      <div
        className={`drawer ${isOpen ? 'drawer--open' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="drawer-title"
        ref={containerRef}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="drawer__header">
          <div id="drawer-title" className="drawer__title">
            {title}
          </div>
          {/* aria-hidden on the overlay above doesn't remove this button from the tab
              order by itself - a keyboard user could still Tab into it while the drawer
              is visually closed (a real axe "aria-hidden-focus" violation). tabIndex
              keeps it out of the tab order and unclickable via keyboard while closed. */}
          <button
            className="modal__close"
            onClick={onClose}
            aria-label="Close panel"
            tabIndex={isOpen ? 0 : -1}
          >
            ×
          </button>
        </div>
        <div className="drawer__body">{children}</div>
        {footer && <div className="drawer__footer">{footer}</div>}
      </div>
    </div>
  );
}
