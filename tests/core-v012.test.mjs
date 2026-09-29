import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {RECIPES,INGREDIENTS,recommend} from '../src/domain.mjs';
import {recipeView,recipeInventory} from '../src/recipeView.mjs';
import {createTranslator} from '../src/i18n.mjs';
import {createRepository} from '../src/repository.mjs';
const day='2026-09-29';
const item=(ingredient,date='2026-10-01')=>({id:randomUUID(),name:ingredient,ingredient,quantity:2,date,verified:true});
test('catalog covers all supported main ingredients with complete unique recipes',()=>{
 assert.equal(RECIPES.length,20);assert.equal(new Set(RECIPES.map(r=>r.id)).size,20);
 assert.deepEqual([...new Set(RECIPES.flatMap(r=>r.ingredients))].sort(),INGREDIENTS.filter(x=>x!=='기타').sort());
 for(const r of RECIPES){assert.ok(r.minutes>0);assert.ok(r.amounts.length);assert.ok(r.steps.length>=3);assert.equal(new Set(r.ingredients).size,r.ingredients.length);}
});
test('recipe filters combine inventory, time and Korean or English ingredient searches',()=>{
 const recipes=recommend([item('우유'),item('요거트')],day,true),before=JSON.stringify(recipes);
 assert.ok(recipeView(recipes,{filter:'ready',maxMinutes:15,query:'milk',translate:createTranslator('en')}).some(r=>r.id==='yogurtmilk'));
 assert.ok(recipeView(recipes,{filter:'one',query:'오이'}).some(r=>r.id==='cucumberyogurt'));
 assert.ok(recipeView(recipes,{filter:'urgent',query:'ＭＩＬＫ',translate:createTranslator('en')}).length);
 assert.equal(recipeView(recipes,{query:'no such dish'}).length,0);assert.equal(JSON.stringify(recipes),before);
});
test('recommendations exclude unresolved records and unconfirmed or elapsed dates',()=>{
 const records=[{data:item('우유')},{data:item('요거트'),conflict:{}},{data:item('달걀'),deleted:true},{data:{...item('치즈'),verified:false}},{data:item('두부','2026-09-28')},{data:item('오이','')}];
 const recipes=recommend(recipeInventory(records),day,true);
 assert.deepEqual([...new Set(recipes.flatMap(r=>r.have))],['우유']);
});
const memory=()=>{const values=new Map();return {getItem:async k=>values.get(k)||null,setItem:async(k,v)=>values.set(k,v)};};
test('editor save accepts current revision and rejects stale, deleted and missing records without changes',async()=>{
 const repo=createRepository({storage:memory(),newId:randomUUID});await repo.load();const a=await repo.save(item('우유'));
 const first=repo.getSnapshot().records[0].mutationId;await repo.save({...a,name:'updated'},first);
 const before=JSON.stringify(repo.getSnapshot());await assert.rejects(repo.save(a,first),/변경/);assert.equal(JSON.stringify(repo.getSnapshot()),before);
 const current=repo.getSnapshot().records[0].mutationId;await repo.remove(a.id);const removed=JSON.stringify(repo.getSnapshot());await assert.rejects(repo.save(a,current),/변경/);assert.equal(JSON.stringify(repo.getSnapshot()),removed);
 await assert.rejects(repo.save({...a,id:randomUUID()},current),/변경/);
});
test('editor cannot overwrite a remote update or an unresolved conflict',async()=>{
 const repo=createRepository({storage:memory(),newId:randomUUID});await repo.load();const a=await repo.save(item('우유'));
 const old=repo.getSnapshot().records[0];
 const remote={id:a.id,data:{...a,name:'remote'},version:2,mutation_id:randomUUID(),deleted:false};
 await repo.sync(async()=>({records:[remote],applied:[],conflicts:[{id:a.id}]}));
 const before=JSON.stringify(repo.getSnapshot());await assert.rejects(repo.save(a,old.mutationId),/변경/);assert.equal(JSON.stringify(repo.getSnapshot()),before);
 await repo.resolve(a.id,'server');await assert.rejects(repo.save(a,old.mutationId),/변경/);assert.equal(repo.getSnapshot().records[0].data.name,'remote');
});
