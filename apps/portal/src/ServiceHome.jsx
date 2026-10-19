import React from 'react';
import { ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { DEMO_SERVICES } from './data/demo.js';
import { IconFor, Notice, PageHeading } from './UiParts.jsx';
import {INTEGRATIONS} from './services/api.js';
import {CourseCatalogue} from './components/CourseCatalogue.jsx';
const paths={
 membership:['Membership option','Applicant details','Review information'],
 accreditation:['Your training centre','Courses and tutors','Review information'],
 insurance:['Business information','Cover options','Declarations','Review information'],
};
export default function ServiceHome({kind}){
 const service=DEMO_SERVICES.find(s=>s.kind===kind);
 return <div className="page"><PageHeading eyebrow="GUILD SERVICES" title={service.title} description={service.description}>{kind==='membership'&&INTEGRATIONS.stripeCheckout?<Link className="btn btn-primary" to="/membership/buy">Join the Guild <ArrowRight size={16}/></Link>:kind==='insurance'&&INTEGRATIONS.stripeCheckout?<Link className="btn btn-primary" to="/insurance/buy">Buy insurance <ArrowRight size={16}/></Link>:<Link className="btn btn-primary" to={'/'+kind+'/new'}>View the form <ArrowRight size={16}/></Link>}</PageHeading>
 <div className={'service-banner '+service.theme}><div><small className="eyebrow">A SIMPLER JOURNEY</small><h2>{kind==='insurance'?'Cover that works around you.':kind==='accreditation'?'Support for your training centre.':'Your professional community starts here.'}</h2><p>Look through the questions in our new online application.</p></div><IconFor kind={kind} size={70}/></div>
 <div className="two-cols"><section className="surface padded"><small className="eyebrow">THE JOURNEY</small><h2>Here's what to expect</h2><ol className="process">{paths[kind].map((label,i)=><li key={label}><b>{String(i+1).padStart(2,'0')}</b><span><strong>{label}</strong><small>{i===paths[kind].length-1?'Check your answers before you finish':'Questions to answer'}</small></span></li>)}</ol><Link className="btn btn-primary" to={'/'+kind+'/new'}>View the {kind} form <ArrowRight size={16}/></Link></section>
 <section className="surface padded"><small className="eyebrow">BEFORE YOU START</small><h2>Applications are opening soon</h2><Notice title="Nothing is submitted yet">You can look through the questions now, but your answers are not submitted or saved, and nothing is charged. Online applications will open soon.</Notice><div className="quick-links"><Link to="/records">View my records <ArrowRight size={16}/></Link><Link to="/">Back to dashboard <ArrowRight size={16}/></Link></div></section></div>{kind==='accreditation'&&<><p><Link to="/schools" className="btn btn-secondary">Manage my schools <ArrowRight size={15}/></Link></p><CourseCatalogue/></>}</div>;
}
