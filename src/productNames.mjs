import {inferIngredient} from './domain.mjs';

const productField=/(?:제\s*품\s*명|품\s*목\s*명|품\s*명|상\s*품\s*명)\s*[:：]?\s*/;
const fieldBoundary=/[|■◆●]|(?:원\s*재\s*료(?:명)?|식\s*품\s*유\s*형|유\s*형|내\s*용\s*량|제\s*조(?:원|업소|일자)|판매원|유통전문판매원|소비기한|유통기한|보관방법|영양정보)\s*[:：]?/;
const sectionHeading=/원\s*재\s*료|영\s*양\s*(?:정\s*보|성\s*분)|알레르기|알러지|주의사항|보관방법|제조원|판매원|유통전문|식품유형|식품의유형|원산지|내용량/;
const metadata=/소\s*비\s*기\s*한|유\s*통\s*기\s*한|제조(?:일|원|업소)|포장일|원\s*재\s*료|원산지|식품유형|영양(?:정보|성분)|보관(?:방법|하세요|하십시오)|냉[장동]\s*보관|직사광선|개봉\s*후|알레르기|알러지|주의사항|고객|상담|전화|판매원|유통전문|주소|소재지|반품|품목보고|인증|함유|내용량|중량|소비자|협동조합|주식회사|유한회사|사업자등록|대표자|유전자|www\.|https?:|\b(?:EXP|MFG|BEST BEFORE|LOT|PACKED|kcal|mg)\b|(?:^|\s)(?:나트륨|탄수화물|당류|지방|단백질|콜레스테롤)\s*(?::|\d|$)/i;
const foods=['두부','달걀','계란','우유','두유','요거트','요구르트','치즈','대파','양파','당근','감자','애호박','버섯','시금치','양배추','토마토','오이','김치','쌀','밥','라면','국수','파스타','참치','돼지고기','삼겹살','목살','쇠고기','소고기','닭가슴살','닭고기','햄','베이컨','소시지','연어','고등어','새우','사과','바나나','딸기','귤','만두','빵','버터','크림','주스','샐러드','어묵','콩나물','숙주','상추','브로콜리','고추장','된장','간장','고춧가루','오트드링크','음료','견과','시리얼','잼','참기름','들기름','식용유','올리브유'];
const foodWord=new RegExp(foods.join('|')+'|\\b(?:milk|tofu|egg|yogurt|cheese|chicken|salmon|bread|juice)\\b','i');
const brands=new Set(['서울우유','매일','매일유업','풀무원','CJ','CJ제일제당','청정원','비비고','동원','오뚜기','농심','남양','빙그레','롯데','해태','오리온','삼양','상하목장','노브랜드','피코크','곰곰','HACCP','FRESH','PREMIUM','ORGANIC'].map(x=>x.toLowerCase()));
const descriptor=/^(?:(?:국산(?:콩)?|국내산|유기농|무항생제|프리미엄|신선한|맛있는|고소한|담백한|저지방|무지방|고단백|부침용|찌개용|냉동|냉장|100\s*%|우리콩)\s*)+$/;
const key=s=>s.replace(/\s/g,'').toLowerCase();
const normalize=text=>{
 let value=String(text||'').normalize('NFKC').trim().replace(/\s+/g,' ');
 for(const word of foods.filter(x=>x.length>1))value=value.replace(new RegExp(word.split('').join('\\s*'),'g'),word);
 return value;
};
const clean=text=>normalize(text).split(fieldBoundary)[0].replace(/\s*\(?\d+(?:[.,]\d+)?\s*(?:kg|g|ml|l|리터|그램|개입)(?:\b|\s|\)|$).*$/i,'').replace(/^[\s|:·•\-\[\]■]+|[\s|:·•\-\[\]]+$/g,'').trim();
const valid=name=>{
 const letters=(name.match(/[가-힣a-z]/gi)||[]).length;
 return name.length>=2&&name.length<=50&&letters>=2&&letters/name.length>=.45&&!/[=?@]/.test(name)&&!metadata.test(name)&&!brands.has(key(name))&&!/^\d/.test(name)&&!/20\d{2}[.\/-]\d/.test(name);
};
export function recognizedLines(result){
 if(typeof result==='string')return result.split(/\r?\n/).map(text=>({text}));
 if(result?.lines?.length)return result.lines;
 return String(result?.text||'').split(/\r?\n/).map(text=>({text}));
}
function near(a,b){
 if(!Number.isFinite(a.y)||!Number.isFinite(b.y)||!a.height||!b.height)return false;
 const h=Math.max(a.height,b.height),gap=b.y-a.y-a.height;
 const below=gap>=-h*.3&&gap<h*2.8&&Math.abs((a.x||0)-(b.x||0))<Math.max(a.width||0,b.width||0,h*3);
 const right=Math.abs(b.y-a.y)<h*.7&&(b.x||0)>=(a.x||0)+(a.width||0)*.6&&(b.x||0)-(a.x||0)-(a.width||0)<h*12;
 return below||right;
}
function candidatesFrom(result){
 const lines=recognizedLines(result).map((l,i)=>({...l,text:normalize(l.text),index:i})),out=[];
 const heights=lines.map(l=>l.height||0).filter(Boolean).sort((a,b)=>a-b),median=heights[Math.floor(heights.length/2)]||0;
 const dense=lines.some(l=>sectionHeading.test(l.text));
 const blockedBlocks=new Set(lines.filter(l=>sectionHeading.test(l.text)&&l.block!=null).map(l=>l.block));
 let section=null;
 const add=(raw,line,explicit=false,joined=false)=>{
  if(metadata.test(raw)&&!explicit)return;
  const name=clean(raw);if(!valid(name)||descriptor.test(name))return;
  const known=foodWord.test(name),prominent=median>0&&(line.height||0)>=median*1.35;
  if(!explicit&&!known&&!prominent)return;
  const score=(explicit?120:0)+(known?65:0)+(prominent?15:0)+(joined?12:0)-Math.max(0,name.length-25);
  const safe=explicit||(!result?.cropped&&known&&(!dense||prominent));
  out.push({name,key:key(name),score,ingredient:inferIngredient(name),safe,source:explicit?'제품명 표시':joined?'이어진 제품 이름':known?'제품 이름 후보':'이름인지 확인 필요',context:raw.slice(0,100)});
 };
 for(let i=0;i<lines.length;i++){
  const line=lines[i],text=line.text;
  if(!text){section=null;continue;}
  const label=productField.exec(text);
  if(label){
   section=null;
   const inline=text.slice(label.index+label[0].length);
   if(inline){add(inline,line,true);continue;}
   const following=lines[i+1];
   const adjacent=following&&(!line.height||near(line,following)||line.block!=null&&line.block===following.block)?following:null;
   const value=adjacent||lines.filter(l=>l.index!==i&&near(line,l)&&!metadata.test(l.text)&&!productField.test(l.text)).sort((a,b)=>Math.abs(a.y-line.y)-Math.abs(b.y-line.y))[0];
   if(value&&!metadata.test(value.text))add(value.text,value,true);
   continue;
  }
  if(sectionHeading.test(text)){section=line;continue;}
  if(metadata.test(text))continue;
  if(line.block!=null&&blockedBlocks.has(line.block))continue;
  // Keep ingredient-list continuations out, even when they contain food words.
  if(section){
   const separate=line.block!=null&&section.block!=null&&line.block!==section.block;
   const large=median>0&&(line.height||0)>=median*1.6;
   if(!(separate&&large))continue;
   section=null;
  }
  const following=lines[i+1];
  if(descriptor.test(text)&&following&&!metadata.test(following.text)&&foodWord.test(following.text)&&(!line.height||near(line,following))){add(text+' '+following.text,line,false,true);}
  else add(text,line);
 }
 return out;
}
export function extractNames(result){
 const readings=result?.readings||[result],out=[];
 for(const reading of readings){
  if(reading?.role==='date')continue;
  for(const c of candidatesFrom(reading)){
   const existing=out.find(x=>x.key===c.key);
   if(!existing)out.push(c);else if(c.score>existing.score){const safe=existing.safe||c.safe;Object.assign(existing,c,{safe});}
  }
 }
 out.sort((a,b)=>b.score-a.score);
 const top=out[0],rival=out.find((c,i)=>i>0&&!top.key.includes(c.key)&&!c.key.includes(top.key));
 const ambiguous=top&&rival&&top.score-rival.score<12;
 return out.slice(0,6).map((c,i)=>({...c,automatic:i===0&&c.safe&&!ambiguous,confidence:c.safe?'candidate':'review'}));
}
export function hasReliableName(result){return !!extractNames(result)[0]?.automatic;}
