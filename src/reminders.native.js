import * as Notifications from 'expo-notifications';
import {Platform} from 'react-native';
import {reminderPlan} from './reminderPlan.mjs';
import {createTranslator} from './i18n.mjs';
Notifications.setNotificationHandler({handleNotification:async()=>({shouldPlaySound:true,shouldSetBadge:false,shouldShowBanner:true,shouldShowList:true})});
export const remindersSupported=true;
export async function askReminders(locale='ko'){
 if(Platform.OS==='android')await Notifications.setNotificationChannelAsync('pantry',{name:createTranslator(locale)('식재료 날짜 알림'),importance:Notifications.AndroidImportance.DEFAULT});
 let result=await Notifications.getPermissionsAsync();if(!result.granted)result=await Notifications.requestPermissionsAsync();return result.granted;
}
let queue=Promise.resolve();
export function refreshReminders(items,enabled,locale='ko'){
 const run=queue.then(async()=>{await Notifications.cancelAllScheduledNotificationsAsync();if(!enabled)return 0;const permission=await Notifications.getPermissionsAsync();if(!permission.granted)throw Error('휴대폰 설정에서 알림을 허용해 주세요.');if(Platform.OS==='android')await Notifications.setNotificationChannelAsync('pantry',{name:createTranslator(locale)('식재료 날짜 알림'),importance:Notifications.AndroidImportance.DEFAULT});const plan=reminderPlan(items,new Date(),locale);
  for(const entry of plan)await Notifications.scheduleNotificationAsync({content:{title:entry.title,body:entry.body,sound:true,data:{screen:'pantry'}},trigger:{type:Notifications.SchedulableTriggerInputTypes.DATE,date:new Date(entry.time),channelId:'pantry'}});return plan.length;
 });queue=run.catch(()=>{});return run;
}
