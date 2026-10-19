import React, { createContext, useContext, useMemo, useState } from 'react';
import {JOURNEYS,COUNTRY_OPTIONS} from '../JourneyConfig.js';
import {firstIncompleteStep,restoreAccreditationAnswers} from '../accreditationInputs.js';
import {validate} from '../logic.mjs';

// Preview only. Answers are held in React memory while moving between routes.
// No credentials, payment details, CRM data or private documents are stored here.
const Context = createContext(null);
export function PreviewStateProvider({children}) {
  const [answers, setAnswers] = useState({});
  const [steps, setSteps] = useState({});
  const [draftMeta,setDraftMeta]=useState({});
  const setDraft=(kind,draft)=>setDraftMeta(x=>({...x,[kind]:draft}));
  const restoreDraft=d=>{
    const kind=d.service==='combined'?'membership':d.service;
    // An accreditation application is rebuilt from CRM records, so it has no saved step: resume at the first incomplete one.
    const restored=kind==='accreditation'?restoreAccreditationAnswers(d.answers,COUNTRY_OPTIONS):(d.answers?.membership||d.answers);
    const step=kind==='accreditation'?firstIncompleteStep(JOURNEYS.accreditation.steps,restored,validate):(d.step||0);
    setAnswers(v=>({...v,[kind]:restored}));setSteps(v=>({...v,[kind]:step}));
    setDraft(kind,{id:d.id,service:d.service,revision:d.revision,journeyId:d.journeyId,...(d.related?{related:d.related}:{})});
  };
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
