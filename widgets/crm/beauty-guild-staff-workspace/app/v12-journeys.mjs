/* V1.2 staff questionnaire: reuses the exact Portal V2 insurance and accreditation definitions.
 * This is an application intake only. Without the staff-authorised Catalyst adapter it MUST NOT
 * create a quote, CRM application, payment link or imply that customer declarations were verified. */
import {INSURANCE_STEPS,visibleSteps,stopMessages} from './portal-defs/insuranceInputs.js';
import {accreditationSteps,resolveFields,COPY_HOME_MAP} from './portal-defs/accreditationInputs.js';
import {validate as validatePortal} from './portal-defs/logic.mjs';
import {startLimits} from './portal-defs/startDate.js';
const countries=['United Kingdom','England','Scotland','Wales','Northern Ireland','Ireland','France','Spain','Other'];
const branches=[['beauty','Beauty Therapists'],['holistic','Holistic Therapists'],['nails','Nail Technicians'],['hair','Hairdressers & Barbers']];
const choices=x=>x.map(([value,label])=>({value,label}));
const field=(name,label,type='text',required=false,more={})=>({name,label,type,required,...more});
const byName=(name,label,opts,more={})=>field(name,label,'radio',true,{options:choices(opts),...more});
const membershipBase=[
 {id:'membership',title:'Membership selection',description:'Current Guild membership types, primary branch, insurance and billing frequency.',fields:[
  byName('level','Membership type',[['associate','Associate Member'],['full_non_salon','Full Member (Non-Salon)'],['full_salon','Full Member (Salon)']]),
  field('branch','Primary Guild branch','radio',true,{options:choices(branches)}),
  byName('purchaseType','Application type',[['new','New member'],['renewal','Renewal'],['upgrade','Upgrade']]),
  byName('billing','Payment frequency',[['annual','Annually'],['monthly','Monthly']]),
  byName('insurance','Include insurance',[['yes','Yes, include insurance'],['no','No, membership only']],{when:v=>v.level!=='associate'}),
  field('start','Start date','date',true,{limit:'start'})]},
 {id:'details',title:'Member and correspondence details',description:'Use the CRM customer record where available; confirm any change with the customer.',fields:[
  field('firstName','First name','text',true),field('lastName','Surname','text',true),field('email','Email address','email',true),
  field('tradingName','Trading name','text',true),field('mobile','Mobile','tel',false),
  field('address1','Address line 1','text',true),field('address2','Address line 2'),field('town','Town or city','text',true),
  field('county','County'),field('postcode','Postcode','text',true),field('country','Country','select',true,{options:choices(countries.map(c=>[c,c]))})]},
 {id:'extras',title:'Additional branches and add-ons',description:'Membership products are selected here; pricing remains in Catalyst.',fields:[
  field('branches','Additional branches','multi',false,{options:choices(branches),excludePrimary:true}),
  ...['bundle','certificate','badge','sticker'].map(x=>field('addon_'+x,({bundle:'Membership bundle',certificate:'Certificate',badge:'Badge',sticker:'Window sticker'})[x],'number',false,{min:0,max:10}))]},
 {id:'terms',title:'Membership declarations',description:'Record whether the customer confirmed the Guild terms and Code of Ethics; staff entry is not independent customer consent.',fields:[
  field('accepted','Customer confirmed the Guild Terms of Business, Privacy Policy and Code of Ethics','checkbox',true)]}
];
const insuranceAbout=[{id:'about',title:'Applicant and territory',description:'Customer details and location used by the Insurance quotation.',fields:[
 field('firstName','First name','text',true),field('lastName','Surname','text',true),field('email','Email address','email',true),
 field('mobile','Mobile','tel',false),field('country','Where are you based?','select',true,{options:choices(countries.map(c=>[c,c]))})]}];
const insuranceStart={id:'start',title:'Cover start date',description:'Requested insurance cover date, up to 30 days ahead.',fields:[field('start','Start date','date',true,{limit:'start'})]};
function config(kind,answers){
 if(kind==='membership')return [...membershipBase,...(answers.insurance==='yes'&&answers.level!=='associate'?INSURANCE_STEPS:[])];
 if(kind==='insurance')return [...insuranceAbout,...INSURANCE_STEPS,insuranceStart];
 if(kind==='accreditation')return accreditationSteps(countries);
 return [];
}
const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const nonblank=v=>Array.isArray(v)?v.length>0:typeof v==='boolean'?v:v!==undefined&&v!==null&&String(v).trim()!=='';
const show=(f,v)=>!f.when||f.when(v);
const opt=(p)=>typeof p==='string'?{value:p,label:p}:p;
const readonlyTerms=new Set(['terms','termsAccepted','insInformationAccurate','insEthicsAccepted','insDemandsNeedsAccepted','insNonAdvisedAccepted']);
const legal='These statements must be confirmed by the customer. Staff entry alone is not evidence of customer acceptance.';
const courseSource={items:[],loading:false,loaded:false,error:'',incomplete:false};
const COURSE_CRITERIA='((Status:equals:Active)and(Course_Type:equals:GTI))';
async function loadCourses(crm,rerender){
 if(courseSource.loading||courseSource.loaded)return;
 courseSource.loading=true;courseSource.error='';rerender();
 try{
   if(typeof crm?.API?.searchRecord!=='function')throw Error('CRM course search is unavailable for this staff account.');
   const seen=new Set(),list=[];
   let more=true;
   for(let page=1;page<=10&&more;page++){
     const result=await crm.API.searchRecord({Entity:'Courses',Type:'criteria',Query:COURSE_CRITERIA,page,per_page:100});
     if(result?.code==='NO_CONTENT'||result?.status===204)break;
     if(result?.code&&result.code!=='SUCCESS'&&!Array.isArray(result?.data))throw Error(result.message||result.code);
     const rows=Array.isArray(result?.data)?result.data:Array.isArray(result)?result:[];
     for(const row of rows){if(!row?.id||seen.has(String(row.id)))continue;if(row.Status!=='Active'||row.Course_Type!=='GTI')continue;
       seen.add(String(row.id));list.push({id:String(row.id),name:row.Name||String(row.id),category:row.Course_Category||'',requirements:row.Entry_Requirements||''});}
     more=result?.info?.more_records===true||(result?.info?.more_records==null&&rows.length===100);
     if(page===10&&more)courseSource.incomplete=true;
   }
   courseSource.items=list;courseSource.loaded=true;
 }catch(e){courseSource.error=String(e.message||e);}
 finally{courseSource.loading=false;rerender();}
}
function introText(v){
 if(v==null)return '';
 if(Array.isArray(v))return v.map(introText).join('');
 if(typeof v==='string')return '<p>'+esc(v)+'</p>';
 if(typeof v==='object'){
   if(Array.isArray(v.list))return '<ul>'+v.list.map(x=>'<li>'+introText(x)+'</li>').join('')+'</ul>';
   if(v.link&&typeof v.href==='string'&&/^https:\/\//.test(v.href))return '<p>'+esc(v.before||'')+'<a href="'+esc(v.href)+'" target="_blank" rel="noopener noreferrer">'+esc(v.link)+'</a>'+esc(v.after||'')+'</p>';
   if(v.href&&/^https:\/\//.test(v.href))return '<p><a href="'+esc(v.href)+'" target="_blank" rel="noopener noreferrer">'+esc(v.label||v.name||'Read policy document')+'</a></p>';
   return '<p>'+esc(Object.values(v).filter(x=>typeof x==='string').join(' '))+'</p>';
 }
 return '';
}
function linkedLabel(f){
 let result=esc(f.label);
 for(const [label,url] of Object.entries(f.links||{})){
   if(typeof url!=='string'||!/^https:\/\//.test(url))continue;
   const part=esc(label);result=result.replace(part,'<a href="'+esc(url)+'" target="_blank" rel="noopener noreferrer">'+part+'</a>');
 }
 return result;
}
function fieldHtml(f,v,errors){
 if(!show(f,v))return '';
 const name=f.name,raw=v[name],fid='v12-'+name,required=typeof f.required==='function'?f.required(v):f.required;
 const label=linkedLabel(f)+(required?' *':'');const err=errors?.[name]?'<span class="v12-form-error" role="alert">'+esc(errors[name])+'</span>':'';
 const options=(f.options||[]).map(opt).filter(o=>!f.optionWhen?.[o.value]||f.optionWhen[o.value](v)).filter(o=>!f.excludePrimary||o.value!==v.branch);
 const base=' data-v12-field="'+esc(name)+'" ';
 let control='';
 if(['checkbox','radio','multi'].includes(f.type)){
   if(f.type==='checkbox'){
     control='<label class="v12-choice"><input type="checkbox"'+base+(raw===true?' checked':'')+' /><span>'+label+'</span></label>';
   }else{
     const multi=f.type==='multi';const current=Array.isArray(raw)?raw:[];
     control='<div class="v12-choice-grid">'+options.map(o=>{
       const selected=multi?current.includes(o.value):raw===o.value;
       return '<label class="v12-choice"><input type="'+(multi?'checkbox':'radio')+'" name="'+esc(name)+'" value="'+esc(o.value)+'" '+base+(selected?' checked':'')+' /><span>'+esc(o.label)+'</span></label>';
     }).join('')+'</div>';
   }
 }else if(f.type==='people'||f.type==='tutors'){
   const rows=Array.isArray(raw)?raw:[];
   const count=f.countFrom?Math.min(20,Number(v[f.countFrom])||0):rows.length;
   control='<div class="v12-repeat">'+rows.slice(0,f.type==='people'?4:Math.max(1,count)).map((p,i)=>{
     const keys=f.type==='people'?['type','firstName','lastName']:['firstName','surname','email'];
     return '<fieldset class="v12-person"><legend>'+(f.type==='people'?'Named person ':'Tutor ')+(i+1)+'</legend>'+
       keys.map(k=>'<label>'+esc(k==='type'?'Employee / subcontractor':k)+(k==='type'?'<select data-v12-row="'+esc(name)+'" data-v12-index="'+i+'" data-v12-key="'+esc(k)+'"><option value="employee" '+(p?.type!=='subcontractor'?'selected':'')+'>Employee</option><option value="subcontractor" '+(p?.type==='subcontractor'?'selected':'')+'>Subcontractor</option></select>':'<input type="text" data-v12-row="'+esc(name)+'" data-v12-index="'+i+'" data-v12-key="'+esc(k)+'" value="'+esc(p?.[k]||'')+'">')+'</label>').join('')+
       '<button type="button" class="v12-link" data-v12-remove="'+esc(name)+'" data-v12-index="'+i+'">Remove</button></fieldset>';
   }).join('')+'<button class="button secondary" type="button" data-v12-add="'+esc(name)+'" '+(rows.length>=(f.type==='people'?4:20)?'disabled':'')+'>Add '+(f.type==='people'?'person':'tutor')+'</button></div>';
  }else if(f.type==='courses'){
   if(courseSource.loading)control='<p class="v12-muted">Loading active GTi courses from the CRM Courses module…</p>';
   else if(courseSource.error)control='<p class="v12-warning">GTi courses unavailable: '+esc(courseSource.error)+'. Do not substitute free-text course names.</p>';
   else if(courseSource.incomplete)control='<p class="v12-warning">The CRM Courses result exceeded the supported page limit. A complete catalogue is required before continuing.</p>';
   else if(!courseSource.loaded)control='<p class="v12-muted">Waiting for the active GTi course catalogue…</p>';
   else if(!courseSource.items.length)control='<p class="v12-warning">No active GTi courses were returned from the CRM Courses module.</p>';
   else{
     const selected=Array.isArray(raw)?raw:[];
     control='<div class="v12-choice-grid">'+courseSource.items.map(c=>'<label class="v12-choice"><input type="checkbox" '+base+' value="'+esc(c.id)+'" '+(selected.includes(c.id)?'checked':'')+'><span><strong>'+esc(c.name)+'</strong>'+(c.category?'<small> · '+esc(c.category)+'</small>':'')+'</span></label>').join('')+'</div>';
   }
 }else if(f.type==='select'){
   control='<select id="'+fid+'"'+base+'><option value="">Choose an option</option>'+options.map(o=>'<option value="'+esc(o.value)+'" '+(String(raw||'')===String(o.value)?'selected':'')+'>'+esc(o.label)+'</option>').join('')+'</select>';
 }else if(f.type==='textarea'){
   control='<textarea id="'+fid+'"'+base+' rows="4">'+esc(raw||'')+'</textarea>';
 }else{
   const type=['email','tel','number','date'].includes(f.type)?f.type:'text';
   let attr=type==='date'?(' min="'+startLimits().min+'" max="'+startLimits().max+'"'):'';
   if(type==='number'){attr+=' min="'+(f.min??0)+'"';if(f.max)attr+=' max="'+f.max+'"';}
   control='<input id="'+fid+'" type="'+type+'"'+base+attr+' value="'+esc(raw??'')+'" />';
 }
 const triggered=(f.stopOn!==undefined&&raw===f.stopOn)||(f.stopAbove!==undefined&&Number(raw)>f.stopAbove);const info=introText(f.info)+introText(f.note)+(raw==='yes'?introText(f.yesNote):'')+(f.hint?'<p class="v12-muted">'+esc(f.hint)+'</p>':'')+(f.noMessage&&raw==='no'?'<p class="v12-warning">'+esc(f.noMessage)+'</p>':'')+(triggered?'<p class="v12-warning">'+esc(f.stopMessage||'Please contact the Guild before proceeding.')+'</p>':'');
 return '<div class="v12-form-field '+(errors?.[name]?'invalid':'')+'">'+(f.type==='checkbox'?'':'<label for="'+fid+'">'+label+'</label>')+control+info+err+'</div>';
}
function prefill(j){
 if(!j?.contact)return;
 const c=j.contact,a=j.answers||{};
 const src={firstName:c.First_Name,lastName:c.Last_Name,email:c.Email,mobile:c.Mobile||c.Phone,phone:c.Phone,
  title:c.Salutation,tradingName:c.Business_Trading_Name||c.Full_Name||[c.First_Name,c.Last_Name].filter(Boolean).join(' '),
  address1:c.Correspondence_Address_Line_1||c.Mailing_Street,address2:c.Correspondence_Address_Line_2,
  address3:c.Correspondence_Address_Line_3,town:c.Correspondence_Town||c.Mailing_City,
  county:c.Correspondence_County||c.Mailing_State,postcode:c.Correspondence_Postcode||c.Mailing_Zip,
  contactCountry:c.Correspondence_Country||c.Mailing_Country,country:c.Correspondence_Country||c.Mailing_Country};
 for(const [k,value]of Object.entries(src)){if(!nonblank(a[k])&&nonblank(value))a[k]=value;}
 j.answers=a;
}
function render(j){
 if(!j?.kind||j.step<0)return '';
 const steps=config(j.kind,j.answers).filter(s=>show(s,j.answers));
 const idx=Math.min(j.step,steps.length),step=steps[idx],review=idx===steps.length;
 const names=['Customer',...steps.map(s=>s.title),'Review / Payment'];
 const crumb='<div class="v12-stepper">'+names.map((n,i)=>'<span class="'+(i===idx+1?'current':i<idx+1?'done':'')+'">'+(i+1)+'. '+esc(n)+'</span>').join('')+'</div>';
 const ctx='<div class="v12-customer-context"><strong>'+esc([j.contact?.First_Name,j.contact?.Last_Name].filter(Boolean).join(' ')||j.contact?.Full_Name||'Selected CRM Contact')+'</strong><span>'+esc(j.contact?.Email||'No email recorded')+'</span><span>CRM Contact ID: '+esc(j.contact?.id||'')+'</span></div>';
 let body='';
 if(review){
   const all=steps.flatMap(s=>s.fields||[]).filter(f=>show(f,j.answers)&&nonblank(j.answers[f.name]));
   body='<h3>Application review and quotation</h3><p>Confirm the information supplied by the customer. The signed Catalyst API determines eligibility and prices; staff entries are not independent customer declarations.</p>'+
     '<dl class="v12-review">'+all.map(f=>'<div><dt>'+esc(f.label)+'</dt><dd>'+esc(Array.isArray(j.answers[f.name])?j.answers[f.name].map(x=>typeof x==='object'?JSON.stringify(x):x).join(', '):j.answers[f.name])+'</dd></div>').join('')+'</dl>'+
     '<div class="v12-quote-actions"><button type="button" class="button primary" data-action="journey-quote" '+(j.quotePending?'disabled':'')+'>Calculate live quotation</button></div>'+
     (j.quotePending?'<p class="v12-muted">Requesting current pricing and assessment…</p>':'')+
     (j.quoteError?'<p class="v12-warning" role="alert">'+esc(j.quoteError)+'</p>':'')+
     (j.liveQuote?'<h4>Authoritative quote / assessment response</h4><pre class="v12-quote-output">'+esc(JSON.stringify(j.liveQuote,null,2))+'</pre>':'')+
     (j.liveQuote?'<div class="v12-payment-panel"><h4>Secure customer payment</h4><label class="v12-choice"><input type="checkbox" id="staff-customer-accepted" /><span>I confirm that the customer explicitly agreed to the Code of Ethics and Terms of Business.</span></label><p class="v12-muted">Payment is completed by the customer in Stripe Checkout. Payment status comes from CRM after the existing processing integration updates it.</p><button class="button primary" type="button" data-action="journey-payment" '+(j.paymentBusy?'disabled':'')+'>Generate test payment link</button>'+(j.paymentError?'<p class="v12-warning">'+esc(j.paymentError)+'</p>':'')+(j.paymentAlreadyPaid?'<p>Already paid according to the checkout service. Refresh the CRM record to view the authoritative payment status.</p>':'')+(j.paymentLink?'<p><button type="button" class="button secondary" data-action="journey-copy-payment">Copy payment link</button> <button type="button" class="button secondary" data-action="journey-open-payment">Open Stripe Checkout</button></p>':'')+'</div>':'<p class="v12-muted">Obtain a successful quotation before initiating payment.</p>');
 }else{
   const errors=j.v12Errors||{};
   const intro=typeof step.intro==='function'?step.intro(j.answers):step.intro;
   body='<span class="process-kicker">STEP '+(idx+1)+' OF '+steps.length+'</span><h3>'+esc(step.title)+'</h3><p class="v12-muted">'+esc(step.description||'')+'</p>'+introText(intro)+
      (j.kind==='accreditation'&&step.id==='centre'?'<button type="button" class="button secondary" data-v12-copy="centre">Copy applicant contact details to training centre</button>':'')+
     '<div class="v12-form-grid">'+(step.fields||[]).map(f=>fieldHtml(f,j.answers,errors)).join('')+'</div>'+
     (step.demands?'<p class="v12-warning">Staff must obtain and record the customer’s actual confirmation of the demands-and-needs information.</p>':'');
 }
 return '<section class="v12-journey"><header><span class="process-kicker">STAFF-ASSISTED APPLICATION · PORTAL V2 QUESTIONS</span><h2>'+esc(j.kind[0].toUpperCase()+j.kind.slice(1))+'</h2></header>'+
  '<p class="v12-muted">Staff-assisted application. CRM draft saving is not available until the staff applications API is deployed.</p>'+
  ctx+crumb+'<div class="v12-journey-body">'+body+'</div>'+
  (j.draftsMessage?'<p role="status" class="v12-muted">'+esc(j.draftsMessage)+'</p>':'')+
  (j.draftsError?'<p role="alert" class="v12-warning">'+esc(j.draftsError)+'</p>':'')+
  (Array.isArray(j.availableDrafts)&&j.availableDrafts.length?'<section class="v12-detail-section"><h3>Saved customer drafts</h3>'+j.availableDrafts.map(d=>'<button type="button" class="button secondary" data-action="journey-load-draft" data-id="'+esc(d.id)+'" data-service="'+esc(d.service)+'">Resume '+esc(d.service)+' · '+esc(d.id)+'</button>').join('')+'</section>':'')+
  (j.formError?'<div class="v12-form-error" role="alert">'+esc(j.formError)+'</div>':'')+
  (review&&j.kind==='membership'?(window.BGStaffAddons?.journeyPanel('membership')||''):'')+
  '<footer class="journey-footer"><button class="button secondary" type="button" data-action="journey-back">Back</button>'+
   (!review?'<button class="button primary" type="button" data-action="journey-next">Continue</button>':'')+
   '<button class="button secondary" type="button" data-action="journey-save" '+(j.draftsBusy?'disabled':'')+'>Save to CRM</button><button class="button secondary" type="button" data-action="journey-drafts">Resume draft</button>'+
   '<button class="linklike" type="button" data-action="journey-reset">Start again</button></footer></section>';
}
function setField(j,el){
 const k=el.dataset.v12Field;if(!k)return false;
 const f=config(j.kind,j.answers).flatMap(s=>s.fields||[]).find(x=>x.name===k);
 if(!f)return false;
 if(f.type==='checkbox')j.answers[k]=Boolean(el.checked);
 else if(f.type==='multi'||f.type==='courses'){
  const a=Array.isArray(j.answers[k])?[...j.answers[k]]:[];
  j.answers[k]=el.checked?[...new Set([...a,el.value])]:a.filter(x=>x!==el.value);
 }else j.answers[k]=el.value;
 delete j.v12Errors?.[k];j.formError='';
 return true;
}
function input(j,el){
 if(!j||j.step<0)return false;
 if(el.dataset?.v12Field)return setField(j,el);
 if(el.dataset?.v12Row){
  const name=el.dataset.v12Row,index=Number(el.dataset.v12Index),key=el.dataset.v12Key;
  if(!Number.isInteger(index)||index<0||index>20||!['firstName','lastName','surname','email','type'].includes(key))return false;
  const a=Array.isArray(j.answers[name])?[...j.answers[name]]:[];
  while(a.length<=index)a.push({});
  a[index]={...a[index],[key]:el.value};j.answers[name]=a;j.formError='';return true;
 }
 return false;
}
function click(j,el){
 if(!j||j.step<0)return false;
 if(el.dataset?.v12Copy==='centre'&&j.kind==='accreditation'){
   for(const [from,to]of Object.entries(COPY_HOME_MAP))if(nonblank(j.answers[from]))j.answers[to]=j.answers[from];
   return true;
 }
 const add=el.dataset?.v12Add,remove=el.dataset?.v12Remove;
 const name=add||remove;if(!['insNamedPeople','tutors'].includes(name))return false;
 const a=Array.isArray(j.answers[name])?[...j.answers[name]]:[];
 if(add&&a.length<(name==='insNamedPeople'?4:20))a.push(name==='insNamedPeople'?{type:'employee',firstName:'',lastName:''}:{firstName:'',surname:'',email:''});
 if(remove){const i=Number(el.dataset.v12Index);if(Number.isInteger(i)&&i>=0&&i<a.length)a.splice(i,1);}
 j.answers[name]=a;return true;
}
function advance(j,delta){
 const steps=config(j.kind,j.answers).filter(s=>show(s,j.answers));
 if(delta<0){j.step=Math.max(-1,j.step-1);j.v12Errors={};j.formError='';return true;}
 const section=steps[j.step];if(!section)return false;
 const fields=resolveFields((section.fields||[]).filter(f=>show(f,j.answers)),j.answers);
 const errors=validatePortal(fields.filter(f=>f.type!=='courses'),j.answers);
 if(fields.some(f=>f.type==='courses'&&f.required)&&(!courseSource.loaded||courseSource.error||courseSource.incomplete))errors.courseIds='A complete, authorised GTi course catalogue is required before continuing.';
 const stops=j.kind!=='accreditation'?stopMessages(j.answers):[];
 if(stops.length)j.formError=stops[0];
 if(Object.keys(errors).length){j.v12Errors=errors;j.formError=j.formError||'Complete the highlighted required fields before continuing.';return false;}
 if(stops.length)return false;
 j.v12Errors={};j.formError='';j.step=Math.min(steps.length,j.step+1);return true;
}
window.BGJourney12={config,prefill,render,advance,input,click,loadCourses,courseSource,INSURANCE_STEPS,accreditationSteps};
