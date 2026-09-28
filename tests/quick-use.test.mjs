import test from 'node:test';
import assert from 'node:assert/strict';
import {consumptionPreview,planConsumption,planRestore} from '../src/consumption.mjs';
test('usage preview and committed quantity agree, preserving units and date',()=>{
 const data={id:'milk',name:'Milk',quantity:2.5,unit:'팩',date:'2050-01-01',verified:true};
 const record={id:'milk',data,mutationId:'before',dirty:false,deleted:false};
 const preview=consumptionPreview(data.quantity,'0.5');
 const result=planConsumption([record],[{id:'milk',mutationId:'before',quantity:'0.5'}],()=> 'after','2026-09-28');
 assert.equal(preview.remaining,2);assert.equal(result.records[0].data.quantity,preview.remaining);
 assert.equal(result.records[0].data.unit,'팩');assert.equal(result.records[0].data.date,data.date);
 assert.equal(record.data.quantity,2.5);
 assert.equal(planRestore(result.records,result.receipt,()=> 'restored')[0].data.quantity,2.5);
});
test('invalid, empty, over-limit and excessive decimal usage is rejected',()=>{
 for(const q of ['', ' ', 'oops',true,0,-1,3,Infinity,'0.00001'])assert.throws(()=>consumptionPreview(2,q));
 assert.ok(Math.abs(consumptionPreview(.30001,.3).remaining-.00001)<1e-14);
 assert.equal(consumptionPreview(.00001,.00001).remaining,0);
 assert.throws(()=>consumptionPreview(Infinity,1));
});
