import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { stripTypeScriptTypes } from 'node:module';

const root=path.resolve(import.meta.dirname,'..');
function context(){
  const elements=new Map();
  const element=id=>{if(!elements.has(id))elements.set(id,{value:'',innerHTML:'',textContent:'',style:{},classList:{toggle(){}},options:[]});return elements.get(id);};
  const c=vm.createContext({console,document:{getElementById:element}});
  const html=fs.readFileSync(path.join(root,'preview/base.html'),'utf8');
  const script=html.match(/<script>([\s\S]*?)<\/script>/)[1];
  vm.runInContext(script.slice(0,script.indexOf("$('month').value=nowMonth()")),c);
  for(const file of ['transactions-table-fix.js','operations-schema-fix.js'])vm.runInContext(fs.readFileSync(path.join(root,'preview',file),'utf8'),c);
  element('month').value='2026-09';element('monthOffset').value='0';
  return {c,element,run:code=>vm.runInContext(code,c)};
}
const headers=['معرف الرسالة','التاريخ والوقت','البند','التصنيف','المبلغ','الطرف','نوع العملية','قناة العملية','البنك','النظام','حالة التسجيل','تاريخ الإدخال','الفئة','الفترة','الصنف','معرف الحساب','مصدر الموازنة','الرصيد','اتجاه الحركة','تاريخ الرصيد'];
const row=(id,date,amount,movement)=>[id,date,'بند تجريبي','عائلي شهري',amount,'وصف',movement,'','بنك الأهلي 001','','','','أساسي','شهري','عائلي','AHLI_001','عائلي شهري'];
function setData(ctx,rows,h=headers){ctx.run(`DATA.operations=${JSON.stringify(rows)};DATA.opHeaders=${JSON.stringify(h)};`);}

test('four-digit year, full time, Arabic digits and time-first dates remain intact',()=>{
  const {run}=context();
  for(const s of ['01/09/2026 14:30:45','14:30:45 01/09/2026','٠١/٠٩/٢٠٢٦ ١٤:٣٠:٤٥','2026-09-01T14:30:45']){
    assert.equal(run(`formatDateTime(parseDate(${JSON.stringify(s)}))`),'01/09/2026 14:30');
    assert.equal(run(`parseDate(${JSON.stringify(s)}).getSeconds()`),45);
  }
});
test('date interpretation is independent of filters',()=>{
  const ctx=context();
  for(const month of ['2026-09','2026-01']){ctx.element('month').value=month;assert.equal(ctx.run("mk(parseDate('01/09/2026'))"),'2026-09');}
});
test('invalid dates and times are rejected rather than rolled over',()=>{
  const {run}=context();for(const s of ['31/02/2026','29/02/2025','01/09/2026 24:00','01/09/2026 12:99','2026-02-31','01/09/2026 junk',''])assert.equal(run(`parseDate(${JSON.stringify(s)})`),null,s);
  assert.equal(run("mk(parseDate('29/02/2024'))"),'2024-02');
});
test('Sheets serials and ISO instants use Oman calendar dates',()=>{
  const {run}=context();
  const serial=(Date.UTC(2026,8,1,14,30)-Date.UTC(1899,11,30))/86400000;
  assert.equal(run(`formatDateTime(parseDate(${serial}))`),'01/09/2026 14:30');
  assert.equal(run("formatDateTime(parseDate('2026-08-31T21:30:00Z'))"),'01/09/2026 01:30');
  assert.equal(run("formatDateTime(parseDate('2026-09-01T01:30:00+04:00'))"),'01/09/2026 01:30');
});
test('rows and totals reconcile; income and internal transfers stay visible',()=>{
  const ctx=context();setData(ctx,[row('a','01/09/2026 14:30',10.125,'مصروف'),row('b','02/09/2026',100,'دخل'),row('c','03/09/2026',30,'تحويل داخلي'),row('d','01/08/2026',50,'مصروف'),[]]);
  assert.equal(ctx.run('summary().ops.length'),3);
  assert.equal(ctx.run('summary().spent'),10.125);
  assert.equal(ctx.run('summary().income'),100);
  ctx.run('renderDashboard();renderTransactions();');
  assert.equal((ctx.element('dashTable').innerHTML.match(/<tr>/g)||[]).length,3);
  assert.equal(ctx.element('txTable').innerHTML,ctx.element('dashTable').innerHTML);
  ctx.element('month').value='2026-01';assert.equal(ctx.run('filteredOps().length'),0);
  ctx.element('month').value='2026-08';ctx.element('monthOffset').value='1';assert.equal(ctx.run('summary().ops.length'),4);
});
test('header reordering, optional analytic fields and numeric text',()=>{
  const ctx=context(),r=row('a','01/09/2026','١٬٢٣٤٫٥٠٠','مصروف');
  setData(ctx,[r],headers);assert.equal(ctx.run('summary().spent'),1234.5);
  const order=[4,2,1,6,0,8,3,5,16,15];setData(ctx,[order.map(i=>r[i])],order.map(i=>headers[i]));
  assert.equal(ctx.run('summary().spent'),1234.5);assert.equal(ctx.run('allOps()[0].accountKey'),'بنك الأهلي|001');
  setData(ctx,[r],headers.map(h=>h==='المبلغ'?'خطأ':h));assert.throws(()=>ctx.run('allOps()'),/عنوان مفقود/);
  setData(ctx,[r],[...headers,'المبلغ']);assert.throws(()=>ctx.run('allOps()'),/عنوان مكرر/);
});
test('account, budget, movement and week filters select the same rows as totals',()=>{
  const ctx=context();setData(ctx,[row('a','01/09/2026',10,'مصروف'),row('b','09/09/2026',20,'مصروف'),row('c','02/09/2026',100,'دخل')]);
  ctx.element('accountFilter').value='بنك الأهلي|001';ctx.element('weekFilter').value='1';ctx.element('movementFilter').value='مصروف';ctx.element('budgetFilter').value='عائلي شهري';
  assert.equal(ctx.run('summary().ops.length'),1);assert.equal(ctx.run('summary().spent'),10);
});

test('authenticated operations endpoint returns all nonblank rows without writes or Gmail',async()=>{
  const requests=[];
  const rows=[row('a','01/09/2026',10,'مصروف'),row('b','02/09/2026',100,'دخل'),row('c','03/09/2026',30,'تحويل داخلي'),[]];
  const c=vm.createContext({console,URL,URLSearchParams,Request,Response,TextEncoder,TextDecoder,Uint8Array,crypto:globalThis.crypto,btoa,atob,fetch:async(url,init={})=>{
    requests.push({url:String(url),method:init.method||'GET'});
    if(String(url)==='https://oauth2.googleapis.com/token')return Response.json({access_token:'test-token'});
    if(String(url).includes('sheets.googleapis.com')&&String(url).includes('/values/'))return Response.json({values:[headers,...rows]});
    throw Error('Unexpected external request '+url);
  }});
  const modules=new Map();
  async function load(file){if(modules.has(file))return modules.get(file);const mod=new vm.SourceTextModule(stripTypeScriptTypes(fs.readFileSync(file,'utf8')),{context:c,identifier:file});modules.set(file,mod);await mod.link((spec,parent)=>load(path.resolve(path.dirname(parent.identifier),spec+'.ts')));return mod;}
  const mod=await load(path.join(root,'worker/src/router23.ts'));await mod.evaluate();const worker=mod.namespace.default;
  const env={GOOGLE_CLIENT_ID:'test',GOOGLE_CLIENT_SECRET:'test',GOOGLE_REFRESH_TOKEN:'test',SPREADSHEET_ID:'test',FLOOSY_PASSWORD:'test'};
  const denied=await worker.fetch(new Request('https://example.test/api/operations'),env);assert.equal(denied.status,401);assert.equal(requests.length,0);
  const login=await worker.fetch(new Request('https://example.test/auth/login',{method:'POST',body:JSON.stringify({password:'test'}),headers:{'Content-Type':'application/json'}}),env);const {session}=await login.json();
  const response=await worker.fetch(new Request('https://example.test/api/operations',{headers:{Authorization:'Bearer '+session}}),env);const data=await response.json();
  assert.equal(response.status,200);assert.equal(data.rowCount,3);assert.deepEqual(data.rows,rows.slice(0,3));assert.equal(data.liveCount,0);
  assert.equal(requests.filter(r=>r.url.includes('gmail.')).length,0);
  assert.equal(requests.filter(r=>r.url.includes('sheets.')&&r.method!=='GET').length,0);
});
