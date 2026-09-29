import React, { useState, useEffect, useMemo, useCallback, useRef, useSyncExternalStore } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet, Modal, KeyboardAvoidingView, Platform, ActivityIndicator, Image, AppState, RefreshControl, Switch, Linking } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { randomUUID } from 'expo-crypto';
import * as ImagePicker from 'expo-image-picker';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { INGREDIENTS, today, daysLeft, inferIngredient, normalizeItem } from './src/domain.mjs';
import {pantryView} from './src/pantryView.mjs';
import { recommend } from './src/domain.mjs';
import { createRepository, visibleItems } from './src/repository.mjs';
import { cloud, cloudConfigured, cloudTransport } from './src/cloud';
import { askReminders, refreshReminders, remindersSupported } from './src/reminders';
import { ocrSupported, readLabel } from './src/ocr';
import { scanSummary, applyScan, scanRegions, reuseItem, previousNames } from './src/label.mjs';
import { exportText, pickBackup } from './src/backup';
import { Button, Choices, Field, Check, FoodIcon, Fridge, colors } from './src/ui';
import { LocaleProvider, useI18n } from './src/LocaleProvider';
import { LANGUAGES, message, quantityLabel, shortDate, localeTag } from './src/i18n.mjs';
import { APP_VERSION, ANDROID_BUILD, IOS_BUILD } from './src/version';
import {createShoppingStore,shoppingDraft} from './src/shopping.mjs';
import {QuickUsePanel} from './src/QuickUsePanel';
import {usableForCooking} from './src/consumption.mjs';
import {CookingPanel} from './src/CookingPanel';
import {ShoppingPanel} from './src/ShoppingPanel';

const KIND = {
  useby: '소비기한',
  sellby: '유통기한',
  unknown: '표시 종류 확인',
  manufactured: '제조·포장일'
};
const blank = () => ({
  id: randomUUID(),
  name: '',
  ingredient: '기타',
  quantity: '1',
  unit: '개',
  place: '냉장',
  date: '',
  dateKind: 'useby',
  verified: false,
  opened: false,
  note: '',
  demo: false
});
export default function App() {
  return <SafeAreaProvider><LocaleProvider><Application /></LocaleProvider></SafeAreaProvider>;
}
function Application() {
  const {
    t,
    locale,
    setLanguage,
    busy: languageBusy,
    error: languageError
  } = useI18n();
  const [session, setSession] = useState(null),
    [authReady, setAuthReady] = useState(!cloud),
    [authError, setAuthError] = useState('');
  const owner = session?.user.id || null,
    repo = useMemo(() => createRepository({
      owner,
      storage: AsyncStorage,
      newId: randomUUID
    }), [owner]);
  const snapshot = useSyncExternalStore(repo.subscribe, repo.getSnapshot, repo.getSnapshot),
    items = useMemo(() => visibleItems(snapshot.records), [snapshot.records]);
  const activeRepo = useRef(repo),
    scroll = useRef(null);
  activeRepo.current = repo;
  const [page, setPage] = useState('pantry'),
    [filter, setFilter] = useState('전체'),
    [pantryStatus,setPantryStatus]=useState('all'),
    [pantrySort,setPantrySort]=useState('expiry'),
    [search, setSearch] = useState(''),
    [notice, setNotice] = useState(''),
    [undo, setUndo] = useState(null);
  const [editor, setEditor] = useState(null),
    [recipeSelection, setRecipe] = useState(null),
    [network, setNetwork] = useState({
      busy: false,
      error: '',
      time: null
    });
  const [email, setEmail] = useState(''),
    [password, setPassword] = useState(''),
    [authBusy, setAuthBusy] = useState(false),
    [authMessage, setAuthMessage] = useState('');
  const [notifyEnabled, setNotifyEnabled] = useState(false),
    [notifyReady, setNotifyReady] = useState(false),
    [notifyInfo, setNotifyInfo] = useState(''),
    [importPreview, setImportPreview] = useState(null);
  const [day, setDay] = useState(today());
  useEffect(() => {
    scroll.current?.scrollTo({
      y: 0,
      animated: false
    });
  }, [page, repo]);
  useEffect(() => {
    if (!cloud) return;
    let alive = true;
    cloud.auth.getSession().then(({
      data,
      error
    }) => {
      if (alive) {
        setSession(data.session);
        setAuthError(error ? '로그인 상태를 읽지 못했어요. 다시 로그인해 주세요.' : '');
        setAuthReady(true);
      }
    }).catch(() => {
      if (alive) {
        setAuthError('로그인 상태를 읽지 못했어요.');
        setAuthReady(true);
      }
    });
    const {
      data: {
        subscription
      }
    } = cloud.auth.onAuthStateChange((_event, value) => {
      if (alive) {
        setSession(value);
        setAuthReady(true);
      }
    });
    return () => {
      alive = false;
      subscription.unsubscribe();
    };
  }, []);
  useEffect(() => {
    if (!cloud) return;
    let alive = true;
    const handle = async value => {
      try {
        if (!value) return;
        const url = new URL(value);
        const allowed = Platform.OS === 'web' ? url.origin === window.location.origin : url.protocol === 'hankan:' && url.hostname === 'auth';
        if (!allowed) return;
        const code = url.searchParams.get('code');
        if (!code) return;
        const {
          error
        } = await cloud.auth.exchangeCodeForSession(code);
        if (Platform.OS === 'web') window.history.replaceState(null, '', window.location.pathname);
        if (alive) setAuthMessage(error ? '인증 링크를 처리하지 못했어요. 메일 인증 후 이메일과 비밀번호로 로그인해 주세요.' : '메일 인증을 완료했어요.');
      } catch {
        if (alive) setAuthMessage('메일 인증 후 이메일과 비밀번호로 로그인해 주세요.');
      }
    };
    Linking.getInitialURL().then(handle);
    const listener = Linking.addEventListener('url', e => handle(e.url));
    return () => {
      alive = false;
      listener.remove();
    };
  }, []);
  useEffect(() => {
    repo.load();
    setNetwork({
      busy: false,
      error: '',
      time: null
    });
    setEditor(null);
    setImportPreview(null);
    setUndo(null);
    setRecipe(null);
  }, [repo]);
  useEffect(() => {
    AsyncStorage.getItem('hankan-alerts-v1').then(v => setNotifyEnabled(v === 'true')).catch(() => {}).finally(() => setNotifyReady(true));
  }, []);
  const sync = useCallback(async () => {
    if (!owner || !cloud || !repo.getSnapshot().ready || repo.getSnapshot().error) return;
    setNetwork(s => ({
      ...s,
      busy: true,
      error: ''
    }));
    try {
      await repo.sync(changes => cloudTransport(owner, changes));
      if (activeRepo.current === repo) setNetwork({
        busy: false,
        error: '',
        time: new Date()
      });
    } catch (e) {
      if (activeRepo.current === repo) setNetwork(s => ({
        ...s,
        busy: false,
        error: '서버 연결을 확인해 주세요. 변경 내용은 기기에 보관했어요.'
      }));
    }
  }, [repo, owner]);
  const pending = snapshot.records.filter(r => r.dirty && !r.conflict),
    conflicts = snapshot.records.filter(r => r.conflict),
    pendingSignature = pending.map(r => r.mutationId).join(',');
  useEffect(() => {
    if (!snapshot.ready || snapshot.error || !authReady) return;
    const timer = setTimeout(sync, 700);
    return () => clearTimeout(timer);
  }, [sync, pendingSignature, snapshot.ready, snapshot.error, authReady]);
  useEffect(() => {
    const listener = AppState.addEventListener('change', state => {
      if (state === 'active') {
        setDay(today());
        cloud?.auth.startAutoRefresh();
        sync();
      } else cloud?.auth.stopAutoRefresh();
    });
    const timer = setInterval(() => setDay(today()), 60000);
    return () => {
      listener.remove();
      clearInterval(timer);
    };
  }, [sync]);
  useEffect(() => {
    let active = true;
    if (notifyReady && authReady && snapshot.ready) {
      refreshReminders(items, notifyEnabled, locale).then(n => {
        if (active) setNotifyInfo(notifyEnabled ? message('날짜별 알림 {count}개 예약됨', {
          count: n
        }) : '알림이 꺼져 있어요.');
      }).catch(e => {
        if (active) setNotifyInfo(e.message);
      });
    }
    return () => {
      active = false;
    };
  }, [items, notifyEnabled, notifyReady, authReady, snapshot.ready, day, locale]);
  useEffect(() => () => {
    refreshReminders([], false).catch(() => {});
  }, [repo]);
  const run = async fn => {
    try {
      await fn();
    } catch (e) {
      setNotice(e.message || '완료하지 못했어요. 다시 시도해 주세요.');
    }
  };
  const remove = async id => {
    const data = await repo.remove(id);
    if (data) {
      setUndo({
        repo,
        data
      });
      setNotice(message('{name} · 사용 완료로 표시했어요.', {
        name: data.name
      }));
    }
  };
  const demo = () => run(async () => {
    const specs = [['부침용 두부', '두부', 2, 1, '팩', '냉장'], ['달걀', '달걀', 5, 6, '개', '냉장'], ['당근', '당근', 3, 2, '개', '냉장'], ['양파', '양파', 8, 3, '개', '실온'], ['냉동 밥', '밥', 20, 2, '개', '냉동'], ['플레인 요거트', '요거트', -1, 1, '개', '냉장']];
    const list = specs.map(([name, ingredient, n, quantity, unit, place]) => {
      const d = new Date();
      d.setDate(d.getDate() + n);
      const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      return normalizeItem({
        id: randomUUID(),
        name,
        ingredient,
        quantity,
        unit,
        place,
        date,
        verified: true,
        dateKind: 'useby',
        demo: true
      });
    });
    await repo.importItems(list);
  });
  const auth = async signup => {
    if (!cloud) return;
    setAuthBusy(true);
    setAuthMessage('');
    try {
      if (!email.trim() || password.length < 8) throw Error('이메일과 8자 이상의 비밀번호를 입력해 주세요.');
      const {
        data,
        error
      } = signup ? await cloud.auth.signUp({
        email: email.trim(),
        password,
        options: {
          emailRedirectTo: Platform.OS === 'web' ? window.location.origin : 'hankan://auth'
        }
      }) : await cloud.auth.signInWithPassword({
        email: email.trim(),
        password
      });
      if (error) throw error;
      setPassword('');
      setAuthMessage(signup && !data.session ? '확인 메일을 보냈어요. 메일 인증을 마친 뒤 여기서 로그인해 주세요.' : '로그인했어요. 내 재료를 동기화합니다.');
    } catch (e) {
      setAuthMessage(e.message);
    } finally {
      setAuthBusy(false);
    }
  };
  const toggleAlerts = value => run(async () => {
    if (value && !(await askReminders(locale))) throw Error('휴대폰 설정에서 한칸 알림을 허용해 주세요.');
    await AsyncStorage.setItem('hankan-alerts-v1', String(value));
    setNotifyEnabled(value);
  });
  const sorted=pantryView(items,{place:filter,status:pantryStatus,sort:pantrySort,query:search,day,locale,translate:t});
  const resetPantryView=()=>{setFilter('전체');setPantryStatus('all');setPantrySort('expiry');setSearch('');};
  const recipes = recommend(items, day, true);
  const recipe=recipes.find(r=>r.id===recipeSelection?.id)||null;
  const [quickUse,setQuickUse]=useState(null);
  const [cooking,setCooking]=useState(null),[recipeBusy,setRecipeBusy]=useState(false),[recipeError,setRecipeError]=useState('');
  useEffect(()=>setRecipeError(''),[recipeSelection]);
  const shopping=useMemo(()=>createShoppingStore({owner,storage:AsyncStorage,newId:randomUUID}),[owner]);
  const shoppingSnapshot=useSyncExternalStore(shopping.subscribe,shopping.getSnapshot,shopping.getSnapshot);
  const shoppingActive=useRef(shopping),recipeLock=useRef(false);shoppingActive.current=shopping;
  useEffect(()=>{shopping.load();setCooking(null);setQuickUse(null);setFilter('전체');setPantryStatus('all');setPantrySort('expiry');setSearch('');setRecipeBusy(false);},[shopping]);
  const addMissing=async()=>{if(recipeLock.current||!recipe)return;recipeLock.current=true;setRecipeBusy(true);setRecipeError('');try{await shopping.add(recipe.missing.map(ingredient=>({ingredient,name:ingredient})));if(shoppingActive.current===shopping){setRecipe(null);setPage('shopping');setNotice('부족한 주재료를 장보기 목록에 담았어요. 중복 항목은 하나로 모아요.');}}catch(e){if(shoppingActive.current===shopping)setRecipeError(e.message);}finally{recipeLock.current=false;if(shoppingActive.current===shopping)setRecipeBusy(false);}};

  if (!authReady || !snapshot.ready) return <SafeAreaView style={s.loading}><ActivityIndicator color={colors.green} /><Text style={s.muted}>{t("냉장고를 열고 있어요…")}</Text></SafeAreaView>;
  return <SafeAreaView style={s.safe}><View style={s.shell}>
  <View style={s.header}><View><Text style={s.brand}>▤ {t('한칸')}</Text><Text testID="app-version" style={s.version}>v{APP_VERSION} · BETA</Text></View><View style={s.headerActions}><Pressable testID="quick-language" accessibilityRole="button" accessibilityLabel={t('언어 변경')} disabled={languageBusy} onPress={() => setLanguage(locale === 'ko' ? 'en' : 'ko')} style={s.accountButton}><Text style={s.headerActionText}>{locale === 'ko' ? 'EN' : t("한국어")}</Text></Pressable><Pressable testID="account" accessibilityRole="button" accessibilityLabel={t('설정')} onPress={() => setPage('account')} style={s.accountButton}><Text style={s.headerActionText}>{t('설정')}</Text></Pressable></View></View>
  {!!languageError && <Text accessibilityRole="alert" style={s.warning}>{t(languageError)}</Text>}
  <ScrollView ref={scroll} contentContainerStyle={s.content} keyboardShouldPersistTaps="handled" refreshControl={owner ? <RefreshControl refreshing={network.busy} onRefresh={sync} tintColor={colors.green} /> : undefined}>
   {snapshot.error && <Text style={s.warning}>{t(snapshot.error)}</Text>}
   {page === 'pantry' && <>
    <Text style={s.eyebrow}>MY LITTLE KITCHEN</Text><Text style={s.title}>{t('냉장고 속 재료,\n잊지 않도록.')}</Text>
    <View style={s.hero}><View style={{
              flex: 1,
              gap: 8
            }}><Text style={s.h3}>{t('라벨을 찍고,\n한 칸 기록해요.')}</Text><Text style={s.muted}>{t('품목명과 날짜를 읽고\n확인 한 번으로 냉장고에 쏙.')}</Text><Button testID="hero-add" onPress={() => setEditor(blank())} style={{
                alignSelf: 'flex-start',
                marginTop: 5
              }}>{t("사진으로 등록 ＋")}</Button></View><Fridge /></View>
    <Pressable onPress={() => setPage('account')} style={s.syncLine}><View style={[s.dot, {
              backgroundColor: network.error ? '#ba8556' : owner ? '#679765' : '#aab29f'
            }]} /><Text style={s.syncText}>{!owner ? t("이 기기에 저장 중 · 로그인하면 서버와 동기화") : network.busy ? t("서버와 동기화 중…") : conflicts.length ? t('{count}개 기록 확인 필요', {
                count: conflicts.length
              }) : network.error ? t("오프라인 보관 중 · 다시 연결 필요") : pending.length ? t('{count}개 변경 전송 대기', {
                count: pending.length
              }) : network.time ? t("서버에 동기화했어요") : t("서버 연결 중")}</Text><Text style={s.syncText}>›</Text></Pressable>
    <View style={s.summary}>{[['all', items.length, '보관 중'], ['urgent', items.filter(x => daysLeft(x.date, day) !== null && daysLeft(x.date, day) >= 0 && daysLeft(x.date, day) <= 3).length, '3일 안에 확인'], ['expired', items.filter(x => daysLeft(x.date, day) !== null && daysLeft(x.date, day) < 0).length, '날짜 지남']].map(([f, count, label], index) => <Pressable key={f} onPress={() => {setFilter('전체');setPantryStatus(f);setSearch('');}} style={[s.stat, {
              backgroundColor: ['#f0f3ec', '#f7ecdf', '#f5e9e4'][index]
            }]}><Text style={s.statNumber}>{count}</Text><Text style={s.statLabel}>{t(label)}</Text></Pressable>)}</View>
    {items.some(i => i.demo) && <View style={s.demo}><Text style={[s.muted, {
              flex: 1
            }]}>{t("예시 재료가 포함되어 있어요.")}</Text><Pressable accessibilityRole="button" onPress={() => run(async () => {
              for (const item of items.filter(x => x.demo)) await repo.remove(item.id);
            })}><Text style={s.link}>{t("예시 지우기")}</Text></Pressable></View>}
    <View style={s.sectionTitle}><Text style={s.h3}>{t("우리 집 냉장고")}</Text><Text style={s.muted}>{t(pantrySort==='name'?'이름순':'가까운 날짜부터')}</Text></View>
    <Choices testID="filter" values={['전체', '냉장', '냉동', '실온']} value={filter} onChange={setFilter} labelFor={t} />
    <Text style={s.small}>{t('재료 상태')}</Text>
    <Choices testID="pantry-status" values={[['all','전체'],['opened','개봉함'],['unknown','날짜 미정'],['urgent','임박'],['expired','지남']]} value={pantryStatus} onChange={setPantryStatus} labelFor={t}/>
    <Choices testID="pantry-sort" values={[['expiry','날짜순'],['name','이름순']]} value={pantrySort} onChange={setPantrySort} labelFor={t}/>
    <Field label={t("재료 검색")} value={search} onChangeText={setSearch} placeholder={t("재료 이름으로 찾기")} />
    <View style={s.sectionTitle}><Text accessibilityLiveRegion="polite" style={s.small}>{t('전체 {total}개 중 {count}개 표시',{total:items.length,count:sorted.length})}</Text>{(filter!=='전체'||pantryStatus!=='all'||pantrySort!=='expiry'||search)&&<Pressable accessibilityRole="button" testID="pantry-reset" onPress={resetPantryView} style={{paddingVertical:10}}><Text style={s.link}>{t('보기 초기화')}</Text></Pressable>}</View>
    {pantryStatus==='opened'&&<Text style={s.muted}>{t('개봉 표시한 재료를 모았어요. 포장지의 개봉 후 보관 안내를 확인하세요.')}</Text>}
    {pantryStatus==='unknown'&&<Text style={s.muted}>{t('날짜를 입력하지 않은 재료예요. 재료를 눌러 포장지의 날짜를 확인하고 등록하세요.')}</Text>}
    {sorted.map(item => {
            const d = daysLeft(item.date, day);
            return <View key={item.id} testID="ingredient-card" style={s.item}><FoodIcon name={item.ingredient} /><Pressable accessibilityRole="button" testID={`edit-${item.name}`} onPress={() => setEditor({
                ...item,
                quantity: String(item.quantity)
              })} style={{
                flex: 1,
                gap: 4
              }}><Text numberOfLines={1} style={s.itemName}>{item.name}</Text><Text style={s.small}>{t(item.place)} · {quantityLabel(item.quantity, item.unit, locale)}{item.date ? ' · ' + t(KIND[item.dateKind]) : ''}</Text>{item.opened && <Text style={s.badge}>{t("개봉함")}</Text>}</Pressable><View style={{
                alignItems: 'flex-end'
              }}><Text style={[s.date, {
                  color: d !== null && d < 0 ? '#b36c57' : d !== null && d <= 3 ? '#b08243' : '#6a8560'
                }]}>{d === null ? t("날짜 미정") : d < 0 ? t('{days}일 지남', {
                    days: -d
                  }) : d === 0 ? t("오늘까지") : t('D−{days}', {
                    days: d
                  })}</Text><Text style={s.small}>{shortDate(item.date, locale)}</Text>{usableForCooking(item,day)&&<Pressable accessibilityRole="button" testID={`quick-use-${item.id}`} onPress={()=>setQuickUse(snapshot.records.find(r=>r.id===item.id))} style={{paddingVertical:10}}><Text style={s.link}>{t('일부 사용')}</Text></Pressable>}<Pressable accessibilityRole="button" testID={`use-${item.name}`} onPress={() => run(() => remove(item.id))} style={{
                  paddingVertical: 10
                }}><Text style={s.small}>{t("다 썼어요")}</Text></Pressable></View></View>;
          })}
    {!sorted.length && <View style={s.empty}><Fridge /><Text style={s.h3}>{items.length ? t("찾는 재료가 없어요.") : t("첫 재료를 기다리고 있어요.")}</Text><Text style={s.muted}>{t(items.length?'검색어나 보관 위치·상태 조건을 바꿔 보세요.':'포장지의 날짜를 찍거나 직접 입력해 보세요.')}</Text>{!items.length && !owner && <Button secondary testID="demo" onPress={demo}>{t("예시 냉장고 둘러보기")}</Button>}</View>}
    <Text style={s.footnote}>{t('날짜는 포장지의 보관방법과 함께 확인해 주세요.\n사진은 서버로 보내지 않고 기기에서 읽어요.')}</Text>
   </>}
   {page==='shopping'&&<ShoppingPanel key={owner||'guest'} store={shopping} snapshot={shoppingSnapshot} onRegister={item=>setEditor(shoppingDraft(item,randomUUID(),t))}/>}
   {page === 'recipes' && <><Text style={s.eyebrow}>COOK WHAT YOU HAVE</Text><Text style={s.title}>{t('남은 재료가\n오늘의 메뉴로.')}</Text><Text style={s.muted}>{t('먼저 쓸 재료를 담은 메뉴부터 골랐어요.\n준비된 6개 레시피에서 재료 조합을 비교해요.')}</Text>{items.some(i => !i.date || daysLeft(i.date, day) < 0) && <Text style={s.warning}>{t("날짜가 지났거나 미정인 재료는 보유 재료 계산에서 제외했어요.")}</Text>}<Button testID="open-shopping" secondary onPress={()=>setPage('shopping')}>{t('장보기 목록')}</Button>{recipes.map(r => <Pressable key={r.id} accessibilityRole="button" testID={`recipe-${r.id}`} onPress={() => setRecipe(r)} style={s.recipeCard}><View style={s.row}><FoodIcon name={r.ingredients[0]} /><View style={{
                flex: 1,
                gap: 5
              }}><Text style={s.h3}>{t(r.title)}</Text><Text style={s.small}>{t(r.subtitle)}</Text></View></View><View style={[s.sectionTitle, {
              marginTop: 16,
              marginBottom: 0
            }]}><Text style={s.link}>{t('주재료 {have}/{total}개 보유', {
                  have: r.have.length,
                  total: r.ingredients.length
                })}</Text><Text style={s.small}>{t('약 {minutes}분', {
                  minutes: r.minutes
                })}</Text></View>{r.urgent.length > 0 && <Text style={[s.badge, {
              marginTop: 10
            }]}>{t('먼저 쓰기 · {names}', {
                names: r.urgent.map(x => t(x)).join(', ')
              })}</Text>}</Pressable>)}{!recipes.length && <View style={s.empty}><Text style={s.h3}>{t("재료가 모이면 메뉴를 찾아드려요.")}</Text><Text style={s.muted}>{t("날짜를 확인한 재료를 등록해 주세요.")}</Text></View>}<Text style={s.footnote}>{t("분량과 양념은 레시피에서 확인해 주세요. 메뉴를 열어도 재고를 자동으로 차감하지 않아요.")}</Text></>}
   {page === 'account' && <><View style={s.panel}><Text style={s.h3}>{t('언어')}</Text><Text style={s.muted}>{t('기기 언어를 기준으로 시작하며, 선택한 언어는 이 기기에 저장해요.')}</Text><Choices testID="language" values={LANGUAGES.map(x => [x.code, x.label])} value={locale} disabled={languageBusy} onChange={setLanguage} /><Text style={s.small}>{t('저장된 이름과 메모는 번역하지 않아요.')}</Text></View><View style={s.panel}><Text style={s.h3}>{t('앱 정보')}</Text><View style={s.sectionTitle}><Text style={s.muted}>{t('현재 버전')}</Text><Text testID="settings-version" style={s.h3}>v{APP_VERSION}</Text></View><Text style={s.small}>{Platform.OS === 'web' ? t('웹 미리보기') : t('빌드 번호') + ' ' + (Platform.OS === 'ios' ? IOS_BUILD : ANDROID_BUILD) + ' · ' + (Platform.OS === 'ios' ? 'iOS' : 'Android')}</Text></View><Text style={s.eyebrow}>MY KITCHEN, ANYWHERE</Text><Text style={s.title}>{t('내 냉장고를\n안전하게 이어서.')}</Text>
    <View style={s.panel}><Text style={s.h3}>{owner ? t("서버에 연결된 내 계정") : t("로그인하고 재료 보관하기")}</Text><Text style={s.muted}>{owner ? session.user.email : t("기기 안의 기록은 로그인 없이도 사용할 수 있어요. 로그인하면 같은 계정의 휴대폰끼리 재료를 동기화해요.")}</Text>
     {!cloudConfigured ? <Text style={s.warning}>{t("서버 연결 설정을 준비 중이에요. 지금은 이 기기에 저장됩니다.")}</Text> : owner ? <><Text style={s.muted}>{network.error ? t(network.error) : network.time ? t('마지막 동기화 {time}', {
                  time: network.time.toLocaleTimeString(localeTag(locale))
                }) : t("서버와 연결 중이에요.")}</Text><Button disabled={network.busy} onPress={sync}>{network.busy ? t("동기화 중…") : t("지금 동기화")}</Button><Button secondary onPress={() => run(async () => {
                const guest = createRepository({
                  storage: AsyncStorage,
                  newId: randomUUID
                });
                await guest.load();
                if (guest.getSnapshot().error) throw Error('로그인 전 기록을 읽지 못했어요.');
                const list = visibleItems(guest.getSnapshot().records).filter(x => !x.demo);
                setImportPreview(list);
              })}>{t("로그인 전 재료 가져오기")}</Button><Button secondary onPress={() => run(async () => {
                const {
                  error
                } = await cloud.auth.signOut({
                  scope: 'local'
                });
                if (error) throw error;
                setPassword('');
                setAuthMessage('로그아웃했어요. 계정별 재료는 분리해서 보관합니다.');
              })}>{t("로그아웃")}</Button></> : <><Text style={s.small}>{t("Supabase 관리 계정과 별도로 한칸 앱 계정을 만들어 주세요.")}</Text><Field label={t("이메일")} value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoComplete="email" /><Field label={t("비밀번호")} value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" autoComplete="current-password" placeholder={t("8자 이상")} /><Button testID="sign-in" disabled={authBusy} onPress={() => auth(false)}>{t("로그인")}</Button><Button secondary disabled={authBusy} onPress={() => auth(true)}>{t("이메일로 회원가입")}</Button></>}
     {!!(authMessage || authError) && <Text style={s.warning}>{t(authMessage || authError)}</Text>}
    </View>
    {conflicts.length > 0 && <View style={s.panel}><Text style={s.h3}>{t("다른 기기에서도 수정했어요.")}</Text><Text style={s.muted}>{t("유지할 내용을 선택해 주세요. 선택 전까지 이 기록의 전송은 멈춰 있어요.")}</Text>{conflicts.map(r => <View key={r.id} style={s.conflict}><Text style={s.itemName}>{r.data.name}</Text><Text style={s.muted}>{t('이 기기: {value}', {
                  value: r.deleted ? t('삭제됨') : `${quantityLabel(r.data.quantity, r.data.unit, locale)} · ${r.data.date || t('날짜 미정')}`
                })}{'\n'}{t('서버: {value}', {
                  value: r.conflict.deleted ? t('삭제됨') : `${quantityLabel(r.conflict.data.quantity, r.conflict.data.unit, locale)} · ${r.conflict.data.date || t('날짜 미정')}`
                })}</Text><Button secondary onPress={() => run(() => repo.resolve(r.id, 'server'))}>{t("서버 내용 사용")}</Button><Button onPress={() => run(() => repo.resolve(r.id, 'local'))}>{t("이 기기 내용 사용")}</Button></View>)}</View>}
    <View style={s.panel}><View style={s.sectionTitle}><Text style={s.h3}>{t("기한 알림")}</Text><Switch testID="alerts" accessibilityLabel={t("기한 알림")} disabled={!remindersSupported} value={notifyEnabled} onValueChange={toggleAlerts} trackColor={{
                true: '#789b6f'
              }} /></View><Text style={s.muted}>{remindersSupported ? t("3일 전 · 1일 전 · 당일 오전 9시에 알려드려요. 휴대폰에서 직접 예약해 서버 알림 비용이 없어요.") : t("휴대폰용 한칸 앱에서 날짜 알림을 켤 수 있어요.")}</Text>{remindersSupported && <Text style={s.small}>{t(notifyInfo)} · {t('앱을 열 때 예약을 갱신해요.')}</Text>}</View>
    <View style={s.panel}><Text style={s.h3}>{t("백업과 복원")}</Text><Text style={s.muted}>{t("파일로 따로 보관할 수도 있어요. 백업에는 재료 이름·날짜·메모가 포함됩니다.")}</Text><Button secondary testID="export" onPress={() => run(() => exportText(JSON.stringify({
              format: 'hankan-v1',
              items
            }, null, 2), undefined, locale))}>{t("재료 목록 백업")}</Button><Button secondary testID="import" onPress={() => run(async () => {
              const list = await pickBackup();
              if (list) setImportPreview(list);
            })}>{t("백업 가져오기")}</Button>{snapshot.error && <Button secondary onPress={() => run(async () => exportText((await repo.raw()) || '', 'hankan-original.txt', locale))}>{t("읽지 못한 원본 내보내기")}</Button>}</View>
    <Text style={s.footnote}>{t('무료 서버로 시작하며 사진은 업로드하지 않아요. 날짜는 식품 안전을 판정하는 기능이 아닙니다.')}</Text>
   </>}
  </ScrollView>
  {!!notice && <View style={s.notice}><Text style={{
          flex: 1,
          color: 'white',
          fontSize: 13
        }}>{t(notice)}</Text>{undo?.repo === repo && <Pressable onPress={() => run(async () => {
          if(undo.consumption)await repo.restoreConsumption(undo.consumption);else await repo.save(undo.data);
          setUndo(null);
          setNotice('재료를 다시 넣었어요.');
        })}><Text style={{
            color: '#e1edb4'
          }}>{t("되돌리기")}</Text></Pressable>}<Pressable accessibilityRole="button" accessibilityLabel={t("알림 닫기")} onPress={() => {
          setNotice('');
          setUndo(null);
        }} style={{
          padding: 10
        }}><Text style={{
            color: 'white'
          }}>×</Text></Pressable></View>}
  <View style={s.nav}><Pressable testID="nav-shopping" accessibilityRole="button" onPress={()=>setPage('shopping')} style={s.navItem}><Text style={[s.navText,page==='shopping'&&s.active]}>{t('장보기')}</Text></Pressable><Pressable testID="nav-pantry" accessibilityRole="button" onPress={() => setPage('pantry')} style={s.navItem}><Text style={[s.navText, page === 'pantry' && s.active]}>{t("▤ 우리 냉장고")}</Text></Pressable><Button testID="nav-add" onPress={() => setEditor(blank())} style={s.add}>＋</Button><Pressable testID="nav-recipes" accessibilityRole="button" onPress={() => setPage('recipes')} style={s.navItem}><Text style={[s.navText, page === 'recipes' && s.active]}>{t("♧ 오늘의 메뉴")}</Text></Pressable></View>
  {editor && <Editor key={editor.id} editing={items.some(item=>item.id===editor.id)} initial={editor} previous={previousNames(items)} onClose={() => setEditor(null)} onSave={async (data, another) => {
        await repo.save(data);
        if (activeRepo.current !== repo) return;
        setEditor(another ? {
          ...blank(),
          place: data.place
        } : null);
        if(editor.fromShopping&&!another)setPage('pantry');
        setNotice(message(another ? '{name} · 저장했어요. 다음 재료를 등록해 주세요.' : '{name} · 저장했어요.', {
          name: data.name
        }));
      }} />}
  <Sheet visible={!!recipe} onClose={() => setRecipe(null)} title={t(recipe?.title || '')}>{recipe && <><FoodIcon name={recipe.ingredients[0]} size={90} /><Text style={s.muted}>{t('약 {minutes}분 · 1인분 기준', {
              minutes: recipe.minutes
            })}</Text><Text style={s.h3}>{t("우리 냉장고에 있어요")}</Text><Text style={s.body}>{recipe.have.length?recipe.have.map(x => t(x)).join(', '):t('아직 보유한 주재료가 없어요.')}</Text><Text style={s.h3}>{recipe.missing.length ? t("추가로 준비해 주세요") : t("주재료가 모두 있어요")}</Text>{recipe.missing.length > 0 && <Text style={s.body}>{recipe.missing.map(x => t(x)).join(', ')}</Text>}<Text style={s.body}>{t('주재료: {amounts}\n기본 양념: {basics}', {
              amounts: t(recipe.amounts),
              basics: t(recipe.basics)
            })}</Text>{recipe.steps.map((step, i) => <Text key={i} style={s.body}>{i + 1}. {t(step)}</Text>)}<Text style={s.warning}>{t('재료가 있다는 표시는 수량이 충분하다는 뜻은 아니에요. 분량과 개봉 상태를 확인하세요.')}</Text>{!!(recipeError||shoppingSnapshot.error)&&<Text style={s.warning}>{t(recipeError||shoppingSnapshot.error)}</Text>}{recipe.missing.length>0&&<Button testID="add-missing" secondary disabled={recipeBusy||!shoppingSnapshot.ready||!!shoppingSnapshot.error} onPress={addMissing}>{t('부족한 주재료 장보기 담기')}</Button>}<Text style={s.small}>{t('장보기에는 부족한 주재료만 담아요. 양념과 구매 수량은 직접 확인하세요.')}</Text><Button testID="start-cooking" disabled={!recipe.have.length} onPress={()=>{setCooking({recipe,records:snapshot.records});setRecipe(null);}}>{t('요리에 사용한 수량 기록')}</Button><Button onPress={() => {
            setRecipe(null);
            setPage('pantry');
          }}>{t("재료 정리하러 가기")}</Button></>}</Sheet>
  <Sheet visible={!!quickUse} onClose={()=>setQuickUse(null)} title={t('재료 사용량 기록')}>{quickUse&&<QuickUsePanel key={quickUse.mutationId} record={quickUse} onConfirm={async selections=>{const receipt=await repo.consume(selections);if(activeRepo.current===repo){setQuickUse(null);setUndo({repo,consumption:receipt});setNotice('확인한 사용량을 차감했어요. 되돌리기로 취소할 수 있어요.');}}}/>}</Sheet>
  <Sheet visible={!!cooking} onClose={()=>setCooking(null)} title={t('요리에 사용한 수량 기록')}>{cooking&&<CookingPanel recipe={cooking.recipe} records={cooking.records} onConfirm={async selections=>{const receipt=await repo.consume(selections);if(activeRepo.current===repo){setCooking(null);setUndo({repo,consumption:receipt});setNotice('확인한 사용량을 차감했어요. 되돌리기로 취소할 수 있어요.');setPage('pantry');}}}/>}</Sheet>
  <Sheet visible={!!importPreview} onClose={() => setImportPreview(null)} title={t("재료를 가져올까요?")}><Text style={s.body}>{t('{count}개 기록을 확인했어요. 같은 기록은 현재 내용을 유지하며, 새 기록만 추가합니다.', {
            count: importPreview?.length || 0
          })}</Text><Button onPress={() => run(async () => {
          const count = await repo.importItems(importPreview);
          setImportPreview(null);
          setNotice(message('{count}개 재료를 가져왔어요.', {
            count
          }));
        })}>{t("확인하고 가져오기")}</Button></Sheet>
 </View></SafeAreaView>;
}
function Sheet({
  visible,
  title,
  onClose,
  children
}) {
  const {
    t
  } = useI18n();
  return <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}><View style={s.backdrop}><KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.sheetWrap}><SafeAreaView style={s.sheet} edges={['bottom']}><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{
            padding: 24,
            gap: 16
          }}><View style={s.sectionTitle}><Text style={[s.h3, {
                flex: 1,
                fontSize: 22
              }]}>{title}</Text><Pressable testID="close-sheet" accessibilityRole="button" accessibilityLabel={t("창 닫기")} onPress={onClose} style={s.close}><Text style={{
                  fontSize: 23,
                  color: colors.ink
                }}>×</Text></Pressable></View>{children}</ScrollView></SafeAreaView></KeyboardAvoidingView></View></Modal>;
}
function LabelPreview({
  asset,
  crop
}) {
  const [width, setWidth] = useState(320),
    ratio = asset.width / asset.height,
    h = Math.min(260, width / ratio),
    w = h * ratio;
  const region = scanRegions(asset.width, asset.height, crop)[0];
  return <View onLayout={e => setWidth(e.nativeEvent.layout.width)} style={{
    alignItems: 'center',
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: '#edf1e7'
  }}><View style={{
      width: w,
      height: h
    }}><Image source={{
        uri: asset.uri
      }} style={{
        width: w,
        height: h
      }} />{crop !== 'full' && <View pointerEvents="none" style={{
        position: 'absolute',
        borderWidth: 3,
        borderColor: '#75b85a',
        left: region.x / asset.width * w,
        top: region.y / asset.height * h,
        width: region.width / asset.width * w,
        height: region.height / asset.height * h
      }} />}</View></View>;
}
function Editor({
  editing = false,
  initial,
  previous = [],
  onClose,
  onSave
}) {
  const {
    t
  } = useI18n();
  const [form, setForm] = useState(initial),
    [asset, setAsset] = useState(null),
    [crop, setCrop] = useState('full'),
    [target, setTarget] = useState('both');
  const [busy, setBusy] = useState(false),
    [saving, setSaving] = useState(false),
    [error, setError] = useState(''),
    [scanMessage, setScanMessage] = useState('');
  const [candidates, setCandidates] = useState([]),
    [names, setNames] = useState([]),
    [raw, setRaw] = useState(''),
    [showRaw, setShowRaw] = useState(false),
    [showPhoto, setShowPhoto] = useState(false),
    [showIngredients, setShowIngredients] = useState(false);
  const active = useRef(true),
    operation = useRef(false),
    token = useRef(0),
    auto = useRef({}),
    formRef = useRef(form);
  formRef.current = form;
  useEffect(() => () => {
    active.current = false;
    token.current++;
  }, []);
  const field = (key, value) => setForm(f => ({
    ...f,
    [key]: value,
    ...(key === 'date' || key === 'dateKind' ? {
      verified: false
    } : {})
  }));
  const scan = async (photo = asset, area = crop, readTarget = target) => {
    if (!photo || operation.current || !ocrSupported) return;
    operation.current = true;
    const current = ++token.current;
    setBusy(true);
    setError('');
    setShowRaw(false);
    if (readTarget !== 'name') {
      setCandidates([]);
      field('verified', false);
    }
    if (readTarget !== 'date') setNames([]);
    const isCancelled = () => !active.current || current !== token.current;
    try {
      const result = await readLabel(photo, area, {
        target: readTarget,
        isCancelled,
        onProgress: message => {
          if (!isCancelled()) setScanMessage(message);
        }
      });
      if (isCancelled()) return;
      const summary = scanSummary(result);
      setRaw(summary.text);
      if (readTarget !== 'name') setCandidates(summary.dates);
      if (readTarget !== 'date') setNames(summary.names);
      const applied = applyScan(formRef.current, result, auto.current, readTarget);
      auto.current = applied.auto;
      setForm(applied.form);
      const nameMessage = readTarget !== 'date' && !summary.names[0]?.automatic ? summary.names.length ? '이름이 확실하지 않아 후보로 남겼어요. 맞는 제품 이름을 선택해 주세요.' : '제품 이름을 찾지 못했어요. 제품 앞면을 찍거나 이름을 직접 입력해 주세요.' : '제품 이름과 날짜를 확인한 뒤 저장해 주세요.';
      setScanMessage(readTarget === 'date' ? summary.message : nameMessage);
      setShowPhoto(false);
    } catch (e) {
      if (!isCancelled()) {
        setError(e.message);
        setScanMessage('인식을 완료하지 못했어요. 사진을 다시 선택하거나 직접 입력해 주세요.');
      }
    } finally {
      operation.current = false;
      if (!isCancelled()) setBusy(false);
    }
  };
  const pick = async (camera, edit = false) => {
    if (operation.current) return;
    operation.current = true;
    setBusy(true);
    setError('');
    try {
      if (camera) {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted) throw Error('카메라 권한을 허용하거나 사진 선택을 사용해 주세요.');
      }
      const result = await (camera ? ImagePicker.launchCameraAsync : ImagePicker.launchImageLibraryAsync)({
        mediaTypes: ['images'],
        quality: 1,
        allowsEditing: edit
      });
      if (result.canceled || !active.current) return;
      const img = result.assets[0];
      if (img.fileSize > 20 * 1024 * 1024 || img.width * img.height > 40000000) throw Error('20MB 이하의 사진을 선택해 주세요.');
      token.current++;
      setAsset(img);
      setCrop('full');
      setRaw('');
      setShowPhoto(true);
      operation.current = false;
      if (ocrSupported) await scan(img, 'full', target);else setScanMessage('이 환경에서는 이름과 날짜를 직접 입력해 주세요.');
    } catch (e) {
      if (active.current) setError(e.message);
    } finally {
      operation.current = false;
      if (active.current) setBusy(false);
    }
  };
  const rotate = async () => {
    if (!asset || operation.current) return;
    operation.current = true;
    setBusy(true);
    setError('');
    try {
      const img = await manipulateAsync(asset.uri, [{
        rotate: 90
      }], {
        compress: 1,
        format: SaveFormat.PNG
      });
      if (active.current) {
        setAsset(img);
        setCrop('full');
        setScanMessage('사진을 돌렸어요. 다시 읽기를 눌러 주세요.');
        setRaw('');
      }
    } catch {
      if (active.current) setError('사진을 돌리지 못했어요. 다시 선택해 주세요.');
    } finally {
      operation.current = false;
      if (active.current) setBusy(false);
    }
  };
  const chooseName = name => {
    if (operation.current) return;
    auto.current.name = undefined;
    setForm(f => ({
      ...f,
      name,
      ingredient: inferIngredient(name)
    }));
  };
  const save = async (another = false) => {
    if (operation.current) return;
    operation.current = true;
    setError('');
    setSaving(true);
    try {
      await onSave(normalizeItem(form), another);
    } catch (e) {
      if (active.current) setError(e.message);
    } finally {
      operation.current = false;
      if (active.current) setSaving(false);
    }
  };
  const prior = previous.filter(x => x.id !== initial.id),
    isEdit = editing;
  return <Sheet visible title={isEdit ? t("재료 기록 수정") : t("사진 한 장, 한 칸 기록.")} onClose={onClose}>
  {initial.fromShopping&&<Text style={s.warning}>{t("장보기 이름을 가져왔어요. 수량·보관 위치·포장지 날짜를 확인해 주세요. 저장 전에는 냉장고에 추가되지 않아요.")}</Text>}
  <Text style={s.muted}>{t("제품 이름이 있는 앞면과 날짜 부분을 따로 찍어도 돼요.")}</Text>
  <Choices testID="scan-target" values={[["both", "이름 + 날짜"], ["name", "품목명만"], ["date", "날짜만"]]} value={target} onChange={v => {
      if (!operation.current) setTarget(v);
    }} labelFor={t} />
  <View style={s.row}><Button testID="take-photo" disabled={busy || saving} secondary onPress={() => pick(true)} style={{
        flex: 1
      }}>{t("사진 촬영")}</Button><Button testID="choose-photo" disabled={busy || saving} secondary onPress={() => pick(false)} style={{
        flex: 1
      }}>{t("사진 선택")}</Button></View>
  {busy && <View style={s.row}><ActivityIndicator color={colors.green} /><Text testID="scan-message" accessibilityLiveRegion="polite" style={[s.muted, {
        flex: 1
      }]}>{t(scanMessage || '사진을 준비하고 있어요…')}</Text></View>}
  {!busy && !!scanMessage && <Text testID="scan-message" accessibilityLiveRegion="polite" style={s.muted}>{t(scanMessage)}</Text>}
  {!asset && !isEdit && prior.length > 0 && <View style={{
      gap: 8
    }}><Text style={s.label}>{t("다시 산 재료인가요?")}</Text><Text style={s.small}>{t("이름과 보관 위치만 가져와요. 날짜는 새로 확인합니다.")}</Text><Choices testID="reuse" values={prior.map(x => [x.id, x.name])} value="" onChange={id => {
        if (operation.current) return;
        const item = prior.find(x => x.id === id);
        auto.current = {};
        setForm(reuseItem(item, initial.id));
        setScanMessage('이전 이름을 가져왔어요. 이번 제품의 날짜를 입력하거나 촬영해 주세요.');
      }} /></View>}
  <View style={[s.panel, {
      padding: 16,
      marginBottom: 0,
      gap: 8
    }]}>
   <Text style={s.eyebrow}>{t("01 · 재료 이름")}</Text>
   <Field label={t("재료 이름")} testID="item-name" editable={!busy && !saving} value={form.name} onChangeText={chooseName} maxLength={50} placeholder={t("브랜드 대신 제품 이름을 확인해 주세요")} />
   {names.length > 0 && <><Text style={s.small}>{t("맞는 제품 이름을 선택하거나 위에서 수정해 주세요.")}</Text>{names.map(n => <Pressable testID={`name-candidate-${n.name}`} key={n.key} disabled={busy || saving} accessibilityRole="button" onPress={() => chooseName(n.name)} style={[s.candidate, form.name === n.name && {
          borderWidth: 1,
          borderColor: colors.green
        }]}><Text style={s.itemName}>{n.name}</Text><Text style={s.small}>{t(n.source)}{n.confidence === 'review' ? t(' · 직접 확인 필요') : ''}</Text></Pressable>)}</>}
   {asset && <Button testID="retry-name" secondary disabled={busy || saving || !ocrSupported} onPress={() => scan(asset, crop, 'name')}>{t("품목명만 다시 읽기")}</Button>}
  </View>
  <View style={[s.panel, {
      padding: 16,
      marginBottom: 0,
      gap: 8
    }]}>
   <Text style={s.eyebrow}>{t("02 · 날짜 확인")}</Text>
   <Field label={t("포장지에 적힌 날짜")} testID="item-date" editable={!busy && !saving} placeholder={t("YYYY-MM-DD · 모르면 비워 두세요")} value={form.date} onChangeText={v => {
        auto.current.date = undefined;
        const digits = v.replace(/[^0-9]/g, '').slice(0, 8);
        field('date', [digits.slice(0, 4), digits.slice(4, 6), digits.slice(6, 8)].filter(Boolean).join('-'));
      }} keyboardType="numbers-and-punctuation" maxLength={10} />
   <Choices values={Object.entries(KIND).filter(([k]) => k !== 'manufactured')} value={form.dateKind} onChange={v => {
        if (!operation.current) field('dateKind', v);
      }} labelFor={t} />
   {candidates.map((c, i) => <Pressable key={i} disabled={busy || saving || c.kind === 'manufactured'} accessibilityRole="button" onPress={() => {
        auto.current.date = undefined;
        setForm(f => ({
          ...f,
          date: c.date,
          dateKind: c.kind,
          verified: false
        }));
      }} style={[s.candidate, c.kind === 'manufactured' && {
        opacity: .5
      }]}><Text style={s.itemName}>{c.date} · {t(KIND[c.kind])}</Text><Text style={s.small}>{c.corrected ? t("숫자 보정 · 꼭 확인해 주세요 · ") : ''}{c.shortYear ? t("연도 확인 · ") : ''}{c.context}</Text></Pressable>)}
   <Check testID="verify-date" checked={form.verified} onChange={v => {
        if (!operation.current) field('verified', v);
      }}>{t("포장지의 날짜와 종류를 직접 확인했어요.")}</Check><Text style={s.small}>{t("제조일은 소비기한이 아니에요. 날짜를 모르면 비워 둘 수 있어요.")}</Text>
  </View>
  {asset && <>
   <Button testID="photo-details" secondary disabled={busy || saving} onPress={() => setShowPhoto(v => !v)}>{showPhoto ? t("사진 접기") : t("사진 보기 · 읽을 영역 바꾸기")}</Button>
   {showPhoto && <><LabelPreview asset={asset} crop={crop} /><Choices values={[["full", "전체"], ["top", "위쪽"], ["middle", "가운데"], ["bottom", "아래쪽"], ["center", "중앙 확대"]]} value={crop} onChange={v => {
          if (!operation.current) setCrop(v);
        }} labelFor={t} /><View style={s.row}><Button testID="rotate-photo" secondary disabled={busy || saving} onPress={rotate} style={{
            flex: 1
          }}>{t("90° 돌리기")}</Button>{Platform.OS !== 'web' && <Button secondary disabled={busy || saving} onPress={() => pick(false, true)} style={{
            flex: 1
          }}>{t("영역 잘라 선택")}</Button>}</View><Button testID="scan" disabled={busy || saving || !ocrSupported} onPress={() => scan()}>{t("선택한 영역 다시 읽기")}</Button></>}
   {!ocrSupported && <Text style={s.warning}>{t("사진 인식은 최신 한칸 설치형 앱에서 사용할 수 있어요.")}</Text>}
   {!!raw && <><Button secondary onPress={() => setShowRaw(v => !v)}>{t(showRaw ? '사진에서 읽은 글자 접기' : '사진에서 읽은 글자 보기')}</Button>{showRaw && <Text selectable style={s.small}>{raw}</Text>}</>}
  </>}
  <Text style={s.eyebrow}>{t("03 · 보관 정보")}</Text>
  <Button secondary disabled={busy || saving} onPress={() => setShowIngredients(v => !v)}>{t('추천용 재료 · {ingredient} · {action}', {
        ingredient: t(form.ingredient),
        action: t(showIngredients ? '접기' : '변경')
      })}</Button>{showIngredients && <Choices values={INGREDIENTS} value={form.ingredient} onChange={v => {
      field('ingredient', v);
      setShowIngredients(false);
    }} labelFor={t} />}
  <Text style={s.label}>{t("보관 위치")}</Text><Choices values={['냉장', '냉동', '실온']} value={form.place} onChange={v => field('place', v)} labelFor={t} />
  <Field label={t("수량")} testID="item-quantity" value={String(form.quantity)} onChangeText={v => field('quantity', v)} keyboardType="decimal-pad" /><Choices values={['개', '팩', '봉', 'g', 'ml', '단']} value={form.unit} onChange={v => field('unit', v)} labelFor={t} />
  <Check checked={form.opened} onChange={v => field('opened', v)}>{t("이미 개봉한 재료예요.")}</Check>
  <Field label={t("메모 · 선택")} value={form.note} onChangeText={v => field('note', v)} maxLength={150} placeholder={t("예: 개봉 후 냉장보관")} />
  {!!error && <Text testID="form-error" accessibilityRole="alert" style={s.warning}>{t(error)}</Text>}
  <Button testID="save-item" disabled={saving || busy} onPress={() => save()}>{saving ? t("저장 중…") : t("확인하고 냉장고에 저장")}</Button>
  {!isEdit && <Button testID="save-next" secondary disabled={saving || busy} onPress={() => save(true)}>{t("저장하고 다음 재료 등록 ＋")}</Button>}
  <Text style={s.footnote}>{t("사진은 서버로 전송하지 않아요. 이름·수량·날짜를 확인한 뒤 저장합니다.")}</Text>
 </Sheet>;
}
const s = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#e9eee7'
  },
  shell: {
    flex: 1,
    width: '100%',
    maxWidth: 620,
    alignSelf: 'center',
    backgroundColor: colors.paper
  },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 15,
    backgroundColor: colors.paper
  },
  header: {
    height: 76,
    paddingHorizontal: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  brand: {
    fontSize: 25,
    fontWeight: '800',
    color: colors.ink
  },
  beta: {
    fontSize: 9,
    color: '#889b7e',
    letterSpacing: 1
  },
  version: {
    fontSize: 10,
    lineHeight: 16,
    color: '#6f826f',
    marginTop: 2
  },
  headerActions: {
    flexDirection: 'row',
    gap: 7,
    alignItems: 'center'
  },
  headerActionText: {
    color: colors.green,
    fontSize: 12
  },
  accountButton: {
    padding: 12,
    borderRadius: 20,
    backgroundColor: '#edf1e7',
    minHeight: 42
  },
  content: {
    paddingHorizontal: 24,
    paddingTop: 10,
    paddingBottom: 25
  },
  eyebrow: {
    fontSize: 10,
    letterSpacing: 2,
    color: '#6e846f',
    fontWeight: '700'
  },
  title: {
    fontSize: 31,
    lineHeight: 42,
    letterSpacing: -1.4,
    color: colors.ink,
    fontWeight: '700',
    marginTop: 9,
    marginBottom: 24
  },
  h3: {
    fontSize: 17,
    lineHeight: 25,
    fontWeight: '600',
    color: colors.ink
  },
  muted: {
    fontSize: 13,
    lineHeight: 22,
    color: colors.muted
  },
  small: {
    fontSize: 11,
    lineHeight: 18,
    color: '#7d8c74'
  },
  hero: {
    padding: 23,
    backgroundColor: '#eaf0e2',
    borderRadius: 24,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 20
  },
  syncLine: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    paddingVertical: 16
  },
  syncText: {
    fontSize: 11,
    color: '#849078',
    flexShrink: 1
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3
  },
  summary: {
    flexDirection: 'row',
    gap: 9,
    marginBottom: 16
  },
  stat: {
    flex: 1,
    borderRadius: 15,
    padding: 14
  },
  statNumber: {
    fontSize: 25,
    fontWeight: '600',
    color: colors.ink
  },
  statLabel: {
    fontSize: 11,
    color: '#7a896e',
    marginTop: 4
  },
  sectionTitle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginTop: 14,
    marginBottom: 12
  },
  demo: {
    flexDirection: 'row',
    gap: 12,
    padding: 12,
    borderRadius: 12,
    backgroundColor: '#f2ead8',
    alignItems: 'center'
  },
  link: {
    fontSize: 12,
    color: colors.green,
    lineHeight: 21
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 13,
    borderBottomWidth: 1,
    borderBottomColor: colors.line
  },
  itemName: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.ink,
    lineHeight: 22
  },
  date: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 3
  },
  badge: {
    fontSize: 10,
    lineHeight: 18,
    color: '#6a855d',
    backgroundColor: '#edf1e7',
    alignSelf: 'flex-start',
    paddingHorizontal: 7,
    borderRadius: 5
  },
  empty: {
    padding: 28,
    alignItems: 'center',
    gap: 18,
    backgroundColor: '#f3f5ed',
    borderRadius: 20,
    marginTop: 12
  },
  footnote: {
    fontSize: 11,
    lineHeight: 20,
    color: '#8c9781',
    marginVertical: 20
  },
  nav: {
    height: 76,
    borderTopWidth: 1,
    borderColor: colors.line,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    backgroundColor: colors.paper
  },
  navItem: {
    minHeight: 48,
    justifyContent: 'center',
    padding: 12
  },
  navText: {
    fontSize: 12,
    color: '#8c9589'
  },
  active: {
    color: colors.green,
    fontWeight: '700'
  },
  add: {
    width: 54,
    minHeight: 54,
    borderRadius: 18,
    marginTop: -10
  },
  warning: {
    fontSize: 12,
    lineHeight: 21,
    color: '#94724e',
    backgroundColor: '#f4efe3',
    padding: 14,
    borderRadius: 12,
    marginVertical: 8
  },
  notice: {
    paddingLeft: 16,
    paddingRight: 5,
    paddingVertical: 8,
    backgroundColor: '#304e3f',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13
  },
  panel: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 20,
    padding: 20,
    gap: 15,
    marginBottom: 16
  },
  recipeCard: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 20,
    padding: 19,
    marginTop: 15
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12
  },
  body: {
    fontSize: 14,
    color: '#63765d',
    lineHeight: 25
  },
  conflict: {
    gap: 12,
    paddingTop: 15,
    borderTopWidth: 1,
    borderColor: colors.line
  },
  backdrop: {
    flex: 1,
    backgroundColor: '#203a3270',
    justifyContent: 'flex-end',
    alignItems: 'center'
  },
  sheetWrap: {
    maxHeight: '94%',
    width: '100%',
    maxWidth: 620
  },
  sheet: {
    backgroundColor: colors.paper,
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    overflow: 'hidden'
  },
  close: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#eaf0e4',
    alignItems: 'center',
    justifyContent: 'center'
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: '#52674c'
  },
  candidate: {
    padding: 13,
    gap: 5,
    borderRadius: 12,
    backgroundColor: '#e9f0e0'
  }
});
