'use strict';
const express=require('express');
const crypto=require('node:crypto');
const {HttpError}=require('./errors');
const ID=/^\d{10,25}$/;
const ALLOWED=new Set(['membership','accreditation','insurance']);
function money(row){
 const amount=Number(row.Amount_Pence);
 if(!Number.isSafeInteger(amount)||amount<50||amount>10000000)throw new HttpError(409,'PRICE_UNVERIFIED','A valid server-approved amount is required.');
 return amount;
}
function owned(row,user){
 if(!row||String(row.Owner_User_ID)!==String(user.id))throw new HttpError(404,'NOT_FOUND','Quote not found.');
 return row;
}
function normalise(row){
 return {id:String(row.ROWID),service:row.Service,decision:row.Decision,status:row.Status,
   amountPence:row.Status==='APPROVED'?money(row):null,currency:'GBP',
   taxPence:row.Status==='APPROVED'?Number(row.Tax_Pence||0):null,
   updatedAt:row.Updated_At||null};
}
function verifyStripe(payload,signature,secret,now=Date.now()){
 if(!secret || typeof signature!=='string')return false;
 const parts=Object.fromEntries(signature.split(',').map(s=>s.trim().split('=',2)));
 const timestamp=Number(parts.t),sig=parts.v1;
 if(!Number.isSafeInteger(timestamp)||Math.abs(now-timestamp*1000)>300000||!sig||!/^[\da-f]{64}$/i.test(sig))return false;
 const digest=crypto.createHmac('sha256',secret).update(timestamp+'.'+payload).digest('hex');
 return crypto.timingSafeEqual(Buffer.from(digest,'hex'),Buffer.from(sig,'hex'));
}
function registerBillingRoutes(app,{enabled,getCurrentUser,getQuoteTable,getPaymentTable,stripeKey,webhookSecret,publicOrigin,fetchImpl=fetch}){
 const router=express.Router(),send=fn=>async(req,res,next)=>{try{await fn(req,res);}catch(e){next(e);}};
 const active=(req,res,next)=>{
  if(!enabled) return next(new HttpError(503,'BILLING_DISABLED','Billing is not configured.'));
  next();
 };
 // Webhooks must be verified against the unmodified payload and must not require a browser session.
 app.post('/portal/stripe/webhook',active,express.raw({type:'application/json',limit:'250kb'}),send(async(req,res)=>{
  const payload=req.body.toString('utf8');
  if(!verifyStripe(payload,req.get('stripe-signature'),webhookSecret))throw new HttpError(400,'SIGNATURE_INVALID','Webhook signature invalid.');
  let event;try{event=JSON.parse(payload);}catch{throw new HttpError(400,'INVALID_REQUEST','Invalid event.');}
  if(event.type!=='checkout.session.completed' && event.type!=='checkout.session.async_payment_succeeded')return res.json({received:true});
  const session=event.data?.object;
  if(session?.payment_status!=='paid' || !ID.test(String(session?.metadata?.paymentRowId||'')))return res.json({received:true});
  const table=await getPaymentTable(req);
  const row=await table.getRow(String(session.metadata.paymentRowId));
  if(!row || row.Stripe_Session_ID!==session.id || row.Status==='PAID')return res.json({received:true});
  await table.updateRow({ROWID:row.ROWID,Status:'PAID',Updated_At:new Date().toISOString()});
  // CRM activation / policy issuance must run only after a separately authorised reconciliation.
  return res.json({received:true});
 }));
 router.use(express.json({limit:'20kb'}));
 router.use(active,send(async(req,res,next)=>{
  const user=await getCurrentUser(req);
  if(!user?.id)throw new HttpError(401,'SIGN_IN_REQUIRED','Sign in to continue.');
  req.portalUser=user;
  next();
 }));
 router.get('/quotes/:id',send(async(req,res)=>{
  if(!ID.test(req.params.id))throw new HttpError(404,'NOT_FOUND','Quote not found.');
  const row=owned(await (await getQuoteTable(req)).getRow(req.params.id),req.portalUser);
  if(!ALLOWED.has(row.Service))throw new HttpError(404,'NOT_FOUND','Quote not found.');
  res.json({quote:normalise(row)});
 }));
 router.post('/checkout',send(async(req,res)=>{
  const id=String(req.body?.quoteId||'');
  if(!ID.test(id))throw new HttpError(422,'INVALID_QUOTE','Choose a quote.');
  if(!stripeKey || !webhookSecret || !/^https:\/\/[a-z0-9.-]+$/i.test(publicOrigin||''))throw new HttpError(503,'CHECKOUT_UNAVAILABLE','Checkout is not configured.');
  const quote=owned(await (await getQuoteTable(req)).getRow(id),req.portalUser);
  if(!ALLOWED.has(quote.Service) || quote.Status!=='APPROVED' || quote.Decision!=='PASS')throw new HttpError(409,'QUOTE_NOT_PAYABLE','The quote is not approved for online payment.');
  const amount=money(quote),paymentTable=await getPaymentTable(req);
  // Payment row is created first; it is the durable idempotency anchor for the Stripe session.
  const payment=await paymentTable.insertRow({Owner_User_ID:req.portalUser.id,Quote_ID:id,
    Status:'PENDING',Amount_Pence:amount,Updated_At:new Date().toISOString()});
  const params=new URLSearchParams({
    mode:'payment','line_items[0][price_data][currency]':'gbp',
    'line_items[0][price_data][unit_amount]':String(amount),
    'line_items[0][price_data][product_data][name]':'Beauty Guild '+quote.Service,
    'line_items[0][quantity]':'1',
    success_url:publicOrigin+'/app/#/payment-return?result=success',
    cancel_url:publicOrigin+'/app/#/payment-return?result=cancelled',
    client_reference_id:id,'metadata[paymentRowId]':String(payment.ROWID)
  });
  let response;
  try{response=await fetchImpl('https://api.stripe.com/v1/checkout/sessions',{
    method:'POST',headers:{Authorization:'Bearer '+stripeKey,'Content-Type':'application/x-www-form-urlencoded',
      'Idempotency-Key':'portal-quote-'+id+'-payment-'+payment.ROWID},body:params,signal:AbortSignal.timeout(15000)});
  }catch{throw new HttpError(502,'PAYMENT_UNAVAILABLE','Secure checkout is unavailable.');}
  const session=await response.json().catch(()=>null);
  if(!response.ok || !session?.id || typeof session.url!=='string' || !session.url.startsWith('https://checkout.stripe.com/'))
    throw new HttpError(502,'PAYMENT_UNAVAILABLE','Secure checkout is unavailable.');
  await paymentTable.updateRow({ROWID:payment.ROWID,Stripe_Session_ID:session.id,Status:'PENDING'});
  res.status(201).json({checkoutUrl:session.url,paymentId:String(payment.ROWID)});
 }));
 app.use('/portal/billing',router);
}
module.exports={registerBillingRoutes,verifyStripe,money,owned,normalise};
