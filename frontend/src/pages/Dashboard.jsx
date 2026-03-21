// frontend/src/pages/Dashboard.jsx
import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import EmptyState from '../components/EmptyState';

// SVG icons for stat cards — no emoji
const STAT_ICONS = {
  schedule: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>,
  reservation: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>,
  folder: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/></svg>,
  users: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>,
};

function StatCard({ icon, label, value }) {
  return (
    <div className="card" style={{ flex: 1, minWidth: 150 }}>
      <div style={{ color: 'var(--color-primary)', marginBottom: '0.4rem' }}>{icon}</div>
      <div style={{ fontSize: '1.8rem', fontWeight: 700, color: 'var(--color-primary)' }}>
        {value ?? <span className="skeleton skeleton-row" style={{ width: 48, display: 'inline-block', height: 28 }} />}
      </div>
      <div style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)', marginTop: '0.2rem' }}>{label}</div>
    </div>
  );
}

// Format ISO datetime to "HH:MM"
function fmtTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}

export default function Dashboard() {
  const navigate = useNavigate();
  const [stats, setStats] = useState({ events: null, reservations: null, docs: null, users: null });
  const [agenda, setAgenda] = useState(null); // null = loading, [] = empty

  const load = useCallback(async () => {
    const now = new Date();
    const month = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
    const today = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
    const todayPrefix = today; // YYYY-MM-DD for startsWith comparison

    // --- Stats ---
    api('GET', `/schedules?month=${month}`)
      .then(data => setStats(s => ({ ...s, events: data.count ?? (data.events || []).length })))
      .catch(() => setStats(s => ({ ...s, events: '—' })));

    api('GET', '/documents/folders')
      .then(data => setStats(s => ({ ...s, docs: (data.folders || []).length })))
      .catch(() => setStats(s => ({ ...s, docs: '—' })));

    api('GET', '/users')
      .then(data => setStats(s => ({ ...s, users: (data.users || []).length })))
      .catch(() => setStats(s => ({ ...s, users: '—' })));

    // --- Agenda: today's schedules + today's reservations ---
    try {
      const [schedData, facData] = await Promise.all([
        api('GET', `/schedules?month=${month}`).catch(() => ({ events: [] })),
        api('GET', '/facilities').catch(() => ({ facilities: [] })),
      ]);

      // Filter schedules to today
      const todaySchedules = (schedData.events || [])
        .filter(e => e.startDatetime && e.startDatetime.startsWith(todayPrefix))
        .map(e => ({ ...e, _type: 'schedule' }));

      // Fan-out reservations per reservable facility (facilityType !== 'group')
      const reservableFacilities = (facData.facilities || []).filter(f => f.facilityType !== 'group');
      setStats(s => ({ ...s, reservations: null })); // will be updated below

      const resArrays = await Promise.all(
        reservableFacilities.map(f =>
          api('GET', `/facilities/${f.facilityId}/reservations?date=${today}`)
            .then(r => (r.reservations || []).map(res => ({
              ...res,
              _type: 'reservation',
              _facilityName: f.name,
            })))
            .catch(() => [])
        )
      );

      const todayReservations = resArrays.flat();
      setStats(s => ({ ...s, reservations: todayReservations.length }));

      // Merge and sort by startDatetime (null startDatetime pushed to end)
      const items = [...todaySchedules, ...todayReservations].sort((a, b) => {
        if (!a.startDatetime) return 1;
        if (!b.startDatetime) return -1;
        return a.startDatetime.localeCompare(b.startDatetime);
      });

      setAgenda(items);
    } catch {
      setAgenda([]);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const dateLabel = (() => {
    const d = new Date();
    const days = ['日','月','火','水','木','金','土'];
    return `今日 ${d.getMonth()+1}/${d.getDate()}(${days[d.getDay()]})`;
  })();

  return (
    <div>
      <h2 style={{ marginBottom: '1.25rem', fontSize: '1.1rem', fontWeight: 700 }}>ダッシュボード</h2>

      {/* Today's agenda */}
      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <div className="card-title" style={{ marginBottom: '0.75rem' }}>{dateLabel}</div>
        {agenda === null ? (
          [1,2,3].map(i => <div key={i} className="skeleton skeleton-row" style={{ height: 20, marginBottom: 8 }} />)
        ) : agenda.length === 0 ? (
          <EmptyState
            icon="calendar"
            message="今日の予定はありません"
            action={{ label: '+ 予定を追加', onClick: () => navigate('/schedule') }}
          />
        ) : (
          agenda.map((item, i) => (
            <div key={item.eventId || item.reservationId || i} style={{
              display: 'flex', alignItems: 'center', gap: '0.75rem',
              padding: '0.5rem 0',
              borderTop: i > 0 ? '1px solid var(--color-border)' : '',
            }}>
              {/* Type indicator */}
              <div style={{
                width: 28, height: 28, borderRadius: 6, flexShrink: 0,
                background: item._type === 'schedule' ? '#eff6ff' : '#f0fdf4',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: item._type === 'schedule' ? 'var(--color-primary)' : '#16a34a',
              }}>
                {item._type === 'schedule'
                  ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                  : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/></svg>
                }
              </div>
              {/* Time */}
              <span style={{ fontSize: '0.82rem', color: 'var(--color-primary)', fontWeight: 600, minWidth: 40 }}>
                {fmtTime(item.startDatetime)}
              </span>
              {/* Title */}
              <span style={{ flex: 1, fontSize: '0.875rem' }}>{item.title}</span>
              {/* Location/facility */}
              <span style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)' }}>
                {item._type === 'schedule' ? (item.location || '') : (item._facilityName || '')}
              </span>
            </div>
          ))
        )}
      </div>

      {/* Stats */}
      <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
        <StatCard icon={STAT_ICONS.schedule} label="今月のスケジュール" value={stats.events} />
        <StatCard icon={STAT_ICONS.reservation} label="今日の施設予約" value={stats.reservations} />
        <StatCard icon={STAT_ICONS.folder} label="フォルダ数" value={stats.docs} />
        <StatCard icon={STAT_ICONS.users} label="ユーザー数" value={stats.users} />
      </div>
    </div>
  );
}
