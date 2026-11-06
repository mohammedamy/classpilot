import { useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { LayoutDashboard, Users, ClipboardList, Sparkles, CheckCheck, Table, Mail, CalendarDays, Settings, Menu, Bot } from 'lucide-react';
import { useStore } from '../store/store.jsx';
import { Avatar, Toasts } from './ui.jsx';
import { hasKey } from '../lib/gemini.js';

export default function Layout() {
  const { db } = useStore();
  const [open, setOpen] = useState(false);
  const loc = useLocation();
  const toGrade = db.submissions.filter((s) => s.status === 'submitted').length;
  const unsynced = Object.keys(db.unsynced || {}).length;

  const nav = [
    { label: 'Overview', items: [{ to: '/', icon: LayoutDashboard, text: 'Today', end: true }] },
    {
      label: 'Teach', items: [
        { to: '/studio', icon: Sparkles, text: 'AI Studio' },
        { to: '/assignments', icon: ClipboardList, text: 'Assignments' },
        { to: '/grading', icon: CheckCheck, text: 'Auto-correct', count: toGrade },
        { to: '/gradebook', icon: Table, text: 'Gradebook', count: unsynced },
      ],
    },
    {
      label: 'Connect', items: [
        { to: '/messages', icon: Mail, text: 'Messages' },
        { to: '/schedule', icon: CalendarDays, text: 'Schedule' },
        { to: '/classes', icon: Users, text: 'Classes & students' },
      ],
    },
  ];

  return (
    <div className="app">
      <aside className={`sidebar ${open ? 'open' : ''}`} onClick={() => setOpen(false)}>
        <div className="brand">
          <img src="/favicon.svg" width="30" height="30" alt="" />
          <div>
            <div className="brand-name">ClassPilot</div>
            <div className="brand-sub">for Classera teachers</div>
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
          <Settings size={18} /> Settings
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
          <button className="btn btn-ghost btn-icon menu-btn" onClick={() => setOpen(true)} aria-label="Open menu"><Menu /></button>
          <div className="grow" />
          <NavLink to="/settings" className={`badge ${hasKey(db.settings) ? 'b-green' : 'b-amber'}`} title="AI status">
            <Bot /> {hasKey(db.settings) ? `Gemini connected` : 'Demo AI — add Gemini key'}
          </NavLink>
        </header>
        <div className="page" key={loc.pathname.split('/')[1] || 'home'}>
          <Outlet />
        </div>
      </div>
      <Toasts />
    </div>
  );
}
