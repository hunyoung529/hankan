import React,{useRef,useState} from 'react';
import {View,Text} from 'react-native';
import {Button,Field,colors} from './ui';
import {useI18n} from './LocaleProvider';
import {quantityLabel} from './i18n.mjs';
import {consumptionPreview} from './consumption.mjs';

export function QuickUsePanel({record,onConfirm}){
 const {t,locale}=useI18n();
 const [amount,setAmount]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const saving=useRef(false);
 let preview=null,validation='';
 if(amount.trim()){try{preview=consumptionPreview(record.data.quantity,amount);}catch(e){validation=e.message;}}
 const label=q=>quantityLabel(q,record.data.unit,locale);
 const submit=async()=>{
  if(saving.current||!preview)return;
  saving.current=true;setBusy(true);setError('');
  try{await onConfirm([{id:record.id,mutationId:record.mutationId,quantity:amount}]);}
  catch(e){setError(e.message);}
  finally{saving.current=false;setBusy(false);}
 };
 return <View style={{gap:16}}>
  <Text style={{fontSize:20,fontWeight:'700',color:colors.ink}}>{record.data.name}</Text>
  <Text>{t('현재 보유: {amount}',{amount:label(record.data.quantity)})}</Text>
  <Field testID="quick-use-amount" label={t('사용한 수량 · {unit}',{unit:t(record.data.unit)})} keyboardType="decimal-pad" editable={!busy} value={amount} onChangeText={value=>{setAmount(value);setError('');}} placeholder={t('예: 0.5')}/>
  <View style={{flexDirection:'row',gap:8}}>
   <Button secondary disabled={busy||record.data.quantity<1} testID="quick-use-one" onPress={()=>{setAmount('1');setError('');}}>{t('1만큼 사용')}</Button>
   <Button secondary disabled={busy} testID="quick-use-all" onPress={()=>{setAmount(String(record.data.quantity));setError('');}}>{t('이 제품 전부 사용')}</Button>
  </View>
  {preview&&<Text accessibilityLiveRegion="polite">{t('사용 후 남는 수량: {amount}',{amount:label(preview.remaining)})}</Text>}
  {preview?.remaining===0&&<Text>{t('전부 사용한 제품은 목록에서 빠집니다. 완료 후 되돌리기로 취소할 수 있어요.')}</Text>}
  {!!(error||validation)&&<Text accessibilityRole="alert" style={{color:'#94724e',lineHeight:21}}>{t(error||validation)}</Text>}
  <Text style={{fontSize:12,lineHeight:21,color:colors.muted}}>{t('실제 사용량을 확인하세요. 단위는 자동 환산하지 않으며, 확인 전에는 수량이 바뀌지 않아요.')}</Text>
  <Button testID="quick-use-confirm" disabled={busy||!preview} onPress={submit}>{t(busy?'저장 중…':'확인한 사용량 차감')}</Button>
 </View>;
}
