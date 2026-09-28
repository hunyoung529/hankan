import {requireOptionalNativeModule} from 'expo-modules-core';
import {manipulateAsync,SaveFormat} from 'expo-image-manipulator';
import {File} from 'expo-file-system';
import {scanSize} from './label.mjs';
import {runLabelPipeline} from './ocrPipeline.mjs';
const module=requireOptionalNativeModule('HankanOcr');
export const ocrSupported=!!module?.recognizeDetails;

export async function readLabel(asset,crop='full',options={}){
 if(!ocrSupported)throw Error('사진 인식은 최신 한칸 설치형 앱에서 사용할 수 있어요. Expo Go에서는 직접 입력해 주세요.');
 const started=Date.now();
 let expired=false,timer;
 const check=()=>{if(expired||options.isCancelled?.())throw Error('사진 인식을 중단했어요.');};
 const run=async(region,mode)=>{
  check();const size=scanSize(region.width,region.height);
  const prepared=await manipulateAsync(asset.uri,[{crop:{originX:region.x,originY:region.y,width:region.width,height:region.height}},{resize:size}],{compress:1,format:SaveFormat.PNG});
  try{check();const result=await module.recognizeDetails(prepared.uri,mode!=='standard',mode==='date');check();return result;}
  finally{try{new File(prepared.uri).delete();}catch{}}
 };
 const task=runLabelPipeline({width:asset.width,height:asset.height,crop,target:options.target||'both',recognize:run,onProgress:options.onProgress,isCancelled:()=>expired||!!options.isCancelled?.(),canContinue:()=>Date.now()-started<45000});
 try{return await Promise.race([task,new Promise((_,reject)=>{timer=setTimeout(()=>{expired=true;reject(Error('사진 인식 시간이 길어 중단했어요. 날짜 부분을 잘라 다시 읽어 주세요.'));},60000);})]);}
 finally{clearTimeout(timer);}
}
