// Entirely fictional samples; they are never CRM, Stripe or policy records.
export const DEMO_MEMBER={name:'Alex Morgan',initials:'AM',email:'alex@example.test'};
export const SERVICES={
 membership:{eyebrow:'GUILD MEMBERSHIP',title:'Your membership',tagline:'Support for every stage of your professional journey.',intro:'Explore membership types and example records.',cta:'Explore membership'},
 accreditation:{eyebrow:'TRAINING CENTRE ACCREDITATION',title:'Manage your accreditations',tagline:'Your centres, courses and tutors in one place.',intro:'Browse example training centre applications.',cta:'Apply for accreditation'},
 insurance:{eyebrow:'BEAUTY GUILD INSURANCE',title:'Insurance for beauty professionals',tagline:'Flexible cover designed around how you work.',intro:'Explore the questionnaire or an illustrative quotation.',cta:'Get an insurance quote'}
};
export const RECORDS={
 membership:[{id:'mem-demo-001',title:'Full Member (Non-Salon)',ref:'MEM-DEMO-001',status:'Active',subtitle:'Beauty Therapy / Annual',updated:'10 October 2026',fields:{Level:'Full Member (Non-Salon)',Branch:'Beauty Therapy',Billing:'Annual',Expiry:'31 December 2026',Cover:'Illustrative only'}}],
 accreditation:[
  {id:'acc-demo-001',title:'Luna Beauty Academy',ref:'ACC-DEMO-001',status:'Accredited',subtitle:'Standard Accreditation / England',updated:'12 October 2026',fields:{Country:'England',Courses:'3 demonstration courses',Tutors:'2 example tutors',ValidTo:'30 June 2027',Status:'Verified example'}},
  {id:'acc-demo-002',title:'Willow Training Studio',ref:'ACC-DEMO-002',status:'Under review',subtitle:'Training centre / Wales',updated:'14 October 2026',fields:{Country:'Wales',Courses:'2 demonstration courses',Status:'Review example'}}
 ],
 insurance:[{id:'ins-demo-001',title:'Beauty Professional Quote',ref:'INS-DEMO-001',status:'Draft example',subtitle:'Non-Salon / Core treatment liability',updated:'15 October 2026',fields:{Route:'Non-Salon',Cover:'Core treatment liability',Payment:'Not connected',PolicyStatus:'No policy issued'}}]
};
export const ACTIVITY=[
 {title:'Training centre application example updated',when:'14 October',area:'Accreditation'},
 {title:'Membership renewal example',when:'10 October',area:'Membership'},
 {title:'Insurance quote preview',when:'9 October',area:'Insurance'}
];
export const DOCUMENTS=[{id:'doc-demo-1',name:'Membership certificate',area:'Membership'},{id:'doc-demo-2',name:'Accreditation certificate',area:'Accreditation'}];
export const INVOICES=[{id:'inv-demo-1',name:'Membership example invoice',ref:'INV-DEMO-001',amount:'Sample only'}];
export function statusTone(s=''){return /active|accredited/i.test(s)?'success':/review|pending/i.test(s)?'warning':'muted';}
