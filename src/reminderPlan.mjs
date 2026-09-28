import {validDate} from './domain.mjs';
import {createTranslator} from './i18n.mjs';
export function reminderPlan(items,now=new Date(),locale='ko'){
 const t=createTranslator(locale);
 const buckets=new Map();
 for(const item of items){if(!validDate(item.date)||!item.verified||item.demo)continue;const [y,m,d]=item.date.split('-').map(Number);
  for(const offset of [3,1,0]){const at=new Date(y,m-1,d-offset,9,0,0);if(at<=now)continue;const key=at.getTime();const entries=buckets.get(key)||[];entries.push(t(offset===0?'{name} 오늘까지':'{name} {days}일 전',{name:item.name,days:offset}));buckets.set(key,entries)}
 }
 return [...buckets].sort(([a],[b])=>a-b).slice(0,50).map(([time,names])=>({time,title:t('냉장고 재료를 확인해 주세요'),body:names.slice(0,3).join(' · ')+(names.length>3?t(' 외 {count}개',{count:names.length-3}):''),count:names.length}));
}
