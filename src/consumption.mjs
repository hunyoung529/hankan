import {daysLeft,today} from './domain.mjs';
export const CHANGED='재료가 변경되었어요. 창을 닫고 수량을 다시 확인해 주세요.';
export function usableForCooking(item,day=today()){const left=daysLeft(item.date,day);return item.verified&&left!==null&&left>=0;}
export function planConsumption(records,selections,newId,day=today()){
 if(!Array.isArray(selections)||!selections.length||selections.length>100)throw Error('사용한 재료와 수량을 선택해 주세요.');
 const seen=new Set(),updates=new Map(),receipt=[];
 for(const selection of selections){
  if(seen.has(selection.id))throw Error('같은 재료를 중복 선택할 수 없어요.');seen.add(selection.id);
  const old=records.find(r=>r.id===selection.id);
  if(!old||old.deleted||old.conflict||old.mutationId!==selection.mutationId)throw Error(CHANGED);
  if(!usableForCooking(old.data,day))throw Error('날짜를 확인한 재료만 요리 사용량을 기록할 수 있어요.');
  const {remaining}=consumptionPreview(old.data.quantity,selection.quantity);
  const next={...old,data:remaining?{...old.data,quantity:remaining}:old.data,deleted:remaining===0,dirty:true,mutationId:newId()};
  updates.set(old.id,next);receipt.push({id:old.id,before:old.data,afterMutation:next.mutationId});
 }
 return {records:records.map(r=>updates.get(r.id)||r),receipt};
}
export function planRestore(records,receipt,newId){
 if(!Array.isArray(receipt)||!receipt.length||new Set(receipt.map(x=>x.id)).size!==receipt.length)throw Error(CHANGED);
 const updates=new Map();
 for(const entry of receipt){const current=records.find(r=>r.id===entry.id);if(!current||current.conflict||current.mutationId!==entry.afterMutation)throw Error(CHANGED);updates.set(entry.id,{...current,data:entry.before,deleted:false,dirty:true,mutationId:newId()});}
 if(records.filter(r=>!(updates.get(r.id)||r).deleted).length>100)throw Error('재료는 최대 100개까지 보관할 수 있어요.');
 return records.map(r=>updates.get(r.id)||r);
}

// Shared by confirmation UI and the atomic commit path.
export function consumptionPreview(available,amount){
 const q=Number(amount);
 if(typeof amount==='boolean'||!Number.isFinite(available)||available<=0||!Number.isFinite(q)||q<=0||q>available||(q!==available&&Math.abs(q*10000-Math.round(q*10000))>0.00001))throw Error('사용량은 보유 수량 이하로 입력해 주세요. 소수점은 4자리까지 가능해요.');
 return {used:q,remaining:Number((available-q).toPrecision(15))};
}
