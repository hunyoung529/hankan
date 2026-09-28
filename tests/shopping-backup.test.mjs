import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createShoppingStore,readShoppingBackup,makeShoppingBackup,planShoppingImport} from '../src/shopping.mjs';
const entry=(name,patch={})=>({id:randomUUID(),name,ingredient:null,checked:false,...patch});
test('shopping backup round-trips reviewed fields only',()=>{
 const a=entry('우유',{ingredient:'우유',checked:true,owner:'private',token:'private'});
 const result=readShoppingBackup(makeShoppingBackup([a]));
 assert.deepEqual(result,[{id:a.id,name:a.name,ingredient:a.ingredient,checked:true}]);
 assert.deepEqual(readShoppingBackup(makeShoppingBackup([])),[]);
});
test('wrong formats, malformed and oversized backups fail closed',()=>{
 const a=entry('Milk');
 for(const text of ['bad','null',JSON.stringify({format:'hankan-v1',items:[a]}),' '.repeat(1024*1024+1)])assert.throws(()=>readShoppingBackup(text));
 for(const items of [[a,a],[{...a,checked:'true'}],[{...a,name:' '}],[{...a,ingredient:'invalid'}],[{...a,id:'x'.repeat(81)}],Array.from({length:101},()=>entry('Milk'))]){
  assert.throws(()=>readShoppingBackup(JSON.stringify({format:'hankan-shopping-backup-v1',items})));
 }
});
test('merge preserves current names and checks across ID, canonical and normalized duplicates',()=>{
 const a=entry('My milk',{ingredient:'우유',checked:true}),b=entry('Cheese');
 const before=structuredClone([a,b]);
 const imported=[{...a,name:'Other',checked:false},entry('우유',{ingredient:'우유'}),entry(' ＣＨＥＥＳＥ '),entry('Bread',{checked:true}),entry('bread')];
 const result=planShoppingImport([a,b],imported);
 assert.equal(result.added,1);assert.equal(result.skipped,4);
 assert.deepEqual(result.items.slice(0,2),before);assert.equal(result.items[2].checked,true);
 assert.deepEqual([a,b],before);assert.equal(imported[2].name,' ＣＨＥＥＳＥ ');
});
test('over-limit merge is rejected without modifying current items',()=>{
 const existing=Array.from({length:100},(_,i)=>entry('Item '+i));
 const before=structuredClone(existing);
 assert.throws(()=>planShoppingImport(existing,[entry('New')]),/100/);
 assert.deepEqual(existing,before);
 assert.equal(planShoppingImport(existing,[{...existing[0]}]).added,0);
});
test('queued imports deduplicate, persist and remain account-isolated',async()=>{
 const values=new Map(),storage={getItem:async k=>values.get(k)||null,setItem:async(k,v)=>values.set(k,v)};
 const store=createShoppingStore({owner:'a',storage,newId:randomUUID});await store.load();
 const items=[entry('Bread',{checked:true})];
 const results=await Promise.all([store.importItems(items),store.importItems(items)]);
 assert.deepEqual(results,[{added:1,skipped:0},{added:0,skipped:1}]);
 const restored=createShoppingStore({owner:'a',storage,newId:randomUUID});await restored.load();
 assert.deepEqual(restored.getSnapshot().items,items);
 const other=createShoppingStore({owner:'b',storage,newId:randomUUID});await other.load();
 assert.deepEqual(other.getSnapshot().items,[]);
});
test('failed storage writes and corrupt stores never partially import',async()=>{
 const store=createShoppingStore({storage:{getItem:async()=>null,setItem:async()=>{throw Error('disk full');}},newId:randomUUID});
 await store.load();const before=store.getSnapshot();
 await assert.rejects(store.importItems([entry('Bread')]),/disk full/);
 assert.equal(store.getSnapshot(),before);
 let writes=0;
 const broken=createShoppingStore({storage:{getItem:async()=>'broken',setItem:async()=>{writes++;}},newId:randomUUID});
 await broken.load();await assert.rejects(broken.importItems([entry('Bread')]));
 assert.equal(writes,0);
});
