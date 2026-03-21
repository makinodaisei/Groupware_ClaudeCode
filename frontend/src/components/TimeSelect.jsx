import { useMemo } from 'react';

export default function TimeSelect({ name, value, onChange, defaultValue }) {
  const options = useMemo(() => {
    const opts = [];
    for (let h = 0; h < 24; h++) {
      for (let m = 0; m < 60; m += 5) {
        const hh = String(h).padStart(2, '0');
        const mm = String(m).padStart(2, '0');
        opts.push(`${hh}:${mm}`);
      }
    }
    return opts;
  }, []);

  const currentValue = value || defaultValue || '09:00';

  return (
    <select name={name} value={currentValue} onChange={e => onChange(e.target.value)}>
      {options.map(t => (
        <option key={t} value={t}>{t}</option>
      ))}
    </select>
  );
}
