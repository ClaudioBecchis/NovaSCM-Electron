import React from 'react';

const STATUS_CONFIG = {
  online:    { color: 'var(--green)',  label: 'Online' },
  offline:   { color: 'var(--text-dim)', label: 'Offline' },
  warning:   { color: 'var(--amber)',  label: 'Warning' },
  deploying: { color: 'var(--accent)', label: 'Deploying' },
  error:     { color: 'var(--red)',    label: 'Error' },
  idle:      { color: 'var(--text-muted)', label: 'Idle' },
};

/**
 * Colored status indicator dot with optional label and pulse animation.
 */
export default function StatusDot({
  status = 'idle',
  label,
  pulse = false,
}) {
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.idle;
  const shouldPulse = pulse || status === 'deploying';

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
      }}
      role="status"
      aria-label={label || config.label}
    >
      <span
        className={shouldPulse ? 'nova-status-pulse' : undefined}
        style={{
          width: 8,
          height: 8,
          borderRadius: '50%',
          backgroundColor: config.color,
          flexShrink: 0,
          position: 'relative',
          '--pulse-color': config.color,
        }}
      />
      {label && (
        <span
          style={{
            fontSize: 12,
            color: 'var(--text-muted)',
            whiteSpace: 'nowrap',
          }}
        >
          {label}
        </span>
      )}

      <style>{`
        .nova-status-pulse {
          animation: nova-status-pulse-anim 1.5s ease-in-out infinite;
        }
        @keyframes nova-status-pulse-anim {
          0%, 100% {
            box-shadow: 0 0 0 0 color-mix(in srgb, var(--pulse-color, var(--accent)) 50%, transparent);
          }
          50% {
            box-shadow: 0 0 0 5px color-mix(in srgb, var(--pulse-color, var(--accent)) 0%, transparent);
          }
        }
      `}</style>
    </span>
  );
}
