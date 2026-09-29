import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {planConsumption,planRestore} from '../src/consumption.mjs';
import {createRepository,visibleItems} from '../src/repository.mjs';
import {createShoppingStore,shoppingKey,shoppingDraft,shoppingView} from '../src/shopping.mjs';
import {normalizeItem,recommend} from '../src/domain.mjs';
const day='2026-09-21';
const item=(name,quantity=2)=>normalizeItem({id:randomUUID(),name,quantity,date:'2050-09-25',dateKind:'useby',verified:true,unit:'팩',place:'냉장'});
const record=data=>({id:data.id,data,version:1,mutationId:randomUUID(),dirty:false,deleted:false,conflict:null});
const selection=(r,quantity)=>({id:r.id,mutationId:r.mutationId,quantity});
const memory=()=>{const values=new Map();return {values,getItem:async k=>values.get(k)||null,setItem:async(k,v)=>{values.set(k,v);}};};
test('partial and full consumption are planned together, without mutating originals, then safely restored',()=>{
 const a=record(item('두부')),b=record(item('달걀',1)),records=[a,b];
 const result=planConsumption(records,[selection(a,'.5'),selection(b,'1')],randomUUID,day);
 assert.equal(result.records[0].data.quantity,1.5);assert.equal(result.records[1].deleted,true);assert.equal(a.data.quantity,2);assert.equal(b.deleted,false);
 const restored=planRestore(result.records,result.receipt,randomUUID);assert.equal(restored[0].data.quantity,2);assert.equal(restored[1].deleted,false);assert.ok(restored.every(r=>r.dirty));
 assert.throws(()=>planRestore(restored,result.receipt,randomUUID),/변경/);
});
test('invalid, duplicate, stale, conflicted and out-of-date consumption is rejected',()=>{
 const a=record(item('두부'));
 for(const q of ['',0,-1,3,'bad',Infinity,.00001])assert.throws(()=>planConsumption([a],[selection(a,q)],randomUUID,day));
 assert.throws(()=>planConsumption([a],[selection(a,1),selection(a,1)],randomUUID,day));
 assert.throws(()=>planConsumption([a],[{...selection(a,1),mutationId:randomUUID()}],randomUUID,day),/변경/);
 for(const patch of [{deleted:true},{conflict:a},{data:{...a.data,verified:false}},{data:{...a.data,date:'2020-01-01'}}])assert.throws(()=>planConsumption([{...a,...patch}],[selection(a,1)],randomUUID,day));
 const result=planConsumption([a],[selection(a,1)],randomUUID,day);assert.throws(()=>planRestore([{...result.records[0],mutationId:randomUUID()}],result.receipt,randomUUID),/변경/);
});
test('fractional math does not silently remove small remainders',()=>{
 const a=record(item('우유',.30001)),b=record(item('두부',.3));
 const result=planConsumption([a,b],[selection(a,.3),selection(b,.1)],randomUUID,day);
 assert.equal(result.records[0].deleted,false);assert.ok(Math.abs(result.records[0].data.quantity-.00001)<1e-14);assert.equal(result.records[1].data.quantity,.2);
});
test('repository consumption is atomic, survives restart and a duplicate submission cannot deduct twice',async()=>{
 const storage=memory(),repo=createRepository({storage,newId:randomUUID});await repo.load();const a=await repo.save(item('두부')),b=await repo.save(item('달걀'));
 const records=repo.getSnapshot().records,commands=records.map(r=>selection(r,1));
 const receipts=await Promise.allSettled([repo.consume(commands),repo.consume(commands)]);assert.equal(receipts.filter(x=>x.status==='fulfilled').length,1);
 assert.deepEqual(visibleItems(repo.getSnapshot().records).map(x=>x.quantity),[1,1]);
 const again=createRepository({storage,newId:randomUUID});await again.load();assert.deepEqual(visibleItems(again.getSnapshot().records).map(x=>x.quantity),[1,1]);
 const before=JSON.stringify(repo.getSnapshot());storage.setItem=async()=>{throw Error('disk full');};
 await assert.rejects(repo.consume(repo.getSnapshot().records.map(r=>selection(r,1))));assert.equal(JSON.stringify(repo.getSnapshot()),before);
});
test('undo after sync acknowledgement is allowed, but an intervening edit or another owner is rejected',async()=>{
 const storage=memory(),repo=createRepository({owner:'a',storage,newId:randomUUID});await repo.load();await repo.save(item('두부'));
 const receipt=await repo.consume([selection(repo.getSnapshot().records[0],1)]);
 await repo.sync(async changes=>({records:changes.map(c=>({id:c.id,data:c.data,version:1,mutation_id:c.mutation_id,deleted:c.deleted})),applied:changes.map(c=>({id:c.id,mutation_id:c.mutation_id})),conflicts:[]}));
 await repo.restoreConsumption(receipt);assert.equal(visibleItems(repo.getSnapshot().records)[0].quantity,2);
 const second=await repo.consume([selection(repo.getSnapshot().records[0],1)]);await repo.save({...visibleItems(repo.getSnapshot().records)[0],note:'new edit'});await assert.rejects(repo.restoreConsumption(second),/변경/);
 const other=createRepository({owner:'b',storage,newId:randomUUID});await other.load();await assert.rejects(other.restoreConsumption(second));
});
test('shopping list deduplicates repeated recipe additions and reopens checked entries',async()=>{
 const storage=memory(),store=createShoppingStore({storage,newId:randomUUID});await store.load();const entries=[{name:'두부',ingredient:'두부'},{name:'달걀',ingredient:'달걀'}];
 await Promise.all([store.add(entries),store.add(entries)]);assert.equal(store.getSnapshot().items.length,2);
 const id=store.getSnapshot().items[0].id;await store.check(id,true);await store.add([{name:'Tofu',ingredient:'두부'}]);assert.equal(store.getSnapshot().items.find(x=>x.id===id).checked,false);
 const removed=await store.remove(id);await store.restore(removed);assert.equal(store.getSnapshot().items.length,2);
 const restarted=createShoppingStore({storage,newId:randomUUID});await restarted.load();assert.deepEqual(restarted.getSnapshot().items,store.getSnapshot().items);
});
test('shopping lists isolate accounts, preserve data on disk failure and block corrupt stores',async()=>{
 const storage=memory(),a=createShoppingStore({owner:'a',storage,newId:randomUUID}),b=createShoppingStore({owner:'b',storage,newId:randomUUID});await a.load();await b.load();await a.add([{name:'Milk'}]);assert.equal(b.getSnapshot().items.length,0);
 const before=a.getSnapshot();storage.setItem=async()=>{throw Error('disk full');};await assert.rejects(a.add([{name:'Eggs'}]));assert.equal(a.getSnapshot(),before);
 storage.values.set(shoppingKey('b'),'{invalid');await b.load();assert.ok(b.getSnapshot().error);await assert.rejects(b.add([{name:'Eggs'}]));assert.equal(storage.values.get(shoppingKey('b')),'{invalid');
});
test('all recipes can be browsed without claiming expired ingredients are available',()=>{
 assert.equal(recommend([],day,true).length,20);assert.ok(recommend([],day,true).every(r=>r.have.length===0&&r.missing.length===r.ingredients.length));
 assert.equal(recommend([{...item('두부'),date:'2020-01-01'}],day,true)[0].have.length,0);
});

test('shopping registration preserves manual names but never reuses expiry, quantity or purchase status as pantry facts',()=>{
 const entry={id:'shopping',name:'Milk 2 packs',ingredient:null,checked:true,date:'2026-01-01',quantity:2,verified:true,opened:true,note:'old'};
 const before=JSON.stringify(entry),id=randomUUID(),draft=shoppingDraft(entry,id,()=>{throw Error('Manual name must not be translated');});
 assert.equal(draft.id,id);assert.equal(draft.name,'Milk 2 packs');assert.equal(draft.ingredient,'우유');assert.equal(draft.quantity,'1');assert.equal(draft.date,'');assert.equal(draft.verified,false);assert.equal(draft.opened,false);assert.equal(draft.note,'');assert.equal(JSON.stringify(entry),before);
 assert.equal(shoppingDraft({...entry,ingredient:'우유'},randomUUID(),()=> 'Milk').name,'Milk');
 assert.throws(()=>normalizeItem({...draft,date:'2027-01-01'}),/날짜/);
 const saved=normalizeItem({...draft,date:'2027-01-01',verified:true});assert.equal(saved.quantity,1);assert.equal(saved.fromShopping,undefined);
 assert.notEqual(shoppingDraft(entry,randomUUID()).id,shoppingDraft(entry,randomUUID()).id);
});
test('shopping search combines purchase state and translated names without changing stored entries',()=>{
 const items=[{id:'a',name:'우유',displayName:'Milk',checked:true},{id:'b',name:'두부',displayName:'Tofu',checked:false},{id:'c',name:'샐러드 채소',checked:false}],before=JSON.stringify(items);
 assert.deepEqual(shoppingView(items).map(x=>x.id),['b','c']);
 assert.deepEqual(shoppingView(items,'bought',' ＭＩＬＫ ').map(x=>x.id),['a']);
 assert.deepEqual(shoppingView(items,'all','우유').map(x=>x.id),['a']);
 assert.equal(shoppingView(items,'pending','milk').length,0);
 assert.equal(JSON.stringify(items),before);
});
