import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {pantryShoppingEntry,createShoppingStore} from '../src/shopping.mjs';
const storage=()=>{const m=new Map();return {getItem:async k=>m.get(k)||null,setItem:async(k,v)=>m.set(k,v)};};
test('rebuy copies only the exact product name without pantry data or broad categories',()=>{
 const item={name:'  Brand A milk  ',ingredient:'우유',quantity:3,date:'2020-01-01',opened:true,note:'private',id:'pantry'};
 assert.deepEqual(pantryShoppingEntry(item),{name:'Brand A milk',ingredient:null});
 assert.equal(item.quantity,3);assert.equal(item.name,'  Brand A milk  ');
 for(const name of ['',null,' '.repeat(2),'x'.repeat(51)])assert.throws(()=>pantryShoppingEntry({name}));
});
test('rebuy keeps brands separate, deduplicates repeated taps and reopens bought items',async()=>{
 const store=createShoppingStore({storage:storage(),newId:randomUUID});await store.load();
 const a=pantryShoppingEntry({name:'Brand A milk',ingredient:'우유'}),b=pantryShoppingEntry({name:'Brand B milk',ingredient:'우유'});
 assert.deepEqual(await Promise.all([store.add([a]),store.add([a])]),[1,0]);
 await store.add([b]);assert.equal(store.getSnapshot().items.length,2);
 const id=store.getSnapshot().items[0].id;await store.check(id,true);
 assert.equal(await store.add([a]),1);
 assert.equal(store.getSnapshot().items[0].checked,false);assert.equal(store.getSnapshot().items[0].id,id);
});
test('rebuy storage failure leaves list unchanged and other accounts stay isolated',async()=>{
 const disk=storage(),a=createShoppingStore({owner:'a',storage:disk,newId:randomUUID}),b=createShoppingStore({owner:'b',storage:disk,newId:randomUUID});await a.load();await b.load();
 await a.add([pantryShoppingEntry({name:'Milk'})]);assert.equal(b.getSnapshot().items.length,0);
 const before=a.getSnapshot();disk.setItem=async()=>{throw Error('disk full');};
 await assert.rejects(a.add([pantryShoppingEntry({name:'Bread'})]),/disk full/);assert.equal(a.getSnapshot(),before);
});
