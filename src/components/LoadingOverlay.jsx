import React from 'react';

/**
 * Semi-transparent loading overlay with spinner and optional message.
 * Renders nothing when not visible.
 */
export default function LoadingOverlay({
  visible = false,
  message,
  spinner = true,
}) {
  if (!visible) return null;

  return (
    <div
      className="nova-loading-overlay"
      role="status"
      aria-live="polite"
      aria-label={message || 'Caricamento in corso'}
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 14,
        background: 'rgba(10, 15, 26, 0.75)',
        backdropFilter: 'blur(2px)',
        zIndex: 500,
        animation: 'nova-loading-fade-in 0.2s ease-out',
      }}
    >
      {spinner && (
        <div
          className="nova-spinner"
          style={{
            width: 36,
            height: 36,
            border: '3px solid var(--border)',
            borderTopColor: 'var(--accent)',
            borderRadius: '50%',
            animation: 'nova-spin 0.8s linear infinite',
          }}
        />
      )}
      {message && (
        <span
          style={{
            fontSize: 13,
            color: 'var(--text-muted)',
            fontFamily: 'var(--font)',
            textAlign: 'center',
            maxWidth: 280,
          }}
        >
          {message}
        </span>
      )}

      <style>{`
        @keyframes nova-spin {
          to { transform: rotate(360deg); }
        }
        @keyframes nova-loading-fade-in {
          from { opacity: 0; }
          to { opacity: 1; }
        }
      `}</style>
    </div>
  );
}
