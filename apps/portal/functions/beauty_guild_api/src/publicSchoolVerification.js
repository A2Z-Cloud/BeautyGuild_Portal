'use strict';
const express=require('express');
const {HttpError}=require('./errors');
const {createRateLimiter}=require('./rateLimit');

const REGISTRATION_RE=/^[A-Za-z0-9][A-Za-z0-9_-]{0,39}$/;
const FIELD_RE=/^[A-Za-z][A-Za-z0-9_]{0,79}$/;
const toStatus=x=>String(x||'').trim().toLowerCase();
const safeDate=x=>{
  if(typeof x!=='string'||! /^\d{4}-\d{2}-\d{2}$/.test(x))return null;
  const d=new Date(x+'T00:00:00.000Z');
  return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===x?x:null;
};
function assess(rows,today,activeStatus='Verified'){
  const records=rows.map(r=>({
    status:toStatus(r.Accreditation_Status),stage:toStatus(r.Application_Stage),
    from:safeDate(r.Valid_From),to:safeDate(r.Valid_To)
  }));
  // Do not resurrect an earlier Verified record while suspension/revocation is
  // present. CRM reinstatement must explicitly clear/archive historic holds.
  if(records.some(x=>['revoked','withdrawn','cancelled'].includes(x.status)))
    return {status:'revoked',isCurrentlyAccredited:false,expiryDate:null};
  if(records.some(x=>['suspended','suspension'].includes(x.status)))
    return {status:'suspended',isCurrentlyAccredited:false,expiryDate:null};
  const active=records.filter(x=>x.status===toStatus(activeStatus)&&
    x.stage!=='draft'&&x.stage!=='awaiting payment'&&
    x.from&&x.to&&x.from<=today&&x.to>=today);
  if(active.length)return {status:'accredited',isCurrentlyAccredited:true,
    expiryDate:active.map(x=>x.to).sort().at(-1)};
  const expired=records.filter(x=>x.to&&x.to<today&&
    (x.status===toStatus(activeStatus)||x.status==='expired'));
  if(expired.length)return {status:'expired',isCurrentlyAccredited:false,
    expiryDate:expired.map(x=>x.to).sort().at(-1)};
  return {status:records.some(x=>x.status==='expired')?'expired':'not_accredited',
    isCurrentlyAccredited:false,expiryDate:null};
}

function registerPublicSchoolVerification(app,{
  enabled=false,registrationModule='Accounts',registrationField='',
  activeStatus='Verified',getCrmHeaders,crmApiDomain,fetchImpl=fetch,now=Date.now,
  limit=30,windowMs=60000
}={}){
  const router=express.Router();
  const allowed=createRateLimiter({limit,windowMs,now});
  const unavailable=()=>new HttpError(503,'VERIFICATION_UNAVAILABLE','School verification is temporarily unavailable.');
  router.use((req,res,next)=>{
    if(!enabled||!['Accounts','Training_Centres'].includes(registrationModule)||
      !FIELD_RE.test(registrationField)||!String(activeStatus).trim())return next(unavailable());
    // Best-effort per-instance limiter. Require an edge/WAF rate limit in production.
    if(!allowed(req.ip||req.socket.remoteAddress||'unknown'))
      return next(new HttpError(429,'RATE_LIMIT','Too many verification attempts. Please try again later.'));
    next();
  });
  async function crmSearch(req,module,criteria,fields){
    try{
      const headers=await getCrmHeaders(req);
      const url=crmApiDomain+'/crm/v3/'+module+'/search?criteria='+encodeURIComponent(criteria)+
        '&fields='+encodeURIComponent(fields.join(','))+'&per_page=200';
      const response=await fetchImpl(url,{headers,signal:AbortSignal.timeout(10000)});
      if(response.status===204)return [];
      if(!response.ok)throw unavailable();
      const result=await response.json();
      if(!Array.isArray(result?.data)||result.info?.more_records||result.data.length>=200)throw unavailable();
      return result.data;
    }catch{throw unavailable();}
  }
  router.get('/:number',async(req,res,next)=>{
    try{
      const number=String(req.params.number||'').trim();
      if(!REGISTRATION_RE.test(number))
        throw new HttpError(400,'INVALID_SCHOOL_NUMBER','Enter a valid school registration number.');
      const accountSource=registrationModule==='Accounts';
      const fields=accountSource?[registrationField,'Account_Name']:[registrationField,'Name','Account'];
      const schools=await crmSearch(req,registrationModule,
        '('+registrationField+':equals:'+number+')',fields);
      const matches=schools.filter(s=>{
        if(!(registrationField in s))throw unavailable();
        return toStatus(s[registrationField])===toStatus(number);
      });
      if(!matches.length)throw new HttpError(404,'SCHOOL_NOT_FOUND','No school was found for this registration number.');
      if(matches.length!==1)throw unavailable();
      const school=matches[0];
      const accountId=accountSource?school.id:school.Account?.id;
      const schoolName=accountSource?school.Account_Name:school.Name;
      if(!/^\d{10,25}$/.test(String(accountId||''))||!String(schoolName||'').trim())throw unavailable();
      const acc=await crmSearch(req,'Training_Centre_Accred',
        '(Account:equals:'+accountId+')',
        ['Account','Accreditation_Status','Application_Stage','Valid_From','Valid_To','Modified_Time']);
      // Re-check lookup ownership: never let fuzzy CRM criteria match another school.
      if(acc.some(a=>String(a.Account?.id||'')!==String(accountId)))throw unavailable();
      const stamp=new Date(now()).toISOString();
      return res.json({school:{registrationNumber:number,name:String(schoolName).trim()},
        verification:{...assess(acc,stamp.slice(0,10),activeStatus),checkedAt:stamp}});
    }catch(error){
      next(error instanceof HttpError?error:unavailable());
    }
  });
  app.use('/public/verify',router);
}
module.exports={registerPublicSchoolVerification,assess,REGISTRATION_RE,safeDate};
