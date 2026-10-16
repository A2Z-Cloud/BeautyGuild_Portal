const choice=(name,label,options,required=true)=>({name,label,type:'radio',options:options.map(o=>typeof o==='string'?{value:o,label:o}:o),required});
const field=(name,label,type='text',required=true,more={})=>({name,label,type,required,...more});
export const JOURNEYS={
  membership:{
    title:'Membership', kicker:'BECOME A MEMBER',
    intro:'Explore membership options and enter your information in this interactive example.',
    steps:[
      {title:'Membership',description:'Choose the type of membership you would like to explore.',fields:[choice('plan','Membership option',['Guild Associate','Guild Professional','Guild International']),choice('working','How do you work?',['Self-employed','Employed','Training centre','Other'])]},
      {title:'Your details',description:'We will ask for verified contact information once the backend is connected.',fields:[field('name','Full name'),field('email','Email address','email'),field('business','Business or trading name','text',false),field('postcode','Postcode')]},
      {title:'Review',description:'Check your details before the live submission and payment stage.',fields:[field('accept','I understand this is a demonstration and no membership will be created.','checkbox')]},
    ],
  },
  accreditation:{
    title:'Accreditation', kicker:'TRAINING CENTRE ACCREDITATION',
    intro:'Explore the centre application journey. Centre location determines the accreditation route.',
    steps:[
      {title:'Centre',description:'Tell us about the training centre you want to accredit.',fields:[field('centre','Training centre name'),field('country','Training centre country','select',true,{options:['United Kingdom','England','Scotland','Wales','Northern Ireland','Ireland','France','Spain','Other']}),field('postcode','Training centre postcode or postal code'),field('contact','Main contact name')]},
      {title:'Training',description:'Provide an example of your training provision.',fields:[choice('delivery','How do you deliver courses?',['In person','Online','Both']),field('course','Primary course title'),field('tutors','Number of tutors','number'),field('notes','Additional information','textarea',false)]},
      {title:'Review',description:'The live application will verify membership and accreditation eligibility.',fields:[field('accept','I understand this is only a demonstration and no accreditation will be awarded.','checkbox')]},
    ],
  },
  insurance:{
    title:'Insurance', kicker:'BUSINESS INSURANCE',
    intro:'Try the insurance questionnaire and see how the cover selection journey is presented.',
    steps:[
      {title:'Business',description:'Tell us about your business. No information is sent to an insurer.',fields:[choice('route','What best describes your business?',[{value:'individual',label:'Individual practitioner'},{value:'salon',label:'Salon or business premises'}]),field('business','Trading name'),field('postcode','Business postcode'),field('turnover','Approximate annual turnover (£)','number',true)]},
      {title:'Cover',description:'Select the cover options you wish to explore in this example.',fields:[choice('liability','Include Public Liability?', ['Yes','No']),choice('employees','Do you employ other people?', ['Yes','No']),choice('contents','Would you like to explore contents cover?',['Yes','No'])]},
      {title:'Declarations',description:'Answer the preview statements. Real underwriting checks are not connected.',fields:[choice('claims','Have you had insurance claims in the last five years?',['Yes','No']),choice('qualified','Do you hold appropriate qualifications for your treatments?',['Yes','No']),field('accept','I understand no premium, underwriting decision or insurance cover is provided in this preview.','checkbox')]},
      {title:'Review',description:'Review your answers. Live pricing and checkout require a backend connection.',fields:[]},
    ],
  },
};
