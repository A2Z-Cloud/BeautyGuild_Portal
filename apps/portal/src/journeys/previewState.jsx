import React, { createContext, useContext, useMemo, useState } from 'react';

// Preview only. Answers are held in React memory while moving between routes.
// No credentials, payment details, CRM data or private documents are stored here.
const Context = createContext(null);
export function PreviewStateProvider({children}) {
  const [answers, setAnswers] = useState({});
  const setAnswer = (kind, name, value) => setAnswers(previous => ({
    ...previous, [kind]: {...(previous[kind] || {}), [name]: value}
  }));
  const clearAnswers = kind => setAnswers(previous => ({...previous, [kind]: {}}));
  const value = useMemo(() => ({answers, setAnswer, clearAnswers}), [answers]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function usePreviewState(){
  const context = useContext(Context);
  if(!context) throw new Error('PreviewStateProvider is missing');
  return context;
}
