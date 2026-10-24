import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync,statSync} from 'node:fs';
import {join} from 'node:path';

// Guards the brand type: Alegreya Sans (headings), Open Sans (body) and Belleza (logo and display) only.
const BRAND=new Set(['alegreya sans','open sans','belleza','arial','sans-serif','inherit']);
const walk=dir=>readdirSync(dir).flatMap(f=>{const p=join(dir,f);return statSync(p).isDirectory()?walk(p):[p];});
const files=walk('src').filter(f=>/\.(css|jsx?|mjs)$/.test(f)&&!/\.test\./.test(f));
const families=text=>{
  const found=[];
  for(const m of text.matchAll(/font-family\s*:\s*([^;}\n]+)/g))found.push(...m[1].split(','));
  for(const m of text.matchAll(/fontFamily\s*:\s*['"`]([^'"`]+)['"`]/g))found.push(...m[1].split(','));
  // The font shorthand: size then family, e.g. "31px 'Belleza',sans-serif" or "600 10px 'Open Sans',sans-serif".
  for(const m of text.matchAll(/(?<![\w-])font\s*:\s*(?:[\w.]+\s+)*?[\d.]+(?:px|rem|em)(?:\/[\d.]+(?:px|rem|em)?)?\s+([^;}\n]+)/g))found.push(...m[1].split(','));
  return found.map(f=>f.replace(/['"`]/g,'').replace(/!important/,'').trim().toLowerCase()).filter(Boolean);
};

test('only the brand fonts are used anywhere in the portal source',()=>{
  const bad=[];
  for(const file of files){for(const fam of families(readFileSync(file,'utf8')))if(!BRAND.has(fam))bad.push(file+': '+fam);}
  assert.deepEqual(bad,[]);
});
test('form controls and plain paragraphs sit on the portal text scale, not the browser default',()=>{
  const css=readFileSync('src/styles.css','utf8');
  assert.match(css,/:where\(\.page\)\s*p\s*\{[^}]*font-size:13px/);
  assert.match(css,/\.field select[^{]*\{[^}]*font-size:13px/);
});

// ---- The Catalyst sign-in screens (an iframe, so they have their own stylesheet) ----
const authFiles=['embedded_signin.css','embedded_password_reset.css','confirm_password.css'];
const weightsFor=(css,family)=>{const m=css.match(new RegExp('family='+family+':wght@([0-9;]+)'));return m?m[1].split(';'):[];};
test('sign-in form controls use the portal body font, not the browser default (Arial)',()=>{
  const css=readFileSync('auth-css/overrides.css','utf8');
  assert.match(css,/input\s*,\s*button[^{]*\{[^}]*font-family:\s*'Open Sans'/);
});
test('the built sign-in stylesheets are current: they carry the overrides after Catalyst\'s base sheet',()=>{
  const overrides=readFileSync('auth-css/overrides.css','utf8');
  for(const name of authFiles){
    const built=readFileSync(join('public','auth',name),'utf8');
    assert.ok(built.endsWith(overrides),name+' is out of date: run npm run build:auth-css');
  }
});
test('the sign-in screens and the portal load the same font weights',()=>{
  const html=readFileSync('index.html','utf8');
  for(const family of ['Alegreya\\+Sans','Open\\+Sans']){
    const wanted=weightsFor(html,family);
    assert.ok(wanted.length>0,family+' not found in index.html');
    for(const name of authFiles){
      const loaded=weightsFor(readFileSync(join('public','auth',name),'utf8'),family);
      assert.deepEqual(wanted.filter(w=>!loaded.includes(w)),[],name+' is missing '+family+' weights');
    }
  }
});
