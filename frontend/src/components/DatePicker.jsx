import { useState, useEffect, useRef } from 'react';

const DAYS = ['日', '月', '火', '水', '木', '金', '土'];

function parseDate(str) {
  // 'YYYY/MM/DD' → Date
  if (!str) return new Date();
  const [y, m, d] = str.split('/').map(Number);
  return new Date(y, m - 1, d);
}

function formatDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}/${m}/${d}`;
}

export default function DatePicker({ value, onChange, name }) {
  const [open, setOpen] = useState(false);
  const [viewDate, setViewDate] = useState(() => parseDate(value));
  const wrapRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  function selectDay(d) {
    const selected = new Date(viewDate.getFullYear(), viewDate.getMonth(), d);
    onChange(formatDate(selected));
    setOpen(false);
  }

  function prevMonth() {
    setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1));
  }
  function nextMonth() {
    setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1));
  }

  const y = viewDate.getFullYear();
  const m = viewDate.getMonth();
  const firstDay = new Date(y, m, 1).getDay();
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const today = new Date();
  const selectedDate = value ? parseDate(value) : null;

  return (
    <div className="date-input-wrap" ref={wrapRef} style={{ position: 'relative' }}>
      <input
        type="text"
        name={name}
        value={value || ''}
        onChange={e => onChange(e.target.value)}
        onClick={() => setOpen(true)}
        readOnly
        placeholder="YYYY/MM/DD"
        style={{ paddingRight: '2rem', cursor: 'pointer' }}
      />
      <span className="date-input-icon" onClick={() => setOpen(o => !o)}>📅</span>
      {open && (
        <div className="datepicker-popup" style={{ position: 'absolute', top: '100%', left: 0, zIndex: 200, background: 'white', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-lg)', padding: '0.75rem', minWidth: '240px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
            <button type="button" className="btn btn-secondary" style={{ padding: '0.2rem 0.5rem', fontSize: '0.8rem' }} onClick={prevMonth}>◀</button>
            <strong style={{ fontSize: '0.85rem' }}>{y}年 {m + 1}月</strong>
            <button type="button" className="btn btn-secondary" style={{ padding: '0.2rem 0.5rem', fontSize: '0.8rem' }} onClick={nextMonth}>▶</button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '2px', textAlign: 'center', fontSize: '0.72rem' }}>
            {DAYS.map(d => <div key={d} style={{ padding: '0.2rem', fontWeight: 700, color: 'var(--color-text-muted)' }}>{d}</div>)}
            {Array.from({ length: firstDay }, (_, i) => <div key={`b${i}`} />)}
            {Array.from({ length: daysInMonth }, (_, i) => {
              const day = i + 1;
              const isToday = y === today.getFullYear() && m === today.getMonth() && day === today.getDate();
              const isSelected = selectedDate && y === selectedDate.getFullYear() && m === selectedDate.getMonth() && day === selectedDate.getDate();
              return (
                <div
                  key={day}
                  onClick={() => selectDay(day)}
                  style={{
                    padding: '0.25rem',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    background: isSelected ? 'var(--color-primary)' : isToday ? '#eff6ff' : '',
                    color: isSelected ? 'white' : isToday ? 'var(--color-primary)' : '',
                    fontWeight: isToday || isSelected ? 700 : 400,
                  }}
                >
                  {day}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
