import {extractDates,inferIngredient} from './domain.mjs';

import {extractNames,recognizedLines} from './productNames.mjs';
export {extractNames,recognizedLines,hasReliableName} from './productNames.mjs';

export function combineReadings(readings){
 const texts=[...new Set(readings.map(r=>typeof r==='string'?r:r.text).filter(Boolean))];
 return {text:texts.join('\n\n'),lines:readings.flatMap(recognizedLines),passes:readings.length,readings};
}

export function hasExpiry(result){return extractDates(typeof result==='string'?result:result.text||'').some(d=>d.kind!=='manufactured');}

export function scanSummary(result){
 const text=typeof result==='string'?result:result.text||'',dates=extractDates(text),names=extractNames(result);
 const usable=dates.filter(d=>d.kind!=='manufactured');
 const message=!text.trim()?'글자를 읽지 못했어요. 반사를 피하고 가까이 촬영하거나, 날짜 부분만 잘라 다시 읽어 주세요.':!usable.length?'글자는 읽었지만 날짜를 찾지 못했어요. 날짜 부분만 잘라 다시 읽거나 직접 입력해 주세요.':'읽은 품목명과 날짜를 포장지와 비교해 주세요.';
 return {text,dates,names,message};
}

// Preserve manually entered values and front-label information when scanning a second photo.
export function applyScan(form,result,previousAuto={},target='both'){
 const {dates,names}=scanSummary(result),usable=dates.filter(d=>d.kind!=='manufactured');
 const next={...form},auto={...previousAuto},best=names[0];
 if(target!=='date'&&best?.automatic){
  const prior=String(form.name||'').replace(/\s/g,''),candidate=best.name.replace(/\s/g,'');
  const improve=form.name===previousAuto.name&&best.score>(previousAuto.nameScore||0)+12&&!prior.includes(candidate);
  if(!form.name||improve){next.name=best.name;next.ingredient=best.ingredient;auto.name=next.name;auto.nameScore=best.score;}
 }
 if(target!=='name'){
  next.verified=false;
  if(usable.length===1&&(!form.date||form.date===previousAuto.date)){
   next.date=usable[0].date;next.dateKind=usable[0].kind;auto.date=next.date;
  }
 }
 return {form:next,auto};
}

export function reuseItem(item,newId){
 return {id:newId,name:item.name,ingredient:item.ingredient,quantity:'1',unit:item.unit,place:item.place,date:'',dateKind:'useby',verified:false,opened:false,note:'',demo:false};
}
export function previousNames(items){
 const seen=new Set();return [...items].reverse().filter(item=>{const k=item.name.replace(/\s/g,'');if(item.demo||seen.has(k))return false;seen.add(k);return true;}).slice(0,6);
}

export function scanRegions(width,height,crop='full'){
 const half=Math.floor(height/2);
 if(crop==='center')return [{x:Math.floor(width*.2),y:Math.floor(height*.25),width:Math.floor(width*.6),height:half}];
 if(crop!=='full')return [{x:0,y:crop==='top'?0:crop==='middle'?Math.floor(height/4):height-half,width,height:half}];
 const h=Math.ceil(height*.46);
 return [{x:0,y:0,width,height},...['top','middle','bottom'].map((_,i)=>({x:0,y:Math.round((height-h)*i/2),width,height:h}))];
}

export function scanSize(width,height){
 const scale=Math.min(2,3200/Math.max(width,height),Math.sqrt(6000000/(width*height)));
 return {width:Math.max(1,Math.round(width*scale)),height:Math.max(1,Math.round(height*scale))};
}
