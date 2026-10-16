import React from 'react';
import { ArrowRight, ArrowUpRight, Sparkles } from 'lucide-react';
import { Link } from 'react-router-dom';
import { DEMO_RECORDS, DEMO_SERVICES } from './data/demo.js';
import { IconFor, ServiceArrow, Status } from './UiParts.jsx';
export default function Dashboard(){
 return <div className="page dashboard">
  <div className="eyebrow welcome">WELCOME TO YOUR PORTAL <span>October 2026 · Example date</span></div>
  <div className="hero"><div className="hero-copy"><div className="hero-top"><Sparkles size={16}/> Your Guild journey</div><h1>Everything you need,<br/><em>beautifully together.</em></h1><p>Explore membership, insurance and training centre accreditation in one place.</p><div className="hero-buttons"><Link className="btn btn-dark" to="/accreditation/new">Start an application <ArrowRight size={17}/></Link><Link className="btn btn-on-pink" to="/records">View sample records <ArrowUpRight size={16}/></Link></div></div><div className="hero-visual" aria-hidden><div className="hero-orbit orbit1"/><div className="hero-orbit orbit2"/><div className="hero-circle"><span>beauty</span><strong>guild</strong></div><span className="spark one">✧</span></div></div>
  <div className="demo-strip"><div><strong>Explore the V2 preview</strong><span>Demonstration only. Your CRM records and account are not connected.</span></div><span>NO LIVE DATA</span></div>
  <div className="stat-row"><div className="stat"><span>Sample applications</span><strong>04</strong><small>Demonstration records</small></div><div className="stat"><span>Under review</span><strong>01</strong><small>Example status only</small></div><div className="stat"><span>Live API integrations</span><strong>00</strong><small>Connections to follow</small></div></div>
  <div className="section-row"><div><small className="eyebrow">YOUR GUILD SERVICES</small><h2>What would you like to do?</h2></div><span>Choose a service to explore</span></div>
  <div className="services-grid">{DEMO_SERVICES.map(s=><Link key={s.kind} className={'service-card '+s.theme} to={'/'+s.kind}><span className="service-icon"><IconFor kind={s.kind}/></span><small>GUILD SERVICES</small><strong>{s.title}</strong><p>{s.description}</p><ServiceArrow>{s.action}</ServiceArrow></Link>)}</div>
  <div className="section-row section-row-lower"><div><small className="eyebrow">AT A GLANCE</small><h2>Recent sample activity</h2></div><Link className="text-link" to="/records">All records <ArrowRight size={16}/></Link></div>
  <div className="surface"><div className="table-scroll"><table className="record-table"><thead><tr><th>Reference</th><th>Application</th><th>Status</th><th>Updated</th></tr></thead><tbody>{DEMO_RECORDS.slice(0,3).map(r=><tr key={r.id}><td><Link className="reference" to={'/records/'+r.kind+'/'+r.id+'?tab=overview'}>{r.reference}</Link><small>{r.category}</small></td><td><strong>{r.title}</strong><small>{r.subtitle}</small></td><td><Status value={r.status}/></td><td className="muted">{r.updated}</td></tr>)}</tbody></table></div></div>
 </div>;
}
