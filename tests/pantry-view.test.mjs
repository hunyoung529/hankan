import test from 'node:test';
import assert from 'node:assert/strict';
import {pantryView} from '../src/pantryView.mjs';
const item=(id,patch={})=>({id,name:id,ingredient:'우유',place:'냉장',date:'2026-10-01',opened:false,...patch});
const day='2026-09-29';
const ids=(items,options)=>pantryView(items,{day,...options}).map(x=>x.id);
test('storage, state and normalized translated search intersect without mutating inventory',()=>{
 const items=[item('a',{opened:true,place:'냉동'}),item('b',{opened:true}),item('c',{place:'냉동'})],before=structuredClone(items);
 assert.deepEqual(ids(items,{place:'냉동',status:'opened',query:' ＭＩＬＫ ',translate:x=>x==='우유'?'Milk':x}),['a']);
 assert.deepEqual(ids(items,{place:'냉동',status:'opened',query:'우유',translate:()=> 'Milk'}),['a']);
 assert.deepEqual(items,before);
});
test('urgent includes today through day three, excluding unknown and expired',()=>{
 const items=[item('past',{date:'2026-09-28'}),item('today',{date:day}),item('three',{date:'2026-10-02'}),item('four',{date:'2026-10-03'}),item('unknown',{date:''})];
 assert.deepEqual(ids(items,{status:'urgent'}),['today','three']);
 assert.deepEqual(ids(items,{status:'expired'}),['past']);
 assert.deepEqual(ids(items,{status:'unknown'}),['unknown']);
});
test('date sorting puts unknown last with deterministic ties and name sorting is numeric',()=>{
 const items=[item('x',{name:'Item 10',date:''}),item('y',{name:'Item 2',date:''}),item('b',{name:'Equal'}),item('a',{name:'Equal'})];
 assert.deepEqual(ids(items,{}),['a','b','y','x']);
 assert.deepEqual(ids(items,{sort:'name',locale:'en'}),['a','b','y','x']);
 assert.deepEqual(ids([item('late',{name:'Apple',date:'2026-12-01'}),item('early',{name:'Zebra',date:day})],{sort:'name',locale:'en'}),['late','early']);
});
test('empty results and clearing options do not delete or modify food data',()=>{
 const items=[item('a',{opened:true}),item('b',{date:''})],before=structuredClone(items);
 assert.deepEqual(ids(items,{query:'not-present'}),[]);
 assert.deepEqual(ids(items,{place:'냉동',status:'opened'}),[]);
 assert.equal(pantryView(items,{day}).length,2);assert.deepEqual(items,before);
});
