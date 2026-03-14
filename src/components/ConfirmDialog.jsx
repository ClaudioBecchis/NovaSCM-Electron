import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';

const ConfirmContext = createContext(null);

const TYPE_STYLES = {
  info: {
    iconColor: 'var(--accent)',
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" />
        <text x="12" y="17" textAnchor="middle" fontSize="15" fontWeight="700" fill="currentColor">i</text>
      </svg>
    ),
    confirmClass: 'primary',
  },
  warning: {
    iconColor: 'var(--amber)',
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <path d="M12 2L22 20H2L12 2z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
        <text x="12" y="17" textAnchor="middle" fontSize="13" fontWeight="700" fill="currentColor">!</text>
      </svg>
    ),
    confirmClass: 'amber',
  },
  danger: {
    iconColor: 'var(--red)',
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" />
        <path d="M8 8l8 8M16 8l-8 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    ),
    confirmClass: 'red',
  },
};

/**
 * Provides a confirm() function via context.
 * Wrap your app in <ConfirmProvider> and use useConfirm() to get the function.
 */
export function ConfirmProvider({ children }) {
  const [state, setState] = useState(null);
  const resolveRef = useRef(null);
  const confirmBtnRef = useRef(null);
  const previousFocusRef = useRef(null);

  const confirm = useCallback((title, message, options = {}) => {
    return new Promise((resolve) => {
      resolveRef.current = resolve;
      previousFocusRef.current = document.activeElement;
      setState({
        title,
        message,
        confirmText: options.confirmText || 'Conferma',
        cancelText: options.cancelText || 'Annulla',
        type: options.type || 'info',
      });
    });
  }, []);

  const handleConfirm = useCallback(() => {
    resolveRef.current?.(true);
    resolveRef.current = null;
    setState(null);
    previousFocusRef.current?.focus?.();
  }, []);

  const handleCancel = useCallback(() => {
    resolveRef.current?.(false);
    resolveRef.current = null;
    setState(null);
    previousFocusRef.current?.focus?.();
  }, []);

  // Focus confirm button when dialog appears
  useEffect(() => {
    if (state && confirmBtnRef.current) {
      confirmBtnRef.current.focus();
    }
  }, [state]);

  // ESC to cancel
  useEffect(() => {
    if (!state) return;
    const handleEsc = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        handleCancel();
      }
    };
    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [state, handleCancel]);

  // Focus trap
  const handleKeyDown = useCallback(
    (e) => {
      if (e.key !== 'Tab') return;
      const container = e.currentTarget;
      const focusable = Array.from(
        container.querySelectorAll('button:not([disabled])')
      );
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    },
    []
  );

  const typeStyle = state ? (TYPE_STYLES[state.type] || TYPE_STYLES.info) : null;

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}

      {state && (
        <div
          className="modal-overlay nova-confirm-overlay"
          onClick={handleCancel}
          onKeyDown={handleKeyDown}
          role="alertdialog"
          aria-modal="true"
          aria-label={state.title}
        >
          <div
            className="modal nova-confirm-animated"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: 440, outline: 'none' }}
          >
            <div className="modal-body" style={{ padding: '24px 24px 16px' }}>
              <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
                <span style={{ color: typeStyle.iconColor, flexShrink: 0 }}>
                  {typeStyle.icon}
                </span>
                <div style={{ flex: 1 }}>
                  <div
                    style={{
                      fontSize: 14,
                      fontWeight: 700,
                      color: 'var(--text)',
                      marginBottom: 8,
                    }}
                  >
                    {state.title}
                  </div>
                  <div
                    style={{
                      fontSize: 13,
                      color: 'var(--text-muted)',
                      lineHeight: 1.5,
                    }}
                  >
                    {state.message}
                  </div>
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button
                className="btn"
                onClick={handleCancel}
                type="button"
              >
                {state.cancelText}
              </button>
              <button
                className={`btn ${typeStyle.confirmClass}`}
                onClick={handleConfirm}
                ref={confirmBtnRef}
                type="button"
              >
                {state.confirmText}
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .nova-confirm-overlay {
          animation: nova-confirm-fade 0.15s ease-out;
        }
        .nova-confirm-animated {
          animation: nova-confirm-slide 0.2s ease-out;
        }
        @keyframes nova-confirm-fade {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes nova-confirm-slide {
          from {
            opacity: 0;
            transform: translateY(-16px) scale(0.97);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
      `}</style>
    </ConfirmContext.Provider>
  );
}

/**
 * Hook to show a confirmation dialog.
 * Returns confirm(title, message, options?) which resolves to a boolean.
 */
export function useConfirm() {
  const confirm = useContext(ConfirmContext);
  if (!confirm) {
    throw new Error('useConfirm must be used within a <ConfirmProvider>');
  }
  return confirm;
}
