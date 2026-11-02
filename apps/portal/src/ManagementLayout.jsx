import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { PageHeading } from './UiParts.jsx';

// The shell shared by school management and membership management: a back link, a heading, grouped navigation on the left
// (chips on a phone) and one panel on the right. One component, so the two pages cannot drift apart.
//
// groups: [{ label, items: [{ key, label, icon, to? }] }]. An item with `to` is an action that leaves the page and is never active;
// every other item opens a section at hrefFor(key). `notice` stands in for the navigation and panel while loading or on an error.
export default function ManagementLayout({
  back,
  eyebrow,
  title,
  description,
  navLabel,
  groups,
  active,
  hrefFor,
  notice,
  children,
}) {
  return (
    <div className="page">
      <Link to={back.to} className="back-link">
        <ArrowLeft size={16} /> {back.label}
      </Link>
      <PageHeading eyebrow={eyebrow} title={title} description={description} />
      {notice || (
        <div className="school-layout">
          <nav aria-label={navLabel} className="school-nav">
            {groups.map(g => (
              <div className="school-nav-group" key={g.label}>
                <span className="school-nav-label">{g.label}</span>
                <div className="school-nav-links">
                  {g.items.map(({ key, label, icon: Icon, to }) => {
                    const current = !to && key === active;
                    return (
                      <Link
                        key={key}
                        className={current ? 'active' : ''}
                        aria-current={current ? 'page' : undefined}
                        to={to || hrefFor(key)}
                      >
                        {Icon && <Icon size={16} aria-hidden="true" />}
                        {label}
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
          </nav>
          <section className="surface padded school-workspace-panel">{children}</section>
        </div>
      )}
    </div>
  );
}
