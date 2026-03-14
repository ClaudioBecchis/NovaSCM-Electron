import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';

/**
 * Enterprise DataGrid component with sorting, search, selection,
 * context menu, keyboard navigation, and loading/empty states.
 */
export default function DataGrid({
  columns = [],
  data = [],
  onRowClick,
  onRowDoubleClick,
  onSelectionChange,
  searchable = true,
  selectable = false,
  multiSelect = false,
  actions,
  loading = false,
  emptyMessage = 'Nessun elemento',
  emptyIcon = null,
  rowKey = 'id',
  maxHeight,
  contextMenu,
}) {
  const [search, setSearch] = useState('');
  const [sortCol, setSortCol] = useState(null);
  const [sortDir, setSortDir] = useState('asc');
  const [selectedKeys, setSelectedKeys] = useState(new Set());
  const [focusIndex, setFocusIndex] = useState(-1);
  const [ctxMenu, setCtxMenu] = useState(null);

  const tableRef = useRef(null);
  const tbodyRef = useRef(null);

  // Close context menu on outside click or scroll
  useEffect(() => {
    if (!ctxMenu) return;
    const close = () => setCtxMenu(null);
    document.addEventListener('click', close);
    document.addEventListener('scroll', close, true);
    return () => {
      document.removeEventListener('click', close);
      document.removeEventListener('scroll', close, true);
    };
  }, [ctxMenu]);

  // Notify parent of selection changes
  useEffect(() => {
    if (!onSelectionChange) return;
    const rows = (data || []).filter(r => selectedKeys.has(getRowKey(r)));
    onSelectionChange(rows);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedKeys]);

  const getRowKey = useCallback(
    (row, index) => {
      if (row == null) return index;
      return row[rowKey] ?? row.ip ?? row.mac ?? index;
    },
    [rowKey]
  );

  // Filter + sort
  const filtered = useMemo(() => {
    let rows = data || [];
    if (search) {
      const q = search.toLowerCase();
      rows = rows.filter(r =>
        columns.some(c => {
          const val = r[c.key];
          return val != null && String(val).toLowerCase().includes(q);
        })
      );
    }
    if (sortCol) {
      rows = [...rows].sort((a, b) => {
        const va = a[sortCol] ?? '';
        const vb = b[sortCol] ?? '';
        let cmp;
        if (typeof va === 'number' && typeof vb === 'number') {
          cmp = va - vb;
        } else {
          cmp = String(va).localeCompare(String(vb), undefined, { numeric: true, sensitivity: 'base' });
        }
        return sortDir === 'asc' ? cmp : -cmp;
      });
    }
    return rows;
  }, [data, search, sortCol, sortDir, columns]);

  const handleSort = useCallback(
    (col) => {
      if (col.sortable === false) return;
      if (sortCol === col.key) {
        if (sortDir === 'asc') setSortDir('desc');
        else if (sortDir === 'desc') {
          setSortCol(null);
          setSortDir('asc');
        }
      } else {
        setSortCol(col.key);
        setSortDir('asc');
      }
    },
    [sortCol, sortDir]
  );

  const handleRowClick = useCallback(
    (row, index, e) => {
      setFocusIndex(index);

      if (selectable) {
        const key = getRowKey(row, index);
        setSelectedKeys(prev => {
          const next = new Set(multiSelect && (e.ctrlKey || e.metaKey) ? prev : []);
          if (next.has(key)) {
            next.delete(key);
          } else {
            next.add(key);
          }
          return next;
        });
      }

      onRowClick?.(row);
    },
    [selectable, multiSelect, getRowKey, onRowClick]
  );

  const handleCheckboxChange = useCallback(
    (row, index, checked) => {
      const key = getRowKey(row, index);
      setSelectedKeys(prev => {
        const next = new Set(prev);
        if (checked) next.add(key);
        else next.delete(key);
        return next;
      });
    },
    [getRowKey]
  );

  const handleSelectAll = useCallback(
    (checked) => {
      if (checked) {
        const allKeys = new Set(filtered.map((r, i) => getRowKey(r, i)));
        setSelectedKeys(allKeys);
      } else {
        setSelectedKeys(new Set());
      }
    },
    [filtered, getRowKey]
  );

  const handleContextMenu = useCallback(
    (e, row) => {
      if (!contextMenu || contextMenu.length === 0) return;
      e.preventDefault();
      setCtxMenu({ x: e.clientX, y: e.clientY, row });
    },
    [contextMenu]
  );

  // Keyboard navigation
  const handleKeyDown = useCallback(
    (e) => {
      if (filtered.length === 0) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setFocusIndex(prev => {
          const next = Math.min(prev + 1, filtered.length - 1);
          const row = filtered[next];
          if (selectable) {
            const key = getRowKey(row, next);
            setSelectedKeys(new Set([key]));
          }
          onRowClick?.(row);
          return next;
        });
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setFocusIndex(prev => {
          const next = Math.max(prev - 1, 0);
          const row = filtered[next];
          if (selectable) {
            const key = getRowKey(row, next);
            setSelectedKeys(new Set([key]));
          }
          onRowClick?.(row);
          return next;
        });
      } else if (e.key === 'Enter' && focusIndex >= 0 && focusIndex < filtered.length) {
        onRowDoubleClick?.(filtered[focusIndex]);
      } else if (e.key === ' ' && selectable && focusIndex >= 0) {
        e.preventDefault();
        const row = filtered[focusIndex];
        const key = getRowKey(row, focusIndex);
        setSelectedKeys(prev => {
          const next = new Set(multiSelect ? prev : []);
          if (next.has(key)) next.delete(key);
          else next.add(key);
          return next;
        });
      }
    },
    [filtered, focusIndex, selectable, multiSelect, getRowKey, onRowClick, onRowDoubleClick]
  );

  // Scroll focused row into view
  useEffect(() => {
    if (focusIndex < 0 || !tbodyRef.current) return;
    const row = tbodyRef.current.children[focusIndex];
    if (row) row.scrollIntoView({ block: 'nearest' });
  }, [focusIndex]);

  const allSelected = filtered.length > 0 && filtered.every((r, i) => selectedKeys.has(getRowKey(r, i)));
  const someSelected = filtered.some((r, i) => selectedKeys.has(getRowKey(r, i)));

  // --- Render ---

  const renderSkeleton = () => (
    <tbody>
      {Array.from({ length: 8 }).map((_, ri) => (
        <tr key={ri}>
          {selectable && <td style={{ padding: '7px 12px' }}><div className="skeleton-bar" /></td>}
          {columns.map((c, ci) => (
            <td key={ci} style={{ padding: '7px 12px' }}>
              <div
                className="skeleton-bar"
                style={{ width: `${55 + ((ri * 17 + ci * 31) % 40)}%` }}
              />
            </td>
          ))}
        </tr>
      ))}
    </tbody>
  );

  const renderEmpty = () => (
    <tbody>
      <tr>
        <td
          colSpan={(selectable ? 1 : 0) + columns.length}
          style={{ textAlign: 'center', padding: 48 }}
        >
          <div className="empty-state" style={{ padding: '32px 20px' }}>
            {emptyIcon && <div className="icon">{emptyIcon}</div>}
            <div className="title">{emptyMessage}</div>
          </div>
        </td>
      </tr>
    </tbody>
  );

  const renderContextMenu = () => {
    if (!ctxMenu || !contextMenu) return null;
    return (
      <div
        className="ctx-menu"
        role="menu"
        style={{
          position: 'fixed',
          top: ctxMenu.y,
          left: ctxMenu.x,
          zIndex: 9999,
          background: 'var(--bg-surface2)',
          border: '1px solid var(--border-light)',
          borderRadius: 'var(--radius)',
          padding: '4px 0',
          minWidth: 160,
          boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {contextMenu.map((item, i) => {
          if (item.divider) {
            return (
              <div
                key={`div-${i}`}
                style={{
                  height: 1,
                  background: 'var(--border)',
                  margin: '4px 0',
                }}
              />
            );
          }
          return (
            <button
              key={i}
              role="menuitem"
              className="ctx-menu-item"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                width: '100%',
                padding: '6px 14px',
                background: 'none',
                border: 'none',
                color: 'var(--text)',
                fontSize: 12,
                cursor: 'pointer',
                textAlign: 'left',
                fontFamily: 'var(--font)',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-hover)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
              onClick={() => {
                item.onClick?.(ctxMenu.row);
                setCtxMenu(null);
              }}
            >
              {item.icon && <span style={{ width: 16, textAlign: 'center' }}>{item.icon}</span>}
              {item.label}
            </button>
          );
        })}
      </div>
    );
  };

  const sortIndicator = (col) => {
    if (col.sortable === false) return null;
    if (sortCol !== col.key) return <span style={{ opacity: 0.25, marginLeft: 4 }}>{'\u25B2'}</span>;
    return <span style={{ marginLeft: 4 }}>{sortDir === 'asc' ? '\u25B2' : '\u25BC'}</span>;
  };

  return (
    <div
      className="datagrid-wrap"
      ref={tableRef}
      tabIndex={0}
      onKeyDown={handleKeyDown}
      role="grid"
      aria-label="Data grid"
      style={{ outline: 'none' }}
    >
      {(searchable || actions) && (
        <div className="datagrid-toolbar">
          {searchable && (
            <input
              type="text"
              placeholder="Cerca..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Cerca nella tabella"
            />
          )}
          <span style={{ color: 'var(--text-dim)', fontSize: 11, whiteSpace: 'nowrap' }}>
            {filtered.length} element{filtered.length !== 1 ? 'i' : 'o'}
            {selectedKeys.size > 0 && ` (${selectedKeys.size} selezionat${selectedKeys.size !== 1 ? 'i' : 'o'})`}
          </span>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>{actions}</div>
        </div>
      )}

      <div
        style={{
          overflowX: 'auto',
          overflowY: 'auto',
          maxHeight: maxHeight || 'calc(100vh - 340px)',
        }}
      >
        <table className="datagrid" role="grid">
          <thead style={{ position: 'sticky', top: 0, zIndex: 2 }}>
            <tr>
              {selectable && (
                <th style={{ width: 40, textAlign: 'center', cursor: 'default' }}>
                  {multiSelect && (
                    <input
                      type="checkbox"
                      checked={allSelected}
                      ref={(el) => {
                        if (el) el.indeterminate = someSelected && !allSelected;
                      }}
                      onChange={(e) => handleSelectAll(e.target.checked)}
                      aria-label="Seleziona tutti"
                      style={{ accentColor: 'var(--accent)', width: 14, height: 14, cursor: 'pointer' }}
                    />
                  )}
                </th>
              )}
              {columns.map((c) => (
                <th
                  key={c.key}
                  onClick={() => handleSort(c)}
                  style={{
                    width: c.width,
                    textAlign: c.align || 'left',
                    cursor: c.sortable !== false ? 'pointer' : 'default',
                    userSelect: 'none',
                  }}
                  role="columnheader"
                  aria-sort={
                    sortCol === c.key
                      ? sortDir === 'asc'
                        ? 'ascending'
                        : 'descending'
                      : 'none'
                  }
                >
                  {c.label}
                  {sortIndicator(c)}
                </th>
              ))}
            </tr>
          </thead>

          {loading ? (
            renderSkeleton()
          ) : filtered.length === 0 ? (
            renderEmpty()
          ) : (
            <tbody ref={tbodyRef}>
              {filtered.map((row, i) => {
                const key = getRowKey(row, i);
                const isSelected = selectedKeys.has(key);
                const isFocused = focusIndex === i;

                return (
                  <tr
                    key={key}
                    className={[
                      isSelected ? 'selected' : '',
                      isFocused ? 'focused' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    style={
                      isFocused && !isSelected
                        ? { outline: '1px solid var(--accent)', outlineOffset: -1 }
                        : undefined
                    }
                    onClick={(e) => handleRowClick(row, i, e)}
                    onDoubleClick={() => onRowDoubleClick?.(row)}
                    onContextMenu={(e) => handleContextMenu(e, row)}
                    role="row"
                    aria-selected={isSelected}
                    tabIndex={-1}
                  >
                    {selectable && (
                      <td style={{ width: 40, textAlign: 'center' }}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={(e) => handleCheckboxChange(row, i, e.target.checked)}
                          onClick={(e) => e.stopPropagation()}
                          aria-label={`Seleziona riga ${i + 1}`}
                          style={{ accentColor: 'var(--accent)', width: 14, height: 14, cursor: 'pointer' }}
                        />
                      </td>
                    )}
                    {columns.map((c) => (
                      <td key={c.key} style={{ textAlign: c.align || 'left' }}>
                        {c.render ? c.render(row[c.key], row) : (row[c.key] ?? '')}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          )}
        </table>
      </div>

      {renderContextMenu()}

      <style>{`
        .skeleton-bar {
          height: 14px;
          background: var(--bg-surface3);
          border-radius: 3px;
          animation: skeleton-pulse 1.2s ease-in-out infinite;
        }
        @keyframes skeleton-pulse {
          0%, 100% { opacity: 0.4; }
          50% { opacity: 0.8; }
        }
      `}</style>
    </div>
  );
}
