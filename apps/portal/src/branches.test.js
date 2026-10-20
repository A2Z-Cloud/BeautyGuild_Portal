import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {BRANCHES,LECTURERS_BRANCH,branchName} from './branches.js';

test('each branch has its Guild logo, a real file, and the Lecturers branch is kept apart',()=>{
  assert.deepEqual(BRANCHES.map(b=>b.id),['beauty','holistic','nails','hair']);
  for(const b of [...BRANCHES,LECTURERS_BRANCH]){
    assert.match(b.logo,/branches\/[a-z]+\.png$/);
    const file=new URL('../public/branches/'+b.logo.split('/').pop(),import.meta.url);
    assert.ok(fs.existsSync(file),b.logo);
    assert.ok(fs.statSync(file).size<60000,'logos stay small');
  }
  assert.equal(branchName('nails'),'Nail Technicians');
  assert.ok(!BRANCHES.some(b=>b.id==='lecturers'),'Therapy Lecturers is not offered on the Join page');
});
