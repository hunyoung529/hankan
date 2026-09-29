import {daysLeft,today} from './domain.mjs';
const normalize=value=>String(value||'').normalize('NFKC').trim().toLocaleLowerCase();
export function pantryView(items,{place='전체',status='all',sort='expiry',query='',day=today(),locale='ko',translate=x=>x}={}){
 const q=normalize(query),nameOrder=new Intl.Collator(locale,{numeric:true,sensitivity:'base'});
 const byName=(a,b)=>nameOrder.compare(a.name,b.name)||String(a.id).localeCompare(String(b.id));
 const byDate=(a,b)=>(daysLeft(a.date,day)??Infinity)-(daysLeft(b.date,day)??Infinity)||byName(a,b);
 return items.filter(item=>{
  if(place!=='전체'&&place!==item.place)return false;
  const left=daysLeft(item.date,day);
  const matches=status==='all'||status==='opened'&&item.opened||status==='unknown'&&left===null||status==='urgent'&&left!==null&&left>=0&&left<=3||status==='expired'&&left!==null&&left<0;
  return matches&&(!q||[item.name,item.ingredient,translate(item.ingredient)].some(value=>normalize(value).includes(q)));
 }).sort(sort==='name'?byName:byDate);
}
