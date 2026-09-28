import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {createRepository,visibleItems,storageKey} from '../src/repository.mjs';
import {normalizeItem} from '../src/domain.mjs';
const item=(name='두부')=>normalizeItem({id:randomUUID(),name,quantity:1,date:'2026-09-20',verified:true,ingredient:'두부',dateKind:'useby'});
const memory=()=>{const map=new Map();return {getItem:async k=>map.get(k)||null,setItem:async(k,v)=>map.set(k,v),map};};
const repo=(owner,storage=memory())=>createRepository({owner,storage,newId:randomUUID});
test('SQL ownership, atomic validation, idempotence, cross-device conflict and offline retries',async()=>{
 const db=new PGlite();await db.exec(`create schema auth;create table auth.users(id uuid primary key);create role authenticated;create role anon;grant usage on schema public,auth to authenticated,anon;create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;`);
 await db.exec(await readFile(new URL('../supabase/migrations/001_pantry.sql',import.meta.url),'utf8'));
 const u=randomUUID(),v=randomUUID();await db.query('insert into auth.users values($1),($2)',[u,v]);
 const transport=owner=>async changes=>{await db.query("select set_config('request.jwt.claim.sub',$1,false)",[owner]);await db.exec('set role authenticated');try{return (await db.query('select public.sync_pantry($1::jsonb) as result',[JSON.stringify(changes)])).rows[0].result;}finally{await db.exec('reset role')}};
 const a=repo(u),b=repo(u);await a.load();await b.load();const tofu=item();await a.save(tofu);
 await assert.rejects(a.sync(async()=>{throw Error('offline')}));assert.equal(a.getSnapshot().records[0].dirty,true);
 let sent;await a.sync(async c=>{sent=c;return transport(u)(c)});assert.equal(a.getSnapshot().records[0].version,1);assert.equal(a.getSnapshot().records[0].dirty,false);
 assert.equal((await transport(u)(sent)).records[0].version,1,'Retry does not increment version');
 await b.sync(transport(u));await a.save({...tofu,quantity:2});await b.save({...tofu,quantity:3});await a.sync(transport(u));await b.sync(transport(u));
 assert.equal(b.getSnapshot().records[0].data.quantity,3);assert.equal(b.getSnapshot().records[0].conflict.data.quantity,2);
 await b.resolve(tofu.id,'local');await b.sync(transport(u));await a.sync(transport(u));assert.equal(a.getSnapshot().records[0].data.quantity,3);
 // Local edits made while a previous upload is in flight are not discarded.
 await a.save({...tofu,quantity:4});let release;const inflight=a.sync(async c=>{await new Promise(r=>release=r);return transport(u)(c)});while(!release)await new Promise(r=>setImmediate(r));await a.save({...tofu,quantity:5});release();await inflight;assert.equal(a.getSnapshot().records[0].data.quantity,5);assert.equal(a.getSnapshot().records[0].dirty,true);await a.sync(transport(u));
 await a.remove(tofu.id);await a.sync(transport(u));await b.sync(transport(u));assert.equal(visibleItems(b.getSnapshot().records).length,0);
 assert.equal((await transport(v)([])).records.length,0);
 await db.query("select set_config('request.jwt.claim.sub',$1,false)",[v]);await db.exec('set role authenticated');assert.equal((await db.query('select * from public.pantry_items')).rows.length,0);await assert.rejects(db.query('delete from public.pantry_items'));await db.exec('reset role');
 const good=item(),bad=item();const batch=[good,bad].map(data=>({id:data.id,mutation_id:randomUUID(),base_version:0,data,deleted:false}));batch[1].data.name=null;
 await assert.rejects(transport(v)(batch));assert.equal((await transport(v)([])).records.length,0,'A bad item rolls back the entire batch');
 batch[1].data=bad;batch[1].data.date='2026-02-30';await assert.rejects(transport(v)(batch));
 await db.exec('set role anon');await assert.rejects(db.query("select public.sync_pantry('[]')"));await db.exec('reset role');await db.close();
});
test('storage failures preserve current state; accounts cannot inherit each other’s local cache',async()=>{
 const storage=memory(),a=repo('A',storage),b=repo('B',storage);await a.load();await b.load();const tofu=item();await a.save(tofu);assert.equal(visibleItems(b.getSnapshot().records).length,0);
 storage.setItem=async()=>{throw Error('disk full')};await assert.rejects(a.remove(tofu.id));assert.equal(visibleItems(a.getSnapshot().records).length,1);
 storage.map.set(storageKey('C'),'broken');const c=repo('C',storage);await c.load();await assert.rejects(c.save(item()));assert.equal(storage.map.get(storageKey('C')),'broken');
});
