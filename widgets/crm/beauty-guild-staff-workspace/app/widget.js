/* Beauty Guild CRM Staff Workspace V1 - 21 October 2026.
   Live Zoho CRM SDK, no fake records. Existing native CRM actions remain authoritative.
   V1 writes only authorised Notes and Tasks. Creation/checkout are Coming Soon.
*/
(function () {
  'use strict';
  const M = Object.freeze({CONTACT:'Contacts',ACCOUNT:'Accounts',PROFILE:'Membership',DEAL:'Deals',ADDON:'Membership_Extension',POLICY:'Insurance_Policy',EXT:'Insurance_Extension',PERSON:'Insured_People',PREMISES:'Insured_Premises',DECLARATION:'Declarations',REVISION:'Policy_Revisions',ACC:'Training_Centre_Accred',CENTRE:'Training_Centres',QUAL:'Qualifications',OFFER:'TC_Course_Offering',TUTOR:'Tutor_Relationships',ACCLINK:'Accreditation_Centre_Link',ACCEXT:'Accreditation_Extensions',TASK:'Tasks'});
  const ICON_PATHS={
    'layout-dashboard':'<rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/>',
    'clipboard-list':'<rect x="5" y="4" width="14" height="17" rx="2"/><rect x="9" y="2" width="6" height="4" rx="1"/><path d="M9 11h6M9 15h6"/>',
    'contact-round':'<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M5 17c.7-2 2-3 4-3s3.3 1 4 3M15 9h3M15 13h3"/>',
    'users-round':'<circle cx="9" cy="8" r="3"/><path d="M3 20v-2a6 6 0 0 1 12 0v2M17 5a3 3 0 0 1 0 6M17 15a5 5 0 0 1 4 5"/>',
    'shield-check':'<path d="M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11Z"/><path d="m9 12 2 2 4-4"/>',
    'graduation-cap':'<path d="m2 10 10-5 10 5-10 5-10-5Z"/><path d="M6 12v5c3 2 9 2 12 0v-5M22 10v7"/>',
    'plus-circle':'<circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/>',
    'search':'<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
    'refresh-cw':'<path d="M20 8a8 8 0 0 0-14-2L4 8m0-5v5h5M4 16a8 8 0 0 0 14 2l2-2m0 5v-5h-5"/>',
    'arrow-up-right':'<path d="M7 17 17 7M8 7h9v9"/>',
    'chevron-right':'<path d="m9 18 6-6-6-6"/>',
    'arrow-left':'<path d="m12 19-7-7 7-7M5 12h14"/>',
    'file-search':'<path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9l-7-7Z"/><path d="M13 2v7h7"/><circle cx="10" cy="15" r="2.5"/><path d="m12 17 2 2"/>',
    'alert-circle':'<circle cx="12" cy="12" r="9"/><path d="M12 7v6M12 17h.01"/>',
    'sticky-note':'<path d="M4 3h16v13l-5 5H4V3Z"/><path d="M15 21v-5h5M8 8h8M8 12h5"/>',
    'list-todo':'<rect x="4" y="4" width="4" height="4" rx=".5"/><path d="m5 6 1 1 2-2M12 6h8M5 14h3M12 14h8M5 20h3M12 20h8"/>',
    'link':'<path d="M10 13a5 5 0 0 0 7 .5l3-3a5 5 0 0 0-7-7l-2 2M14 11a5 5 0 0 0-7-.5l-3 3a5 5 0 0 0 7 7l2-2"/>',
    'file-plus':'<path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9l-7-7Z"/><path d="M13 2v7h7M12 13v6M9 16h6"/>'
  };
  function icon(name){return '<svg class="ui-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">'+(ICON_PATHS[name]||ICON_PATHS['file-search'])+'</svg>';}
  function installStaticIcons(){document.querySelectorAll('[data-icon]').forEach(el=>{el.innerHTML=icon(el.dataset.icon);});}
  const VIEW_TITLES={processing:['Staff Workspace','Applications and customer records'],overview:['Customers','Contact, organisation and membership information'],membership:['Membership','Membership records and renewals'],insurance:['Insurance','Policies, cover and underwriting'],accreditation:['Accreditation','Applications, qualifications, centres and courses'],queue:['Applications','Applications requiring attention'],create:['New application','Create a customer application draft']};
  const VIEWS_FOR={Contacts:'overview',Accounts:'overview',Membership:'membership',Deals:'membership',Membership_Extension:'membership',Insurance_Policy:'insurance',Insurance_Extension:'insurance',Declarations:'insurance',Insured_People:'insurance',Insured_Premises:'insurance',Policy_Revisions:'insurance',Training_Centre_Accred:'accreditation',Training_Centres:'accreditation',Qualifications:'accreditation',TC_Course_Offering:'accreditation',Tutor_Relationships:'accreditation'};
  const ALL_ENTITIES=new Set(Object.values(M));
  const CONTACT_RELATIONS=[['Membership','Contact'],['Deals','Contact_Name'],['Insurance_Policy','Contact'],['Training_Centre_Accred','Applicant_Contact'],['Qualifications','Contact'],['Training_Centres','Contact']];
  const RELATIONS={
    Insurance_Policy:[['Insurance_Extension','Policy'],['Insured_People','Policy'],['Insured_Premises','Policy'],['Declarations','Insurance_Policy'],['Policy_Revisions','Policy']],
    Training_Centre_Accred:[['Accreditation_Centre_Link','Accreditation'],['Accreditation_Extensions','Accreditation'],['TC_Course_Offering','Accreditation'],['Tutor_Relationships','Accreditation'],['Qualifications','Primary_Accreditation']],
    Deals:[['Membership_Extension','Membership_Extension']]
  };
  // API names are the CRM related-list names, which can differ from module names.
  // Restricted or unavailable related lists are reported rather than silently omitted.
  const NATIVE_RELATIONS = Object.freeze({
    Contacts:[['Notes','Notes'],['Attachments','Attachments'],['Tasks','Tasks']],
    Accounts:[['Notes','Notes'],['Attachments','Attachments'],['Tasks','Tasks']],
    Membership:[['Notes','Notes'],['Attachments','Attachments']],
    Deals:[['Notes','Notes'],['Attachments','Attachments'],['Tasks','Tasks']],
    Insurance_Policy:[['Notes','Notes'],['Attachments','Attachments'],['Tasks','Tasks'],['Risk_Screenings','Risk screenings']],
    Training_Centre_Accred:[['Notes','Notes'],['Attachments','Attachments'],['Tasks','Tasks'],['Accreditation_Centre_Link','Accreditation centre links'],['Training_Centre_Course_Offering','Course offerings'],['Tutor_Relationship','Tutors']],
    Training_Centres:[['Notes','Notes'],['Attachments','Attachments'],['Tasks','Tasks']]
  });
  const STATUSES={ok:['paid','current','verified','approved','active','clear','complete','completed','fulfilled','scheduled'],danger:['declined','failed','cancelled','refunded','banned','rejected','expired'],attention:['refer','pending','outstanding','review','awaiting','processing','not paid','unverified','draft','needs']};
  const FIELDS={
    Accounts:[['Account_Name','Organisation'],['Email_Address','Email'],['Phone','Telephone'],['Website','Website'],['Address_Line_1','Address'],['Town','Town'],['Country','Country'],['Status','Status'],['Workdrive_Link','Documents']],
    Contacts:[['Full_Name','Full name'],['Email','Email'],['Mobile','Mobile'],['Phone','Phone'],['Catalyst_User_ID','Portal account ID'],['Correspondence_Postcode','Postcode']],
    Membership:[['Name','Member reference'],['Current_Member_Type','Member type'],['Current_Membership_Status','Current status'],['Is_GTI_Member','GTi member'],['Business_Trading_Name','Trading name'],['Require_Insurance','Requires insurance'],['Banned_From_Insurance','Banned from insurance'],['Has_Insurance_Issue','Insurance issue']],
    Deals:[['Deal_Name','Membership transaction'],['Stage','Membership stage'],['Membership_Type','Membership type'],['Membership_Branch','Guild branch'],['Purchase_Type','Purchase type'],['Payment_Status','Payment status'],['Start_Date','Start date'],['Expiry_Date','Expiry date'],['Amount','Amount'],['Membership_Subscription_Type','Billing frequency'],['Next_Payment_Date','Next payment date'],['Banned_From_Membership','Banned from membership'],['Banned_From_Insurance','Banned from insurance'],['Has_Insurance_Issue','Insurance issue']],
    Membership_Extension:[['Name','Extension'],['Extension_Type','Type'],['Status','Status'],['Payment_Status','Payment status'],['Quantity','Quantity'],['Final_Price','Price'],['Start_Date','Start date'],['End_Date','End date']],
    Insurance_Policy:[['Name','Policy reference'],['Insured_Trading_Name','Trading name'],['Application_Status','Application status'],['Underwriting_Status','Underwriting'],['Policy_Status','Policy status'],['Payment_Status','Payment status'],['Finance_Sync_Status','Finance sync'],['Policy_Type','Policy type'],['Policy_Start_Date','Start date'],['Policy_End_Date','End date'],['Annual_Turnover','Annual turnover'],['Entry_Route','Entry route'],['Risk_Status','Risk status'],['Member_Gate_Result','Member gate'],['Sanctions_Status','Sanctions'],['Sanctions_Checked_At','Last sanctions check'],['Manual_Review_Outcome','Manual review'],['Quote_Version','Quote version'],['Reprice_Required','Reprice required'],['Next_Action','Next action'],['Next_Action_Date','Next action date'],['Document_Status','Document status'],['Documents_Generated_At','Documents generated'],['Insurance_Schedule_Link','Schedule link'],['Statement_of_Fact_Link','Statement of fact'],['Workdrive_Link','WorkDrive'],['Stop_Reason','Stop reason']],
    Insurance_Extension:[['Name','Extension'],['Cover_Type','Cover'],['Cover_Code','Cover code'],['Cover_Option','Option'],['Status','Status'],['Sum_Insured','Sum insured'],['Premium_Net','Net premium'],['IPT_Amount','IPT'],['Gross_Amount','Gross amount'],['Effective_From','Effective from'],['Effective_To','Effective to']],
    Insured_People:[['Name','Name'],['First_Name','First name'],['Last_Name','Last name'],['Person_Type','Person type'],['Status','Status']],
    Insured_Premises:[['Name','Premises'],['Address_Line_1','Address'],['Town','Town'],['Postcode','Postcode'],['Country','Country']],
    Declarations:[['Name','Declaration'],['Previous_Claims_or_Losses','Claims or losses'],['Bankrupt_or_Insolvent','Insolvency'],['Known_Claim_Circumstances','Known circumstances'],['Criminal_Convictions','Convictions'],['Insurance_Declined','Previously declined'],['Qualifications_Held','Qualifications held'],['Information_Accurate','Information accurate'],['Terms_and_Privacy_Accepted','Terms accepted'],['Referral_Required','Referral required']],
    Policy_Revisions:[['Revision_Reference','Revision'],['Change_Type','Type'],['Change_Scope','Scope'],['Revision_Status','Status'],['Requested_Effective_Date','Requested date'],['Applied_Effective_Date','Applied date'],['Premium_Delta_Net','Net adjustment'],['IPT_Delta','IPT adjustment'],['Refund_Status','Refund status'],['Reason','Reason']],
    Training_Centre_Accred:[['Name','Accreditation reference'],['Application_Stage','Application stage'],['Accreditation_Status','Accreditation status'],['Accreditation_Level','Level'],['Payment_Status','Payment status'],['Purchase_Type','Purchase type'],['Valid_From','Valid from'],['Valid_To','Valid to'],['Total_Quoted','Quoted amount'],['Other_Tutors_Used','Uses other tutors'],['Number_of_Tutors','Number of tutors'],['Additional_Centres_Used','Additional centres']],
    Training_Centres:[['Name','Centre name'],['Centre_Status','Centre status'],['Email_Address','Email'],['Town','Town'],['Country','Country'],['Shown_on_Website','Shown on website']],
    Accreditation_Centre_Link:[['Name','Centre link'],['Centre_Relationship_Type','Relationship'],['Start_Date','Start date'],['End_Date','End date']],
    Accreditation_Extensions:[['Name','Extension'],['Verification_Status','Verification status'],['Payment_Status','Payment status'],['Gross_Amount','Gross amount'],['Start_Date','Start date'],['End_Date','End date']],
    Qualifications:[['Name','Qualification'],['Verification_Status','Verification'],['Date_Completed_Month','Completed month'],['Date_Completed_Year','Completed year']],
    TC_Course_Offering:[['Name','Offering'],['Offering_Status','Status'],['Training_Sessions_Allowed','Sessions allowed'],['Public_Website_Listing','Public listing'],['Valid_From','Valid from'],['Valid_To','Valid to']],
    Tutor_Relationships:[['Name','Tutor relationship'],['Status','Status'],['Membership_Exists','Membership exists']],
    Tasks:[['Subject','Subject'],['Status','Status'],['Priority','Priority'],['Due_Date','Due date']]
  };
  const META={
    Accounts:{title:'Organisations',desc:'Company and training provider information',kind:'account'},
    Contacts:{title:'Contacts',desc:'People associated with an organisation',kind:'contact'},
    Membership:{title:'Member profiles',desc:'Member record and current membership status',kind:'profile'},
    Deals:{title:'Membership transactions',desc:'Renewals, upgrades, payments and membership history',kind:'deal'},
    Membership_Extension:{title:'Membership extensions',desc:'Branches, certificates and add-ons',kind:'addon'},
    Insurance_Policy:{title:'Insurance policies',desc:'Applications, underwriting and policy status',kind:'policy'},
    Insurance_Extension:{title:'Insurance covers',desc:'Cover lines, premiums and taxes',kind:'extension'},
    Insured_People:{title:'Insured people',desc:'Individuals associated with this policy',kind:'person'},
    Insured_Premises:{title:'Insured premises',desc:'Locations associated with this policy',kind:'premises'},
    Declarations:{title:'Declarations',desc:'Customer risk declarations and confirmations',kind:'declaration'},
    Policy_Revisions:{title:'Policy revisions',desc:'Amendments, cancellations and refunds (view only)',kind:'revision'},
    Training_Centre_Accred:{title:'Accreditation applications',desc:'Submission, verification and payment status',kind:'accreditation'},
    Training_Centres:{title:'Training centres',desc:'Centre profiles and verification',kind:'centre'},
    Accreditation_Centre_Link:{title:'Linked centres',desc:'Additional centres under accreditation',kind:'centrelink'},
    Accreditation_Extensions:{title:'Accreditation extensions',desc:'Additional fees and verification',kind:'accrext'},
    Qualifications:{title:'Qualifications',desc:'Candidate qualifications and verification',kind:'qual'},
    TC_Course_Offering:{title:'Course offerings',desc:'Offerings and their approval status',kind:'offer'},
    Tutor_Relationships:{title:'Tutor relationships',desc:'Tutors associated with training centres',kind:'tutor'}
  };
  // Staff-assisted record creation is intentionally absent from V1.
  const DEMO=false; // This CRM release cannot enter sample-data mode.
  const state={pages:{},limited:{},connected:false,demo:DEMO,view:'processing',contact:null,focus:null,focusRelation:{},lists:{},errors:{},queueKind:'insurance',queue:[],queueLimit:100,crmPageLimit:2,queueLoaded:false,busy:false,requestId:0,searchResults:[],searchQuery:'',directory:[],directoryLoaded:false,nativeLists:{},nativeErrors:{},actionTarget:null,actionType:'note',currentUser:null,reviewDrafts:{},savingReview:false,history:[]};
  const $=s=>document.querySelector(s);
  function esc(x){return String(x==null?'':x).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
  function txt(x){if(x===null||x===undefined||x==='')return '—';if(typeof x==='boolean')return x?'Yes':'No';if(Array.isArray(x))return x.map(txt).join(', ');if(typeof x==='object')return x.name||x.display_value||x.id||'—';return String(x);}
  function asRows(r){if(Array.isArray(r))return r;if(!r)return[];if(Array.isArray(r.data))return r.data;if(r.data&&typeof r.data==='object'&&r.data.id)return[r.data];return[];}
  function idsEqual(a,b){return String(a||'')===String(b||'');}
  function refId(v){return v&&typeof v==='object'?String(v.id||''):String(v||'');}
  function date(x){if(!x)return '—';const d=new Date(String(x).slice(0,10)+'T12:00:00');return Number.isNaN(d.getTime())?txt(x):d.toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'});}
  function money(x){return x===null||x===undefined||x===''?'—':Number.isFinite(Number(x))?new Intl.NumberFormat('en-GB',{style:'currency',currency:'GBP'}).format(Number(x)):esc(txt(x));}
  const cashNames=/Amount|Price|Premium|Fee|Quoted|Turnover|IPT_Amount|VAT_Amount|Sum_Insured|Discount|Refundable|Gross|Net/;
  const DEAL_STAGE_LABELS={'Qualification':'Draft','Closed Won':'Draft Quote','Needs Analysis':'Awaiting Payment','Value Proposition':'Paid','Id. Decision Makers':'Active','Proposal/Price Quote':'Expired','Negotiation/Review':'Cancelled','Refunded':'Refunded'};
  function valueFor(k,v){if(k==='Stage'&&v!=null)return DEAL_STAGE_LABELS[v]||txt(v);if(v==null||v==='')return '—';if(/Date$|_Date$|_At$|Valid_From|Valid_To|Start_Date|End_Date|Effective_From|Effective_To/.test(k)&&!k.includes('Amount'))return date(v);if(cashNames.test(k)&&typeof v!=='object')return money(v);return txt(v);}
  function statusClass(v){const s=String(txt(v)).toLowerCase();if(s.startsWith('not ')||s.startsWith('un')&&s.includes('verified'))return'attention';if(STATUSES.danger.some(x=>s===x||s.includes(x)))return'danger';if(STATUSES.attention.some(x=>s.includes(x)))return'attention';if(STATUSES.ok.some(x=>s.includes(x)))return'ok';return'';}
  function badge(v){return v?`<span class="pill ${statusClass(v)}">${esc(txt(v))}</span>`:'';}
  function rowTitle(entity,r){if(!r)return'';const names={Accounts:r.Account_Name,Contacts:r.Full_Name||[r.First_Name,r.Last_Name].filter(Boolean).join(' '),Membership:r.Name,Deals:r.Deal_Name,Insurance_Policy:r.Name,Training_Centre_Accred:r.Name,Training_Centres:r.Name,Qualifications:r.Name,Insurance_Extension:r.Cover_Type||r.Name,Insured_People:[r.First_Name,r.Last_Name].filter(Boolean).join(' ')||r.Name,Insured_Premises:r.Name||r.Postcode,Declarations:r.Name,Policy_Revisions:r.Revision_Reference||r.Name,TC_Course_Offering:r.Course&&r.Course.name||r.Name,Tutor_Relationships:r.Tutor_Contact&&r.Tutor_Contact.name||r.Name};return txt(names[entity]||r.Name||r.id);}
  function rowStatus(entity,r){const keys={Membership:['Current_Membership_Status'],Deals:['Payment_Status','Membership_Type'],Insurance_Policy:['Underwriting_Status','Policy_Status'],Insurance_Extension:['Status'],Policy_Revisions:['Revision_Status'],Training_Centre_Accred:['Application_Stage','Accreditation_Status'],Training_Centres:['Centre_Status'],Qualifications:['Verification_Status'],TC_Course_Offering:['Offering_Status'],Tutor_Relationships:['Status'],Membership_Extension:['Status']};return (keys[entity]||[]).map(k=>r[k]).filter(Boolean).slice(0,2);}
  function rowMeta(entity,r){const fields={Accounts:['Town','Country'],Membership:['Current_Member_Type'],Deals:['Expiry_Date','Membership_Branch'],Insurance_Policy:['Insured_Trading_Name','Policy_End_Date'],Insurance_Extension:['Gross_Amount'],Training_Centre_Accred:['Valid_To','Accreditation_Level'],Training_Centres:['Town'],Policy_Revisions:['Change_Type','Requested_Effective_Date'],TC_Course_Offering:['Training_Centre'],Qualifications:['Date_Completed_Year']};return (fields[entity]||[]).map(k=>valueFor(k,r[k])).filter(v=>v!=='—').join(' · ');}
  function setNotice(message,type='info'){const el=$('#notice');if(!message){el.hidden=true;return}el.hidden=false;el.className='notice '+type;el.textContent=message;}
  function loading(){return'<div class="skeleton"></div><div class="skeleton" style="height:65px"></div>';}
  function empty(head,body){return`<div class="empty"><span class="symbol">${icon('file-search')}</span><strong>${esc(head)}</strong><p>${esc(body)}</p></div>`;}
  function panel(title,desc,body,aside=''){return`<section class="panel"><div class="panel-head"><div><h2>${esc(title)}</h2>${desc?`<p>${esc(desc)}</p>`:''}</div>${aside}</div>${body}</section>`;}
  function kvs(entity,r){const pairs=FIELDS[entity]||Object.keys(r).slice(0,15).map(k=>[k,k]);return`<div class="kv-grid">${pairs.map(([k,label])=>`<div class="kv"><div class="kv-label">${esc(label)}</div><div class="kv-value">${esc(valueFor(k,r[k]))}</div></div>`).join('')}</div>`;}
  function recordRow(entity,r){return`<div class="record-row"><div style="min-width:0"><div class="record-title">${esc(rowTitle(entity,r))} ${rowStatus(entity,r).map(badge).join(' ')}</div><div class="record-meta">${esc(rowMeta(entity,r)||entity.replaceAll('_',' '))}</div></div><div class="record-actions"><button class="button tiny secondary" data-action="select" data-entity="${esc(entity)}" data-id="${esc(r.id)}">View</button><button class="linklike" data-action="open" data-entity="${esc(entity)}" data-id="${esc(r.id)}">${icon('arrow-up-right')} Open in CRM</button></div></div>`;}
  const SIZES={related:10,queue:15,search:15,customers:15,native:10};
  function pageItems(key,rows,size){const total=rows.length,pages=Math.max(1,Math.ceil(total/size));const page=Math.max(1,Math.min(pages,state.pages[key]||1));state.pages[key]=page;const start=(page-1)*size;const controls=pages>1?`<nav class="pagination" aria-label="Record pages"><span>${start+1}–${Math.min(total,start+size)} of ${total} loaded</span><button class="page-button" data-action="paginate" data-key="${esc(key)}" data-page="${page-1}" ${page===1?'disabled':''}>Previous</button><span>${page} / ${pages}</span><button class="page-button" data-action="paginate" data-key="${esc(key)}" data-page="${page+1}" ${page===pages?'disabled':''}>Next</button></nav>`:'';return{rows:rows.slice(start,start+size),controls};}
  function listPanel(entity,items,opts={}){const meta=META[entity]||{title:entity,desc:''};const fault=state.errors[entity];const text=fault?`<div class="risk-banner">${esc(fault)}</div>`:items.length?pageItems('related:'+entity,items,SIZES.related).rows.map(r=>recordRow(entity,r)).join('')+pageItems('related:'+entity,items,SIZES.related).controls:empty('No linked records','No records to show.');return panel(meta.title,`${meta.desc} · ${items.length} loaded${state.limited[entity]?' · Further records may exist in CRM':''}`,text,opts.focus?'':'');}
  function stat(label,value,hint){return`<div class="stat-card"><span class="stat-label">${esc(label)}</span><span class="stat-value">${esc(txt(value))}</span><span class="stat-hint">${esc(hint||'')}</span></div>`;}
  function crmActionBar(entity,id){
    return `<div class="sheet-actions workspace-actions"><button type="button" class="button secondary" data-action="email" data-entity="${esc(entity)}" data-id="${esc(id)}">${icon('link')} Send email in CRM</button><button type="button" class="button secondary" data-action="crm-actions" data-entity="${esc(entity)}" data-id="${esc(id)}">${icon('arrow-up-right')} CRM buttons / actions</button><button type="button" class="button secondary" data-action="note" data-entity="${esc(entity)}" data-id="${esc(id)}">${icon('sticky-note')} Add note</button><button type="button" class="button secondary" data-action="task" data-entity="${esc(entity)}" data-id="${esc(id)}">${icon('list-todo')} Create task</button></div>`;
  }
  function nativeRow(list,row){
    const title=txt(row.Note_Title||row.Subject||row.File_Name||row.file_name||row.Name||row.name||row.Description||row.id);
    const detail=txt(row.Note_Content||row.Created_Time||row.Due_Date||row.File_Size||row.Status||'');
    return `<div class="native-row"><strong>${esc(title)}</strong><small>${esc(detail==='—'?'':detail)}</small></div>`;
  }
  function nativeRelatedPanel(){
    const f=state.focus;if(!f)return'';
    const cfg=NATIVE_RELATIONS[f.entity]||[];if(!cfg.length)return'';
    return `<h3 class="section-title">CRM related lists</h3><div class="native-grid">${cfg.map(([list,label])=>{
      const key=f.entity+':'+f.record.id+':'+list, rows=state.nativeLists[key],error=state.nativeErrors[key];
      let body=rows===undefined?(error?`<p class="native-error">${esc(error)} <button class="linklike" type="button" data-action="open" data-entity="${esc(f.entity)}" data-id="${esc(f.record.id)}">Open in CRM</button></p>`:'<p class="muted">Loading related records…</p>'):
        rows.length?`${pageItems('native:'+list,rows,SIZES.native).rows.map(row=>nativeRow(list,row)).join('')}${pageItems('native:'+list,rows,SIZES.native).controls}${error?`<p class="native-error">${esc(error)}</p>`:''}`:empty('No records returned','This related list is empty or unavailable to the current CRM user.');
      return panel(label,rows?`${rows.length} loaded`:'From CRM',body);
    }).join('')}</div>`;
  }
  async function fetchNativeRelated(entity,id,token){
    const cfg=NATIVE_RELATIONS[entity]||[];if(!cfg.length)return;
    if(typeof api().getRelatedRecords!=='function'){
      cfg.forEach(([name])=>{state.nativeErrors[entity+':'+id+':'+name]='CRM SDK related-list access is unavailable.';});render();return;
    }
    await Promise.all(cfg.map(async ([name])=>{
      const key=entity+':'+id+':'+name;
      try{
        const result=await api().getRelatedRecords({Entity:entity,RecordID:String(id),RelatedList:name,page:1,per_page:100});
        if(token!==state.requestId)return;
        if(result?.code&&!['SUCCESS','NO_CONTENT'].includes(result.code)&&!Array.isArray(result.data))throw Error(result.message||result.code);
        state.nativeLists[key]=asRows(result);
        if(result?.info?.more_records)state.nativeErrors[key]='More records exist in CRM. Open the native related list for the complete history.';
      }catch(err){if(token===state.requestId)state.nativeErrors[key]=String(err.message||err).slice(0,180);}
    }));
    if(token===state.requestId)render();
  }
  function contextBar(actions=true){const c=state.contact;if(!c)return'';return`<div class="context-strip"><div><small>CURRENT CUSTOMER</small><strong>${esc(rowTitle('Contacts',c))}</strong><small>${esc(c.Email||'No email recorded')} · ${esc(c.Mobile||c.Phone||'No phone recorded')}</small></div>${actions?`<div class="action-bar"><button class="button tiny secondary" data-action="note" data-entity="Contacts" data-id="${esc(c.id)}">${icon('sticky-note')} Add note</button><button class="button tiny secondary" data-action="task" data-entity="Contacts" data-id="${esc(c.id)}">${icon('list-todo')} Add task</button><button class="button tiny secondary" data-action="email" data-entity="Contacts" data-id="${esc(c.id)}">Send email</button><button class="button tiny secondary" data-action="crm-actions" data-entity="Contacts" data-id="${esc(c.id)}">CRM actions</button></div>`:""}</div>`;}
  function allFor(entity){return state.lists[entity]||[];}
  function contextCard(){const c=state.contact;if(!c)return empty('Select a customer','Search for a contact, or open this widget from a CRM Contact, Membership, Insurance Policy or Accreditation record.');const profiles=allFor(M.PROFILE),deals=allFor(M.DEAL),policies=allFor(M.POLICY),apps=allFor(M.ACC);const current=profiles.find(p=>p.Current_Membership_Status==='Current')||profiles[0];const risky=deals.filter(d=>d.Banned_From_Membership||d.Banned_From_Insurance||d.Has_Insurance_Issue);return`${contextBar()}${risky.length?'<div class="risk-banner"><strong>Customer restrictions or insurance issues are recorded.</strong> Review the relevant Membership transaction before proceeding.</div>':''}<div class="stats">${stat('Member profile',current?current.Current_Member_Type:'Not found',current?current.Current_Membership_Status:'No member profile linked')}${stat('Insurance policies',policies.length,'Across linked policy records')}${stat('Accreditation applications',apps.length,'Across the applicant contact')}</div>${crmActionBar('Contacts',c.id)}${panel('Customer details','Contact record',kvs(M.CONTACT,c))}${nativeRelatedPanel()}<div class="columns">${listPanel(M.PROFILE,profiles)}${listPanel(M.POLICY,policies)}</div><div class="columns">${listPanel(M.DEAL,deals)}${listPanel(M.ACC,apps)}</div>${allFor(M.ACCOUNT).length?listPanel(M.ACCOUNT,allFor(M.ACCOUNT)):''}`;}
  function accountCard(){const a=state.focus?.record;if(!a||state.focus.entity!==M.ACCOUNT)return noContact();return `<div class="context-strip"><div><small>ORGANISATION</small><strong>${esc(rowTitle(M.ACCOUNT,a))}</strong><small>${esc(a.Email_Address||a.Phone||'Organisation record')}</small></div><div class="action-bar"><button class="button tiny secondary" data-action="open" data-entity="Accounts" data-id="${esc(a.id)}">${icon('arrow-up-right')} Open in CRM</button></div></div>${crmActionBar('Accounts',a.id)}${panel('Organisation details','Organisation',kvs(M.ACCOUNT,a))}${nativeRelatedPanel()}<h3 class="section-title">Related records</h3><div class="columns">${listPanel(M.CONTACT,allFor(M.CONTACT))}${listPanel(M.CENTRE,allFor(M.CENTRE))}</div><div class="columns">${listPanel(M.ACC,allFor(M.ACC))}${listPanel(M.POLICY,allFor(M.POLICY))}</div>`}
  function noContact(){return panel('Find a record','Search for a customer or application',empty('Nothing selected','Search for a customer above, or open a record from the application lists.'));}
  function focusPanel(entity,r){const fields=FIELDS[entity];if(!fields)return'';return `${crmActionBar(entity,r.id)}${panel('Record details',META[entity]?.title||'Record details',kvs(entity,r))}${nativeRelatedPanel()}`;}
  function findFocus(preferred){if(state.focus&&preferred.includes(state.focus.entity))return state.focus;for(const e of preferred){const list=allFor(e);if(list.length)return{entity:e,record:list[0]};}return null;}

  // REVIEW MODEL: checklists guide staff; they do not assert that CRM workflows or underwriting are configured.
  // Review decisions are documented in native CRM Notes; lifecycle updates remain with authorised CRM processes.
  const REVIEW_GROUPS = {
    membership: {
      label:'Membership',
      intro:'Check the portal-submitted membership and its CRM relationships before processing.',
      checks:[
        ['identity','Contact and member profile match the submitted customer'],
        ['selection','Membership type, Guild branch and subscription match the submission'],
        ['payment','Payment status and reference have been verified against the payment source'],
        ['dates','Membership start, expiry and renewal dates have been checked'],
        ['restrictions','Any bans, insurance issues or duplicate membership records have been reviewed']
      ],
      outcomes:['Reviewed – no issue identified','Information or correction required','Escalated for investigation','Unable to proceed']
    },
    insurance: {
      label:'Insurance',
      intro:'Review the policy application and underwriting information. A successful payment does not activate cover.',
      checks:[
        ['customer','Insured customer, business and linked membership have been checked'],
        ['cover','Cover extensions, premiums and risk details match the submitted application'],
        ['people','Insured people and premises information is complete where applicable'],
        ['declarations','All required declarations and supporting evidence have been reviewed'],
        ['underwriting','Underwriting referral, sanctions and eligibility requirements have been assessed or escalated'],
        ['statuses','Application, underwriting, payment and policy statuses have been independently checked']
      ],
      outcomes:['Reviewed – no issue identified','Additional information required','Underwriting referral / escalation','Unable to proceed']
    },
    accreditation: {
      label:'Accreditation',
      intro:'Review the submitted application, centre, course and qualification details.',
      checks:[
        ['applicant','Applicant, Contact and training centre/Account records have been checked'],
        ['centre','Training centre details and any additional centres have been reviewed'],
        ['qualifications','Required qualifications and evidence have been checked'],
        ['offerings','Course offerings and tutor details have been reviewed'],
        ['payment','Quoted fee and payment status have been checked'],
        ['decision','Outstanding requirements and appropriate verification authority have been considered']
      ],
      outcomes:['Reviewed – no issue identified','Information or qualifications required','Escalated for verification','Unable to proceed']
    }
  };
  function reviewKind(entity){return ({Membership:'membership',Deals:'membership',Insurance_Policy:'insurance',Training_Centre_Accred:'accreditation'})[entity]||null;}
  function reviewKey(entity,id){return `${entity}:${id}`;}
  function reviewDraft(entity,id){const key=reviewKey(entity,id);if(!state.reviewDrafts[key])state.reviewDrafts[key]={checked:{},outcome:'',comment:''};return state.reviewDrafts[key];}
  function reviewSignals(kind,record){
    const checks=[];const missing=(label,reason)=>checks.push({label,reason});
    const id=record&&record.id;
    if(!id)return checks;
    if(kind==='membership'){
      if(record.Payment_Status && record.Payment_Status!=='Paid')missing('Payment exception',`Payment status: ${record.Payment_Status}`);
      if(record.Banned_From_Membership||record.Banned_From_Insurance||record.Has_Insurance_Issue)missing('Membership restriction','One or more restriction / insurance issue flags are recorded.');
      if(record.Current_Membership_Status==='Expired')missing('Member profile expired','The member profile shows Expired.');
      if(record.Stage && !['Id. Decision Makers','Closed Won','Qualification'].includes(record.Stage))missing('Membership stage to review',`Membership stage: ${DEAL_STAGE_LABELS[record.Stage]||record.Stage}. Check the current membership.`);
    }else if(kind==='insurance'){
      if(['Refer','Pending','Manual Review (REC)','Declined'].includes(record.Underwriting_Status))missing('Underwriting attention',`Underwriting status: ${record.Underwriting_Status}`);
      if(record.Payment_Status!=='Paid')missing('Payment not verified',`Policy payment status: ${record.Payment_Status||'not provided'}`);
      if(record.Policy_Status!=='Active')missing('Policy not active',`Policy status: ${record.Policy_Status||'not provided'}`);
      if(!refId(record.Contact))missing('Customer details missing','The customer could not be confirmed.');
    }else if(kind==='accreditation'){
      if(['Qualifications Outstanding','Needs Information','Needs Processing','Payment Failed'].includes(record.Application_Stage))missing('Action required',`Application stage: ${record.Application_Stage}`);
      if(record.Payment_Status!=='Paid')missing('Payment to review',`Payment status: ${record.Payment_Status||'not provided'}`);
      if(record.Accreditation_Status!=='Verified')missing('Verification not complete',`Accreditation status: ${record.Accreditation_Status||'not provided'}`);
      if(!refId(record.Applicant_Contact))missing('Applicant link missing','Applicant has not been linked.');
    }
    return checks;
  }
  function processingHome(){
    const modules=[['membership','Membership','Membership records, renewals and payments','users-round'],['insurance','Insurance','Policies, declarations and referrals','shield-check'],['accreditation','Accreditation','Applications, qualifications and centres','graduation-cap']];
    return `<div class="process-hero"><span class="process-kicker">APPLICATIONS</span><h2>Review applications</h2><p>Find a submitted application, review its details and continue processing in CRM.</p></div>
      <div class="process-entry-grid">${modules.map(([kind,label,desc,iconName])=>`<article class="process-entry"><div class="entry-icon">${icon(iconName)}</div><h3>${label}</h3><p>${desc}</p><button type="button" class="button secondary" data-action="launchqueue" data-kind="${kind}">View applications ${icon('chevron-right')}</button></article>`).join('')}</div>
      <div class="create-cta"><div><strong>Start a new application</strong><p>Customer creation, applications and payment links will be available in a future release.</p></div><div class="create-cta-actions"><button type="button" class="button secondary" data-action="coming-soon">${icon('plus-circle')} Membership</button><button type="button" class="button secondary" data-action="coming-soon">${icon('plus-circle')} Insurance</button><button type="button" class="button secondary" data-action="coming-soon">${icon('plus-circle')} Accreditation</button></div></div>`;
  }
  function processingPanel(entity,record){
    const kind=reviewKind(entity);if(!kind)return'';
    const signals=reviewSignals(kind,record);
    return `<section class="process-sheet" aria-label="Application actions">
      <div class="sheet-heading"><div><span class="process-kicker">APPLICATION REVIEW</span><h2>${esc(rowTitle(entity,record))}</h2><p>Review the information below, then make any changes using the existing CRM process.</p></div>${badge(record.Application_Stage||record.Underwriting_Status||record.Payment_Status||record.Current_Membership_Status)}</div>
      ${signals.length?`<div class="signal-list"><strong>${icon('alert-circle')} Needs attention</strong>${signals.map(s=>`<div class="signal"><b>${esc(s.label)}</b><span>${esc(s.reason)}</span></div>`).join('')}</div>`:''}
      <div class="sheet-actions"><button type="button" class="button primary" data-action="open" data-entity="${esc(entity)}" data-id="${esc(record.id)}">${icon('arrow-up-right')} Open in CRM</button><button type="button" class="button secondary" data-action="email" data-entity="${esc(entity)}" data-id="${esc(record.id)}">Send email</button><button type="button" class="button secondary" data-action="note" data-entity="${esc(entity)}" data-id="${esc(record.id)}">${icon('sticky-note')} Add note</button><button type="button" class="button secondary" data-action="task" data-entity="${esc(entity)}" data-id="${esc(record.id)}">${icon('list-todo')} Create task</button><button type="button" class="button secondary" data-action="refresh-record" data-entity="${esc(entity)}" data-id="${esc(record.id)}">${icon('refresh-cw')} Refresh</button></div>
    </section>`;
  }
  async function saveReview(entity,id){
    const focus=state.focus;
    if(!focus||focus.entity!==entity||!idsEqual(focus.record.id,id))return setNotice('Open the record to review it first.','error');
    const kind=reviewKind(entity),cfg=REVIEW_GROUPS[kind],draft=reviewDraft(entity,id);
    if(!draft.outcome)return setNotice('Choose a review outcome before saving.','error');
    if(!draft.comment.trim())return setNotice('Please add a note explaining the review.','error');
    if(state.savingReview)return;
    const done=cfg.checks.filter(([key])=>draft.checked[key]).map(([,label])=>label);
    const pending=cfg.checks.filter(([key])=>!draft.checked[key]).map(([,label])=>label);
    const note=`Beauty Guild · Phase 1 processing review\nArea: ${cfg.label}\nOutcome: ${draft.outcome}\nChecked (${done.length}/${cfg.checks.length}):\n${done.map(x=>'- '+x).join('\n')||'- None'}\nNot yet checked:\n${pending.map(x=>'- '+x).join('\n')||'- None'}\nReviewer's notes:\n${draft.comment.trim()}\n\nThis note documents a staff review. It is not an underwriting, accreditation, membership activation or payment approval.`;
    state.savingReview=true;setNotice('');render();
    try{
      if(state.demo){setNotice('Demonstration only: review was not saved to CRM.','info');return;}
      assertSaved(await api().addNotes({Entity:entity,RecordID:id,Title:`${cfg.label} processing review · ${draft.outcome}`,Content:note}));
      setNotice('Review notes saved.','success');
      state.reviewDrafts[reviewKey(entity,id)]={checked:{},outcome:'',comment:''};
    }catch(err){setNotice(`Could not save review: ${err.message||err}`,'error');}
    finally{state.savingReview=false;render();}
  }

  function sectionView(kind){const config={membership:{primary:[M.PROFILE,M.DEAL],groups:[[M.PROFILE,M.DEAL],[M.ADDON]],note:''},insurance:{primary:[M.POLICY],groups:[[M.POLICY],[M.EXT,M.PERSON],[M.PREMISES,M.DECLARATION],[M.REVISION]],note:''},accreditation:{primary:[M.ACC],groups:[[M.ACC,M.CENTRE],[M.QUAL,M.OFFER],[M.TUTOR,M.ACCLINK],[M.ACCEXT]],note:''}}[kind];if(!config)return'';
    const f=findFocus(config.primary);const selected=f&&f.record;let extras='';
    const rowGroups=`<div class="related-grid">${config.groups.flat().filter(e=>!f||e!==f.entity).map(e=>listPanel(e,allFor(e))).join('')}</div>`;
    const child=state.focus && !config.primary.includes(state.focus.entity) && state.focus.entity!==M.CONTACT;const selectedView=child?`${focusPanel(state.focus.entity,state.focus.record)}`:f?`${processingPanel(f.entity,selected)}${focusPanel(f.entity,selected)}`:'';const back=state.history.length?'<button class="button tiny secondary" type="button" data-action="go-back">'+icon('arrow-left')+' Back</button>':'';const show=!state.contact&&!f&&!child?`${noContact()}<button type="button" class="button primary" data-action="launchqueue" data-kind="${kind}">Browse ${kind} applications</button>`:`${back}${contextBar(false)}${selectedView}<h3 class="section-title">Related records</h3>${rowGroups}${extras}`;
    return show;
  }
  function queueView(){const labels={insurance:'Insurance referrals',accreditation:'Accreditation reviews',membership:'Membership exceptions'};const controls=`<p class="muted">Live CRM status searches; these are processing candidates, not an exhaustive count of all applications.</p><div class="queue-controls">${Object.keys(labels).map(k=>`<button class="queue-tab ${k===state.queueKind?'selected':''}" data-queue="${k}">${esc(labels[k])}</button>`).join('')}</div>`;const body=state.queueLoaded?(state.queue.length?pageItems('queue:'+state.queueKind,state.queue,SIZES.queue).rows.map(x=>recordRow(x.entity,x.record)).join('')+pageItems('queue:'+state.queueKind,state.queue,SIZES.queue).controls:empty('No applications found','No matching records were returned from the current CRM searches.')):empty('Load a work queue','Choose an application type above.');return `${controls}${panel(labels[state.queueKind],`${state.queue.length} loaded (not an organisation-wide count)${state.limited[({membership:'Deals',insurance:'Insurance_Policy',accreditation:'Training_Centre_Accred'})[state.queueKind]]?' · Further records may exist in CRM':''}`,body)}${state.limited[({membership:'Deals',insurance:'Insurance_Policy',accreditation:'Training_Centre_Accred'})[state.queueKind]]?'<button class="button secondary" data-action="more-queue">Load more matching CRM records</button>':''}`;}
  function createView(){return `<div class="coming-soon">${icon('plus-circle')}<h2>New applications are coming soon</h2><p>Contact creation, staff-assisted application forms, shared drafts and Stripe payment links are planned for the next release.</p><p>For now, use <strong>Applications</strong> to review existing records and the existing CRM process to make changes.</p><button type="button" class="button primary" data-action="launchqueue" data-kind="insurance">View applications</button></div>`;}
  function render(){const [title,subtitle]=VIEW_TITLES[state.view];$('#pageTitle').textContent=title;$('#pageSubtitle').textContent=subtitle;document.querySelectorAll('[data-view]').forEach(b=>{b.classList.toggle('active',b.dataset.view===state.view);b.setAttribute('aria-current',b.dataset.view===state.view?'page':'false')});let html='';if(state.busy){html=loading()}else if(state.view==='processing'){html=processingHome()}else if(state.view==='overview'){html=state.focus?.entity===M.ACCOUNT?accountCard():state.contact?contextCard():panel('Customer directory',`${state.directory.length} loaded from CRM`,state.directory.length?pageItems('customers',state.directory,SIZES.customers).rows.map(r=>recordRow('Contacts',r)).join('')+pageItems('customers',state.directory,SIZES.customers).controls:empty('No customers loaded','Search above or select Refresh to load permitted Contacts.'))}else if(state.view==='queue'){html=queueView()}else if(state.view==='create'){html=createView()}else{html=sectionView(state.view)}$('#contentArea').innerHTML=html;$('#searchResults').hidden=!state.searchResults.length;if(state.searchResults.length){$('#searchResults').innerHTML=panel('Search results',`${state.searchResults.length} matches`,pageItems('search',state.searchResults,SIZES.search).rows.map(x=>recordRow(x.entity,x.record)).join('')+pageItems('search',state.searchResults,SIZES.search).controls)}}
  function api(){if(!state.connected||!window.ZOHO||!ZOHO.CRM||!ZOHO.CRM.API)throw Error('CRM connection is not ready. Open the widget inside Zoho CRM.');return ZOHO.CRM.API;}
  async function getRecord(entity,id){if(state.demo)return demoGet(entity,id);let out=await api().getRecord({Entity:entity,RecordID:String(id)});const row=asRows(out)[0];if(!row)throw Error(`${entity} record was not returned by CRM`);return row;}
  function queryCriterion(field,id){if(!/^[A-Za-z_][A-Za-z0-9_]*$/.test(field)||!/^[0-9]{8,30}$/.test(String(id)))throw Error('Invalid CRM record context');return`(${field}:equals:${id})`;}
  async function searchRecords(entity,field,id,limit=100){if(state.demo)return demoFind(entity,field,id);const q=queryCriterion(field,id);const out=await pagesFromCRM('searchRecord',{Entity:entity,Type:'criteria',Query:q},limit);if(out.limited)state.limited[entity]=true;return out.rows.filter(x=>idsEqual(refId(x[field]),id));}
  async function pagesFromCRM(method,params,perPage=100){let rows=[],limited=false;for(let page=1;page<=state.crmPageLimit;page++){let res;try{res=await api()[method]({...params,page,per_page:perPage})}catch(e){if(page===1&&/NO_CONTENT|204|no content/i.test(String(e.message||e)))break;throw e}if(res?.code==='NO_CONTENT'||res?.status===204)break;if(res?.code&&!['SUCCESS','NO_CONTENT'].includes(res.code)&&!Array.isArray(res.data))throw Error(res.message||res.code);const part=asRows(res);rows.push(...part);const more=res?.info?.more_records===true||(res?.info?.more_records==null&&part.length>=perPage);if(!more)break;if(page===state.crmPageLimit)limited=true;}return{rows,limited};}
  async function getPage(entity,perPage=100){if(state.demo)return demoQueue(entity);const out=await pagesFromCRM('getAllRecords',{Entity:entity},perPage);if(out.limited)state.limited[entity]=true;return out.rows;}
  async function manySearch(descriptors,id){let results=await Promise.allSettled(descriptors.map(async([entity,field])=>[entity,await searchRecords(entity,field,id)]));let map={};results.forEach((result,i)=>{const entity=descriptors[i][0];if(result.status==='fulfilled')map[entity]=result.value[1];else{map[entity]=[];state.errors[entity]=`CRM could not load ${entity}: ${result.reason&&result.reason.message||'Unknown error'}`;}});return map;}
  function matchContext(c){if(!c||typeof c!=='object')return null;const entity=c.Entity||c.entity||c.module||c.Module||c.moduleName;let id=c.EntityId||c.EntityID||c.entityId||c.RecordID||c.recordId||c.id;if(Array.isArray(id))id=id[0];if(id&&typeof id==='object')id=id.id||id.recordId;if(ALL_ENTITIES.has(entity)&&/^\d{8,30}$/.test(String(id||'')))return{entity,id:String(id)};return null;}
  function contactLookup(entity,r){if(entity===M.CONTACT)return r.id;const names={Membership:'Contact',Deals:'Contact_Name',Insurance_Policy:'Contact',Training_Centre_Accred:'Applicant_Contact',Training_Centres:'Contact',Qualifications:'Contact',Declarations:'Contact'};return refId(r[names[entity]])||'';}
  function parentLookup(entity,r){const parents={Insurance_Extension:['Insurance_Policy','Policy'],Insured_People:['Insurance_Policy','Policy'],Insured_Premises:['Insurance_Policy','Policy'],Declarations:['Insurance_Policy','Insurance_Policy'],Policy_Revisions:['Insurance_Policy','Policy'],Membership_Extension:['Deals','Membership_Extension'],Accreditation_Centre_Link:['Training_Centre_Accred','Accreditation'],Accreditation_Extensions:['Training_Centre_Accred','Accreditation'],TC_Course_Offering:['Training_Centre_Accred','Accreditation'],Tutor_Relationships:['Training_Centre_Accred','Accreditation']};const c=parents[entity];return c&&refId(r[c[1]])?{entity:c[0],id:refId(r[c[1]])}:null;}
  async function select(entity,id){if(!ALL_ENTITIES.has(entity))return;const token=++state.requestId;state.busy=true;state.searchResults=[];state.errors={};render();setNotice('');try{
    const record=await getRecord(entity,id);if(token!==state.requestId)return;let anchorEntity=entity,anchorRecord=record;const parent=parentLookup(entity,record);if(parent){try{anchorRecord=await getRecord(parent.entity,parent.id);anchorEntity=parent.entity;}catch(_){/* Child record remains visible if the parent is inaccessible. */}}if(token!==state.requestId)return;state.focus={entity:entity,record:record};state.focusRelation={};const contactId=contactLookup(anchorEntity,anchorRecord);
    if(contactId){const c=entity===M.CONTACT?record:await getRecord(M.CONTACT,contactId);if(token!==state.requestId)return;state.contact=c;state.lists={...await manySearch(CONTACT_RELATIONS,c.id),Contacts:[c]};const accountId=refId(c.Account_Name);if(accountId){try{state.lists[M.ACCOUNT]=[await getRecord(M.ACCOUNT,accountId)]}catch(_){/* Account inaccessible or missing. */}}if(token!==state.requestId)return;}
    else{state.contact=null;state.lists={[entity]:[record]};if(entity===M.ACCOUNT){const rel=await manySearch([[M.CONTACT,'Account_Name'],[M.CENTRE,'Account'],[M.ACC,'Account'],[M.POLICY,'Account']],record.id);Object.assign(state.lists,rel)}}
    if(!state.lists[entity])state.lists[entity]=[record];else if(!state.lists[entity].some(x=>idsEqual(x.id,id)))state.lists[entity].unshift(record);
    if(anchorEntity!==entity)state.lists[anchorEntity]=[anchorRecord];
    const relationDefs=RELATIONS[anchorEntity]||[];
    if(relationDefs.length){state.focusRelation[anchorEntity]=await manySearch(relationDefs,anchorRecord.id);Object.keys(state.focusRelation[anchorEntity]).forEach(e=>{state.lists[e]=state.focusRelation[anchorEntity][e]})}
    // Where a Contact was opened, lazily show the first policy and accreditation children only after selecting them.
    if(token!==state.requestId)return;state.view=VIEWS_FOR[entity]||'overview';fetchNativeRelated(entity,id,token).catch(()=>{});
  }catch(err){if(token!==state.requestId)return;setNotice(`Unable to load CRM record: ${err.message||String(err)}`,'error')}finally{if(token===state.requestId){state.busy=false;render()}}}
  async function openCRM(entity,id){if(state.demo){setNotice('Demo mode: record navigation is available only inside Zoho CRM.');return}try{await ZOHO.CRM.UI.Record.open({Entity:entity,RecordID:String(id)})}catch(e){setNotice(`Could not open the CRM record: ${e.message||e}`,'error')}}
  async function handleSearch(){const q=$('#globalSearch').value.trim();if(q.length<2){setNotice('Enter at least two characters to search.');return}if(!state.connected&&!state.demo){setNotice('This widget must be opened inside Zoho CRM.','error');return}const token=++state.requestId;state.searchQuery=q;state.searchResults=[];state.pages.search=1;setNotice('');state.busy=true;render();try{const isEmail=q.includes('@');const jobs=[M.CONTACT,M.ACCOUNT];const found=[];for(const entity of jobs){let out=[];try{if(state.demo){out=demoSearch(entity,q)}else{const result=await api().searchRecord({Entity:entity,Type:isEmail?'email':'word',Query:q,page:1,per_page:50});out=asRows(result)}}catch(_){/* Search may be unavailable on a module under this profile. */}for(const record of out)found.push({entity,record});}
    // Exact CRM IDs are supported when opened from CRM context; references are additionally searched on their owning module.
    if(!found.length&&!isEmail){for(const entity of [M.DEAL,M.POLICY,M.ACC]){try{let result=state.demo?demoSearch(entity,q):asRows(await api().searchRecord({Entity:entity,Type:'word',Query:q,page:1,per_page:20}));result.forEach(record=>found.push({entity,record}))}catch(_){/* These modules may not support a word lookup for every profile. */}}}
    if(token!==state.requestId)return;state.searchResults=found.slice(0,50);if(!found.length)setNotice('No matching CRM records were found. Check spelling or open the record directly.');
  }catch(err){if(token===state.requestId)setNotice(`CRM search failed: ${err.message||err}`,'error')}finally{if(token===state.requestId){state.busy=false;render()}}}
  function isQueueItem(kind,entity,r){if(kind==='insurance')return ['Refer','Pending','Manual Review (REC)'].includes(r.Underwriting_Status)||['Referred','Awaiting Payment'].includes(r.Application_Status)||r.Finance_Sync_Status==='Failed (REC)';if(kind==='accreditation')return['Submitted','Needs Processing','Under Review','Needs Information','Qualifications Outstanding'].includes(r.Application_Stage);if(kind==='membership'){const inDays=r.Expiry_Date?(Date.parse(r.Expiry_Date)-Date.now())/(86400*1000):9999;return (inDays>=-15&&inDays<=60)||['Failed','Not Paid','Part Refunded'].includes(r.Payment_Status)||!!(r.Has_Insurance_Issue||r.Banned_From_Membership||r.Banned_From_Insurance)}return false;}
  async function loadDirectory(){
    const token=++state.requestId;state.busy=true;render();
    try{const result=await pagesFromCRM('getAllRecords',{Entity:M.CONTACT},100);if(token!==state.requestId)return;
      state.directory=result.rows;state.directoryLoaded=true;state.limited[M.CONTACT]=result.limited;
      if(result.limited)setNotice('Showing only the first CRM customer batches. Search for a specific customer to find other records.','info');
    }catch(e){if(token===state.requestId)setNotice('Could not load customer directory: '+(e.message||e),'error');}
    finally{if(token===state.requestId){state.busy=false;render();}}
  }
  async function loadQueue(kind){
    state.queueKind=kind;state.queueLoaded=false;state.queue=[];state.pages['queue:'+kind]=1;
    const token=++state.requestId;state.busy=true;state.errors={};render();
    const specs={
      insurance:{entity:M.POLICY,filters:[['Underwriting_Status','Refer'],['Underwriting_Status','Pending'],['Underwriting_Status','Manual Review (REC)'],['Application_Status','Referred'],['Finance_Sync_Status','Failed (REC)']]},
      accreditation:{entity:M.ACC,filters:[['Application_Stage','Submitted'],['Application_Stage','Needs Processing'],['Application_Stage','Under Review'],['Application_Stage','Needs Information'],['Application_Stage','Qualifications Outstanding']]},
      membership:{entity:M.DEAL,filters:[['Payment_Status','Failed'],['Payment_Status','Not Paid'],['Payment_Status','Part Refunded']]}
    }[kind];
    try{
      let found=[];
      for(const [field,value] of specs.filters){
        if(token!==state.requestId)return;
        try{
          let rows;
          if(state.demo)rows=(DEMO_RECORDS[specs.entity]||[]).filter(r=>r[field]===value);
          else{
            const criterion=`(${field}:equals:${value})`;
            const result=await pagesFromCRM('searchRecord',{Entity:specs.entity,Type:'criteria',Query:criterion},state.queueLimit);rows=result.rows.filter(r=>r[field]===value);if(result.limited)state.limited[specs.entity]=true;
          }
          found.push(...rows);
        }catch(err){state.errors[field+' '+value]=err.message||String(err)}
      }
      if(kind==='membership'){
        try{const batch=await getPage(M.DEAL);found.push(...batch.filter(r=>isQueueItem(kind,M.DEAL,r)))}
        catch(err){state.errors.expiring=err.message||String(err)}
      }
      if(token!==state.requestId)return;
      const unique=new Map();found.forEach(r=>unique.set(String(r.id),r));
      state.queue=Array.from(unique.values()).filter(r=>isQueueItem(kind,specs.entity,r)).map(record=>({entity:specs.entity,record}));
      state.queueLoaded=true;
      const failures=Object.values(state.errors);
      if(failures.length)setNotice(`Some queue filters failed: ${failures.join('; ')}`,'error');
      else setNotice('Application list updated.');
    }finally{if(token===state.requestId){state.busy=false;render()}}
  }
  function openAction(type,entity,id){if(!ALL_ENTITIES.has(entity)||!/^\d{8,30}$/.test(String(id||''))){setNotice('Select a valid CRM record first.');return}state.actionType=type;state.actionTarget={entity,id};$('#modalTitle').textContent=type==='note'?'Add note':'Create follow-up task';$('#modalContext').textContent=`For ${META[entity]?.title||'selected record'}`;$('#actionSubject').value='';$('#actionDescription').value='';$('#actionSubjectLabel').textContent=type==='note'?'Note title':'Task subject';$('#actionDescriptionLabel').textContent=type==='note'?'Note content':'Task description';$('#dueRow').hidden=type!=='task';$('#actionDue').required=type==='task';$('#actionDue').value='';$('#saveAction').textContent=type==='note'?'Save note':'Create task';$('#actionModal').showModal();$('#actionSubject').focus()}
  function assertSaved(r){if(r&&r.status==='error')throw Error(r.message||'CRM save rejected');const rows=asRows(r);if(rows.length&&(rows[0].status==='error'||rows[0].code==='INVALID_DATA'))throw Error(rows[0].message||rows[0].code||'CRM save rejected');if(r&&r.code&&r.code!=='SUCCESS'&&r.status!=='success'&&!rows.length)throw Error(r.message||r.code);return r}
  async function saveAction(){const {entity,id}=state.actionTarget||{};if(!entity)return;const type=state.actionType;const title=$('#actionSubject').value.trim(),description=$('#actionDescription').value.trim(),due=$('#actionDue').value;if(!title){setNotice('A title or subject is required.');return}if(type==='task'&&!due){setNotice('Select a due date.');return}$('#saveAction').disabled=true;setNotice('');try{if(state.demo){await new Promise(resolve=>setTimeout(resolve,20));$('#actionModal').close();setNotice('Demo mode: no CRM record was created.','info');return}let result;if(type==='note')result=await api().addNotes({Entity:entity,RecordID:id,Title:title,Content:description||title});else{let payload={Subject:title,Status:'Not Started',Priority:'Normal',Due_Date:due,Description:description};if(entity===M.CONTACT)payload.Who_Id={id:String(id)};else{payload.What_Id={id:String(id)};payload.$se_module=entity;if(state.contact&&state.contact.id)payload.Who_Id={id:String(state.contact.id)};}result=await api().insertRecord({Entity:M.TASK,APIData:payload})}assertSaved(result);$('#actionModal').close();setNotice(type==='note'?'Note saved.':'Task created.','success');}catch(err){setNotice(`Could not create ${type}: ${err.message||err}`,'error')}finally{$('#saveAction').disabled=false}}
  async function changeView(next){if(next!=='create')state.history=[];if(next==='create'){state.view='create';state.focus=null;render();return;}state.view=next;state.searchResults=[];setNotice('');if(next==='overview'&&!state.contact&&!state.directoryLoaded)return loadDirectory();if(next==='queue'&&!state.queueLoaded)return loadQueue(state.queueKind);const desired={membership:[M.PROFILE,M.DEAL],insurance:[M.POLICY],accreditation:[M.ACC]}[next]||[];if(desired.length&&!(state.focus&&desired.includes(state.focus.entity))){for(const e of desired){const item=allFor(e)[0];if(item)return select(e,item.id)}}render()}
  async function init(){installStaticIcons();document.querySelectorAll('[data-view]').forEach(b=>b.addEventListener('click',()=>changeView(b.dataset.view)));$('#searchBtn').addEventListener('click',handleSearch);$('#globalSearch').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();handleSearch()}});$('#refreshBtn').addEventListener('click',()=>{if(state.view==='create'){setNotice('New applications are coming soon.');}else if(state.focus)select(state.focus.entity,state.focus.record.id);else if(state.contact)select(M.CONTACT,state.contact.id);else if(state.view==='queue')loadQueue(state.queueKind);else if(state.view==='overview')loadDirectory();else setNotice('Select a CRM record or choose a queue to refresh.');});$('#contentArea').addEventListener('click',clickAction);$('#searchResults').addEventListener('click',clickAction);$('#cancelModal').addEventListener('click',()=>$('#actionModal').close());$('#cancelModal2').addEventListener('click',()=>$('#actionModal').close());$('#actionForm').addEventListener('submit',e=>{e.preventDefault();saveAction()});$('#contentArea').addEventListener('change',changeReviewField);$('#contentArea').addEventListener('input',changeReviewField);render();
    
    if(!window.ZOHO||!ZOHO.embeddedApp){setNotice('Zoho CRM SDK could not load. Open the widget in Zoho CRM and check network permissions.','error');$('#connectionLabel').textContent='Not connected';return}
    try{let pendingContext=null;ZOHO.embeddedApp.on('PageLoad',context=>{const c=matchContext(context);if(c){pendingContext=c;if(state.connected)select(c.entity,c.id)}});await ZOHO.embeddedApp.init();state.connected=true;$('#connectionDot').classList.add('connected');$('#connectionLabel').textContent='Connected';try{const me=await ZOHO.CRM.CONFIG.getCurrentUser();const record=asRows(me)[0]||me.users&&me.users[0]||me;state.currentUser=record;$('#identityLabel').textContent=record.full_name||record.name||record.email||''}catch(_){/* User display is optional. */}const params=new URLSearchParams(location.search);const candidate=matchContext({Entity:params.get('module'),EntityId:params.get('id')});if(pendingContext)select(pendingContext.entity,pendingContext.id);else if(candidate&&!state.focus)select(candidate.entity,candidate.id)}catch(err){$('#connectionLabel').textContent='Connection failed';setNotice(`CRM SDK initialisation failed: ${err.message||err}`,'error')}}
  function changeReviewField(event){const el=event.target;if(!el||!el.dataset)return;const {entity,id,reviewCheck,reviewOutcome,reviewComment}=el.dataset;if(!reviewKind(entity)||!/^[0-9]{8,30}$/.test(id||''))return;const draft=reviewDraft(entity,id);if(reviewCheck){draft.checked[reviewCheck]=Boolean(el.checked);const count=Object.values(draft.checked).filter(Boolean).length;const counter=document.querySelector('.check-count');if(counter)counter.textContent=`${count} of ${REVIEW_GROUPS[reviewKind(entity)].checks.length}`;}if(reviewOutcome!==undefined)draft.outcome=el.value;if(reviewComment!==undefined)draft.comment=el.value;}
  async function clickAction(event){const el=event.target.closest('[data-action],[data-queue]');if(!el)return;if(el.dataset.queue){loadQueue(el.dataset.queue);return}const action=el.dataset.action,entity=el.dataset.entity,id=el.dataset.id;if(action==='launchqueue'){state.view='queue';await loadQueue(el.dataset.kind||'insurance');}else if(action==='coming-soon'){state.view='create';render();}else if(action==='more-queue'){state.crmPageLimit=Math.min(state.crmPageLimit*2,16);await loadQueue(state.queueKind);}else if(action==='paginate'){const key=el.dataset.key,n=Number(el.dataset.page);if(/^(related:[A-Za-z_]+|native:[A-Za-z_]+|queue:(insurance|membership|accreditation)|search|customers)$/.test(key||'')&&Number.isInteger(n)&&n>=1){state.pages[key]=n;render()}}else if(action==='refresh-record')await select(entity,id);else if(action==='savereview')await saveReview(entity,id);else if(action==='go-back'){const last=state.history.pop();if(last?.entity)await select(last.entity,last.id);else if(last){state.view=last.view;render()}}else if(action==='select'){state.history.push(state.focus?{entity:state.focus.entity,id:state.focus.record.id,view:state.view}:{view:state.view});await select(entity,id);}else if(action==='open')await openCRM(entity,id);else if(action==='email'||action==='crm-actions'){await openCRM(entity,id);setNotice(action==='email'?'Use the CRM record email action to compose and send using the existing CRM setup.':'Use the authorised native CRM buttons and workflow controls on the opened record.','info');}else if(action==='note'||action==='task')openAction(action,entity,id)}
  // Deliberately no sample dataset in the deployable widget.
  // Every displayed record comes from CRM when the SDK is connected.
  const DEMO_RECORDS=Object.freeze({});
  function demoGet(){throw Error('Demo data is disabled');}
  function demoFind(){throw Error('Demo data is disabled');}
  function demoQueue(){throw Error('Demo data is disabled');}
  function demoSearch(){throw Error('Demo data is disabled');}
  if(typeof document!=='undefined')document.addEventListener('DOMContentLoaded',init);
  if(typeof module!=='undefined'&&module.exports)module.exports={pageItems,SIZES,esc,asRows,matchContext,isQueueItem,refId,queryCriterion,statusClass,contactLookup,reviewKind,reviewSignals,REVIEW_GROUPS,DEMO_RECORDS,M};
})();