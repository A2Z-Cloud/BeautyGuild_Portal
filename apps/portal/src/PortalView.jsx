import React, { useEffect, useState } from 'react';
import { LegalLinks } from './LegalLinks.jsx';
import { Link, NavLink, useLocation } from 'react-router-dom';
import {
  Award,
  Bookmark,
  BookOpen,
  FileText,
  Receipt,
  Building2,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  ClipboardList,
  GraduationCap,
  House,
  Menu,
  ShieldCheck,
  UserRound,
  LogIn,
  X,
} from 'lucide-react';
import { DEMO_USER } from './data/demo.js';
import { Logo, PreviewLabel } from './UiParts.jsx';
import { DATA_MODE, INTEGRATIONS, portalApi } from './services/api.js';

// Shows the signed-in member in the top bar. The check runs once per page load and any failure
// (not signed in, SDK unavailable) simply leaves the "Sign in" link showing.
function useSignedInUser() {
  const [user, setUser] = useState(null);
  useEffect(() => {
    if (!INTEGRATIONS.catalystAuth) return undefined;
    let active = true;
    portalApi
      .getIdentity()
      .then(u => {
        if (active) setUser(u);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);
  return user;
}
function initialsOf(user) {
  const letters = [user.firstName, user.lastName]
    .filter(Boolean)
    .map(s => s[0])
    .join('');
  return (letters || String(user.email || '?')[0]).toUpperCase();
}

const sections = [
  { label: 'Dashboard', path: '/', icon: House, end: true },
  { label: 'Membership', path: '/membership', icon: Award },
  { label: 'Insurance', path: '/insurance', icon: ShieldCheck },
  { label: 'Accreditation', path: '/accreditation', icon: GraduationCap },
  { label: 'My records', path: '/records', icon: ClipboardList },
  { label: 'Saved applications', path: '/drafts', icon: Bookmark, when: () => INTEGRATIONS.crmDrafts },
  { label: 'My schools', path: '/schools', icon: Building2, when: () => INTEGRATIONS.schoolServices },
];
const secondary = [
  { label: 'GTi Courses', path: '/gti-courses', icon: BookOpen },
  { label: 'My Account', path: '/account', icon: UserRound },
  { label: 'My Invoices', path: '/invoices', icon: Receipt, when: () => INTEGRATIONS.schoolServices },
  {
    label: 'My Documents',
    path: '/documents',
    icon: FileText,
    when: () => INTEGRATIONS.workdrive && INTEGRATIONS.crmRecords,
  },
  { label: 'Help', path: '/help', icon: CircleHelp },
];
function NavItems({ items, onNavigate, collapsed }) {
  return (
    <div className="nav-group">
      {items
        .filter(i => !i.when || i.when())
        .map(({ label, path, icon: Icon, end }) => (
          <NavLink
            onClick={onNavigate}
            key={path}
            to={path}
            end={Boolean(end)}
            title={collapsed ? label : undefined}
            className={({ isActive }) => 'nav-item' + (isActive ? ' active' : '')}
          >
            <Icon size={20} aria-hidden="true" />
            <span>{label}</span>
          </NavLink>
        ))}
    </div>
  );
}
function currentTitle(path) {
  if (path === '/') return 'Dashboard';
  const key = path.split('/').filter(Boolean)[0];
  return (
    {
      membership: 'Membership',
      insurance: 'Insurance',
      accreditation: 'Accreditation',
      records: 'My records',
      schools: 'My schools',
      invoices: 'My invoices',
      documents: 'My documents',
      'gti-courses': 'GTi Courses',
      account: 'Account',
      login: 'Sign in',
      signup: 'Sign up',
      'forgot-password': 'Password reset',
      help: 'Help',
    }[key] || 'Beauty Guild'
  );
}
export default function PortalView({ children }) {
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return window.localStorage.getItem('bg-preview-sidebar') === 'collapsed';
    } catch {
      return false;
    }
  });
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();
  const signedIn = useSignedInUser();
  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname, location.search]);
  const toggle = () =>
    setCollapsed(old => {
      try {
        window.localStorage.setItem('bg-preview-sidebar', old ? 'expanded' : 'collapsed');
      } catch {}
      return !old;
    });
  return (
    <div className={'portal-shell' + (collapsed ? ' compact' : '')}>
      {mobileOpen && (
        <button
          className="mobile-scrim"
          aria-label="Close navigation"
          type="button"
          onClick={() => setMobileOpen(false)}
        />
      )}
      <aside
        id="portal-navigation"
        className={'sidebar' + (mobileOpen ? ' mobile-open' : '')}
        aria-label="Main navigation"
      >
        <div className="sidebar-brand">
          <Link to="/" className="brand-link" onClick={() => setMobileOpen(false)} aria-label="Beauty Guild dashboard">
            <Logo />
          </Link>
          <button
            className="icon-button nav-collapse"
            type="button"
            title={collapsed ? 'Expand navigation' : 'Collapse navigation'}
            aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'}
            onClick={toggle}
          >
            {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
          </button>
          <button
            className="icon-button mobile-close"
            type="button"
            aria-label="Close navigation"
            onClick={() => setMobileOpen(false)}
          >
            <X size={20} />
          </button>
        </div>
        <div className="nav-content">
          <div className="nav-caption">YOUR GUILD</div>
          <NavItems items={sections} onNavigate={() => setMobileOpen(false)} collapsed={collapsed} />
          <div className="nav-divider" />
          <div className="nav-caption">RESOURCES</div>
          <NavItems items={secondary} onNavigate={() => setMobileOpen(false)} collapsed={collapsed} />
        </div>
        <div className="sidebar-footer">
          <div className="sidebar-avatar">BG</div>
          <div>
            <strong>Beauty Guild</strong>
            <span>Member portal</span>
          </div>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <div className="topbar-left">
            <button
              className="icon-button mobile-menu"
              type="button"
              onClick={() => setMobileOpen(true)}
              aria-label="Open navigation"
              aria-expanded={mobileOpen}
              aria-controls="portal-navigation"
            >
              <Menu size={22} />
            </button>
            <div className="breadcrumb">
              <Link to="/">Portal</Link>
              <ChevronRight size={15} />
              <strong>{currentTitle(location.pathname)}</strong>
            </div>
          </div>
          <div className="topbar-right">
            {DATA_MODE === 'demo' && <PreviewLabel />}
            {signedIn ? (
              <Link className="header-user" to="/account">
                <span className="topbar-avatar" aria-hidden="true">
                  {initialsOf(signedIn)}
                </span>
                <div className="user-label">
                  <strong>{[signedIn.firstName, signedIn.lastName].filter(Boolean).join(' ') || signedIn.email}</strong>
                  <span>My account</span>
                </div>
              </Link>
            ) : (
              <Link className="header-login" to="/login">
                <LogIn size={15} /> Sign in
              </Link>
            )}
            {DATA_MODE === 'demo' && (
              <>
                <span className="topbar-avatar" aria-label="Sample user">
                  {DEMO_USER.initials}
                </span>
                <div className="user-label">
                  <strong>{DEMO_USER.name}</strong>
                  <span>Sample account</span>
                </div>
              </>
            )}
          </div>
        </header>
        <main id="main-content">{children}</main>
        <footer className="page-footer">
          <span>Beauty Guild member portal</span>
          <LegalLinks />
          <span>{DATA_MODE === 'demo' ? 'Sample information only' : null}</span>
        </footer>
      </div>
    </div>
  );
}
