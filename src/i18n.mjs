import {en,koOverrides} from './locales/catalog.mjs';
export const LANGUAGES=[{code:'ko',label:'한국어'},{code:'en',label:'English'}];
export const LOCALE_KEY='hankan-language-v1';
export const localeTag=locale=>locale==='ko'?'ko-KR':'en-US';
export const resolveLocale=value=>String(value||'').toLowerCase().split(/[-_]/)[0]==='ko'?'ko':'en';
export const message=(key,values={})=>({key,values});
export function createTranslator(locale){
 return (input,values={})=>{
  if(input==null)return '';
  const key=typeof input==='object'?input.key:String(input);
  const params=typeof input==='object'?input.values:values;
  const template=locale==='en'?(en[key]??key):(koOverrides[key]??key);
  return String(template).replace(/\{(\w+)\}/g,(token,k)=>Object.hasOwn(params||{},k)?String(params[k]):token);
 };
}
export function quantityLabel(quantity,unit,locale){
 if(locale==='ko')return `${quantity}${unit}`;
 const units={'개':['piece','pieces'],'팩':['pack','packs'],'봉':['bag','bags'],'단':['bunch','bunches'],'g':['g','g'],'ml':['mL','mL']};
 const forms=units[unit]||[unit,unit];return `${quantity} ${forms[Number(quantity)===1?0:1]}`;
}
export function shortDate(date,locale){
 if(!date)return '';
 if(locale==='ko')return date.slice(5).replace('-','.');
 const [y,m,d]=date.split('-').map(Number);
 return new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric'}).format(new Date(y,m-1,d,12));
}
export function createLanguageStore({storage,detectLanguage=()=>Intl.DateTimeFormat().resolvedOptions().locale}){
 let detected;try{detected=detectLanguage();}catch{detected='ko';}
 let state={locale:resolveLocale(detected),ready:false,busy:false,error:''},queue=Promise.resolve();
 const listeners=new Set(),emit=patch=>{state={...state,...patch};listeners.forEach(fn=>fn());};
 return {
  getSnapshot:()=>state,subscribe:fn=>{listeners.add(fn);return ()=>listeners.delete(fn);},
  async load(){try{const saved=await storage.getItem(LOCALE_KEY);if(LANGUAGES.some(x=>x.code===saved))emit({locale:saved});}catch{emit({error:'언어 설정을 읽지 못했어요. 기기 언어로 시작합니다.'});}finally{emit({ready:true});}},
  select(locale){
   if(!LANGUAGES.some(x=>x.code===locale))return Promise.reject(Error('Unsupported language'));
   const run=queue.then(async()=>{emit({busy:true,error:''});try{await storage.setItem(LOCALE_KEY,locale);emit({locale});}catch{emit({error:'언어 설정을 저장하지 못했어요. 다시 시도해 주세요.'});}finally{emit({busy:false});}});
   queue=run.catch(()=>{});return run;
  }
 };
}
