import * as SecureStore from 'expo-secure-store';
import {randomUUID} from 'expo-crypto';
// Publish a manifest only after all chunks are securely stored, so interrupted writes keep the old session.
let queue=Promise.resolve();
const serial=fn=>{const result=queue.then(fn);queue=result.catch(()=>{});return result};
const manifestKey=key=>key.replace(/[^\w.-]/g,'_')+'.manifest';
const read=async key=>JSON.parse(await SecureStore.getItemAsync(manifestKey(key))||'null');
const clear=async meta=>{if(meta)await Promise.all(Array.from({length:meta.parts},(_,i)=>SecureStore.deleteItemAsync(`${meta.generation}.${i}`)))};
export default {
 getItem:key=>serial(async()=>{const m=await read(key);if(!m)return null;const chunks=await Promise.all(Array.from({length:m.parts},(_,i)=>SecureStore.getItemAsync(`${m.generation}.${i}`)));if(chunks.some(x=>x===null))return null;return chunks.join('')}),
 setItem:(key,value)=>serial(async()=>{const previous=await read(key),m={generation:'hankan-'+randomUUID(),parts:Math.ceil(value.length/500)};try{for(let i=0;i<m.parts;i++)await SecureStore.setItemAsync(`${m.generation}.${i}`,value.slice(i*500,(i+1)*500));await SecureStore.setItemAsync(manifestKey(key),JSON.stringify(m));}catch(e){await clear(m).catch(()=>{});throw e}await clear(previous).catch(()=>{})}),
 removeItem:key=>serial(async()=>{const m=await read(key);await SecureStore.deleteItemAsync(manifestKey(key));await clear(m)})
};
