import test from 'node:test';
import assert from 'node:assert/strict';
import {extractDates,daysLeft,validDate,normalizeItem,recommend} from '../src/domain.mjs';
import {reminderPlan} from '../src/reminderPlan.mjs';
test('label parsing separates manufacture, expiry and uncertain English date kinds',()=>{
 const result=extractDates('제조일자 2026.09.10\n소비기한 2026.09.20\n유통기한 26/09/25\nBEST BEFORE 20260926\n2026.02.30');
 assert.deepEqual(result.map(x=>[x.date,x.kind]),[['2026-09-10','manufactured'],['2026-09-20','useby'],['2026-09-25','sellby'],['2026-09-26','unknown']]);assert.equal(result[2].shortYear,true);
 assert.equal(validDate('2024-02-29'),true);assert.equal(validDate('2026-02-29'),false);assert.equal(daysLeft('2027-01-01','2026-12-31'),1);
});
test('date confirmation blocks save; expired and unknown dates do not become available recipe ingredients',()=>{
 const raw={id:'a',name:'두부',ingredient:'두부',quantity:1,date:'2026-09-20',verified:false};assert.throws(()=>normalizeItem(raw));
 const items=[normalizeItem({...raw,verified:true}),normalizeItem({...raw,id:'b',name:'달걀',ingredient:'달걀',date:'2026-09-14',verified:true})];
 assert.deepEqual(recommend(items,'2026-09-15').find(r=>r.id==='tofu').missing,['달걀']);
});
test('reminders group at local 9am, cross month boundaries, omit past/unknown/demo and cap queue',()=>{
 const now=new Date(2026,8,29,10),items=[{name:'두부',date:'2026-10-01',verified:true},{name:'달걀',date:'2026-10-01',verified:true},{name:'예시',date:'2026-10-01',verified:true,demo:true},{name:'미정',date:'',verified:false}];
 const plan=reminderPlan(items,now);assert.equal(plan.length,2);assert.equal(new Date(plan[0].time).getDate(),30);assert.equal(new Date(plan[0].time).getHours(),9);assert.equal(plan[0].count,2);assert.ok(plan.every(x=>!x.body.includes('예시')&&!x.body.includes('미정')));
 const lots=Array.from({length:100},(_,i)=>{const d=new Date(2027,0,i+1);return {name:'재료',verified:true,date:`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`}});assert.equal(reminderPlan(lots,now).length,50);
});
