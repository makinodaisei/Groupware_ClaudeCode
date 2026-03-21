import { useState, useEffect, useCallback } from 'react';
import { getSchedules, createSchedule, updateSchedule, deleteSchedule } from '../lib/api';
import { toISO, fromISO, todayLocalStr } from '../lib/helpers';
import { useToast } from '../components/Toast';
import Drawer from '../components/Drawer';
import DatePicker from '../components/DatePicker';
import TimeSelect from '../components/TimeSelect';
import WeekView from '../components/WeekView';


function getMonday(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day; // Monday = 1
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function weekLabel(weekStart) {
  const end = new Date(weekStart);
  end.setDate(end.getDate() + 6);
  const sy = weekStart.getFullYear(), sm = weekStart.getMonth() + 1, sd = weekStart.getDate();
  const ey = end.getFullYear(), em = end.getMonth() + 1, ed = end.getDate();
  if (sy === ey && sm === em) return `${sy}年${sm}月${sd}日〜${ed}日`;
  if (sy === ey) return `${sy}年${sm}月${sd}日〜${em}月${ed}日`;
  return `${sy}/${sm}/${sd}〜${ey}/${em}/${ed}`;
}

export default function Schedule() {
  const showToast = useToast();
  const [view, setView] = useState('month'); // 'month' | 'week'

  // Month view state
  const [currentMonth, setCurrentMonth] = useState(() => {
    const n = new Date(); return new Date(n.getFullYear(), n.getMonth(), 1);
  });

  // Week view state
  const [weekStart, setWeekStart] = useState(() => getMonday(new Date()));

  const [events, setEvents] = useState([]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editEvent, setEditEvent] = useState(null);
  const [form, setForm] = useState({ title: '', location: '', startDate: '', startTime: '09:00', endDate: '', endTime: '10:00', isPublic: true });

  const y = currentMonth.getFullYear();
  const m = currentMonth.getMonth();
  const firstDay = new Date(y, m, 1).getDay();
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const today = new Date();

  // Fetch events for current view range
  const loadEvents = useCallback(async () => {
    try {
      if (view === 'month') {
        const monthStr = `${y}-${String(m+1).padStart(2,'0')}`;
        const data = await getSchedules({ month: monthStr });
        setEvents(data.events || []);
      } else {
        // Fetch week: query by month(s) that overlap the week
        const months = new Set();
        for (let i = 0; i < 7; i++) {
          const d = new Date(weekStart);
          d.setDate(d.getDate() + i);
          months.add(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`);
        }
        const results = await Promise.all([...months].map(mo => getSchedules({ month: mo })));
        const all = results.flatMap(r => r.events || []);
        // Deduplicate by eventId
        const seen = new Set();
        setEvents(all.filter(e => seen.has(e.eventId) ? false : (seen.add(e.eventId), true)));
      }
    } catch {
      showToast('スケジュールの取得に失敗しました', 'error');
    }
  }, [view, y, m, weekStart, showToast]);

  useEffect(() => { loadEvents(); }, [loadEvents]);

  function openAddDrawer(dateStr, timeStr = '09:00') {
    const endH = parseInt(timeStr.split(':')[0]) + 1;
    const endTime = `${String(endH > 23 ? 23 : endH).padStart(2,'0')}:${timeStr.split(':')[1]}`;
    setEditEvent(null);
    setForm({ title: '', location: '', startDate: dateStr, startTime: timeStr, endDate: dateStr, endTime, isPublic: true });
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
      await updateSchedule(editEvent.eventId, { title: fd.title.trim(), location: fd.location || '', startDatetime: start, endDatetime: end, isPublic: !!form.isPublic });
      showToast('スケジュールを更新しました', 'success');
    } else {
      await createSchedule({ title: fd.title.trim(), location: fd.location || '', startDatetime: start, endDatetime: end, isPublic: !!form.isPublic });
      showToast('スケジュールを追加しました', 'success');
    }
    loadEvents();
  }

  async function handleDelete(id) {
    await deleteSchedule(id);
    showToast('スケジュールを削除しました', 'success');
    loadEvents();
  }

  async function handleEventMove(event, startISO, endISO) {
    try {
      await updateSchedule(event.eventId, { startDatetime: startISO, endDatetime: endISO });
      showToast('スケジュールを移動しました', 'success');
      loadEvents();
    } catch {
      showToast('移動に失敗しました', 'error');
    }
  }

  // Group events by day for month view
  const eventsByDay = {};
  events.forEach(e => {
    const day = parseInt(e.startDatetime?.slice(8, 10));
    if (!isNaN(day)) (eventsByDay[day] = eventsByDay[day] || []).push(e);
  });

  return (
    <div>
      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.25rem' }}>
        {view === 'month' ? (
          <>
            <button className="btn btn-secondary" onClick={() => setCurrentMonth(new Date(y, m-1, 1))}>◀</button>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 700, flex: 1 }}>{y}年 {m+1}月</h2>
            <button className="btn btn-secondary" onClick={() => setCurrentMonth(new Date(y, m+1, 1))}>▶</button>
          </>
        ) : (
          <>
            <button className="btn btn-secondary" onClick={() => setWeekStart(d => { const n = new Date(d); n.setDate(n.getDate()-7); return n; })}>◀</button>
            <h2 style={{ fontSize: '1.05rem', fontWeight: 700, flex: 1 }}>{weekLabel(weekStart)}</h2>
            <button className="btn btn-secondary" onClick={() => setWeekStart(d => { const n = new Date(d); n.setDate(n.getDate()+7); return n; })}>▶</button>
          </>
        )}

        {/* View toggle */}
        <div className="view-toggle">
          <button
            className={`view-toggle-btn${view === 'month' ? ' active' : ''}`}
            onClick={() => setView('month')}
          >月</button>
          <button
            className={`view-toggle-btn${view === 'week' ? ' active' : ''}`}
            onClick={() => setView('week')}
          >週</button>
        </div>

        <button className="btn btn-primary" onClick={() => openAddDrawer(todayLocalStr())}>＋ 追加</button>
      </div>

      {/* Month view */}
      {view === 'month' && (
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
      )}

      {/* Week view */}
      {view === 'week' && (
        <WeekView
          events={events}
          weekStart={weekStart}
          onSlotClick={(dateStr, timeStr) => openAddDrawer(dateStr, timeStr)}
          onEventClick={openEditDrawer}
          onEventMove={handleEventMove}
        />
      )}

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
