/* Staff Workspace V1.2: metadata-driven record and related-list presentation.
 * CRM SDK remains the source of records and permissions; this file has no credentials. */
(function(global){
  'use strict';
  const metaCache=new Map(), relatedCache=new Map(), chosen=new Map(), fieldModes=new Map();
  const tableColumns={
    Contacts:['Full_Name','Email','Mobile','Phone','Owner','Modified_Time'],
    Accounts:['Account_Name','Phone','Town','Country','Owner'],
    Deals:['Deal_Name','Contact_Name','Membership_Type','Stage','Payment_Status','Expiry_Date'],
    Membership:['Name','Contact','Current_Member_Type','Current_Membership_Status'],
    Insurance_Policy:['Name','Contact','Policy_Type','Application_Status','Underwriting_Status','Payment_Status','Policy_Status','Policy_End_Date'],
    Training_Centre_Accred:['Name','Applicant_Contact','Account','Application_Stage','Accreditation_Status','Payment_Status','Valid_To']
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
  function iconStatus(x){const t=String(x||'').toLowerCase();return /^(active|approved|clear|paid|verified|current|completed)$/.test(t)?'good':/(failed|banned|stopped|stop|rejected|cancelled)/.test(t)?'bad':/(pending|refer|await|draft|not|review|processing)/.test(t)?'waiting':'neutral';}
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
      let val=safe(format(key,raw));
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
    const keys=['Application_Status','Stage','Current_Membership_Status','Underwriting_Status','Risk_Status','Payment_Status','Policy_Status','Accreditation_Status','Application_Stage'];
    return keys.filter(k=>record[k]!==undefined&&record[k]!==null).map(k=>{const editor=global.BGAccredEdit&&global.BGAccredEdit.render(entity,record,k);return '<span class="v12-status v12-'+iconStatus(record[k])+'"><span>'+safe(pretty(k))+'</span> <strong>'+(editor||safe(format(k,record[k])))+'</strong></span>';}).join('');
  }
  function relationList(entity){
    const x=metaCache.get(entity)||{};
    const seen=new Set();
    const rows=x.relatives.filter(r=>r.visible!==false).map(r=>({id:r.api_name||r.name,label:r.display_label||r.name||r.api_name,mod:r.module?.api_name||null})).filter(r=>r.id);
    const fallback=fallbackRelated[entity]||[];
    for(const s of fallback){if(!rows.some(x=>x.id===s))rows.push({id:s,label:pretty(s),mod:null,fallback:true});}
    return rows.filter(r=>{if(seen.has(r.id))return false;seen.add(r.id);return true;});
  }
  function relationKey(entity,id,list){return entity+':'+id+':'+list;}
  async function loadRelation(entity,id,list,api,rerender,{page=1}={}){
    const key=relationKey(entity,id,list), item=relatedCache.get(key)||{pages:new Map(),moreByPage:new Map(),more:false,error:null};
    if(item.loading)return;
    if(item.pages.has(page)){item.page=page;relatedCache.set(key,item);rerender();return;}
    item.loading=true;item.page=page;item.error=null;relatedCache.set(key,item);rerender();
    try{
      if(typeof api?.API?.getRelatedRecords!=='function')throw Error('CRM SDK related-list access is unavailable');
      const result=await api.API.getRelatedRecords({Entity:entity,RecordID:String(id),RelatedList:list,page,per_page:100});
      if(result?.code&&result.code!=='SUCCESS'&&result.code!=='NO_CONTENT'&&!Array.isArray(result.data))throw Error(result.message||result.code);
      const rows=Array.isArray(result?.data)?result.data:Array.isArray(result)?result:[];
      item.pages.set(page,rows);
      item.more=result?.info?.more_records===true||(result?.info?.more_records==null&&rows.length===100);item.moreByPage.set(page,item.more);
    }catch(e){item.error=String(e.message||e);}
    finally{item.loading=false;rerender();}
  }
  const navigable=new Set(['Contacts','Accounts','Deals','Membership','Membership_Extension','Insurance_Policy','Insurance_Extension','Insured_People','Insured_Premises','Declarations','Risk_Screenings','Policy_Revisions','Training_Centre_Accred','Training_Centres','Qualifications','TC_Course_Offering','Tutor_Relationships','Accreditation_Centre_Link','Accreditation_Extensions','Tasks']);
  function tableRows(entity,rows,ctx){
    const meta=fieldMap(entity);
    const preferred=tableColumns[entity]||['Name','Status','Owner','Modified_Time'];
    let columns=preferred.filter(x=>rows.some(r=>r[x]!==undefined)&&(meta.size===0||meta.has(x)));
    if(!columns.length&&rows.length)columns=Object.keys(rows[0]).filter(k=>k!=='id'&&!k.startsWith('$')&&(meta.size===0||meta.has(k))).slice(0,6);
    if(!columns.length)columns=['Name'];
    const headings=columns.map(k=>'<th scope="col">'+safe(meta.get(k)?.field_label||pretty(k))+'</th>').join('');
    return '<div class="v12-table-wrap"><table class="v12-table"><thead><tr>'+headings+(navigable.has(entity)?'<th scope="col">Action</th>':'')+'</tr></thead><tbody>'+
      rows.map(r=>'<tr>'+columns.map(k=>'<td>'+safe(format(k,r[k]))+'</td>').join('')+
      (navigable.has(entity)?'<td><button class="v12-link" data-action="select" data-entity="'+safe(entity)+'" data-id="'+safe(r.id)+'">Open</button></td>':'')+'</tr>').join('')+
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
  function detailPage(entity,record,ctx){
    focusedRecord={entity,record};
    const id=String(record.id),key=entity+':'+id,selection=chosen.get(key)||'details';
    const relations=relationList(entity),meta=metaCache.get(entity)||{};
    let main='';
    if(selection==='details'){
      const showEmpty=fieldModes.get(key)===true;
      main='<div class="v12-record-toolbar"><div class="v12-tabs"><button class="'+(!showEmpty?'selected':'')+'" data-action="v12-all" data-show="false">Populated fields</button><button class="'+(showEmpty?'selected':'')+'" data-action="v12-all" data-show="true">All CRM fields</button></div></div>';
      main+=layoutSections(entity,record).map(g=>'<section class="v12-detail-section"><h3>'+safe(g.title)+'</h3>'+fieldRows(entity,record,g.keys,showEmpty)+'</section>').join('');
    }else if(selection==='timeline'){
      main='<section class="v12-detail-section"><h3>Record timeline</h3>'+fieldRows(entity,record,['Created_Time','Created_By','Modified_Time','Modified_By','Owner'],true)+'<p class="v12-muted">Open Notes or Tasks from Related Lists for their actual CRM entries. An aggregated CRM audit timeline is not available through this widget yet.</p></section>';
    }else if(selection==='processing'){
      main='<section class="v12-detail-section"><h3>Processing and decisions</h3>'+fieldRows(entity,record,['Application_Status','Application_Stage','Underwriting_Status','Risk_Status','Sanctions_Status','Payment_Status','Policy_Status','Finance_Sync_Status','Next_Action','Next_Action_Date','Stop_Reason','Manual_Review_Outcome'],true)+'<div class="v12-warning">Risk decisions and payment status must be verified in CRM and the authoritative Catalyst service. This screen does not clear a referral or activate cover.</div></section>'+(typeof ctx.processing==='function'?ctx.processing(entity,record):'');
    }else{main=relationContent(entity,record,selection,ctx.crm,ctx.rerender);}
    const extraAction=global.BGStaffAddons?.action(entity,record)||'';
    const header='<header class="v12-record-head"><div><span class="v12-kicker">'+safe(appNames[entity]||pretty(entity))+'</span><h2>'+safe(ctx.title(entity,record))+'</h2><p>'+safe(ctx.summary(entity,record)||'')+'</p></div><div class="v12-status-row">'+statusBar(entity,record)+'</div></header>';
    const navigation=[['details','Details'],['timeline','Timeline'],['processing','Processing']].map(p=>'<button class="v12-side-link '+(selection===p[0]?'active':'')+'" data-action="v12-tab" data-tab="'+p[0]+'">'+safe(p[1])+'</button>').join('');
    const related=relations.map(r=>'<button class="v12-side-link '+(selection===r.id?'active':'')+'" data-action="v12-tab" data-tab="'+safe(r.id)+'">'+safe(r.label)+'</button>').join('');
    const metaText=meta.loading?'CRM layout metadata loading…':meta.problems?.length?'Some CRM metadata could not be loaded; fields and relationships may be incomplete.':'CRM layout and field labels';
    return '<div class="v12-record">'+header+'<div class="v12-actions">'+ctx.actions(entity,id)+extraAction+'</div><div class="v12-record-layout"><div class="v12-main">'+main+'<p class="v12-meta-note">'+safe(metaText)+'</p></div><aside class="v12-side" aria-label="Record sections and related lists"><h3>Record</h3>'+navigation+'<h3>Related Lists</h3>'+related+'</aside></div></div>';
  }
  async function action(el,focus,crm,rerender){
    if(!focus)return false;
    const a=el?.dataset?.action;
    if(!a||!a.startsWith('v12-'))return false;
    const entity=focus.entity,record=focus.record,key=entity+':'+record.id;
    if(a==='v12-tab'){
      const tab=el.dataset.tab;if(!['details','timeline','processing'].includes(tab)&&!relationList(entity).some(x=>x.id===tab))return true;
      chosen.set(key,tab);rerender();if(!['details','timeline','processing'].includes(tab))await loadRelation(entity,record.id,tab,crm,rerender);return true;
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
  global.BGCRM12={prime,detailPage,tableRows,action,getFocusedRecord:()=>focusedRecord,metadata:entity=>metaCache.get(entity)||null,relationList,format};
})(window);
