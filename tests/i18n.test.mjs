import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {createLanguageStore,createTranslator,LOCALE_KEY,message,quantityLabel,resolveLocale,shortDate} from '../src/i18n.mjs';
import {en} from '../src/locales/catalog.mjs';
import {INGREDIENTS,RECIPES,inferIngredient,normalizeItem,recommend} from '../src/domain.mjs';
import {reminderPlan} from '../src/reminderPlan.mjs';
const require=createRequire(import.meta.url),{parse}=require('@babel/parser'),traverse=require('@babel/traverse').default;
const root=new URL('../',import.meta.url);
const memory=initial=>{const values=new Map(Object.entries(initial||{}));return {values,getItem:async k=>values.get(k)??null,setItem:async(k,v)=>{values.set(k,v);}};};

test('device language fallback and saved language survive restarts without touching pantry data',async()=>{
 assert.equal(resolveLocale('ko-KR'),'ko');assert.equal(resolveLocale('ko_KR'),'ko');assert.equal(resolveLocale('en-GB'),'en');assert.equal(resolveLocale('fr-FR'),'en');
 const pantry='{"records":[{"name":"우유"}]}',storage=memory({'pantry-user':pantry});
 const first=createLanguageStore({storage,detectLanguage:()=> 'ko-KR'});await first.load();assert.equal(first.getSnapshot().locale,'ko');
 await first.select('en');assert.equal(first.getSnapshot().locale,'en');assert.equal(storage.values.get(LOCALE_KEY),'en');assert.equal(storage.values.get('pantry-user'),pantry);
 const restart=createLanguageStore({storage,detectLanguage:()=> 'ko-KR'});await restart.load();assert.equal(restart.getSnapshot().locale,'en');
 const invalid=createLanguageStore({storage:memory({[LOCALE_KEY]:'invalid'}),detectLanguage:()=> 'en-US'});await invalid.load();assert.equal(invalid.getSnapshot().locale,'en');
});
test('language writes are serialized and failed saves keep the previous language',async()=>{
 const storage=memory(),store=createLanguageStore({storage,detectLanguage:()=> 'ko'});await store.load();
 await Promise.all([store.select('en'),store.select('ko')]);assert.equal(store.getSnapshot().locale,'ko');assert.equal(storage.values.get(LOCALE_KEY),'ko');
 storage.setItem=async()=>{throw Error('disk full');};await store.select('en');assert.equal(store.getSnapshot().locale,'ko');assert.equal(store.getSnapshot().busy,false);assert.match(createTranslator('en')(store.getSnapshot().error),/Could not save/);
 await assert.rejects(store.select('xx'));assert.equal(store.getSnapshot().locale,'ko');
 const unreadable=createLanguageStore({storage:{getItem:async()=>{throw Error('blocked');}},detectLanguage:()=> 'ko'});await unreadable.load();assert.equal(unreadable.getSnapshot().ready,true);assert.equal(unreadable.getSnapshot().locale,'ko');
});
test('message interpolation preserves names and does not translate or interpret inserted user text',()=>{
 const raw='우유 {count} <milk>',record=message('{name} · 저장했어요.',{name:raw});
 assert.equal(createTranslator('en')(record),raw+' · Saved.');assert.equal(createTranslator('ko')(record),raw+' · 저장했어요.');
 assert.equal(quantityLabel(1,'팩','en'),'1 pack');assert.equal(quantityLabel(2,'팩','en'),'2 packs');assert.equal(quantityLabel(2,'팩','ko'),'2팩');assert.equal(quantityLabel(500,'ml','en'),'500 mL');
 assert.equal(shortDate('2026-09-25','en'),'Sep 25');assert.equal(shortDate('2026-09-25','ko'),'09.25');
});
test('all catalog interpolation parameters are preserved in English',()=>{
 const tokens=s=>[...s.matchAll(/\{(\w+)\}/g)].map(x=>x[1]).sort();
 for(const [key,value] of Object.entries(en)){assert.ok(value.trim(),key);assert.deepEqual(tokens(value),tokens(key),key);}
});
test('authored UI messages, recipe content, enums and application errors have English translations',()=>{
 const keys=new Set();
 for(const filename of ['App.jsx','src/CookingPanel.jsx','src/ShoppingPanel.jsx','src/LocaleProvider.jsx','src/reminderPlan.mjs','src/i18n.mjs']){
  const ast=parse(readFileSync(new URL(filename,root),'utf8'),{sourceType:'module',plugins:['jsx']});
  traverse(ast,{
   CallExpression(p){if(!['t','message'].includes(p.node.callee.name))return;const arg=p.get('arguments.0');if(!arg?.node)return;if(arg.isStringLiteral())keys.add(arg.node.value);else if(arg.isConditionalExpression())for(const k of ['consequent','alternate'])if(arg.node[k].type==='StringLiteral')keys.add(arg.node[k].value);},
   JSXText(p){assert.ok(!/[가-힣]/.test(p.node.value),'Untranslated JSX: '+p.node.value);}
  });
 }
 for(const recipe of RECIPES)for(const value of [recipe.title,recipe.subtitle,recipe.amounts,recipe.basics,...recipe.steps])keys.add(value);
 for(const key of [...INGREDIENTS,'전체','냉장','냉동','실온','임박','지남','개','팩','봉','단','소비기한','유통기한','표시 종류 확인','제조·포장일'])keys.add(key);
 for(const file of ['src/consumption.mjs','src/shopping.mjs','src/domain.mjs','src/repository.mjs','src/ocr.native.js','src/ocr.web.js','src/ocrPipeline.mjs','src/label.mjs','src/cloud.js','src/backup.js','src/reminders.native.js']){
  const ast=parse(readFileSync(new URL(file,root),'utf8'),{sourceType:'module'});
  traverse(ast,{StringLiteral(p){const value=p.node.value;if(/[가-힣]/.test(value)&&value.length>15)keys.add(value);}});
 }
 for(const key of keys)if(key&&key!=='한국어')assert.ok(Object.hasOwn(en,key),'Missing English: '+key);
});
test('English item names use canonical ingredient IDs so existing recipes and backups stay compatible',()=>{
 const cases=[['organic milk','우유'],['Free range EGGS','달걀'],['Green onions','대파'],['Greek yoghurt','요거트'],['Eggplant','기타']];
 for(const [name,key] of cases)assert.equal(inferIngredient(name),key,name);
 const egg=normalizeItem({id:'egg',name:'Free range EGGS',quantity:2,date:'2026-09-25',verified:true,unit:'팩',place:'냉장'});
 assert.equal(egg.name,'Free range EGGS');assert.equal(egg.ingredient,'달걀');assert.equal(egg.place,'냉장');assert.equal(egg.unit,'팩');assert.ok(recommend([egg],'2026-09-18').some(r=>r.id==='tomato'));
});
test('notification translation changes wording without changing schedule or user names',()=>{
 const items=[{name:'우리집 우유',date:'2026-09-25',verified:true}],now=new Date(2026,8,20,12);
 const ko=reminderPlan(items,now,'ko'),english=reminderPlan(items,now,'en');assert.deepEqual(ko.map(x=>x.time),english.map(x=>x.time));
 assert.equal(english[0].title,'Check your pantry items');assert.match(english[0].body,/우리집 우유/);assert.match(english[0].body,/due in 3/);assert.match(english.at(-1).body,/due today/);
});
test('displayed app version comes from the same version as Android and iOS configuration',()=>{
 const app=JSON.parse(readFileSync(new URL('app.json',root),'utf8')).expo,pkg=JSON.parse(readFileSync(new URL('package.json',root),'utf8'));
 assert.equal(app.version,pkg.version);assert.equal(app.android.versionCode,Number(app.ios.buildNumber));
 const version=readFileSync(new URL('src/version.js',root),'utf8');assert.match(version,/config\.expo\.version/);
 const ui=readFileSync(new URL('App.jsx',root),'utf8');assert.match(ui,/testID="app-version"/);assert.match(ui,/testID="settings-version"/);
});
