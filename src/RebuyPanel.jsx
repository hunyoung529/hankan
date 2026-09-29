import React,{useEffect,useRef,useState} from 'react';
import {View,Text} from 'react-native';
import {Button,colors} from './ui';
import {useI18n} from './LocaleProvider';
export function RebuyPanel({name,onAdd,disabled=false}){
 const {t}=useI18n();
 const [busy,setBusy]=useState(false),[notice,setNotice]=useState(''),[error,setError]=useState('');
 const lock=useRef(false),active=useRef(true);
 useEffect(()=>()=>{active.current=false;},[]);
 const add=async()=>{
  if(lock.current||disabled)return;
  lock.current=true;setBusy(true);setNotice('');setError('');
  try{const changed=await onAdd();if(active.current)setNotice(changed?'구매 예정 목록에 담았어요. 장보기 탭에서 확인하세요.':'이미 구매 예정 목록에 있어요. 중복으로 추가하지 않았어요.');}
  catch(e){if(active.current)setError(e.message);}
  finally{lock.current=false;if(active.current)setBusy(false);}
 };
 return <View style={{padding:16,gap:10,backgroundColor:'#edf1e7',borderRadius:16}}>
  <Text style={{fontSize:16,fontWeight:'700',color:colors.ink}}>{t('다시 살 재료')}</Text>
  <Text style={{color:colors.ink}}>{name}</Text>
  <Text style={{fontSize:12,lineHeight:20,color:colors.muted}}>{t('저장된 제품 이름만 장보기에 담아요. 냉장고 수량과 날짜, 수정 중인 내용은 바뀌지 않아요.')}</Text>
  <Button testID="rebuy-add" disabled={disabled||busy} onPress={add}>{t(busy?'담는 중…':'이 이름으로 장보기 담기')}</Button>
  <Text style={{fontSize:12,lineHeight:20,color:colors.muted}}>{t('같은 이름은 하나로 모으고, 구매 완료 항목은 다시 구매 예정으로 바꿔요.')}</Text>
  {!!notice&&<Text testID="rebuy-notice" accessibilityLiveRegion="polite" style={{color:colors.green,lineHeight:21}}>{t(notice)}</Text>}
  {!!error&&<Text accessibilityRole="alert" style={{color:'#94724e',lineHeight:21}}>{t(error)}</Text>}
 </View>;
}
