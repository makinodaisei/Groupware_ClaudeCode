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

// Module-level component to avoid remounting on every render
function FacilityRow({ f, reservations, onReserve }) {
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
      <button type="button" className="btn btn-primary" style={{ fontSize: '0.78rem', whiteSpace: 'nowrap' }} onClick={() => onReserve(f)}>
        予約する
      </button>
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
                {children.map(f => (
                  <FacilityRow
                    key={f.facilityId}
                    f={f}
                    reservations={reservationsMap[f.facilityId] || []}
                    onReserve={openReservation}
                  />
                ))}
              </div>
            );
          })}
          {/* Flat (ROOT) facilities */}
          {flatFacilities.map(f => (
            <FacilityRow
              key={f.facilityId}
              f={f}
              reservations={reservationsMap[f.facilityId] || []}
              onReserve={openReservation}
            />
          ))}
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
