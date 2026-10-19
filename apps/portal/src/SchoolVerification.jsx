import React,{useState} from 'react';
import {Copy,Check,QrCode} from 'lucide-react';
import {Notice} from './UiParts.jsx';
import {SchoolResult} from './PublicSchoolVerification.jsx';

// How the school looks when someone checks its accreditation, plus the permanent link to share.
export function publicLink(number){
  return window.location.origin+import.meta.env.BASE_URL+'#/verify/'+encodeURIComponent(number);
}
export default function SchoolVerification({data}){
  const number=data.school.registrationNumber;
  const [copied,setCopied]=useState(false);
  async function copy(){
    try{await navigator.clipboard.writeText(publicLink(number));setCopied(true);setTimeout(()=>setCopied(false),2000);}catch{setCopied(false);}
  }
  const shown={...data,school:{...data.school,registrationNumber:number||'Not issued yet'}};
  return <><h2>Verification</h2>
    <p>Anyone can check whether your school is currently accredited using your School Registration Number. This is exactly what they will see.</p>
    <div className="school-verify-preview"><SchoolResult data={shown}/></div>
    <div className="school-verify-share">
      <h3>Your public link</h3>
      {number?<><div className="school-verify-input-row"><input readOnly value={publicLink(number)} aria-label="Public verification link" onFocus={e=>e.target.select()}/>
        <button type="button" className="btn btn-secondary" onClick={copy}>{copied?<><Check size={16}/> Copied</>:<><Copy size={16}/> Copy link</>}</button></div>
        <small>Share this link, or print it on certificates. It always shows your current status.</small></>
      :<Notice title="Registration number not issued yet">Your School Registration Number has not been issued yet. Your public link will appear here as soon as it is.</Notice>}
      <div className="school-verify-qr" aria-label="QR code"><QrCode size={34}/><strong>QR code coming soon</strong><span>It will open your public link, so it can be printed on certificates.</span></div>
    </div></>;
}
