import test from 'node:test';
import assert from 'node:assert/strict';
import {clearStored,readStored,writeStored} from './storedState.js';

function fakeStorage(){
  const data=new Map();
  return {get length(){return data.size;},key:i=>[...data.keys()][i]??null,getItem:k=>data.has(k)?data.get(k):null,setItem:(k,v)=>data.set(k,String(v)),removeItem:k=>data.delete(k),data};
}
test('answers come back after leaving to sign in, merged over the defaults',()=>{
  const s=fakeStorage();
  assert.deepEqual(readStored('membership',{level:'',billing:'annual'},s),{level:'',billing:'annual'});
  writeStored('membership',{level:'associate',branch:'beauty'},s);
  assert.deepEqual(readStored('membership',{level:'',billing:'annual'},s),{level:'associate',billing:'annual',branch:'beauty'});
});
test('damaged or blocked storage falls back to the defaults and never throws',()=>{
  const s=fakeStorage();s.setItem('bg_buy_membership','{not json');
  assert.deepEqual(readStored('membership',{a:1},s),{a:1});
  const blocked={getItem(){throw new Error('blocked');},setItem(){throw new Error('blocked');},length:0};
  assert.deepEqual(readStored('x',{a:2},blocked),{a:2});
  assert.doesNotThrow(()=>writeStored('x',{a:3},blocked));
  assert.doesNotThrow(()=>clearStored(blocked));
});
test('clearing removes only the buy answers, once payment has gone through',()=>{
  const s=fakeStorage();
  writeStored('membership',{a:1},s);writeStored('membership_insurance',{b:2},s);s.setItem('something_else','keep');
  clearStored(s);
  assert.deepEqual([...s.data.keys()],['something_else']);
});
