/* Staff-assisted MTA and discounts UI. The browser is never a pricing or payment authority. */
(function(global){
'use strict';
const esc = v => String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const state={mode:null,record:null,contactId:null,code:'',waiver:'',reason:'',note:'',error:''};
const reasons=['Goodwill Gesture','Complaint','Upgrade','Promotion','Payment Problem','Other'];
const eligible=[['','No waiver'],['MEM-JOIN','Joining fee'],['EXTRA','Eligible one-off extra'],['BRANCH','Additional branch'],['FEE-MTA','MTA fee (subject to configuration)']];
function action(entity,record){
 if(entity!=='Insurance_Policy'&&entity!=='Deals'&&entity!=='Membership')return '';
 const policy=entity==='Insurance_Policy';
 return '<button type="button" class="button secondary" data-staff-addon="'+(policy?'mta':'discount')+'" data-staff-id="'+esc(record.id)+'">'+(policy?'Manage changes (MTA)':'Voucher / waiver')+'</button>';
}
function journeyPanel(kind){
 if(kind!=='membership')return '';
 return '<section class="staff-addon-panel" aria-label="Staff pricing inputs"><h3>Referral codes, vouchers and waivers</h3><p>These are staff quote inputs only. No discount is applied until the authorised Catalyst quote confirms it.</p><label for="staff-code">Referral or voucher code</label><input id="staff-code" data-staff-field="code" autocomplete="off" value="'+esc(state.code)+'" placeholder="Enter code" /><label for="staff-waiver">Staff waiver</label><select id="staff-waiver" data-staff-field="waiver">'+eligible.map(([v,label])=>'<option value="'+esc(v)+'"'+(v===state.waiver?' selected':'')+'>'+esc(label)+'</option>').join('')+'</select><label for="staff-reason">Reason</label><select id="staff-reason" data-staff-field="reason"><option value="">Select a reason</option>'+reasons.map(v=>'<option'+(v===state.reason?' selected':'')+'>'+esc(v)+'</option>').join('')+'</select><label for="staff-note">Additional note</label><textarea id="staff-note" data-staff-field="note" rows="2">'+esc(state.note)+'</textarea><p class="staff-addon-info">Insurance premiums, IPT, accreditation fees and membership subscriptions cannot be discounted. Bespoke voucher redemption is unavailable until the Creator usage-history reader is enabled.</p><button type="button" class="button secondary" data-staff-addon="validate-discount">Check inputs</button><output id="staff-discount-outcome" aria-live="polite"></output></section>';
}
function open(mode,record){
 state.mode=mode;state.record=record;state.error='';
 let modal=document.getElementById('staff-addon-dialog');
 if(!modal){modal=document.createElement('dialog');modal.id='staff-addon-dialog';modal.className='staff-addon-dialog';document.body.appendChild(modal);}
 const name=record?.Name||record?.Policy_Number||record?.Deal_Name||'Selected record';
 const isMta=mode==='mta';
 modal.innerHTML='<div class="staff-addon-head"><div><small>STAFF WORKSPACE</small><h2>'+(isMta?'Mid-term adjustment':'Voucher / waiver')+'</h2><p>'+esc(name)+'</p></div><button type="button" class="button secondary" data-staff-addon="close">Close</button></div>'+
 (isMta?'<p>Use the existing insurance policy and effective date to begin a change. The live cover must not be modified by this screen.</p><dl class="staff-addon-details"><dt>Policy</dt><dd>'+esc(record?.Policy_Number||record?.Name||record?.id)+'</dd><dt>Status</dt><dd>'+esc(record?.Policy_Status||'Not recorded')+'</dd><dt>Cover end</dt><dd>'+esc(record?.Policy_End_Date||'Not recorded')+'</dd></dl><label for="staff-effective-date">Proposed effective date</label><input type="date" id="staff-effective-date" /><p class="staff-addon-info">Quote and revision saving require the deployed signed Staff API. Do not change active cover or mark this policy paid here.</p><button type="button" class="button primary" disabled title="Requires staff MTA adapter and verified server pricing">Get live MTA quote · Integration pending</button>':journeyPanel('membership'));
 if(typeof modal.showModal==='function')modal.showModal();else modal.setAttribute('open','');
}
function validate(){
 const result=document.getElementById('staff-discount-outcome');if(!result)return;
 if(state.waiver&&!state.reason){result.textContent='Choose a reason for the waiver.';return;}
 if(state.waiver&&state.reason==='Other'&&!state.note.trim()){result.textContent='Enter a note when the reason is Other.';return;}
 result.textContent='Inputs recorded for this browser session. A signed staff quote is still required to validate eligibility and calculate the discount.';
}
document.addEventListener('input',e=>{const f=e.target.dataset?.staffField;if(f&&Object.hasOwn(state,f))state[f]=e.target.value;});
document.addEventListener('change',e=>{const f=e.target.dataset?.staffField;if(f&&Object.hasOwn(state,f))state[f]=e.target.value;});
document.addEventListener('click',e=>{
 const button=e.target.closest('[data-staff-addon]');if(!button)return;
 const a=button.dataset.staffAddon;
 if(a==='close'){const d=document.getElementById('staff-addon-dialog');if(d?.close)d.close();else d?.removeAttribute('open');return;}
 if(a==='validate-discount'){validate();return;}
 if(a==='mta'||a==='discount'){
   const rec=global.BGStaffAddons?.recordLookup?.(button.dataset.staffId);
   if(rec)open(a,rec);else{const out=document.getElementById('contentArea');const p=out?.querySelector('.v12-record-head h2');open(a,{id:button.dataset.staffId,Name:p?.textContent||'Selected record'});}
 }
});
global.BGStaffAddons={action,journeyPanel,open,quoteInputs:()=>({voucherCode:state.code.trim(),waivers:state.waiver?[{sku:state.waiver,reason:state.reason,note:state.note.trim()}]:[]})};
})(window);
