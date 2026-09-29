import React,{useEffect,useRef,useState} from 'react';
import {View,Text} from 'react-native';
import {Button,colors} from './ui';
import {useI18n} from './LocaleProvider';
import {localeTag} from './i18n.mjs';
import {reminderPlan} from './reminderPlan.mjs';
import {remindersSupported,sendTestReminder} from './reminders';
export function ReminderPreview({items,enabled}){
 const {t,locale}=useI18n(),[now,setNow]=useState(()=>new Date()),[busy,setBusy]=useState(false),[notice,setNotice]=useState('');
 const lock=useRef(false),alive=useRef(true);
 useEffect(()=>{alive.current=true;const timer=setInterval(()=>setNow(new Date()),60000);return()=>{alive.current=false;clearInterval(timer);};},[]);
 const plan=reminderPlan(items,now,locale);
 const test=async()=>{if(lock.current)return;lock.current=true;setBusy(true);setNotice('');try{await sendTestReminder(locale);if(alive.current)setNotice('테스트 알림을 요청했어요. 알림창에 보이는지 확인하세요.');}catch(e){if(alive.current)setNotice(e.message);}finally{lock.current=false;if(alive.current)setBusy(false);}};
 return <View style={{gap:12}}>
  <Text style={{fontWeight:'700',color:colors.ink}}>{t('다가오는 알림 미리보기')}</Text>
  <Text style={{fontSize:12,lineHeight:20,color:colors.muted}}>{t(enabled?'예상 일정입니다. 권한·절전 설정에 따라 실제 전달이 달라질 수 있어요.':'알림이 꺼져 있어 아래는 켰을 때의 예상 일정입니다.')}</Text>
  {plan.slice(0,3).map(entry=><View key={entry.time} style={{gap:4}}><Text style={{color:colors.ink}}>{new Date(entry.time).toLocaleString(localeTag(locale),{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'})}</Text><Text style={{color:colors.muted,fontSize:12}}>{entry.body}</Text></View>)}
  {!plan.length&&<Text style={{color:colors.muted}}>{t('예정된 날짜 알림이 없어요. 확인한 날짜와 오전 9시 일정을 확인하세요.')}</Text>}
  {plan.length>3&&<Text>{t('이후 날짜별 알림 {count}개 더 있음',{count:plan.length-3})}</Text>}
  <Button secondary testID="test-reminder" disabled={!remindersSupported||busy} onPress={test}>{t('테스트 알림 보내기')}</Button>
  <Text style={{fontSize:12,lineHeight:20,color:colors.muted}}>{t('테스트는 한 번만 전송하며 날짜 알림 켜짐 설정은 바꾸지 않아요.')}</Text>
  {!!notice&&<Text accessibilityLiveRegion="polite" style={{color:colors.green,lineHeight:21}}>{t(notice)}</Text>}
 </View>;
}
