import { useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { LayoutDashboard, Users, ClipboardList, Sparkles, CheckCheck, Table, Mail, CalendarDays, Settings, Menu, Bot, Globe, Cloud, CloudOff, LogOut } from 'lucide-react';
import { useStore } from '../store/store.jsx';
import { Avatar, Toasts } from './ui.jsx';
import { hasKey } from '../lib/gemini.js';
import { isFirebaseEnabled, signOutUser } from '../lib/firebase.js';
import { t, toggleLang, useLang } from '../i18n/index.js';

export default function Layout() {
  const { db, user, syncState } = useStore();
  const lang = useLang();
  const [open, setOpen] = useState(false);
  const loc = useLocation();
  const toGrade = db.submissions.filter((s) => s.status === 'submitted').length;
  const unsynced = Object.keys(db.unsynced || {}).length;

  const nav = [
    { label: t('Overview'), items: [{ to: '/', icon: LayoutDashboard, text: t('Today'), end: true }] },
    {
      label: t('Teach'), items: [
        { to: '/studio', icon: Sparkles, text: t('AI Studio') },
        { to: '/assignments', icon: ClipboardList, text: t('Assignments') },
        { to: '/grading', icon: CheckCheck, text: t('Auto-correct'), count: toGrade },
        { to: '/gradebook', icon: Table, text: t('Gradebook'), count: unsynced },
      ],
    },
    {
      label: t('Connect'), items: [
        { to: '/messages', icon: Mail, text: t('Messages') },
        { to: '/schedule', icon: CalendarDays, text: t('Schedule') },
        { to: '/classes', icon: Users, text: t('Classes & students') },
      ],
    },
  ];

  return (
    <div className="app">
      <aside className={`sidebar ${open ? 'open' : ''}`} onClick={() => setOpen(false)}>
        <div className="brand">
          <img src={`${import.meta.env.BASE_URL}favicon.svg`} width="30" height="30" alt="" />
          <div>
            <div className="brand-name">ClassPilot</div>
            <div className="brand-sub">{t('for Classera teachers')}</div>
          </div>
        </div>
        {nav.map((g) => (
          <div key={g.label}>
            <div className="nav-label">{g.label}</div>
            {g.items.map((it) => (
              <NavLink key={it.to} to={it.to} end={it.end} className="nav-link" id={`nav-${it.to.replace('/', '') || 'today'}`}>
                <it.icon size={18} />
                {it.text}
                {it.count > 0 && <span className="count">{it.count}</span>}
              </NavLink>
            ))}
          </div>
        ))}
        <NavLink to="/settings" className="nav-link" id="nav-settings" style={{ marginTop: 8 }}>
          <Settings size={18} /> {t('Settings')}
        </NavLink>
        <div className="sidebar-foot">
          <Avatar name={db.settings.teacherName} />
          <div className="grow">
            <div className="who truncate">{db.settings.teacherName}</div>
            <div className="school truncate">{db.settings.school}</div>
          </div>
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <button className="btn btn-ghost btn-icon menu-btn" onClick={() => setOpen(true)} aria-label={t('Open menu')}><Menu /></button>
          <div className="grow" />
          <button type="button" className="lang-switch" id="lang-toggle" onClick={toggleLang} title={t('Switch language')}>
            <Globe /> {lang === 'ar' ? 'English' : 'العربية'}
          </button>
          {isFirebaseEnabled && (
            <NavLink to="/settings" className={`badge ${syncState === 'error' ? 'b-red' : syncState === 'synced' ? 'b-green' : 'b-blue'}`} title={t('Cloud sync')}>
              {syncState === 'error' ? <CloudOff /> : <Cloud />}
              {syncState === 'synced' ? t('Cloud synced') : syncState === 'error' ? t('Sync error') : t('Syncing…')}
            </NavLink>
          )}
          <NavLink to="/settings" className={`badge ${hasKey(db.settings) ? 'b-green' : 'b-amber'}`} title={t('AI status')}>
            <Bot /> {hasKey(db.settings) ? t('Gemini connected') : t('Demo AI — add Gemini key')}
          </NavLink>
          {isFirebaseEnabled && user && (
            <div className="row" style={{ gap: 6 }}>
              {user.photoURL ? (
                <img src={user.photoURL} width="28" height="28" alt="" style={{ borderRadius: '50%' }} referrerPolicy="no-referrer" />
              ) : (
                <Avatar name={user.displayName || user.email || 'T'} size="sm" />
              )}
              <button type="button" className="btn btn-ghost btn-sm btn-icon" onClick={signOutUser} title={t('Sign out')} aria-label={t('Sign out')}>
                <LogOut size={15} />
              </button>
            </div>
          )}
        </header>
        <div className="page" key={loc.pathname.split('/')[1] || 'home'}>
          <Outlet />
        </div>
      </div>
      <Toasts />
    </div>
  );
}
