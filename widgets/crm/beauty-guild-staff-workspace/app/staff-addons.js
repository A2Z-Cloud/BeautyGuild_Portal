/* Staff assisted pricing and MTA. All prices and decisions come from the signed staff API. */
(function(global){
'use strict';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const state={record:null,entity:'',mode:'',quote:null,payload:null,busy:false,code:'',waiver:'',reason:'',note:''};
const reasons=['Goodwill Gesture','Complaint','Upgrade','Promotion','Payment Problem','Other'];
const eligible=[['','No waiver'],['MEM-JOIN','Joining fee']];
const $=id=>document.getElementById(id);
function field(id,label,extra=''){return '<label for="'+id+'">'+label+'</label><input id="'+id+'" '+extra+' />';}
function note(text){return '<p class="staff-addon-info">'+esc(text)+'</p>';}
function action(entity,record){
 if(!['Insurance_Policy','Deals','Membership'].includes(entity))return '';
 const mode=entity==='Insurance_Policy'?'mta':'discount';
 return '<button type="button" class="button secondary" data-staff-addon="'+mode+'" data-staff-id="'+esc(record.id)+'">'+(mode==='mta'?'Manage changes (MTA)':'Voucher / waiver')+'</button>';
}
function journeyPanel(kind){
 if(kind!=='membership')return '';
 return '<section class="staff-addon-panel"><h3>Staff voucher and waiver</h3>'+discountFields()+
 note('Code and waiver inputs are only applied after a signed server-side quote. Bespoke voucher redemption stays unavailable until Creator tracking is ready.')+
 '<button class="button secondary" type="button" data-staff-addon="validate-discount">Validate inputs</button><output id="staff-discount-outcome" aria-live="polite"></output></section>';
}
function discountFields(){
 return field('staff-code','Referral or voucher code','data-staff-field="code" value="'+esc(state.code)+'" placeholder="Enter code"')+
 '<label for="staff-waiver">Staff waiver</label><select id="staff-waiver" data-staff-field="waiver">'+eligible.map(([v,label])=>'<option value="'+esc(v)+'"'+(v===state.waiver?' selected':'')+'>'+label+'</option>').join('')+'</select>'+
 '<label for="staff-reason">Reason</label><select id="staff-reason" data-staff-field="reason"><option value="">Select reason</option>'+reasons.map(v=>'<option'+(v===state.reason?' selected':'')+'>'+v+'</option>').join('')+'</select>'+
 '<label for="staff-note">Notes</label><textarea id="staff-note" data-staff-field="note" rows="2">'+esc(state.note)+'</textarea>';
}
function contactId(record){
 const objects=[record?.Contact,record?.Contact_Name,record?.Contact_Id,record?.Contact_ID,record?.Customer,record?.Member,record?.Contact_Lookup];
 for(const candidate of objects){const id=typeof candidate==='object'?candidate?.id:candidate;if(/^\d{10,25}$/.test(String(id||'')))return String(id);}
 return '';
}
function mtaFields(){
 const known=contactId(state.record);
 return '<p>Describe the proposed change. Only the server can determine its eligibility, price and referral outcome.</p>'+
 '<dl class="staff-addon-details"><dt>Policy</dt><dd>'+esc(state.record?.Policy_Number||state.record?.Name||state.record?.id)+'</dd><dt>Status</dt><dd>'+esc(state.record?.Policy_Status||'Not recorded')+'</dd><dt>Cover end</dt><dd>'+esc(state.record?.Policy_End_Date||state.record?.End_Date||'Not recorded')+'</dd></dl>'+
 field('staff-mta-contact','CRM Contact ID','inputmode="numeric" value="'+esc(known)+'" placeholder="Required: selected policy owner"')+
 note('Check the Contact ID against the policy in CRM. The backend independently verifies ownership.')+
 field('staff-mta-record','Membership / Deal record ID','inputmode="numeric" value="'+esc(state.record?.Membership?.id||state.record?.Deal?.id||'')+'" placeholder="Required for revision save"')+
 field('staff-effective-date','Effective date','type="date"')+
 '<label for="staff-mta-type">Change type</label><select id="staff-mta-type"><option value="">Choose a change</option><option value="person">Add named person</option><option value="treatment">Add treatment</option><option value="teaching">Teaching cover</option><option value="equipment">Equipment cover increase</option><option value="el">Employers Liability change</option></select>'+
 '<div id="staff-mta-specific"></div>'+
 '<label for="staff-mta-details">Additional change fields (JSON, optional)</label><textarea id="staff-mta-details" rows="4" placeholder='{"declarations":[],"qualified":"yes"}'></textarea>'+
 note('Use the same portal declarations and customer-confirmation requirements. This form does not independently confirm declarations or provide cover.')+
 '<div class="staff-addon-actions"><button class="button secondary" type="button" data-staff-addon="cover">Load current cover</button><button class="button primary" type="button" data-staff-addon="quote-mta">Get live quote</button><button class="button secondary" type="button" data-staff-addon="save-mta" disabled id="staff-mta-save">Save quoted revision</button></div>'+
 '<div class="staff-addon-result" id="staff-mta-result" role="status" aria-live="polite">No quote requested.</div>';
}
function specific(){
 const t=$('staff-mta-type')?.value||'';
 const target=$('staff-mta-specific');if(!target)return;
 target.innerHTML=t==='person'?field('staff-person-first','First name')+field('staff-person-last','Last name')+'<label for="staff-person-type">Person type</label><select id="staff-person-type"><option value="employee">Employee</option><option value="subcontractor">Subcontractor</option></select>':
 t==='treatment'?field('staff-treatment','Treatment ID','placeholder="Portal V2 treatment catalogue ID"'):
 t==='teaching'?'<label for="staff-teaching">Teaching cover</label><select id="staff-teaching"><option value="standard">Standard</option><option value="additional">Additional</option></select>':
 t==='equipment'?'<label for="staff-equipment">Equipment cover limit</label><select id="staff-equipment">'+[5000,10000,15000,20000].map(x=>'<option value="'+x+'">£'+x.toLocaleString('en-GB')+'</option>').join('')+'</select>':
 t==='el'?'<label for="staff-el">Employers Liability tier</label><select id="staff-el">'+[1,3,5].map(x=>'<option value="'+x+'">'+x+'</option>').join('')+'</select>':'';
 state.quote=null;const b=$('staff-mta-save');if(b)b.disabled=true;
}
function open(mode,record,entity){
 state.mode=mode;state.entity=entity||'';state.record=record;state.quote=null;state.payload=null;
 let d=$('staff-addon-dialog');if(!d){d=document.createElement('dialog');d.id='staff-addon-dialog';d.className='staff-addon-dialog';document.body.appendChild(d);}
 d.innerHTML='<div class="staff-addon-head"><div><small>STAFF WORKSPACE</small><h2>'+(mode==='mta'?'Mid-term adjustment':'Voucher / waiver')+'</h2><p>'+esc(record?.Name||record?.Policy_Number||record?.Deal_Name||'Selected record')+'</p></div><button type="button" class="button secondary" data-staff-addon="close">Close</button></div>'+
 (mode==='mta'?mtaFields():discountFields()+note('Referral and waiver inputs are ready for a membership quote. No discount is applied without a signed quote response.')+'<output id="staff-discount-outcome"></output>');
 if(d.showModal)d.showModal();else d.setAttribute('open','');
 if(mode==='mta')loadCover();
}
async function loadCover(){
 const target=$('staff-mta-result');if(!target)return;
 const contact=String($('staff-mta-contact')?.value||'').trim();
 const recordId=String($('staff-mta-record')?.value||'').trim();
 if(!/^\\d{10,25}$/.test(contact)||!/^\\d{10,25}$/.test(recordId)){target.textContent='Enter the Contact and Membership IDs to load current cover.';return;}
 target.textContent='Loading authoritative existing cover…';
 try{const response=await global.BGStaffApi.call('cover',{contactId:contact,recordId});target.textContent=JSON.stringify(response?.cover||response,null,2);}
 catch(e){target.textContent='Current cover could not be loaded: '+String(e.message||e);}
}
function payload(){
 const c=String($('staff-mta-contact')?.value||'').trim(),recordId=String($('staff-mta-record')?.value||'').trim(),date=$('staff-effective-date')?.value,type=$('staff-mta-type')?.value;
 if(!/^\d{10,25}$/.test(c))throw Error('Enter a valid CRM Contact ID.');
 if(!/^\d{10,25}$/.test(recordId))throw Error('Enter the associated Membership / Deal record ID.');
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date||''))throw Error('Choose an effective date.');
 if(!type)throw Error('Choose the change type.');
 const change={effectiveDate:date};
 if(type==='person'){const first=$('staff-person-first')?.value.trim(),last=$('staff-person-last')?.value.trim();if(!first||!last)throw Error('Enter the named person’s first and last name.');change.addPeople=[{firstName:first,lastName:last,type:$('staff-person-type').value}];}
 if(type==='treatment'){const id=$('staff-treatment')?.value.trim();if(!id)throw Error('Enter a Portal V2 treatment catalogue ID.');change.treatments=[id];}
 if(type==='teaching')change.teaching=$('staff-teaching').value;
 if(type==='equipment')change.equipmentTier=Number($('staff-equipment').value);
 if(type==='el')change.elTier=Number($('staff-el').value);
 const extra=$('staff-mta-details')?.value.trim();
 if(extra){let more;try{more=JSON.parse(extra);}catch{throw Error('Additional change fields must be valid JSON.');}if(!more||Array.isArray(more)||typeof more!=='object')throw Error('Additional change fields must be a JSON object.');Object.assign(change,more);change.effectiveDate=date;}
 return {contactId:c,recordId,service:'insurance_change',change};
}
function result(message,error=false){
 const el=$('staff-mta-result');if(el){el.textContent=typeof message==='string'?message:JSON.stringify(message,null,2);el.classList.toggle('error',error);}
}
async function quote(){
 if(state.busy)return;
 try{
   const p=payload();state.busy=true;result('Requesting quote from Catalyst…');
   if(!global.BGStaffApi?.call)throw Error('Staff API adapter is not loaded.');
   const response=await global.BGStaffApi.call('quote',p);
   if(response?.error||response?.code||response?.ok===false)throw Error(response.message||response.error||response.code);
   if(!response?.quote)throw Error('Backend returned no quote. Check the response contract.');
   state.quote=response;state.payload=p;
   result(response);const b=$('staff-mta-save');if(b)b.disabled=false;
 }catch(e){state.quote=null;state.payload=null;result(e.message||String(e),true);const b=$('staff-mta-save');if(b)b.disabled=true;}
 finally{state.busy=false;}
}
async function save(){
 if(state.busy||!state.quote||!state.payload)return;
 if(JSON.stringify(payload())!==JSON.stringify(state.payload)){result('Form changed after quote. Request a new quote before saving.',true);return;}
 if(!global.confirm('Create a CRM insurance revision for this Development test record? This may write draft rows. Active cover must remain unchanged.'))return;
 try{
   state.busy=true;result('Saving quoted revision…');
   const response=await global.BGStaffApi.call('save_revision',state.payload);
   if(response?.error||response?.code||response?.ok===false)throw Error(response.message||response.error||response.code);
   result(response?.auditNote===false?{warning:'Revision saved but its audit Note failed. Investigate in CRM.',response}:response,response?.auditNote===false);
   state.quote=null;const b=$('staff-mta-save');if(b)b.disabled=true;
 }catch(e){result(e.message||String(e),true);}
 finally{state.busy=false;}
}
function validate(){const out=$('staff-discount-outcome');if(!out)return;if(state.waiver&&!state.reason)out.textContent='Choose a waiver reason.';else if(state.waiver&&state.reason==='Other'&&!state.note.trim())out.textContent='Add a note for Other.';else out.textContent='Inputs captured. Final eligibility, discount and pricing must be verified by the signed quote.';}
document.addEventListener('input',event=>{const f=event.target.dataset?.staffField;if(f&&Object.prototype.hasOwnProperty.call(state,f))state[f]=event.target.value;});
document.addEventListener('change',event=>{const f=event.target.dataset?.staffField;if(f&&Object.prototype.hasOwnProperty.call(state,f))state[f]=event.target.value;if(event.target.id==='staff-mta-type')specific();if(event.target.closest('#staff-addon-dialog')&&state.quote&&event.target.id!=='staff-mta-save'){state.quote=null;const b=$('staff-mta-save');if(b)b.disabled=true;}});
document.addEventListener('click',event=>{
 const b=event.target.closest('[data-staff-addon]');if(!b)return;
 const a=b.dataset.staffAddon;
 if(a==='close'){$('staff-addon-dialog')?.close?.();return;}
 if(a==='validate-discount'){validate();return;}
 if(a==='cover'){loadCover();return;}
 if(a==='quote-mta'){quote();return;}
 if(a==='save-mta'){save();return;}
 if(a==='mta'||a==='discount'){const focus=global.BGCRM12?.getFocusedRecord?.();const record=focus?.record&&String(focus.record.id)===String(b.dataset.staffId)?focus.record:{id:b.dataset.staffId,Name:document.querySelector('.v12-record-head h2')?.textContent||'Selected record'};open(a,record,focus?.entity);}
});
global.BGStaffAddons={action,journeyPanel,open,quoteInputs:()=>({voucherCode:state.code.trim(),waivers:state.waiver?[{sku:state.waiver,reason:state.reason,note:state.note.trim()}]:[]})};
})(window);
