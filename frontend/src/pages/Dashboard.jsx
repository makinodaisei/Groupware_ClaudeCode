import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { fromISO } from '../lib/helpers';

function StatCard({ icon, label, value }) {
  return (
    <div className="card" style={{ flex: 1, minWidth: 160 }}>
      <div style={{ fontSize: '1.5rem', marginBottom: '0.4rem' }}>{icon}</div>
      <div style={{ fontSize: '1.8rem', fontWeight: 700, color: 'var(--color-primary)' }}>{value ?? <span className="skeleton skeleton-row" style={{ width: 48, display: 'inline-block', height: 28 }} />}</div>
      <div style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)', marginTop: '0.2rem' }}>{label}</div>
    </div>
  );
}

export default function Dashboard() {
  const [stats, setStats] = useState({ events: null, reservations: null, docs: null, users: null });
  const [recentEvents, setRecentEvents] = useState(null);

  useEffect(() => {
    const now = new Date();
    const month = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
    const today = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;

    api('GET', `/schedules?month=${month}`)
      .then(data => {
        setStats(s => ({ ...s, events: data.count ?? (data.events || []).length }));
        setRecentEvents((data.events || []).slice(0, 5));
      })
      .catch(() => setStats(s => ({ ...s, events: '—' })));

    api('GET', '/facilities')
      .then(async data => {
        const facilities = data.facilities || [];
        const counts = await Promise.all(
          facilities.map(f =>
            api('GET', `/facilities/${f.facilityId}/reservations?date=${today}`)
              .then(r => (r.reservations || []).length)
              .catch(() => 0)
          )
        );
        setStats(s => ({ ...s, reservations: counts.reduce((a, b) => a + b, 0) }));
      })
      .catch(() => setStats(s => ({ ...s, reservations: '—' })));

    api('GET', '/documents/folders')
      .then(data => setStats(s => ({ ...s, docs: (data.folders || []).length })))
      .catch(() => setStats(s => ({ ...s, docs: '—' })));

    api('GET', '/users')
      .then(data => setStats(s => ({ ...s, users: (data.users || []).length })))
      .catch(() => setStats(s => ({ ...s, users: '—' })));
  }, []);

  return (
    <div>
      <h2 style={{ marginBottom: '1.25rem', fontSize: '1.1rem', fontWeight: 700 }}>ダッシュボード</h2>

      {/* Stats */}
      <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
        <StatCard icon="📅" label="今月のスケジュール" value={stats.events} />
        <StatCard icon="🏢" label="今日の施設予約" value={stats.reservations} />
        <StatCard icon="📁" label="フォルダ数" value={stats.docs} />
        <StatCard icon="👥" label="ユーザー数" value={stats.users} />
      </div>

      {/* Recent events */}
      <div className="card">
        <div className="card-title">直近のスケジュール</div>
        {recentEvents === null ? (
          <div className="skeleton skeleton-row" style={{ height: 16 }} />
        ) : recentEvents.length === 0 ? (
          <p style={{ color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>スケジュールなし</p>
        ) : (
          recentEvents.map((e, i) => {
            const { date, time } = fromISO(e.startDatetime);
            return (
              <div key={e.eventId || i} style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.5rem 0', borderTop: i > 0 ? '1px solid #f1f5f9' : '' }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: e.isPublic ? '#3b82f6' : '#f97316', flexShrink: 0 }} />
                <div style={{ flex: 1, fontSize: '0.875rem' }}>{e.title}</div>
                <div style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)' }}>{date} {time}</div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
