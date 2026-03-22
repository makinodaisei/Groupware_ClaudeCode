// frontend/src/pages/Dashboard.jsx
import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import EmptyState from '../components/EmptyState';

// SVG icons
const ICONS = {
  schedule: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>,
  reservation: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>,
  folder: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/></svg>,
  users: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>,
  plus: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>,
  building: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>,
  upload: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="16 16 12 12 8 16"/><line x1="12" y1="12" x2="12" y2="21"/><path d="M20.39 18.39A5 5 0 0018 9h-1.26A8 8 0 103 16.3"/></svg>,
  calSm: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="3" y1="10" x2="21" y2="10"/></svg>,
  houseSm: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/></svg>,
  chevron: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6"/></svg>,
};

const STAT_COLORS = {
  schedule:    { color: '#1d4ed8', bg: '#eff6ff' },
  reservation: { color: '#16a34a', bg: '#f0fdf4' },
  folder:      { color: '#d97706', bg: '#fffbeb' },
  users:       { color: '#7c3aed', bg: '#f5f3ff' },
};

function StatCard({ iconKey, label, value, sublabel }) {
  const { color, bg } = STAT_COLORS[iconKey];
  return (
    <div className="stat-card" style={{ borderLeft: `3px solid ${color}` }}>
      <div className="stat-card-icon" style={{ color, background: bg, borderRadius: 8, width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {ICONS[iconKey]}
      </div>
      <div className="stat-card-num" style={{ color }}>
        {value ?? <span className="skeleton skeleton-row" style={{ width: 48, display: 'inline-block', height: 28 }} />}
      </div>
      <div className="stat-card-label">{label}</div>
      {sublabel && <div className="stat-card-sub" style={{ color: '#94a3b8' }}>{sublabel}</div>}
    </div>
  );
}

// Format ISO datetime → "HH:MM"
function fmtTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}

// Check if item is currently in progress
function isOngoing(item) {
  if (!item.startDatetime || !item.endDatetime) return false;
  const now = Date.now();
  return new Date(item.startDatetime).getTime() <= now && now < new Date(item.endDatetime).getTime();
}

export default function Dashboard() {
  const navigate = useNavigate();
  const [stats, setStats] = useState({ events: null, reservations: null, docs: null, users: null });
  const [agenda, setAgenda] = useState(null); // null = loading

  const load = useCallback(async () => {
    const now = new Date();
    const month = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
    const today = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;

    // Stats — fire independently, no await needed
    api('GET', '/documents/folders')
      .then(data => setStats(s => ({ ...s, docs: (data.folders || []).length })))
      .catch(() => setStats(s => ({ ...s, docs: '—' })));

    api('GET', '/users')
      .then(data => setStats(s => ({ ...s, users: (data.users || []).length })))
      .catch(() => setStats(s => ({ ...s, users: '—' })));

    // Agenda: today's schedules + reservations
    try {
      const [schedData, facData] = await Promise.all([
        api('GET', `/schedules?month=${month}`).catch(() => ({ events: [] })),
        api('GET', '/facilities').catch(() => ({ facilities: [] })),
      ]);
      setStats(s => ({ ...s, events: schedData.count ?? (schedData.events || []).length }));

      const todaySchedules = (schedData.events || [])
        .filter(e => e.startDatetime && e.startDatetime.startsWith(today))
        .map(e => ({ ...e, _type: 'schedule' }));

      const reservableFacilities = (facData.facilities || []).filter(f => f.facilityType !== 'group');
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

  const now = new Date();
  const days = ['日','月','火','水','木','金','土'];
  const dateLabel = `今日 ${now.getMonth()+1}/${now.getDate()}（${days[now.getDay()]}）`;
  const ongoingCount = (agenda || []).filter(isOngoing).length;

  return (
    <div>
      {/* Page header + quick actions */}
      <div className="page-header">
        <h2>ダッシュボード</h2>
        <div className="quick-actions">
          <button className="quick-action-btn primary" onClick={() => navigate('/schedule')}>
            {ICONS.plus} 予定を追加
          </button>
          <button className="quick-action-btn" onClick={() => navigate('/facility')}>
            {ICONS.building} 施設予約
          </button>
          <button className="quick-action-btn" onClick={() => navigate('/documents')}>
            {ICONS.upload} ファイル共有
          </button>
        </div>
      </div>

      {/* Today's agenda */}
      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <div className="card-header">
          <div className="card-title">{dateLabel}</div>
          {ongoingCount > 0 && (
            <span className="card-count-badge" style={{ background: '#d97706' }}>
              {ongoingCount}件進行中
            </span>
          )}
          {agenda !== null && agenda.length > 0 && ongoingCount === 0 && (
            <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>{agenda.length}件</span>
          )}
        </div>

        {agenda === null ? (
          [1,2,3].map(i => <div key={i} className="skeleton skeleton-row" style={{ height: 20, marginBottom: 8 }} />)
        ) : agenda.length === 0 ? (
          <EmptyState
            icon="calendar"
            message="今日の予定はありません"
            action={{ label: '+ 予定を追加', onClick: () => navigate('/schedule') }}
          />
        ) : (
          agenda.map((item, i) => {
            const ongoing = isOngoing(item);
            const isSchedule = item._type === 'schedule';
            const iconColor = isSchedule ? '#1d4ed8' : '#16a34a';
            const iconBg   = isSchedule ? '#eff6ff' : '#f0fdf4';
            const location = isSchedule ? (item.location || '') : (item._facilityName || '');
            const endTime  = fmtTime(item.endDatetime);
            return (
              <div
                key={item.eventId || item.reservationId || i}
                className={`agenda-item${ongoing ? ' ongoing' : ''}`}
                onClick={() => navigate(isSchedule ? '/schedule' : '/facility')}
                role="button"
                tabIndex={0}
                onKeyDown={e => e.key === 'Enter' && navigate(isSchedule ? '/schedule' : '/facility')}
              >
                {/* Type icon */}
                <div style={{
                  width: 30, height: 30, borderRadius: 8, flexShrink: 0,
                  background: iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: iconColor,
                }}>
                  {isSchedule ? ICONS.calSm : ICONS.houseSm}
                </div>

                {/* Time */}
                <span style={{ fontSize: '0.82rem', color: iconColor, fontWeight: 700, minWidth: 44, flexShrink: 0 }}>
                  {fmtTime(item.startDatetime)}
                  {endTime && <span style={{ fontWeight: 400, color: 'var(--color-text-muted)' }}>–{endTime}</span>}
                </span>

                {/* Title */}
                <span style={{ flex: 1, fontSize: '0.875rem', fontWeight: ongoing ? 600 : 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {item.title}
                </span>

                {/* Ongoing badge or location */}
                {ongoing
                  ? <span className="agenda-badge-now">進行中</span>
                  : location && (
                    <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', flexShrink: 0, maxWidth: 100, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {location}
                    </span>
                  )
                }

                {/* Chevron */}
                <span style={{ color: '#cbd5e1', flexShrink: 0 }}>{ICONS.chevron}</span>
              </div>
            );
          })
        )}
      </div>

      {/* Stats */}
      <div className="stat-grid">
        <StatCard iconKey="schedule"    label="今月のスケジュール" value={stats.events}       sublabel="今月" />
        <StatCard iconKey="reservation" label="今日の施設予約"     value={stats.reservations} sublabel="本日" />
        <StatCard iconKey="folder"      label="フォルダ数"         value={stats.docs}         sublabel="合計" />
        <StatCard iconKey="users"       label="ユーザー数"         value={stats.users}        sublabel="登録済み" />
      </div>
    </div>
  );
}
