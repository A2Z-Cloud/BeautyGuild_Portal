import React,{useEffect,useState} from 'react';
import {Link,useParams,useSearchParams} from 'react-router-dom';
import {ArrowLeft,ArrowRight,Building2,BookOpen,CalendarDays,Users,GraduationCap,FileText,Receipt,MapPin,ShieldCheck} from 'lucide-react';
import {PageHeading,Notice,Status} from './UiParts.jsx';
import {formatDate} from './format.js';
import {INTEGRATIONS,portalApi} from './services/api.js';
import {DocumentsPanel} from './DocumentsPanel.jsx';
import {QualificationForm,SessionForm,TutorForm,BookingForm} from './SchoolActionForms.jsx';
import SchoolVerification from './SchoolVerification.jsx';
import CourseGroups from './components/CourseGroups.jsx';

const GROUPS=[
 {label:'Overview',items:[['profile','School profile',Building2],['verification','Verification',ShieldCheck]]},
 {label:'Teaching',items:[['courses','Courses',BookOpen],['sessions','Course dates',CalendarDays],['tutors','Tutors',Users],['qualifications','Qualifications',GraduationCap],['venues','Venues',MapPin]]},
 {label:'Records',items:[['documents','Documents',FileText],['invoices','Invoices',Receipt]]},
];
const sections=GROUPS.flatMap(g=>g.items);
function useLoad(load,keys){
 const [data,setData]=useState({loading:true,error:'',value:null});
 useEffect(()=>{
  let active=true;setData({loading:true,error:'',value:null});
  load().then(value=>active&&setData({loading:false,error:'',value})).catch(e=>active&&setData({loading:false,error:e.message,value:null}));
  return()=>{active=false;};
 },keys);
 return data;
}
function Empty({children}){return <p className="school-empty-text">{children}</p>;}
function SimpleTable({columns,rows}) {
 return <div className="school-table-scroll"><table className="record-table"><thead><tr>{columns.map(c=><th key={c.key}>{c.label}</th>)}</tr></thead>
 <tbody>{rows.map((r,i)=><tr key={r.id||i}>{columns.map(c=><td key={c.key}>{c.render?c.render(r):r[c.key]??'—'}</td>)}</tr>)}</tbody></table></div>;
}
const col=(key,label,render)=>({key,label,...(render?{render}:{})});
const dateCol=(key,label,opts)=>col(key,label,r=>formatDate(r[key],opts));
export function SchoolsList(){
 const state=useLoad(()=>portalApi.listSchools(),[]);
 return <div className="page"><PageHeading eyebrow="TRAINING CENTRES" title="My schools" description="Manage accredited courses, venues, tutors, qualifications, dates and invoices."/>
 {!INTEGRATIONS.schoolServices?<Notice title="Coming soon">Managing your school online is coming soon.</Notice>:
 state.loading?<p role="status">Loading your schools…</p>:state.error?<Notice title="Schools unavailable">{state.error}</Notice>:
 <div className="school-list">{state.value.length?state.value.map(s=><Link className="surface padded school-list-card" key={s.id} to={'/schools/'+s.id+'/profile'}>
 <Building2 size={29}/><div><h2>{s.name}</h2><p>{s.level||'Training centre'} · {s.validTo?'Valid until '+formatDate(s.validTo):'Expiry date unavailable'}</p>
 <Status value={s.status}/></div><ArrowRight size={18}/></Link>):<Empty>No accredited schools are linked to your account yet.</Empty>}</div>}
 </div>;
}
function SchoolProfile({data}){
 const p=data.profile;
 return <><h2>School profile</h2><p className="muted">You cannot change these details online. Contact the Accreditation team to update them.</p>
 {INTEGRATIONS.stripeCheckout&&<p><Link className="btn btn-secondary" to={'/pay/accreditation/'+p.id}>Pay for accreditation</Link></p>}
 <dl className="detail-list">{Object.entries({'Training centre':p.name,'Town / City':p.town,County:p.county,Country:p.country,Postcode:p.postcode,
 'Accreditation status':p.status,'Valid until':formatDate(p.expires),'Accreditation level':p.level,'Referral code':p.referralCode}).map(([k,v])=><div key={k}><dt>{k}</dt><dd>{v||'—'}</dd></div>)}</dl>
 {p.referralCode&&p.referralActive&&<p><a className="reference" href={'https://beautyguild.com/Join/'+encodeURIComponent(p.referralCode)} target="_blank" rel="noreferrer">View school referral landing page <ArrowRight size={15}/></a></p>}</>;
}
export function InvoiceTable({rows}){
 const [selected,setSelected]=useState(null);
 return <>{rows.length?<SimpleTable columns={[
 {key:'invoiceNumber',label:'Invoice',render:r=><button type="button" className="text-button" onClick={()=>setSelected(r)}>#{r.invoiceNumber||r.id}</button>},
 col('type','Type'),dateCol('invoiceDate','Date'),dateCol('dueDate','Due'),
 {key:'amount',label:'Amount',render:r=>Number.isFinite(r.amount)?'£'+r.amount.toFixed(2):'—'},
 {key:'status',label:'Status',render:r=><Status value={r.status||'Unknown'}/>}
 ]} rows={rows}/>:<Empty>No invoices were returned for this account.</Empty>}
 {selected&&<div className="school-dialog-overlay" role="presentation" onClick={()=>setSelected(null)}><section className="school-dialog surface padded" role="dialog" aria-modal="true" aria-label="Invoice details" onClick={e=>e.stopPropagation()}>
 <div className="school-dialog-head"><h2>Invoice #{selected.invoiceNumber||selected.id}</h2><button className="btn btn-secondary" type="button" onClick={()=>setSelected(null)}>Close</button></div>
 <dl className="detail-list">{Object.entries({'Type':selected.type,'Status':selected.status,'Amount':Number.isFinite(selected.amount)?'£'+selected.amount.toFixed(2):null,
 'Invoice date':formatDate(selected.invoiceDate),'Due date':formatDate(selected.dueDate),'Payment date':formatDate(selected.paymentDate)}).map(([k,v])=><div key={k}><dt>{k}</dt><dd>{v||'—'}</dd></div>)}</dl>
 </section></div>}</>;
}
function SchoolSection({id,section}){
 const [editing,setEditing]=useState(false),[reload,setReload]=useState(0);
 const state=useLoad(()=>portalApi.getSchoolSection(id,section),[id,section,reload]);
 const saved=()=>{setEditing(false);setReload(n=>n+1);};
 const [session,setSession]=useState(null),[addingBooking,setAddingBooking]=useState(false),[booksReload,setBooksReload]=useState(0);
 const books=useLoad(()=>session?portalApi.getSessionBookings(id,session):Promise.resolve({bookings:[]}),[id,session,booksReload]);
 const bookingSaved=()=>{setAddingBooking(false);setBooksReload(n=>n+1);setReload(n=>n+1);};
 if(state.loading)return <p role="status">Loading {section}…</p>;
 if(state.error)return <Notice title="Section unavailable">{state.error}</Notice>;
 const x=state.value;
 switch(section){
 case 'profile':return <SchoolProfile data={x}/>;
 case 'courses':return <><h2>Accredited courses</h2><SimpleTable rows={x.courses||[]} columns={[col('name','Course')]}/>
 <h3>Other available GTi courses</h3><p>Contact the Guild to add a new course to this accreditation.</p>
 <CourseGroups courses={x.available||[]} searchable emptyText="There are no other GTi courses to add."/></>;
 case 'venues':return <><h2>Accredited venues</h2><p>Adding a venue is subject to a separate Guild approval and payment process.</p>
 <SimpleTable rows={x.venues||[]} columns={[col('name','Venue'),col('town','Town'),
 {key:'isMain',label:'Type',render:r=>r.isMain?'Main centre':'Additional venue'},col('courseCount','Courses'),
 {key:'visible',label:'Directory',render:r=>r.visible?'Visible':'Hidden'}]}/></>;
 case 'tutors':return <><div className="school-dialog-head"><h2>Accredited tutors</h2>{INTEGRATIONS.schoolWrites&&<button type="button" className="btn btn-primary" onClick={()=>setEditing(v=>!v)}>{editing?'Cancel':'Add tutor'}</button>}</div><p>Tutors should hold current Guild membership, appropriate qualifications and insurance.</p>{editing&&<TutorForm schoolId={id} onDone={saved}/>}
 <SimpleTable rows={(x.tutors||[]).filter(t=>t.active)} columns={[col('name','Tutor'),col('membershipNumber','Membership number'),dateCol('membershipExpiry','Membership expiry'),col('status','Membership')]}/>
 <h3>Inactive tutors</h3><p>These tutors have been added but are not active yet. They become active once they hold a current Guild membership.</p>
 <SimpleTable rows={(x.tutors||[]).filter(t=>!t.active)} columns={[col('name','Tutor'),col('membershipNumber','Membership number'),dateCol('membershipExpiry','Membership expiry'),col('status','Membership')]}/></>;
 case 'qualifications':return <><div className="school-dialog-head"><h2>Qualifications</h2>{INTEGRATIONS.schoolWrites&&<button type="button" className="btn btn-primary" onClick={()=>setEditing(v=>!v)}>{editing?'Cancel':'Add qualification'}</button>}</div>{editing&&<QualificationForm schoolId={id} onDone={saved}/>}<SimpleTable rows={x.qualifications||[]} columns={[col('name','Qualification'),
 {key:'month',label:'Completed',render:r=>[r.month,r.year].filter(Boolean).join('/')||'—'},col('status','Verification')]}/></>;
 case 'sessions':return <><div className="school-dialog-head"><h2>Course dates and bookings</h2>{INTEGRATIONS.schoolWrites&&<button type="button" className="btn btn-primary" onClick={()=>setEditing(v=>!v)}>{editing?'Cancel':'Create session'}</button>}</div><p>Your published fixed and flexible course dates, with the places booked so far.</p>{editing&&<SessionForm schoolId={id} onDone={saved}/>}
 <SimpleTable rows={x.sessions||[]} columns={[col('name','Course / session'),col('availabilityType','Availability'),dateCol('start','Date',{time:true}),
 {key:'placesBooked',label:'Places booked',render:r=>r.maximumPlaces==null?String(r.placesBooked):r.placesBooked+' / '+r.maximumPlaces},
 col('status','Status'),{key:'id',label:'Bookings',render:r=><button type="button" className="text-button" onClick={()=>{setSession(r.id);setAddingBooking(false);}}>View bookings</button>}]}/>
 {session&&<div className="school-dialog-overlay" role="presentation" onClick={()=>setSession(null)}><section className="school-dialog surface padded" role="dialog" aria-modal="true" aria-label="Session bookings" onClick={e=>e.stopPropagation()}>
 <div className="school-dialog-head"><h2>Session bookings</h2><div>{INTEGRATIONS.schoolWrites&&<button type="button" className="btn btn-primary" onClick={()=>setAddingBooking(v=>!v)}>{addingBooking?'Cancel':'Add booking'}</button>} <button type="button" className="btn btn-secondary" onClick={()=>setSession(null)}>Close</button></div></div>
 {addingBooking&&<BookingForm schoolId={id} session={(x.sessions||[]).find(s=>s.id===session)||{id:session,availabilityType:'Fixed Date'}} onDone={bookingSaved}/>}
 {books.loading?<p>Loading bookings…</p>:books.error?<Notice title="Bookings unavailable">{books.error}</Notice>:
 <SimpleTable rows={books.value?.bookings||[]} columns={[col('name','Student'),col('places','Places'),col('status','Status'),col('message','Notes')]}/>}</section></div>}</>;
 case 'verification':return <SchoolVerification data={x}/>;
 case 'invoices':return <><h2>Invoices</h2><Notice title="All your invoices">This list shows every invoice on your account, not only this school's.</Notice>
 <InvoiceTable rows={x.invoices||[]}/></>;
 default:return <Empty>Section unavailable.</Empty>;
 }
}
export function SchoolWorkspace(){
 const {id,section:requested}=useParams(),[search,setSearch]=useSearchParams();
 const section=sections.some(s=>s[0]===requested)?requested:'profile';
 const current=useLoad(()=>portalApi.listSchools(),[id]);
 const school=current.value?.find(s=>s.id===id);
 return <div className="page"><Link to="/schools" className="back-link"><ArrowLeft size={16}/> Back to schools</Link>
 <PageHeading eyebrow="SCHOOL MANAGEMENT" title={school?.name||'Training centre'} description={school?school.level+' · '+school.status:'Manage your school'}/>
 {!INTEGRATIONS.schoolServices?<Notice title="Coming soon">Managing your school online is coming soon.</Notice>:
 current.loading?<p>Loading school…</p>:current.error?<Notice title="Unable to load school">{current.error}</Notice>:
 !school?<Notice title="School unavailable">No school linked to your account matches this reference.</Notice>:
 <div className="school-layout"><nav aria-label="School sections" className="school-nav">{GROUPS.map(g=><div className="school-nav-group" key={g.label}><span className="school-nav-label">{g.label}</span><div className="school-nav-links">{g.items.map(([key,label,Icon])=><Link key={key} className={key===section?'active':''} aria-current={key===section?'page':undefined} to={'/schools/'+id+'/'+key}><Icon size={16} aria-hidden="true"/>{label}</Link>)}</div></div>)}</nav>
 <section className="surface padded school-workspace-panel">{section==='documents'?<DocumentsPanel kind="accreditation" id={id}/>:<SchoolSection id={id} section={section}/>}</section></div>}
 </div>;
}
export function AccountInvoices(){
 const state=useLoad(()=>portalApi.getAccountInvoices(),[]);
 return <div className="page"><PageHeading eyebrow="YOUR ACCOUNT" title="My invoices" description="Your invoices for membership, accreditation and additional venues."/>
 {!INTEGRATIONS.schoolServices?<Notice title="Coming soon">Your invoices will appear here soon.</Notice>:
 state.loading?<p role="status">Loading invoices…</p>:state.error?<Notice title="Invoices unavailable">{state.error}</Notice>:
 <section className="surface padded"><InvoiceTable rows={state.value}/></section>}</div>;
}
export function MembershipManagement(){
 const {id}=useParams(),[query,setQuery]=useSearchParams(),tab=query.get('tab')||'details';
 const extension=useLoad(()=>portalApi.getMembershipExtensions(id),[id]);
 const invoices=useLoad(()=>portalApi.getMembershipInvoices(id),[id]);
 const record=useLoad(()=>portalApi.getRecord('membership',id),[id]);
 return <div className="page"><Link to="/records" className="back-link"><ArrowLeft size={16}/> Back to records</Link>
 <PageHeading eyebrow="GUILD MEMBERSHIP" title={record.value?.title||'Membership details'} description="Membership details, purchased add-ons and invoices."/>
 {!INTEGRATIONS.schoolServices?<Notice title="Coming soon">Your membership services will appear here soon.</Notice>:
 <>{INTEGRATIONS.stripeCheckout&&<p><Link className="btn btn-secondary" to={'/membership/buy?renew='+id}>Renew membership</Link></p>}<nav className="school-tabs"><button className={tab==='details'?'active':''} onClick={()=>setQuery({tab:'details'})}>Details</button>
 <button className={tab==='addons'?'active':''} onClick={()=>setQuery({tab:'addons'})}>Add-ons</button>
 <button className={tab==='invoices'?'active':''} onClick={()=>setQuery({tab:'invoices'})}>Invoices</button></nav>
 <section className="surface padded">{tab==='details'?(record.error?<Notice title="Unavailable">{record.error}</Notice>:
 record.loading?<p>Loading membership…</p>:<dl className="detail-list">{Object.entries(record.value||{}).map(([k,v])=><div key={k}><dt>{k}</dt><dd>{v==null?'—':String(v)}</dd></div>)}</dl>):
 tab==='addons'?(extension.loading?<p>Loading add-ons…</p>:extension.error?<Notice title="Unavailable">{extension.error}</Notice>:
 <><SimpleTable rows={extension.value||[]} columns={[col('type','Add-on'),col('branch','Branch'),col('quantity','Quantity'),col('finalPrice','Amount'),col('status','Status')]}/>{INTEGRATIONS.stripeCheckout&&<p><Link className="btn btn-primary" to={'/pay/membership_addon/'+id}>Buy add-ons</Link></p>}</>):
 invoices.loading?<p>Loading invoices…</p>:invoices.error?<Notice title="Unavailable">{invoices.error}</Notice>:<InvoiceTable rows={invoices.value||[]}/>}</section></>}
 </div>;
}

export function AccountDocuments(){
 const docs=useLoad(()=>portalApi.listRecords('membership'),[]);
 if(!INTEGRATIONS.workdrive||!INTEGRATIONS.crmRecords)return <div className="page"><PageHeading eyebrow="YOUR ACCOUNT" title="My documents"/><Notice title="Coming soon">You will be able to view and download your documents here soon.</Notice></div>;
 return <div className="page"><PageHeading eyebrow="YOUR ACCOUNT" title="My documents" description="Documents linked to your Guild membership."/>
 {docs.loading?<p role="status">Finding your membership documents…</p>:docs.error?<Notice title="Documents unavailable">{docs.error}</Notice>:
 docs.value.length?<DocumentsPanel kind="membership" id={docs.value[0].id}/>:<Notice title="No membership documents">There is no linked membership folder for this account.</Notice>}</div>;
}
