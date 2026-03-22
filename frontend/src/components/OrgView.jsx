import { useMemo } from 'react';

const GUTTER_W = 104; // px — user name column
const DAY_NAMES = ['日', '月', '火', '水', '木', '金', '土'];

function dateStr(d) {
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
}

function timeStr(iso) {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export default function OrgView({ events, users, orgs, weekStart, onSlotClick, onEventClick, loading = false }) {
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    return d;
  }), [weekStart]);

  const todayStr = dateStr(new Date());

  // Build event lookup: `${userId}:${dayIdx}` → events[]
  const eventsByUserDay = useMemo(() => {
    const map = {};
    events.forEach(ev => {
      const uid = ev.createdBy;
      if (!uid || !ev.startDatetime) return;
      const ds = dateStr(new Date(ev.startDatetime));
      const dayIdx = days.findIndex(d => dateStr(d) === ds);
      if (dayIdx < 0) return;
      const key = `${uid}:${dayIdx}`;
      (map[key] = map[key] || []).push(ev);
    });
    return map;
  }, [events, days]);

  // Group users by org
  const groupedUsers = useMemo(() => {
    const byOrg = {};
    users.forEach(u => {
      const key = u.orgId || '__none__';
      (byOrg[key] = byOrg[key] || []).push(u);
    });
    const groups = orgs
      .filter(o => byOrg[o.orgId])
      .map(o => ({ key: o.orgId, label: o.name, users: byOrg[o.orgId] }));
    if (byOrg['__none__']?.length) {
      groups.push({ key: '__none__', label: '（未所属）', users: byOrg['__none__'] });
    }
    return groups;
  }, [users, orgs]);

  return (
    <div className="org-view">
      {/* Sticky day-header row */}
      <div className="week-header">
        <div style={{ width: GUTTER_W, flexShrink: 0 }} />
        {days.map((d, i) => {
          const isToday = dateStr(d) === todayStr;
          return (
            <div key={i} className={`week-day-header${isToday ? ' today' : ''}`}>
              <span className="week-dow">{DAY_NAMES[d.getDay()]}</span>
              <span className={`week-date-badge${isToday ? ' active' : ''}`}>{d.getDate()}</span>
            </div>
          );
        })}
      </div>

      {loading && (
        <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>
          読み込み中...
        </div>
      )}
      {!loading && users.length === 0 && (
        <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>
          ユーザーが登録されていません
        </div>
      )}

      {groupedUsers.map(group => (
        <div key={group.key}>
          <div className="org-view-group-header">{group.label}</div>
          {group.users.map(user => (
            <div key={user.userId} className="org-view-row">
              {/* User name cell */}
              <div className="org-view-user-cell" style={{ width: GUTTER_W }}>
                {user.name}
              </div>
              {/* Day cells */}
              {days.map((d, dayIdx) => {
                const isToday = dateStr(d) === todayStr;
                const dayEvs = (eventsByUserDay[`${user.userId}:${dayIdx}`] || [])
                  .sort((a, b) => new Date(a.startDatetime) - new Date(b.startDatetime));
                return (
                  <div
                    key={dayIdx}
                    className={`org-view-day-cell${isToday ? ' today-col' : ''}`}
                    onClick={() => onSlotClick(dateStr(d), '09:00')}
                  >
                    {dayEvs.map((ev, ei) => (
                      <div
                        key={ev.eventId || ei}
                        className="week-compact-event"
                        style={ev.isPublic === false ? { background: '#f1f5f9', color: '#475569' } : undefined}
                        onClick={e => { e.stopPropagation(); onEventClick(ev); }}
                        title={`${ev.title}\n${timeStr(ev.startDatetime)}–${timeStr(ev.endDatetime)}`}
                      >
                        <span className="week-compact-time">{timeStr(ev.startDatetime)}–{timeStr(ev.endDatetime)}</span>
                        <span className="week-compact-title">{ev.title}</span>
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
