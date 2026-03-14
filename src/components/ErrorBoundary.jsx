import React, { Component } from 'react';

/**
 * React Error Boundary — catches unhandled errors in child components
 * and shows a friendly recovery screen. Uses inline styles so it works
 * even if CSS fails to load.
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    this.setState({ errorInfo });
    // Log to console for devtools / telemetry
    console.error('[ErrorBoundary]', error, errorInfo);
  }

  handleReload = () => {
    window.location.reload();
  };

  handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    const { error, errorInfo } = this.state;
    const errorMessage = error?.message || 'Errore sconosciuto';
    const stackTrace =
      error?.stack || errorInfo?.componentStack || 'Nessuno stack trace disponibile';

    return (
      <div
        style={{
          position: 'fixed',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'var(--bg-primary, #0a0f1a)',
          color: 'var(--text, #e2e8f0)',
          fontFamily:
            "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
          zIndex: 9999,
        }}
      >
        <div
          style={{
            background: 'var(--bg-surface, #0d1525)',
            border: '1px solid var(--border, #1e2d4a)',
            borderRadius: 12,
            padding: '40px 48px',
            maxWidth: 560,
            width: '90%',
            textAlign: 'center',
            boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
          }}
        >
          {/* Warning icon */}
          <div
            style={{
              width: 64,
              height: 64,
              margin: '0 auto 20px',
              borderRadius: '50%',
              background: 'var(--red-bg, rgba(239,68,68,0.12))',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <svg
              width="32"
              height="32"
              viewBox="0 0 24 24"
              fill="none"
              stroke="var(--red, #ef4444)"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
          </div>

          {/* Title */}
          <h1
            style={{
              fontSize: 22,
              fontWeight: 600,
              margin: '0 0 8px',
              color: 'var(--text, #e2e8f0)',
            }}
          >
            Si e' verificato un errore
          </h1>

          <p
            style={{
              fontSize: 14,
              color: 'var(--text-muted, #64748b)',
              margin: '0 0 24px',
              lineHeight: 1.5,
            }}
          >
            L'applicazione ha riscontrato un problema imprevisto.
            Puoi provare a ricaricare o tornare alla dashboard.
          </p>

          {/* Collapsible error details */}
          <details
            style={{
              textAlign: 'left',
              marginBottom: 28,
              background: 'var(--bg-primary, #0a0f1a)',
              border: '1px solid var(--border, #1e2d4a)',
              borderRadius: 8,
              overflow: 'hidden',
            }}
          >
            <summary
              style={{
                padding: '10px 14px',
                cursor: 'pointer',
                fontSize: 13,
                color: 'var(--text-secondary, #94a3b8)',
                userSelect: 'none',
              }}
            >
              Dettagli errore
            </summary>
            <div
              style={{
                padding: '12px 14px',
                borderTop: '1px solid var(--border, #1e2d4a)',
              }}
            >
              <p
                style={{
                  margin: '0 0 10px',
                  fontSize: 13,
                  fontWeight: 600,
                  color: 'var(--red, #ef4444)',
                  fontFamily: 'var(--font-mono, Consolas, monospace)',
                  wordBreak: 'break-word',
                }}
              >
                {errorMessage}
              </p>
              <pre
                style={{
                  margin: 0,
                  padding: 12,
                  fontSize: 11,
                  lineHeight: 1.6,
                  color: 'var(--text-muted, #64748b)',
                  fontFamily: 'var(--font-mono, Consolas, monospace)',
                  background: 'var(--bg-surface, #0d1525)',
                  borderRadius: 6,
                  overflow: 'auto',
                  maxHeight: 200,
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                }}
              >
                {stackTrace}
              </pre>
            </div>
          </details>

          {/* Action buttons */}
          <div
            style={{
              display: 'flex',
              gap: 12,
              justifyContent: 'center',
            }}
          >
            <button
              onClick={this.handleReset}
              style={{
                padding: '10px 20px',
                fontSize: 13,
                fontWeight: 500,
                border: '1px solid var(--border, #1e2d4a)',
                borderRadius: 8,
                background: 'var(--bg-surface2, #111b2e)',
                color: 'var(--text, #e2e8f0)',
                cursor: 'pointer',
                transition: 'background 0.15s, border-color 0.15s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'var(--bg-hover, #1a2845)';
                e.currentTarget.style.borderColor = 'var(--border-light, #2a3d5c)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'var(--bg-surface2, #111b2e)';
                e.currentTarget.style.borderColor = 'var(--border, #1e2d4a)';
              }}
            >
              Torna alla Dashboard
            </button>
            <button
              onClick={this.handleReload}
              style={{
                padding: '10px 20px',
                fontSize: 13,
                fontWeight: 500,
                border: '1px solid var(--accent, #3b82f6)',
                borderRadius: 8,
                background: 'var(--accent, #3b82f6)',
                color: '#fff',
                cursor: 'pointer',
                transition: 'background 0.15s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'var(--accent-hover, #2563eb)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'var(--accent, #3b82f6)';
              }}
            >
              Ricarica Applicazione
            </button>
          </div>
        </div>
      </div>
    );
  }
}
