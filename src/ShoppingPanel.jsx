import React,{useRef,useState} from 'react';
import {View,Text,StyleSheet} from 'react-native';
import {Button,Check,Field,Choices,colors} from './ui';
import {shoppingView,readShoppingBackup,makeShoppingBackup,planShoppingImport} from './shopping.mjs';
import {exportText,pickBackup} from './backup';
import {message} from './i18n.mjs';
import {useI18n} from './LocaleProvider';
export function ShoppingPanel({store,snapshot,onRegister}){
 const [filter,setFilter]=useState('pending'),[query,setQuery]=useState('');
 const [incoming,setIncoming]=useState(null),[backupNotice,setBackupNotice]=useState('');
 const {t,locale}=useI18n(),[name,setName]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false),[removed,setRemoved]=useState(null);const lock=useRef(false);
 const run=async fn=>{if(lock.current)return;lock.current=true;setBusy(true);setError('');try{await fn();}catch(e){setError(e.message);}finally{lock.current=false;setBusy(false);}};
 let preview=null,previewError='';if(incoming){try{preview=planShoppingImport(snapshot.items,incoming);}catch(e){previewError=e.message;}}
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
 <View style={s.backup}><Text style={s.subtitle}>{t('장보기 백업·복원')}</Text><Text style={s.note}>{t('구매 체크까지 파일에 보관해요. 냉장고 재고 백업과는 별도이며, 다른 기기에서 직접 가져올 수 있어요.')}</Text>
 <Button secondary testID="shopping-export" disabled={busy||!snapshot.ready||!!snapshot.error} onPress={()=>run(async()=>{setBackupNotice('');await exportText(makeShoppingBackup(snapshot.items),'hankan-shopping-backup.json',locale,'한칸 장보기 백업');setBackupNotice('백업 파일을 저장하거나 공유해 주세요.');})}>{t('장보기 파일 내보내기')}</Button>
 <Button secondary testID="shopping-import" disabled={busy||!snapshot.ready||!!snapshot.error} onPress={()=>run(async()=>{setBackupNotice('');const entries=await pickBackup(readShoppingBackup);if(entries)setIncoming(entries);})}>{t('장보기 파일 가져오기')}</Button>
 {!!backupNotice&&<Text accessibilityLiveRegion="polite" style={s.note}>{t(backupNotice)}</Text>}
 {incoming&&<View style={s.backup}><Text style={s.subtitle}>{t('가져올 장보기 확인')}</Text><Text style={s.note}>{t('파일의 항목 {count}개를 확인했어요.',{count:incoming.length})}</Text>{preview&&<Text style={s.note}>{t('새 항목 {added}개 · 중복 {skipped}개 건너뛰기',{added:preview.added,skipped:preview.skipped})}</Text>}<Text style={s.note}>{t('중복 항목의 현재 이름과 구매 체크는 유지해요. 새 항목만 추가합니다.')}</Text>
 {incoming.slice(0,5).map(item=><Text key={item.id} style={s.note}>{item.ingredient?t(item.ingredient):item.name} · {t(item.checked?'구매 완료':'구매 예정')}</Text>)}
 {incoming.length>5&&<Text style={s.note}>{t('외 {count}개 항목',{count:incoming.length-5})}</Text>}
 {!!previewError&&<Text style={s.error}>{t(previewError)}</Text>}
 <Button testID="shopping-import-confirm" disabled={busy||!preview?.added||!!snapshot.error} onPress={()=>run(async()=>{const result=await store.importItems(incoming);setIncoming(null);setFilter('all');setQuery('');setBackupNotice(message('장보기 {added}개를 가져왔어요. 중복 {skipped}개는 유지했어요.',result));})}>{t('확인하고 장보기 가져오기')}</Button>
 <Button secondary testID="shopping-import-cancel" disabled={busy} onPress={()=>setIncoming(null)}>{t('취소')}</Button></View>}
 </View>
 {removed&&<Button secondary testID="shopping-undo" disabled={busy} onPress={()=>run(async()=>{await store.restore(removed);setRemoved(null);})}>{t('마지막 삭제 되돌리기')}</Button>}
 </View>;
}
const s=StyleSheet.create({title:{fontSize:27,fontWeight:'700',color:colors.ink},note:{fontSize:12,lineHeight:21,color:colors.muted},card:{paddingVertical:10,borderBottomWidth:1,borderColor:colors.line,gap:8},row:{flexDirection:'row',alignItems:'center',gap:12},backup:{gap:12,paddingTop:18,borderTopWidth:1,borderColor:colors.line},subtitle:{fontSize:18,fontWeight:'700',color:colors.ink},error:{color:'#94724e',lineHeight:21}});
