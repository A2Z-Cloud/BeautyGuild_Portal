import React, { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, LockKeyhole } from 'lucide-react';
import { Notice, PageHeading } from './UiParts.jsx';
import { Blocks, InsField } from './InsuranceFields.jsx';
import { INTEGRATIONS, portalApi } from './services/api.js';
import { INSURANCE_STEPS, GUILD_PHONE, demandsAndNeeds, gbp } from './insuranceInputs.js';
import { formatDate } from './format.js';
import {
  MAX_CHANGES,
  dateRange,
  declarationsDone,
  eligibility,
  emptyChange,
  needsTreatmentAnswers,
  options as optionsFor,
  problems,
  toBody,
} from './insuranceChangeForm.js';

const money = pence => '£' + (pence / 100).toFixed(2);
const FIELDS = INSURANCE_STEPS.flatMap(s => s.fields);
const field = name => FIELDS.find(f => f.name === name);
const stepNamed = id => INSURANCE_STEPS.find(s => s.id === id);
const NEW_PERSON = { type: 'employee', firstName: '', lastName: '' };

// One change from one start date: who to add or replace, treatments, teaching, equipment and Employers' Liability.
export function ChangeCard({ index, change, onChange, onRemove, cover, range, opts }) {
  const set = patch => onChange({ ...change, ...patch });
  const setPerson = (i, patch) =>
    set({ addPeople: change.addPeople.map((p, j) => (j === i ? { ...p, ...patch } : p)) });
  const tierOptions = tiers =>
    tiers.map(t => ({
      value: String(t),
      label: typeof t === 'number' && t >= 1000 ? 'Up to ' + gbp(t) : 'Up to ' + t,
    }));
  return (
    <fieldset className="surface padded ins-change">
      <legend>{index === 0 ? 'Your change' : 'Another change, from a different date'}</legend>
      <label className="addon-row">
        <span>Start date</span>
        <input
          type="date"
          min={range.min}
          max={range.max}
          value={change.effectiveDate}
          onChange={e => set({ effectiveDate: e.target.value })}
        />
      </label>
      <p className="muted">
        Cover can start from today up to 30 days ahead, and never after your policy ends on{' '}
        {formatDate(cover.insurance.endDate)}.
      </p>

      <h3>People</h3>
      {opts.people.length > 0 && (
        <div className="ins-list">
          {opts.people.map(p => (
            <label key={p.id} className="check-choice">
              <input
                type="checkbox"
                checked={change.removePeople.includes(p.id)}
                onChange={e =>
                  set({
                    removePeople: e.target.checked
                      ? [...change.removePeople, p.id]
                      : change.removePeople.filter(x => x !== p.id),
                  })
                }
              />
              <span>
                Replace {p.name} ({p.type === 'subcontractor' ? 'subcontractor' : 'employee'})
              </span>
            </label>
          ))}
          <p className="muted">
            Choose who you are replacing, then add the new person below. Taking someone off without replacing them is
            done by the office.
          </p>
        </div>
      )}
      {change.addPeople.map((p, i) => (
        <div key={i} className="ins-person-row">
          <select
            aria-label="Employee or subcontractor"
            value={p.type}
            onChange={e => setPerson(i, { type: e.target.value })}
          >
            <option value="employee">Employee</option>
            <option value="subcontractor">Subcontractor</option>
          </select>
          <input
            aria-label="First name"
            placeholder="First name"
            value={p.firstName}
            onChange={e => setPerson(i, { firstName: e.target.value })}
          />
          <input
            aria-label="Surname"
            placeholder="Surname"
            value={p.lastName}
            onChange={e => setPerson(i, { lastName: e.target.value })}
          />
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => set({ addPeople: change.addPeople.filter((_, j) => j !== i) })}
          >
            Remove
          </button>
        </div>
      ))}
      <button
        type="button"
        className="btn btn-secondary"
        onClick={() => set({ addPeople: [...change.addPeople, { ...NEW_PERSON }] })}
      >
        Add a person
      </button>
      <p className="muted">
        Your policy covers up to four people in total. Please note that your policy will provide treatment, product and
        public liability for all employees you list. Anyone you list as a subcontractor, for example someone renting a
        space in your salon and trading in their own name, is not covered for their own treatment, public and product
        liability and must obtain their own cover.
      </p>

      {opts.treatments.length > 0 && (
        <InsField
          field={{
            name: 'treatments',
            label: 'Add an advanced treatment',
            type: 'multi',
            list: true,
            options: opts.treatments,
          }}
          value={change.treatments}
          onChange={(_, value) => set({ treatments: value })}
        />
      )}
      {opts.teaching.length > 0 && (
        <InsField
          field={{
            name: 'teaching',
            label: 'Teaching cover',
            type: 'radio',
            options: [{ value: '', label: 'No change' }, ...opts.teaching],
          }}
          value={change.teaching}
          onChange={(_, value) => set({ teaching: value })}
        />
      )}
      <h3>Business equipment</h3>
      {opts.equipment.tiers.length > 0 ? (
        <InsField
          field={{
            name: 'equipmentTier',
            label: 'Current cover up to ' + gbp(opts.equipment.current) + '. Raise it to',
            type: 'select',
            options: tierOptions(opts.equipment.tiers),
          }}
          value={change.equipmentTier ? String(change.equipmentTier) : ''}
          onChange={(_, value) => set({ equipmentTier: Number(value) || 0 })}
        />
      ) : (
        <p className="muted">{opts.equipment.office || 'You already have the highest level.'}</p>
      )}
      <h3>Employers' Liability</h3>
      {opts.employersLiability.tiers.length > 0 ? (
        <InsField
          field={{
            name: 'elTier',
            label: 'Add Employers Liability cover for',
            type: 'select',
            options: tierOptions(opts.employersLiability.tiers),
          }}
          value={change.elTier ? String(change.elTier) : ''}
          onChange={(_, value) => set({ elTier: Number(value) || 0 })}
        />
      ) : (
        <p className="muted">{opts.employersLiability.office}</p>
      )}
      {onRemove && (
        <button type="button" className="btn btn-secondary" onClick={onRemove}>
          Take this change out
        </button>
      )}
    </fieldset>
  );
}

// The repeated declarations, the treatment questions where they apply, and the four confirmations: the same wording as when the member
// joined, because the Guild repeats them for every change.
export function Declarations({ answers, setAnswer, needsTreatments, demands }) {
  const step = stepNamed('declarations');
  const demandsStep = stepNamed('demands');
  const names = [...step.fields.map(f => f.name)];
  return (
    <section className="surface padded">
      <h2>Declarations</h2>
      <Blocks blocks={step.intro} />
      {needsTreatments && (
        <>
          <InsField
            field={field('insQualifiedForTreatments')}
            value={answers.insQualifiedForTreatments}
            onChange={setAnswer}
            values={answers}
          />
          <InsField
            field={field('insPatchTesting')}
            value={answers.insPatchTesting}
            onChange={setAnswer}
            values={answers}
          />
        </>
      )}
      {names.map(n => (
        <InsField key={n} field={field(n)} value={answers[n]} onChange={setAnswer} values={answers} />
      ))}
      <h2>{demandsStep.title}</h2>
      <p>{demands.intro}</p>
      <ul>
        {demands.items.map(i => (
          <li key={i}>{i}</li>
        ))}
      </ul>
      {demandsStep.fields.map(f => (
        <InsField key={f.name} field={f} value={answers[f.name]} onChange={setAnswer} values={answers} />
      ))}
    </section>
  );
}

// The price, line by line, per start date, or why it cannot be paid for online.
export function Review({ quote, saved, state, onPay, onSave }) {
  const blocked = quote.blocked;
  return (
    <section className="surface padded">
      <h2>Review your changes</h2>
      {(quote.revisions || []).map(r => (
        <p key={r.effectiveDate} className="muted">
          From {formatDate(r.effectiveDate)}:{' '}
          {r.term ? r.term.days + ' of ' + r.term.total + ' days of your policy left.' : ''}
        </p>
      ))}
      {blocked ? (
        <Notice title="This needs the Insurance team">
          {blocked.reasons.map(x => (
            <p key={x}>{x}</p>
          ))}
          <p>
            Your current cover has not changed. Save your request and we will pick it up with you, so you do not have to
            start again.
          </p>
        </Notice>
      ) : (
        <>
          <div className="checkout-summary">
            {quote.lines.map(l => (
              <div key={l.name}>
                <span>{l.name + (l.quantity > 1 ? ' × ' + l.quantity : '')}</span>
                <strong>{money(l.totalPence)}</strong>
              </div>
            ))}
            <div className="checkout-total">
              <span>Amount to pay</span>
              <strong>{money(quote.totalPence)}</strong>
            </div>
          </div>
          <p className="muted">
            Prices include Insurance Premium Tax and VAT where they apply. Your cover changes on the start date once
            your payment is confirmed.
          </p>
        </>
      )}
      {saved && (
        <Notice title="Request saved">
          We have saved your request (reference {saved.quoteId}). The Insurance team will be in touch; you can also call
          us on {GUILD_PHONE}.
        </Notice>
      )}
      {state.error && <Notice title="We could not continue">{state.error}</Notice>}
      {!blocked && quote.payable && !saved && (
        <button type="button" className="btn btn-primary btn-block" disabled={state.busy} onClick={onPay}>
          <LockKeyhole size={16} />
          {state.busy ? 'Opening secure payment…' : 'Pay securely with Stripe'}
        </button>
      )}
      {!blocked && !quote.payable && !saved && (
        <Notice title="Online payment is not available yet">
          You can save your request and we will complete it with you, or call us on {GUILD_PHONE}.
        </Notice>
      )}
      {!saved && (blocked || !quote.payable) && (
        <button type="button" className="btn btn-primary btn-block" disabled={state.busy} onClick={onSave}>
          {state.busy ? 'Saving…' : 'Save my request for the office'}
        </button>
      )}
    </section>
  );
}

export default function InsuranceChange() {
  const { id } = useParams();
  const [cover, setCover] = useState({ loading: true, error: '', value: null });
  const [step, setStep] = useState('choose');
  const [changes, setChanges] = useState([]);
  const [answers, setAnswers] = useState({});
  const [quote, setQuote] = useState(null);
  const [saved, setSaved] = useState(null);
  const [state, setState] = useState({ busy: false, error: '' });
  const [fix, setFix] = useState([]);

  useEffect(() => {
    let alive = true;
    if (!INTEGRATIONS.insuranceChanges) return undefined;
    portalApi
      .getMembershipCover(id)
      .then(value => {
        if (!alive) return;
        setCover({ loading: false, error: '', value });
        setChanges([emptyChange(dateRange(value).min)]);
      })
      .catch(e => alive && setCover({ loading: false, error: e.message, value: null }));
    return () => {
      alive = false;
    };
  }, [id]);

  const value = cover.value;
  const can = value ? eligibility(value) : null;
  const opts = useMemo(() => (value && value.insurance ? optionsFor(value) : null), [value]);
  const range = value ? dateRange(value) : null;
  const body = () => toBody(id, changes, answers);
  const needsTreatments = needsTreatmentAnswers(changes);
  const demands = useMemo(() => {
    const eq = value && value.insurance && (value.insurance.covers || []).find(c => c.code === 'BUSINESS_EQUIPMENT');
    const el =
      changes.some(c => c.elTier) ||
      (value && value.insurance && (value.insurance.covers || []).some(c => c.code === 'EMPLOYERS_LIABILITY'));
    return demandsAndNeeds({
      insWorking: ['insMobile'],
      insNonSalonEL: el ? 'yes' : 'no',
      insEquipmentTier: Math.max(Number(eq && eq.sumInsured) || 0, ...changes.map(c => c.equipmentTier)),
    });
  }, [value, changes]);

  const setAnswer = (name, v) => setAnswers(a => ({ ...a, [name]: v }));

  async function toReview() {
    setState({ busy: true, error: '' });
    try {
      setQuote(await portalApi.checkoutQuotePost(body()));
      setStep('review');
      setState({ busy: false, error: '' });
    } catch (e) {
      setState({ busy: false, error: e.message });
    }
  }
  async function pay() {
    if (state.busy) return;
    setState({ busy: true, error: '' });
    try {
      const r = await portalApi.startCheckout(body());
      if (r.alreadyPaid) {
        setState({ busy: false, error: 'This change has already been paid for.' });
        return;
      }
      if (!/^https:\/\/checkout\.stripe\.com\//.test(r.checkoutUrl))
        throw new Error('We could not open the payment page. Please try again.');
      window.location.assign(r.checkoutUrl);
    } catch (e) {
      setState({ busy: false, error: e.message });
    }
  }
  async function save() {
    if (state.busy) return;
    setState({ busy: true, error: '' });
    try {
      setSaved((await portalApi.saveInsuranceChange(body())).revision);
      setState({ busy: false, error: '' });
    } catch (e) {
      setState({
        busy: false,
        error: e.message || 'We could not save your request. Please call the office on ' + GUILD_PHONE + '.',
      });
    }
  }

  return (
    <div className="page narrow-page">
      <Link to={'/membership/manage/' + id + '?tab=cover'} className="back-link">
        <ArrowLeft size={16} /> Back to your cover
      </Link>
      <PageHeading
        eyebrow="YOUR INSURANCE"
        title="Make changes to my insurance"
        description="Change your people, treatments, teaching and cover part way through your policy. You pay only for the days left."
      />
      {!INTEGRATIONS.insuranceChanges ? (
        <Notice title="Coming soon">
          Changing your insurance online is coming soon. Please call the office on {GUILD_PHONE}.
        </Notice>
      ) : cover.loading ? (
        <p role="status">Loading your cover…</p>
      ) : cover.error ? (
        <Notice title="Unavailable">{cover.error}</Notice>
      ) : !can.online ? (
        <Notice title="Please call the office">
          {can.reason} {GUILD_PHONE}
        </Notice>
      ) : step === 'choose' ? (
        <>
          {changes.map((c, i) => (
            <ChangeCard
              key={i}
              index={i}
              change={c}
              cover={value}
              range={range}
              opts={opts}
              onChange={next => setChanges(list => list.map((x, j) => (j === i ? next : x)))}
              onRemove={i > 0 ? () => setChanges(list => list.filter((_, j) => j !== i)) : null}
            />
          ))}
          {changes.length < MAX_CHANGES && (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setChanges(list => [...list, emptyChange(range.min)])}
            >
              Add a change from a different date
            </button>
          )}
          <p className="muted">
            Each start date is a separate change with its own £5 adjustment fee. Changes that start on the same day
            share one.
          </p>
          {fix.length > 0 && (
            <Notice title="Please check">
              {fix.map(x => (
                <p key={x}>{x}</p>
              ))}
            </Notice>
          )}
          <button
            type="button"
            className="btn btn-primary btn-block"
            onClick={() => {
              const found = problems(changes, value);
              setFix(found);
              if (!found.length) setStep('declarations');
            }}
          >
            Continue
          </button>
        </>
      ) : step === 'declarations' ? (
        <>
          <Declarations answers={answers} setAnswer={setAnswer} needsTreatments={needsTreatments} demands={demands} />
          {state.error && <Notice title="We could not continue">{state.error}</Notice>}
          <button type="button" className="btn btn-secondary" onClick={() => setStep('choose')}>
            Back
          </button>{' '}
          <button
            type="button"
            className="btn btn-primary"
            disabled={state.busy || !declarationsDone(answers, changes)}
            onClick={toReview}
          >
            {state.busy ? 'Working out your price…' : 'Review and price'}
          </button>
        </>
      ) : (
        <>
          <Review quote={quote} saved={saved} state={state} onPay={pay} onSave={save} />
          <button type="button" className="btn btn-secondary" onClick={() => setStep('declarations')}>
            Back
          </button>
        </>
      )}
    </div>
  );
}
