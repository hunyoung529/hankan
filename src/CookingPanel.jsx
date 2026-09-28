import React,{useRef,useState} from 'react';
import {View,Text,StyleSheet} from 'react-native';
import {Button,Field,Check,colors} from './ui';
import {useI18n} from './LocaleProvider';
import {quantityLabel,shortDate} from './i18n.mjs';
import {usableForCooking} from './consumption.mjs';
export function CookingPanel({records,recipe,onConfirm}){
 const {t,locale}=useI18n();
 // Capture the reviewed versions. A later edit/sync must be rejected, not silently deducted.
 const [rows]=useState(()=>records.filter(r=>!r.deleted&&!r.conflict&&recipe.ingredients.includes(r.data.ingredient)&&usableForCooking(r.data)).sort((a,b)=>a.data.date.localeCompare(b.data.date)));
 const [amounts,setAmounts]=useState({}),[selected,setSelected]=useState({}),[busy,setBusy]=useState(false),[error,setError]=useState('');const saving=useRef(false);
 const submit=async()=>{if(saving.current)return;saving.current=true;setBusy(true);setError('');try{await onConfirm(rows.filter(r=>selected[r.id]).map(r=>({id:r.id,mutationId:r.mutationId,quantity:amounts[r.id]||''})));}catch(e){setError(e.message);}finally{saving.current=false;setBusy(false);}};
 return <View style={{gap:16}}><Text style={s.body}>{t('실제로 사용한 재료만 선택하세요. 포장 단위와 무게는 자동으로 환산하지 않아요.')}</Text><Text style={s.note}>{t('날짜가 가까운 제품부터 표시해요. 날짜 미정·지남·동기화 충돌 재료는 제외합니다.')}</Text>
 {rows.map(r=><View key={r.id} style={s.card}><Check testID={`cook-select-${r.id}`} checked={!!selected[r.id]} onChange={value=>{if(!saving.current)setSelected(v=>({...v,[r.id]:value}));}}>{r.data.name}</Check><Text style={s.note}>{t(r.data.place)} · {quantityLabel(r.data.quantity,r.data.unit,locale)} · {shortDate(r.data.date,locale)}</Text>{selected[r.id]&&<><Field testID={`cook-amount-${r.id}`} label={t('사용한 수량 · {unit}',{unit:t(r.data.unit)})} editable={!busy} keyboardType="decimal-pad" value={amounts[r.id]||''} onChangeText={value=>setAmounts(v=>({...v,[r.id]:value}))} placeholder={t('예: 0.5')} /><Button secondary disabled={busy} onPress={()=>setAmounts(v=>({...v,[r.id]:String(r.data.quantity)}))}>{t('이 제품 전부 사용')}</Button></>}</View>)}
 {!rows.length&&<Text style={s.body}>{t('사용량을 기록할 재료가 없어요. 냉장고에서 날짜와 재료 분류를 확인해 주세요.')}</Text>}
 {!!error&&<Text accessibilityRole="alert" style={s.error}>{t(error)}</Text>}
 <Button testID="confirm-cooking" disabled={busy||!rows.length} onPress={submit}>{t(busy?'저장 중…':'확인한 사용량 차감')}</Button><Text style={s.note}>{t('전부 사용한 제품은 목록에서 빠집니다. 완료 후 되돌리기로 취소할 수 있어요.')}</Text></View>;
}
const s=StyleSheet.create({body:{fontSize:14,lineHeight:23,color:colors.ink},note:{fontSize:12,lineHeight:20,color:colors.muted},card:{padding:16,gap:10,borderWidth:1,borderColor:colors.line,borderRadius:16},error:{color:'#94724e',lineHeight:21}});
