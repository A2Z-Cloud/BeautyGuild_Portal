/* Beauty Guild CRM Staff Workspace V1.1 - 21 October 2026.
   Live Zoho CRM SDK, no fake records. Existing native CRM actions remain authoritative.
   V1 writes only authorised Notes and Tasks. Creation/checkout are Coming Soon.
*/
(function () {
  'use strict';
  const M = Object.freeze({CONTACT:'Contacts',ACCOUNT:'Accounts',PROFILE:'Membership',DEAL:'Deals',ADDON:'Membership_Extension',POLICY:'Insurance_Policy',EXT:'Insurance_Extension',PERSON:'Insured_People',PREMISES:'Insured_Premises',DECLARATION:'Declarations',REVISION:'Policy_Revisions',RISK:'Risk_Screenings',ACC:'Training_Centre_Accred',CENTRE:'Training_Centres',QUAL:'Qualifications',OFFER:'TC_Course_Offering',TUTOR:'Tutor_Relationships',ACCLINK:'Accreditation_Centre_Link',ACCEXT:'Accreditation_Extensions',TASK:'Tasks'});
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
  const VIEW_TITLES={processing:['Staff Workspace','Applications and customer records'],overview:['Customers','Contact, organisation and membership information'],membership:['Membership','Membership records and renewals'],insurance:['Insurance','Policies, cover and underwriting'],accreditation:['Accreditation','Applications, qualifications, centres and courses'],queue:['Applications','Applications requiring attention'],create:['New application','Staff-assisted journey preview · stops before payment']};
  const VIEWS_FOR={Contacts:'overview',Accounts:'overview',Membership:'membership',Deals:'membership',Membership_Extension:'membership',Insurance_Policy:'insurance',Insurance_Extension:'insurance',Declarations:'insurance',Insured_People:'insurance',Insured_Premises:'insurance',Policy_Revisions:'insurance',Risk_Screenings:'insurance',Training_Centre_Accred:'accreditation',Training_Centres:'accreditation',Qualifications:'accreditation',TC_Course_Offering:'accreditation',Tutor_Relationships:'accreditation'};
  const ALL_ENTITIES=new Set(Object.values(M));
  const CONTACT_RELATIONS=[['Membership','Contact'],['Deals','Contact_Name'],['Insurance_Policy','Contact'],['Training_Centre_Accred','Applicant_Contact'],['Qualifications','Contact'],['Training_Centres','Contact']];
  const RELATIONS={
    Insurance_Policy:[['Insurance_Extension','Policy'],['Insured_People','Policy'],['Insured_Premises','Policy'],['Declarations','Insurance_Policy'],['Policy_Revisions','Policy'],['Risk_Screenings','Policy']],
    Training_Centre_Accred:[['Accreditation_Centre_Link','Accreditation'],['Accreditation_Extensions','Accreditation'],['TC_Course_Offering','Accreditation'],['Tutor_Relationships','Accreditation'],['Qualifications','Primary_Accreditation']],
    Deals:[['Membership_Extension','Membership_Extension']]
  };
  // API names are the CRM related-list names, which can differ from module names.
  // Restricted or unavailable related lists are reported rather than silently omitted.
  const NATIVE_RELATIONS = Object.freeze({
    Contacts:[['Notes','Notes'],['Attachments','Attachments'],['Tasks','Tasks']],
    Accounts:[['Notes','Notes'],['Attachments','Attachments'],['Tasks','Tasks']],
    Membership:[['Notes','Notes'],['Attachments','Attachments'],['Tasks','Tasks']],
    Deals:[['Notes','Notes'],['Attachments','Attachments'],['Tasks','Tasks'],['Membership','Member profile'],['Insurance_Policy','Insurance policies'],['Accreditation1','Accreditations'],['Membership_Extension1','Membership extensions']],
    Insurance_Policy:[['Notes','Notes'],['Attachments','Attachments'],['Tasks','Tasks'],['Insurance_Extensions','Insurance extensions'],['Insured_People','Insured people'],['Insured_Premises','Insured premises'],['Declarations','Declarations'],['Risk_Screenings','Risk screenings'],['Policy_Revisions','Policy revisions']],
    Training_Centre_Accred:[['Notes','Notes'],['Attachments','Attachments'],['Tasks','Tasks'],['Accreditation_Centre_Link','Accreditation centre links'],['Training_Centre_Course_Offering','Course offerings'],['Tutor_Relationship','Tutors'],['Accreditation_Extensions','Accreditation extensions']],
    Training_Centres:[['Notes','Notes'],['Attachments','Attachments'],['Tasks','Tasks']]
  });
  const STATUSES={ok:['paid','current','verified','approved','active','clear','complete','completed','fulfilled','scheduled'],danger:['declined','failed','cancelled','refunded','banned','rejected','expired','stop','blocked'],attention:['refer','pending','outstanding','review','awaiting','processing','not paid','not assessed','unverified','draft','needs']};
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
    Risk_Screenings:[['Name','Screening'],['Check','Check type'],['Result','Result'],['Investigation_Status','Investigation status'],['Screened_At','Screening date'],['Data_Version','Source version']],
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
    Risk_Screenings:{title:'Risk screenings',desc:'Sanctions and postcode checks',kind:'risk'},
    Policy_Revisions:{title:'Policy revisions',desc:'Amendments, cancellations and refunds (view only)',kind:'revision'},
    Training_Centre_Accred:{title:'Accreditation applications',desc:'Submission, verification and payment status',kind:'accreditation'},
    Training_Centres:{title:'Training centres',desc:'Centre profiles and verification',kind:'centre'},
    Accreditation_Centre_Link:{title:'Linked centres',desc:'Additional centres under accreditation',kind:'centrelink'},
    Accreditation_Extensions:{title:'Accreditation extensions',desc:'Additional fees and verification',kind:'accrext'},
    Qualifications:{title:'Qualifications',desc:'Candidate qualifications and verification',kind:'qual'},
    TC_Course_Offering:{title:'Course offerings',desc:'Offerings and their approval status',kind:'offer'},
    Tutor_Relationships:{title:'Tutor relationships',desc:'Tutors associated with training centres',kind:'tutor'}
  };
  // Staff-assisted journey is a preview only; customer creation is an explicitly triggered live CRM write.
  const DEMO=false; // This CRM release cannot enter sample-data mode.
  const state={pages:{},limited:{},connected:false,demo:DEMO,view:'processing',contact:null,focus:null,focusRelation:{},lists:{},errors:{},queueKind:'insurance',queue:[],queueLimit:100,crmPageLimit:2,queueLoaded:false,browse:{},customerNames:{},browseFilter:'all',browseKind:'insurance',busy:false,requestId:0,searchResults:[],searchQuery:'',directory:[],directoryLoaded:false,nativeLists:{},nativeErrors:{},actionTarget:null,actionType:'note',currentUser:null,reviewDrafts:{},savingReview:false,history:[]};
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
  function customerName(entity,r){
    if(entity==='Contacts')return [r.First_Name,r.Last_Name].filter(Boolean).join(' ')||r.Full_Name||'';
    const source={Insurance_Policy:'Contact',Training_Centre_Accred:'Applicant_Contact',Deals:'Contact_Name',Membership:'Contact',Qualifications:'Contact',Training_Centres:'Contact',Insurance_Extension:'Contact'}[entity];
    const v=r[source];return (v&&typeof v==='object'&&(v.name||v.display_value))||state.customerNames[refId(v)]||'';
  }
  function rowTitle(entity,r){if(!r)return'';const names={Accounts:r.Account_Name,Contacts:r.Full_Name||[r.First_Name,r.Last_Name].filter(Boolean).join(' '),Membership:r.Name,Deals:r.Deal_Name,Insurance_Policy:r.Name||r.Policy_Number,Training_Centre_Accred:r.Name||r.Accreditation_Reference,Training_Centres:r.Name,Qualifications:r.Name,Insurance_Extension:r.Cover_Type||r.Name,Insured_People:[r.First_Name,r.Last_Name].filter(Boolean).join(' ')||r.Name,Insured_Premises:r.Name||r.Postcode,Declarations:r.Name,Risk_Screenings:r.Name||r.Check,Policy_Revisions:r.Revision_Reference||r.Name,TC_Course_Offering:r.Course&&r.Course.name||r.Name,Tutor_Relationships:r.Tutor_Contact&&r.Tutor_Contact.name||r.Name};return txt(names[entity]||r.Name||r.id);}
  const STATUS_FIELDS={Membership:['Current_Membership_Status'],Deals:['Stage','Payment_Status'],Insurance_Policy:['Application_Status','Underwriting_Status','Policy_Status','Payment_Status'],Insurance_Extension:['Status'],Risk_Screenings:['Result','Investigation_Status'],Policy_Revisions:['Revision_Status'],Training_Centre_Accred:['Application_Stage','Accreditation_Status','Payment_Status'],Training_Centres:['Centre_Status'],Qualifications:['Verification_Status'],TC_Course_Offering:['Offering_Status'],Tutor_Relationships:['Status'],Membership_Extension:['Status']};
  function rowStatus(entity,r){return (STATUS_FIELDS[entity]||[]).map(k=>({key:k,label:valueFor(k,r[k]),value:r[k]}));}
  function rowMeta(entity,r){const fields={Accounts:['Town','Country'],Membership:['Current_Member_Type'],Deals:['Expiry_Date','Membership_Branch'],Insurance_Policy:['Insured_Trading_Name','Policy_End_Date'],Insurance_Extension:['Gross_Amount'],Training_Centre_Accred:['Valid_To','Accreditation_Level'],Training_Centres:['Town'],Risk_Screenings:['Screened_At','Check'],Policy_Revisions:['Change_Type','Requested_Effective_Date'],TC_Course_Offering:['Training_Centre'],Qualifications:['Date_Completed_Year']};return (fields[entity]||[]).map(k=>valueFor(k,r[k])).filter(v=>v!=='—').join(' · ');}
  function recordSummary(entity,r){const name=customerName(entity,r),fallback=r.Email||r.Insured_Trading_Name||r.Business_Trading_Name||'';return [name,fallback,rowMeta(entity,r)].filter(Boolean).join(' · ');}
  function setNotice(message,type='info'){const el=$('#notice');if(!message){el.hidden=true;return}el.hidden=false;el.className='notice '+type;el.textContent=message;}
  function loading(){return'<div class="skeleton"></div><div class="skeleton" style="height:65px"></div>';}
  function empty(head,body){return`<div class="empty"><span class="symbol">${icon('file-search')}</span><strong>${esc(head)}</strong><p>${esc(body)}</p></div>`;}
  function panel(title,desc,body,aside=''){return`<section class="panel"><div class="panel-head"><div><h2>${esc(title)}</h2>${desc?`<p>${esc(desc)}</p>`:''}</div>${aside}</div>${body}</section>`;}
  function kvs(entity,r){const pairs=(FIELDS[entity]||Object.keys(r).slice(0,15).map(k=>[k,k])).filter(([key])=>r[key]!==null&&r[key]!==undefined&&r[key]!==''||STATUS_FIELDS[entity]?.includes(key));return`<div class="kv-grid">${pairs.map(([k,label])=>`<div class="kv"><div class="kv-label">${esc(label)}</div><div class="kv-value">${esc(valueFor(k,r[k]))}</div></div>`).join('')}</div>`;}
  function detailSections(entity,r){
    const all=FIELDS[entity]||[];
    const groupings={
      Insurance_Policy:[['Application and customer',['Name','Insured_Trading_Name','Policy_Type','Application_Status','Entry_Route']],['Underwriting and screening',['Underwriting_Status','Risk_Status','Member_Gate_Result','Sanctions_Status','Sanctions_Checked_At','Manual_Review_Outcome','Stop_Reason']],['Payment and cover',['Payment_Status','Policy_Status','Finance_Sync_Status','Quote_Version','Reprice_Required','Policy_Start_Date','Policy_End_Date','Annual_Turnover']],['Documents and follow-up',['Next_Action','Next_Action_Date','Document_Status','Documents_Generated_At','Insurance_Schedule_Link','Statement_of_Fact_Link','Workdrive_Link']]],
      Training_Centre_Accred:[['Application',['Name','Application_Stage','Accreditation_Status','Accreditation_Level','Purchase_Type']],['Payment and validity',['Payment_Status','Quoted_Amount','Valid_From','Valid_To']],['Verification and delivery',['Other_Tutors_Used','Number_of_Tutors','Additional_Centres_Used']]],
      Deals:[['Membership application',['Deal_Name','Stage','Membership_Type','Membership_Branch','Purchase_Type','Membership_Subscription_Type']],['Payment and renewal',['Payment_Status','Amount','Start_Date','Expiry_Date','Next_Payment_Date']],['Restrictions',['Banned_From_Membership','Banned_From_Insurance','Has_Insurance_Issue']]]
    }[entity];
    if(!groupings)return panel('Record details','Information recorded in Zoho CRM',kvs(entity,r));
    const assigned=new Set(groupings.flatMap(x=>x[1]));
    const groups=[...groupings,['Other information',all.map(x=>x[0]).filter(k=>!assigned.has(k))]];
    const html=groups.map(([name,keys])=>{
      const pairs=all.filter(([key])=>keys.includes(key)&&(r[key]!==null&&r[key]!==undefined&&r[key]!==''||STATUS_FIELDS[entity]?.includes(key)));
      if(!pairs.length)return'';
      return `<section class="detail-section"><h3>${esc(name)}</h3><div class="kv-grid">${pairs.map(([k,label])=>`<div class="kv"><div class="kv-label">${esc(label)}</div><div class="kv-value">${esc(valueFor(k,r[k]))}</div></div>`).join('')}</div></section>`;
    }).join('');
    return `<div class="detail-section-grid">${html}</div>`;
  }
  function recordRow(entity,r){const title=rowTitle(entity,r),summary=recordSummary(entity,r);const statuses=rowStatus(entity,r);
    const contact=customerName(entity,r);return `<article class="record-row rich-record" aria-label="${esc(title)}"><div class="record-identity"><div class="record-title">${esc(title)}</div><div class="record-meta">${esc(contact||summary||META[entity]?.title||entity)}</div>${contact&&summary!==contact?`<div class="record-meta secondary-meta">${esc(rowMeta(entity,r))}</div>`:''}</div><div class="record-statuses">${statuses.length?statuses.map(x=>`<div class="status-pair"><small>${esc(x.key.replaceAll('_',' '))}</small>${x.value?badge(x.label):'<span class="status-missing">Not recorded</span>'}</div>`).join(''):''}</div><div class="record-actions"><button class="button tiny secondary" data-action="select" data-entity="${esc(entity)}" data-id="${esc(r.id)}">View details</button><button class="linklike" data-action="open" data-entity="${esc(entity)}" data-id="${esc(r.id)}">Open in CRM ${icon('arrow-up-right')}</button></div></article>`;}
  const SIZES={related:10,queue:15,search:15,customers:15,native:10};
  function pageItems(key,rows,size){const total=rows.length,pages=Math.max(1,Math.ceil(total/size));const page=Math.max(1,Math.min(pages,state.pages[key]||1));state.pages[key]=page;const start=(page-1)*size;const controls=pages>1?`<nav class="pagination" aria-label="Record pages"><span>${start+1}–${Math.min(total,start+size)} of ${total} loaded</span><button class="page-button" data-action="paginate" data-key="${esc(key)}" data-page="${page-1}" ${page===1?'disabled':''}>Previous</button><span>${page} / ${pages}</span><button class="page-button" data-action="paginate" data-key="${esc(key)}" data-page="${page+1}" ${page===pages?'disabled':''}>Next</button></nav>`:'';return{rows:rows.slice(start,start+size),controls};}
  function listPanel(entity,items,opts={}){const meta=META[entity]||{title:entity,desc:''};const fault=state.errors[entity];const text=fault?`<div class="risk-banner">${esc(fault)}</div>`:items.length?pageItems('related:'+entity,items,SIZES.related).rows.map(r=>recordRow(entity,r)).join('')+pageItems('related:'+entity,items,SIZES.related).controls:empty('No linked records','No records to show.');return panel(meta.title,`${meta.desc} · ${items.length} loaded${state.limited[entity]?' · Further records may exist in CRM':''}`,text,opts.focus?'':'');}
  function stat(label,value,hint){return`<div class="stat-card"><span class="stat-label">${esc(label)}</span><span class="stat-value">${esc(txt(value))}</span><span class="stat-hint">${esc(hint||'')}</span></div>`;}
  // Workflow trigger fields: every field whose change fires a CRM workflow is editable inline wherever it is shown
  // in the record view. A change is held until staff confirm it, then saved with Trigger:['workflow'], exactly like
  // an inline edit in CRM, and an audit note is added. Options mirror the CRM picklists (excluding -None-).
  const WF_FIELDS={
    Deals:{
      Payment_Status:{options:['Pending','Paid','Not Paid','Part Refunded','Refunded','Failed'],workflow:'Paid: activates the membership, marks linked membership extensions as paid and emails the acceptance letter (New) or renewal receipt (Renewal).'},
      Purchase_Type:{options:['New','Renewal','Upgrade'],workflow:'Renewal: copies the previous membership details onto this transaction when none is linked yet.'}
    },
    Insurance_Policy:{
      Application_Status:{options:['Draft','In Progress','Quote Saved','Referred','Ready for Payment','Awaiting Payment','Completed','Withdrawn (REC)','Expired'],workflow:'Re-runs the insurance member gate (checks the member profile for insurance bans or issues) while the application is open.'},
      Payment_Status:{options:['Paid','Not Paid','Pending','Failed','Expired'],workflow:'Paid: runs policy activation (checks the gates, sets the policy Active with start and end dates and activates the covers).'},
      Policy_Status:{options:['Draft','Scheduled','Active','Expired','Cancelled (REC)'],workflow:'Active: generates the policy documents in WorkDrive.'},
      Manual_Review_Outcome:{options:['Approved','Approved with Endorsement','Declined'],workflow:'Completes the manual review: Approved releases the referral, Declined stops and withdraws the application.'},
      Document_Status:{options:['Not Generated','Draft','Issued','Regenerate','Failed'],workflow:'Regenerate: rebuilds the policy documents in WorkDrive.'}
    },
    Risk_Screenings:{
      Result:{options:['Clear','Potential match','Listed postcode','Error'],workflow:'Sanctions checks only: rolls the result up to the policy sanctions status and creates a staff task if review is needed.'},
      Investigation_Status:{options:['Open','Cleared','Confirmed'],workflow:'Sanctions checks only: rolls the result up to the policy sanctions status and creates a staff task if review is needed.'}
    },
    Training_Centre_Accred:{
      Application_Stage:{options:['Draft','Quote Saved','Submitted','Qualifications Outstanding','Awaiting Payment','Paid','Payment Failed','Needs Processing','Under Review','Needs Information','Approved','Rejected','Cancelled','Payment Processing'],workflow:'Approved: emails the approval and acceptance letter. Paid: emails payment confirmation. Payment Failed: emails the payment failed notice. Payment Processing: updates the Stripe payment log.'},
      Accreditation_Status:{options:['Verified','Unverified'],workflow:'Verified: publishes the accreditation to the website.'}
    },
    TC_Course_Offering:{
      Offering_Status:{options:['Pending Review','Approved','Rejected','Removed'],workflow:'Approved: creates the course as a product.'}
    },
    Tutor_Relationships:{
      Membership_Exists:{type:'boolean',workflow:'Emails the tutor (with-membership or without-membership version).'}
    }
  };
  function wfConfig(entity,key){return WF_FIELDS[entity]&&Object.prototype.hasOwnProperty.call(WF_FIELDS[entity],key)?WF_FIELDS[entity][key]:null;}
  function wfLabel(key){return(FIELDS_LABEL_LOOKUP[key]||key.replaceAll('_',' '));}
  const FIELDS_LABEL_LOOKUP={};Object.values(FIELDS).forEach(rows=>rows.forEach(([k,l])=>{if(!FIELDS_LABEL_LOOKUP[k])FIELDS_LABEL_LOOKUP[k]=l;}));
  function wfOptions(cfg){return cfg.type==='boolean'?[['true','Yes'],['false','No']]:cfg.options.map(v=>[v,v]);}
  function wfCurrent(cfg,raw){return cfg.type==='boolean'?(raw===true?'true':raw===false?'false':''):(raw==null?'':String(raw));}
  function wfText(cfg,v){return cfg.type==='boolean'?(v==='true'?'Yes':v==='false'?'No':'not recorded'):(v||'not recorded');}
  function workflowFieldEditor(entity,record,key){
    const cfg=wfConfig(entity,key);if(!cfg||!record||!record.id)return null;
    const current=wfCurrent(cfg,record[key]),opts=wfOptions(cfg),tag=entity+':'+record.id+':'+key;
    const pending=state.wfPending&&state.wfPending.tag===tag?state.wfPending.value:null,shown=pending!=null?pending:current,saving=state.wfSaving===tag;
    const html=(opts.some(o=>o[0]===shown)?[]:[`<option value="" selected disabled>${esc(current?valueFor(key,record[key]):'Not recorded')}</option>`]).concat(opts.map(([v,l])=>`<option value="${esc(v)}" ${v===shown?'selected':''}>${esc(l)}</option>`)).join('');
    return `<select class="accred-status-select wf-edit-select" data-wf-edit="true" data-entity="${esc(entity)}" data-id="${esc(record.id)}" data-field="${esc(key)}" aria-label="${esc(wfLabel(key))}" title="Editable. ${esc(cfg.workflow)}" ${state.wfSaving?'disabled':''}>${html}</select>${saving?' <small>Saving…</small>':''}`;
  }
  if(typeof window!=='undefined')window.BGAccredEdit={render:workflowFieldEditor};
  function wfBar(){let el=document.getElementById('wfConfirm');if(!el){el=document.createElement('div');el.id='wfConfirm';el.className='wf-confirm';el.setAttribute('role','alertdialog');el.setAttribute('aria-live','polite');el.hidden=true;document.body.appendChild(el);}return el;}
  function wfHide(){state.wfPending=null;const el=document.getElementById('wfConfirm');if(el){el.hidden=true;el.innerHTML='';}}
  function askWorkflowEdit(entity,id,key,value){
    const cfg=wfConfig(entity,key);if(!cfg||!/^\d{8,30}$/.test(String(id||''))||!wfOptions(cfg).some(o=>o[0]===value)){setNotice('Select a valid record and value first.');return}
    const record=state.focus&&idsEqual(state.focus.record.id,id)?state.focus.record:null,current=record?wfCurrent(cfg,record[key]):'';
    if(value===current){wfHide();render();return}
    state.wfPending={tag:entity+':'+id+':'+key,entity,id:String(id),key,value,previous:current};
    const el=wfBar();
    el.innerHTML=`<div class="wf-confirm-text"><strong>Change ${esc(wfLabel(key))} from ${esc(wfText(cfg,current))} to ${esc(wfText(cfg,value))}?</strong><span>This runs the CRM workflow. ${esc(cfg.workflow)}</span></div><div class="wf-confirm-actions"><button type="button" class="button tiny secondary" data-wf-cancel="true">Cancel</button><button type="button" class="button tiny" data-wf-save="true">Save change</button></div>`;
    el.hidden=false;render();
  }
  async function saveWorkflowEdit(){
    const p=state.wfPending;if(!p||state.wfSaving)return;const cfg=wfConfig(p.entity,p.key);if(!cfg){wfHide();return}
    const apiValue=cfg.type==='boolean'?p.value==='true':p.value;
    state.wfSaving=p.tag;wfHide();render();setNotice(`Saving ${wfLabel(p.key)} as ${wfText(cfg,p.value)}…`,'info');
    try{
      const result=await api().updateRecord({Entity:p.entity,APIData:{id:p.id,[p.key]:apiValue},Trigger:['workflow']});assertSaved(result);
      try{const who=state.currentUser&&(state.currentUser.full_name||state.currentUser.email)||'staff user';await api().addNotes({Entity:p.entity,RecordID:p.id,Title:`${wfLabel(p.key)} changed to ${wfText(cfg,p.value)}`,Content:`${wfLabel(p.key)} changed from ${wfText(cfg,p.previous)} to ${wfText(cfg,p.value)} by ${who} in the Staff Workspace. CRM workflows were triggered.`});}catch(_){/* The change is saved; the audit note is best effort. */}
      state.wfSaving=null;await select(p.entity,p.id);setNotice(`${wfLabel(p.key)} updated to ${wfText(cfg,p.value)}. CRM workflows have been triggered.`,'success');
    }catch(err){state.wfSaving=null;render();setNotice(`Could not update ${wfLabel(p.key)}: ${err.message||err}`,'error')}
  }
  function crmActionBar(entity,id){
    return `<div class="sheet-actions workspace-actions"><button type="button" class="button secondary" data-action="email" data-entity="${esc(entity)}" data-id="${esc(id)}">${icon('link')} Send email in CRM</button><button type="button" class="button secondary" data-action="crm-actions" data-entity="${esc(entity)}" data-id="${esc(id)}">${icon('arrow-up-right')} CRM buttons / actions</button><button type="button" class="button secondary" data-action="note" data-entity="${esc(entity)}" data-id="${esc(id)}">${icon('sticky-note')} Add note</button><button type="button" class="button secondary" data-action="task" data-entity="${esc(entity)}" data-id="${esc(id)}">${icon('list-todo')} Create task</button></div>`;
  }
  const RELATED_MODULES={Insurance_Extensions:M.EXT,Insurance_Policy:M.POLICY,Accreditation1:M.ACC,Membership:M.PROFILE,Membership_Extension1:M.ADDON,Training_Centre_Course_Offering:M.OFFER,Tutor_Relationship:M.TUTOR};
  function nativeRow(list,row){
    const title=txt(row.Note_Title||row.Subject||row.File_Name||row.file_name||row.Name||row.name||row.Description||row.id);
    const detail=txt(row.Note_Content||row.Created_Time||row.Due_Date||row.File_Size||row.Status||'');
    return `<div class="native-row"><div><strong>${esc(title)}</strong><small>${esc(detail==='—'?'':detail)}</small></div>${row.id&&ALL_ENTITIES.has(RELATED_MODULES[list]||list)?`<button class="button tiny secondary" data-action="select" data-entity="${esc(RELATED_MODULES[list]||list)}" data-id="${esc(row.id)}">View</button>`:''}</div>`;
  }
  function nativeRelatedPanel(){
    const f=state.focus;if(!f)return'';
    const cfg=NATIVE_RELATIONS[f.entity]||[];if(!cfg.length)return'';
    return `<h3 class="section-title">CRM related lists</h3><div class="native-grid">${cfg.map(([list,label])=>{
      const key=f.entity+':'+f.record.id+':'+list, rows=state.nativeLists[key],error=state.nativeErrors[key];
      let body=rows===undefined?(error?`<p class="native-error">${esc(error)} <button class="linklike" type="button" data-action="open" data-entity="${esc(f.entity)}" data-id="${esc(f.record.id)}">Open in CRM</button></p>`:'<p class="muted">Loading related records…</p>'):
        rows.length?`${pageItems('native:'+list,rows,SIZES.native).rows.map(row=>nativeRow(list,row)).join('')}${pageItems('native:'+list,rows,SIZES.native).controls}${error?`<p class="native-error">${esc(error)}</p>`:''}`:'<p class="native-empty">No linked records returned.</p>';
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
  function contextCard(){const c=state.contact;if(c&&window.BGCRM12){window.BGCRM12.prime(M.CONTACT,ZOHO.CRM,render);return contextBar()+window.BGCRM12.detailPage(M.CONTACT,c,{crm:ZOHO.CRM,rerender:render,title:rowTitle,summary:recordSummary,actions:crmActionBar,processing:processingPanel});}if(!c)return empty('Select a customer','Search for a contact, or open this widget from a CRM Contact, Membership, Insurance Policy or Accreditation record.');const profiles=allFor(M.PROFILE),deals=allFor(M.DEAL),policies=allFor(M.POLICY),apps=allFor(M.ACC);const current=profiles.find(p=>p.Current_Membership_Status==='Current')||profiles[0];const risky=deals.filter(d=>d.Banned_From_Membership||d.Banned_From_Insurance||d.Has_Insurance_Issue);return`${contextBar()}${risky.length?'<div class="risk-banner"><strong>Customer restrictions or insurance issues are recorded.</strong> Review the relevant Membership transaction before proceeding.</div>':''}<div class="stats">${stat('Member profile',current?current.Current_Member_Type:'Not found',current?current.Current_Membership_Status:'No member profile linked')}${stat('Insurance policies',policies.length,'Across linked policy records')}${stat('Accreditation applications',apps.length,'Across the applicant contact')}</div>${crmActionBar('Contacts',c.id)}${panel('Customer details','Contact record',kvs(M.CONTACT,c))}${nativeRelatedPanel()}<div class="columns">${listPanel(M.PROFILE,profiles)}${listPanel(M.POLICY,policies)}</div><div class="columns">${listPanel(M.DEAL,deals)}${listPanel(M.ACC,apps)}</div>${allFor(M.ACCOUNT).length?listPanel(M.ACCOUNT,allFor(M.ACCOUNT)):''}`;}
  function accountCard(){const a=state.focus?.record;if(a&&window.BGCRM12){window.BGCRM12.prime(M.ACCOUNT,ZOHO.CRM,render);return window.BGCRM12.detailPage(M.ACCOUNT,a,{crm:ZOHO.CRM,rerender:render,title:rowTitle,summary:recordSummary,actions:crmActionBar,processing:processingPanel});}if(!a||state.focus.entity!==M.ACCOUNT)return noContact();return `<div class="context-strip"><div><small>ORGANISATION</small><strong>${esc(rowTitle(M.ACCOUNT,a))}</strong><small>${esc(a.Email_Address||a.Phone||'Organisation record')}</small></div><div class="action-bar"><button class="button tiny secondary" data-action="open" data-entity="Accounts" data-id="${esc(a.id)}">${icon('arrow-up-right')} Open in CRM</button></div></div>${crmActionBar('Accounts',a.id)}${panel('Organisation details','Organisation',kvs(M.ACCOUNT,a))}${nativeRelatedPanel()}<h3 class="section-title">Related records</h3><div class="columns">${listPanel(M.CONTACT,allFor(M.CONTACT))}${listPanel(M.CENTRE,allFor(M.CENTRE))}</div><div class="columns">${listPanel(M.ACC,allFor(M.ACC))}${listPanel(M.POLICY,allFor(M.POLICY))}</div>`}
  function noContact(){return panel('Find a record','Search for a customer or application',empty('Nothing selected','Search for a customer above, or open a record from the application lists.'));}
  function focusPanel(entity,r){if(window.BGCRM12){window.BGCRM12.prime(entity,ZOHO.CRM,render);return window.BGCRM12.detailPage(entity,r,{crm:ZOHO.CRM,rerender:render,title:rowTitle,summary:recordSummary,actions:crmActionBar,processing:processingPanel});}const fields=FIELDS[entity];if(!fields)return'';const statuses=rowStatus(entity,r);return `<div class="detail-intro"><div><small>${esc(META[entity]?.title||entity)}</small><h2>${esc(rowTitle(entity,r))}</h2><p>${esc(recordSummary(entity,r))}</p></div><div class="detail-statuses">${statuses.map(x=>`<div><small>${esc(x.key.replaceAll('_',' '))}</small>${x.value?badge(x.label):'<span class="status-missing">Not recorded</span>'}</div>`).join('')}</div></div>${reviewKind(entity)?'':crmActionBar(entity,r.id)}${detailSections(entity,r)}${nativeRelatedPanel()}`;}
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
      <div class="process-entry-grid">${modules.map(([kind,label,desc,iconName])=>`<article class="process-entry"><div class="entry-icon">${icon(iconName)}</div><h3>${label}</h3><p>${desc}</p><button type="button" class="button secondary" data-action="browse" data-kind="${kind}">View applications ${icon('chevron-right')}</button></article>`).join('')}</div>
      <div class="create-cta"><div><strong>Start a new application</strong><p>Walk through the guided application with a customer. The demonstration stops before payment.</p></div><div class="create-cta-actions"><button type="button" class="button secondary" data-action="journey-start">${icon('plus-circle')} Membership</button><button type="button" class="button secondary" data-action="journey-start">${icon('plus-circle')} Insurance</button><button type="button" class="button secondary" data-action="journey-start">${icon('plus-circle')} Accreditation</button></div></div>`;
  }
  function processingPanel(entity,record){
    const kind=reviewKind(entity);if(!kind)return'';
    const signals=reviewSignals(kind,record);
    return `<section class="process-sheet" aria-label="Application actions">
      <div class="sheet-heading"><div><span class="process-kicker">APPLICATION REVIEW</span><h2>${esc(rowTitle(entity,record))}</h2><p>Review the information below, then make any changes using the existing CRM process.</p></div>${badge(record.Application_Stage||record.Underwriting_Status||record.Payment_Status||record.Current_Membership_Status)}</div>
      ${signals.length?`<div class="signal-list"><strong>${icon('alert-circle')} Needs attention</strong>${signals.map(s=>`<div class="signal"><b>${esc(s.label)}</b><span>${esc(s.reason)}</span></div>`).join('')}</div>`:''}
      <div class="sheet-actions"><button type="button" class="button primary" data-action="open" data-entity="${esc(entity)}" data-id="${esc(record.id)}">${icon('arrow-up-right')} Open in CRM</button><button type="button" class="button secondary" data-action="email" data-entity="${esc(entity)}" data-id="${esc(record.id)}">Send email</button><button type="button" class="button secondary" data-action="crm-actions" data-entity="${esc(entity)}" data-id="${esc(record.id)}">CRM buttons / actions</button><button type="button" class="button secondary" data-action="note" data-entity="${esc(entity)}" data-id="${esc(record.id)}">${icon('sticky-note')} Add note</button><button type="button" class="button secondary" data-action="task" data-entity="${esc(entity)}" data-id="${esc(record.id)}">${icon('list-todo')} Create task</button><button type="button" class="button secondary" data-action="refresh-record" data-entity="${esc(entity)}" data-id="${esc(record.id)}">${icon('refresh-cw')} Refresh</button></div>
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

  function sectionView(kind){const config={membership:{primary:[M.PROFILE,M.DEAL],groups:[[M.PROFILE,M.DEAL],[M.ADDON]]},insurance:{primary:[M.POLICY],groups:[[M.POLICY],[M.EXT,M.PERSON],[M.PREMISES,M.DECLARATION],[M.REVISION]]},accreditation:{primary:[M.ACC],groups:[[M.ACC,M.CENTRE],[M.QUAL,M.OFFER],[M.TUTOR,M.ACCLINK],[M.ACCEXT]]}}[kind];if(!config)return'';
    const f=state.focus;if(!f||state.focusEntityView!==kind)return browserList(kind,state.browseFilter==='attention');if(window.BGCRM12)return `<button class="button secondary" type="button" data-action="back-to-list" data-kind="${kind}">${icon('arrow-left')} All ${kind} records</button>`+contextBar(false)+focusPanel(f.entity,f.record);
    const relatedEntities=config.groups.flat().filter(e=>e!==f.entity&&(allFor(e).length||state.errors[e]));const rowGroups=relatedEntities.length?`<div class="related-grid">${relatedEntities.map(e=>listPanel(e,allFor(e))).join('')}</div>`:empty('No additional linked records','The available CRM data does not include additional related records for this application.');
    return `<button class="button secondary" type="button" data-action="back-to-list" data-kind="${kind}">${icon('arrow-left')} All ${kind} records</button>${contextBar(false)}${reviewKind(f.entity)?processingPanel(f.entity,f.record):''}${focusPanel(f.entity,f.record)}<h3 class="section-title">Linked records</h3>${rowGroups}`;
  }
  function queueView(){return `<div class="queue-controls">${Object.keys(BROWSE_MODULE).map(k=>`<button class="queue-tab ${k===state.queueKind?'selected':''}" data-queue="${k}">${esc(k[0].toUpperCase()+k.slice(1))}</button>`).join('')}</div>${browserList(state.queueKind,state.browseFilter==='attention')}`;}
  // Staff application walkthrough. It deliberately stops before creating application
  // records, saving portal drafts or initiating Stripe. These need the Catalyst staff adapter.
  // Labels and step groups follow Portal V2; this is a demonstration, not a second pricing engine.
  const JOPTIONS={
    yn:[['yes','Yes'],['no','No']],
    countries:[['United Kingdom','United Kingdom'],['England','England'],['Scotland','Scotland'],['Wales','Wales'],['Northern Ireland','Northern Ireland'],['Ireland','Ireland'],['Other','Other']]
  };
  const J=(name,label,type='text',options=null,required=false,when=null)=>({name,label,type,options,required,when});
  const JOURNEY_FLOW={
    membership:{title:'Membership',description:'Join, renew or upgrade using the Guild membership journey.',steps:[
      {title:'Membership options',description:'Choose the Guild membership requested by the customer.',fields:[
        J('membershipLevel','Membership level','select',[['associate','Associate Member'],['full_non_salon','Full Member (Non-Salon)'],['full_salon','Full Member (Salon)']],true),
        J('membershipBranch','Primary Guild branch','select',[['beauty','Beauty'],['holistic','Holistic'],['nails','Nails'],['hair','Hairdressers and Barbers']],true),
        J('billing','Payment frequency','radio',[['annual','Annual'],['monthly','Monthly']],true),
        J('joinType','Application type','radio',[['new','New member'],['renewal','Renewal'],['upgrade','Upgrade']],true)]},
      {title:'Applicant details',description:'Check the customer and business details to be used for the membership.',fields:[
        J('businessName','Business or trading name'),J('address1','Address line 1'),J('town','Town / city'),J('postcode','Postcode'),J('country','Country','select',JOPTIONS.countries)]},
      {title:'Additional branches and add-ons',description:'Optional extras available in Portal V2.',fields:[
        J('additionalBranches','Additional Guild branches','multi',[['beauty','Beauty'],['holistic','Holistic'],['nails','Nails'],['hair','Hair']]),
        J('addonCertificate','Membership certificate','checkbox'),J('addonBadge','Badge','checkbox'),J('addonSticker','Window sticker','checkbox'),J('addonBundle','Membership bundle','checkbox'),
        J('insuranceWanted','Add insurance','radio',JOPTIONS.yn,true)]},
      {title:'Insurance requirements',description:'The insurance questionnaire is completed using the existing Portal V2 journey when requested.',when:a=>a.insuranceWanted==='yes',fields:[
        J('insWorking','How you work','multi',[['insWorkingFromHome','Working from home'],['insMobile','Mobile practitioner'],['insRentedRoom','Rented treatment room'],['insSubcontractor','Self-employed subcontractor'],['insSalon','Salon owner']],true),
        J('insTurnover','Annual turnover','select',[['100000','Up to £100,000'],['175000','£100,001 to £175,000'],['250000','£175,001 to £250,000']]),
        J('insTeachingCover','Teaching cover','select',[['none','Not required'],['standard','Standard teaching cover'],['additional','Additional teaching cover']])]},
      {title:'Declarations',description:'Staff record responses; the production journey must retain the required customer confirmations.',fields:[
        J('codeAccepted','Code of Ethics confirmed','radio',JOPTIONS.yn,true),J('termsAccepted','Terms and privacy confirmed','radio',JOPTIONS.yn,true),J('startDate','Requested membership start date','date')]}
    ]},
    insurance:{title:'Insurance',description:'Use the existing Guild insurance quotation questions and referral process.',steps:[
      {title:'How you work',description:'Select each relevant way the applicant works.',fields:[
        J('insWorking','How you work','multi',[['insWorkingFromHome','I work from home'],['insMobile','I work on a mobile basis'],['insRentedRoom','I rent a treatment room'],['insSubcontractor','I am a self-employed subcontractor'],['insSalon','I own or operate a salon']],true),
        J('country','Country','select',JOPTIONS.countries,true)]},
      {title:'Professional activities',description:'Choose treatments and the cover requested.',fields:[
        J('insTurnover','Annual turnover','select',[['100000','Up to £100,000'],['175000','£100,001 to £175,000'],['250000','£175,001 to £250,000']],true),
        J('insTreatmentExtensions','Specialist treatments','multi',[['advanced_electrolysis','Advanced electrolysis'],['microneedling','Microneedling / dermarolling'],['piercing','Nose / cartilage piercing'],['spmu','Microblading and semi-permanent make-up'],['dermaplaning','Dermaplaning']]),
        J('insTeachingCover','Teaching cover','select',[['none','Not required'],['standard','Standard'],['additional','Additional']])]},
      {title:'People and premises',description:'Additional cover depends on the chosen working method.',fields:[
        J('insNamedPeopleCover','Cover for named employees or subcontractors','radio',JOPTIONS.yn),
        J('insEquipmentTier','Equipment cover','select',[['0','None'],['5000','Up to £5,000'],['10000','Up to £10,000'],['15000','Up to £15,000'],['20000','Up to £20,000']]),
        J('insContents','Contents cover','radio',JOPTIONS.yn),J('insBuildingsCover','Buildings cover','radio',JOPTIONS.yn,null,a=>(a.insWorking||[]).includes('insSalon')),
        J('insPremisesPostcode','Premises postcode') ]},
      {title:'Underwriting declarations',description:'Any referral or stop decision belongs to the existing Catalyst and CRM automations.',fields:[
        J('insClaims','Previous claims or losses','radio',JOPTIONS.yn,true),J('insDeclined','Insurance previously declined','radio',JOPTIONS.yn,true),
        J('insFloodHistory','Flood history','radio',JOPTIONS.yn),J('insSubsidenceHistory','Subsidence history','radio',JOPTIONS.yn)]},
      {title:'Review and confirmations',description:'Check the details before seeking a real quote.',fields:[
        J('insQualified','Appropriate qualifications confirmed','radio',JOPTIONS.yn,true),
        J('insAccuracy','Information supplied is accurate','radio',JOPTIONS.yn,true),
        J('insTerms','Terms and non-advised sale confirmed','radio',JOPTIONS.yn,true),J('startDate','Requested policy start date','date')]}
    ]},
    accreditation:{title:'Accreditation',description:'Training centre accreditation with qualifications, tutors and courses.',steps:[
      {title:'Applicant and school',description:'Applicant and training organisation.',fields:[
        J('schoolName','School or training organisation','text',null,true),J('phone','School telephone','tel'),J('email','School email','email'),J('website','Website')]},
      {title:'Training centre',description:'The centre country determines UK or international accreditation.',fields:[
        J('centreName','Training centre name','text',null,true),J('centreAddress1','Address line 1'),J('centreTown','Town / city'),J('centrePostcode','Postcode'),J('centreCountry','Centre country','select',JOPTIONS.countries,true)]},
      {title:'Tutors and additional venues',description:'Collect the number of tutors and venues, then link the actual records through the existing Portal V2 services.',fields:[
        J('otherTutors','Additional tutors used','radio',JOPTIONS.yn,true),J('tutorsCount','Number of tutors','number',null,false,a=>a.otherTutors==='yes'),
        J('additionalCentres','Additional training centres','radio',JOPTIONS.yn,true)]},
      {title:'Courses',description:'Course offerings must be selected from live permitted GTi courses in production.',fields:[
        J('courseSummary','Courses to be offered','textarea'),J('teachingQualification','Recognised teaching qualification held','radio',JOPTIONS.yn,true)]},
      {title:'Declarations and start date',description:'Customer declarations and qualification evidence.',fields:[
        J('qualifiedSixMonths','Qualified in subjects for at least six months','radio',JOPTIONS.yn,true),
        J('evidenceAvailable','Qualification evidence is available','radio',JOPTIONS.yn,true),
        J('termsAccepted','Terms and privacy confirmed','radio',JOPTIONS.yn,true),J('startDate','Requested accreditation start date','date')]}
    ]}
  };
  function initJourney(kind){if(!state.journey)state.journey={kind:kind||null,step:-1,contact:state.contact?{...state.contact}:null,answers:{},contactResults:[],customerSearch:'',formError:'',contactCreating:false};else if(kind&&state.journey.kind!==kind){state.journey.kind=kind;state.journey.step=-1;state.journey.answers={};}}
  function journeyField(f,a){if(f.when&&!f.when(a))return'';const id='j-'+f.name;const v=a[f.name];const val=x=>String(x??'');const options=f.options||[];
    if(f.type==='radio'||f.type==='multi'||f.type==='checkbox'){
      const multi=f.type==='multi',opts=f.type==='checkbox'?[[true,'Include']]:options;
      return `<fieldset class="journey-field"><legend>${esc(f.label)}${f.required?' *':''}</legend><div class="journey-options">${opts.map(([key,label])=>{const selected=multi?Array.isArray(v)&&v.includes(key):f.type==='checkbox'?Boolean(v):v===key;return `<label class="journey-choice"><input data-journey-field="${esc(f.name)}" type="${multi||f.type==='checkbox'?'checkbox':'radio'}" name="${esc(f.name)}" value="${esc(key)}" ${selected?'checked':''}/><span>${esc(label)}</span></label>`}).join('')}</div></fieldset>`;
    }
    const common=`id="${id}" data-journey-field="${esc(f.name)}" ${f.required?'required':''}`;
    let input=f.type==='select'?`<select ${common}><option value="">Select…</option>${options.map(([key,label])=>`<option value="${esc(key)}" ${v===key?'selected':''}>${esc(label)}</option>`).join('')}</select>`:f.type==='textarea'?`<textarea ${common} rows="3">${esc(val(v))}</textarea>`:`<input ${common} type="${esc(f.type)}" value="${esc(val(v))}" />`;
    return `<label class="journey-field" for="${id}"><span>${esc(f.label)}${f.required?' *':''}</span>${input}</label>`;
  }
  function visibleJourneySteps(){const j=state.journey;return(j&&JOURNEY_FLOW[j.kind]?.steps||[]).filter(x=>!x.when||x.when(j.answers));}
  function renderJourney(){initJourney();const j=state.journey;if(j.kind&&j.step>=0&&window.BGJourney12)return window.BGJourney12.render(j);if(!j.kind){return `<section class="journey-shell"><div class="journey-heading"><span class="process-kicker">NEW APPLICATION</span><h2>Select application type</h2><p>Start a staff-assisted Guild application for an existing or new CRM customer.</p></div><div class="journey-type-grid">${Object.entries(JOURNEY_FLOW).map(([kind,c])=>`<button class="journey-type-card" data-action="journey-type" data-kind="${kind}"><strong>${esc(c.title)}</strong><small>${esc(c.description)}</small><span>Start journey →</span></button>`).join('')}</div></section>`;}
    const cfg=JOURNEY_FLOW[j.kind],steps=visibleJourneySteps(),index=Math.min(j.step,steps.length);const current=steps[index],isContact=index<0,atPay=index>=steps.length;
    const labels=['Customer',...steps.map(x=>x.title),'Payment'];const active=isContact?0:atPay?labels.length-1:index+1;
    const bar=`<div class="journey-progress">${labels.map((l,i)=>`<span class="${i===active?'current':i<active?'done':''}">${i+1}. ${esc(l)}</span>`).join('')}</div>`;
    const notice='<div class="journey-preview-notice"><strong>Customer selection</strong><span>Select or create the CRM Contact first. The application form then provides Save to CRM and Resume draft using the deployed Staff API.</span></div>';
    let body='';
    if(isContact){const person=j.contact;body=`<div class="journey-step"><h3>Customer</h3><p>Search CRM Contacts, select an existing Contact or create one with an authorised CRM user.</p>${person?`<div class="selected-customer"><strong>${esc(customerName('Contacts',person))}</strong><small>${esc(person.Email||'No email recorded')}</small><button class="linklike" data-action="journey-clear-contact">Change</button></div>`:''}<div class="journey-customer-find"><label>Find an existing customer<input type="search" data-journey-customer-search="true" placeholder="Enter name or email" value="${esc(j.customerSearch||'')}" /></label><button type="button" class="button secondary" data-action="journey-search-customer">Search CRM</button></div>${j.contactResults.length?`<div class="journey-contact-results">${j.contactResults.map(c=>`<button type="button" data-action="journey-select-contact" data-id="${esc(c.id)}"><strong>${esc(rowTitle('Contacts',c))}</strong><small>${esc(c.Email||'')}</small></button>`).join('')}</div>`:''}<details class="journey-contact-add"><summary>Customer not found? Create a CRM Contact</summary><p>This writes a real Contact to CRM only when you click Create CRM Contact. Check duplicates first.</p><div class="journey-form"><label>First name<input data-journey-new-contact="First_Name" /></label><label>Last name<input data-journey-new-contact="Last_Name" /></label><label>Email<input type="email" data-journey-new-contact="Email" /></label><label>Mobile<input type="tel" data-journey-new-contact="Mobile" /></label></div><button class="button secondary" data-action="journey-create-contact" ${j.contactCreating?'disabled':''}>${j.contactCreating?'Creating…':'Create CRM Contact'}</button></details></div>`;}
    else if(atPay){const entries=steps.flatMap(s=>s.fields).filter(f=>(!f.when||f.when(j.answers))&&j.answers[f.name]!==undefined&&j.answers[f.name]!==''&&j.answers[f.name]!==false);body=`<div class="journey-step"><span class="process-kicker">REVIEW AND PAYMENT</span><h3>Application preview complete</h3><p>Review the entered information. The quote and payment link will be generated by the existing Catalyst service in a future integration; no price has been calculated here.</p><div class="journey-review"><div><b>Customer</b><span>${esc(rowTitle('Contacts',j.contact))}</span></div><div><b>Service</b><span>${esc(cfg.title)}</span></div>${entries.map(f=>`<div><b>${esc(f.label)}</b><span>${esc(Array.isArray(j.answers[f.name])?j.answers[f.name].join(', '):j.answers[f.name])}</span></div>`).join('')}</div><div class="payment-stop"><strong>Payment link</strong><p>Reached the agreed demonstration stopping point. Generating a payable quote, saving the application and calling Stripe are not enabled in this build.</p><button type="button" class="button primary" disabled>Generate payment link · Coming soon</button></div></div>`;}
    else body=`<div class="journey-step"><span class="process-kicker">${esc(cfg.title.toUpperCase())} · STEP ${index+1} OF ${steps.length}</span><h3>${esc(current.title)}</h3><p>${esc(current.description||'')}</p><div class="journey-form">${current.fields.map(f=>journeyField(f,j.answers)).join('')}</div></div>`;
    return `<section class="journey-shell"><div class="journey-heading"><span class="process-kicker">STAFF-ASSISTED APPLICATION</span><h2>${esc(cfg.title)} application</h2><p>${esc(cfg.description)}</p></div>${notice}${isContact&&j.contact?`<div class="journey-footer"><button type="button" class="button secondary" data-action="journey-drafts">Find saved drafts for this customer</button></div>${j.draftsError?`<div class="journey-validation">${esc(j.draftsError)}</div>`:""}${Array.isArray(j.availableDrafts)?j.availableDrafts.map(d=>`<button type="button" class="button secondary" data-action="journey-load-draft" data-service="${esc(d.service)}" data-id="${esc(d.id)}">Resume ${esc(d.service)} draft</button>`).join(""):""}`:""}${bar}${j.formError?`<div class="journey-validation">${esc(j.formError)}</div>`:''}${body}<div class="journey-footer"><button type="button" class="button secondary" data-action="journey-back" ${isContact?'disabled':''}>← Back</button>${!atPay?`<button type="button" class="button primary" data-action="journey-next">${isContact?'Continue with customer':index===steps.length-1?'Review / Payment step':'Continue'} →</button>`:''}<button type="button" class="linklike" data-action="journey-reset">Start again</button></div></section>`;
  }
  function setJourneyField(el){const j=state.journey;if(!j||!el.dataset.journeyField)return;const name=el.dataset.journeyField;if(el.type==='checkbox'){if(el.value==='true'){j.answers[name]=el.checked;}else{const current=Array.isArray(j.answers[name])?[...j.answers[name]]:[];j.answers[name]=el.checked?[...new Set([...current,el.value])]:current.filter(x=>x!==el.value);}}else{j.answers[name]=el.value;}j.formError='';}
  function advanceJourney(delta){const j=state.journey;if(!j?.kind)return;if(j.step>=0&&window.BGJourney12){window.BGJourney12.advance(j,delta);render();return;}const steps=visibleJourneySteps();if(delta<0){j.step=Math.max(-1,j.step-1);j.formError='';render();return;}
    if(j.step===-1){if(!j.contact){j.formError='Select an existing CRM Contact or create a Contact first.';render();return;}}
    else if(j.step<steps.length){const incomplete=steps[j.step].fields.find(f=>(!f.when||f.when(j.answers))&&f.required&&(Array.isArray(j.answers[f.name])?!j.answers[f.name].length:!String(j.answers[f.name]??'').trim()));if(incomplete){j.formError='Complete the required field: '+incomplete.label;render();return;}}
    j.formError='';j.step=Math.min(steps.length,j.step+1);render();
  }
  async function searchJourneyContacts(){const j=state.journey,q=j.customerSearch.trim();if(q.length<2){j.formError='Enter at least two characters.';render();return;}try{const result=await api().searchRecord({Entity:M.CONTACT,Type:q.includes('@')?'email':'word',Query:q,page:1,per_page:15});j.contactResults=asRows(result);j.formError=j.contactResults.length?'':'No matching Contact found. Create a Contact if appropriate.';}catch(e){j.formError='CRM Contact search failed: '+(e.message||e)}render();}
  async function createJourneyContact(){const j=state.journey,values=j.newContact||{};const first=String(values.First_Name||'').trim(),last=String(values.Last_Name||'').trim(),email=String(values.Email||'').trim().toLowerCase();if(!first||!last||!/^\S+@\S+\.\S+$/.test(email)){j.formError='Enter first name, surname and a valid email before creating the CRM Contact.';render();return;}
    if(j.contactCreating)return;j.contactCreating=true;j.formError='';render();try{const existing=asRows(await api().searchRecord({Entity:M.CONTACT,Type:'email',Query:email,page:1,per_page:20})).filter(x=>String(x.Email||'').trim().toLowerCase()===email);if(existing.length){j.contactResults=existing;j.formError='A Contact with this email already exists. Select the matching record instead.';return;}
      const result=await api().insertRecord({Entity:M.CONTACT,APIData:{First_Name:first,Last_Name:last,Email:email,...(values.Mobile?{Mobile:values.Mobile}:{})}});const entry=asRows(result)[0];const id=String(entry?.details?.id||result?.data?.[0]?.details?.id||'');if(entry?.status==='error'||!id)throw Error(entry?.message||'CRM did not return a Contact ID.');const contact=await getRecord(M.CONTACT,id);j.contact=contact;state.contact=contact;j.newContact={};setNotice('CRM Contact created. Continue the application preview.','success');
    }catch(e){j.formError='Unable to create CRM Contact: '+(e.message||e)}finally{j.contactCreating=false;render();}
  }

  function createView(){return renderJourney();}
  function render(){const [title,subtitle]=VIEW_TITLES[state.view];$('#pageTitle').textContent=title;$('#pageSubtitle').textContent=subtitle;document.querySelectorAll('[data-view]').forEach(b=>{b.classList.toggle('active',b.dataset.view===state.view);b.setAttribute('aria-current',b.dataset.view===state.view?'page':'false')});let html='';if(state.busy){html=loading()}else if(state.view==='processing'){html=processingHome()}else if(state.view==='overview'){html=state.focus?.entity===M.ACCOUNT?accountCard():state.focus?.entity===M.CONTACT&&state.contact?`<button class="button secondary" data-action="back-to-list" data-kind="customers">${icon('arrow-left')} All customers</button>${contextCard()}`:browserList('customers')}else if(state.view==='queue'){html=queueView()}else if(state.view==='create'){html=createView()}else{html=sectionView(state.view)}$('#contentArea').innerHTML=html;$('#searchResults').hidden=!state.searchResults.length;if(state.searchResults.length){$('#searchResults').innerHTML=panel('Search results',`${state.searchResults.length} matches`,pageItems('search',state.searchResults,SIZES.search).rows.map(x=>recordRow(x.entity,x.record)).join('')+pageItems('search',state.searchResults,SIZES.search).controls)}}
  function api(){if(!state.connected||!window.ZOHO||!ZOHO.CRM||!ZOHO.CRM.API)throw Error('CRM connection is not ready. Open the widget inside Zoho CRM.');return ZOHO.CRM.API;}
  async function getRecord(entity,id){if(state.demo)return demoGet(entity,id);let out=await api().getRecord({Entity:entity,RecordID:String(id)});const row=asRows(out)[0];if(!row)throw Error(`${entity} record was not returned by CRM`);return row;}
  function queryCriterion(field,id){if(!/^[A-Za-z_][A-Za-z0-9_]*$/.test(field)||!/^[0-9]{8,30}$/.test(String(id)))throw Error('Invalid CRM record context');return`(${field}:equals:${id})`;}
  async function searchRecords(entity,field,id,limit=100){if(state.demo)return demoFind(entity,field,id);const q=queryCriterion(field,id);const out=await pagesFromCRM('searchRecord',{Entity:entity,Type:'criteria',Query:q},limit);if(out.limited)state.limited[entity]=true;return out.rows.filter(x=>idsEqual(refId(x[field]),id));}
  async function pagesFromCRM(method,params,perPage=100){let rows=[],limited=false;for(let page=1;page<=state.crmPageLimit;page++){let res;try{res=await api()[method]({...params,page,per_page:perPage})}catch(e){if(page===1&&/NO_CONTENT|204|no content/i.test(String(e.message||e)))break;throw e}if(res?.code==='NO_CONTENT'||res?.status===204)break;if(res?.code&&!['SUCCESS','NO_CONTENT'].includes(res.code)&&!Array.isArray(res.data))throw Error(res.message||res.code);const part=asRows(res);rows.push(...part);const more=res?.info?.more_records===true||(res?.info?.more_records==null&&part.length>=perPage);if(!more)break;if(page===state.crmPageLimit)limited=true;}return{rows,limited};}
  async function getPage(entity,perPage=100){if(state.demo)return demoQueue(entity);const out=await pagesFromCRM('getAllRecords',{Entity:entity},perPage);if(out.limited)state.limited[entity]=true;return out.rows;}
  async function manySearch(descriptors,id){let results=await Promise.allSettled(descriptors.map(async([entity,field])=>[entity,await searchRecords(entity,field,id)]));let map={};results.forEach((result,i)=>{const entity=descriptors[i][0];if(result.status==='fulfilled')map[entity]=result.value[1];else{map[entity]=[];state.errors[entity]=`CRM could not load ${entity}: ${result.reason&&result.reason.message||'Unknown error'}`;}});return map;}
  function matchContext(c){if(!c||typeof c!=='object')return null;const entity=c.Entity||c.entity||c.module||c.Module||c.moduleName;let id=c.EntityId||c.EntityID||c.entityId||c.RecordID||c.recordId||c.id;if(Array.isArray(id))id=id[0];if(id&&typeof id==='object')id=id.id||id.recordId;if(ALL_ENTITIES.has(entity)&&/^\d{8,30}$/.test(String(id||'')))return{entity,id:String(id)};return null;}
  function contactLookup(entity,r){if(entity===M.CONTACT)return r.id;const names={Membership:'Contact',Deals:'Contact_Name',Insurance_Policy:'Contact',Training_Centre_Accred:'Applicant_Contact',Training_Centres:'Contact',Qualifications:'Contact',Declarations:'Contact'};return refId(r[names[entity]])||'';}
  function parentLookup(entity,r){const parents={Insurance_Extension:['Insurance_Policy','Policy'],Insured_People:['Insurance_Policy','Policy'],Insured_Premises:['Insurance_Policy','Policy'],Declarations:['Insurance_Policy','Insurance_Policy'],Risk_Screenings:['Insurance_Policy','Policy'],Policy_Revisions:['Insurance_Policy','Policy'],Membership_Extension:['Deals','Membership_Extension'],Accreditation_Centre_Link:['Training_Centre_Accred','Accreditation'],Accreditation_Extensions:['Training_Centre_Accred','Accreditation'],TC_Course_Offering:['Training_Centre_Accred','Accreditation'],Tutor_Relationships:['Training_Centre_Accred','Accreditation']};const c=parents[entity];return c&&refId(r[c[1]])?{entity:c[0],id:refId(r[c[1]])}:null;}
  async function select(entity,id){if(!ALL_ENTITIES.has(entity))return;const token=++state.requestId;state.busy=true;state.searchResults=[];state.errors={};render();setNotice('');try{
    const record=await getRecord(entity,id);if(token!==state.requestId)return;let anchorEntity=entity,anchorRecord=record;const parent=parentLookup(entity,record);if(parent){try{anchorRecord=await getRecord(parent.entity,parent.id);anchorEntity=parent.entity;}catch(_){/* Child record remains visible if the parent is inaccessible. */}}if(token!==state.requestId)return;state.focus={entity:entity,record:record};state.focusEntityView=VIEWS_FOR[entity]||'overview';state.focusRelation={};const contactId=contactLookup(anchorEntity,anchorRecord);
    if(contactId){const c=entity===M.CONTACT?record:await getRecord(M.CONTACT,contactId);if(token!==state.requestId)return;state.contact=c;state.lists={...await manySearch(CONTACT_RELATIONS,c.id),Contacts:[c]};const accountId=refId(c.Account_Name);if(accountId){try{state.lists[M.ACCOUNT]=[await getRecord(M.ACCOUNT,accountId)]}catch(_){/* Account inaccessible or missing. */}}if(token!==state.requestId)return;}
    else{state.contact=null;state.lists={[entity]:[record]};if(entity===M.ACCOUNT){const rel=await manySearch([[M.CONTACT,'Account_Name'],[M.CENTRE,'Account'],[M.ACC,'Account'],[M.POLICY,'Account']],record.id);Object.assign(state.lists,rel)}}
    if(!state.lists[entity])state.lists[entity]=[record];else if(!state.lists[entity].some(x=>idsEqual(x.id,id)))state.lists[entity].unshift(record);
    if(anchorEntity!==entity)state.lists[anchorEntity]=[anchorRecord];
    const relationDefs=RELATIONS[anchorEntity]||[];
    if(relationDefs.length){state.focusRelation[anchorEntity]=await manySearch(relationDefs,anchorRecord.id);Object.keys(state.focusRelation[anchorEntity]).forEach(e=>{state.lists[e]=state.focusRelation[anchorEntity][e]})}
    // Where a Contact was opened, lazily show the first policy and accreditation children only after selecting them.
    if(token!==state.requestId)return;state.view=VIEWS_FOR[entity]||'overview';if(!window.BGCRM12)fetchNativeRelated(entity,id,token).catch(()=>{});
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
  const BROWSE_MODULE={membership:M.DEAL,insurance:M.POLICY,accreditation:M.ACC,customers:M.CONTACT};
  function browseData(kind){if(!state.browse[kind])state.browse[kind]={rows:[],next:1,hasMore:true,loaded:false,loading:false,error:'',notice:''};return state.browse[kind];}
  async function enrichCustomerRows(kind,rows){
    const mod=BROWSE_MODULE[kind];
    const todo=[...new Set(rows.map(r=>refId(r[{insurance:'Contact',membership:'Contact_Name',accreditation:'Applicant_Contact'}[kind]])).filter(Boolean))].filter(id=>!state.customerNames[id]).slice(0,15);
    // CRM lookups normally include a name. Fetch only missing names for the visible page.
    const missing=todo.filter(id=>rows.some(r=>refId(r[{insurance:'Contact',membership:'Contact_Name',accreditation:'Applicant_Contact'}[kind]])===id&&!customerName(mod,r)));
    let offset=0;
    const workers=Array.from({length:Math.min(4,missing.length)},async()=>{while(offset<missing.length){const id=missing[offset++];try{const contact=await getRecord(M.CONTACT,id);state.customerNames[id]=rowTitle(M.CONTACT,contact);}catch(_){} }});
    await Promise.all(workers);
    if(state.view===kind||state.view==='queue')render();
  }
  async function loadBrowse(kind,{reset=false}={}){
    if(!BROWSE_MODULE[kind])return;
    const data=browseData(kind);
    if(reset){data.rows=[];data.next=1;data.hasMore=true;data.loaded=false;data.error='';data.serverActive=false;data.serverRows=[];state.pages['browse:'+kind]=1;}
    if(data.loading||(!data.hasMore&&data.loaded))return;
    data.loading=true;data.error='';state.browseKind=kind;if(window.BGCRM12)window.BGCRM12.prime(BROWSE_MODULE[kind],ZOHO.CRM,render);
    if(!data.loaded)state.busy=true;
    render();
    try{
      const result=await api().getAllRecords({Entity:BROWSE_MODULE[kind],page:data.next,per_page:100});
      if(result?.code&&!['SUCCESS','NO_CONTENT'].includes(result.code)&&!Array.isArray(result.data))throw Error(result.message||result.code);
      const rows=asRows(result);
      const seen=new Set(data.rows.map(x=>String(x.id)));
      data.rows.push(...rows.filter(x=>x.id&&!seen.has(String(x.id))));
      data.next++;
      data.hasMore=result?.info?.more_records===true||(result?.info?.more_records==null&&rows.length>=100);
      data.loaded=true;
      if(!rows.length)data.hasMore=false;
      if(kind!=='customers')enrichCustomerRows(kind,rows.slice(0,15)).catch(()=>{});
    }catch(err){data.error=String(err.message||err);data.loaded=true;}
    finally{data.loading=false;state.busy=false;render();}
  }
  async function searchBrowse(kind,{more=false}={}){
    const data=browseData(kind),term=(state.browseSearch||'').trim();
    if(!term||term.length<2){data.error='Enter at least two characters to search all CRM records.';render();return;}
    if(data.serverBusy)return;
    if(!more){data.serverRows=[];data.serverPage=1;data.serverHasMore=true;data.serverTerm=term;state.pages['browse:'+kind]=1;}
    if(more&&(!data.serverActive||!data.serverHasMore))return;
    data.serverActive=true;data.serverBusy=true;data.error='';render();
    try{
      const result=await api().searchRecord({Entity:BROWSE_MODULE[kind],Type:'word',Query:data.serverTerm,page:data.serverPage,per_page:100});
      if(result?.code&& !['SUCCESS','NO_CONTENT'].includes(result.code)&&!Array.isArray(result.data))throw Error(result.message||result.code);
      const rows=asRows(result),ids=new Set(data.serverRows.map(r=>String(r.id)));
      data.serverRows.push(...rows.filter(r=>r.id&&!ids.has(String(r.id))));
      data.serverHasMore=result?.info?.more_records===true||(result?.info?.more_records==null&&rows.length===100);
      data.serverPage++;
      if(kind!=='customers')enrichCustomerRows(kind,rows.slice(0,15)).catch(()=>{});
    }catch(err){data.error='CRM search could not complete: '+String(err.message||err);data.serverHasMore=false;}
    finally{data.serverBusy=false;render();}
  }
  function browserList(kind,onlyAttention=false){
    const data=browseData(kind),entity=BROWSE_MODULE[kind];
    const key='browse:'+kind;
    const available=data.serverActive?(data.serverRows||[]):data.rows;const filtered=onlyAttention?available.filter(r=>isQueueItem(kind,entity,r)):available;
    const term=(state.browseSearch||'').trim().toLowerCase();
    const rows=!data.serverActive&&term?filtered.filter(r=>([rowTitle(entity,r),customerName(entity,r),r.Name,r.Deal_Name,r.Insured_Trading_Name,r.Application_Stage,r.Application_Status,r.Underwriting_Status,r.Payment_Status,r.Policy_Status,r.Email].join(' ').toLowerCase().includes(term))):filtered;
    const p=pageItems(key,rows,SIZES.queue);
    return `<div class="browse-shell"><div class="browse-header"><div><span class="process-kicker">LIVE CRM RECORDS</span><h2>${esc(META[entity]?.title||entity)}</h2><p>Browse the records your CRM account can access. Search is optional.</p></div><div class="browse-counter">${available.length} ${data.serverActive?'CRM search matches for '+esc(data.serverTerm||''):'loaded'}${(data.serverActive?data.serverHasMore:data.hasMore)?' · more may exist':''}</div></div>
    <div class="browse-controls"><label class="browse-search-label">Filter loaded records or enter CRM search<input class="browse-search" type="search" data-browse-search="true" placeholder="Customer, reference or status" value="${esc(state.browseSearch||'')}" /></label><button class="button secondary" data-action="browse-search-crm" data-kind="${kind}" ${data.serverBusy?"disabled":""}>Search all CRM</button>${data.serverActive?`<button class="button secondary" data-action="browse-clear-crm" data-kind="${kind}">Clear CRM search</button>`:""}${kind==='customers'?'':`<div class="filter-switch"><button class="${onlyAttention?'':'selected'}" data-action="browse-filter" data-filter="all">All records</button><button class="${onlyAttention?'selected':''}" data-action="browse-filter" data-filter="attention">Requires attention</button></div>`}<button class="button secondary" data-action="browse-refresh" data-kind="${kind}">${icon('refresh-cw')} Refresh list</button></div>
    ${data.error?`<div class="notice error">CRM could not load ${esc(META[entity]?.title||entity)}: ${esc(data.error)} <button data-action="browse-refresh" data-kind="${kind}">Retry</button></div>`:''}
    ${data.loading&&!data.rows.length?loading():rows.length?(window.BGCRM12?window.BGCRM12.tableRows(entity,p.rows):p.rows.map(r=>recordRow(entity,r)).join(''))+p.controls:empty(onlyAttention?'No matching attention records':'No records on this page',data.hasMore?'More records may be available on the next CRM page.':'No records match the current filter.')}
    ${(data.serverActive?data.serverHasMore:data.hasMore)?`<div class="browse-more"><button class="button secondary" data-action="${data.serverActive?'browse-search-more':'load-browse-more'}" data-kind="${kind}" ${data.loading||data.serverBusy?'disabled':''}>${data.loading||data.serverBusy?'Loading…':data.serverActive?'Load more CRM search results':'Load next CRM records'}</button><small>${data.serverActive?'Search is run against the CRM module, subject to API search support and permissions.':'Local filters apply to loaded records. Choose Search all CRM to search beyond loaded pages.'}</small></div>`:''}</div>`;
  }
  async function loadQueue(kind){state.queueKind=kind;state.browseKind=kind;state.browseFilter='attention';state.browseSearch='';state.view='queue';const data=browseData(kind);if(!data.loaded)await loadBrowse(kind);else render();}
  function openAction(type,entity,id){if(!ALL_ENTITIES.has(entity)||!/^\d{8,30}$/.test(String(id||''))){setNotice('Select a valid CRM record first.');return}state.actionType=type;state.actionTarget={entity,id};$('#modalTitle').textContent=type==='note'?'Add note':'Create follow-up task';$('#modalContext').textContent=`For ${META[entity]?.title||'selected record'}`;$('#actionSubject').value='';$('#actionDescription').value='';$('#actionSubjectLabel').textContent=type==='note'?'Note title':'Task subject';$('#actionDescriptionLabel').textContent=type==='note'?'Note content':'Task description';$('#dueRow').hidden=type!=='task';$('#actionDue').required=type==='task';$('#actionDue').value='';$('#saveAction').textContent=type==='note'?'Save note':'Create task';$('#actionModal').showModal();$('#actionSubject').focus()}
  function assertSaved(r){if(r&&r.status==='error')throw Error(r.message||'CRM save rejected');const rows=asRows(r);if(rows.length&&(rows[0].status==='error'||rows[0].code==='INVALID_DATA'))throw Error(rows[0].message||rows[0].code||'CRM save rejected');if(r&&r.code&&r.code!=='SUCCESS'&&r.status!=='success'&&!rows.length)throw Error(r.message||r.code);return r}
  async function saveAction(){const {entity,id}=state.actionTarget||{};if(!entity)return;const type=state.actionType;const title=$('#actionSubject').value.trim(),description=$('#actionDescription').value.trim(),due=$('#actionDue').value;if(!title){setNotice('A title or subject is required.');return}if(type==='task'&&!due){setNotice('Select a due date.');return}$('#saveAction').disabled=true;setNotice('');try{if(state.demo){await new Promise(resolve=>setTimeout(resolve,20));$('#actionModal').close();setNotice('Demo mode: no CRM record was created.','info');return}let result;if(type==='note')result=await api().addNotes({Entity:entity,RecordID:id,Title:title,Content:description||title});else{let payload={Subject:title,Status:'Not Started',Priority:'Normal',Due_Date:due,Description:description};if(entity===M.CONTACT)payload.Who_Id={id:String(id)};else{payload.What_Id={id:String(id)};payload.$se_module=entity;if(state.contact&&state.contact.id)payload.Who_Id={id:String(state.contact.id)};}result=await api().insertRecord({Entity:M.TASK,APIData:payload})}assertSaved(result);$('#actionModal').close();setNotice(type==='note'?'Note saved.':'Task created.','success');}catch(err){setNotice(`Could not create ${type}: ${err.message||err}`,'error')}finally{$('#saveAction').disabled=false}}
  async function changeView(next){
    state.history=[];state.view=next;state.searchResults=[];setNotice('');
    if(next==='create'){initJourney();render();return;}
    if(next==='overview'){state.focus=null;state.focusEntityView=null;state.contact=null;state.browseKind='customers';state.browseSearch='';const data=browseData('customers');if(!data.loaded)return loadBrowse('customers');render();return;}
    if(next==='queue'){const d=browseData(state.queueKind);if(!d.loaded)return loadQueue(state.queueKind);render();return;}
    if(BROWSE_MODULE[next]){state.focus=null;state.focusEntityView=null;state.browseKind=next;state.browseSearch='';state.browseFilter='all';const d=browseData(next);if(!d.loaded)return loadBrowse(next);render();return;}
    render();
  }
  async function init(){installStaticIcons();document.querySelectorAll('[data-view]').forEach(b=>b.addEventListener('click',()=>changeView(b.dataset.view)));$('#searchBtn').addEventListener('click',handleSearch);$('#globalSearch').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();handleSearch()}});$('#refreshBtn').addEventListener('click',()=>{if(state.view==='create'){render();}else if(state.focus)select(state.focus.entity,state.focus.record.id);else if(state.contact)select(M.CONTACT,state.contact.id);else if(state.view==='queue')loadBrowse(state.queueKind,{reset:true});else if(state.view==='overview')loadBrowse('customers',{reset:true});else if(BROWSE_MODULE[state.view])loadBrowse(state.view,{reset:true});else setNotice('Select a CRM record or choose a list to refresh.');});$('#contentArea').addEventListener('click',clickAction);$('#contentArea').addEventListener('input',event=>{if(window.BGJourney12&&window.BGJourney12.input(state.journey,event.target)){if(['checkbox','radio'].includes(event.target.type))render();}},true);$('#contentArea').addEventListener('change',event=>{if(window.BGJourney12&&window.BGJourney12.input(state.journey,event.target)&&['select-one'].includes(event.target.type))render();},true);$('#searchResults').addEventListener('click',clickAction);$('#cancelModal').addEventListener('click',()=>$('#actionModal').close());$('#cancelModal2').addEventListener('click',()=>$('#actionModal').close());$('#actionForm').addEventListener('submit',e=>{e.preventDefault();saveAction()});$('#contentArea').addEventListener('change',changeReviewField);document.addEventListener('change',event=>{const t=event.target;if(t&&t.dataset&&t.dataset.wfEdit)askWorkflowEdit(t.dataset.entity,t.dataset.id,t.dataset.field,t.value);});document.addEventListener('click',event=>{const b=event.target&&event.target.closest&&event.target.closest('[data-wf-save],[data-wf-cancel]');if(!b)return;event.preventDefault();if(b.dataset.wfSave)saveWorkflowEdit();else{wfHide();render();}});$('#contentArea').addEventListener('input',changeReviewField);$('#contentArea').addEventListener('input',event=>{if(event.target.dataset?.journeyCustomerSearch!==undefined){state.journey.customerSearch=event.target.value;}else if(event.target.dataset?.journeyNewContact){state.journey.newContact=state.journey.newContact||{};state.journey.newContact[event.target.dataset.journeyNewContact]=event.target.value;}else if(event.target.dataset?.browseSearch!==undefined){state.browseSearch=event.target.value;state.pages['browse:'+state.browseKind]=1;const cursor=event.target.selectionStart;render();const el=document.querySelector('.browse-search');if(el){el.focus();if(typeof el.setSelectionRange==='function')el.setSelectionRange(cursor,cursor)}}else if(event.target.dataset?.journeyField){setJourneyField(event.target)}});$('#contentArea').addEventListener('change',event=>{if(event.target.dataset?.journeyField)setJourneyField(event.target)});render();
    
    if(!window.ZOHO||!ZOHO.embeddedApp){setNotice('Zoho CRM SDK could not load. Open the widget in Zoho CRM and check network permissions.','error');$('#connectionLabel').textContent='Not connected';return}
    try{let pendingContext=null;ZOHO.embeddedApp.on('PageLoad',context=>{const c=matchContext(context);if(c){pendingContext=c;if(state.connected)select(c.entity,c.id)}});await ZOHO.embeddedApp.init();state.connected=true;$('#connectionDot').classList.add('connected');$('#connectionLabel').textContent='Connected';try{const me=await ZOHO.CRM.CONFIG.getCurrentUser();const record=asRows(me)[0]||me.users&&me.users[0]||me;state.currentUser=record;$('#identityLabel').textContent=record.full_name||record.name||record.email||''}catch(_){/* User display is optional. */}const params=new URLSearchParams(location.search);const candidate=matchContext({Entity:params.get('module'),EntityId:params.get('id')});if(pendingContext)select(pendingContext.entity,pendingContext.id);else if(candidate&&!state.focus)select(candidate.entity,candidate.id)}catch(err){$('#connectionLabel').textContent='Connection failed';setNotice(`CRM SDK initialisation failed: ${err.message||err}`,'error')}}
  function changeReviewField(event){const el=event.target;if(!el||!el.dataset)return;const {entity,id,reviewCheck,reviewOutcome,reviewComment}=el.dataset;if(!reviewKind(entity)||!/^[0-9]{8,30}$/.test(id||''))return;const draft=reviewDraft(entity,id);if(reviewCheck){draft.checked[reviewCheck]=Boolean(el.checked);const count=Object.values(draft.checked).filter(Boolean).length;const counter=document.querySelector('.check-count');if(counter)counter.textContent=`${count} of ${REVIEW_GROUPS[reviewKind(entity)].checks.length}`;}if(reviewOutcome!==undefined)draft.outcome=el.value;if(reviewComment!==undefined)draft.comment=el.value;}
  async function clickAction(event){
    const el=event.target.closest('[data-action],[data-queue],[data-v12-add],[data-v12-remove],[data-v12-copy]');if(!el)return;if(window.BGJourney12&&(el.dataset.v12Add||el.dataset.v12Remove||el.dataset.v12Copy)){if(window.BGJourney12.click(state.journey,el))render();return;}if(window.BGCRM12&&await window.BGCRM12.action(el,state.focus,window.ZOHO?.CRM,render))return;
    if(el.dataset.queue){state.browseFilter='attention';state.browseSearch='';return loadQueue(el.dataset.queue);}
    const action=el.dataset.action,entity=el.dataset.entity,id=el.dataset.id;
    if(action==='browse'){state.view=el.dataset.kind;state.focus=null;state.focusEntityView=null;state.browseKind=el.dataset.kind;state.browseFilter='all';state.browseSearch='';const d=browseData(state.browseKind);if(!d.loaded)await loadBrowse(state.browseKind);else render();}
    else if(action==='launchqueue'){state.view='queue';await loadQueue(el.dataset.kind||'insurance');}
    else if(action==='browse-refresh')await loadBrowse(el.dataset.kind,{reset:true});
    else if(action==='load-browse-more')await loadBrowse(el.dataset.kind);
     else if(action==='browse-search-crm')await searchBrowse(el.dataset.kind);
     else if(action==='browse-search-more')await searchBrowse(el.dataset.kind,{more:true});
     else if(action==='browse-clear-crm'){const d=browseData(el.dataset.kind);d.serverActive=false;d.serverRows=[];d.serverHasMore=false;state.browseSearch='';state.pages['browse:'+el.dataset.kind]=1;render();}
    else if(action==='browse-filter'){state.browseFilter=el.dataset.filter==='attention'?'attention':'all';state.pages['browse:'+state.browseKind]=1;render();}
    else if(action==='back-to-list'){state.focus=null;state.focusEntityView=null;state.view=el.dataset.kind==='customers'?'overview':el.dataset.kind||'insurance';state.contact=state.view==='overview'?null:state.contact;render();}
    else if(action==='coming-soon'||action==='journey-start'){state.view='create';initJourney(el.dataset.kind);render();}
    else if(action==='journey-type'){state.journey.kind=el.dataset.kind;state.journey.step=-1;state.journey.answers={};render();if(el.dataset.kind==='accreditation'&&window.BGJourney12)window.BGJourney12.loadCourses(ZOHO.CRM,render).catch(e=>setNotice('Course catalogue could not load: '+String(e.message||e),'error'));}
    else if(action==='journey-next'){const j=state.journey;if(j?.step===-1&&j.contact&&window.BGJourney12){try{j.contact=await getRecord(M.CONTACT,j.contact.id);state.contact=j.contact;}catch(e){j.formError='Unable to load complete CRM Contact details: '+String(e.message||e);render();return;}window.BGJourney12.prefill(j);}advanceJourney(1);}
    else if(action==='journey-membership-options'){
      const j=state.journey;
      if(!j?.contact?.id||j.kind!=='membership')return;
      const recordId=String(document.getElementById('staff-membership-record-id')?.value||'').trim();
      if(!/^\d{10,25}$/.test(recordId)){j.optionsError='Enter an existing CRM Membership Deal ID.';render();return;}
      j.optionsError='';j.membershipOptionsLoading=true;render();
      try{
        const response=await window.BGStaffApi.call('membership_options',{contactId:String(j.contact.id),recordId});
        if(!response?.options)throw Error('The membership options API returned no options.');
        j.membershipOptions=response.options;
      }catch(e){j.optionsError=String(e.message||e);}
      finally{j.membershipOptionsLoading=false;render();}
    }
    else if(action==='journey-drafts'){
      const j=state.journey;if(!j?.contact?.id)return;
      j.draftsBusy=true;j.draftsError='';render();
      try{const out=await window.BGStaffApi.call('drafts_list',{contactId:String(j.contact.id)});j.availableDrafts=out?.drafts||out?.items||[];}
      catch(e){j.draftsError=String(e.message||e);}
      finally{j.draftsBusy=false;render();}
    }
    else if(action==='journey-load-draft'){
      const j=state.journey;if(!j?.contact?.id)return;
      const id=el.dataset.id,service=el.dataset.service;
      if(!/^[a-z_]+$/.test(service||'')||!/^\d{10,25}$/.test(id||''))return;
      j.draftsBusy=true;j.draftsError='';render();
      try{
        const out=await window.BGStaffApi.call('drafts_get',{contactId:String(j.contact.id),service,id});
        const d=out?.draft;if(!d?.answers)throw Error('The draft response cannot be restored.');
        j.kind=d.service==='combined'?'membership':d.service;j.answers={...d.answers};
        j.step=Math.max(0,Number(d.step)||0);j.remote={id:String(d.id),service:d.service,journeyId:d.journeyId,revision:d.revision};
      }catch(e){j.draftsError=String(e.message||e);}
      finally{j.draftsBusy=false;render();}
    }
    else if(action==='journey-discard'){
      const j=state.journey,id=el.dataset.id,service=el.dataset.service;
      if(!j?.contact?.id||!/^\d{10,25}$/.test(String(id||''))||!['membership','insurance','combined','accreditation'].includes(service))return;
      if(!window.confirm('Discard this customer draft in CRM? This cannot be undone.'))return;
      j.draftsBusy=true;j.draftsError='';render();
      try{
        await window.BGStaffApi.call('drafts_discard',{contactId:String(j.contact.id),service,id});
        j.availableDrafts=(j.availableDrafts||[]).filter(d=>String(d.id)!==String(id));
        if(j.remote?.id===id)j.remote=null;
        j.draftsMessage='Draft discarded in CRM.';
      }catch(e){j.draftsError=String(e.message||e);}
      finally{j.draftsBusy=false;render();}
    }
    else if(action==='journey-accreditation-submit'){
      const j=state.journey;
      if(j?.kind!=='accreditation'||!j.remote?.id||j.draftsBusy)return;
      if(!window.confirm('Submit this saved Accreditation draft to CRM for processing?'))return;
      j.draftsBusy=true;j.draftsError='';render();
      try{
        const request={contactId:String(j.contact.id),service:'accreditation',id:j.remote.id,journeyId:j.remote.journeyId,revision:j.remote.revision,step:j.step,answers:j.answers};
        const response=await window.BGStaffApi.call('accreditation_submit',request);
        if(!response?.accreditation?.id)throw Error('Accreditation submission was not confirmed.');
        j.accreditationSubmitted=true;j.accreditationRecordId=String(response.accreditation.id);
        j.draftsMessage='Accreditation submitted. CRM confirmation: '+JSON.stringify(response);
      }catch(e){j.draftsError=String(e.message||e);}
      finally{j.draftsBusy=false;render();}
    }
    else if(action==='journey-save'){
      const j=state.journey;if(!j?.contact?.id||!j.kind||j.draftsBusy)return;
      j.draftsBusy=true;j.draftsError='';j.draftsMessage='';render();
      try{
        const service=j.kind==='membership'&&j.answers.insurance==='yes'?'combined':j.kind;
        const request={contactId:String(j.contact.id),service,answers:j.answers,step:Math.max(0,j.step),journeyId:j.remote?.journeyId||window.crypto?.randomUUID?.()};
        if(!request.journeyId)throw Error('Secure journey ID generation is unavailable.');
        if(j.remote){request.id=j.remote.id;request.revision=j.remote.revision;}
        const out=await window.BGStaffApi.call(j.remote?'drafts_update':'drafts_save',request);
        const d=out?.draft;if(!d?.id||!d?.revision)throw Error('Draft save was not confirmed by the server.');
        j.remote={id:String(d.id),service:d.service||service,journeyId:d.journeyId||request.journeyId,revision:d.revision};
        j.draftsMessage='CRM draft saved. The customer can resume this application in Portal V2.';
      }catch(e){j.draftsError=String(e.message||e);}
      finally{j.draftsBusy=false;render();}
    }
    else if(action==='journey-payment'){
      const j=state.journey;if(!j?.contact?.id||!j.liveQuote||j.paymentBusy)return;
      j.customerAccepted=Boolean(document.getElementById('staff-customer-accepted')?.checked);if(!j.customerAccepted){j.paymentError='Confirm the customer has explicitly accepted the Code of Ethics and terms.';render();return;}
      if(window.BGStaffAddons?.quoteInputs){const discounts=window.BGStaffAddons.quoteInputs();if(discounts.voucherCode||discounts.waivers?.length){j.paymentError='Discounted payment links are not supported. Remove all vouchers and waivers, then obtain a fresh quote.';render();return;}}
      if(!window.confirm('Create a test-mode Stripe Checkout link for this customer and the current application?'))return;
      j.paymentBusy=true;j.paymentError='';render();
      try{
        const body={...window.BGJourney12.apiRequest(j),accepted:'yes'};
        if(j.lastQuoteInputs&&JSON.stringify(window.BGJourney12.apiRequest(j))!==j.lastQuoteInputs)throw Error('Answers changed after quotation. Calculate a fresh quote before generating a link.');
        const response=await window.BGStaffApi.call('payment_link',body);
        if(response?.alreadyPaid){j.paymentAlreadyPaid=true;j.paymentLink='';}
        else if(/^https:\/\/checkout\.stripe\.com\//.test(response?.checkoutUrl||''))j.paymentLink=response.checkoutUrl;
        else throw Error('The server did not return a valid Stripe Checkout URL.');
      }catch(e){j.paymentError=String(e.message||e);}
      finally{j.paymentBusy=false;render();}
    }
    else if(action==='journey-copy-payment'){const url=state.journey?.paymentLink;if(url)navigator.clipboard?.writeText(url).catch(()=>setNotice('Copy failed. Open the payment link and copy it from your browser.','error'));}
    else if(action==='journey-open-payment'){const url=state.journey?.paymentLink;if(url&&/^https:\/\/checkout\.stripe\.com\//.test(url))window.open(url,'_blank','noopener,noreferrer');}
    else if(action==='journey-quote'){
      const j=state.journey;
      if(!j?.contact?.id||!j.kind||j.quotePending)return;
      j.quotePending=true;j.quoteError='';j.liveQuote=null;render();
      try{
        if(!window.BGStaffApi?.call)throw Error('Signed staff API integration unavailable.');
        const kind=j.kind;
        if(j.kind==='accreditation'&&!j.accreditationSubmitted)throw Error('Save and submit Accreditation before requesting its payable quote.');
        const base=window.BGJourney12.apiRequest(j);
        const payload={...base};
        if(window.BGStaffAddons?.quoteInputs&&kind==='membership')Object.assign(payload,window.BGStaffAddons.quoteInputs());
        const result=await window.BGStaffApi.call('quote',payload);
        if(result?.error||result?.ok===false||!result?.quote)throw Error(result?.message||result?.error||'No authoritative quote returned by the Staff API.');
        j.liveQuote=result;j.lastQuoteInputs=JSON.stringify(base);
      }catch(error){j.quoteError=String(error?.message||error);}
      finally{j.quotePending=false;render();}
    }
    else if(action==='journey-back'){advanceJourney(-1);}
    else if(action==='journey-reset'){state.journey=null;initJourney();render();}
    else if(action==='journey-search-customer'){await searchJourneyContacts();}
    else if(action==='journey-select-contact'){const c=state.journey.contactResults.find(x=>String(x.id)===String(id));if(c){state.journey.contact=c;state.contact=c;state.journey.formError='';render();}}
    else if(action==='journey-clear-contact'){state.journey.contact=null;state.journey.formError='';render();}
    else if(action==='journey-create-contact'){await createJourneyContact();}
    else if(action==='journey-contact'){if(state.contact){state.journey.contact={...state.contact};render();}else{state.view='overview';state.focus=null;if(!state.directoryLoaded)await loadDirectory();else render();}}
    else if(action==='paginate'){const key=el.dataset.key,n=Number(el.dataset.page);if(/^(related:[A-Za-z_]+|native:[A-Za-z_]+|browse:(insurance|membership|accreditation|customers)|search|customers)$/.test(key||'')&&Number.isInteger(n)&&n>=1){state.pages[key]=n;render();if(key.startsWith('browse:')){const kind=key.slice(7),d=browseData(kind);enrichCustomerRows(kind,d.rows.slice((n-1)*SIZES.queue,n*SIZES.queue)).catch(()=>{});}}}
    else if(action==='refresh-record')await select(entity,id);
    else if(action==='savereview')await saveReview(entity,id);
    else if(action==='go-back'){const last=state.history.pop();if(last?.entity)await select(last.entity,last.id);else if(last){state.view=last.view;render();}}
    else if(action==='select'){state.history.push(state.focus?{entity:state.focus.entity,id:state.focus.record.id,view:state.view}:{view:state.view});await select(entity,id);}
    else if(action==='open')await openCRM(entity,id);
    else if(action==='email'||action==='crm-actions'){await openCRM(entity,id);setNotice(action==='email'?'Use the native CRM record Send Email action.':'Use the authorised CRM buttons and workflow controls on the opened record.','info');}
    else if(action==='note'||action==='task')openAction(action,entity,id);
  }
  const DEMO_RECORDS=Object.freeze({});
  function demoGet(){throw Error('Demo data is disabled');}
  function demoFind(){throw Error('Demo data is disabled');}
  function demoQueue(){throw Error('Demo data is disabled');}
  function demoSearch(){throw Error('Demo data is disabled');}
  if(typeof document!=='undefined')document.addEventListener('DOMContentLoaded',init);
  if(typeof module!=='undefined'&&module.exports)module.exports={pageItems,SIZES,esc,asRows,matchContext,isQueueItem,refId,queryCriterion,statusClass,contactLookup,reviewKind,reviewSignals,REVIEW_GROUPS,DEMO_RECORDS,M};
})();
