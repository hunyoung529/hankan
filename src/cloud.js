import 'react-native-url-polyfill/auto';
import {createClient} from '@supabase/supabase-js';
import storage from './sessionStorage';
const url=process.env.EXPO_PUBLIC_SUPABASE_URL||'',key=process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY||'';
export const cloudConfigured=/^https:\/\/[^/]+\.supabase\.co$/.test(url)&&key.startsWith('sb_publishable_')&&!key.includes('YOUR_KEY');
export const cloud=cloudConfigured?createClient(url,key,{auth:{storage,autoRefreshToken:true,persistSession:true,detectSessionInUrl:false,flowType:'pkce'}}):null;
export const cloudTransport=async (owner,changes)=>{
 if(!cloud)throw Error('서버 연결 정보가 아직 설정되지 않았어요.');
 const {data:{session},error}=await cloud.auth.getSession();if(error)throw error;
 if(!session||session.user.id!==owner)throw Error('계정이 변경되어 동기화를 중단했어요.');
 const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),20000);
 try{const response=await fetch(`${url}/rest/v1/rpc/sync_pantry`,{method:'POST',headers:{apikey:key,Authorization:`Bearer ${session.access_token}`,'Content-Type':'application/json'},body:JSON.stringify({p_changes:changes}),signal:controller.signal});const data=await response.json();if(!response.ok)throw Error(data.message||'서버에 연결하지 못했어요.');return data;}finally{clearTimeout(timeout)}
};
