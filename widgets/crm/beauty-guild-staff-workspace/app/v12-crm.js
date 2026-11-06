/* Staff Workspace V1.2: metadata-driven record and related-list presentation.
 * CRM SDK remains the source of records and permissions; this file has no credentials. */
(function(global){
  'use strict';
  const TIMELINE_CONNECTION='zoho_crm', TIMELINE_API='https://www.zohoapis.eu/crm/v8/';
  const timelineCache=new Map(), timelineFilter=new Map();
  const metaCache=new Map(), relatedCache=new Map(), chosen=new Map(), fieldModes=new Map();
  const tableColumns={
    Contacts:['Full_Name','Email','Mobile','Phone','Owner','Modified_Time'],
    Accounts:['Account_Name','Phone','Town','Country','Owner'],
    Deals:['Deal_Name','Contact_Name','Membership_Type','Stage','Payment_Status','Expiry_Date'],
    Membership:['Name','Contact','Current_Member_Type','Current_Membership_Status'],
    Insurance_Policy:['Name','Contact','Policy_Type','Application_Status','Underwriting_Status','Payment_Status','Policy_Status','Policy_End_Date'],
    Training_Centre_Accred:['Name','Applicant_Contact','Account','Application_Stage','Accreditation_Status','Payment_Status','Valid_To'],
    Notes:['Note_Title','Note_Content','Owner','Modified_Time'],
    Emails:['Subject','From','To','Sent_Time','Direction','Status'],
    Tasks:['Subject','Status','Priority','Due_Date','Owner'],
    Activities:['Subject','Activity_Type','Status','Due_Date','Owner','Modified_Time'],
    Open_Activities:['Subject','Activity_Type','Status','Due_Date','Owner','Modified_Time'],
    Closed_Activities:['Subject','Activity_Type','Status','Due_Date','Owner','Modified_Time']
  };
  const appNames={
    Contacts:'Contact',Accounts:'Organisation',Deals:'Membership transaction',Membership:'Member profile',
    Insurance_Policy:'Insurance policy',Training_Centre_Accred:'Accreditation application'
  };
  const fallbackRelated={
    Contacts:['Notes','Attachments','Tasks'],Accounts:['Notes','Attachments','Tasks'],
    Deals:['Notes','Attachments','Tasks','Membership','Insurance_Policy','Membership_Extension1'],
    Insurance_Policy:['Notes','Attachments','Tasks','Insurance_Extensions','Insured_People','Insured_Premises','Declarations','Risk_Screenings','Policy_Revisions'],
    Training_Centre_Accred:['Notes','Attachments','Tasks','Accreditation_Centre_Link','Training_Centre_Course_Offering','Tutor_Relationship','Accreditation_Extensions']
  };
  function safe(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
  function pretty(s){return String(s||'').replace(/_/g,' ').replace(/([a-z])([A-Z])/g,'$1 $2');}
  function value(v){
    if(v===null||v===undefined||v==='')return 'Not recorded';
    if(typeof v==='boolean')return v?'Yes':'No';
    if(Array.isArray(v))return v.map(value).join(', ');
    if(typeof v==='object')return v.name||v.display_value||v.id||'Not recorded';
    return String(v);
  }
  function format(k,v){
    if(v===null||v===undefined||v==='')return 'Not recorded';
    if(typeof v==='number'&&/(Amount|Premium|Price|Fee|IPT|Gross|Net)$/i.test(k))return new Intl.NumberFormat('en-GB',{style:'currency',currency:'GBP'}).format(v);
    if(typeof v==='string'&&/^(?:\d{4}-\d{2}-\d{2})(?:T.*)?$/.test(v)&&/(Date|_At|_Time|Valid_From|Valid_To)/i.test(k)){const d=new Date(v);if(!Number.isNaN(d.valueOf()))return d.toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'});}
    return value(v);
  }
  function toList(v,key){const x=v&&v[key];return Array.isArray(x)?x:Array.isArray(v)?v:[];}
  function metaFields(entity){return metaCache.get(entity)?.fields||[];}
  function filteredField(field){return field&&field.api_name&&!field.api_name.startsWith('$')&&field.visible!==false&&field.view_type?.view!==false;}
  function fieldMap(entity){return new Map(metaFields(entity).filter(filteredField).map(x=>[x.api_name,x]));}
  function iconStatus(x){
    const t=String(x??'').trim().toLowerCase();
    if(!t)return 'neutral';
    if(/^(active|approved|clear|cleared|paid|verified|current|completed|issued|succeeded)$/.test(t))return 'good';
    if(/\b(failed|banned|stopped|stop|block|blocked|rejected|cancelled|expired|declined|error)\b|listed postcode|potential match/.test(t))return 'bad';
    if(/awaiting payment|payment processing|in progress|processing|submitted/.test(t))return 'info';
    if(/draft|paused|on hold/.test(t))return 'draft';
    if(/pending|refer|await|review|not paid|not checked|not assessed|unverified|incomplete|unpaid|outstanding|needs/.test(t))return 'waiting';
    return 'neutral';
  }
  // A red banner at the top of an insurance record when it must not go ahead, amber when a person must look. The reasons come from
  // widget.js (BGInsurance.blocks), the same list the attention filter and the Needs attention box use.
  function stopBanner(entity,record){
    if(entity!=='Insurance_Policy'||!global.BGInsurance)return '';
    const blocks=global.BGInsurance.blocks(record);
    if(!blocks.length)return '';
    const stop=blocks.some(b=>b.severity==='stop');
    return '<div class="v12-stop-banner v12-stop-banner--'+(stop?'stop':'review')+'" role="alert"><strong>'+(stop?'Do not proceed with this policy':'This policy needs a manual check')+'</strong><ul>'+blocks.map(b=>'<li><b>'+safe(b.label)+'.</b> '+safe(b.reason)+'</li>').join('')+'</ul></div>';
  }
  function statusMarkup(field,raw){
    if(!/(?:^Stage$|_Status$|^Status$|_Stage$|^Result$|^Priority$|^Investigation_Status$)/.test(field))
      return safe(format(field,raw));
    const text=raw===undefined||raw===null||raw===''?'Not recorded':format(field,raw);
    const tone=text==='Not recorded'?'missing':({good:'success',bad:'danger',info:'info',draft:'draft',waiting:'warning',neutral:'neutral'}[iconStatus(raw)]);
    return '<span class="bg-state bg-state-'+tone+'">'+safe(text)+'</span>';
  }
  async function prime(entity,api,rerender){
    if(!entity||!api?.META||metaCache.has(entity))return;
    const promise=Promise.allSettled([
      typeof api.META.getFields==='function'?api.META.getFields({Entity:entity}):Promise.reject(Error('Fields API unavailable')),
      typeof api.META.getLayouts==='function'?api.META.getLayouts({Entity:entity}):Promise.reject(Error('Layouts API unavailable')),
      typeof api.META.getRelatedList==='function'?api.META.getRelatedList({Entity:entity}):Promise.reject(Error('Related-list metadata unavailable'))
    ]).then(function(result){
      const [a,b,c]=result;
      const fields=a.status==='fulfilled'?toList(a.value,'fields'):[];
      const layouts=b.status==='fulfilled'?toList(b.value,'layouts'):[];
      const relatives=c.status==='fulfilled'?toList(c.value,'related_lists'):[];
      const problems=[a,b,c].filter(x=>x.status==='rejected').map(x=>String(x.reason?.message||x.reason));
      metaCache.set(entity,{fields,layouts,relatives,problems});
      if(typeof rerender==='function')rerender();
    }).catch(function(err){
      metaCache.set(entity,{fields:[],layouts:[],relatives:[],problems:[String(err)]});
      if(typeof rerender==='function')rerender();
    });
    metaCache.set(entity,{fields:[],layouts:[],relatives:[],loading:true,promise});
    return promise;
  }
  function fieldRows(entity,record,keys,showEmpty){
    const m=fieldMap(entity);
    const html=[];
    for(const key of keys){
      const f=m.get(key);
      if(metaFields(entity).length&&!f)continue;
      if(key==='id'||key.startsWith('$'))continue;
      const raw=record[key];if(!showEmpty&&(raw===undefined||raw===null||raw===''))continue;
      const name=f?.field_label||pretty(key);
      let val=statusMarkup(key,raw);
      if(raw&&typeof raw==='object'&&!Array.isArray(raw)&&raw.id&&raw.name){
        const mod=f?.lookup?.module?.api_name||f?.lookup?.module||f?.lookup?.module_name;
        if(typeof mod==='string'&&/^[A-Za-z_]+$/.test(mod)){val='<button class="v12-link" data-action="select" data-entity="'+safe(mod)+'" data-id="'+safe(raw.id)+'">'+safe(raw.name)+'</button>';}
      }else if(typeof raw==='string'&&/^https:\/\//.test(raw)){val='<a href="'+safe(raw)+'" target="_blank" rel="noopener noreferrer">Open link</a>';}
      const editor=global.BGAccredEdit&&global.BGAccredEdit.render(entity,record,key);if(editor)val=editor;
      html.push('<div class="v12-kv"><dt>'+safe(name)+'</dt><dd>'+val+'</dd></div>');
    }
    return html.length?'<dl class="v12-field-grid">'+html.join('')+'</dl>':'<p class="v12-muted">No information recorded in this section.</p>';
  }
  function layoutSections(entity,record){
    const md=metaCache.get(entity)||{};
    const layoutId=record.Layout?.id||record.$layout_id;
    const layout=md.layouts?.find(x=>layoutId&&String(x.id)===String(layoutId))||md.layouts?.find(x=>x.visible!==false)||md.layouts?.[0];
    const sections=Array.isArray(layout?.sections)?layout.sections:[];
    const seen=new Set(),groups=[];
    for(const s of sections){
      const keys=(s.fields||[]).map(x=>typeof x==='string'?x:x.api_name).filter(x=>x&&(!md.fields?.length||fieldMap(entity).has(x)));
      if(keys.length){keys.forEach(x=>seen.add(x));groups.push({title:s.display_label||s.name||'Information',keys});}
    }
    const extras=(md.fields||[]).filter(filteredField).map(x=>x.api_name).filter(k=>!seen.has(k)&&!k.startsWith('$'));
    if(extras.length)groups.push({title:'Additional fields',keys:extras});
    if(!groups.length){
      const keys=Object.keys(record).filter(k=>!k.startsWith('$')&&k!=='id'&&(!md.fields?.length||fieldMap(entity).has(k)));
      groups.push({title:'Record information',keys});
    }
    return groups;
  }
  function statusBar(entity,record){
    const config={
      Insurance_Policy:['Application_Status','Underwriting_Status','Payment_Status','Policy_Status'],
      Deals:['Stage','Payment_Status'],
      Membership:['Current_Membership_Status'],
      Training_Centre_Accred:['Application_Stage','Accreditation_Status','Payment_Status']
    };
    const keys=config[entity]||['Status','Application_Status','Payment_Status','Policy_Status','Risk_Status','Investigation_Status'];
    return keys.filter(k=>Object.prototype.hasOwnProperty.call(record,k)).map(k=>{
      const raw=record[k],missing=raw===undefined||raw===null||raw==='';
      const editor=global.BGAccredEdit&&global.BGAccredEdit.render(entity,record,k);
      return '<span class="v12-status v12-'+(missing?'neutral':iconStatus(raw))+'"><span>'+safe(pretty(k))+'</span><strong>'+(editor||safe(missing?'Not recorded':format(k,raw)))+'</strong></span>';
    }).join('');
  }
  function relationList(entity){
    const x=metaCache.get(entity)||{};
    const seen=new Set();
    const rows=x.relatives.filter(r=>r.visible!==false).map(r=>({id:r.api_name||r.name,label:r.display_label||r.name||r.api_name,mod:r.module?.api_name||null})).filter(r=>r.id);
    const fallback=fallbackRelated[entity]||[];
    for(const s of fallback){if(!rows.some(x=>x.id===s))rows.push({id:s,label:pretty(s),mod:null,fallback:true});}
    // Operational UAT leaves out the related lists of features that are not part of it (cancellations, vouchers and waivers).
    const outOfScope=r=>global.BG_OPERATIONAL_UAT&&/cancell|voucher|waive/i.test(r.id+' '+r.label);
    return rows.filter(r=>{if(outOfScope(r)||seen.has(r.id))return false;seen.add(r.id);return true;});
  }
  function relationKey(entity,id,list){return entity+':'+id+':'+list;}

  // CRM keeps emails behind their own API, so the SDK related-list call returns nothing for them.
  function emailAddress(x){return x&&typeof x==='object'?(x.user_name&&x.email?x.user_name+' <'+x.email+'>':String(x.email||x.user_name||'')):String(x||'');}
  function emailRows(list){
    return (Array.isArray(list)?list:[]).map(m=>{
      const st=Array.isArray(m&&m.status)?[...new Set(m.status.map(x=>String(x&&(x.type||x.status)||'')).filter(Boolean).map(x=>x.replace(/_/g,' ').replace(/^./,c=>c.toUpperCase())))].join(', '):String(m&&m.status||'');
      return{id:String(m&&(m.message_id||m.id)||''),Subject:String(m&&m.subject||'(no subject)'),From:emailAddress(m&&m.from),To:(Array.isArray(m&&m.to)?m.to:[]).map(emailAddress).join(', '),Sent_Time:String(m&&(m.time||m.sent_time||m.date_time)||''),Direction:m&&m.sent===true?'Sent':m&&m.sent===false?'Received':'',Status:st};
    });
  }
  async function loadEmails(entity,id,api,page){
    const res=await api.CONNECTION.invoke(TIMELINE_CONNECTION,{method:'GET',url:TIMELINE_API+encodeURIComponent(entity)+'/'+encodeURIComponent(id)+'/Emails',parameters:{per_page:50,page:page||1},headers:{},param_type:1});
    const body=timelineBody(res),status=Number(res&&res.details&&res.details.statusCode);
    if(status===204||!body)return{rows:[],more:false};
    const list=body.email_related_list||body.emails||body.Emails||body.data;
    if(Array.isArray(list))return{rows:emailRows(list),more:!!(body.info&&body.info.more_records)};
    if(body.code&&!/^(SUCCESS|NO_CONTENT)$/i.test(String(body.code)))throw Error(String(body.message||body.code));
    return{rows:[],more:false};
  }
  async function loadRelation(entity,id,list,api,rerender,{page=1}={}){
    const key=relationKey(entity,id,list), item=relatedCache.get(key)||{pages:new Map(),moreByPage:new Map(),more:false,error:null};
    if(item.loading)return;
    if(item.pages.has(page)){item.page=page;relatedCache.set(key,item);rerender();return;}
    item.loading=true;item.page=page;item.error=null;relatedCache.set(key,item);rerender();
    let emailProblem='';
    try{
      if(/^emails$/i.test(String(list))&&typeof api?.CONNECTION?.invoke==='function'){
        try{const em=await loadEmails(entity,id,api,page);item.pages.set(page,em.rows);item.more=em.more;item.moreByPage.set(page,em.more);return;}
        catch(e){emailProblem=String(e&&e.message||e);}
      }
      if(typeof api?.API?.getRelatedRecords!=='function')throw Error('Related lists are not available right now');
      const result=await api.API.getRelatedRecords({Entity:entity,RecordID:String(id),RelatedList:list,page,per_page:100});
      if(result?.code&&result.code!=='SUCCESS'&&result.code!=='NO_CONTENT'&&!Array.isArray(result.data))throw Error(result.message||result.code);
      const rows=Array.isArray(result?.data)?result.data:Array.isArray(result)?result:[];
      item.pages.set(page,rows);
      item.more=result?.info?.more_records===true||(result?.info?.more_records==null&&rows.length===100);item.moreByPage.set(page,item.more);
      if(emailProblem&&!rows.length)item.error='Emails could not be loaded from CRM ('+emailProblem+'). Tell your A2Z Cloud contact if this keeps happening.';
    }catch(e){item.error=String(e.message||e);}
    finally{item.loading=false;rerender();}
  }
  const navigable=new Set(['Contacts','Accounts','Deals','Membership','Membership_Extension','Insurance_Policy','Insurance_Extension','Insured_People','Insured_Premises','Declarations','Risk_Screenings','Policy_Revisions','Training_Centre_Accred','Training_Centres','Qualifications','TC_Course_Offering','Tutor_Relationships','Accreditation_Centre_Link','Accreditation_Extensions','Tasks']);
  // A long note is shortened in a table cell; the full text stays on the note itself.
  function cellMarkup(k,v){
    if(k==='Note_Content'&&typeof v==='string'&&v.length>160)return safe(v.slice(0,160).trim())+'…';
    return statusMarkup(k,v);
  }
  function tableRows(entity,rows,ctx){
    const meta=fieldMap(entity);
    const requested=Array.isArray(ctx?.columns)?ctx.columns.filter(x=>/^[A-Za-z_][A-Za-z0-9_]*$/.test(x)):[];
    const preferred=requested.length?requested:(tableColumns[entity]||['Name','Status','Owner','Modified_Time']);
    let columns=preferred.filter(x=>rows.some(r=>r[x]!==undefined)&&(meta.size===0||meta.has(x)));
    if(!columns.length&&rows.length)columns=Object.keys(rows[0]).filter(k=>k!=='id'&&!k.startsWith('$')&&(meta.size===0||meta.has(k))).slice(0,6);
    if(!columns.length)columns=['Name'];
    const labels=columns.map(k=>meta.get(k)?.field_label||pretty(k));
    const headings=labels.map(l=>'<th scope="col">'+safe(l)+'</th>').join('');
    return '<div class="v12-table-wrap"><table class="v12-table"><thead><tr>'+headings+(navigable.has(entity)?'<th scope="col" class="v12-action-cell">Action</th>':'')+'</tr></thead><tbody>'+
      rows.map(r=>'<tr>'+columns.map((k,i)=>'<td data-label="'+safe(labels[i])+'">'+(i===0&&navigable.has(entity)?'<button class="v12-link v12-cell-link" data-action="select" data-entity="'+safe(entity)+'" data-id="'+safe(r.id)+'">'+cellMarkup(k,r[k])+'</button>':cellMarkup(k,r[k]))+'</td>').join('')+
      (navigable.has(entity)?'<td class="v12-action-cell"><button class="v12-link" data-action="select" data-entity="'+safe(entity)+'" data-id="'+safe(r.id)+'">Open</button></td>':'')+'</tr>').join('')+
      '</tbody></table></div>';
  }
  function relationContent(entity,record,name,api,rerender){
    const key=relationKey(entity,record.id,name),item=relatedCache.get(key);
    if(!item){loadRelation(entity,record.id,name,api,rerender);return '<p class="v12-muted" role="status">Loading CRM related records…</p>';}
    if(item.loading&&!item.pages.has(item.page||1))return '<p class="v12-muted" role="status">Loading related records…</p>';
    const rows=item.pages.get(item.page||1)||[];const hasNext=item.pages.has((item.page||1)+1)||item.moreByPage?.get(item.page||1)===true;
    const rel=relationList(entity).find(x=>x.id===name),mod=rel?.mod;
    const guess={'Insurance_Extensions':'Insurance_Extension','Training_Centre_Course_Offering':'TC_Course_Offering','Tutor_Relationship':'Tutor_Relationships','Membership_Extension1':'Membership_Extension'}[name];
    const linkedModule=mod||guess||name;
    const body=rows.length?tableRows(linkedModule,rows):'<p class="v12-muted">'+(item.error?'The related list could not be retrieved.':'No linked records were returned.')+'</p>';
    return '<div class="v12-related-head"><div><h3>'+safe(rel?.label||pretty(name))+'</h3><p>'+rows.length+' records on page '+(item.page||1)+(hasNext?' · More available':'')+'</p></div><button class="button secondary" data-action="v12-rel-refresh" data-list="'+safe(name)+'">Refresh</button></div>'+
       (item.error?'<div class="v12-warning" role="alert">'+safe(item.error)+' <span>Use Open in CRM if needed.</span></div>':'')+
       body+
       '<div class="v12-pager"><button class="button secondary" data-action="v12-rel-page" data-list="'+safe(name)+'" data-page="'+((item.page||1)-1)+'" '+((item.page||1)===1?'disabled':'')+'>Previous</button><span>Page '+(item.page||1)+'</span><button class="button secondary" data-action="v12-rel-page" data-list="'+safe(name)+'" data-page="'+((item.page||1)+1)+'" '+(!hasNext?'disabled':'')+'>Next</button></div>';
  }
  let focusedRecord=null;
  function relatedActivityTimeline(entity,record,api,rerender,notice){
    const id=String(record.id);
    const lists=relationList(entity);
    const selected=lists.filter(r=>/notes|tasks|activities|calls|meetings/i.test(r.id+' '+r.label)).slice(0,5);
    // Use the same CRM related-record loader as the Related Lists tab, never fabricated activity.
    for(const rel of selected){const key=relationKey(entity,id,rel.id);if(!relatedCache.has(key))loadRelation(entity,id,rel.id,api,rerender);}
    const events=[];
    for(const [field,label] of [['Created_Time','Record created'],['Modified_Time','Record last modified']]){
      if(record[field])events.push({date:String(record[field]),title:label,description:field==='Modified_Time'?'CRM record last changed':'CRM record first created'});
    }
    let pending=0,errors=0;
    for(const rel of selected){
      const item=relatedCache.get(relationKey(entity,id,rel.id));if(!item||item.loading)pending++;
      if(item?.error)errors++;
      for(const row of item?.pages?.get(1)||[]){
        const date=row.Created_Time||row.Modified_Time||row.Due_Date||row.Call_Start_Time||row.Start_DateTime||'';
        const title=row.Subject||row.Note_Title||row.Title||row.Event_Title||row.Call_Type||rel.label;
        const description=row.Note_Content||row.Description||row.Status||'';
        events.push({date:String(date),title:String(title),description:String(description).replace(/<[^>]*>/g,' ').slice(0,240),module:rel.label});
      }
    }
    events.sort((a,b)=>b.date.localeCompare(a.date));
    const content=events.map(x=>'<li class="staff-timeline-event"><time>'+safe(x.date?new Date(x.date).toLocaleString('en-GB',{dateStyle:'medium',timeStyle:'short'}):'Date not recorded')+'</time><div><strong>'+safe(x.title)+'</strong>'+(x.module?'<span class="staff-timeline-type">'+safe(x.module)+'</span>':'')+(x.description?'<p>'+safe(x.description)+'</p>':'')+'</div></li>').join('');
    return '<section class="v12-detail-section"><h3>Timeline</h3>'+(notice||'')+'<p class="v12-muted">CRM record events and available related activity, newest first. The full CRM audit history remains available in native CRM.</p>'+
      (pending?'<p class="v12-muted" role="status">Loading CRM activities…</p>':'')+
      (errors?'<p class="v12-warning">Some CRM related activity could not be retrieved with the current permissions.</p>':'')+
      '<ol class="staff-timeline">'+(content||'<li class="v12-muted">No dated activity is available for this record.</li>')+'</ol>'+
      '<button type="button" class="button secondary" data-action="v12-timeline-refresh">Refresh timeline</button></section>';
  }

  function timelineValue(v){
    if(v===null||v===undefined||v==='')return 'empty';
    if(typeof v==='boolean')return v?'Yes':'No';
    if(Array.isArray(v))return v.map(timelineValue).join(', ')||'empty';
    if(typeof v==='object')return String(v.name||v.display_value||v.value||v.id||'empty');
    return String(v);
  }
  function timelineBody(res){
    let b=res&&res.details&&res.details.statusMessage!==undefined?res.details.statusMessage:(res&&res.details!==undefined?res.details:res);
    if(typeof b==='string'){try{b=JSON.parse(b)}catch(_){return null}}
    return b&&typeof b==='object'?b:null;
  }
  // Turns the CRM v8 __timeline response into plain events. Defensive: CRM adds fields over time.
  function timelineEvents(list){
    const verbs={function_executed:'ran',added:'created',updated:'updated',deleted:'deleted',converted:'converted',approved:'approved',rejected:'rejected',unlinked:'unlinked',linked:'linked'};
    return (Array.isArray(list)?list:[]).map(x=>{
      const action=String(x&&x.action||'').toLowerCase(),verb=verbs[action]||(action||'changed');
      const rel=x&&x.related_record&&typeof x.related_record==='object'?x.related_record:null;
      const relModule=rel&&rel.module&&(rel.module.api_name||rel.module.name)||'';
      const ext=String(x&&x.extension&&(x.extension.name||x.extension.api_name||x.extension.type)||'');
      const changes=(Array.isArray(x&&x.field_history)?x.field_history:[]).map(f=>({label:f.field_label||pretty(f.api_name||'Field'),from:timelineValue(f._value&&f._value.old),to:timelineValue(f._value&&f._value.new)}));
      const ad=x&&x.automation_details&&typeof x.automation_details==='object'?x.automation_details:null;
      const rule=ad&&ad.rule&&ad.rule.name||'',adType=ad&&ad.type?String(ad.type):'';
      const auto=!!(rule||adType)||/workflow|blueprint|automation|schedule|macro|assignment|approval/i.test(String(x&&x.source||''));
      const isEmail=/e-?mail/i.test(relModule+' '+ext)||/mail/i.test(action);
      const isActivity=/note|task|call|event|meeting|activit/i.test(relModule);
      const cap=t=>String(t||'').replace(/_/g,' ').replace(/^./,c=>c.toUpperCase());
      const ran=/function|executed|workflow/i.test(action);
      let title;
      if(ran)title='Automation ran'+(rule?': '+rule:'');
      else if(isEmail)title='Email'+(rel&&rel.name?': '+rel.name:/sent/i.test(action)?' sent':' '+verb);
      else if(rel)title=(relModule?pretty(relModule).replace(/([^s])s$/,'$1')+' ':'Related record ')+(action==='added'?'added':verb)+(rel.name?': '+rel.name:'');
      else if(action==='updated'&&changes.length)title=changes.length===1?changes[0].label+' updated':changes.length+' fields updated';
      else title='Record '+verb;
      const kind=isEmail?'email':rel?(isActivity?'activity':'related'):(changes.length?'fields':'record');
      return{date:String(x&&x.audited_time||''),who:String(x&&x.done_by&&(x.done_by.name||x.done_by.full_name)||''),title,kind,auto,changes:rel?[]:changes,automation:rule?(adType?cap(adType)+': ':'')+String(rule):(adType?cap(adType):'')};
    }).filter(e=>e.date||e.title);
  }
  async function loadTimeline(entity,id,crm,rerender,page){
    const key=entity+':'+id,prev=timelineCache.get(key);
    const item=page>1&&prev?prev:{events:[],page:0,more:false};
    item.loading=true;item.error='';item.unavailable=false;timelineCache.set(key,item);
    await null;
    try{
      if(!crm||!crm.CONNECTION||typeof crm.CONNECTION.invoke!=='function')throw Error('The CRM connection feature is not available in this widget.');
      const res=await crm.CONNECTION.invoke(TIMELINE_CONNECTION,{method:'GET',url:TIMELINE_API+encodeURIComponent(entity)+'/'+encodeURIComponent(id)+'/__timeline',parameters:{per_page:50,page:page||1},headers:{},param_type:1});
      const body=timelineBody(res),status=Number(res&&res.details&&res.details.statusCode);
      if(status===204||(body&&body.info&&body.info.count===0&&!body.__timeline)){item.events=page>1?item.events:[];item.more=false;}
      else if(!body||!Array.isArray(body.__timeline))throw Error(String(body&&body.message||res&&res.message||res&&res.code||'CRM did not return a timeline.'));
      else{item.events=(page>1?item.events:[]).concat(timelineEvents(body.__timeline));item.more=!!(body.info&&body.info.more_records);item.page=page||1;}
    }catch(e){item.unavailable=true;item.events=page>1?item.events:[];item.error=String(e&&e.message||e);}
    finally{item.loading=false;try{rerender();}catch(_){/* The page may have changed. */}}
  }
  const TIMELINE_FILTERS=[['all','All activity',()=>true],['email','Emails',e=>e.kind==='email'],['auto','Automatic',e=>e.auto],['activity','Notes and tasks',e=>e.kind==='activity'],['fields','Field changes',e=>e.kind==='fields']];
  function timelineBadges(e){
    return (e.kind==='email'?'<span class="bg-tl-badge bg-tl-badge--email">Email</span>':'')+(e.auto?'<span class="bg-tl-badge bg-tl-badge--auto">Automatic</span>':'');
  }
  function timelineEventHtml(e){
    const d=e.date?new Date(e.date):null,time=d&&!isNaN(d)?d.toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'}):'';
    return '<li class="bg-tl-item bg-tl-item--'+safe(e.kind)+'"><time>'+safe(time)+'</time><div><strong>'+safe(e.title)+'</strong> '+timelineBadges(e)+(e.who?' <span class="bg-tl-who">by '+safe(e.who)+'</span>':'')+
      (e.changes.length?'<ul class="bg-tl-changes">'+e.changes.map(c=>'<li><b>'+safe(c.label)+'</b> <span class="bg-tl-old">'+safe(c.from)+'</span> &rarr; <span class="bg-tl-new">'+safe(c.to)+'</span></li>').join('')+'</ul>':'')+
      (e.automation?'<p class="v12-muted">Triggered by '+safe(e.automation)+'</p>':'')+'</div></li>';
  }
  function crmTimeline(entity,record,api,rerender){
    const id=String(record.id),key=entity+':'+id;
    if(!timelineCache.has(key))loadTimeline(entity,id,api,rerender,1);
    const item=timelineCache.get(key);
    const openBtn='<button type="button" class="button secondary" data-action="open" data-entity="'+safe(entity)+'" data-id="'+safe(id)+'">Open full timeline in CRM</button>';
    if(item.loading&&!item.events.length)return '<section class="v12-detail-section"><h3>Timeline</h3><p class="v12-muted" role="status">Loading the CRM timeline…</p></section>';
    if(item.unavailable)return relatedActivityTimeline(entity,record,api,rerender,'<p class="v12-muted" role="status">The full CRM timeline could not be loaded, so this shows notes, tasks and other related activity only. '+openBtn+'</p>');
    const active=timelineFilter.get(key)||'all',def=TIMELINE_FILTERS.find(f=>f[0]===active)||TIMELINE_FILTERS[0];
    const chips='<div class="v12-tabs bg-tl-filters" role="group" aria-label="Filter the timeline">'+TIMELINE_FILTERS.map(f=>'<button type="button" class="'+(f[0]===def[0]?'selected':'')+'" data-action="v12-timeline-filter" data-filter="'+f[0]+'">'+safe(f[1])+' <span class="bg-tl-count">'+item.events.filter(f[2]).length+'</span></button>').join('')+'</div>';
    const shown=item.events.filter(def[2]),days=new Map();
    for(const e of shown){
      const d=e.date?new Date(e.date):null,day=d&&!isNaN(d)?d.toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'long',year:'numeric'}):'Date not recorded';
      if(!days.has(day))days.set(day,[]);days.get(day).push(e);
    }
    const html=[...days].map(([day,list])=>'<h4 class="bg-tl-day">'+safe(day)+'</h4><ol class="bg-tl-list">'+list.map(timelineEventHtml).join('')+'</ol>').join('');
    const none=def[0]==='all'?'Nothing has been recorded on this record yet.':'Nothing of this kind in the activity loaded so far.'+(item.more?' Use Show earlier activity to look further back.':'');
    return '<section class="v12-detail-section"><h3>Timeline</h3><p class="v12-muted">Everything that has happened on this record in CRM, newest first. This includes emails and changes made automatically by CRM rules.</p>'+chips+
      (html||'<p class="v12-muted">'+safe(none)+'</p>')+
      (item.loading?'<p class="v12-muted" role="status">Loading earlier activity…</p>':'')+
      '<div class="bg-tl-actions">'+(item.more&&!item.loading?'<button type="button" class="button secondary" data-action="v12-timeline-more">Show earlier activity</button>':'')+
      '<button type="button" class="button secondary" data-action="v12-timeline-refresh">Refresh timeline</button></div></section>';
  }
  // A short "what has happened lately" strip for the top of a record, so the timeline is not hidden behind a tab.
  function latestActivity(entity,record,api,rerender){
    const id=String(record.id),key=entity+':'+id;
    if(!timelineCache.has(key))loadTimeline(entity,id,api,rerender,1);
    const item=timelineCache.get(key);
    if(!item||item.unavailable)return '';
    if(item.loading&&!item.events.length)return '<section class="v12-detail-section bg-latest"><h3>Latest activity</h3><p class="v12-muted" role="status">Loading…</p></section>';
    const top=item.events.slice(0,4);if(!top.length)return '';
    const emails=item.events.filter(e=>e.kind==='email').length;
    const line=e=>{const d=e.date?new Date(e.date):null,when=d&&!isNaN(d)?d.toLocaleString('en-GB',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}):'';return '<li><time>'+safe(when)+'</time> <strong>'+safe(e.title)+'</strong> '+timelineBadges(e)+(e.who?' <span class="bg-tl-who">by '+safe(e.who)+'</span>':'')+'</li>';};
    return '<section class="v12-detail-section bg-latest"><h3>Latest activity</h3><ul class="bg-latest-list">'+top.map(line).join('')+'</ul><div class="bg-tl-actions"><button type="button" class="button secondary" data-action="v12-tab" data-tab="timeline">See the full timeline</button>'+
      (emails?'<button type="button" class="button secondary" data-action="v12-timeline-filter" data-filter="email">See emails ('+emails+')</button>':'')+'</div></section>';
  }
  function membershipOverview(entity,r){
    if(!['Deals','Membership'].includes(entity))return '';
    const profile=entity==='Membership';
    const groups=profile?[
      ['Membership', [['Membership type',['Current_Member_Type','Member_Type','Membership_Type']],['Membership status',['Current_Membership_Status','Membership_Status']],['Membership number',['Membership_Number','Member_Number','Name']],['Primary branch',['Primary_Branch','Branch']]]],
      ['Dates and relationship',[['Joined',['Date_Joined','Join_Date','Member_Since']],['Renewal / expiry',['Renewal_Date','Expiry_Date','End_Date']],['Customer',['Contact','Contact_Name']],['Last updated',['Modified_Time']]]]
    ]:[
      ['Membership', [['Membership type',['Membership_Type','Member_Type','Level']],['Purchase type',['Purchase_Type']],['Primary branch',['Branch','Primary_Branch']],['Application stage',['Stage','Application_Status']]]],
      ['Payment and cover',[['Payment status',['Payment_Status']],['Payment method',['Payment_Method','Payment_Type']],['Start date',['Start_Date','Membership_Start_Date']],['Expiry / renewal',['Expiry_Date','Renewal_Date','End_Date']]]]
    ];
    const row=(label,keys)=>{
      const found=keys.find(k=>r[k]!==undefined&&r[k]!==null&&r[k]!=='');
      return '<div class="staff-member-fact"><span>'+safe(label)+'</span><strong>'+safe(found?format(found,r[found]):'Not recorded')+'</strong></div>';
    };
    return '<section class="staff-member-overview" aria-label="Membership summary"><div class="staff-member-intro"><div><span class="v12-kicker">MEMBERSHIP AT A GLANCE</span><h3>'+safe(profile?'Member profile':'Membership transaction')+'</h3><p>Relevant information from the CRM record. Open All CRM fields for the full data.</p></div></div><div class="staff-member-grid">'+groups.map(([title,fields])=>'<section class="staff-member-group"><h4>'+safe(title)+'</h4>'+fields.map(x=>row(x[0],x[1])).join('')+'</section>').join('')+'</div></section>';
  }
  function detailPage(entity,record,ctx){
    focusedRecord={entity,record};
    const id=String(record.id),key=entity+':'+id,selection=chosen.get(key)||(entity==='Deals'||entity==='Membership'?'overview':'details');
    const relations=relationList(entity),meta=metaCache.get(entity)||{};
    const editable=typeof ctx.editableFields==='function'?ctx.editableFields(entity,record):'';
    let main='';
    if(selection==='updates')main='<section class="v12-detail-section"><h3>CRM field updates</h3><p class="v12-muted">Changing these fields runs the configured CRM workflows. Confirm the change before saving.</p>'+(editable||'<p>No authorised inline updates are available for this record.</p>')+'</section>';
    else 
if(selection==='overview'&&['Deals','Membership'].includes(entity))main=membershipOverview(entity,record);
    else if(selection==='details'){
      const showEmpty=fieldModes.get(key)===true;
      main='<div class="v12-record-toolbar"><div class="v12-tabs"><button class="'+(!showEmpty?'selected':'')+'" data-action="v12-all" data-show="false">Populated fields</button><button class="'+(showEmpty?'selected':'')+'" data-action="v12-all" data-show="true">All CRM fields</button></div></div>';
      main+=layoutSections(entity,record).map(g=>'<section class="v12-detail-section"><h3>'+safe(g.title)+'</h3>'+fieldRows(entity,record,g.keys,showEmpty)+'</section>').join('');
    }else if(selection==='timeline'){
      main=crmTimeline(entity,record,ctx.crm,ctx.rerender);
    }else if(selection==='processing'){
      main='<section class="v12-detail-section"><h3>Processing and decisions</h3>'+fieldRows(entity,record,['Application_Status','Application_Stage','Underwriting_Status','Risk_Status','Sanctions_Status','Payment_Status','Policy_Status','Finance_Sync_Status','Next_Action','Next_Action_Date','Stop_Reason','Manual_Review_Outcome'],true)+'<div class="v12-warning">Risk decisions and payment status are confirmed in CRM and the Portal. This screen does not clear a referral or activate cover.</div></section>'+(typeof ctx.processing==='function'?ctx.processing(entity,record):'');
    }else{main=relationContent(entity,record,selection,ctx.crm,ctx.rerender);}
    if(selection==='overview'||selection==='details')main=latestActivity(entity,record,ctx.crm,ctx.rerender)+main;
    const extraAction=(ctx.operationalUat||global.BG_OPERATIONAL_UAT)?'':(global.BGStaffAddons?.action(entity,record)||'');
    const header='<header class="v12-record-head"><div><span class="v12-kicker">'+safe(appNames[entity]||pretty(entity))+'</span><h2>'+safe(ctx.title(entity,record))+'</h2><p>'+safe(ctx.summary(entity,record)||'')+'</p></div><div class="v12-status-row">'+statusBar(entity,record)+'</div></header>'+stopBanner(entity,record);
    const navigation=[...(['Deals','Membership'].includes(entity)?[['overview','Membership overview']]:[]),['timeline','Timeline'],['details','All CRM fields'],['processing','Processing'],...(editable?[['updates','Field updates']]:[])].map(p=>'<button class="v12-side-link '+(selection===p[0]?'active':'')+'" data-action="v12-tab" data-tab="'+p[0]+'">'+safe(p[1])+'</button>').join('');
    const related=relations.map(r=>{
      const cache=relatedCache.get(relationKey(entity,id,r.id));
      const loaded=cache?.pages?.get(cache.page||1);
      const count=loaded?'<span class="staff-rel-count" aria-label="'+loaded.length+' loaded on current page">'+loaded.length+(cache.moreByPage?.get(cache.page||1)?'+':'')+'</span>':'';
      return '<button class="v12-side-link '+(selection===r.id?'active':'')+'" data-action="v12-tab" data-tab="'+safe(r.id)+'"><span>'+safe(r.label)+'</span>'+count+'</button>';
    }).join('');
    const metaText=meta.loading?'Loading the CRM layout…':meta.problems?.length?'Some CRM layout details could not be loaded, so some fields or lists may be missing.':'Fields and lists follow your CRM layout.';
    return '<div class="v12-record">'+header+'<div class="v12-member-actions"><div class="v12-member-primary-actions">'+ctx.actions(entity,id)+'</div>'+(extraAction?'<div class="v12-member-service-actions"><span>Membership services</span>'+extraAction+'</div>':'')+'</div><div class="v12-record-layout"><div class="v12-main">'+main+'<p class="v12-meta-note">'+safe(metaText)+'</p></div><aside class="v12-side" aria-label="Record sections and related lists"><h3>Record</h3>'+navigation+'<h3>Related Lists</h3>'+related+'</aside></div></div>';
  }
  async function action(el,focus,crm,rerender){
    if(!focus)return false;
    const a=el?.dataset?.action;
    if(!a||!a.startsWith('v12-'))return false;
    const entity=focus.entity,record=focus.record,key=entity+':'+record.id;
    if(a==='v12-timeline-filter'){const f=String(el.dataset.filter||'all');if(TIMELINE_FILTERS.some(x=>x[0]===f))timelineFilter.set(key,f);chosen.set(key,'timeline');rerender();return true;}
    if(a==='v12-timeline-more'){const it=timelineCache.get(key);if(it&&!it.loading){const p=loadTimeline(entity,String(record.id),crm,rerender,(it.page||1)+1);rerender();await p;}return true;}
    if(a==='v12-timeline-refresh'){
      timelineCache.delete(key);
      for(const rel of relationList(entity).filter(r=>/notes|tasks|activities|calls|meetings/i.test(r.id+' '+r.label)))relatedCache.delete(relationKey(entity,record.id,rel.id));
      rerender();return true;
    }
    if(a==='v12-tab'){
      const tab=el.dataset.tab;if(!['details','overview','timeline','processing','updates'].includes(tab)&&!relationList(entity).some(x=>x.id===tab))return true;
      chosen.set(key,tab);rerender();try{const top=document.querySelector('.v12-record');if(top&&top.scrollIntoView)top.scrollIntoView({block:'start'});}catch(_){/* Scrolling is a convenience only. */}if(!['details','overview','timeline','processing','updates'].includes(tab))await loadRelation(entity,record.id,tab,crm,rerender);return true;
    }
    if(a==='v12-all'){fieldModes.set(key,el.dataset.show==='true');rerender();return true;}
    if(a==='v12-rel-refresh'||a==='v12-rel-page'){
      const list=el.dataset.list;if(!relationList(entity).some(x=>x.id===list))return true;
      const k=relationKey(entity,record.id,list),item=relatedCache.get(k);
      if(a==='v12-rel-refresh')relatedCache.delete(k);
      const page=a==='v12-rel-page'?Math.max(1,Number(el.dataset.page)||1):1;
      await loadRelation(entity,record.id,list,crm,rerender,{page});return true;
    }
    return false;
  }
  global.BGCRM12={emailRows,timelineEvents,timelineBody,prime,detailPage,tableRows,action,getFocusedRecord:()=>focusedRecord,metadata:entity=>metaCache.get(entity)||null,relationList,format};
})(window);
