import React,{useRef,useState} from 'react';
import {View,Text,StyleSheet} from 'react-native';
import {Button,Check,Field,Choices,colors} from './ui';
import {shoppingView} from './shopping.mjs';
import {useI18n} from './LocaleProvider';
export function ShoppingPanel({store,snapshot,onRegister}){
 const [filter,setFilter]=useState('pending'),[query,setQuery]=useState('');
 const {t}=useI18n(),[name,setName]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false),[removed,setRemoved]=useState(null);const lock=useRef(false);
 const run=async fn=>{if(lock.current)return;lock.current=true;setBusy(true);setError('');try{await fn();}catch(e){setError(e.message);}finally{lock.current=false;setBusy(false);}};
 const displayed=shoppingView(snapshot.items.map(item=>({...item,displayName:item.ingredient?t(item.ingredient):item.name})),filter,query);
 return <View style={{gap:16}}><Text style={s.title}>{t('장보기 목록')}</Text><Text style={s.note}>{t('이 기기에 계정별로 보관해요. 장보기 목록은 아직 다른 기기와 동기화되지 않아요.')}</Text><Text style={s.note}>{t('구매 완료로 표시해도 냉장고에 자동 등록되지 않아요. 제품 날짜를 확인하고 재료로 등록하세요.')}</Text>
 <Text style={s.note}>{t('구매 예정 {pending}개 · 구매 완료 {bought}개',{pending:snapshot.items.filter(x=>!x.checked).length,bought:snapshot.items.filter(x=>x.checked).length})}</Text>
 <Field testID="shopping-name" label={t('장볼 재료')} value={name} onChangeText={setName} editable={!busy&&snapshot.ready&&!snapshot.error} maxLength={50} placeholder={t('예: 두부 1팩')} />
 <Button testID="shopping-add" disabled={busy||!snapshot.ready||!!snapshot.error} onPress={()=>run(async()=>{if(!name.trim())throw Error('장볼 재료 이름을 입력해 주세요.');await store.add([{name}]);setName('');setFilter('pending');setQuery('');})}>{t('목록에 추가')}</Button>
 {!!(snapshot.error||error)&&<Text accessibilityRole="alert" style={s.error}>{t(snapshot.error||error)}</Text>}
 {!snapshot.ready&&<Text style={s.note}>{t('목록을 불러오고 있어요…')}</Text>}
 {snapshot.ready&&!snapshot.error&&!snapshot.items.length&&<Text style={s.note}>{t('필요한 재료를 적거나 레시피에서 부족한 재료를 추가해 보세요.')}</Text>}
 <Choices testID="shopping-filter" values={[["pending","구매 예정"],["bought","구매 완료"],["all","전체"]]} value={filter} onChange={setFilter} labelFor={t}/>
 <Field testID="shopping-search" label={t('장보기 검색')} value={query} onChangeText={setQuery}/>
 {snapshot.ready&&!snapshot.error&&snapshot.items.length>0&&!displayed.length&&<Text style={s.note}>{t('이 조건에 맞는 장보기 항목이 없어요.')}</Text>}
 {displayed.map(item=><View key={item.id} style={s.card}><View style={s.row}><View style={{flex:1}}><Check testID={`shopping-check-${item.id}`} checked={item.checked} onChange={checked=>run(()=>store.check(item.id,checked))}>{item.ingredient?t(item.ingredient):item.name}</Check><Text style={s.note}>{t(item.checked?'구매 완료':'구매 예정')}</Text></View><Button secondary disabled={busy} testID={`shopping-remove-${item.id}`} onPress={()=>run(async()=>{setRemoved(await store.remove(item.id));})}>{t('삭제')}</Button></View>{item.checked&&<Button testID={`shopping-register-${item.id}`} secondary disabled={busy||!snapshot.ready||!!snapshot.error} onPress={()=>onRegister(item)}>{t('냉장고 등록 화면 열기')}</Button>}</View>)}
 <Text style={s.note}>{t('구매 완료 탭에서 냉장고 등록을 시작할 수 있어요. 등록 후에도 장보기 목록은 유지됩니다.')}</Text>
 {removed&&<Button secondary testID="shopping-undo" disabled={busy} onPress={()=>run(async()=>{await store.restore(removed);setRemoved(null);})}>{t('마지막 삭제 되돌리기')}</Button>}
 </View>;
}
const s=StyleSheet.create({title:{fontSize:27,fontWeight:'700',color:colors.ink},note:{fontSize:12,lineHeight:21,color:colors.muted},card:{paddingVertical:10,borderBottomWidth:1,borderColor:colors.line,gap:8},row:{flexDirection:'row',alignItems:'center',gap:12},error:{color:'#94724e',lineHeight:21}});
