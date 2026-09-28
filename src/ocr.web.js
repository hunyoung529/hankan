import {scanSize} from './label.mjs';
import {runLabelPipeline} from './ocrPipeline.mjs';
export const ocrSupported=true;
let loading;
async function engine(){if(window.Tesseract)return window.Tesseract;if(!loading)loading=new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='/vendor/tesseract.min.js';script.onload=()=>resolve(window.Tesseract);script.onerror=()=>{loading=null;reject(Error('사진 인식 파일을 읽지 못했어요.'))};document.head.appendChild(script)});return loading;}
export async function readLabel(asset,crop='full',options={}){
 const Tesseract=await engine(),image=new Image();image.src=asset.uri;await image.decode();
 const started=Date.now();
 let worker,expired=false,timer;
 const check=()=>{if(expired||options.isCancelled?.())throw Error('사진 인식을 중단했어요.');};
 const task=(async()=>{
  const local=await Tesseract.createWorker(['kor','eng'],1,{workerPath:new URL('/vendor/worker.min.js',location.href).href,corePath:new URL('/vendor/core/',location.href).href,langPath:new URL('/vendor/lang/',location.href).href,gzip:false});
  if(expired){await local.terminate();throw Error('중단됨');}worker=local;
  const run=async(region,mode)=>{
   const enhanced=mode!=='standard';
   check();const canvas=document.createElement('canvas'),size=scanSize(region.width,region.height);canvas.width=size.width;canvas.height=size.height;
   const ctx=canvas.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,canvas.width,canvas.height);
   ctx.filter=enhanced?'grayscale(1) contrast(1.35)':'none';ctx.drawImage(image,region.x,region.y,region.width,region.height,0,0,canvas.width,canvas.height);
   await worker.setParameters({tessedit_pageseg_mode:enhanced?'6':'11'});
   const {data}=await worker.recognize(canvas,{}, {text:true,blocks:true});check();
   const lines=(data.blocks||[]).flatMap((b,block)=>(b.paragraphs||[]).flatMap(p=>(p.lines||[]).map(l=>({text:l.text,block,x:l.bbox?.x0,y:l.bbox?.y0,width:l.bbox?.x1-l.bbox?.x0||0,height:l.bbox?.y1-l.bbox?.y0||0}))));
   canvas.width=canvas.height=1;return {text:data.text,lines};
  };
  return await runLabelPipeline({width:image.naturalWidth,height:image.naturalHeight,crop,target:options.target||'both',recognize:run,onProgress:options.onProgress,isCancelled:()=>expired||!!options.isCancelled?.(),canContinue:()=>Date.now()-started<45000});
 })();
 try{return await Promise.race([task,new Promise((_,reject)=>{timer=setTimeout(()=>{expired=true;reject(Error('사진 인식 시간이 길어 중단했어요. 날짜 부분을 잘라 다시 읽어 주세요.'));},60000);})]);}
 finally{expired=true;clearTimeout(timer);if(worker)await worker.terminate();}
}
