import React, { useState } from 'react';
import { formatDate } from './format.js';
import { isFuture } from './startDate.js';
import { dueToday, planSummary, thenCharge, upgradeCredit, waivedLine } from './priceSummary.js';

const money = pence => '£' + (pence / 100).toFixed(2);

// A running price, shown beside the form (and as a bar at the foot of a phone) and updated as choices are made.
// It shows the last price while a new one is worked out, so the figure never jumps to a blank.
export default function PricePanel({
  quote,
  loading,
  error,
  ready = true,
  emptyText,
  note,
  billing,
  onBilling,
  start,
}) {
  const [open, setOpen] = useState(() => typeof window === 'undefined' || window.innerWidth > 900);
  const then = thenCharge(quote),
    plan = planSummary(quote),
    waived = waivedLine(quote),
    credit = upgradeCredit(quote),
    future = isFuture(start);
  return (
    <aside className="price-panel" aria-label="Your price" aria-live="polite">
      <details open={open} onToggle={e => setOpen(e.currentTarget.open)}>
        <summary>
          <span className="price-title">Price breakdown</span>
          <strong className="price-sum">{quote ? money(dueToday(quote)) : '-'}</strong>
        </summary>
        <div className="price-body">
          {onBilling && (
            <div className="price-toggle" role="group" aria-label="Payment frequency">
              {[
                ['annual', 'Annual'],
                ['monthly', 'Monthly'],
              ].map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  className={billing === id ? 'on' : ''}
                  aria-pressed={billing === id}
                  onClick={() => onBilling(id)}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
          {!ready && !quote ? (
            <p className="muted">{emptyText || 'Choose your options to see your price.'}</p>
          ) : error && !quote ? (
            <p className="price-error" role="alert">
              {error}
            </p>
          ) : !quote ? (
            <p className="muted" role="status">
              Working out your price…
            </p>
          ) : (
            <>
              {waived && (
                <div className="price-rows">
                  <div className="price-row price-waived">
                    <span>
                      <s>{waived.name}</s>
                    </span>
                    <strong>
                      <s>{money(waived.pence)}</s> Waived
                    </strong>
                  </div>
                  <p className="price-then">
                    {waived.label}
                    {waived.indicative ? '. We check your code when you sign in.' : '.'}
                  </p>
                </div>
              )}
              {quote.lines.length > 0 && (
                <div className="price-rows">
                  {quote.lines.map(l => (
                    <div key={l.name} className="price-row">
                      <span>
                        {l.name}
                        {l.quantity > 1 ? ' × ' + l.quantity : ''}
                      </span>
                      <strong>
                        {money(l.totalPence)}
                        {l.interval ? ' / ' + (l.interval === 'month' ? 'mo' : 'yr') : ''}
                      </strong>
                    </div>
                  ))}
                </div>
              )}
              {credit && (
                <div className="price-rows">
                  <div className="price-row price-credit">
                    <span>Credit for the unused part of your Associate membership</span>
                    <strong>-{money(credit.pence)}</strong>
                  </div>
                </div>
              )}
              <div className="price-total">
                <span>Due today</span>
                <strong>{money(dueToday(quote))}</strong>
              </div>
              {loading && (
                <p className="price-updating" role="status">
                  Updating…
                </p>
              )}
              {error && (
                <p className="price-error" role="alert">
                  {error}
                </p>
              )}
              {plan && (
                <p className="price-then">
                  {plan.same
                    ? 'Monthly plan: ' + money(plan.firstPence) + ' a month, renewing automatically.'
                    : 'Monthly plan: your first payment is ' +
                      money(plan.firstPence) +
                      ', which includes your joining fee and extras in full. Every payment after that is ' +
                      money(plan.laterPence) +
                      ' a month, renewing automatically.'}
                  {' It includes a monthly admin fee of ' + money(plan.adminPence) + '.'}
                </p>
              )}
              {then && (
                <p className="price-then">
                  Then {money(then.pence)} each {then.interval}
                  {then.yearly ? ', equivalent to ' + money(then.yearly) + ' a year' : ''}, renewing automatically until
                  you cancel.
                </p>
              )}
              {future && (
                <p className="price-then">Starts on {formatDate(start)}. It shows as Coming soon until then.</p>
              )}
              {credit && (
                <p className="price-then">
                  The credit is the part of your Associate membership fee you have not used, worked out to your new
                  start date. Your Associate membership carries on until your new membership starts.
                </p>
              )}
              {note && <p className="price-then">{note}</p>}
              <p className="price-vat">Prices include VAT and Insurance Premium Tax where they apply.</p>
            </>
          )}
        </div>
      </details>
    </aside>
  );
}
