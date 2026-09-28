import React,{createContext,useContext,useEffect,useMemo,useSyncExternalStore} from 'react';
import {ActivityIndicator,View,Text,Platform} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {createLanguageStore,createTranslator,localeTag} from './i18n.mjs';
const LocaleContext=createContext(null);
export function LocaleProvider({children}){
 const store=useMemo(()=>createLanguageStore({storage:AsyncStorage}),[]);
 const state=useSyncExternalStore(store.subscribe,store.getSnapshot,store.getSnapshot);
 const t=useMemo(()=>createTranslator(state.locale),[state.locale]);
 useEffect(()=>{store.load();},[store]);
 useEffect(()=>{if(Platform.OS==='web'){document.documentElement.lang=localeTag(state.locale);document.title=t('한칸');}},[state.locale,t]);
 const value=useMemo(()=>({...state,t,setLanguage:store.select}),[state,t,store]);
 if(!state.ready)return <View style={{flex:1,justifyContent:'center',alignItems:'center',backgroundColor:'#fbfcf7',gap:16}}><ActivityIndicator color="#356a50"/><Text>{t('냉장고를 열고 있어요…')}</Text></View>;
 return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}
export const useI18n=()=>useContext(LocaleContext);
