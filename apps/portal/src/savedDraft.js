import { clearStored, readStored, writeStored } from './storedState.js';
import { CONFIRMATIONS } from './insuranceInputs.js';
import { startLimits } from './startDate.js';

// Save and finish later for the Join the Guild and Buy insurance pages. The answers go to the CRM against the signed-in account
// (portalApi drafts); the tab keeps only a small reference to the draft. Agreement boxes and insurance confirmations are never saved
// or restored, so the customer agrees again, and nothing about payment is stored.
export const SAVED_MESSAGE = 'Your application has been saved. You can finish it later from Saved applications.';
export const CHANGED_MESSAGE = 'This application has changed elsewhere. Please reload the page before saving.';
const REF = 'draft',
  PENDING = 'save_pending';
export const noConfirmations = iv => {
  const o = { ...(iv || {}) };
  for (const k of CONFIRMATIONS) delete o[k];
  return o;
};
export const validStart = start => (start && start >= startLimits().min ? start : '');

// Waiting to save across an emailed sign-up link. The link opens in a new tab with no sessionStorage, so when a visitor chooses Save
// while signed out, a copy of the tab's answers and a marker (page, service, time) go to localStorage. It is restored once, for the same
// page, when the visitor is signed in, and removed after the save, after payment, on discard, and after WAITING_HOURS. The same rules
// apply as for the draft: no agreement box, no insurance confirmations, no payment data.
const WAITING = 'bg_save_waiting',
  PREFIX = 'bg_buy_',
  WAITING_HOURS = 24;
const local = () => {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
};
const session = () => {
  try {
    return globalThis.sessionStorage;
  } catch {
    return undefined;
  }
};
export const safeEntries = e => {
  const o = { ...(e || {}) };
  if (o.membership && typeof o.membership === 'object') o.membership = { ...o.membership, accepted: false };
  if (o.membership_insurance?.iv)
    o.membership_insurance = { ...o.membership_insurance, iv: noConfirmations(o.membership_insurance.iv) };
  if (o.insurance?.values) o.insurance = { ...o.insurance, values: noConfirmations(o.insurance.values) };
  return o;
};
export function snapshotStored(storage = session()) {
  const out = {};
  try {
    for (let i = 0; i < (storage?.length || 0); i++) {
      const k = storage.key(i);
      if (k && k.startsWith(PREFIX) && k !== PREFIX + PENDING) {
        const raw = storage.getItem(k);
        if (raw) out[k.slice(PREFIX.length)] = JSON.parse(raw);
      }
    }
  } catch {
    /* storage can be blocked */
  }
  return out;
}
export const clearWaiting = (store = local()) => {
  try {
    store?.removeItem(WAITING);
  } catch {
    /* storage can be blocked */
  }
};
export function writeWaiting(page, entries, store = local(), now = Date.now()) {
  try {
    store?.setItem(
      WAITING,
      JSON.stringify({
        page,
        service: page === '/insurance/buy' ? 'insurance' : 'membership',
        savedAt: now,
        restored: false,
        entries: safeEntries(entries),
      }),
    );
  } catch {
    /* storage can be blocked */
  }
}
// The waiting answers for this page, or null (none, another page, expired, damaged or already restored). Expired or damaged ones are removed.
export function readWaiting(page, store = local(), now = Date.now()) {
  try {
    const raw = store?.getItem(WAITING);
    if (!raw) return null;
    const w = JSON.parse(raw);
    if (
      !w ||
      typeof w.savedAt !== 'number' ||
      now - w.savedAt > WAITING_HOURS * 36e5 ||
      now < w.savedAt - 6e4 ||
      !w.entries ||
      typeof w.entries !== 'object'
    ) {
      clearWaiting(store);
      return null;
    }
    return w.page === page && !w.restored ? { ...w, entries: safeEntries(w.entries) } : null;
  } catch {
    clearWaiting(store);
    return null;
  }
}
export function markWaitingRestored(store = local()) {
  try {
    const w = JSON.parse(store?.getItem(WAITING) || 'null');
    if (w) store.setItem(WAITING, JSON.stringify({ ...w, restored: true }));
  } catch {
    /* storage can be blocked */
  }
}
// Puts waiting answers into this tab's stored state (and flags a save), so the page can reload with them. Returns true if it did.
export function restoreWaiting(page, storage = session(), store = local(), now = Date.now()) {
  const w = readWaiting(page, store, now);
  if (!w) return false;
  for (const [k, v] of Object.entries(w.entries)) writeStored(k, v, storage);
  setSavePending(true, storage);
  markWaitingRestored(store);
  return true;
}
export const draftRef = storage => {
  const r = readStored(REF, null, storage);
  return r && r.id ? r : null;
};
export const forgetDraftRef = (id, storage) => {
  const r = draftRef(storage);
  if (r && (!id || String(r.id) === String(id))) writeStored(REF, {}, storage);
  clearWaiting();
};
export const setSavePending = (on, storage) => writeStored(PENDING, { pending: Boolean(on) }, storage);
export const takeSavePending = storage => {
  const on = readStored(PENDING, null, storage)?.pending === true;
  if (on) setSavePending(false, storage);
  return on;
};

// What is saved. Join: membership choices and details, plus the insurance answers when insurance is chosen (a combined draft).
export const joinDraft = ({ f, d, iv, country }) => {
  const membership = {
    f: {
      level: f.level,
      branch: f.branch,
      branches: f.branches,
      billing: f.billing,
      addons: f.addons,
      insurance: Boolean(f.insurance),
      start: f.start || '',
      // A school referral code is kept with the other answers (checked again when the customer pays).
      ...(f.code ? { code: f.code } : {}),
    },
    d,
  };
  return {
    service: f.insurance ? 'combined' : 'membership',
    answers: f.insurance ? { membership, insurance: { iv: noConfirmations(iv), country } } : { membership },
  };
};
export const buyDraft = ({ values, country, start }) => ({
  service: 'insurance',
  answers: { insurance: { iv: noConfirmations(values), country, start: start || '' } },
});

// Turns a draft from the CRM into the tab's stored answers. Returns the page to open, or null for a draft made by the older step-by-step form.
export function restoreDraftToTab(draft, storage) {
  const a = draft?.answers,
    page =
      draft?.service === 'insurance'
        ? a?.insurance?.iv
          ? '/insurance/buy'
          : null
        : a?.membership?.f
          ? '/membership/buy'
          : null;
  if (!page) return null;
  clearStored(storage);
  clearWaiting();
  if (draft.service === 'insurance') {
    const { iv, country, start } = a.insurance;
    writeStored(
      'insurance',
      { values: noConfirmations(iv), country: country || '', start: validStart(start) },
      storage,
    );
  } else {
    const { f, d } = a.membership,
      insured = draft.service === 'combined' && a.insurance;
    writeStored(
      'membership',
      { ...f, insurance: Boolean(insured), accepted: false, start: validStart(f.start) },
      storage,
    );
    writeStored('membership_details', d || {}, storage);
    if (insured)
      writeStored(
        'membership_insurance',
        { iv: noConfirmations(a.insurance.iv), country: a.insurance.country || '' },
        storage,
      );
  }
  writeStored(
    REF,
    { id: draft.id, service: draft.service, journeyId: draft.journeyId, revision: draft.revision },
    storage,
  );
  return page;
}

// Creates the draft, or updates the one this tab already holds. A draft of another kind (insurance added or removed) is replaced,
// and one that no longer exists or is no longer a draft is started again. A conflict is thrown for the page to explain.
export async function saveDraft(api, { service, answers, names }, storage) {
  const ref = draftRef(storage),
    body = (journeyId, revision) => ({
      service,
      journeyId,
      step: 0,
      answers,
      ...(revision !== undefined ? { revision } : {}),
    });
  const remember = (r, journeyId) =>
    writeStored(REF, { id: r.id, service, journeyId: r.journeyId || journeyId, revision: r.revision }, storage);
  const create = async () => {
    const journeyId = globalThis.crypto.randomUUID(),
      r = await api.createDraft({ ...body(journeyId), ...(names ? { contact: names } : {}) });
    remember(r, journeyId);
    return r;
  };
  if (!ref) return create();
  if (ref.service !== service) {
    const r = await create();
    api.discardDraft(ref.service, ref.id).catch(() => {});
    return r;
  }
  try {
    const r = await api.updateDraft(service, ref.id, body(ref.journeyId, ref.revision));
    remember(r, ref.journeyId);
    return r;
  } catch (e) {
    if (e?.status === 404 || e?.code === 'NOT_FOUND' || e?.code === 'NOT_DRAFT') {
      forgetDraftRef(ref.id, storage);
      return create();
    }
    throw e;
  }
}

// After a successful payment the saved draft is removed, so the paid purchase is the only record. Read before the answers are cleared.
export function finishPaidDraft(api, paidService, storage) {
  const ref = draftRef(storage);
  clearStored(storage);
  clearWaiting();
  const match =
    paidService === 'insurance'
      ? ref?.service === 'insurance'
      : paidService === 'membership' && (ref?.service === 'membership' || ref?.service === 'combined');
  return match
    ? api.discardDraft(ref.service, ref.id).then(
        () => true,
        () => false,
      )
    : Promise.resolve(false);
}
