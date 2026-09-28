import {scanRegions,combineReadings,hasExpiry,hasReliableName} from './label.mjs';

// Date and name recovery are independent: finding a date does not end name recognition.
export async function runLabelPipeline({width,height,crop='full',target='both',recognize,onProgress=()=>{},isCancelled=()=>false,canContinue=()=>true}){
 const readings=[],regions=scanRegions(width,height,crop),done=new Set();
 const result=()=>combineReadings(readings);
 const dateMissing=()=>target!=='name'&&!hasExpiry(result());
 const nameMissing=()=>target!=='date'&&!hasReliableName(result());
 const pass=async(region,mode,message)=>{
  if(isCancelled())throw Error('사진 인식을 중단했어요.');
  if(readings.length&&!canContinue())return false;
  const key=JSON.stringify([region,mode]);if(done.has(key))return false;done.add(key);
  onProgress(message);
  try{
   const data=await recognize(region,mode);
   if(isCancelled())throw Error('사진 인식을 중단했어요.');
   readings.push({...data,role:mode==='date'?'date':'name',cropped:crop!=='full'||region.width!==width||region.height!==height});
  }catch(error){if(!readings.length||isCancelled())throw error;}
  return true;
 };
 await pass(regions[0],'standard',target==='name'?'제품 이름을 읽고 있어요…':'품목명과 날짜를 읽고 있어요…');
 if(dateMissing())await pass(regions[0],'date','날짜 숫자를 선명하게 보정하고 있어요…');
 if(dateMissing())for(const region of regions.slice(1)){
  await pass(region,'standard','작은 날짜를 확대해서 확인하고 있어요…');
  if(!dateMissing())break;
 }
 if(nameMissing())await pass(regions[0],'name','품목명을 다시 읽고 브랜드·원재료와 구분하고 있어요…');
 if(nameMissing()&&crop==='full'){
  const center=scanRegions(width,height,'center')[0];
  await pass(center,'name','가운데 제품 이름을 확대해서 확인하고 있어요…');
 }
 return result();
}
