'use strict';
const express=require('express');
const {HttpError}=require('./errors');
const {resolveContact,DEFINITIONS,createCrmClient}=require('./records');
const ID=/^\d{10,25}$/;
const FOLDER=/^[A-Za-z0-9_-]{1,100}$/;
const MAX_DOWNLOAD=20*1024*1024;
function folderIdFromLink(value){
 if(typeof value!=='string'||!value.trim())return null;
 try {
   const u=new URL(value);
   if(!/^([a-z0-9-]+\.)?workdrive\.zoho\.[a-z.]+$/i.test(u.hostname))return null;
   const parts=u.pathname.split('/').filter(Boolean);
   const candidate=parts.at(-1);
   return FOLDER.test(candidate)?candidate:null;
 }catch{return null;}
}
function parsePath(input){
 if(!input)return [];
 if(typeof input!=='string')throw new HttpError(400,'INVALID_PATH','Invalid folder path.');
 const p=input.split('.');
 if(p.length>8 || p.some(x=>!FOLDER.test(x)))throw new HttpError(400,'INVALID_PATH','Invalid folder path.');
 return p;
}
function registerDocumentRoutes(app,{enabled,getCurrentUser,getCrmHeaders,getWorkdriveHeaders,crmApiDomain,workdriveApiDomain,fetchImpl=fetch}){
 const router=express.Router(),crm=createCrmClient({getCrmHeaders,crmApiDomain,fetchImpl});
 const workdrive=async(req,path)=>{
   let r;
   try{r=await fetchImpl(workdriveApiDomain+'/workdrive/api/v1/'+path,{headers:await getWorkdriveHeaders(req),signal:AbortSignal.timeout(12000)});}
   catch{throw new HttpError(502,'DOCUMENT_UNAVAILABLE','Documents are unavailable.');}
   return r;
 };
 const safe=fn=>async(req,res,next)=>{try{await fn(req,res);}catch(e){next(e);}};
 async function children(req,folder){
   const r=await workdrive(req,'files/'+encodeURIComponent(folder)+'/files');
   if(!r.ok)throw new HttpError(502,'DOCUMENT_UNAVAILABLE','Documents are unavailable.');
   const data=await r.json().catch(()=>null);
   if(!Array.isArray(data?.data))throw new HttpError(502,'DOCUMENT_UNAVAILABLE','Documents are unavailable.');
   return data.data.map(x=>({
     id:String(x.id||''),name:String(x.attributes?.name||'Untitled'),
     isFolder:x.attributes?.is_folder===true||x.attributes?.type==='folder',
     modifiedAt:x.attributes?.modified_time||null
   })).filter(x=>FOLDER.test(x.id));
 }
 async function authorisedRoot(req){
   const {kind,id}=req.params;
   if(!ID.test(id)||!DEFINITIONS[kind])throw new HttpError(404,'NOT_FOUND','Record not found.');
   const d=DEFINITIONS[kind],result=await crm.call(req,d.module+'/'+id+'?fields='+encodeURIComponent(d.owner+',Workdrive_Link'));
   const row=result[0];
   if(!row || !row[d.owner]?.id || String(row[d.owner]?.id)!==String(req.portalContact.id))throw new HttpError(404,'NOT_FOUND','Record not found.');
   return folderIdFromLink(row.Workdrive_Link);
 }
 async function verifiedFolder(req,root){
   let current=root;
   for(const id of parsePath(req.query.path)){
     const items=await children(req,current);
     if(!items.some(x=>x.id===id && x.isFolder))throw new HttpError(404,'NOT_FOUND','Folder not found.');
     current=id;
   }
   return current;
 }
 router.use(async(req,res,next)=>{
   try{
     if(!enabled)throw new HttpError(503,'DOCUMENTS_DISABLED','Document access is not configured.');
     const user=await getCurrentUser(req);
     req.portalContact=await resolveContact(req,crm.call,user);
     next();
   }catch(e){next(e);}
 });
 router.get('/:kind/:id',safe(async(req,res)=>{
   const root=await authorisedRoot(req);
   if(!root)return res.json({items:[],folderId:null,message:'There are no documents for this record yet.'});
   const folder=await verifiedFolder(req,root);
   res.json({folderId:folder,items:await children(req,folder)});
 }));
 router.get('/:kind/:id/file/:fileId',safe(async(req,res)=>{
   const {fileId}=req.params;
   if(!FOLDER.test(fileId))throw new HttpError(404,'NOT_FOUND','File not found.');
   const root=await authorisedRoot(req);
   if(!root)throw new HttpError(404,'NOT_FOUND','File not found.');
   const folder=await verifiedFolder(req,root);
   const allowed=(await children(req,folder)).find(x=>x.id===fileId&&!x.isFolder);
   if(!allowed)throw new HttpError(404,'NOT_FOUND','File not found.');
   const r=await workdrive(req,'download/'+encodeURIComponent(fileId));
   if(!r.ok)throw new HttpError(502,'DOCUMENT_UNAVAILABLE','Document cannot be downloaded.');
   const length=Number(r.headers.get('content-length')||0);
   if(length>MAX_DOWNLOAD)throw new HttpError(413,'FILE_TOO_LARGE','This file is too large to download.');
   if(!r.body || typeof r.body.getReader!=='function')throw new HttpError(502,'DOCUMENT_UNAVAILABLE','Document stream is unavailable.');
   const reader=r.body.getReader();
   let bytes=0;const parts=[];
   try{
     while(true){const {done,value}=await reader.read();if(done)break;
       bytes+=value.length;if(bytes>MAX_DOWNLOAD){await reader.cancel();throw new HttpError(413,'FILE_TOO_LARGE','This file is too large to download.');}
       parts.push(Buffer.from(value));
     }
   }finally{reader.releaseLock();}
   const payload=Buffer.concat(parts,bytes);
   const contentType=r.headers.get('content-type')||'application/octet-stream';
   res.set('Content-Type',/^(application\/pdf|image\/png|image\/jpeg)$/i.test(contentType)?contentType:'application/octet-stream');
   res.set('Content-Disposition',"attachment; filename*=UTF-8''"+encodeURIComponent(allowed.name.replace(/[\r\n]/g,'').slice(0,120)));
   res.send(payload);
 }));
 app.use('/portal/documents',router);
}
module.exports={registerDocumentRoutes,folderIdFromLink,parsePath};
