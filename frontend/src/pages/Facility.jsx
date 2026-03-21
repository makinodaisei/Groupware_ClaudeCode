import { useState, useEffect, useCallback } from 'react';
import { getFacilities, getReservations, createReservation } from '../lib/api';
import { toISO, todayLocalStr, todayApiStr } from '../lib/helpers';
import { useToast } from '../components/Toast';
import Drawer from '../components/Drawer';
import DatePicker from '../components/DatePicker';
import TimeSelect from '../components/TimeSelect';

function toMin(iso) {
  const d = new Date(iso);
  return d.getHours() * 60 + d.getMinutes();
}


export default function Facility() {
  const showToast = useToast();
  const [facilities, setFacilities] = useState(null);
  const [reservationsMap, setReservationsMap] = useState({});
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedFacility, setSelectedFacility] = useState(null);
  const [form, setForm] = useState({ title: '', startDate: todayLocalStr(), startTime: '10:00', endDate: todayLocalStr(), endTime: '11:00', notes: '' });

  const load = useCallback(async () => {
    setFacilities(null);
    const today = todayApiStr();
    try {
      const data = await getFacilities();
      const facs = data.facilities || [];
      const reservable = facs.filter(f => f.facilityType !== 'group');
      setFacilities(reservable);
      const resMap = {};
      await Promise.all(reservable.map(f =>
        getReservations(f.facilityId, today)
          .then(r => { resMap[f.facilityId] = r.reservations || []; })
          .catch(() => { resMap[f.facilityId] = []; })
      ));
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
        title: fd.title.trim(), startDatetime: start, endDatetime: end, notes: fd.notes || ''
      });
    } catch (err) {
      if (err.status === 409) throw 'その時間帯は既に予約されています。別の時間を選択してください。';
      throw err.message || 'エラーが発生しました';
    }
    showToast('予約が完了しました', 'success');
    load();
  }

  if (facilities === null) {
    return (
      <div>
        <h2 style={{ marginBottom: '1.25rem', fontSize: '1.1rem', fontWeight: 700 }}>施設予約</h2>
        {[1,2,3].map(i => <div key={i} className="skeleton skeleton-row" style={{ height: 80, borderRadius: 10, marginBottom: 12 }} />)}
      </div>
    );
  }

  return (
    <div>
      <h2 style={{ marginBottom: '1.25rem', fontSize: '1.1rem', fontWeight: 700 }}>施設予約</h2>

      {facilities.length === 0 ? (
        <p style={{ color: 'var(--color-text-muted)' }}>施設が登録されていません</p>
      ) : facilities.map(f => {
        const reservations = reservationsMap[f.facilityId] || [];
        const blocks = reservations.map((r, ri) => {
          if (!r.startDatetime || !r.endDatetime) return null;
          const startMin = toMin(r.startDatetime);
          const endMin = toMin(r.endDatetime);
          if (startMin >= 1080) return null;
          const clampedEnd = Math.min(endMin, 1080);
          const left = Math.max(0, (startMin - 540)) / 540 * 100;
          const width = (clampedEnd - Math.max(startMin, 540)) / 540 * 100;
          if (width <= 0) return null;
          return <div key={ri} className="timeline-block" style={{ left: `${left.toFixed(2)}%`, width: `${width.toFixed(2)}%` }} title={r.title || ''} />;
        }).filter(Boolean);

        return (
          <div key={f.facilityId} className="facility-card">
            <div className="facility-card-header">
              <div>
                <div className="facility-name">{f.name}</div>
                <div className="facility-meta">収容: {f.capacity}名 | {f.location || '場所未設定'}</div>
              </div>
              <button className="btn btn-primary" onClick={() => openReservation(f)}>予約する</button>
            </div>
            {f.description && <p style={{ fontSize: '0.82rem', color: 'var(--color-text-muted)', marginBottom: '0.75rem' }}>{f.description}</p>}
            <div className="timeline-wrap">
              <div className="timeline-bar">{blocks}</div>
              <div className="timeline-labels"><span>9:00</span><span>12:00</span><span>15:00</span><span>18:00</span></div>
            </div>
          </div>
        );
      })}

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
