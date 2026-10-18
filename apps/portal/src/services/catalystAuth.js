import {IntegrationUnavailableError} from './legacy.mjs';

// SDK must be served by your configured Catalyst hosting environment.
// The auth methods here use the documented Catalyst Web SDK, never a DIY login HTTP endpoint.
function sdk(){
  if(typeof window==='undefined')throw new IntegrationUnavailableError('Catalyst authentication');
  const auth=window.catalyst?.auth;
  if(!auth)throw new IntegrationUnavailableError('Catalyst Web SDK is not initialised');
  return auth;
}
function redirectUrl(){
  return window.location.origin+import.meta.env.BASE_URL;
}
export function createCatalystAuth(enabled){
  const requireSDK=()=>{if(!enabled)throw new IntegrationUnavailableError('Catalyst authentication');return sdk();};
  return Object.freeze({
    get ready(){return enabled && typeof window!=='undefined' && Boolean(window.catalyst?.auth);},
    async currentUser(){
      const result=await requireSDK().isUserAuthenticated();
      const user=result?.content;
      if(!user?.user_id)throw new IntegrationUnavailableError('Authenticated Catalyst app user');
      return {userId:String(user.user_id),email:user.email_id||'',firstName:user.first_name||'',lastName:user.last_name||''};
    },
    signInEmbed(containerId){
      requireSDK().signIn(containerId,{redirect_url:import.meta.env.BASE_URL});
    },
    async signUp({firstName,lastName,email}){
      if(!firstName?.trim()||!lastName?.trim()||!email?.trim())throw new Error('Name and email address are required.');
      // Catalyst sends an invite/verification email; no frontend password is stored or sent.
      return requireSDK().signUp({
        first_name:firstName.trim(),last_name:lastName.trim(),email_id:email.trim(),
        platform_type:'web',redirect_url:redirectUrl()
      });
    },
    signOut(){
      requireSDK().signOut(redirectUrl());
      // On Slate, frontend signOut does not invalidate backend cookies on another origin.
    },
  });
}
