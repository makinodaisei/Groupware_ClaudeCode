import { useState, useEffect, useCallback } from 'react';
import { api } from '../lib/api';
import { toISO, fromISO } from '../lib/helpers';
import { useToast } from '../components/Toast';
import Drawer from '../components/Drawer';
import DatePicker from '../components/DatePicker';
import TimeSelect from '../components/TimeSelect';

function todayStr() {
  const n = new Date();
  return `${n.getFullYear()}/${String(n.getMonth()+1).padStart(2,'0')}/${String(n.getDate()).padStart(2,'0')}`;
}

export default function Schedule() {
  const showToast = useToast();
  const [currentMonth, setCurrentMonth] = useState(() => {
    const n = new Date(); return new Date(n.getFullYear(), n.getMonth(), 1);
  });
  const [events, setEvents] = useState([]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editEvent, setEditEvent] = useState(null); // null = add mode
  const [form, setForm] = useState({ title: '', location: '', startDate: '', startTime: '09:00', endDate: '', endTime: '10:00', isPublic: true });

  const y = currentMonth.getFullYear();
  const m = currentMonth.getMonth();
  const firstDay = new Date(y, m, 1).getDay();
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const today = new Date();

  const loadEvents = useCallback(async () => {
    const monthStr = `${y}-${String(m+1).padStart(2,'0')}`;
    try {
      const data = await api('GET', `/schedules?month=${monthStr}`);
      setEvents(data.events || []);
    } catch {
      showToast('スケジュールの取得に失敗しました', 'error');
    }
  }, [y, m, showToast]);

  useEffect(() => { loadEvents(); }, [loadEvents]);

  function openAddDrawer(dateStr) {
    setEditEvent(null);
    setForm({ title: '', location: '', startDate: dateStr, startTime: '09:00', endDate: dateStr, endTime: '10:00', isPublic: true });
    setDrawerOpen(true);
  }

  function openEditDrawer(event) {
    const start = fromISO(event.startDatetime);
    const end = fromISO(event.endDatetime);
    setEditEvent(event);
    setForm({ title: event.title, location: event.location || '', startDate: start.date, startTime: start.time, endDate: end.date, endTime: end.time, isPublic: !!event.isPublic });
    setDrawerOpen(true);
  }

  async function handleSubmit(fd) {
    if (!fd.title?.trim()) throw 'タイトルを入力してください';
    if (!fd.startDate || !fd.endDate) throw '日付を入力してください';
    const start = toISO(form.startDate, form.startTime);
    const end = toISO(form.endDate, form.endTime);
    if (new Date(end) <= new Date(start)) throw '終了時刻は開始時刻より後にしてください';
    if (editEvent) {
      const res = await api('PUT', `/schedules/${editEvent.eventId}`, { title: fd.title.trim(), location: fd.location || '', startDatetime: start, endDatetime: end, isPublic: !!form.isPublic });
      if (res.error) throw res.message || 'エラーが発生しました';
      showToast('スケジュールを更新しました', 'success');
    } else {
      const res = await api('POST', '/schedules', { title: fd.title.trim(), location: fd.location || '', startDatetime: start, endDatetime: end, isPublic: !!form.isPublic });
      if (res.error) throw res.message || 'エラーが発生しました';
      showToast('スケジュールを追加しました', 'success');
    }
    loadEvents();
  }

  async function handleDelete(id) {
    const res = await api('DELETE', `/schedules/${id}`);
    if (res && res.error) throw res.message || '削除に失敗しました';
    showToast('スケジュールを削除しました', 'success');
    loadEvents();
  }

  // Group events by day
  const eventsByDay = {};
  events.forEach(e => {
    const day = parseInt(e.startDatetime?.slice(8, 10));
    if (!isNaN(day)) (eventsByDay[day] = eventsByDay[day] || []).push(e);
  });

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.25rem' }}>
        <button className="btn btn-secondary" onClick={() => setCurrentMonth(new Date(y, m-1, 1))}>◀</button>
        <h2 style={{ fontSize: '1.1rem', fontWeight: 700, flex: 1 }}>{y}年 {m+1}月</h2>
        <button className="btn btn-secondary" onClick={() => setCurrentMonth(new Date(y, m+1, 1))}>▶</button>
        <button className="btn btn-primary" onClick={() => openAddDrawer(todayStr())}>＋ 追加</button>
      </div>

      <div className="cal-grid">
        {['日','月','火','水','木','金','土'].map(d => <div key={d} className="cal-head">{d}</div>)}
        {Array.from({ length: firstDay }, (_, i) => <div key={`b${i}`} className="cal-cell blank" />)}
        {Array.from({ length: daysInMonth }, (_, i) => {
          const day = i + 1;
          const isToday = y === today.getFullYear() && m === today.getMonth() && day === today.getDate();
          const dateStr = `${y}/${String(m+1).padStart(2,'0')}/${String(day).padStart(2,'0')}`;
          return (
            <div key={day} className={`cal-cell${isToday ? ' today' : ''}`} onClick={() => openAddDrawer(dateStr)}>
              <div className="cal-day-num">{day}</div>
              {(eventsByDay[day] || []).map((e, ei) => (
                <div key={e.eventId || ei} className="cal-event-chip" title={e.title}
                  onClick={ev => { ev.stopPropagation(); openEditDrawer(e); }}>
                  {e.title}
                </div>
              ))}
            </div>
          );
        })}
      </div>

      <Drawer
        isOpen={drawerOpen}
        title={editEvent ? 'スケジュールを編集' : 'スケジュールを追加'}
        onClose={() => setDrawerOpen(false)}
        onSubmit={handleSubmit}
        onDelete={editEvent ? handleDelete : undefined}
        deleteId={editEvent?.eventId}
      >
        <div className="field">
          <label>タイトル <span style={{ color: 'var(--color-danger)' }}>*</span></label>
          <input type="text" name="title" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="例：全体会議" />
        </div>
        <div className="field">
          <label>場所</label>
          <input type="text" name="location" value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))} placeholder="例：会議室A" />
        </div>
        <div className="field">
          <label>開始</label>
          <div className="field-row">
            <DatePicker name="startDate" value={form.startDate} onChange={v => setForm(f => ({ ...f, startDate: v }))} />
            <TimeSelect name="startTime" value={form.startTime} onChange={v => setForm(f => ({ ...f, startTime: v }))} defaultValue="09:00" />
          </div>
        </div>
        <div className="field">
          <label>終了</label>
          <div className="field-row">
            <DatePicker name="endDate" value={form.endDate} onChange={v => setForm(f => ({ ...f, endDate: v }))} />
            <TimeSelect name="endTime" value={form.endTime} onChange={v => setForm(f => ({ ...f, endTime: v }))} defaultValue="10:00" />
          </div>
        </div>
        <div className="field">
          <div className="field-inline">
            <label className="toggle">
              <input type="checkbox" name="isPublic" checked={form.isPublic} onChange={e => setForm(f => ({ ...f, isPublic: e.target.checked }))} />
              <span className="toggle-slider" />
            </label>
            <span style={{ fontSize: '0.85rem' }}>公開する</span>
          </div>
        </div>
      </Drawer>
    </div>
  );
}
