import {normalizeItem} from './domain.mjs';
import {planConsumption,planRestore,CHANGED} from './consumption.mjs';
export const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const storageKey=owner=>`hankan-mobile-v1:${owner||'guest'}`;
export const visibleItems=records=>records.filter(r=>!r.deleted).map(r=>r.data);
export const changesFor=records=>records.filter(r=>r.dirty&&!r.conflict).slice(0,100).map(r=>({id:r.id,mutation_id:r.mutationId,base_version:r.version,data:r.data,deleted:r.deleted}));
function parseRecord(r){
 if(!UUID.test(r.id)||!UUID.test(r.mutationId)||!Number.isInteger(r.version)||r.version<0||typeof r.deleted!=='boolean'||typeof r.dirty!=='boolean')throw Error('저장 기록 형식이 올바르지 않아요.');
 const data=normalizeItem(r.data);if(data.id!==r.id)throw Error('재료 기록 번호가 일치하지 않아요.');
 return {...r,data};
}
function fromServer(r){return parseRecord({id:r.id,data:r.data,version:r.version,mutationId:r.mutation_id,deleted:r.deleted,dirty:false,conflict:null});}
export function mergeSync(local,result){
 if(!Array.isArray(result.records)||!Array.isArray(result.applied)||!Array.isArray(result.conflicts))throw Error('서버 응답을 확인할 수 없어요.');
 const remote=new Map(result.records.map(r=>[r.id,fromServer(r)]));
 const applied=new Map(result.applied.map(r=>[r.id,r]));
 const merged=local.map(r=>{
  const server=remote.get(r.id);remote.delete(r.id);if(!server)return r;
  if(!r.dirty)return server;
  const ack=applied.get(r.id);
  if(ack&&ack.mutation_id===r.mutationId)return server;
  // A newer local edit made during the network request must survive its acknowledgement.
  if(ack&&server.mutationId===ack.mutation_id)return {...r,version:server.version,conflict:null};
  if(server.version!==r.version)return {...r,conflict:server};
  return r;
 });return [...merged,...remote.values()];
}
export function createRepository({owner=null,storage,newId}){
 let state={records:[],ready:false,error:null},chain=Promise.resolve(),inflight=null;
 const listeners=new Set(),key=storageKey(owner),emit=()=>listeners.forEach(fn=>fn());
 const queue=fn=>{const task=chain.then(fn);chain=task.catch(()=>{});return task;};
 const persist=async records=>{await storage.setItem(key,JSON.stringify({format:'hankan-mobile-v1',records}));state={records,ready:true,error:null};emit();};
 const guard=()=>{if(!state.ready||state.error)throw Error('저장 데이터를 읽지 못했어요. 원본을 백업한 뒤 복구해 주세요.');};
 return {
  owner,subscribe(fn){listeners.add(fn);return ()=>listeners.delete(fn)},getSnapshot:()=>state,
  load:()=>queue(async()=>{try{const raw=await storage.getItem(key);let records=[];if(raw){const data=JSON.parse(raw);if(data.format!=='hankan-mobile-v1'||!Array.isArray(data.records))throw Error('Invalid storage');records=data.records.map(parseRecord);if(new Set(records.map(r=>r.id)).size!==records.length)throw Error('Duplicate records');}state={records,ready:true,error:null};}catch{state={records:[],ready:true,error:'기록을 읽지 못해 원본 보호를 위해 저장을 멈췄어요.'};}emit()}),
  save:(raw,expectedMutation)=>queue(async()=>{guard();const item=normalizeItem({...raw,id:raw.id||newId()});if(!UUID.test(item.id))throw Error('재료 기록 번호를 확인해 주세요.');const old=state.records.find(r=>r.id===item.id);if(expectedMutation!==undefined&&(!old||old.deleted||old.conflict||old.mutationId!==expectedMutation))throw Error(CHANGED);if((!old||old.deleted)&&visibleItems(state.records).length>=100)throw Error('재료는 최대 100개까지 보관할 수 있어요.');const record={...old,id:item.id,data:item,version:old?.version||0,mutationId:newId(),deleted:false,dirty:true,conflict:old?.conflict||null};await persist([...state.records.filter(r=>r.id!==item.id),record]);return item;}),
  consume:selections=>queue(async()=>{guard();const result=planConsumption(state.records,selections,newId);await persist(result.records);return {owner,entries:result.receipt};}),
  restoreConsumption:receipt=>queue(async()=>{guard();if(receipt?.owner!==owner)throw Error(CHANGED);await persist(planRestore(state.records,receipt.entries,newId));}),
  remove:id=>queue(async()=>{guard();const old=state.records.find(r=>r.id===id);if(!old)return;await persist(state.records.map(r=>r.id===id?{...r,deleted:true,dirty:true,mutationId:newId()}:r));return old.data}),
  importItems:incoming=>queue(async()=>{guard();const existing=new Set(state.records.map(r=>r.id));const newItems=incoming.filter(i=>!existing.has(i.id)).map(normalizeItem);if(visibleItems(state.records).length+newItems.length>100)throw Error('가져오면 최대 100개를 초과해요.');const records=newItems.map(data=>({id:data.id,data,version:0,mutationId:newId(),deleted:false,dirty:true,conflict:null}));records.forEach(parseRecord);await persist([...state.records,...records]);return newItems.length;}),
  resolve:(id,choice)=>queue(async()=>{guard();const old=state.records.find(r=>r.id===id);if(!old?.conflict)return;const next=choice==='server'?old.conflict:{...old,version:old.conflict.version,mutationId:newId(),conflict:null};await persist(state.records.map(r=>r.id===id?next:r));}),
  sync(transport){if(inflight)return inflight;inflight=(async()=>{const changes=await queue(async()=>{guard();return changesFor(state.records)});const result=await transport(changes);await queue(async()=>{guard();await persist(mergeSync(state.records,result))});return result;})().finally(()=>{inflight=null});return inflight},
  raw:()=>storage.getItem(key)
 };
}
