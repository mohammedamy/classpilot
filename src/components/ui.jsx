import { useEffect } from 'react';
import { CircleCheck, CircleAlert, X, LoaderCircle } from 'lucide-react';
import { colorFor, initials } from '../lib/utils.js';
import { useStore } from '../store/store.jsx';

export function Avatar({ name, size }) {
  return <span className={`avatar ${size === 'sm' ? 'avatar-sm' : ''}`} style={{ background: colorFor(name) }} aria-hidden>{initials(name)}</span>;
}

export function Modal({ title, onClose, children, footer, wide }) {
  useEffect(() => {
    const k = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="btn btn-ghost btn-icon btn-sm" onClick={onClose} aria-label="Close"><X /></button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

export function Toasts() {
  const { toasts } = useStore();
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.kind}`}>
          {t.kind === 'error' ? <CircleAlert /> : <CircleCheck />}
          <span>{t.msg}</span>
        </div>
      ))}
    </div>
  );
}

export function Empty({ icon: Icon, title, children }) {
  return (
    <div className="empty">
      {Icon && <Icon />}
      <h3>{title}</h3>
      <div className="small">{children}</div>
    </div>
  );
}

export function Spinner({ size = 16 }) {
  return <LoaderCircle className="spin" style={{ width: size, height: size }} />;
}

export function StatusBadge({ sub, dueDate }) {
  if (!sub) return <span className="badge">Not assigned</span>;
  if (sub.status === 'graded') return <span className="badge b-green">Graded{sub.reviewed ? '' : ' · AI'}</span>;
  if (sub.status === 'submitted') return <span className={`badge ${sub.late ? 'b-amber' : 'b-blue'}`}>{sub.late ? 'Late · to grade' : 'To grade'}</span>;
  const overdue = dueDate && new Date(dueDate) < Date.now();
  return <span className={`badge ${overdue ? 'b-red' : ''}`}>{overdue ? 'Missing' : 'Not submitted'}</span>;
}

export function ClassDot({ cls }) {
  return <span className="dot" style={{ background: cls?.color || 'var(--ink-300)' }} />;
}

export function Progress({ value, color }) {
  return <div className="bar"><span style={{ width: `${Math.max(0, Math.min(100, value))}%`, background: color }} /></div>;
}

export function Field({ label, help, children, htmlFor }) {
  return (
    <div className="field">
      {label && <label htmlFor={htmlFor}>{label}</label>}
      {children}
      {help && <span className="help">{help}</span>}
    </div>
  );
}
