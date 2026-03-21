# UX改善 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 5つのUX改善をフロントエンドのみで実施する（timeAgoヘルパー、EmptyStateコンポーネント、ダッシュボード今日のアジェンダ、施設グリッドビュー、ドキュメントファイルカード情報追加、モバイルハンバーガーメニュー）。

**Architecture:** フロントエンドのみの変更。バックエンドAPIは変更しない。共有コンポーネント（EmptyState）を先に作り、各ページから利用する。既存のCSS変数・コンポーネントパターンに従う。絵文字は使わず全てSVGアイコン。

**Tech Stack:** React 18, Vite, CSS variables (globals.css), HashRouter, 既存 API クライアント (`frontend/src/lib/api/`)

**Spec:** `docs/superpowers/specs/2026-03-22-ux-improvements-design.md`

---

## ファイル構成

| ファイル | 変更種別 | 役割 |
|---------|---------|------|
| `frontend/src/lib/helpers.js` | Modify | `timeAgo()` ヘルパー追加 |
| `frontend/src/components/EmptyState.jsx` | Create | 空状態共通コンポーネント |
| `frontend/src/pages/Dashboard.jsx` | Rewrite | 今日のアジェンダ + 統計カード(SVGアイコン) |
| `frontend/src/pages/Facility.jsx` | Rewrite | グリッドビュー（グループ階層対応） |
| `frontend/src/pages/Documents.jsx` | Modify | ファイルカードに更新者・更新日追加、EmptyState適用 |
| `frontend/src/App.jsx` | Modify | `menuOpen` state追加 |
| `frontend/src/components/TopBar.jsx` | Modify | ハンバーガーボタン追加（モバイル時） |
| `frontend/src/components/Sidebar.jsx` | Modify | `isOpen`/`onClose` props対応 |
| `frontend/src/styles/globals.css` | Modify | モバイル用メディアクエリ追加 |

---

## Task 1: timeAgo ヘルパーを helpers.js に追加

**Files:**
- Modify: `frontend/src/lib/helpers.js`

- [ ] **Step 1: `timeAgo` 関数を追加**

`frontend/src/lib/helpers.js` の末尾に追加:

```js
// Returns a relative time string (e.g. "3日前", "2時間前", "たった今").
// isoString: ISO-8601 string (e.g. "2026-03-20T10:00:00+09:00")
// Boundary: < 168 hours → "N日前", >= 168 hours → "YYYY/MM/DD"
export function timeAgo(isoString) {
  if (!isoString) return '';
  const date = new Date(isoString);
  if (isNaN(date)) return '';
  const diff = Date.now() - date.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'たった今';
  if (mins < 60) return `${mins}分前`;
  const hours = Math.floor(diff / 3600000);
  if (hours < 24) return `${hours}時間前`;
  const days = Math.floor(diff / 86400000);
  if (days < 7) return `${days}日前`;
  const d = new Date(isoString);
  return `${d.getFullYear()}/${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')}`;
}
```

- [ ] **Step 2: ビルド確認**

```bash
cd /c/Users/Makinodaisei/Desktop/claudecode/CCAWS/groupware/frontend && npm run build 2>&1 | tail -5
```

Expected: `✓ built in ...`

- [ ] **Step 3: コミット**

```bash
git add frontend/src/lib/helpers.js
git commit -m "feat: add timeAgo helper to helpers.js"
```

---

## Task 2: EmptyState 共通コンポーネント作成

**Files:**
- Create: `frontend/src/components/EmptyState.jsx`

- [ ] **Step 1: `EmptyState.jsx` を作成**

```jsx
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

export default function EmptyState({ icon = 'document', message, action }) {
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
        <button type="button" className="btn btn-primary" style={{ fontSize: '0.82rem' }} onClick={action.onClick}>
          {action.label}
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 2: ビルド確認**

```bash
cd /c/Users/Makinodaisei/Desktop/claudecode/CCAWS/groupware/frontend && npm run build 2>&1 | tail -5
```

Expected: `✓ built in ...`

- [ ] **Step 3: コミット**

```bash
git add frontend/src/components/EmptyState.jsx
git commit -m "feat: add EmptyState shared component"
```

---

## Task 3: Dashboard を今日のアジェンダ表示に書き直し

**Files:**
- Modify: `frontend/src/pages/Dashboard.jsx`

現在の `Dashboard.jsx` は「今月のスケジュール一覧」と「統計カード」を表示。これを「今日のアジェンダ（スケジュール+施設予約を時系列）」＋「統計カード（SVGアイコン）」に書き直す。

`api` 関数は `import { api } from '../lib/api'` で使える（既存パターン）。

- [ ] **Step 1: `Dashboard.jsx` を書き直し**

```jsx
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
```

- [ ] **Step 2: ビルド確認**

```bash
cd /c/Users/Makinodaisei/Desktop/claudecode/CCAWS/groupware/frontend && npm run build 2>&1 | tail -5
```

Expected: `✓ built in ...`

- [ ] **Step 3: コミット**

```bash
git add frontend/src/pages/Dashboard.jsx
git commit -m "feat: rewrite Dashboard with today's agenda timeline"
```

---

## Task 4: Facility ページをグリッドビューに書き直し

**Files:**
- Modify: `frontend/src/pages/Facility.jsx`

既存のカードビューを廃止し、グリッドビュー（グループをセクションヘッダー、子施設を行）をデフォルト表示にする。予約ドロワーは既存パターンを踏襲。

- [ ] **Step 1: `Facility.jsx` を書き直し**

```jsx
// frontend/src/pages/Facility.jsx
import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { getFacilities, getReservations, createReservation } from '../lib/api';
import { toISO, todayLocalStr, todayApiStr } from '../lib/helpers';
import { useToast } from '../components/Toast';
import Drawer from '../components/Drawer';
import DatePicker from '../components/DatePicker';
import TimeSelect from '../components/TimeSelect';
import EmptyState from '../components/EmptyState';

// Convert ISO datetime to minutes since midnight
function toMin(iso) {
  const d = new Date(iso);
  return d.getHours() * 60 + d.getMinutes();
}

// Render a single timeline bar for a facility row
function TimelineBar({ reservations }) {
  const blocks = reservations.map((r, ri) => {
    if (!r.startDatetime || !r.endDatetime) return null;
    const startMin = toMin(r.startDatetime);
    const endMin = toMin(r.endDatetime);
    if (startMin >= 1080) return null; // after 18:00
    const clampedEnd = Math.min(endMin, 1080);
    const left = Math.max(0, (startMin - 540)) / 540 * 100;
    const width = (clampedEnd - Math.max(startMin, 540)) / 540 * 100;
    if (width <= 0) return null;
    return (
      <div
        key={ri}
        className="timeline-block"
        style={{ left: `${left.toFixed(2)}%`, width: `${width.toFixed(2)}%` }}
        title={r.title || ''}
      />
    );
  }).filter(Boolean);

  return (
    <div style={{ flex: 1 }}>
      <div className="timeline-bar" style={{ position: 'relative', height: 20 }}>{blocks}</div>
      <div className="timeline-labels" style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: 'var(--color-text-muted)', marginTop: 2 }}>
        <span>9:00</span><span>12:00</span><span>15:00</span><span>18:00</span>
      </div>
    </div>
  );
}

export default function Facility() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const showToast = useToast();
  const [facilities, setFacilities] = useState(null); // null = loading
  const [reservationsMap, setReservationsMap] = useState({});
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedFacility, setSelectedFacility] = useState(null);
  const [form, setForm] = useState({
    title: '', startDate: todayLocalStr(), startTime: '10:00',
    endDate: todayLocalStr(), endTime: '11:00', notes: '',
  });

  const load = useCallback(async () => {
    setFacilities(null);
    const today = todayApiStr();
    try {
      const data = await getFacilities();
      const allFacs = data.facilities || [];
      // Only reservable facilities (not groups) get timelines/reservation buttons
      const reservable = allFacs.filter(f => f.facilityType !== 'group');
      setFacilities(allFacs);

      const resMap = {};
      await Promise.all(
        reservable.map(f =>
          getReservations(f.facilityId, today)
            .then(r => { resMap[f.facilityId] = r.reservations || []; })
            .catch(() => { resMap[f.facilityId] = []; })
        )
      );
      setReservationsMap(resMap);
    } catch {
      setFacilities([]);
      showToast('施設情報の取得に失敗しました', 'error');
    }
  }, [showToast]);

  useEffect(() => { load(); }, [load]);

  function openReservation(facility) {
    setSelectedFacility(facility);
    const d = todayLocalStr();
    setForm({ title: '', startDate: d, startTime: '10:00', endDate: d, endTime: '11:00', notes: '' });
    setDrawerOpen(true);
  }

  async function handleSubmit(fd) {
    if (!fd.title?.trim()) throw '予約タイトルを入力してください';
    if (!form.startDate || !form.endDate) throw '日付を入力してください';
    const start = toISO(form.startDate, form.startTime);
    const end = toISO(form.endDate, form.endTime);
    if (new Date(end) <= new Date(start)) throw '終了時刻は開始時刻より後にしてください';
    try {
      await createReservation(selectedFacility.facilityId, {
        title: fd.title.trim(), startDatetime: start, endDatetime: end, notes: fd.notes || '',
      });
    } catch (err) {
      if (err.status === 409) throw 'その時間帯は既に予約されています。別の時間を選択してください。';
      throw err.message || 'エラーが発生しました';
    }
    showToast('予約が完了しました', 'success');
    load();
  }

  // Loading state
  if (facilities === null) {
    return (
      <div>
        <h2 style={{ marginBottom: '1.25rem', fontSize: '1.1rem', fontWeight: 700 }}>施設予約</h2>
        {[1,2,3].map(i => (
          <div key={i} className="skeleton skeleton-row" style={{ height: 48, borderRadius: 8, marginBottom: 10 }} />
        ))}
      </div>
    );
  }

  // Derive groups and flat facilities
  const groups = facilities.filter(f => f.facilityType === 'group');
  const flatFacilities = facilities.filter(f => f.facilityType !== 'group' && f.parentId === 'ROOT');
  function getChildren(groupId) {
    return facilities.filter(f => f.facilityType !== 'group' && f.parentId === groupId);
  }

  // All reservable facilities (for empty state check)
  const reservableFacilities = facilities.filter(f => f.facilityType !== 'group');

  // Render a single facility row in the grid
  function FacilityRow({ f }) {
    const reservations = reservationsMap[f.facilityId] || [];
    return (
      <div style={{
        display: 'grid', gridTemplateColumns: '160px 1fr auto',
        alignItems: 'center', gap: '0.75rem',
        padding: '0.5rem 0.75rem',
        borderTop: '1px solid var(--color-border)',
      }}>
        <div style={{ fontSize: '0.875rem' }}>
          <div>{f.name}</div>
          {f.location && <div style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)' }}>{f.location}</div>}
        </div>
        <TimelineBar reservations={reservations} />
        <button type="button" className="btn btn-primary" style={{ fontSize: '0.78rem', whiteSpace: 'nowrap' }} onClick={() => openReservation(f)}>
          予約する
        </button>
      </div>
    );
  }

  return (
    <div>
      <h2 style={{ marginBottom: '1.25rem', fontSize: '1.1rem', fontWeight: 700 }}>施設予約 — 今日の空き状況</h2>

      {reservableFacilities.length === 0 ? (
        <div className="card">
          <EmptyState
            icon="building"
            message="施設が登録されていません"
            action={user?.role === 'admin' ? { label: '+ 施設を追加', onClick: () => navigate('/admin') } : undefined}
          />
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          {/* Group sections */}
          {groups.map(g => {
            const children = getChildren(g.facilityId);
            if (children.length === 0) return null;
            return (
              <div key={g.facilityId}>
                <div style={{
                  padding: '0.5rem 0.75rem',
                  background: 'var(--color-bg)',
                  borderTop: '1px solid var(--color-border)',
                  fontSize: '0.78rem', fontWeight: 700, color: 'var(--color-text-muted)',
                  textTransform: 'uppercase', letterSpacing: '0.04em',
                }}>
                  {g.name}
                </div>
                {children.map(f => <FacilityRow key={f.facilityId} f={f} />)}
              </div>
            );
          })}
          {/* Flat (ROOT) facilities */}
          {flatFacilities.map(f => <FacilityRow key={f.facilityId} f={f} />)}
        </div>
      )}

      {/* Reservation drawer */}
      <Drawer
        isOpen={drawerOpen}
        title={selectedFacility ? `予約: ${selectedFacility.name}` : '予約'}
        onClose={() => setDrawerOpen(false)}
        onSubmit={handleSubmit}
      >
        <div className="field">
          <label>予約タイトル <span style={{ color: 'var(--color-danger)' }}>*</span></label>
          <input type="text" name="title" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="例：プロジェクト会議" />
        </div>
        <div className="field">
          <label>開始</label>
          <div className="field-row">
            <DatePicker name="startDate" value={form.startDate} onChange={v => setForm(f => ({ ...f, startDate: v }))} />
            <TimeSelect name="startTime" value={form.startTime} onChange={v => setForm(f => ({ ...f, startTime: v }))} defaultValue="10:00" />
          </div>
        </div>
        <div className="field">
          <label>終了</label>
          <div className="field-row">
            <DatePicker name="endDate" value={form.endDate} onChange={v => setForm(f => ({ ...f, endDate: v }))} />
            <TimeSelect name="endTime" value={form.endTime} onChange={v => setForm(f => ({ ...f, endTime: v }))} defaultValue="11:00" />
          </div>
        </div>
        <div className="field">
          <label>メモ</label>
          <textarea name="notes" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="任意メモ..." />
        </div>
      </Drawer>
    </div>
  );
}
```

- [ ] **Step 2: ビルド確認**

```bash
cd /c/Users/Makinodaisei/Desktop/claudecode/CCAWS/groupware/frontend && npm run build 2>&1 | tail -5
```

Expected: `✓ built in ...`

- [ ] **Step 3: コミット**

```bash
git add frontend/src/pages/Facility.jsx
git commit -m "feat: rewrite Facility page with grid view and group hierarchy"
```

---

## Task 5: Documents ファイルカードに更新者・更新日を追加

**Files:**
- Modify: `frontend/src/pages/Documents.jsx`

ファイルカードに `uploadedBy`（ユーザー名）と `updatedAt`（relative time）を追加。`getUsers()` でユーザー一覧を取得してuserIdを名前に変換。EmptyStateを空フォルダ/空ファイル状態に適用。

- [ ] **Step 1: imports と userMap state を追加**

`Documents.jsx` の先頭 import に追加:
```jsx
import { getUsers } from '../lib/api';
import { timeAgo } from '../lib/helpers';
import EmptyState from '../components/EmptyState';
```

`Documents` コンポーネント内に state を追加（`const [uploadProgress, ...]` の下に）:
```jsx
const [userMap, setUserMap] = useState({}); // { userId: name }
```

- [ ] **Step 2: useEffect でユーザー一覧を取得して userMap を構築**

既存の `useEffect(() => { loadFolders(); }, [loadFolders]);` の直下に追加:
```jsx
useEffect(() => {
  getUsers()
    .then(data => {
      const map = {};
      (data.users || []).forEach(u => { map[u.userId] = u.name || u.email; });
      setUserMap(map);
    })
    .catch(() => {}); // fail silently
}, []);
```

- [ ] **Step 3: ファイルカードに更新者・更新日を追加**

`Documents.jsx` のファイルカード部分（`files.map(f => ...`）を以下に変更:

```jsx
{files.length === 0 ? (
  <div style={{ gridColumn: '1/-1' }}>
    <EmptyState
      icon="document"
      message="このフォルダにファイルはありません"
      action={{ label: 'ファイルをアップロード', onClick: () => fileInputRef.current?.click() }}
    />
  </div>
) : (
  <>
    {files.map(f => (
      <div key={f.fileId} className="file-card" onClick={() => downloadFile(f.fileId)}>
        <div className="file-card-icon">{getFileIcon(f.name)}</div>
        <div className="file-card-name">{f.name}</div>
        <div className="file-card-size">{formatSize(f.size)}</div>
        <div style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)', marginTop: 2 }}>
          {userMap[f.uploadedBy] || f.uploadedBy || ''}
          {(f.updatedAt || f.createdAt) ? ` · ${timeAgo(f.updatedAt || f.createdAt)}` : ''}
        </div>
      </div>
    ))}
    <div className="file-card file-card-add" onClick={() => fileInputRef.current?.click()}>
      <div className="file-card-icon" style={{ fontSize: '1.2rem', color: 'var(--color-text-muted)' }}>＋</div>
      <div className="file-card-name" style={{ color: 'var(--color-text-muted)' }}>追加</div>
    </div>
  </>
)}
```

**注意**: 上記は既存の `files.map(f => ...)` ブロック全体と `file-card-add` を含むブロック(`<>...</>`)を置き換える。

- [ ] **Step 4: フォルダツリーが空のときの EmptyState 追加**

既存の `<FolderTree nodes={tree} .../>` の前後を以下のように変更:
```jsx
{tree.length === 0 ? (
  <EmptyState
    icon="document"
    message="フォルダがありません"
    action={{ label: '+ フォルダを作成', onClick: () => setShowFolderInput(true) }}
  />
) : (
  <FolderTree nodes={tree} depth={0} currentFolderId={currentFolderId} onSelect={selectFolder} />
)}
```

- [ ] **Step 5: ビルド確認**

```bash
cd /c/Users/Makinodaisei/Desktop/claudecode/CCAWS/groupware/frontend && npm run build 2>&1 | tail -5
```

Expected: `✓ built in ...`

- [ ] **Step 6: コミット**

```bash
git add frontend/src/pages/Documents.jsx
git commit -m "feat: add uploader and timeAgo to file cards, apply EmptyState"
```

---

## Task 6: モバイル ハンバーガーメニュー対応

**Files:**
- Modify: `frontend/src/App.jsx`
- Modify: `frontend/src/components/TopBar.jsx`
- Modify: `frontend/src/components/Sidebar.jsx`
- Modify: `frontend/src/styles/globals.css`

768px以下でサイドバーを非表示にし、TopBarにハンバーガーボタンを追加。タップでスライドイン表示。

### Step 1: App.jsx に menuOpen state を追加

- [ ] **Step 1: App.jsx を修正**

既存の `AppLayout` コンポーネントを以下のように変更（`const { user } = useAuth()` の後に `menuOpen` state を追加、TopBar と Sidebar に props を渡す）:

```jsx
function AppLayout() {
  const { user } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  if (!user) return <Login />;

  return (
    <div id="app" style={{ display: 'flex' }}>
      <div className="topbar-wrapper" style={{ position:'fixed', top:0, left:0, right:0, zIndex:50 }}>
        <TopBar menuOpen={menuOpen} onMenuToggle={() => setMenuOpen(o => !o)} />
      </div>
      <div className="app-body" style={{ marginTop: 'var(--topbar-h)', width:'100%', display:'flex', height:'calc(100vh - var(--topbar-h))' }}>
        <Sidebar isOpen={menuOpen} onClose={() => setMenuOpen(false)} />
        <main className="main-content">
          <div className="main-inner">
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/schedule" element={<Schedule />} />
              <Route path="/facility" element={<Facility />} />
              <Route path="/documents" element={<Documents />} />
              <Route path="/admin" element={user?.role === 'admin' ? <Admin /> : <Navigate to="/" />} />
              <Route path="/users" element={<Navigate to="/admin" replace />} />
            </Routes>
          </div>
        </main>
      </div>
    </div>
  );
}
```

`useState` を React imports に追加: `import { useState } from 'react';`

### Step 2: TopBar.jsx にハンバーガーボタン追加

- [ ] **Step 2: TopBar.jsx を修正**

`TopBar` コンポーネントに `menuOpen` と `onMenuToggle` props を追加し、ハンバーガーボタンを左端に追加:

```jsx
export default function TopBar({ menuOpen, onMenuToggle }) {
  const { user, logout } = useAuth();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const initial = (user?.name || user?.email || '?').charAt(0).toUpperCase();

  return (
    <div className="topbar">
      {/* Hamburger — mobile only */}
      <button
        type="button"
        className="topbar-hamburger"
        onClick={onMenuToggle}
        aria-label="メニューを開く"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <line x1="3" y1="6" x2="21" y2="6"/>
          <line x1="3" y1="12" x2="21" y2="12"/>
          <line x1="3" y1="18" x2="21" y2="18"/>
        </svg>
      </button>
      <div className="topbar-logo">G</div>
      <div className="topbar-title">社内グループウェア</div>
      <div className="topbar-spacer" />
      <div className="topbar-user" onClick={() => setDropdownOpen(o => !o)}>
        <div className="topbar-avatar">{initial}</div>
        <span>{user?.name || user?.email}</span>
        <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor" style={{ marginLeft: 2 }}><path d="M0 3l5 5 5-5z"/></svg>
        {dropdownOpen && (
          <div className="topbar-dropdown open">
            <div className="topbar-dropdown-item danger" onClick={logout}>
              ログアウト
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
```

### Step 3: Sidebar.jsx に isOpen / onClose props 追加

- [ ] **Step 3: Sidebar.jsx を修正**

`Sidebar` コンポーネントに `isOpen` と `onClose` props を追加。ナビ項目クリック時に `onClose()` を呼ぶ（`useEffect` 方式は不可）。オーバーレイ背景を追加:

```jsx
export default function Sidebar({ isOpen, onClose }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const isActive = (path) =>
    path === '/' ? location.pathname === '/' : location.pathname.startsWith(path);

  function handleNav(path) {
    navigate(path);
    onClose?.();
  }

  return (
    <>
      {/* Overlay — mobile only, closes menu on tap */}
      {isOpen && (
        <div
          className="sidebar-overlay"
          onClick={onClose}
          aria-hidden="true"
        />
      )}
      <div className={`sidebar${isOpen ? ' open' : ''}`}>
        {NAV_ITEMS.map(item => (
          <div
            key={item.id}
            className={`sidebar-item ${isActive(item.path) ? 'active' : ''}`}
            onClick={() => handleNav(item.path)}
          >
            {item.icon}
            {item.title}
          </div>
        ))}
        <div className="sidebar-spacer" />
        {user?.role === 'admin' && (
          <div
            className={`sidebar-item ${isActive(ADMIN_ITEM.path) ? 'active' : ''}`}
            onClick={() => handleNav(ADMIN_ITEM.path)}
          >
            {ADMIN_ITEM.icon}
            {ADMIN_ITEM.title}
          </div>
        )}
      </div>
    </>
  );
}
```

### Step 4: globals.css にモバイル用スタイルを追加

- [ ] **Step 4: globals.css の末尾に追加**

```css
/* ===================== Mobile (≤768px) ===================== */

/* Hamburger button — hidden on desktop, shown on mobile */
.topbar-hamburger {
  display: none;
  background: none;
  border: none;
  color: white;
  cursor: pointer;
  padding: 0 0.5rem 0 0;
  line-height: 0;
}

@media (max-width: 768px) {
  /* Show hamburger */
  .topbar-hamburger {
    display: flex;
    align-items: center;
  }

  /* Sidebar: off-screen by default, slides in when .open */
  .sidebar {
    position: fixed;
    top: var(--topbar-h);
    left: 0;
    height: calc(100vh - var(--topbar-h));
    transform: translateX(-100%);
    transition: transform var(--transition-mid);
    z-index: 45;
  }

  .sidebar.open {
    transform: translateX(0);
  }

  /* Semi-transparent overlay behind sidebar */
  .sidebar-overlay {
    position: fixed;
    inset: 0;
    top: var(--topbar-h);
    background: rgba(0, 0, 0, 0.4);
    z-index: 40;
  }

  /* Main content takes full width on mobile */
  .main-content {
    width: 100%;
  }

  /* Reduce padding on small screens */
  .main-inner {
    padding: 1rem;
  }
}
```

- [ ] **Step 5: ビルド確認**

```bash
cd /c/Users/Makinodaisei/Desktop/claudecode/CCAWS/groupware/frontend && npm run build 2>&1 | tail -5
```

Expected: `✓ built in ...`

- [ ] **Step 6: コミット**

```bash
git add frontend/src/App.jsx frontend/src/components/TopBar.jsx frontend/src/components/Sidebar.jsx frontend/src/styles/globals.css
git commit -m "feat: add mobile hamburger menu with slide-in sidebar"
```

---

## 最終確認

- [ ] **全タスク完了後: ビルドが通ることを確認**

```bash
cd /c/Users/Makinodaisei/Desktop/claudecode/CCAWS/groupware/frontend && npm run build 2>&1 | tail -10
```

- [ ] **手動確認チェックリスト**
  - Dashboard: 今日のアジェンダが時系列で表示される
  - Dashboard: 統計カードにSVGアイコンが表示される（絵文字なし）
  - Facility: グリッドビューが表示され、グループヘッダーの下に子施設が並ぶ
  - Facility: 施設が0件のとき EmptyState が表示される（adminにはリンクボタン）
  - Documents: ファイルカードに「田中 · 3日前」形式で表示される
  - Documents: 空フォルダ/空ファイルで EmptyState が表示される
  - モバイル（768px以下）: ハンバーガーボタンが TopBar 左端に表示される
  - モバイル: タップでサイドバーがスライドイン、オーバーレイタップで閉じる
  - デスクトップ: ハンバーガーボタンは非表示、サイドバーは常設表示
