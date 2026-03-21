export function toISO(dateStr, timeStr) {
    // dateStr: 'YYYY/MM/DD', timeStr: 'HH:MM' → 'YYYY-MM-DDThh:mm:ss+09:00'
    const d = dateStr.replace(/\//g, '-');
    return `${d}T${timeStr}:00+09:00`;
  }

export function fromISO(isoStr) {
    if (!isoStr) return { date: '', time: '09:00' };
    const [datePart, rest] = isoStr.split('T');
    const time = rest ? rest.slice(0, 5) : '09:00';
    return { date: datePart.replace(/-/g, '/'), time };
  }

export function escHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g,'&amp;')
      .replace(/</g,'&lt;')
      .replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;');
  }

export function getFileIcon(name) {
    const ext = (name || '').split('.').pop().toLowerCase();
    const map = { pdf:'📄', xlsx:'📊', xls:'📊', docx:'📝', doc:'📝', pptx:'📋', ppt:'📋',
                  png:'🖼️', jpg:'🖼️', jpeg:'🖼️', gif:'🖼️', zip:'📦', txt:'📃' };
    return map[ext] || '📎';
  }

export function formatSize(bytes) {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024*1024) return `${(bytes/1024).toFixed(0)} KB`;
    return `${(bytes/1024/1024).toFixed(1)} MB`;
  }

// Returns today as 'YYYY/MM/DD' — matches the slash format used by DatePicker inputs.
// Same format as fromISO's date return value.
export function todayLocalStr() {
  const n = new Date();
  return `${n.getFullYear()}/${String(n.getMonth()+1).padStart(2,'0')}/${String(n.getDate()).padStart(2,'0')}`;
}

// Returns today as 'YYYY-MM-DD' — for API query parameters.
export function todayApiStr() {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,'0')}-${String(n.getDate()).padStart(2,'0')}`;
}
