import React, { createContext, useContext, useMemo, useState } from 'react';

// Preview only. Answers are held in React memory while moving between routes.
// No credentials, payment details, CRM data or private documents are stored here.
const Context = createContext(null);
export function PreviewStateProvider({children}) {
  const [answers, setAnswers] = useState({});
  const [steps, setSteps] = useState({});
  const [draftMeta,setDraftMeta]=useState({});
  const setDraft=(kind,draft)=>setDraftMeta(x=>({...x,[kind]:draft}));
  const restoreDraft=d=>{const kind=d.service==='combined'?'membership':d.service;setAnswers(v=>({...v,[kind]:d.answers?.membership||d.answers}));setSteps(v=>({...v,[kind]:d.step||0}));setDraft(kind,{id:d.id,service:d.service,revision:d.revision,journeyId:d.journeyId});};
  const setAnswer = (kind, name, value) => setAnswers(previous => ({
    ...previous, [kind]: {...(previous[kind] || {}), [name]: value}
  }));
  const setJourneyStep = (kind, index) => setSteps(previous => ({...previous, [kind]: index}));
  const clearAnswers = kind => {setAnswers(previous => ({...previous, [kind]: {}}));setJourneyStep(kind,0);setDraftMeta(v=>({...v,[kind]:undefined}));};
  const value = useMemo(() => ({answers, steps, draftMeta, setDraft, restoreDraft, setAnswer, setJourneyStep, clearAnswers}), [answers, steps, draftMeta]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function usePreviewState(){
  const context = useContext(Context);
  if(!context) throw new Error('PreviewStateProvider is missing');
  return context;
}
