/* Staff assisted pricing and MTA. All prices and decisions come from the signed staff API. */
(function(global){
'use strict';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const state={record:null,entity:'',mode:'',quote:null,payload:null,savedRevision:null,checkoutUrl:'',busy:false,code:'',waiver:'',reason:'',note:''};
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
 const linkedDeal=String(state.record?.Membership?.id||state.record?.Deal?.id||'');
 const needsLink=!known||!linkedDeal;
 return '<nav class="staff-mta-progress" aria-label="Adjustment stages"><span>1 · Policy</span><span>2 · Changes</span><span>3 · Quote</span><span>4 · Payment</span></nav><h3>Policy and proposed change</h3>'+
 '<dl class="staff-addon-details"><dt>Policy</dt><dd>'+esc(state.record?.Policy_Number||state.record?.Name||state.record?.id)+'</dd><dt>Status</dt><dd>'+esc(state.record?.Policy_Status||'Not recorded')+'</dd><dt>Cover end</dt><dd>'+esc(state.record?.Policy_End_Date||state.record?.End_Date||'Not recorded')+'</dd></dl>'+
 '<details class="staff-mta-linkage" '+(needsLink?'open':'')+'><summary>Customer and membership links '+(needsLink?'— action needed':'— recorded')+'</summary>'+
 field('staff-mta-contact','CRM Contact ID','inputmode="numeric" value="'+esc(known)+'" placeholder="Required: selected policy owner"')+
 note('The backend independently verifies the selected policy owner against this Contact.')+
 field('staff-mta-record','Membership / Deal ID','inputmode="numeric" value="'+esc(linkedDeal)+'" placeholder="Required for revision save"')+
 '</details>'+
  field('staff-effective-date','Effective date','type="date"')+
 '<label for="staff-mta-type">Change type</label><select id="staff-mta-type"><option value="">Choose a change</option><option value="person">Add named person</option><option value="treatment">Add treatment</option><option value="teaching">Teaching cover</option><option value="equipment">Equipment cover increase</option><option value="el">Employers Liability change</option></select>'+
 '<div id="staff-mta-specific"></div>'+
 '<fieldset class="staff-mta-declarations"><legend>Customer declarations and evidence</legend><label for="staff-mta-qualified">Qualified to perform the requested treatment or service</label><select id="staff-mta-qualified"><option value="">Select</option><option value="yes">Yes</option><option value="no">No</option></select><label for="staff-mta-patch">Patch testing where required</label><select id="staff-mta-patch"><option value="">Select</option><option value="yes">Yes</option><option value="no">No</option></select><label><input type="checkbox" id="staff-mta-information" /> Customer confirmed information is accurate</label><label><input type="checkbox" id="staff-mta-ethics" /> Customer confirmed Code of Ethics</label><label><input type="checkbox" id="staff-mta-demands" /> Customer confirmed demands and needs</label><label><input type="checkbox" id="staff-mta-nonadvised" /> Customer confirmed non-advised cover</label></fieldset>'+
 note('Collect the required insurance declarations and qualified evidence in the existing portal journey. These checkboxes only record confirmation relayed by the customer; the backend determines referral or approval.')+
 '<div class="staff-addon-actions"><button class="button secondary" type="button" data-staff-addon="cover">Load current cover</button><button class="button primary" type="button" data-staff-addon="quote-mta">Get live quote</button><button class="button secondary" type="button" data-staff-addon="save-mta" disabled id="staff-mta-save">Save quoted revision</button></div>'+
 '<div class="staff-addon-result" id="staff-mta-result" role="status" aria-live="polite">No quote requested.</div>'+
 '<section class="staff-addon-panel" aria-label="MTA secure payment"><h3>Secure payment</h3><p>Available only after an eligible quotation and successful revision save. The customer pays through Stripe Checkout; CRM is updated by the existing payment processing.</p><label class="staff-payment-consent"><input type="checkbox" id="staff-mta-accepted" /> I confirm the customer explicitly accepted the Code of Ethics and Terms of Business.</label><button type="button" class="button primary" data-staff-addon="payment-mta" id="staff-mta-payment" disabled>Generate test payment link</button><div id="staff-mta-payment-result" role="status" aria-live="polite"></div></section>';
}
function updateMtaSummary(){
 const box=$('staff-mta-summary-body');if(!box)return;
 const q=state.quote?.quote;
 const fmt=p=>p!==null&&p!==undefined&&p!==''&&Number.isFinite(Number(p))?'£'+(Number(p)/100).toLocaleString('en-GB',{minimumFractionDigits:2,maximumFractionDigits:2}):'—';
 const policy=state.record||{};
 const selection=$('staff-mta-type')?.selectedOptions?.[0]?.textContent||'Not selected';
 const effective=$('staff-effective-date')?.value||'Not selected';
 const changeLines=q&&Array.isArray(q.lines)?q.lines.map(l=>'<div class="staff-price-line"><span>'+esc(l.name||'Adjustment')+'</span><strong>'+fmt(l.totalPence)+'</strong></div>').join(''):'';
 const coverInfo=state.cover?(Array.isArray(state.cover.extensions)?state.cover.extensions.length+' cover lines loaded':'Current cover loaded'):'Current cover not loaded';
 box.innerHTML='<dl><dt>Policy</dt><dd>'+esc(policy.Policy_Number||policy.Name||'Selected policy')+'</dd><dt>Current cover</dt><dd>'+esc(coverInfo)+'</dd><dt>Change</dt><dd>'+esc(selection)+'</dd><dt>Effective date</dt><dd>'+esc(effective)+'</dd></dl>'+
 changeLines+'<div class="staff-mta-amount"><span>Pay today</span><strong>'+(q?fmt(q.totalPence):'—')+'</strong></div>'+
 '<p class="staff-addon-info">'+(q?(q.payable?'Verified Catalyst quotation.':'Review or referral required; payment may be blocked.'):'No price is shown until the authorised Catalyst quote succeeds.')+'</p>';
}
function specific(){
 const t=$('staff-mta-type')?.value||'';
 const target=$('staff-mta-specific');if(!target)return;
 target.innerHTML=t==='person'?field('staff-person-first','First name')+field('staff-person-last','Last name')+'<label for="staff-person-type">Person type</label><select id="staff-person-type"><option value="employee">Employee</option><option value="subcontractor">Subcontractor</option></select>':
 t==='treatment'?'<label for="staff-treatment">Treatment extension</label><select id="staff-treatment"><option value="">Choose an extension</option>'+(global.BGJourney12?.TREATMENT_OPTIONS||[]).map(o=>'<option value="'+esc(o.value)+'">'+esc(o.label)+'</option>').join('')+'</select>':
 t==='teaching'?'<label for="staff-teaching">Teaching cover</label><select id="staff-teaching"><option value="standard">Standard</option><option value="additional">Additional</option></select>':
 t==='equipment'?'<label for="staff-equipment">Equipment cover limit</label><select id="staff-equipment">'+[5000,10000,15000,20000].map(x=>'<option value="'+x+'">£'+x.toLocaleString('en-GB')+'</option>').join('')+'</select>':
 t==='el'?'<label for="staff-el">Employers Liability tier</label><select id="staff-el">'+[1,3,5].map(x=>'<option value="'+x+'">'+x+'</option>').join('')+'</select>':'';
 state.quote=null;const b=$('staff-mta-save');if(b)b.disabled=true;updateMtaSummary();
}
function open(mode,record,entity){
 state.mode=mode;state.entity=entity||'';state.record=record;state.cover=null;state.quote=null;state.payload=null;state.savedRevision=null;state.checkoutUrl='';
 let d=$('staff-addon-dialog');if(!d){d=document.createElement('dialog');d.id='staff-addon-dialog';d.className='staff-addon-dialog';document.body.appendChild(d);}
 d.classList.toggle('staff-mta-dialog',mode==='mta');
 d.innerHTML='<div class="staff-addon-head"><div><small>STAFF WORKSPACE</small><h2>'+(mode==='mta'?'Change policy cover':'Voucher / waiver')+'</h2><p>'+esc(record?.Name||record?.Policy_Number||record?.Deal_Name||'Selected record')+'</p></div><button type="button" class="button secondary" data-staff-addon="close">Close</button></div>'+
 (mode==='mta'?'<div class="staff-mta-grid"><section class="staff-mta-main">'+mtaFields()+'</section><aside class="staff-mta-summary" aria-label="Policy and adjustment quote"><h3>Adjustment summary</h3><div id="staff-mta-summary-body"></div></aside></div>':discountFields()+note('Referral and waiver inputs are ready for a membership quote. No discount is applied without a signed quote response.')+'<output id="staff-discount-outcome"></output>');
 if(d.showModal)d.showModal();else d.setAttribute('open','');
 if(mode==='mta'){updateMtaSummary();loadCover();}
}
async function loadCover(){
 const target=$('staff-mta-result');if(!target)return;
 const contact=String($('staff-mta-contact')?.value||'').trim();
 const recordId=String($('staff-mta-record')?.value||'').trim();
 if(!/^\d{10,25}$/.test(contact)||!/^\d{10,25}$/.test(recordId)){target.textContent='Enter the Contact and Membership IDs to load current cover.';return;}
 target.textContent='Loading authoritative existing cover…';
 try{const response=await global.BGStaffApi.call('cover',{contactId:contact,recordId});state.cover=response?.cover||null;target.innerHTML='<strong>Current cover loaded from the staff API.</strong><details><summary>Inspect source details</summary><pre>'+esc(JSON.stringify(state.cover||response,null,2))+'</pre></details>';updateMtaSummary();}
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
 if(type==='treatment'){const id=$('staff-treatment')?.value.trim();if(!id)throw Error('Select an available treatment extension.');change.treatments=[id];}
 if(type==='teaching')change.teaching=$('staff-teaching').value;
 if(type==='equipment')change.equipmentTier=Number($('staff-equipment').value);
 if(type==='el')change.elTier=Number($('staff-el').value);
 change.qualified=$('staff-mta-qualified')?.value||'';
 change.patchTesting=$('staff-mta-patch')?.value||'';
 change.insInformationAccurate=$('staff-mta-information')?.checked?'yes':'';
 change.insEthicsAccepted=$('staff-mta-ethics')?.checked?'yes':'';
 change.insDemandsNeedsAccepted=$('staff-mta-demands')?.checked?'yes':'';
 change.insNonAdvisedAccepted=$('staff-mta-nonadvised')?.checked?'yes':'';
 return {contactId:c,recordId,service:'insurance_change',change};
}
function result(message,error=false){
 const el=$('staff-mta-result');if(!el)return;
 el.classList.toggle('error',error);
 if(typeof message==='string'){el.textContent=message;updateMtaSummary();return;}
 const q=message?.quote;
 const saved=message?.revision||message?.revisions?.length;
 const heading=q?(q.payable?'Quotation ready':'Quotation requires review'):saved?'Revision saved':'Staff API response';
 const description=q?(q.payable?'Review the breakdown before saving the revision.':'This change may require a manual decision before payment.'):saved?'The CRM revision has been recorded. Check the payment stage if applicable.':'';
 el.innerHTML='<strong>'+esc(heading)+'</strong>'+(description?'<p>'+esc(description)+'</p>':'')+
 '<details><summary>Technical response details</summary><pre>'+esc(JSON.stringify(message,null,2))+'</pre></details>';
 updateMtaSummary();
}
async function quote(){
 if(state.busy)return;
 try{
   const p=payload();state.busy=true;result('Requesting quote from Catalyst…');
   if(!global.BGStaffApi?.call)throw Error('Staff API adapter is not loaded.');
   const response=await global.BGStaffApi.call('quote',p);
   if(response?.error||response?.code||response?.ok===false)throw Error(response.message||response.error||response.code);
   if(!response?.quote)throw Error('Backend returned no quote. Check the response contract.');
   state.quote=response;state.payload=p;state.savedRevision=null;state.checkoutUrl='';
   result(response);const button=$('staff-mta-save');if(button)button.disabled=false; // Referred changes must also be saved for staff review; only payment is blocked.
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
   state.savedRevision=response.revision||response.revisions?.[0]||null;
   const payment=$('staff-mta-payment');if(payment)payment.disabled=!(state.quote?.quote?.payable&&state.savedRevision);
   const b=$('staff-mta-save');if(b)b.disabled=true;
 }catch(e){result(e.message||String(e),true);}
 finally{state.busy=false;}
}
async function payment(){
 const output=$('staff-mta-payment-result');
 if(state.busy||!state.savedRevision||!state.quote?.quote?.payable||!state.payload)return;
 if(!$('staff-mta-accepted')?.checked){if(output)output.textContent='Customer acceptance of the Code of Ethics and terms must be confirmed.';return;}
 try{
   if(JSON.stringify(payload())!==JSON.stringify(state.payload))throw Error('MTA details changed. Requote and save the revision again.');
   if(!global.confirm('Generate a test-mode Stripe Checkout link for this customer’s saved MTA revision?'))return;
   state.busy=true;if(output)output.textContent='Requesting secure Checkout link…';
   const result=await global.BGStaffApi.call('payment_link',{...state.payload,accepted:'yes'});
   if(result?.alreadyPaid){if(output)output.textContent='Already paid according to Stripe. Refresh the CRM record to view the authoritative payment status.';return;}
   const link=String(result?.checkoutUrl||'');
   if(!/^https:\/\/checkout\.stripe\.com\//.test(link))throw Error('The backend returned no valid Stripe Checkout URL.');
   state.checkoutUrl=link;
   if(output)output.innerHTML='<button type="button" class="button secondary" data-staff-addon="copy-mta-payment">Copy payment link</button> <button type="button" class="button secondary" data-staff-addon="open-mta-payment">Open Stripe Checkout</button>';
 }catch(e){if(output)output.textContent=String(e.message||e);}
 finally{state.busy=false;}
}
function validate(){const out=$('staff-discount-outcome');if(!out)return;if(state.waiver&&!state.reason)out.textContent='Choose a waiver reason.';else if(state.waiver&&state.reason==='Other'&&!state.note.trim())out.textContent='Add a note for Other.';else out.textContent='Inputs captured. Final eligibility, discount and pricing must be verified by the signed quote.';}
document.addEventListener('input',event=>{const f=event.target.dataset?.staffField;if(f&&Object.prototype.hasOwnProperty.call(state,f))state[f]=event.target.value;});
document.addEventListener('change',event=>{const f=event.target.dataset?.staffField;if(f&&Object.prototype.hasOwnProperty.call(state,f))state[f]=event.target.value;if(event.target.id==='staff-mta-type')specific();if(event.target.closest('#staff-addon-dialog')&&state.mode==='mta'&&event.target.id!=='staff-mta-accepted'){state.quote=null;state.payload=null;state.savedRevision=null;state.checkoutUrl='';const save=$('staff-mta-save'),pay=$('staff-mta-payment');if(save)save.disabled=true;if(pay)pay.disabled=true;const out=$('staff-mta-payment-result');if(out)out.textContent='The change was edited. Obtain a new quotation and save the revision before payment.';}if(event.target.closest('#staff-addon-dialog'))updateMtaSummary();});
document.addEventListener('click',event=>{
 const b=event.target.closest('[data-staff-addon]');if(!b)return;
 const a=b.dataset.staffAddon;
 if(a==='close'){$('staff-addon-dialog')?.close?.();return;}
 if(a==='validate-discount'){validate();return;}
 if(a==='copy-mta-payment'){if(state.checkoutUrl)navigator.clipboard?.writeText(state.checkoutUrl).catch(()=>{});return;}
 if(a==='open-mta-payment'){if(state.checkoutUrl)global.open(state.checkoutUrl,'_blank','noopener,noreferrer');return;}
 if(a==='payment-mta'){payment();return;}
 if(a==='cover'){loadCover();return;}
 if(a==='quote-mta'){quote();return;}
 if(a==='save-mta'){save();return;}
 if(a==='mta'||a==='discount'){const focus=global.BGCRM12?.getFocusedRecord?.();const record=focus?.record&&String(focus.record.id)===String(b.dataset.staffId)?focus.record:{id:b.dataset.staffId,Name:document.querySelector('.v12-record-head h2')?.textContent||'Selected record'};open(a,record,focus?.entity);}
});
global.BGStaffAddons={action,journeyPanel,open,quoteInputs:()=>({voucherCode:state.code.trim(),waivers:state.waiver?[{sku:state.waiver,reason:state.reason,note:state.note.trim()}]:[]})};
})(window);
