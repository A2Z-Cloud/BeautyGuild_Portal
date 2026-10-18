import React from 'react';
import {CheckCircle2,ShieldAlert} from 'lucide-react';
import {INTEGRATIONS,DATA_MODE} from '../services/api.js';

export default function IntegrationStatus(){
 const ready=[['Catalyst Authentication',INTEGRATIONS.catalystAuth],['GTi Courses (V1)',INTEGRATIONS.courses],['Loqate address search (V1)',INTEGRATIONS.address]];
 const blocked=['Verified CRM Contact ownership','CRM draft persistence for all three journeys','CRM record/dashboard access','Insurance pricing and referral','Stripe Checkout and policy activation','WorkDrive documents'];
 return <section className="surface padded integration-status"><h2>Connection status</h2><p>Current frontend integration mode: <strong>{DATA_MODE==='api'?'Configured API mode':'Demo mode'}</strong>. Each live adapter must be enabled explicitly.</p>
  <div className="integration-grid">{ready.map(([label,enabled])=><div key={label} className={enabled?'available':'pending'}>{enabled?<CheckCircle2 size={17}/>:<ShieldAlert size={17}/>}<span>{label}</span><strong>{enabled?'Enabled':'Disabled'}</strong></div>)}</div>
  <p className="integration-footnote">Enabled means the frontend is configured to attempt the service. It does not certify backend availability or user permissions.</p>
  <details><summary>Backend-owned functions still pending</summary><ul>{blocked.map(x=><li key={x}>{x}</li>)}</ul></details>
 </section>;
}
