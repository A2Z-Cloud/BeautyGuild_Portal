import React, { createContext, useContext, useMemo, useState } from 'react';

// Preview only. Answers are held in React memory while moving between routes.
// No credentials, payment details, CRM data or private documents are stored here.
const Context = createContext(null);
export function PreviewStateProvider({children}) {
  const [answers, setAnswers] = useState({});
  const [steps, setSteps] = useState({});
  const [draftRefs,setDraftRefs]=useState({});
  const setDraftRef=(kind,ref)=>setDraftRefs(p=>({...p,[kind]:ref}));
  const restoreDraft=d=>{setAnswers(p=>({...p,[d.service]:d.answers}));setSteps(p=>({...p,[d.service]:d.step}));setDraftRef(d.service,{id:d.id,revision:d.revision});};
  const setAnswer = (kind, name, value) => setAnswers(previous => ({
    ...previous, [kind]: {...(previous[kind] || {}), [name]: value}
  }));
  const setJourneyStep = (kind, index) => setSteps(previous => ({...previous, [kind]: index}));
  const clearAnswers = kind => {setAnswers(previous => ({...previous, [kind]: {}}));setJourneyStep(kind,0);};
  const value = useMemo(() => ({answers, steps, draftRefs, setDraftRef, restoreDraft, setAnswer, setJourneyStep, clearAnswers}), [answers, steps, draftRefs]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function usePreviewState(){
  const context = useContext(Context);
  if(!context) throw new Error('PreviewStateProvider is missing');
  return context;
}
