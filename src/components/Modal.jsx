import React, { useEffect, useRef, useCallback } from 'react';

/**
 * Modal dialog with focus trap, ESC close, backdrop click,
 * slide-in animation, and scrollable body.
 */
export default function Modal({
  title,
  children,
  footer,
  onClose,
  wide = false,
  fullWidth = false,
  closable = true,
}) {
  const modalRef = useRef(null);
  const previousFocusRef = useRef(null);

  // Store previously focused element and focus the modal on mount
  useEffect(() => {
    previousFocusRef.current = document.activeElement;
    // Small delay to let the animation start before focusing
    const timer = setTimeout(() => {
      if (modalRef.current) {
        const firstFocusable = getFocusableElements(modalRef.current)[0];
        if (firstFocusable) firstFocusable.focus();
        else modalRef.current.focus();
      }
    }, 50);

    return () => {
      clearTimeout(timer);
      // Restore focus on unmount
      if (previousFocusRef.current && typeof previousFocusRef.current.focus === 'function') {
        previousFocusRef.current.focus();
      }
    };
  }, []);

  // ESC key handler
  useEffect(() => {
    if (!closable) return;
    const handleEsc = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose?.();
      }
    };
    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [closable, onClose]);

  // Prevent body scroll while modal is open
  useEffect(() => {
    const original = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = original;
    };
  }, []);

  // Focus trap
  const handleKeyDown = useCallback(
    (e) => {
      if (e.key !== 'Tab' || !modalRef.current) return;

      const focusable = getFocusableElements(modalRef.current);
      if (focusable.length === 0) {
        e.preventDefault();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    },
    []
  );

  const handleBackdropClick = useCallback(
    (e) => {
      if (closable && e.target === e.currentTarget) {
        onClose?.();
      }
    },
    [closable, onClose]
  );

  const maxWidth = fullWidth ? '95%' : wide ? '900px' : '600px';

  return (
    <div
      className="modal-overlay nova-modal-overlay"
      onClick={handleBackdropClick}
      onKeyDown={handleKeyDown}
      role="dialog"
      aria-modal="true"
      aria-label={title || 'Dialog'}
    >
      <div
        className="modal nova-modal-animated"
        ref={modalRef}
        tabIndex={-1}
        style={{ maxWidth, outline: 'none' }}
      >
        <div className="modal-header">
          <span>{title}</span>
          {closable && (
            <button
              className="close"
              onClick={onClose}
              aria-label="Chiudi"
              type="button"
            >
              {'\u00D7'}
            </button>
          )}
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>

      <style>{`
        .nova-modal-overlay {
          animation: nova-modal-fade-in 0.15s ease-out;
        }
        .nova-modal-animated {
          animation: nova-modal-slide-in 0.2s ease-out;
        }
        @keyframes nova-modal-fade-in {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes nova-modal-slide-in {
          from {
            opacity: 0;
            transform: translateY(-20px) scale(0.97);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
      `}</style>
    </div>
  );
}

function getFocusableElements(container) {
  const selector = [
    'a[href]',
    'button:not([disabled])',
    'input:not([disabled])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
  ].join(', ');
  return Array.from(container.querySelectorAll(selector)).filter(
    (el) => !el.closest('[hidden]') && el.offsetParent !== null
  );
}
