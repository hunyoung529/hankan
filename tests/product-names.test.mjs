import test from 'node:test';
import assert from 'node:assert/strict';
import {extractNames,applyScan,reuseItem,previousNames,combineReadings} from '../src/label.mjs';
import {runLabelPipeline} from '../src/ocrPipeline.mjs';
import {extractDates} from '../src/domain.mjs';
const blank={id:'new',name:'',ingredient:'기타',date:'',verified:false,quantity:1};

test('brand-only text and marketing headlines never become automatic product names',()=>{
 for(const text of ['서울우유','풀무원','CJ제일제당','비비고','상하목장','매일유업','서울우유협동조합','프리미엄','HACCP']){
  assert.equal(applyScan(blank,{text,lines:[{text,height:80},{text:'300g',height:12},{text:'2026.09.20',height:12}]}).form.name,'',text);
 }
 const result={text:'푸른농장\n부침용 두부\n300g',lines:[{text:'푸른농장',height:100},{text:'부침용 두부',height:45},{text:'300g',height:20}]};
 assert.deepEqual(extractNames({lines:[{text:'MB?',height:90},{text:'300g',height:12},{text:'2026.09.20',height:12}]}),[]);
 assert.equal(extractNames(result)[0].name,'부침용 두부');assert.equal(applyScan(blank,result).form.name,'부침용 두부');
});
test('ingredient and nutrition continuations cannot populate the product name',()=>{
 for(const text of ['원재료명\n우유\n대두\n소비기한 2026.09.20','영양정보\n단백질 8g\n우유','식품유형\n두부','원산지\n사과'])assert.equal(applyScan(blank,text).form.name,'',text);
 const cropped=combineReadings([{text:'원재료명\n우유\n대두'},{text:'우유',cropped:true,lines:[{text:'우유',height:50}]}]);
 assert.equal(applyScan(blank,cropped).form.name,'');
 const lines=[{text:'제품명 고소한 두유',block:1,height:20},{text:'원재료명',block:2,height:15},{text:'우유',block:2,height:20}];
 assert.deepEqual(extractNames({lines}).map(n=>n.name),['고소한 두유']);
});
test('low-fat and frozen product names survive metadata filtering',()=>{
 for(const name of ['저지방 우유','고단백 저지방 우유','냉동 물만두','무지방 요거트'])assert.equal(applyScan(blank,name).form.name,name);
 assert.equal(extractNames('제품명: 고소한 저지방 우유 | 원재료명: 원유 100%')[0].name,'고소한 저지방 우유');
 assert.equal(extractNames('품 명 : 국산콩 두부')[0].name,'국산콩 두부');
});
test('split descriptors and spaced OCR food words form coherent name candidates',()=>{
 assert.equal(extractNames('국산콩\n부침용 두 부')[0].name,'국산콩 부침용 두부');
 assert.equal(extractNames('제품명\n저지방 우 유')[0].name,'저지방 우유');
 const lines=[{text:'제품명',x:10,y:10,width:50,height:20,block:1},{text:'냉장보관',x:10,y:150,width:80,height:20,block:2},{text:'고소한 검은콩 두유',x:75,y:10,width:160,height:20,block:3}];
 assert.equal(extractNames({lines})[0].name,'고소한 검은콩 두유');
});
test('competing product names require selection instead of choosing an arbitrary first line',()=>{
 const result=extractNames('두부\n우유');assert.equal(result[0].automatic,false);assert.equal(applyScan(blank,'두부\n우유').form.name,'');
});
test('better named-label results replace only prior automatic text; manual names and confirmed dates survive a name-only scan',()=>{
 const first=applyScan(blank,'우유');assert.equal(first.form.name,'우유');
 const next=applyScan({...first.form,date:'2026-09-25',verified:true},'제품명 저지방 우유\n2026.09.30',first.auto,'name');
 assert.equal(next.form.name,'저지방 우유');assert.equal(next.form.date,'2026-09-25');assert.equal(next.form.verified,true);
 assert.equal(applyScan({...first.form,name:'내가 적은 우유'},'제품명 저지방 우유',first.auto,'name').form.name,'내가 적은 우유');
 assert.equal(applyScan(blank,'우유\n2026.09.20',{},'date').form.name,'');
});
test('finding a date still triggers Korean product-name recovery',async()=>{
 const modes=[];const result=await runLabelPipeline({width:1200,height:600,recognize:async(region,mode)=>{modes.push(mode);return {text:mode==='name'?'제품명 부침용 두부\n소비기한 2026.09.20':'풀무원\n소비기한 2026.09.20'};}});
 assert.deepEqual(modes,['standard','name']);assert.equal(applyScan(blank,result).form.name,'부침용 두부');assert.equal(extractDates(result.text)[0].date,'2026-09-20');
});
test('date-only mode keeps the previous date recovery order and name-only skips Latin date passes',async()=>{
 const modes=[];await runLabelPipeline({width:1200,height:600,target:'date',recognize:async(r,m)=>{modes.push(m);return {text:m==='date'?'소비기한 2026.09.20':'서울우유'};}});assert.deepEqual(modes,['standard','date']);
 const nameModes=[];await runLabelPipeline({width:1200,height:600,target:'name',recognize:async(r,m)=>{nameModes.push(m);return {text:'제품명 국산콩 두부'};}});assert.deepEqual(nameModes,['standard']);
});
test('secondary OCR failure preserves earlier dates; cancellation stops without another pass',async()=>{
 let calls=0;const result=await runLabelPipeline({width:1200,height:600,recognize:async()=>{if(calls++)throw Error('fallback failed');return {text:'2026.09.20'};}});
 assert.equal(extractDates(result.text)[0].date,'2026-09-20');
 let cancelled=false;await assert.rejects(runLabelPipeline({width:1200,height:600,isCancelled:()=>cancelled,recognize:async()=>{cancelled=true;return {text:'우유'};}}),/중단/);
});
test('repurchase reuse never copies expiry, opened state, notes or quantity',()=>{
 const old={id:'old',name:'우유',ingredient:'우유',place:'냉장',unit:'팩',date:'2020-01-01',verified:true,opened:true,quantity:3,note:'오래된 메모'};
 const result=reuseItem(old,'new');assert.equal(result.id,'new');assert.equal(result.name,'우유');assert.equal(result.quantity,'1');assert.equal(result.date,'');assert.equal(result.verified,false);assert.equal(result.opened,false);assert.equal(result.note,'');
 assert.equal(previousNames([old,{...old,id:'later'}, {...old,name:'예시',demo:true}]).length,1);
});
