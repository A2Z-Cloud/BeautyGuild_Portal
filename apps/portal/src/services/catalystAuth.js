import {IntegrationUnavailableError} from './legacy.mjs';

let readyPromise;
function loadScript(src){
  return new Promise((resolve,reject)=>{
    const existing=[...document.scripts].find(s=>s.src===new URL(src,window.location.origin).href);
    if(existing?.dataset.loaded==='true')return resolve();
    const script=existing||document.createElement('script');
    const done=()=>{script.dataset.loaded='true';resolve();};
    const fail=()=>reject(new IntegrationUnavailableError('Catalyst Web SDK loading'));
    script.addEventListener('load',done,{once:true});
    script.addEventListener('error',fail,{once:true});
    if(!existing){script.src=src;script.async=false;document.head.appendChild(script);}
  });
}
async function sdk(){
  if(typeof window==='undefined'||typeof document==='undefined')throw new IntegrationUnavailableError('Catalyst browser runtime');
  if(window.catalyst?.auth)return window.catalyst.auth;
  if(!readyPromise)readyPromise=(async()=>{
    await loadScript('https://static.zohocdn.com/catalyst/sdk/js/4.6.1/catalystWebSDK.js');
    await loadScript('/__catalyst/sdk/init.js');
    if(!window.catalyst?.auth)throw new IntegrationUnavailableError('Catalyst Authentication SDK');
    return window.catalyst.auth;
  })().catch(e=>{readyPromise=undefined;throw e;});
  return readyPromise;
}
function redirectUrl(){return window.location.origin+import.meta.env.BASE_URL;}
export function createCatalystAuth(enabled){
  const requireSDK=async()=>{if(!enabled)throw new IntegrationUnavailableError('Catalyst authentication');return sdk();};
  return Object.freeze({
    get configured(){return enabled;},
    async currentUser(){
      const auth=await requireSDK();
      const result=await auth.isUserAuthenticated();
      const user=result?.content;
      if(!user?.user_id)throw new IntegrationUnavailableError('Authenticated Catalyst app user');
      return {userId:String(user.user_id),email:user.email_id||'',firstName:user.first_name||'',lastName:user.last_name||''};
    },
    async signInEmbed(containerId){
      const auth=await requireSDK();
      return auth.signIn(containerId,{redirect_url:import.meta.env.BASE_URL});
    },
    async signUp({firstName,lastName,email}){
      if(!firstName?.trim()||!lastName?.trim()||!email?.trim())throw new Error('Name and email are required.');
      const auth=await requireSDK();
      return auth.signUp({first_name:firstName.trim(),last_name:lastName.trim(),email_id:email.trim(),
        platform_type:'web',redirect_url:redirectUrl()});
    },
    async signOut(){
      const auth=await requireSDK();
      auth.signOut(redirectUrl());
      // On Slate, cross-origin backend session invalidation needs an agreed backend mechanism.
    },
  });
}
