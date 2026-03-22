// frontend/src/components/EmptyState.jsx
// Usage: <EmptyState icon="calendar" message="予定がありません" action={{ label: "予定を追加", onClick: fn }} />
// action prop is optional.

const ICONS = {
  calendar: (
    <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="3" y="4" width="18" height="18" rx="2"/>
      <line x1="16" y1="2" x2="16" y2="6"/>
      <line x1="8" y1="2" x2="8" y2="6"/>
      <line x1="3" y1="10" x2="21" y2="10"/>
      <line x1="8" y1="14" x2="8" y2="14" strokeLinecap="round" strokeWidth="2"/>
      <line x1="12" y1="14" x2="12" y2="14" strokeLinecap="round" strokeWidth="2"/>
      <line x1="16" y1="14" x2="16" y2="14" strokeLinecap="round" strokeWidth="2"/>
    </svg>
  ),
  building: (
    <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/>
      <polyline points="9 22 9 12 15 12 15 22"/>
    </svg>
  ),
  document: (
    <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
      <polyline points="14 2 14 8 20 8"/>
      <line x1="8" y1="13" x2="16" y2="13"/>
      <line x1="8" y1="17" x2="12" y2="17"/>
    </svg>
  ),
  user: (
    <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/>
      <circle cx="9" cy="7" r="4"/>
      <path d="M23 21v-2a4 4 0 00-3-3.87"/>
      <path d="M16 3.13a4 4 0 010 7.75"/>
    </svg>
  ),
};

export default function EmptyState({ icon = 'document', message = '', action }) {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: 200,
      gap: '0.75rem',
      color: 'var(--color-text-muted)',
    }}>
      <div style={{ opacity: 0.35 }}>
        {ICONS[icon] || ICONS.document}
      </div>
      <p style={{ fontSize: '0.875rem', margin: 0, color: 'var(--color-text-muted)' }}>
        {message}
      </p>
      {action && (
        <button type="button" className="btn btn-primary" style={{ fontSize: '0.82rem' }} onClick={action.onClick ?? (() => {})}>
          {action.label}
        </button>
      )}
    </div>
  );
}
