import {INGREDIENTS,inferIngredient} from './domain.mjs';
export const shoppingKey=owner=>`hankan-shopping-v1:${owner||'guest'}`;
const normalize=s=>s.normalize('NFKC').replace(/\s+/g,' ').trim().toLocaleLowerCase();
const validate=entry=>{
 if(!entry||typeof entry.id!=='string'||!entry.id||typeof entry.name!=='string'||!entry.name.trim()||entry.name.length>50||typeof entry.checked!=='boolean'||!(entry.ingredient===null||INGREDIENTS.includes(entry.ingredient)))throw Error('장보기 기록을 읽지 못했어요. 원본 보호를 위해 저장을 멈췄어요.');
 return entry;
};
export function createShoppingStore({owner=null,storage,newId}){
 let state={ready:false,items:[],error:''},queue=Promise.resolve();const listeners=new Set(),key=shoppingKey(owner);
 const emit=()=>listeners.forEach(fn=>fn()),run=fn=>{const task=queue.then(fn);queue=task.catch(()=>{});return task;};
 const guard=()=>{if(!state.ready||state.error)throw Error('장보기 기록을 읽지 못했어요. 원본 보호를 위해 저장을 멈췄어요.');};
 const persist=async items=>{if(items.length>100)throw Error('장보기 목록은 최대 100개까지 보관할 수 있어요.');await storage.setItem(key,JSON.stringify({format:'hankan-shopping-v1',items}));state={ready:true,items,error:''};emit();};
 return {owner,subscribe(fn){listeners.add(fn);return ()=>listeners.delete(fn);},getSnapshot:()=>state,
  load:()=>run(async()=>{try{const raw=await storage.getItem(key),data=raw?JSON.parse(raw):{format:'hankan-shopping-v1',items:[]};if(data.format!=='hankan-shopping-v1'||!Array.isArray(data.items)||data.items.length>100)throw Error();const items=data.items.map(validate);if(new Set(items.map(x=>x.id)).size!==items.length)throw Error();state={ready:true,items,error:''};}catch{state={ready:true,items:[],error:'장보기 기록을 읽지 못했어요. 원본 보호를 위해 저장을 멈췄어요.'};}emit();}),
  add:entries=>run(async()=>{guard();const items=state.items.map(x=>({...x}));let count=0;
   if(!Array.isArray(entries)||!entries.length)throw Error('장볼 재료 이름을 입력해 주세요.');
   for(const entry of entries){const name=String(entry.name||'').trim(),ingredient=entry.ingredient||null;validate({id:'new',name,ingredient,checked:false});
    const found=items.find(x=>(ingredient&&x.ingredient===ingredient)||normalize(x.name)===normalize(name));
    if(found){if(found.checked){found.checked=false;count++;}}else{items.push({id:newId(),name,ingredient,checked:false});count++;}
   }await persist(items);return count;}),
  check:(id,checked)=>run(async()=>{guard();await persist(state.items.map(x=>x.id===id?{...x,checked:!!checked}:x));}),
  remove:id=>run(async()=>{guard();const item=state.items.find(x=>x.id===id);if(!item)return;await persist(state.items.filter(x=>x.id!==id));return item;}),
  restore:item=>run(async()=>{guard();validate(item);if(state.items.some(x=>x.id===item.id||normalize(x.name)===normalize(item.name)||item.ingredient&&x.ingredient===item.ingredient))return;await persist([...state.items,item]);})
 };
}

// Only the reviewed name/category crosses into a new pantry draft. Never guess amounts or dates.
export function shoppingDraft(entry,id,translate=x=>x){
 validate(entry);
 return {id,name:entry.ingredient?translate(entry.ingredient):entry.name,ingredient:entry.ingredient||inferIngredient(entry.name),quantity:'1',unit:'개',place:'냉장',date:'',dateKind:'unknown',verified:false,opened:false,note:'',demo:false,fromShopping:true};
}
export function shoppingView(items,filter='pending',query=''){
 const q=normalize(query);
 return items.filter(x=>(filter==='all'||(filter==='bought'?x.checked:!x.checked))&&(!q||normalize(x.name).includes(q)||normalize(x.displayName||'').includes(q))).sort((a,b)=>Number(a.checked)-Number(b.checked));
}
