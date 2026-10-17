import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';

// Preview only. Answers are held in React memory while moving between routes.
// No credentials, payment details, CRM data or private documents are stored here.
const Context = createContext(null);
export function PreviewStateProvider({children}) {
  const [answers, setAnswers] = useState({});
  const [steps, setSteps] = useState({});
  const setAnswer = (kind, name, value) => setAnswers(previous => ({
    ...previous, [kind]: {...(previous[kind] || {}), [name]: value}
  }));
  const setJourneyStep = (kind, index) => setSteps(previous => ({...previous, [kind]: index}));
  const clearAnswers = kind => {setAnswers(previous => ({...previous, [kind]: {}}));setJourneyStep(kind,0);};
  const restoreAnswers = useCallback((kind, nextAnswers, index = 0) => {
    setAnswers(previous => ({...previous, [kind]: {...nextAnswers}}));
    setSteps(previous => ({...previous, [kind]: index}));
  }, []);
  const value = useMemo(() => ({answers, steps, setAnswer, setJourneyStep, clearAnswers, restoreAnswers}), [answers, steps, restoreAnswers]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function usePreviewState(){
  const context = useContext(Context);
  if(!context) throw new Error('PreviewStateProvider is missing');
  return context;
}
