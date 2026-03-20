import { useState, useEffect, useRef } from 'react';

const START_HOUR = 7;
const END_HOUR = 21;
const TOTAL_MIN = (END_HOUR - START_HOUR) * 60;
const HOUR_HEIGHT = 64; // px per hour
const GRID_HEIGHT = (END_HOUR - START_HOUR) * HOUR_HEIGHT;
const GUTTER_W = 52; // px for time labels column

const DAY_NAMES = ['日', '月', '火', '水', '木', '金', '土'];

function dateStr(d) {
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
}

function eventStartMin(ev) {
  const d = new Date(ev.startDatetime);
  return d.getHours() * 60 + d.getMinutes();
}

function eventEndMin(ev) {
  const d = new Date(ev.endDatetime);
  return d.getHours() * 60 + d.getMinutes();
}

function minToY(min) {
  return ((min - START_HOUR * 60) / TOTAL_MIN) * GRID_HEIGHT;
}

function yToMin(y, snapping = 15) {
  const raw = (y / GRID_HEIGHT) * TOTAL_MIN + START_HOUR * 60;
  return Math.round(raw / snapping) * snapping;
}

function minToTimeStr(min) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export default function WeekView({ events, weekStart, onSlotClick, onEventClick, onEventMove }) {
  const [nowMin, setNowMin] = useState(() => {
    const n = new Date();
    return n.getHours() * 60 + n.getMinutes();
  });
  const [drag, setDrag] = useState(null); // { event, dayIdx, offsetY, previewDay, previewMin }
  const colRefs = useRef([]);
  const bodyRef = useRef(null);

  // Update current time every minute
  useEffect(() => {
    const id = setInterval(() => {
      const n = new Date();
      setNowMin(n.getHours() * 60 + n.getMinutes());
    }, 60000);
    return () => clearInterval(id);
  }, []);

  // Scroll to 9:00 on mount
  useEffect(() => {
    if (bodyRef.current) {
      bodyRef.current.scrollTop = minToY(9 * 60) - 40;
    }
  }, []);

  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    return d;
  });

  const today = dateStr(new Date());
  const showNowLine = nowMin >= START_HOUR * 60 && nowMin < END_HOUR * 60;

  // Group events by day index
  const eventsByDay = {};
  events.forEach(ev => {
    const d = new Date(ev.startDatetime);
    const ds = dateStr(d);
    const idx = days.findIndex(day => dateStr(day) === ds);
    if (idx >= 0) {
      (eventsByDay[idx] = eventsByDay[idx] || []).push(ev);
    }
  });

  // --- Drag handlers ---
  function handleEventMouseDown(e, ev, dayIdx) {
    e.preventDefault();
    e.stopPropagation();
    const col = colRefs.current[dayIdx];
    if (!col) return;
    const rect = col.getBoundingClientRect();
    const offsetY = e.clientY - rect.top - minToY(eventStartMin(ev));
    setDrag({ event: ev, dayIdx, offsetY, previewDay: dayIdx, previewMin: eventStartMin(ev) });
  }

  function handleMouseMove(e) {
    if (!drag) return;
    // Find hovered day column
    let hoveredDay = drag.dayIdx;
    for (let i = 0; i < colRefs.current.length; i++) {
      const col = colRefs.current[i];
      if (!col) continue;
      const rect = col.getBoundingClientRect();
      if (e.clientX >= rect.left && e.clientX < rect.right) {
        hoveredDay = i;
        break;
      }
    }
    const col = colRefs.current[hoveredDay];
    if (!col) return;
    const rect = col.getBoundingClientRect();
    const relY = e.clientY - rect.top - drag.offsetY;
    const dur = eventEndMin(drag.event) - eventStartMin(drag.event);
    const snapped = Math.max(
      START_HOUR * 60,
      Math.min(yToMin(relY), END_HOUR * 60 - dur)
    );
    setDrag(d => ({ ...d, previewDay: hoveredDay, previewMin: snapped }));
  }

  function handleMouseUp() {
    if (!drag) return;
    const origStartMin = eventStartMin(drag.event);
    if (drag.previewDay !== drag.dayIdx || drag.previewMin !== origStartMin) {
      const dur = eventEndMin(drag.event) - origStartMin;
      const newDay = days[drag.previewDay];
      const datePrefix = `${newDay.getFullYear()}-${String(newDay.getMonth() + 1).padStart(2, '0')}-${String(newDay.getDate()).padStart(2, '0')}`;
      const startISO = `${datePrefix}T${minToTimeStr(drag.previewMin)}:00`;
      const endISO = `${datePrefix}T${minToTimeStr(drag.previewMin + dur)}:00`;
      onEventMove(drag.event, startISO, endISO);
    }
    setDrag(null);
  }

  function handleSlotClick(e, dayIdx) {
    if (drag) return;
    const col = colRefs.current[dayIdx];
    if (!col) return;
    const rect = col.getBoundingClientRect();
    const relY = e.clientY - rect.top;
    const min = Math.max(START_HOUR * 60, Math.min(yToMin(relY, 30), (END_HOUR - 1) * 60));
    const day = days[dayIdx];
    onSlotClick(dateStr(day), minToTimeStr(min));
  }

  const timeLabels = Array.from({ length: END_HOUR - START_HOUR + 1 }, (_, i) => START_HOUR + i);

  return (
    <div
      className="week-view"
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      style={{ userSelect: drag ? 'none' : undefined, cursor: drag ? 'grabbing' : undefined }}
    >
      {/* Sticky header */}
      <div className="week-header">
        <div style={{ width: GUTTER_W, flexShrink: 0 }} />
        {days.map((d, i) => {
          const isToday = dateStr(d) === today;
          return (
            <div key={i} className={`week-day-header${isToday ? ' today' : ''}`}>
              <span className="week-dow">{DAY_NAMES[d.getDay()]}</span>
              <span className={`week-date-badge${isToday ? ' active' : ''}`}>{d.getDate()}</span>
            </div>
          );
        })}
      </div>

      {/* Scrollable body */}
      <div className="week-body" ref={bodyRef}>
        {/* Time gutter */}
        <div className="week-time-gutter" style={{ width: GUTTER_W, height: GRID_HEIGHT }}>
          {timeLabels.map(h => (
            <div
              key={h}
              className="week-time-label"
              style={{ top: (h - START_HOUR) * HOUR_HEIGHT - 9 }}
            >
              {h < 24 ? `${String(h).padStart(2, '0')}:00` : ''}
            </div>
          ))}
        </div>

        {/* Day columns */}
        <div className="week-cols" style={{ height: GRID_HEIGHT }}>
          {days.map((d, dayIdx) => {
            const isToday = dateStr(d) === today;
            const colEventsRaw = eventsByDay[dayIdx] || [];
            const colEvents = drag
              ? colEventsRaw.filter(ev => ev.eventId !== drag.event.eventId)
              : colEventsRaw;

            return (
              <div
                key={dayIdx}
                ref={el => (colRefs.current[dayIdx] = el)}
                className={`week-day-col${isToday ? ' today-col' : ''}`}
                onClick={e => handleSlotClick(e, dayIdx)}
              >
                {/* Hour grid lines */}
                {timeLabels.map(h => (
                  <div
                    key={h}
                    className={`week-hour-line${h % 1 === 0 ? '' : ' half'}`}
                    style={{ top: (h - START_HOUR) * HOUR_HEIGHT }}
                  />
                ))}
                {/* Half-hour lines */}
                {timeLabels.slice(0, -1).map(h => (
                  <div
                    key={`${h}h`}
                    className="week-half-line"
                    style={{ top: (h - START_HOUR) * HOUR_HEIGHT + HOUR_HEIGHT / 2 }}
                  />
                ))}

                {/* Events */}
                {colEvents.map((ev, ei) => {
                  const sMin = eventStartMin(ev);
                  const eMin = eventEndMin(ev);
                  const top = minToY(sMin);
                  const height = Math.max(minToY(eMin) - top, 20);
                  return (
                    <div
                      key={ev.eventId || ei}
                      className="week-event"
                      style={{ top, height }}
                      onMouseDown={e => handleEventMouseDown(e, ev, dayIdx)}
                      onClick={e => { e.stopPropagation(); onEventClick(ev); }}
                      title={`${ev.title}\n${minToTimeStr(sMin)}–${minToTimeStr(eMin)}`}
                    >
                      <span className="week-event-time">{minToTimeStr(sMin)}</span>
                      <span className="week-event-title">{ev.title}</span>
                      {height > 44 && ev.location && (
                        <span className="week-event-loc">📍 {ev.location}</span>
                      )}
                    </div>
                  );
                })}

                {/* Drag preview */}
                {drag && drag.previewDay === dayIdx && (() => {
                  const dur = eventEndMin(drag.event) - eventStartMin(drag.event);
                  const top = minToY(drag.previewMin);
                  const height = Math.max(minToY(drag.previewMin + dur) - top, 20);
                  return (
                    <div
                      className="week-event week-event-drag"
                      style={{ top, height }}
                    >
                      <span className="week-event-time">{minToTimeStr(drag.previewMin)}</span>
                      <span className="week-event-title">{drag.event.title}</span>
                    </div>
                  );
                })()}

                {/* Current time indicator */}
                {isToday && showNowLine && (
                  <div className="week-now-line" style={{ top: minToY(nowMin) }}>
                    <div className="week-now-dot" />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
