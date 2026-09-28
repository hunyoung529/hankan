import test from 'node:test';
import assert from 'node:assert/strict';
import {extractDates,normalizeItem} from '../src/domain.mjs';
import {extractNames,applyScan,combineReadings,scanSummary,scanRegions,scanSize} from '../src/label.mjs';

test('stamped dates tolerate OCR confusions, full-width print, spaces and separated labels',()=>{
 const fixtures=[
  ['소 비 기 한\n2O26.O9.2O', '2026-09-20','useby',true],
  ['소비기한 ２０２６．０９．２０', '2026-09-20','useby',false],
  ['유통기한 26 09 20', '2026-09-20','sellby',false],
  ['2026 09 20 까지 소비기한', '2026-09-20','useby',false],
  ['소비기한 260920', '2026-09-20','useby',false],
  ['EXP 2026,09,20', '2026-09-20','unknown',false],
  ['제 조 일 자\n2026.09.10', '2026-09-10','manufactured',false],
  ['2026년 9월 20일', '2026-09-20','unknown',false]
 ];
 for(const [text,date,kind,corrected] of fixtures){const [result]=extractDates(text);assert.equal(result?.date,date,text);assert.equal(result.kind,kind,text);assert.equal(result.corrected,corrected,text);}
});
test('batch numbers and impossible dates are excluded; manufacturing dates never auto-fill',()=>{
 for(const text of ['260920','LOT 20260920','품목보고번호 20260920','2026.02.29','2026.13.20','2026.09.201','단백질 20 12 15','OOOO.OO.OO'])assert.deepEqual(extractDates(text),[],text);
 const result=applyScan({name:'우유',date:'',verified:false},'제조일자\n2026.09.10');assert.equal(result.form.date,'');
 assert.equal(extractDates('제조일자 2026.09.10\n2026.09.20')[1].kind,'unknown');
 assert.deepEqual(extractDates('제조일자 2026.09.10 소비기한 2026.09.20').map(x=>x.kind),['manufactured','useby']);
});
test('names come from product labels and prominent text, excluding ingredient and nutrition panels',()=>{
 const text='한칸\n부침용 두부 300g\n소비기한 2026.09.20\n원재료명 대두, 정제수\n나트륨 20mg\n우유 함유\n냉장 보관';
 assert.equal(extractNames(text)[0].name,'부침용 두부');
 assert.deepEqual(extractNames('영양정보\n단백질 8g\n원재료명 우유\n냉장보관\n고객상담 080-123-4567'),[]);
 assert.equal(extractNames('제품명: 고소한 검은콩 두유\n식품유형 두유')[0].name,'고소한 검은콩 두유');
 assert.equal(extractNames('제품명\n프리미엄 견과 믹스\n제조일 2026.09.10')[0].name,'프리미엄 견과 믹스');
 assert.equal(extractNames({lines:[{text:'오트드링크',height:50},{text:'브랜드',height:15},{text:'1000ml',height:15}]} )[0].name,'오트드링크');
});
test('front/back scanning fills both fields, preserves manual edits and requires date confirmation',()=>{
 const blank={id:'sample',name:'',ingredient:'기타',date:'',verified:false,quantity:1};
 const front=applyScan(blank,'부침용 두부');
 assert.equal(front.form.name,'부침용 두부');assert.equal(front.form.ingredient,'두부');
 const back=applyScan(front.form,'제품명 두부\n소비기한\n2026.09.20',front.auto);
 assert.equal(back.form.name,'부침용 두부');assert.equal(back.form.date,'2026-09-20');assert.equal(back.form.verified,false);
 assert.throws(()=>normalizeItem(back.form));
 const manual=applyScan({...back.form,name:'우리집 두부',date:'2026-09-21'},'우유\n2026.09.22',back.auto);
 assert.equal(manual.form.name,'우리집 두부');assert.equal(manual.form.date,'2026-09-21');
 assert.equal(applyScan(blank,'2026.09.20\n2026.09.21').form.date,'');
});
test('multiple passes deduplicate dates; blank and unparseable OCR have distinct recovery messages',()=>{
 const merged=combineReadings(['소비기한 2026.09.20','2026.09.20','소비기한 2O26.O9.2O']);
 assert.equal(extractDates(merged.text).length,1);assert.equal(extractDates(merged.text)[0].corrected,false);
 assert.match(scanSummary('').message,/글자를 읽지 못/);assert.match(scanSummary('서울우유').message,/글자는 읽었지만/);
});
test('crop passes overlap, cover the photo, and keep large camera images within memory limits',()=>{
 for(const [w,h] of [[4032,3024],[3024,4032],[1200,450],[8000,5000]]){
  const regions=scanRegions(w,h),strips=regions.slice(1);
  assert.equal(strips[0].y,0);assert.equal(strips.at(-1).y+strips.at(-1).height,h);
  for(const crop of ['full','top','middle','bottom','center'])for(const r of scanRegions(w,h,crop)){
   assert.ok(r.x>=0&&r.y>=0&&r.x+r.width<=w&&r.y+r.height<=h);
   const size=scanSize(r.width,r.height);assert.ok(size.width<=3200&&size.height<=3200&&size.width*size.height<=6010000);
  }
  assert.ok(strips[0].y+strips[0].height>strips[1].y);
 }
});
