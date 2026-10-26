import React, { useEffect, useMemo, useState } from 'react';
import { ChevronDown, Search, X } from 'lucide-react';
import { groupCourses } from '../courseGroups.js';

// GTi courses grouped by category in collapsible sections, with an optional search, so a long
// catalogue takes a few lines instead of a wall of cards.
const money = v =>
  v === null || v === undefined || v === '' || Number.isNaN(Number(v))
    ? null
    : '£' + Number(v).toFixed(2).replace(/\.00$/, '');
// The course record's own requirements, shown without leaving the application.
function CourseDetails({ course, selected, onToggle, onClose }) {
  useEffect(() => {
    const key = e => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', key);
    return () => document.removeEventListener('keydown', key);
  }, [onClose]);
  const facts = [
    ['Minimum practical teaching time', course.duration],
    ['CPD hours', course.cpdPoints != null && course.cpdPoints !== '' ? course.cpdPoints : null],
    ['Minimum course fee for Guild members', money(course.memberPrice)],
    ['Minimum course fee for non-members', money(course.nonMemberPrice)],
    ['Treatment group', course.treatmentGroup],
  ].filter(([, v]) => v);
  const isSelected = selected.includes(String(course.id));
  return (
    <div className="course-modal-backdrop" onClick={onClose}>
      <div
        className="course-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="course-modal-title"
        onClick={e => e.stopPropagation()}
      >
        <button type="button" className="course-modal-close" aria-label="Close" onClick={onClose} autoFocus>
          <X size={18} />
        </button>
        <h3 id="course-modal-title">{course.name}</h3>
        <dl className="course-facts">
          {facts.map(([k, v]) => (
            <div key={k}>
              <dt>{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
        <h4>Entry requirements</h4>
        <p className="course-requirements">
          {course.entryRequirements || 'No specific requirements are listed for this course.'}
        </p>
        <div className="course-modal-actions">
          {onToggle && (
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                onToggle(String(course.id));
                onClose();
              }}
            >
              {isSelected ? 'Remove this course' : 'Select this course'}
            </button>
          )}
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
export default function CourseGroups({
  courses,
  searchable = false,
  emptyText = 'No courses to show.',
  groupBy = 'category',
  selectable = false,
  selected = [],
  onToggle,
}) {
  const [query, setQuery] = useState(''),
    [open, setOpen] = useState({}),
    [detail, setDetail] = useState(null);
  const groups = useMemo(() => groupCourses(courses, query, groupBy), [courses, query, groupBy]);
  const total = groups.reduce((n, g) => n + g.items.length, 0);
  return (
    <div className="course-groups">
      {searchable && (
        <label className="course-search">
          <Search size={16} aria-hidden="true" />
          <span className="visually-hidden">Search courses</span>
          <input
            type="search"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search courses"
            autoComplete="off"
          />
        </label>
      )}
      {total === 0 ? (
        <p className="course-empty">{query ? 'No courses match your search.' : emptyText}</p>
      ) : (
        groups.map(g => (
          <details
            key={g.category}
            className="course-group"
            open={Boolean(query) || Boolean(open[g.category])}
            onToggle={e => {
              const isOpen = e.currentTarget.open;
              setOpen(o => (o[g.category] === isOpen ? o : { ...o, [g.category]: isOpen }));
            }}
          >
            <summary>
              <span className="course-group-name">{g.category}</span>
              <span className="course-group-count">
                {selectable
                  ? g.items.filter(c => selected.includes(String(c.id))).length + ' of ' + g.items.length
                  : g.items.length}
              </span>
              <ChevronDown size={18} aria-hidden="true" />
            </summary>
            <ul className="course-group-list">
              {g.items.map((c, i) => (
                <li key={c.id || c.name + i}>
                  {selectable ? (
                    <label className="course-check">
                      <input
                        type="checkbox"
                        checked={selected.includes(String(c.id))}
                        onChange={() => onToggle(String(c.id))}
                      />
                      <span className="course-name">{c.name}</span>
                    </label>
                  ) : (
                    <span className="course-name">{c.name}</span>
                  )}
                  <span className="course-meta">
                    {[
                      groupBy === 'category' ? c.treatmentGroup : c.category,
                      c.duration,
                      c.cpdPoints != null && c.cpdPoints !== '' ? c.cpdPoints + ' CPD' : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                  {selectable && (
                    <button type="button" className="text-button course-view" onClick={() => setDetail(c)}>
                      View course requirements
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </details>
        ))
      )}
      {detail && (
        <CourseDetails
          course={detail}
          selected={selected}
          onToggle={selectable ? onToggle : null}
          onClose={() => setDetail(null)}
        />
      )}
    </div>
  );
}
