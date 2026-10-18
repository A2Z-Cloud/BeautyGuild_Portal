import React from 'react';
import { ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { DEMO_SERVICES } from './data/demo.js';
import { IconFor, Notice, PageHeading } from './UiParts.jsx';
import {CourseCatalogue} from './components/CourseCatalogue.jsx';
const paths={
 membership:['Membership option','Applicant details','Review information'],
 accreditation:['Your training centre','Courses and tutors','Review information'],
 insurance:['Business information','Cover options','Declarations','Review information'],
};
export default function ServiceHome({kind}){
 const service=DEMO_SERVICES.find(s=>s.kind===kind);
 return <div className="page"><PageHeading eyebrow="GUILD SERVICES" title={service.title} description={service.description}><Link className="btn btn-primary" to={'/'+kind+'/new'}>Start preview <ArrowRight size={16}/></Link></PageHeading>
 <div className={'service-banner '+service.theme}><div><small className="eyebrow">A SIMPLER JOURNEY</small><h2>{kind==='insurance'?'Cover that works around you.':kind==='accreditation'?'Support for your training centre.':'Your professional community starts here.'}</h2><p>Try the interactive flow with no live account or payment required.</p></div><IconFor kind={kind} size={70}/></div>
 <div className="two-cols"><section className="surface padded"><small className="eyebrow">THE JOURNEY</small><h2>Here's what to expect</h2><ol className="process">{paths[kind].map((label,i)=><li key={label}><b>{String(i+1).padStart(2,'0')}</b><span><strong>{label}</strong><small>{i===paths[kind].length-1?'Preview only, not a real submission':'Interactive example form'}</small></span></li>)}</ol><Link className="btn btn-primary" to={'/'+kind+'/new'}>Explore {kind} <ArrowRight size={16}/></Link></section>
 <section className="surface padded"><small className="eyebrow">IMPORTANT</small><h2>What's connected?</h2><Notice title="Frontend only">This demonstration does not save CRM records, calculate authoritative prices, create accounts, accept payment or issue cover.</Notice><div className="quick-links"><Link to={'/records?type='+kind}>View sample {kind} records <ArrowRight size={16}/></Link><Link to="/">Back to dashboard <ArrowRight size={16}/></Link></div></section></div>{kind==='accreditation'&&<CourseCatalogue/>}</div>;
}
