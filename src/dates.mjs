const labels=/소\s*비\s*기\s*한|유\s*통\s*기\s*한|제\s*조(?:\s*일\s*자|\s*일)?|포\s*장(?:\s*일\s*자|\s*일)?|BEST\s*BEFORE|USE\s*BY|EXP(?:IRY)?|MFG|PACKED/gi;
const digit='[0-9OoIl|]';
const pattern=new RegExp(`(?<![\\da-z])(${digit}{4}|${digit}{2})\\s*(?:[.\\/\\-,·]|년)\\s*(${digit}{1,2})\\s*(?:[.\\/\\-,·]|월)\\s*(${digit}{1,2})(?:\\s*일)?(?![\\da-z])|(?<![\\da-z])(${digit}{4}|${digit}{2})[ \\t]+(${digit}{2})[ \\t]+(${digit}{2})(?![\\da-z])|(?<![\\da-z])(2[0Oo]${digit}{2})(${digit}{2})(${digit}{2})(?![\\da-z])|(?<![\\da-z])(${digit}{2})(${digit}{2})(${digit}{2})(?![\\da-z])`,'gi');
const digits=s=>s.replace(/[Oo]/g,'0').replace(/[Il|]/g,'1');
const kindOf=label=>/제\s*조|포\s*장|MFG|PACKED/i.test(label)?'manufactured':/소\s*비\s*기\s*한/.test(label)?'useby':/유\s*통\s*기\s*한/.test(label)?'sellby':'unknown';

export function extractDates(input){
 const text=String(input||'').normalize('NFKC').replace(/[‐‑–—]/g,'-'),out=[];
 for(const match of text.matchAll(pattern)){
  const index=match.index,start=text.lastIndexOf('\n',index)+1,end=text.indexOf('\n',index),line=text.slice(start,end<0?text.length:end),before=text.slice(start,index);
  const previous=text.slice(0,Math.max(0,start-1)).split('\n').at(-1)||'';
  const preceding=[...before.matchAll(labels)].at(-1)?.[0];
  const following=line.slice(index-start+match[0].length).match(/^\s*(?:까지|\()?[\s:]*((?:소\s*비|유\s*통)\s*기\s*한|제\s*조(?:\s*일\s*자|\s*일)?|포\s*장(?:\s*일\s*자|\s*일)?|EXP|MFG)/i)?.[1];
  // Carry only a label-only preceding line. A preceding dated line must not classify another date.
  const previousLabel=previous.length<45&&!/\d/.test(previous)?[...previous.matchAll(labels)].at(-1)?.[0]:'';
  const label=preceding||following||previousLabel||'';
  if(!label&&/\b(?:LOT|TEL|BARCODE)\b|품목보고|전화|바코드/i.test(line))continue;
  const offset=match[1]?1:match[4]?4:match[7]?7:10;
  const rawYear=match[offset],rawMonth=match[offset+1],rawDay=match[offset+2];
  if(offset===10&&!label)continue; // Six digits alone could be a batch number.
  if(offset===4&&rawYear.length===2&&!label)continue;
  const corrected=/[OoIl|]/.test(rawYear+rawMonth+rawDay);
  if(corrected&&!/\d/.test(rawYear))continue;
  const y=digits(rawYear),m=digits(rawMonth).padStart(2,'0'),d=digits(rawDay).padStart(2,'0'),year=y.length===2?'20'+y:y;
  if(!/^20\d{2}$/.test(year))continue;
  const parsed=new Date(Date.UTC(Number(year),Number(m)-1,Number(d)));
  if(parsed.getUTCFullYear()!==Number(year)||parsed.getUTCMonth()!==Number(m)-1||parsed.getUTCDate()!==Number(d))continue;
  const date=`${year}-${m}-${d}`,kind=kindOf(label),context=(previousLabel?previous+' / ':'')+line;
  const existing=out.find(x=>x.date===date&&x.kind===kind);
  if(existing){existing.corrected=existing.corrected&&corrected;continue;}
  out.push({date,kind,context:context.slice(0,160),shortYear:y.length===2,corrected});
 }
 // Repeated OCR passes may read a date once with its label and once without it.
 return out.filter(x=>x.kind!=='unknown'||!out.some(y=>y.date===x.date&&y.kind!=='unknown')).slice(0,15);
}
