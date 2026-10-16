import React from 'react';
import { Link } from 'react-router-dom';
import { Award, ArrowRight, BookOpen, CheckCircle2, FileText, ShieldCheck, UsersRound, Info } from 'lucide-react';
import { statusTone } from './data/fixtures';

const serviceIcons={membership:UsersRound,accreditation:Award,insurance:ShieldCheck,courses:BookOpen,documents:FileText};
export function ServiceIcon({service,size=23}){
  const Icon=serviceIcons[service]||Award;
  return <Icon size={size} strokeWidth={1.7} aria-hidden="true"/>;
}
export function Brand({compact=false}){
  return <div className="brand" aria-label="Beauty Guild member portal">
    <div className="brand-wordmark">beauty<span>guild</span></div>
    {!compact&&<div className="brand-caption">Member portal</div>}
  </div>;
}
export function Badge({children,tone='muted'}){
  return <span className={'badge badge-'+tone}>{children}</span>;
}
export function RecordBadge({status}){
  return <Badge tone={statusTone(status)}>{status}</Badge>;
}
export function Button({to,children,variant='primary',className='',...props}){
  const classes=['button','button-'+variant,className].filter(Boolean).join(' ');
  return to?<Link className={classes} to={to} {...props}>{children}</Link>:
    <button type="button" className={classes} {...props}>{children}</button>;
}
export function SectionTitle({title,subtitle,action}){
  return <div className="section-title"><div><h2>{title}</h2>{subtitle&&<p>{subtitle}</p>}</div>{action}</div>;
}
export function PageTitle({eyebrow,title,description,children}){
  return <div className="page-heading">
    <div><span className="eyebrow">{eyebrow}</span><h1>{title}</h1>{description&&<p>{description}</p>}</div>
    {children&&<div className="heading-actions">{children}</div>}
  </div>;
}
export function Panel({children,className=''}){return <section className={'panel '+className}>{children}</section>;}
export function EmptyState({title,description}){
  return <div className="empty-state"><Info size={25} aria-hidden="true"/><strong>{title}</strong><p>{description}</p></div>;
}
export function PreviewNotice({compact=false}){
  return <div className={compact?'preview-inline':'preview-notice'} role="status">
    {compact?<CheckCircle2 size={16} aria-hidden="true"/>:<Info size={18} aria-hidden="true"/>}
    <span><strong>Development preview · Fictional data.</strong> This frontend is not connected to CRM, authentication, payments or policy issuance.</span>
  </div>;
}
export function Field({label,name,error,hint,children,required=false}){
  return <div className={'field '+(error?'field-error':'')}>
    <label htmlFor={name}>{label}{required&&<span aria-label="required"> *</span>}</label>
    {children}
    {hint&&<small className="field-hint">{hint}</small>}
    {error&&<small className="field-message" id={name+'-error'} role="alert">{error}</small>}
  </div>;
}
export function FieldInput({name,label,error,value,onChange,required=false,type='text',hint,placeholder,autoComplete}){
  return <Field name={name} label={label} error={error} required={required} hint={hint}>
    <input id={name} name={name} className="input" type={type} value={value} placeholder={placeholder}
      autoComplete={autoComplete} aria-invalid={Boolean(error)} aria-describedby={error?name+'-error':undefined}
      onChange={e=>onChange(name,e.target.value)} />
  </Field>;
}
export function FieldSelect({name,label,error,value,onChange,options,required=false,hint}){
  return <Field name={name} label={label} error={error} required={required} hint={hint}>
    <select id={name} className="input" value={value} aria-invalid={Boolean(error)}
      aria-describedby={error?name+'-error':undefined} onChange={e=>onChange(name,e.target.value)}>
      <option value="">Select an option</option>
      {options.map(opt=><option key={opt.value||opt} value={opt.value||opt}>{opt.label||opt}</option>)}
    </select>
  </Field>;
}
export function FeatureLink({to,children}){
  return <Link to={to} className="text-link">{children}<ArrowRight size={16} aria-hidden="true"/></Link>;
}
