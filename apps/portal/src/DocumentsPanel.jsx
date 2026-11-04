import React, { useEffect, useState } from 'react';
import { FileText, Folder } from 'lucide-react';
import { portalApi, INTEGRATIONS } from './services/api.js';
import { Notice } from './UiParts.jsx';
import { timeAgo } from './timeAgo.js';

// The folder browser for one record's WorkDrive folder. `stack` holds the folders opened so far, for the breadcrumb.
export function DocumentsPanel({ kind, id }) {
  const [stack, setStack] = useState([]),
    [data, setData] = useState({ loading: true, items: [], error: '', message: '', empty: false });
  const value = stack.map(f => f.id).join('.');
  useEffect(() => {
    if (!INTEGRATIONS.workdrive) return;
    let active = true;
    setData({ loading: true, items: [], error: '', message: '', empty: false });
    portalApi
      .getDocuments(kind, id, value)
      .then(
        x =>
          active &&
          setData({
            loading: false,
            items: x.items || [],
            error: '',
            message: x.message || '',
            empty: Boolean(x.empty),
          }),
      )
      .catch(e => active && setData({ loading: false, items: [], error: e.message, message: '', empty: false }));
    return () => {
      active = false;
    };
  }, [kind, id, value]);
  if (!INTEGRATIONS.workdrive)
    return (
      <Notice title="Documents coming soon">You will be able to view and download your documents here soon.</Notice>
    );
  return (
    <section className="surface padded">
      <h2>Documents</h2>
      <nav className="doc-crumbs" aria-label="Folder">
        <button type="button" className="text-link" onClick={() => setStack([])}>
          Documents
        </button>
        {stack.map((f, i) => (
          <span key={f.id}>
            {' / '}
            <button type="button" className="text-link" onClick={() => setStack(s => s.slice(0, i + 1))}>
              {f.name}
            </button>
          </span>
        ))}
      </nav>
      {data.loading ? (
        <p role="status">Loading documents…</p>
      ) : data.error ? (
        <Notice title="Documents unavailable">{data.error}</Notice>
      ) : data.items.length ? (
        <div className="doc-grid">
          {data.items.map(x => {
            const modified = timeAgo(x.modifiedTimeMs) || x.modifiedAt || '';
            const body = (
              <>
                {x.isFolder ? <Folder size={28} aria-hidden="true" /> : <FileText size={28} aria-hidden="true" />}
                <strong>{x.name}</strong>
                {modified && <span>Modified {modified}</span>}
              </>
            );
            return x.isFolder ? (
              <button
                type="button"
                className="doc-card"
                key={x.id}
                onClick={() => setStack(s => [...s, { id: x.id, name: x.name }])}
              >
                {body}
              </button>
            ) : (
              <div className="doc-card" key={x.id}>
                {body}
                <span className="doc-actions">
                  <a
                    className="text-link"
                    href={portalApi.getDocumentDownloadUrl(kind, id, x.id, value, true)}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Open
                  </a>
                  <a className="text-link" href={portalApi.getDocumentDownloadUrl(kind, id, x.id, value)}>
                    Download
                  </a>
                </span>
              </div>
            );
          })}
        </div>
      ) : data.empty ? (
        <p>This folder is empty. Nothing has been uploaded here yet.</p>
      ) : (
        <p>{data.message || 'There is no documents folder linked yet.'}</p>
      )}
    </section>
  );
}
