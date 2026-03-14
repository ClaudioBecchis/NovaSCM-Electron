import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';

/**
 * Ctrl+K global search overlay — command palette style.
 * Searches across tabs, quick actions, and tools.
 *
 * Props:
 *   visible   — boolean, controls open/close
 *   onClose   — callback to close the overlay
 *   onAction  — callback(itemId) when an item is executed
 */

const SEARCH_ITEMS = [
  // ── Navigazione ──
  { id: 'tab-dashboard',       label: 'Dashboard',        icon: '\u2302', category: 'Navigazione' },
  { id: 'tab-rete',            label: 'Rete',             icon: '\uD83C\uDF10', category: 'Navigazione' },
  { id: 'tab-certificati',     label: 'Certificati',      icon: '\uD83D\uDD10', category: 'Navigazione' },
  { id: 'tab-software',        label: 'Software',         icon: '\uD83D\uDCE6', category: 'Navigazione' },
  { id: 'tab-pc-gestiti',      label: 'PC Gestiti',       icon: '\uD83D\uDCBB', category: 'Navigazione' },
  { id: 'tab-change-requests', label: 'Change Requests',  icon: '\uD83D\uDCCB', category: 'Navigazione' },
  { id: 'tab-workflows',       label: 'Workflows',        icon: '\u2699\uFE0F', category: 'Navigazione' },
  { id: 'tab-assegnazioni',    label: 'Assegnazioni',     icon: '\uD83D\uDC64', category: 'Navigazione' },
  { id: 'tab-deploy-floor',    label: 'Deploy Floor',     icon: '\uD83C\uDFED', category: 'Navigazione' },
  { id: 'tab-pxe-boot',        label: 'PXE Boot',         icon: '\u26A1', category: 'Navigazione' },
  { id: 'tab-impostazioni',    label: 'Impostazioni',     icon: '\u2699', category: 'Navigazione' },
  { id: 'tab-about',           label: 'About',            icon: '\u2139\uFE0F', category: 'Navigazione' },

  // ── Azioni ──
  { id: 'action-nuovo-cr',        label: 'Nuovo CR',          icon: '\u2795', category: 'Azioni' },
  { id: 'action-scan-rete',       label: 'Scan Rete',         icon: '\uD83D\uDD0D', category: 'Azioni' },
  { id: 'action-test-connessione', label: 'Test Connessione', icon: '\uD83D\uDCE1', category: 'Azioni' },
  { id: 'action-esporta-log',     label: 'Esporta Log',       icon: '\uD83D\uDCE4', category: 'Azioni' },
  { id: 'action-toggle-log',      label: 'Toggle Log',        icon: '\uD83D\uDCC4', category: 'Azioni' },
  { id: 'action-toggle-sidebar',  label: 'Toggle Sidebar',    icon: '\u2630', category: 'Azioni' },

  // ── Strumenti ──
];

const CATEGORY_ORDER = ['Navigazione', 'Azioni', 'Strumenti'];

export default function SearchOverlay({ visible, onClose, onAction }) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef(null);
  const listRef = useRef(null);

  // Filter items based on query (case-insensitive includes)
  const filtered = useMemo(() => {
    if (!query.trim()) return SEARCH_ITEMS;
    const q = query.toLowerCase();
    return SEARCH_ITEMS.filter((item) => item.label.toLowerCase().includes(q));
  }, [query]);

  // Group by category, preserving order
  const grouped = useMemo(() => {
    const map = {};
    for (const item of filtered) {
      if (!map[item.category]) map[item.category] = [];
      map[item.category].push(item);
    }
    return CATEGORY_ORDER.filter((c) => map[c]).map((c) => ({
      category: c,
      items: map[c],
    }));
  }, [filtered]);

  // Flat list for keyboard navigation
  const flatItems = useMemo(() => grouped.flatMap((g) => g.items), [grouped]);

  // Reset state when opening/closing
  useEffect(() => {
    if (visible) {
      setQuery('');
      setSelectedIndex(0);
      // Auto-focus after animation frame
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [visible]);

  // Clamp selection index when results change
  useEffect(() => {
    setSelectedIndex((prev) => Math.min(prev, Math.max(0, flatItems.length - 1)));
  }, [flatItems.length]);

  // Scroll selected item into view
  useEffect(() => {
    if (!listRef.current) return;
    const el = listRef.current.querySelector('[data-selected="true"]');
    if (el) el.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  const execute = useCallback(
    (item) => {
      if (!item) return;
      onAction?.(item.id);
      onClose?.();
    },
    [onAction, onClose],
  );

  const handleKeyDown = useCallback(
    (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose?.();
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((i) => (i + 1 < flatItems.length ? i + 1 : 0));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((i) => (i - 1 >= 0 ? i - 1 : flatItems.length - 1));
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        execute(flatItems[selectedIndex]);
      }
    },
    [flatItems, selectedIndex, execute, onClose],
  );

  // Highlight matched substring
  const highlightMatch = (label) => {
    if (!query.trim()) return label;
    const q = query.toLowerCase();
    const idx = label.toLowerCase().indexOf(q);
    if (idx === -1) return label;
    return (
      <>
        {label.slice(0, idx)}
        <span style={{ color: 'var(--accent-light, #60a5fa)', fontWeight: 600 }}>
          {label.slice(idx, idx + query.length)}
        </span>
        {label.slice(idx + query.length)}
      </>
    );
  };

  if (!visible) return null;

  let flatIdx = 0;

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'var(--bg-overlay, rgba(0,0,0,0.65))',
          backdropFilter: 'blur(4px)',
          WebkitBackdropFilter: 'blur(4px)',
          zIndex: 9000,
          animation: 'nova-search-fade-in 0.15s ease-out',
        }}
      />

      {/* Panel */}
      <div
        style={{
          position: 'fixed',
          top: '15%',
          left: '50%',
          transform: 'translateX(-50%)',
          width: '90%',
          maxWidth: 520,
          zIndex: 9001,
          animation: 'nova-search-slide-down 0.18s ease-out',
        }}
      >
        <div
          style={{
            background: 'var(--bg-surface, #0d1525)',
            border: '1px solid var(--border-light, #2a3d5c)',
            borderRadius: 12,
            boxShadow: '0 16px 48px rgba(0,0,0,0.5)',
            overflow: 'hidden',
          }}
        >
          {/* Search input */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '14px 16px',
              borderBottom: '1px solid var(--border, #1e2d4a)',
            }}
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="var(--text-muted, #64748b)"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setSelectedIndex(0);
              }}
              onKeyDown={handleKeyDown}
              placeholder="Cerca comandi, pagine, azioni..."
              style={{
                flex: 1,
                background: 'transparent',
                border: 'none',
                outline: 'none',
                fontSize: 15,
                color: 'var(--text, #e2e8f0)',
                fontFamily: 'inherit',
              }}
            />
            <kbd
              style={{
                padding: '2px 8px',
                fontSize: 11,
                color: 'var(--text-muted, #64748b)',
                background: 'var(--bg-primary, #0a0f1a)',
                border: '1px solid var(--border, #1e2d4a)',
                borderRadius: 4,
                fontFamily: 'var(--font-mono, Consolas, monospace)',
              }}
            >
              ESC
            </kbd>
          </div>

          {/* Results */}
          <div
            ref={listRef}
            style={{
              maxHeight: 240,
              overflowY: 'auto',
              padding: '6px 0',
            }}
          >
            {flatItems.length === 0 && (
              <div
                style={{
                  padding: '24px 16px',
                  textAlign: 'center',
                  fontSize: 13,
                  color: 'var(--text-muted, #64748b)',
                }}
              >
                Nessun risultato per "{query}"
              </div>
            )}

            {grouped.map((group) => (
              <div key={group.category}>
                {/* Category header */}
                <div
                  style={{
                    padding: '8px 16px 4px',
                    fontSize: 11,
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    color: 'var(--text-muted, #64748b)',
                  }}
                >
                  {group.category}
                </div>

                {group.items.map((item) => {
                  const isSelected = flatIdx === selectedIndex;
                  const currentIdx = flatIdx;
                  flatIdx++;

                  return (
                    <div
                      key={item.id}
                      data-selected={isSelected}
                      onClick={() => execute(item)}
                      onMouseEnter={() => setSelectedIndex(currentIdx)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        padding: '8px 16px',
                        cursor: 'pointer',
                        fontSize: 13,
                        color: isSelected
                          ? 'var(--text, #e2e8f0)'
                          : 'var(--text-secondary, #94a3b8)',
                        background: isSelected
                          ? 'var(--bg-hover, #1a2845)'
                          : 'transparent',
                        borderRadius: 0,
                        transition: 'background 0.08s, color 0.08s',
                      }}
                    >
                      <span
                        style={{
                          width: 24,
                          textAlign: 'center',
                          fontSize: 15,
                          flexShrink: 0,
                        }}
                      >
                        {item.icon}
                      </span>
                      <span style={{ flex: 1 }}>{highlightMatch(item.label)}</span>
                      {isSelected && (
                        <kbd
                          style={{
                            padding: '1px 6px',
                            fontSize: 10,
                            color: 'var(--text-dim, #475569)',
                            background: 'var(--bg-primary, #0a0f1a)',
                            border: '1px solid var(--border, #1e2d4a)',
                            borderRadius: 3,
                            fontFamily: 'var(--font-mono, Consolas, monospace)',
                          }}
                        >
                          INVIO
                        </kbd>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>

          {/* Footer hint */}
          <div
            style={{
              padding: '8px 16px',
              borderTop: '1px solid var(--border, #1e2d4a)',
              display: 'flex',
              gap: 16,
              fontSize: 11,
              color: 'var(--text-dim, #475569)',
            }}
          >
            <span>
              <kbd style={kbdMini}>&uarr;&darr;</kbd> naviga
            </span>
            <span>
              <kbd style={kbdMini}>Invio</kbd> esegui
            </span>
            <span>
              <kbd style={kbdMini}>Esc</kbd> chiudi
            </span>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes nova-search-fade-in {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        @keyframes nova-search-slide-down {
          from { opacity: 0; transform: translateX(-50%) translateY(-12px); }
          to   { opacity: 1; transform: translateX(-50%) translateY(0); }
        }
      `}</style>
    </>
  );
}

const kbdMini = {
  padding: '1px 5px',
  fontSize: 10,
  background: 'var(--bg-surface2, #111b2e)',
  border: '1px solid var(--border, #1e2d4a)',
  borderRadius: 3,
  fontFamily: 'var(--font-mono, Consolas, monospace)',
};
