import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';

const ToastContext = createContext(null);

const MAX_VISIBLE = 5;
const DEFAULT_DURATION = 4000;

const ICONS = {
  info: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5" />
      <text x="8" y="12" textAnchor="middle" fontSize="11" fontWeight="700" fill="currentColor">i</text>
    </svg>
  ),
  success: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5" />
      <path d="M5 8l2 2 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  warning: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M8 1.5L14.5 13.5H1.5L8 1.5z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <text x="8" y="12" textAnchor="middle" fontSize="9" fontWeight="700" fill="currentColor">!</text>
    </svg>
  ),
  error: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5" />
      <path d="M5.5 5.5l5 5M10.5 5.5l-5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  ),
};

const TYPE_COLORS = {
  info: { bg: 'rgba(59,130,246,0.15)', border: 'var(--accent)', color: 'var(--accent)' },
  success: { bg: 'var(--green-dim)', border: 'var(--green)', color: 'var(--green)' },
  warning: { bg: 'var(--amber-dim)', border: 'var(--amber)', color: 'var(--amber)' },
  error: { bg: 'var(--red-dim)', border: 'var(--red)', color: 'var(--red)' },
};

let toastIdCounter = 0;

/**
 * Toast notification system.
 * Wrap your app in <ToastContainer> and use useToast() to show notifications.
 */
export function ToastContainer({ children }) {
  const [toasts, setToasts] = useState([]);
  const timersRef = useRef(new Map());

  const removeToast = useCallback((id) => {
    // Mark as exiting for animation
    setToasts(prev => prev.map(t => (t.id === id ? { ...t, exiting: true } : t)));
    // Remove after animation
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
      if (timersRef.current.has(id)) {
        clearTimeout(timersRef.current.get(id));
        timersRef.current.delete(id);
      }
    }, 250);
  }, []);

  const addToast = useCallback(
    (message, type = 'info', duration = DEFAULT_DURATION) => {
      const id = ++toastIdCounter;
      const toast = { id, message, type, exiting: false };

      setToasts(prev => {
        const next = [toast, ...prev];
        // Remove oldest if exceeding max
        if (next.length > MAX_VISIBLE) {
          const overflow = next.slice(MAX_VISIBLE);
          overflow.forEach(t => {
            if (timersRef.current.has(t.id)) {
              clearTimeout(timersRef.current.get(t.id));
              timersRef.current.delete(t.id);
            }
          });
          return next.slice(0, MAX_VISIBLE);
        }
        return next;
      });

      if (duration > 0) {
        const timer = setTimeout(() => removeToast(id), duration);
        timersRef.current.set(id, timer);
      }

      return id;
    },
    [removeToast]
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      timersRef.current.forEach(timer => clearTimeout(timer));
      timersRef.current.clear();
    };
  }, []);

  return (
    <ToastContext.Provider value={addToast}>
      {children}
      <div
        aria-live="polite"
        aria-label="Notifiche"
        style={{
          position: 'fixed',
          top: 12,
          right: 12,
          zIndex: 10000,
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          pointerEvents: 'none',
          maxWidth: 380,
        }}
      >
        {toasts.map((t) => {
          const colors = TYPE_COLORS[t.type] || TYPE_COLORS.info;
          return (
            <div
              key={t.id}
              role="alert"
              className={t.exiting ? 'nova-toast-exit' : 'nova-toast-enter'}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 10,
                padding: '10px 14px',
                background: colors.bg,
                borderLeft: `3px solid ${colors.border}`,
                borderRadius: 'var(--radius)',
                color: 'var(--text)',
                fontSize: 12,
                fontFamily: 'var(--font)',
                boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
                pointerEvents: 'auto',
                minWidth: 260,
              }}
            >
              <span style={{ color: colors.color, flexShrink: 0, marginTop: 1 }}>
                {ICONS[t.type] || ICONS.info}
              </span>
              <span style={{ flex: 1, lineHeight: 1.4 }}>{t.message}</span>
              <button
                onClick={() => removeToast(t.id)}
                aria-label="Chiudi notifica"
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                  padding: '0 2px',
                  fontSize: 16,
                  lineHeight: 1,
                  flexShrink: 0,
                  fontFamily: 'var(--font)',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--text)')}
                onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-muted)')}
              >
                {'\u00D7'}
              </button>
            </div>
          );
        })}
      </div>

      <style>{`
        .nova-toast-enter {
          animation: nova-toast-slide-in 0.25s ease-out;
        }
        .nova-toast-exit {
          animation: nova-toast-fade-out 0.25s ease-in forwards;
        }
        @keyframes nova-toast-slide-in {
          from {
            opacity: 0;
            transform: translateX(40px);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }
        @keyframes nova-toast-fade-out {
          from {
            opacity: 1;
            transform: translateX(0);
          }
          to {
            opacity: 0;
            transform: translateX(40px);
          }
        }
      `}</style>
    </ToastContext.Provider>
  );
}

/**
 * Hook to show toast notifications.
 * Returns { toast } where toast(message, type?, duration?) shows a notification.
 */
export function useToast() {
  const addToast = useContext(ToastContext);
  if (!addToast) {
    throw new Error('useToast must be used within a <ToastContainer>');
  }
  return { toast: addToast };
}
