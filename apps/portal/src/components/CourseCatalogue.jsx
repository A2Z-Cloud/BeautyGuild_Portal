import React, { useEffect, useState } from 'react';
import { BookOpen } from 'lucide-react';
import { portalApi, INTEGRATIONS } from '../services/api.js';
import CourseGroups from './CourseGroups.jsx';

export function CourseCatalogue({ searchable = false, title = 'GTi course catalogue' }) {
  const [state, setState] = useState({ loading: true, items: [], error: '' });
  useEffect(() => {
    if (!INTEGRATIONS.courses) return;
    let active = true;
    portalApi
      .listCourses()
      .then(items => {
        if (active) setState({ loading: false, items, error: '' });
      })
      .catch(err => {
        if (active) setState({ loading: false, items: [], error: err.message });
      });
    return () => {
      active = false;
    };
  }, []);
  if (!INTEGRATIONS.courses) return null;
  return (
    <section className="surface padded live-courses">
      <div className="subheading">
        <BookOpen size={23} />
        <h2>{title}</h2>
      </div>
      <p>Current GTi courses, grouped by subject. Open a group to see its courses.</p>
      {state.loading && <p role="status">Retrieving course catalogue…</p>}
      {state.error && (
        <div className="notice" role="alert">
          <strong>Course service unavailable</strong>
          <span>{state.error}</span>
        </div>
      )}
      {!state.loading && !state.error && (
        <CourseGroups courses={state.items} searchable={searchable} emptyText="No active GTi courses were returned." />
      )}
    </section>
  );
}
