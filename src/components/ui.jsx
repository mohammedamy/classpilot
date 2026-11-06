import { useEffect } from 'react';
import { CircleCheck, CircleAlert, X, LoaderCircle } from 'lucide-react';
import { colorFor, initials } from '../lib/utils.js';
import { useStore } from '../store/store.jsx';
import { t, useLang } from '../i18n/index.js';

export function Avatar({ name, size }) {
  return <span className={`avatar ${size === 'sm' ? 'avatar-sm' : ''}`} style={{ background: colorFor(name) }} aria-hidden>{initials(name)}</span>;
}

export function Modal({ title, onClose, children, footer, wide }) {
  useLang();
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
          <button className="btn btn-ghost btn-icon btn-sm" onClick={onClose} aria-label={t('Close')}><X /></button>
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
  useLang();
  if (!sub) return <span className="badge">{t('Not assigned')}</span>;
  if (sub.status === 'graded') return <span className="badge b-green">{sub.reviewed ? t('Graded') : t('Graded · AI')}</span>;
  if (sub.status === 'submitted') return <span className={`badge ${sub.late ? 'b-amber' : 'b-blue'}`}>{sub.late ? t('Late · to grade') : t('To grade')}</span>;
  const overdue = dueDate && new Date(dueDate) < Date.now();
  return <span className={`badge ${overdue ? 'b-red' : ''}`}>{overdue ? t('Missing') : t('Not submitted')}</span>;
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
