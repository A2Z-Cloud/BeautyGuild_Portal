import React,{useEffect,useRef,useState} from 'react';
import {MapPin,Search} from 'lucide-react';
import {portalApi} from '../services/api.js';

// Reads the verified V1 /address/find and /address/retrieve response shapes.
// It never overwrites user's manually entered data unless they select an address.
export default function AddressLookup({query,onSelect}){
  const [matches,setMatches]=useState([]),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  const requestRef=useRef(0);
  useEffect(()=>{setMatches([]);setError('');requestRef.current+=1;},[query]);
  async function search(queryValue,container){
    const sequence=++requestRef.current;
    setBusy(true);setError('');
    try{
      const results=await portalApi.findAddresses(queryValue,container);
      if(sequence===requestRef.current){
        setMatches(results);
        if(!results.length)setError('No addresses found. Enter the address manually.');
      }
    }catch(err){if(sequence===requestRef.current)setError(err.message||'Address lookup unavailable. Enter manually.');}
    finally{if(sequence===requestRef.current)setBusy(false);}
  }
  async function choose(item){
    const sequence=++requestRef.current;
    setBusy(true);setError('');
    try{
      if(item.Type&&item.Type!=='Address'){
        const results=await portalApi.findAddresses(item.Text||item.Description,item.Id);
        if(sequence===requestRef.current)setMatches(results);
      }else{
        const address=await portalApi.retrieveAddress(item.Id);
        if(sequence===requestRef.current){onSelect(address);setMatches([]);}
      }
    }catch(err){if(sequence===requestRef.current)setError(err.message||'Address retrieval unavailable. Enter manually.');}
    finally{if(sequence===requestRef.current)setBusy(false);}
  }
  return <div className="address-lookup">
    <button type="button" className="btn btn-secondary" disabled={busy||!String(query||'').trim()||String(query||'').trim().length<3} onClick={()=>search(String(query).trim())}>
      <Search size={15}/>{busy?'Searching addresses':'Find address'}
    </button>
    <span><MapPin size={14}/> Verified V1 Loqate API · manual entry is always available</span>
    {error&&<div className="address-search-error" role="alert">{error}</div>}
    {matches.length>0&&<div className="address-results" aria-label="Address suggestions">{matches.map((item,index)=>
      <button type="button" key={(item.Id||'')+index} onClick={()=>choose(item)} disabled={busy}>
        <strong>{item.Text||item.Description}</strong>{item.Description&&item.Text&&<small>{item.Description}</small>}
        {item.Type&&item.Type!=='Address'&&<small>Open address group</small>}
      </button>
    )}</div>}
  </div>;
}
