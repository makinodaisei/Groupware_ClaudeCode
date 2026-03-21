import { useEffect, useRef, useState } from 'react';

export default function Drawer({ isOpen, title, onClose, onSubmit, onDelete, deleteId, children }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const formRef = useRef(null);

  // ESC key handler
  useEffect(() => {
    if (!isOpen) return;
    function handleKey(e) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [isOpen, onClose]);

  // Reset error when drawer opens
  useEffect(() => {
    if (isOpen) setError('');
  }, [isOpen]);

  async function handleSubmit() {
    if (!formRef.current) return;
    // Collect form data from [name] elements
    const fd = {};
    formRef.current.querySelectorAll('[name]').forEach(el => {
      if (el.type === 'checkbox') fd[el.name] = el.checked;
      else if (el.type === 'radio') { if (el.checked) fd[el.name] = el.value; }
      else fd[el.name] = el.value;
    });
    setLoading(true);
    setError('');
    try {
      await onSubmit(fd);
      onClose();
    } catch (err) {
      setError(typeof err === 'string' ? err : (err?.message || 'エラーが発生しました'));
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete() {
    if (!onDelete) return;
    setLoading(true);
    setError('');
    try {
      await onDelete(deleteId);
      onClose();
    } catch (err) {
      setError(typeof err === 'string' ? err : (err?.message || '削除に失敗しました'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <div
        className={`drawer-overlay ${isOpen ? 'open' : ''}`}
        id="drawer-overlay"
        onClick={onClose}
      />
      <div className={`drawer-panel ${isOpen ? 'open' : ''}`} id="drawer-panel">
        <div className="drawer-header">
          <div className="drawer-title">{title}</div>
          <button className="drawer-close" onClick={onClose}>✕</button>
        </div>
        <div className="drawer-body" ref={formRef}>
          {children}
          {error && (
            <div style={{ color: 'var(--color-danger)', fontSize: '0.82rem', marginTop: '0.5rem', padding: '0.5rem', background: '#fef2f2', borderRadius: 'var(--radius-sm)' }}>
              {error}
            </div>
          )}
        </div>
        <div className="drawer-footer">
          {onDelete && (
            <button className="btn btn-danger" onClick={handleDelete} disabled={loading}>
              削除
            </button>
          )}
          <button className="btn btn-secondary" onClick={onClose} disabled={loading}>
            キャンセル
          </button>
          <button className="btn btn-primary" onClick={handleSubmit} disabled={loading}>
            {loading ? '保存中...' : '保存'}
          </button>
        </div>
      </div>
    </>
  );
}
