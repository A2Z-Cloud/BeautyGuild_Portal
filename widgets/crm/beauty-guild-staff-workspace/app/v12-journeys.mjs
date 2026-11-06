/* V1.2 staff questionnaire: reuses the exact Portal V2 insurance and accreditation definitions.
 * This is an application intake only. Without the staff-authorised Catalyst adapter it MUST NOT
 * create a quote, CRM application, payment link or imply that customer declarations were verified. */
import {INSURANCE_STEPS,visibleSteps,stopMessages,TREATMENT_OPTIONS,toRequest as insuranceRequest} from './portal-defs/insuranceInputs.js';
import {accreditationSteps,resolveFields,COPY_HOME_MAP} from './portal-defs/accreditationInputs.js';
import {validate as validatePortal} from './portal-defs/logic.mjs';
import {startLimits} from './portal-defs/startDate.js';
import {LEGAL,policyDocuments} from './portal-defs/legal.js';
const countries=[
  'United Kingdom',
  'England',
  'Scotland',
  'Wales',
  'Northern Ireland',
  'Ireland',
  'Afghanistan',
  'Albania',
  'Algeria',
  'Andorra',
  'Angola',
  'Antigua and Barbuda',
  'Argentina',
  'Armenia',
  'Australia',
  'Austria',
  'Azerbaijan',
  'Bahamas',
  'Bahrain',
  'Bangladesh',
  'Barbados',
  'Belarus',
  'Belgium',
  'Belize',
  'Benin',
  'Bhutan',
  'Bolivia',
  'Bosnia and Herzegovina',
  'Botswana',
  'Brazil',
  'Brunei',
  'Bulgaria',
  'Burkina Faso',
  'Burundi',
  'Cabo Verde',
  'Cambodia',
  'Cameroon',
  'Canada',
  'Central African Republic',
  'Chad',
  'Chile',
  'China',
  'Colombia',
  'Comoros',
  'Congo (Brazzaville)',
  'Congo (Kinshasa)',
  'Costa Rica',
  'Croatia',
  'Cuba',
  'Cyprus',
  'Czechia',
  'Denmark',
  'Djibouti',
  'Dominica',
  'Dominican Republic',
  'Ecuador',
  'Egypt',
  'El Salvador',
  'Equatorial Guinea',
  'Eritrea',
  'Estonia',
  'Eswatini',
  'Ethiopia',
  'Fiji',
  'Finland',
  'France',
  'Gabon',
  'Gambia',
  'Georgia',
  'Germany',
  'Ghana',
  'Greece',
  'Grenada',
  'Guatemala',
  'Guernsey',
  'Guinea',
  'Guinea-Bissau',
  'Guyana',
  'Haiti',
  'Honduras',
  'Hungary',
  'Iceland',
  'India',
  'Indonesia',
  'Iran',
  'Iraq',
  'Isle of Man',
  'Israel',
  'Italy',
  'Jamaica',
  'Japan',
  'Jersey',
  'Jordan',
  'Kazakhstan',
  'Kenya',
  'Kiribati',
  'Kosovo',
  'Kuwait',
  'Kyrgyzstan',
  'Laos',
  'Latvia',
  'Lebanon',
  'Lesotho',
  'Liberia',
  'Libya',
  'Liechtenstein',
  'Lithuania',
  'Luxembourg',
  'Madagascar',
  'Malawi',
  'Malaysia',
  'Maldives',
  'Mali',
  'Malta',
  'Marshall Islands',
  'Mauritania',
  'Mauritius',
  'Mexico',
  'Micronesia',
  'Moldova',
  'Monaco',
  'Mongolia',
  'Montenegro',
  'Morocco',
  'Mozambique',
  'Myanmar',
  'Namibia',
  'Nauru',
  'Nepal',
  'Netherlands',
  'New Zealand',
  'Nicaragua',
  'Niger',
  'Nigeria',
  'North Korea',
  'North Macedonia',
  'Norway',
  'Oman',
  'Pakistan',
  'Palau',
  'Palestine',
  'Panama',
  'Papua New Guinea',
  'Paraguay',
  'Peru',
  'Philippines',
  'Poland',
  'Portugal',
  'Qatar',
  'Romania',
  'Russia',
  'Rwanda',
  'Saint Kitts and Nevis',
  'Saint Lucia',
  'Saint Vincent and the Grenadines',
  'Samoa',
  'San Marino',
  'Sao Tome and Principe',
  'Saudi Arabia',
  'Senegal',
  'Serbia',
  'Seychelles',
  'Sierra Leone',
  'Singapore',
  'Slovakia',
  'Slovenia',
  'Solomon Islands',
  'Somalia',
  'South Africa',
  'South Korea',
  'South Sudan',
  'Spain',
  'Sri Lanka',
  'Sudan',
  'Suriname',
  'Sweden',
  'Switzerland',
  'Syria',
  'Taiwan',
  'Tajikistan',
  'Tanzania',
  'Thailand',
  'Timor-Leste',
  'Togo',
  'Tonga',
  'Trinidad and Tobago',
  'Tunisia',
  'Turkey',
  'Turkmenistan',
  'Tuvalu',
  'Uganda',
  'Ukraine',
  'United Arab Emirates',
  'United States',
  'Uruguay',
  'Uzbekistan',
  'Vanuatu',
  'Vatican City',
  'Venezuela',
  'Vietnam',
  'Yemen',
  'Zambia',
  'Zimbabwe',
  'Other',
];
const branches=[['beauty','Beauty Therapists'],['holistic','Holistic Therapists'],['nails','Nail Technicians'],['hair','Hairdressers & Barbers']];
const choices=x=>x.map(([value,label])=>({value,label}));
const field=(name,label,type='text',required=false,more={})=>({name,label,type,required,...more});
const byName=(name,label,opts,more={})=>field(name,label,'radio',true,{options:choices(opts),...more});
const UK_GROUP=new Set(['united kingdom','uk','great britain','england','scotland','wales','northern ireland']);
const isUk=c=>UK_GROUP.has(String(c||'').trim().toLowerCase());
const workingOptions=INSURANCE_STEPS.flatMap(x=>x.fields||[]).find(x=>x.name==='insWorking')?.options||[];
const requestedInsurance=a=>isUk(a.country)&&a.insuranceRequired==='yes';
const membershipBase=[
 {id:'about',title:'About you',description:'Country and customer requirements determine the membership. Staff cannot choose the membership level.',fields:[
  field('country','Where are you based?','select',true,{options:choices(countries.map(c=>[c,c]))}),
  byName('insuranceRequired','Do you require insurance?',[['yes','Yes'],['no','No']],{when:a=>isUk(a.country)}),
  field('branch','Primary Guild branch','radio',true,{options:choices(branches)})]},
 {id:'working',title:'How you work',description:'Choose one way of working. The portal will determine whether Salon or Non-Salon cover applies.',when:a=>requestedInsurance(a),fields:[
  field('working','How do you work?','radio',true,{options:workingOptions})]},
 {id:'details',title:'Membership details',description:'Review the member and correspondence details.',fields:[
  byName('purchaseType','Application type',[['new','New member'],['renewal','Renewal'],['upgrade','Upgrade']]),
  byName('billing','Payment frequency',[['annual','Annually'],['monthly','Monthly']],{when:a=>isUk(a.country)}),
  field('start','Start date','date',true,{limit:'start'}),
  field('firstName','First name','text',true),field('lastName','Surname','text',true),field('email','Email address','email',true),
  field('tradingName','Trading name','text',true),field('mobile','Mobile','tel',false),
  field('address1','Address line 1','text',true),field('address2','Address line 2'),
  field('town','Town or city','text',true),field('county','County'),field('postcode','Postcode','text',true)]},
 {id:'extras',title:'Additional branches and add-ons',description:'Membership extras and branches use the existing server pricing.',fields:[
  field('branches','Additional branches','multi',false,{options:choices(branches),excludePrimary:true}),
  ...['bundle','certificate','badge','sticker'].map(x=>field('addon_'+x,({bundle:'Membership bundle',certificate:'Certificate',badge:'Badge',sticker:'Window sticker'})[x],'number',false,{min:0,max:10}))]},
 {id:'terms',title:'Membership declarations',description:'The customer must personally confirm the Guild terms and Code of Ethics before payment.',fields:[
  field('accepted','Customer confirmed the Guild Terms of Business, Privacy Policy and Code of Ethics','checkbox',true)]}
];
const INSURANCE_GROUPS={
 business:['people','standardTreatments','treatments','teaching','property'],
 cover:['equipment','el','contents','money','buildings','bi','propertyAway'],
 declarations:['declarations','demands']
};
function insuranceGroup(key,a){
 const included=new Set(INSURANCE_GROUPS[key]);
 return INSURANCE_STEPS.filter(step=>included.has(step.id)&&(!step.when||step.when({...a,insWorking:a.working?[a.working]:[]}))).map(step=>({
  ...step,fields:(step.fields||[]).filter(f=>f.name!=='insWorking')
 }));
}
function membershipSteps(a){
 if(!requestedInsurance(a))return membershipBase.filter(step=>step.id!=='working');
 const byId=id=>membershipBase.find(step=>step.id===id);
 return [
  byId('about'),byId('working'),
  {id:'business',title:'Business and treatments',description:'Insurance business information and treatments.',fields:insuranceGroup('business',a).flatMap(x=>x.fields)},
  {id:'cover',title:'Insurance cover options',description:'Choose relevant cover using the Portal V2 questions.',fields:insuranceGroup('cover',a).flatMap(x=>x.fields)},
  {id:'declarations',title:'Insurance declarations',description:'Confirm applicable insurance declarations with the customer.',fields:insuranceGroup('declarations',a).flatMap(x=>x.fields)},
  byId('details'),byId('extras'),byId('terms')
 ];
}
const insuranceAbout=[{id:'about',title:'Applicant and territory',description:'Customer details and location used by the Insurance quotation.',fields:[
 field('firstName','First name','text',true),field('lastName','Surname','text',true),field('email','Email address','email',true),
 field('mobile','Mobile','tel',false),field('country','Where are you based?','select',true,{options:choices(countries.map(c=>[c,c]))})]}];
const insuranceStart={id:'start',title:'Cover start date',description:'Requested insurance cover date, up to 30 days ahead.',fields:[field('start','Start date','date',true,{limit:'start'})]};
function config(kind,answers){
 if(kind==='membership')return membershipSteps(answers);
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
 if(j.kind==='membership'&&a.working)a.insWorking=[a.working];
 j.answers=a;
}
const pounds=p=>Number.isFinite(Number(p))?'£'+(Number(p)/100).toLocaleString('en-GB',{minimumFractionDigits:2,maximumFractionDigits:2}):'Not provided';
function quoteSummary(result){
 const q=result?.quote;if(!q)return '';
 const lines=Array.isArray(q.lines)?q.lines:[];
 const decision=q.decision;
 return '<section class="v12-payment-panel"><h4>'+esc(q.service||'')+' quotation</h4>'+
 (decision?.level?'<p><strong>Membership: '+esc(String(decision.level).replaceAll('_',' '))+'</strong>'+ (decision.message?' · '+esc(decision.message):'')+'</p>':'')+
 '<p><strong>'+esc(q.alreadyPaid?'Already paid':q.payable?'Payable quotation':'Review required')+'</strong></p>'+
 (q.blocked?'<p class="v12-warning">'+esc(q.blocked.riskMessage||q.blocked.message||q.blocked.reasons?.join(' ')||'Referral or assessment required before payment.')+'</p>':'')+
 '<div class="v12-quote-lines">'+lines.map(l=>'<div><span>'+esc(l.name)+' × '+esc(l.quantity||1)+'</span><strong>'+esc(pounds(l.totalPence))+'</strong></div>').join('')+'</div>'+
 '<p><strong>Quoted total: '+esc(pounds(q.totalPence))+'</strong></p>'+
 (q.plan?'<p>First payment '+esc(pounds(q.plan.firstPaymentPence))+'; later payments '+esc(pounds(q.plan.laterPaymentPence))+'; year-one total '+esc(pounds(q.plan.yearOneTotalPence))+'</p>':'')+
 (q.discounts?.length?'<p>Discounts: '+q.discounts.map(d=>esc(d.label||d.name||'Applied discount')).join(', ')+'</p>':'')+
 (q.codeResult?.message?'<p class="v12-warning">'+esc(q.codeResult.message)+'</p>':'')+
 '</section>';
}
function documentsPanel(j){
 const a=j.answers||{},insured=j.kind==='membership'&&requestedInsurance(a);
 const docs=insured?policyDocuments(a):[];
 const keys=insured?['terms','privacy','treatments','ethics']:['terms','privacy','ethics'];
 const links=keys.map(k=>'<a href="'+esc(LEGAL[k].href)+'" target="_blank" rel="noopener noreferrer">'+esc(LEGAL[k].label)+'</a>').join(' · ');
 return '<div class="staff-price-docs"><h4>Documents and links</h4>'+
  (docs.length?'<ul>'+docs.map(d=>'<li><span>'+esc(d.name)+'</span><small>Included</small></li>').join('')+'</ul>':'')+
  '<p class="staff-price-copy">Share before the customer buys: '+links+'.</p>'+
  (docs.length?'<p class="staff-price-copy">The customer receives these policy documents with their cover.</p>':'')+'</div>';
}
function pricingAside(j){
 const a=j.answers||{},q=j.liveQuote?.quote;
 const fmt=v=>v===undefined||v===null?'—':pounds(v);
 const kind=j.kind==='membership'?'Membership':j.kind==='insurance'?'Insurance':'Accreditation';
 const sel=j.kind==='membership'
  ?[j.liveQuote?.quote?.decision?.level?['Member type',String(j.liveQuote.quote.decision.level).replaceAll('_',' ')]:null,a.billing?['Billing',a.billing==='monthly'?'Monthly':'Annual']:null,requestedInsurance(a)?['Insurance','Requested']:null,Array.isArray(a.branches)&&a.branches.length?['Extra branches',String(a.branches.length)]:null]
  :j.kind==='insurance'?[a.start?['Start date',a.start]:null]:[a.billing?['Billing',a.billing]:null];
 const lines=(q&&Array.isArray(q.lines)?q.lines:[]).slice(0,12).map(l=>'<div class="staff-price-line"><span>'+esc(l.name||'Item')+'</span><strong>'+fmt(l.totalPence)+'</strong></div>').join('');
 const selections=sel.filter(Boolean).map(x=>'<div class="staff-price-line"><span>'+esc(x[0])+'</span><strong>'+esc(x[1])+'</strong></div>').join('');
 const extra=q?.plan?'<div class="staff-price-line"><span>First payment</span><strong>'+fmt(q.plan.firstPaymentPence)+'</strong></div><div class="staff-price-line"><span>Later payments</span><strong>'+fmt(q.plan.laterPaymentPence)+'</strong></div>':'';
 const message=q?'Authoritative Catalyst quotation. Changes to the application invalidate this amount.':'Prices are confirmed by the Beauty Guild pricing service. Continue answering questions, then calculate a quote before sharing an amount.';
 return '<aside class="staff-price-rail" aria-label="Application price summary"><div class="staff-price-head"><h3>Price summary</h3><span class="staff-price-status">'+(q?(q.payable?'Verified quote':'Review required'):'Quote needed')+'</span></div>'+
 '<p class="staff-price-customer">'+esc(kind)+(j.contact?' · '+esc([j.contact.First_Name,j.contact.Last_Name].filter(Boolean).join(' ')||j.contact.Full_Name||'Selected customer'):'')+'</p>'+
 (q?lines:selections)+extra+
 '<div style="padding-top:13px"><span class="staff-price-copy">'+(q?'Quoted amount':'Pay today')+'</span><div class="staff-price-total">'+(q?fmt(q.totalPence):'—')+'</div>'+
 '<p class="staff-price-copy">'+message+'</p></div>'+documentsPanel(j)+'</aside>';
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
     '<div class="v12-quote-actions"><button type="button" class="button primary" data-action="journey-quote" '+(j.quotePending||j.kind==='accreditation'&&!j.accreditationSubmitted?'disabled title="Submit Accreditation before pricing"':'')+'>Calculate live quotation</button></div>'+
     (j.quotePending?'<p class="v12-muted">Requesting current pricing and assessment…</p>':'')+
     (j.quoteError?'<p class="v12-warning" role="alert">'+esc(j.quoteError)+'</p>':'')+
     (j.liveQuote?quoteSummary(j.liveQuote):'')+
     (j.kind==='accreditation'&&j.remote?.id?'<p><button class="button secondary" type="button" data-action="journey-accreditation-submit">Submit saved Accreditation application</button></p>':'')+
     (j.liveQuote?.quote?.payable&&!j.liveQuote?.quote?.alreadyPaid&&!j.discountedQuote?'<div class="v12-payment-panel"><h4>Secure customer payment</h4><label class="v12-choice"><input type="checkbox" id="staff-customer-accepted" '+(j.customerAccepted?'checked':'')+' /><span>I confirm that the customer explicitly agreed to the Code of Ethics and Terms of Business.</span></label><p class="v12-muted">Payment is completed by the customer in Stripe Checkout. Payment status comes from CRM after the existing processing integration updates it.</p><button class="button primary" type="button" data-action="journey-payment" '+(j.paymentBusy?'disabled':'')+'>Generate test payment link</button>'+(j.paymentError?'<p class="v12-warning">'+esc(j.paymentError)+'</p>':'')+(j.paymentAlreadyPaid?'<p>Already paid according to the checkout service. Refresh the CRM record to view the authoritative payment status.</p>':'')+(j.paymentLink?'<p><button type="button" class="button secondary" data-action="journey-copy-payment">Copy payment link</button> <button type="button" class="button secondary" data-action="journey-open-payment">Open Stripe Checkout</button></p>':'')+
 '<p><button type="button" class="button secondary" data-action="journey-refresh-payment" '+(j.paymentStatusBusy?'disabled':'')+'>Refresh CRM payment status</button></p>'+
 (j.paymentCrm?'<dl class="v12-review">'+[['Payment status',j.paymentCrm.Payment_Status],['Application status',j.paymentCrm.Application_Status||j.paymentCrm.Application_Stage],['Policy status',j.paymentCrm.Policy_Status],['CRM stage',j.paymentCrm.Stage],['Checked at',j.paymentCrm.checkedAt]].map(([k,v])=>'<div><dt>'+esc(k)+'</dt><dd>'+esc(v??'Not recorded')+'</dd></div>').join('')+'</dl>':'')+'</div>':(j.discountedQuote?'<p class="v12-warning">This quotation includes a voucher or waiver. Staff payment links cannot redeem discounts yet. Remove discounts and requote before payment.</p>':'<p class="v12-muted">Obtain a successful quotation before initiating payment.</p>'));
 }else{
   const errors=j.v12Errors||{};
   const intro=typeof step.intro==='function'?step.intro(j.answers):step.intro;
   body='<span class="process-kicker">STEP '+(idx+1)+' OF '+steps.length+'</span><h3>'+esc(step.title)+'</h3><p class="v12-muted">'+esc(step.description||'')+'</p>'+introText(intro)+
      (j.kind==='accreditation'&&step.id==='centre'?'<button type="button" class="button secondary" data-v12-copy="centre">Copy applicant contact details to training centre</button>':'')+
     '<div class="v12-form-grid">'+(step.fields||[]).map(f=>fieldHtml(f,j.answers,errors)).join('')+'</div>'+
     (step.demands?'<p class="v12-warning">Staff must obtain and record the customer’s actual confirmation of the demands-and-needs information.</p>':'');
 }
 return '<section class="v12-journey"><header><span class="process-kicker">STAFF-ASSISTED APPLICATION · PORTAL V2 QUESTIONS</span><h2>'+esc(j.kind[0].toUpperCase()+j.kind.slice(1))+'</h2></header>'+
   '<p class="v12-muted">Staff-assisted journey using the shared CRM draft and Portal V2 quotation services.</p>' +
  ctx+crumb+
  (j.kind==='membership'&&j.step>=0?'<section class="v12-journey-tools"><strong>Existing membership changes</strong><p class="v12-muted">For a renewal or upgrade, retrieve eligible options from the selected customer’s existing CRM membership.</p><input id="staff-membership-record-id" inputmode="numeric" placeholder="CRM Membership Deal ID" /><button class="button secondary" type="button" data-action="journey-membership-options" '+(j.membershipOptionsLoading?'disabled':'')+'>Load membership options</button>'+(j.optionsError?'<p role="alert" class="v12-warning">'+esc(j.optionsError)+'</p>':'')+(j.membershipOptions?'<pre class="v12-quote-output">'+esc(JSON.stringify(j.membershipOptions,null,2))+'</pre>':'')+'</section>':'')+
  '<div class="staff-journey-grid"><div class="staff-journey-primary"><div class="v12-journey-body">'+body+'</div></div>'+pricingAside(j)+'</div>'+
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
function invalidateQuote(j){
 if(!j)return;
 j.liveQuote=null;j.lastQuoteInputs=null;j.paymentLink='';j.paymentAlreadyPaid=false;j.customerAccepted=false;j.paymentError='';
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
 if(j.kind==='membership'){
  if(k==='working')j.answers.insWorking=el.value?[el.value]:[];
  if(k==='country'&&!isUk(el.value)){j.answers.insuranceRequired='';j.answers.working='';j.answers.insWorking=[];j.answers.billing='annual';}
  if(k==='insuranceRequired'&&el.value!=='yes'){j.answers.working='';j.answers.insWorking=[];}
 }
 invalidateQuote(j);delete j.v12Errors?.[k];j.formError='';
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
  a[index]={...a[index],[key]:el.value};j.answers[name]=a;invalidateQuote(j);j.formError='';return true;
 }
 return false;
}
function click(j,el){
 if(!j||j.step<0)return false;
 if(el.dataset?.v12Copy==='centre'&&j.kind==='accreditation'){
   for(const [from,to]of Object.entries(COPY_HOME_MAP))if(nonblank(j.answers[from]))j.answers[to]=j.answers[from];
   invalidateQuote(j);return true;
 }
 const add=el.dataset?.v12Add,remove=el.dataset?.v12Remove;
 const name=add||remove;if(!['insNamedPeople','tutors'].includes(name))return false;
 const a=Array.isArray(j.answers[name])?[...j.answers[name]]:[];
 if(add&&a.length<(name==='insNamedPeople'?4:20))a.push(name==='insNamedPeople'?{type:'employee',firstName:'',lastName:''}:{firstName:'',surname:'',email:''});
 if(remove){const i=Number(el.dataset.v12Index);if(Number.isInteger(i)&&i>=0&&i<a.length)a.splice(i,1);}
 j.answers[name]=a;invalidateQuote(j);return true;
}
function advance(j,delta){
 const steps=config(j.kind,j.answers).filter(s=>show(s,j.answers));
 if(delta<0){j.step=Math.max(-1,j.step-1);j.v12Errors={};j.formError='';return true;}
 const section=steps[j.step];if(!section)return false;
 const fields=resolveFields((section.fields||[]).filter(f=>show(f,j.answers)),j.answers);
 const errors=validatePortal(fields.filter(f=>f.type!=='courses'),j.answers);
 if(fields.some(f=>f.type==='courses'&&f.required)&&(!courseSource.loaded||courseSource.error||courseSource.incomplete))errors.courseIds='A complete, authorised GTi course catalogue is required before continuing.';
 const stops=j.kind!=='accreditation'?stopMessages(j.answers):[];
 if(stops.length&&j.kind!=='membership' || stops.length&&requestedInsurance(j.answers))j.formError=stops[0];
 if(Object.keys(errors).length){j.v12Errors=errors;j.formError=j.formError||'Complete the highlighted required fields before continuing.';return false;}
 if(stops.length&&(j.kind!=='membership'||requestedInsurance(j.answers)))return false;
 j.v12Errors={};j.formError='';j.step=Math.min(steps.length,j.step+1);return true;
}
const CONSENT_KEYS=['accepted','termsAccepted','insInformationAccurate','insEthicsAccepted','insDemandsNeedsAccepted','insNonAdvisedAccepted'];
function draftAnswers(j){
 const a={...(j.answers||{})};
 for(const key of CONSENT_KEYS)delete a[key];
 if(j.kind==='accreditation')return a;
 const iv={...a};for(const key of CONSENT_KEYS)delete iv[key];
 if(j.kind==='insurance')return {insurance:{iv,country:a.country||'',start:a.start||''}};
 const addons={};
 for(const key of ['bundle','certificate','badge','sticker']){const n=Number(a['addon_'+key]||0);if(Number.isInteger(n)&&n>0)addons[key]=n;}
 const c={country:a.country||'',insuranceRequired:a.insuranceRequired||'',working:a.working||'',branch:a.branch||'',branches:a.branches||[],billing:isUk(a.country)?(a.billing||'annual'):'annual',addons,start:a.start||'',previousId:a.previousId||'',changeType:a.changeType||'',...(a.code?{code:a.code}:{})};
 const d={firstName:a.firstName||'',lastName:a.lastName||'',email:a.email||'',tradingName:a.tradingName||'',mobile:a.mobile||'',address1:a.address1||'',address2:a.address2||'',town:a.town||'',county:a.county||'',postcode:a.postcode||'',country:a.country||''};
 return {membership:{c,d},...(requestedInsurance(a)?{insurance:{iv:{...iv,insWorking:a.working?[a.working]:[]},country:a.country||''}}:{})};
}
function restoreAnswers(d){
 const a=d?.answers||{};
 if(d.service==='accreditation')return {...a};
 if(d.service==='insurance'&&a.insurance?.iv)return {...a.insurance.iv,country:a.insurance.country||'',start:a.insurance.start||''};
 if(a.membership?.c||a.membership?.f){
   const f=a.membership.c||a.membership.f,d=a.membership.d||{},ins=a.insurance;
   const answer=f.answers||f;const legacyWorking=Array.isArray(ins?.iv?.insWorking)&&ins.iv.insWorking.length===1?ins.iv.insWorking[0]:'';
   return {...d,...(ins?.iv||{}),branch:f.branch,branches:f.branches,billing:f.billing,start:f.start,previousId:f.previousId||'',changeType:f.changeType||'',code:f.code||'',country:answer.country||ins?.country||d.country||'',insuranceRequired:answer.insuranceRequired||(ins?'yes':'no'),working:answer.working||(ins?.iv?.insWorking?.length>1?'':legacyWorking),insWorking:answer.working?[answer.working]:(legacyWorking?[legacyWorking]:[]),...Object.fromEntries(Object.entries(f.addons||{}).map(([k,v])=>['addon_'+k,v]))};
 }
 return {...a};
}
function apiRequest(j){
 const a=j?.answers||{},kind=j?.kind;
 if(!j?.contact?.id)throw Error('Select a CRM customer first.');
 const addons={};
 for(const x of ['bundle','certificate','badge','sticker']){
  const quantity=Number(a['addon_'+x]||0);
  if(Number.isInteger(quantity)&&quantity>0)addons[x]=quantity;
 }
 const base={contactId:String(j.contact.id),service:kind,branch:String(a.branch||''),
   branches:Array.isArray(a.branches)?a.branches.join(','):(a.branches||''),
   billing:kind==='membership'&&!isUk(a.country)?'annual':String(a.billing||'annual'),
   addons,start:String(a.start||''),firstName:String(a.firstName||j.contact.First_Name||''),
   lastName:String(a.lastName||j.contact.Last_Name||''),country:String(a.country||''),
   businessName:String(a.tradingName||a.businessName||''),address1:String(a.address1||''),
   address2:String(a.address2||''),town:String(a.town||''),county:String(a.county||''),
   postcode:String(a.postcode||''),code:String(a.code||''),previousId:String(a.previousId||''),
   changeType:String(a.changeType||''),centreId:String(a.centreId||''),
   recordId:kind==='accreditation'?String(j.accreditationRecordId||''):String(a.recordId||'')};
 if(kind==='membership'){
   if(!a.country)throw Error('Choose where the customer is based.');
   if(isUk(a.country)&&!['yes','no'].includes(a.insuranceRequired))throw Error('Confirm whether insurance is required.');
   if(requestedInsurance(a)&&!a.working)throw Error('Choose one way of working.');
   base.answers={country:a.country};
   if(isUk(a.country)){
     base.answers.insuranceRequired=a.insuranceRequired;
     if(requestedInsurance(a))base.answers.working=a.working;
   }
   delete base.level;
   if(requestedInsurance(a))base.insurance=insuranceRequest({...a,insWorking:[a.working]});
 }else if(kind==='insurance'){
   base.insurance=insuranceRequest(a);
 }
 return base;
}
window.BGJourney12={TREATMENT_OPTIONS,apiRequest,draftAnswers,restoreAnswers,config,prefill,render,advance,input,click,loadCourses,courseSource,INSURANCE_STEPS,accreditationSteps};
