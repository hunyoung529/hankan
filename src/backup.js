import {Platform} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as Sharing from 'expo-sharing';
import {File,Paths} from 'expo-file-system';
import {readBackup} from './domain.mjs';
import {createTranslator} from './i18n.mjs';
export async function exportText(text,name='hankan-backup.json',locale='ko',title='한칸 재료 백업'){
 if(Platform.OS==='web'){const url=URL.createObjectURL(new Blob([text],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);return;}
 const file=new File(Paths.cache,name);file.write(text);if(!await Sharing.isAvailableAsync())throw Error('이 기기에서 공유를 사용할 수 없어요.');await Sharing.shareAsync(file.uri,{mimeType:'application/json',dialogTitle:createTranslator(locale)(title)});
}
export async function pickBackup(parse=readBackup){const result=await DocumentPicker.getDocumentAsync({type:'application/json',copyToCacheDirectory:true});if(result.canceled)return null;const asset=result.assets[0];if(asset.size>1024*1024)throw Error('1MB 이하 백업을 선택해 주세요.');const text=Platform.OS==='web'?await(await fetch(asset.uri)).text():await new File(asset.uri).text();if(text.length>1024*1024)throw Error('백업 파일이 너무 커요.');return parse(text);}
