import { useEffect, useState } from 'react';

// Keeps a form's answers in this browser tab (never sent anywhere), so a visitor who leaves to sign in or sign up finds them again.
const PREFIX = 'bg_buy_';
const store = () => {
  try {
    return globalThis.sessionStorage;
  } catch {
    return undefined;
  }
};
export const readStored = (key, initial, storage = store()) => {
  try {
    const raw = storage?.getItem(PREFIX + key);
    return raw ? { ...initial, ...JSON.parse(raw) } : initial;
  } catch {
    return initial;
  }
};
export const writeStored = (key, value, storage = store()) => {
  try {
    storage?.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    /* storage can be blocked */
  }
};
export const clearStored = (storage = store()) => {
  try {
    for (let i = (storage?.length || 0) - 1; i >= 0; i--) {
      const k = storage.key(i);
      if (k && k.startsWith(PREFIX)) storage.removeItem(k);
    }
  } catch {
    /* storage can be blocked */
  }
};
// Like useState, remembered for the tab. `after` can strip anything that must not be restored (such as a ticked consent box).
export function useStoredState(key, initial, after = x => x) {
  const [value, setValue] = useState(() => after(readStored(key, initial)));
  useEffect(() => {
    writeStored(key, value);
  }, [key, value]);
  return [value, setValue];
}
