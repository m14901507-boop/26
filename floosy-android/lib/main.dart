import 'dart:ui' as ui;
import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'finance.dart';
import 'local_db.dart';
import 'sms_parser.dart';
import 'sms_reader.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(const FloosyApp());
}

const navy = Color(0xFF071321), surface = Color(0xFF10263A);
const cyan = Color(0xFF55D7F7), dim = Color(0xFFA2B5C6);
const green = Color(0xFF5ADCB1), amber = Color(0xFFFFC178), red = Color(0xFFFF7F90);
String money(int? baisa) => baisa == null ? '—' :
    '${NumberFormat('#,##0.000', 'en').format(baisa / 1000)} ر.ع';
String whenDate(int? ms) => ms == null ? '—' :
    DateFormat('yyyy-MM-dd HH:mm').format(DateTime.fromMillisecondsSinceEpoch(ms));
String monthKey(DateTime d) => DateFormat('yyyy-MM').format(d);
int? parseMoneyInput(String text) => SmsParser.toBaisa(text);

class FloosyApp extends StatelessWidget {
  const FloosyApp({super.key});
  @override
  Widget build(BuildContext context) => MaterialApp(
    title: 'FLOOSY | محلي', debugShowCheckedModeBanner: false,
    locale: const Locale('ar', 'OM'),
    builder: (c, child) => Directionality(textDirection: ui.TextDirection.rtl, child: child!),
    theme: ThemeData(
      brightness: Brightness.dark, useMaterial3: true,
      scaffoldBackgroundColor: navy,
      colorScheme: ColorScheme.fromSeed(seedColor: cyan, brightness: Brightness.dark,
          surface: surface),
      inputDecorationTheme: InputDecorationTheme(
        filled: true, fillColor: const Color(0xFF173248),
        border: OutlineInputBorder(borderRadius: BorderRadius.circular(14))),
      cardTheme: CardThemeData(elevation: 0, color: surface,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20),
          side: BorderSide(color: cyan.withValues(alpha: .12)))),
    ),
    home: const HomePage(),
  );
}

class HomePage extends StatefulWidget {
  const HomePage({super.key});
  @override State<HomePage> createState() => _HomePageState();
}
class _HomePageState extends State<HomePage> {
  final db = LocalDb();
  int tab = 0;
  bool loading = true, importing = false;
  String? error;
  DateTime? updated;
  String month = monthKey(DateTime.now()), account = '', search = '';
  List<Map<String,dynamic>> ops = [], budgetRows = [], items = [], senders = [],
      accounts = [], reviews = [], rules = [];

  @override void initState() {super.initState();reload();}
  Future<void> reload() async {
    if (mounted) setState(() {loading = true; error = null;});
    try {
      final a = await db.allAccounts();
      if(account.isNotEmpty && !a.any((v)=>v['account_key']==account))account='';
      final values = await Future.wait([
        db.transactions(month:month,account:account), db.budgets(month:month,account:account),
        db.items(), db.senders(), db.reviewMessages(), db.rules(),
      ]);
      if(!mounted)return;
      setState(() {
        accounts=a;ops=values[0];budgetRows=values[1];items=values[2];
        senders=values[3];reviews=values[4];rules=values[5];
        updated=DateTime.now();loading=false;
      });
    } catch(e) {if(mounted)setState(() {loading=false;error='$e';});}
  }
  void showError(Object e) {
    if(mounted)ScaffoldMessenger.of(context).showSnackBar(SnackBar(content:Text('$e'),
        backgroundColor:const Color(0xFF8D3242)));
  }
  void showOk(String msg) {
    if(mounted)ScaffoldMessenger.of(context).showSnackBar(SnackBar(content:Text(msg)));
  }
  Future<void> importSms() async {
    if(importing)return;
    if(senders.isEmpty) {
      showOk('أضف معرف مرسل البنك أولًا من الإعدادات. لن نقرأ الرسائل الشخصية.');
      await openSenders();return;
    }
    final approve = await showDialog<bool>(context:context,builder:(c)=>AlertDialog(
      title:const Text('السماح بقراءة الرسائل البنكية'),
      content:const Text('سيقرأ FLOOSY رسائل المرسلين البنكيين الذين حددتهم فقط. '
        'ستحفظ الرسائل المالية المستوردة محليًا على هذا الهاتف، '
        'ولا تُرسل إلى الإنترنت. قد تتضمن الرسائل أرصدة ومعلومات خاصة.'),
      actions:[TextButton(onPressed:()=>Navigator.pop(c,false),child:const Text('إلغاء')),
        FilledButton(onPressed:()=>Navigator.pop(c,true),child:const Text('متابعة'))]));
    if(approve!=true)return;
    if(mounted)setState(()=>importing=true);
    try {
      var permission=await LocalSmsReader.hasPermission();
      if(!permission)permission=await LocalSmsReader.requestPermission();
      if(!permission){showOk('لم تُمنح صلاحية قراءة الرسائل. يمكنك تفعيلها من إعدادات Android.');return;}
      final addresses=senders.map((s)=>'${s['address']}').toList();
      final raw=await LocalSmsReader.readBankMessages(addresses);
      final report=await db.importSms(raw);
      await reload();
      showOk('استيراد ${report.transactions} عملية، ${report.balances} رصيد، '
        '${report.review} للمراجعة، وتخطي ${report.skipped} رسالة سابقة.');
    } catch(e){showError(e);}
    finally {if(mounted)setState(()=>importing=false);}
  }

  List<Map<String,dynamic>> get visibleOps {
    final q=search.trim().toLowerCase();
    if(q.isEmpty)return ops;
    return ops.where((t)=>('${t['item_name']??''} ${t['merchant']??''} '
        '${t['sms_body']??''} ${t['account_key']??''}').toLowerCase().contains(q)).toList();
  }
  int get spent => visibleOps.where((r)=>r['movement_type']=='expense')
      .fold(0,(int sum,r)=>sum+(r['amount_baisa'] as int));
  int get income => visibleOps.where((r)=>r['movement_type']=='income')
      .fold(0,(int sum,r)=>sum+(r['amount_baisa'] as int));
  int? get budgetTotal => budgetRows.isEmpty ? null : budgetRows.fold<int>(0,
      (int sum,b)=>sum+(b['amount_baisa'] as int));
  Map<String,int> get itemTotals {
    final totals=<String,int>{};
    for(final r in visibleOps.where((r)=>r['movement_type']=='expense')) {
      final name='${r['item_name']??'غير مصنف'}';
      totals[name]=(totals[name]??0)+(r['amount_baisa'] as int);
    }
    return totals;
  }
  List<String> get accountChoices => accounts.map((v)=>'${v['account_key']}').toList();
  @override Widget build(BuildContext context) => Scaffold(
    appBar:AppBar(backgroundColor:navy,title:Row(children:[
      const Icon(Icons.water_drop,color:cyan),const SizedBox(width:8),
      const Text('FLOOSY',style:TextStyle(fontWeight:FontWeight.w900,letterSpacing:1.2)),
      const SizedBox(width:9),const Text('محلي',style:TextStyle(color:green,fontSize:12)),
      const Spacer(),Text(['لوحة العرض','العمليات','الموازنات','الحسابات','المزيد'][tab],
        style:const TextStyle(color:dim,fontSize:12)),
    ]),actions:[IconButton(onPressed:importing?null:importSms,tooltip:'استيراد رسائل SMS',
       icon:importing?const SizedBox(width:19,height:19,child:CircularProgressIndicator(strokeWidth:2)):
          const Icon(Icons.sms_outlined,color:cyan))]),
    body:SafeArea(child:loading ? const Center(child:CircularProgressIndicator()):
      error != null ? Center(child:Column(mainAxisSize:MainAxisSize.min,children:[
        Text(error!,textAlign:TextAlign.center),const SizedBox(height:12),
        FilledButton(onPressed:reload,child:const Text('إعادة المحاولة'))])):
      RefreshIndicator(onRefresh:reload,child:ListView(
        padding:const EdgeInsets.fromLTRB(14,10,14,28),children:[
          if(tab==0)...dashboard(),if(tab==1)...transactionScreen(),
          if(tab==2)...budgetsScreen(),if(tab==3)...accountsScreen(),
          if(tab==4)...moreScreen(),
        ]))),
    bottomNavigationBar:NavigationBar(backgroundColor:navy,selectedIndex:tab,
      labelBehavior:NavigationDestinationLabelBehavior.alwaysShow,
      onDestinationSelected:(i)=>setState(()=>tab=i),destinations:const [
        NavigationDestination(icon:Icon(Icons.dashboard_outlined),label:'الرئيسية'),
        NavigationDestination(icon:Icon(Icons.receipt_long_outlined),label:'العمليات'),
        NavigationDestination(icon:Icon(Icons.pie_chart_outline),label:'الموازنات'),
        NavigationDestination(icon:Icon(Icons.account_balance_outlined),label:'الحسابات'),
        NavigationDestination(icon:Icon(Icons.grid_view),label:'المزيد'),
      ]),
  );
  Widget panel(List<Widget> content) => Card(child:Padding(padding:const EdgeInsets.all(16),
    child:Column(crossAxisAlignment:CrossAxisAlignment.stretch,children:content)));
  Widget heading(String s,{Widget? action}) => Padding(padding:const EdgeInsets.fromLTRB(4,16,4,9),
    child:Row(children:[Expanded(child:Text(s,style:const TextStyle(fontSize:18,fontWeight:FontWeight.w800))),
      if(action!=null)action]));
  Widget info(String label,String value,{Color? color})=>Padding(
    padding:const EdgeInsets.symmetric(vertical:6),child:Row(children:[
      Expanded(child:Text(label,style:const TextStyle(color:dim,fontSize:13))),
      Flexible(child:Text(value,textAlign:TextAlign.left,
        style:TextStyle(color:color??Colors.white,fontWeight:FontWeight.bold,fontSize:14)))]));
  Widget stateBadge(String value, Color c) => Align(alignment:Alignment.centerRight,
    child:Chip(label:Text(value,style:TextStyle(color:c,fontSize:12)),
      backgroundColor:c.withValues(alpha:.14),side:BorderSide.none));
  Widget progress(double? ratio)=>ClipRRect(borderRadius:BorderRadius.circular(6),
    child:LinearProgressIndicator(value:ratio==null?0:ratio.clamp(0,1),minHeight:8,
      backgroundColor:Colors.white12,color:ratio==null?dim:ratio>=1?red:ratio>=.8?amber:green));

  Widget filterPanel()=>panel([
    Row(children:[const Icon(Icons.tune,color:cyan),const SizedBox(width:8),
      const Expanded(child:Text('الفلاتر',style:TextStyle(fontWeight:FontWeight.w800))),
      TextButton.icon(onPressed:openFilters,icon:const Icon(Icons.edit_note),label:const Text('تعديل'))]),
    info('الشهر',month),info('الحساب',account.isEmpty?'كل الحسابات':account),
  ]);
  void openFilters(){var m=month;var a=account;
    showModalBottomSheet(context:context,showDragHandle:true,isScrollControlled:true,
      builder:(sheet)=>StatefulBuilder(builder:(c,update)=>Padding(
      padding:EdgeInsets.fromLTRB(20,10,20,MediaQuery.viewInsetsOf(c).bottom+24),
      child:Column(mainAxisSize:MainAxisSize.min,children:[
        const Text('تصفية البيانات المحلية',style:TextStyle(fontSize:19,fontWeight:FontWeight.bold)),
        const SizedBox(height:16),
        DropdownButtonFormField<String>(initialValue:m,decoration:const InputDecoration(labelText:'الشهر'),
          items:List.generate(24,(i){final k=monthKey(DateTime(DateTime.now().year,
            DateTime.now().month-i));return DropdownMenuItem(value:k,child:Text(k));}),
          onChanged:(v)=>update(()=>m=v??m)),
        const SizedBox(height:14),
        DropdownButtonFormField<String>(initialValue:a,decoration:const InputDecoration(labelText:'الحساب'),
          isExpanded:true,items:[const DropdownMenuItem(value:'',child:Text('كل الحسابات')),
            ...accountChoices.map((e)=>DropdownMenuItem(value:e,child:Text(e,overflow:TextOverflow.ellipsis)))],
          onChanged:(v)=>update(()=>a=v??'')),
        const SizedBox(height:20),SizedBox(width:double.infinity,child:FilledButton(
          onPressed:()async{setState((){month=m;account=a;});Navigator.pop(sheet);await reload();},
          child:const Text('تطبيق'))),
      ]))));
  }

  List<Widget> dashboard() {
    final budget=budgetTotal;
    final ratio=budget==null||budget<=0?null:spent/budget;
    final state=Finance.budgetStatus(spent.toDouble(),budget?.toDouble());
    final stateColor=state.contains('يتجاوز')||state.contains('دون')?red:
      state.contains('قريب')?amber:state=='متاح'?green:dim;
    final entries=itemTotals.entries.toList()..sort((a,b)=>b.value.compareTo(a.value));
    final now=DateTime.now();
    final start=DateTime(int.parse(month.substring(0,4)),int.parse(month.substring(5,7)));
    final end=DateTime(start.year,start.month+1);
    final forecast=Finance.forecast(spent:spent/1000,start:start,end:end,now:now,
      records:visibleOps.where((o)=>o['movement_type']=='expense').length);
    return [filterPanel(),heading('ملخص الفترة المختارة'),panel([
      info('إجمالي المصروفات',money(spent),color:red),
      info('الموازنة المعتمدة',money(budget)),
      info(spent>(budget??0)&&budget!=null?'مقدار التجاوز':'المتبقي',
        budget==null?'غير محدد':money((budget-spent).abs()),
        color:budget!=null&&spent>budget?red:green),
      info('نسبة استخدام الموازنة',ratio==null?'—':'${(ratio*100).toStringAsFixed(1)}%'),
      progress(ratio),const SizedBox(height:8),stateBadge(state,stateColor),
    ]),panel([
      info('المصروف المتوقع حتى نهاية الشهر',forecast==null?'لا توجد بيانات كافية للتوقع':
        money((forecast*1000).round())),
      info('إجمالي الدخل المسجل',money(income)),
      const Text('الرصيد المؤكد يظهر عند اختيار حساب، ويُستخرج من رسالة البنك فقط.',
        style:TextStyle(color:dim,fontSize:12)),
    ]),heading('تحليل المصروفات'),panel([
      info('عدد عمليات الصرف','${visibleOps.where((o)=>o['movement_type']=='expense').length}'),
      info('أكثر بند صرفًا',entries.isEmpty?'—':entries.first.key),
      info('قيمة البند الأول',entries.isEmpty?'—':money(entries.first.value)),
      const Divider(height:25),
      if(entries.isEmpty)const Text('لا توجد مصروفات مطابقة للفلاتر'),
      for(final e in entries.take(10))...[
        Row(children:[Expanded(child:Text(e.key,overflow:TextOverflow.ellipsis)),
          Text(money(e.value),style:const TextStyle(color:cyan,fontSize:12))]),
        const SizedBox(height:5),progress(spent==0?null:e.value/spent),
        const SizedBox(height:10),
      ],
    ]),if(senders.isEmpty)panel([
      const Text('لبدء الاستخدام: أضف مُرسل البنك ثم استورد الرسائل.'),
      const SizedBox(height:10),FilledButton.icon(onPressed:openSenders,
        icon:const Icon(Icons.add),label:const Text('إضافة مُرسل بنك')),
    ])];
  }

  List<Widget> transactionScreen()=>[filterPanel(),
    Padding(padding:const EdgeInsets.symmetric(vertical:7),child:TextField(
      onChanged:(v)=>setState(()=>search=v),decoration:const InputDecoration(
        prefixIcon:Icon(Icons.search),hintText:'ابحث في العمليات والرسائل'))),
    heading('سجل العمليات',action:Text('${visibleOps.length} عملية',style:const TextStyle(color:dim))),
    if(visibleOps.isEmpty)panel([const Text('لا توجد عمليات، أو أن الرسائل المستوردة تحتاج مراجعة')]),
    for(final op in visibleOps.take(500))Card(child:ListTile(
      title:Text('${op['item_name']??'غير مصنف'}',maxLines:1,overflow:TextOverflow.ellipsis),
      subtitle:Text('${whenDate(op['occurred_ms'] as int?)}  •  ${op['account_key']}\n'
        '${op['merchant']==''?'رسالة بنكية':op['merchant']}',
        style:const TextStyle(fontSize:11,color:dim),maxLines:2),
      isThreeLine:true,
      trailing:Text(money(op['amount_baisa'] as int?),style:TextStyle(
        fontWeight:FontWeight.bold,color:op['movement_type']=='expense'?red:green)),
      onTap:()=>classifyDialog(op),
    )),
  ];

  Future<void> classifyDialog(Map<String,dynamic> op) async {
    int? itemId=op['item_id'] as int?;
    bool remember=false;
    final word=TextEditingController(text:'${op['merchant']??''}');
    await showModalBottomSheet(context:context,isScrollControlled:true,showDragHandle:true,
      builder:(sheet)=>StatefulBuilder(builder:(c,update)=>SingleChildScrollView(child:Padding(
      padding:EdgeInsets.fromLTRB(18,8,18,MediaQuery.viewInsetsOf(c).bottom+30),
      child:Column(mainAxisSize:MainAxisSize.min,crossAxisAlignment:CrossAxisAlignment.stretch,
      children:[const Text('تصنيف العملية',style:TextStyle(fontSize:19,fontWeight:FontWeight.w800)),
        const SizedBox(height:10),info('قيمة العملية',money(op['amount_baisa'] as int?)),
        info('تاريخ العملية',whenDate(op['occurred_ms'] as int?)),
        Text('${op['sms_body']??''}',style:const TextStyle(color:dim,fontSize:12)),
        const SizedBox(height:14),DropdownButtonFormField<int?>(initialValue:itemId,
          isExpanded:true,decoration:const InputDecoration(labelText:'تصنيف العملية إلى بند'),
          items:[const DropdownMenuItem<int?>(value:null,child:Text('غير مصنف')),
            ...items.map((i)=>DropdownMenuItem<int?>(value:i['id'] as int,
              child:Text('${i['name']}')))],onChanged:(v)=>update(()=>itemId=v)),
        CheckboxListTile(value:remember && itemId!=null,
          onChanged:itemId==null?null:(v)=>update(()=>remember=v??false),
          title:const Text('طبّق هذا التصنيف على الرسائل الجديدة التي تحتوي هذه الكلمة'),
          controlAffinity:ListTileControlAffinity.leading),
        if(remember)TextField(controller:word,decoration:const InputDecoration(
          labelText:'اسم المتجر أو الكلمة المفتاحية (3 أحرف على الأقل)')),
        const SizedBox(height:15),FilledButton(onPressed:()async{
          try{
            if(remember&&itemId!=null&&word.text.trim().length<3){
              throw const FormatException('أدخل كلمة تصنيف من 3 أحرف على الأقل');}
            await db.classify(op['id'] as int,itemId);
            if(remember&&itemId!=null)await db.addRule(word.text,itemId!);
            if(!sheet.mounted)return;Navigator.pop(sheet);await reload();
            showOk('حُفظ التصنيف داخل قاعدة بيانات الهاتف');
          }catch(e){showError(e);}
        },child:const Text('حفظ التصنيف')),
      ])))));
    word.dispose();
  }

  List<Widget> budgetsScreen()=>[filterPanel(),heading('الموازنات المحلية',
      action:TextButton.icon(onPressed:openBudget,icon:const Icon(Icons.add),label:const Text('إضافة'))),
    if(budgetRows.isEmpty)panel([const Text('لا توجد موازنة محفوظة للشهر المحدد')]),
    for(final b in budgetRows)panel([
      Text('${b['name']}',style:const TextStyle(fontSize:16,fontWeight:FontWeight.bold)),
      info('المبلغ المعتمد',money(b['amount_baisa'] as int)),
      info('الحساب',b['account_key']==''?'جميع الحسابات':'${b['account_key']}'),
      Align(alignment:Alignment.centerLeft,child:TextButton.icon(
        onPressed:()async{await db.deleteBudget(b['id'] as int);await reload();},
        icon:const Icon(Icons.delete_outline,color:red),label:const Text('حذف'))),
    ])];

  Future<void> openBudget()async{
    final name=TextEditingController(),value=TextEditingController();
    var forAccount=account;
    await showModalBottomSheet(context:context,isScrollControlled:true,showDragHandle:true,
      builder:(sheet)=>StatefulBuilder(builder:(c,change)=>Padding(
      padding:EdgeInsets.fromLTRB(20,12,20,MediaQuery.viewInsetsOf(c).bottom+24),
      child:Column(mainAxisSize:MainAxisSize.min,children:[
        const Text('موازنة جديدة',style:TextStyle(fontSize:19,fontWeight:FontWeight.bold)),
        const SizedBox(height:12),TextField(controller:name,
          decoration:const InputDecoration(labelText:'اسم الموازنة')),
        const SizedBox(height:12),TextField(controller:value,
          keyboardType:const TextInputType.numberWithOptions(decimal:true),
          decoration:const InputDecoration(labelText:'المبلغ بالريال العماني (مثال 120.500)')),
        const SizedBox(height:12),DropdownButtonFormField<String>(initialValue:forAccount,
          isExpanded:true,decoration:const InputDecoration(labelText:'الحساب'),
          items:[const DropdownMenuItem(value:'',child:Text('كل الحسابات')),
            ...accountChoices.map((s)=>DropdownMenuItem(value:s,child:Text(s,
               overflow:TextOverflow.ellipsis)))],onChanged:(v)=>change(()=>forAccount=v??'')),
        const SizedBox(height:15),SizedBox(width:double.infinity,child:FilledButton(
          onPressed:()async{try{
            final b=parseMoneyInput(value.text);
            if(b==null)throw const FormatException('أدخل مبلغًا صحيحًا بثلاث منازل عشرية كحد أقصى');
            await db.saveBudget(month:month,name:name.text,amountBaisa:b,account:forAccount);
            if(!sheet.mounted)return;Navigator.pop(sheet);await reload();
          }catch(e){showError(e);}},child:const Text('حفظ'))),
      ]))));
    name.dispose();value.dispose();
  }

  List<Widget> accountsScreen() => [filterPanel(),heading('الحسابات والأرصدة'),
    if(account.isEmpty)panel([const Text('اختر حسابًا من الفلاتر لعرض رصيده المؤكد. '
      'لن تُجمع أرصدة الحسابات تلقائيًا.')]),
    if(account.isNotEmpty)FutureBuilder<Map<String,dynamic>?>(
      future:db.latestConfirmedBalance(account),
      builder:(c,s)=>panel([
        Text(account,style:const TextStyle(fontWeight:FontWeight.bold)),
        if(s.connectionState != ConnectionState.done)const Text('جاري جلب الرصيد المحلي...'),
        if(s.connectionState == ConnectionState.done && !s.hasData)const Text('لا يوجد رصيد بنكي مؤكد لهذا الحساب'),
        if(s.hasData)...[
          info('الرصيد المؤكد',money(s.data!['balance_baisa'] as int?),color:green),
          info('تاريخ رسالة البنك',whenDate(s.data!['confirmed_ms'] as int?)),
          const Text('المصدر: رسالة SMS بنكية، وليس ناتج جمع وطرح العمليات.',
            style:TextStyle(color:dim,fontSize:12)),
          Builder(builder:(ctx){
            final now=DateTime.now(),start=DateTime(int.parse(month.substring(0,4)),
              int.parse(month.substring(5,7)));
            final prediction=Finance.forecast(spent:spent/1000,start:start,
              end:DateTime(start.year,start.month+1),now:now,
              records:ops.where((v)=>v['movement_type']=='expense').length);
            final balance=s.data!['balance_baisa'] as int;
            return prediction==null?const SizedBox.shrink():Column(children:[
              const Divider(),info('المصروف المتوقع',money((prediction*1000).round())),
              info('الفرق المتوقع',money(balance-(prediction*1000).round())),
              Builder(builder:(_) {final status=Finance.balanceStatus(prediction*1000,balance.toDouble());
                return stateBadge(status,status.contains('يتجاوز')?red:
                  status.contains('قريب')?amber:green);}),
            ]);
          }),
        ],
      ])),
    heading('الحسابات التي ظهرت في الرسائل'),
    if(accounts.isEmpty)panel([const Text('لا توجد حسابات حتى الآن')]),
    for(final a in accounts)Card(child:ListTile(title:Text('${a['account_key']}'),
      trailing:const Icon(Icons.chevron_left),onTap:()async{
        setState(()=>account='${a['account_key']}');await reload();})),
  ];

  List<Widget> moreScreen()=>[
    heading('الرسائل والتصنيف'),panel([
      ListTile(leading:const Icon(Icons.sms,color:cyan),title:const Text('استيراد رسائل SMS'),
        subtitle:const Text('من رسائل البنك فقط'),onTap:importSms),
      ListTile(leading:const Icon(Icons.account_balance,color:cyan),
        title:const Text('مرسلو البنوك المعتمدون'),subtitle:Text('${senders.length} مُرسل'),
        onTap:openSenders),
      ListTile(leading:const Icon(Icons.category_outlined,color:cyan),
        title:const Text('دليل البنود'),subtitle:Text('${items.length} بند'),onTap:openItems),
      ListTile(leading:const Icon(Icons.rule,color:cyan),title:const Text('قواعد التصنيف التلقائي'),
        subtitle:Text('${rules.length} قاعدة'),onTap:openRules),
      ListTile(leading:const Icon(Icons.fact_check_outlined,color:amber),
        title:const Text('رسائل تحتاج مراجعة'),subtitle:Text('${reviews.length} رسالة'),
        onTap:openReviews),
    ]),heading('الخصوصية وحفظ البيانات'),panel([
      const Text('بيانات FLOOSY محفوظة داخل قاعدة SQLite الخاصة بالتطبيق على هاتف Android. '
        'لا يوجد اتصال بخادم ولا ربط بريد إلكتروني. قراءة SMS تتطلب إذن Android.'),
      const SizedBox(height:12),
      info('آخر تحديث',updated==null?'—':DateFormat('HH:mm').format(updated!)),
      const Text('تنبيه: إزالة التطبيق أو مسح بياناته سيزيل قاعدة البيانات. '
        'لا توجد نسخة سحابية أو نسخ احتياطي في هذا الإصدار.',
        style:TextStyle(color:amber,fontSize:12)),
    ])];

  Future<void> openSenders()async{
    final sender=TextEditingController(),label=TextEditingController();
    await showModalBottomSheet(context:context,isScrollControlled:true,showDragHandle:true,
      builder:(sheet)=>StatefulBuilder(builder:(c,update)=>SingleChildScrollView(child:Padding(
      padding:EdgeInsets.fromLTRB(18,8,18,MediaQuery.viewInsetsOf(c).bottom+26),
      child:Column(mainAxisSize:MainAxisSize.min,crossAxisAlignment:CrossAxisAlignment.stretch,children:[
        const Text('مرسلو البنوك',style:TextStyle(fontSize:19,fontWeight:FontWeight.bold)),
        const Text('اكتب معرّف مرسل الرسالة كما يظهر في تطبيق SMS تمامًا. '
          'لن تُستورد رسائل من مرسلين آخرين.',style:TextStyle(color:dim,fontSize:12)),
        const SizedBox(height:10),
        for(final s in senders)ListTile(title:Text('${s['label']}'),subtitle:Text('${s['address']}'),
          trailing:IconButton(icon:const Icon(Icons.delete_outline,color:red),onPressed:()async{
            await db.removeSender(s['id'] as int);await reload();update((){});
          })),
        TextField(controller:sender,textDirection:ui.TextDirection.ltr,
          decoration:const InputDecoration(labelText:'معرّف مرسل SMS (مثال BANKNAME)')),
        const SizedBox(height:10),TextField(controller:label,
          decoration:const InputDecoration(labelText:'اسم البنك')),
        const SizedBox(height:14),FilledButton(onPressed:()async{try{
          await db.addSender(sender.text,label.text);sender.clear();label.clear();
          await reload();update((){});
        }catch(e){showError(e);}},child:const Text('إضافة مُرسل')),
      ])))));
    sender.dispose();label.dispose();
  }

  Future<void> openItems()async{
    final name=TextEditingController();
    await showModalBottomSheet(context:context,isScrollControlled:true,showDragHandle:true,
      builder:(sheet)=>StatefulBuilder(builder:(c,update)=>SingleChildScrollView(child:Padding(
      padding:EdgeInsets.fromLTRB(18,8,18,MediaQuery.viewInsetsOf(c).bottom+28),
      child:Column(mainAxisSize:MainAxisSize.min,crossAxisAlignment:CrossAxisAlignment.stretch,children:[
        const Text('دليل البنود المحلية',style:TextStyle(fontSize:19,fontWeight:FontWeight.bold)),
        const SizedBox(height:10),Wrap(spacing:6,children:[for(final i in items)
          Chip(label:Text('${i['name']}'))]),
        const SizedBox(height:10),TextField(controller:name,
          decoration:const InputDecoration(labelText:'اسم بند جديد')),
        const SizedBox(height:12),FilledButton(onPressed:()async{try{
          await db.addItem(name.text);name.clear();await reload();update((){});
        }catch(e){showError(e);}},child:const Text('إضافة بند')),
      ])))));
    name.dispose();
  }
  Future<void> openRules()async{
    await showModalBottomSheet(context:context,showDragHandle:true,isScrollControlled:true,
      builder:(sheet)=>StatefulBuilder(builder:(c,update)=>SingleChildScrollView(child:Padding(
      padding:const EdgeInsets.fromLTRB(18,5,18,26),child:Column(
      mainAxisSize:MainAxisSize.min,crossAxisAlignment:CrossAxisAlignment.stretch,children:[
      const Text('قواعد التصنيف',style:TextStyle(fontSize:19,fontWeight:FontWeight.bold)),
      const Text('تُطبّق على الرسائل المستقبلية. أنشئ قاعدة من تفاصيل أي عملية.',
        style:TextStyle(color:dim,fontSize:12)),
      if(rules.isEmpty)const Padding(padding:EdgeInsets.all(16),child:Text('لا توجد قواعد بعد')),
      for(final rule in rules)ListTile(title:Text('${rule['keyword']}'),
        subtitle:Text('${rule['item_name']}'),trailing:IconButton(
          icon:const Icon(Icons.delete_outline,color:red),onPressed:()async{
            await db.deleteRule(rule['id'] as int);await reload();update((){});
          })),
      ])))));
  }
  Future<void> openReviews()async{
    await showModalBottomSheet(context:context,isScrollControlled:true,showDragHandle:true,
      builder:(sheet)=>StatefulBuilder(builder:(c,update)=>SingleChildScrollView(child:Padding(
      padding:EdgeInsets.fromLTRB(16,5,16,MediaQuery.viewInsetsOf(c).bottom+25),
      child:Column(mainAxisSize:MainAxisSize.min,crossAxisAlignment:CrossAxisAlignment.stretch,children:[
      const Text('رسائل للمراجعة اليدوية',style:TextStyle(fontSize:19,fontWeight:FontWeight.bold)),
      const Text('لا تدخل المبالغ غير المفهومة في تقارير المصروفات قبل تأكيدك.',
        style:TextStyle(color:dim,fontSize:12)),
      if(reviews.isEmpty)const Padding(padding:EdgeInsets.all(16),child:Text('لا توجد رسائل تحتاج مراجعة')),
      for(final r in reviews)Card(child:Padding(padding:const EdgeInsets.all(8),child:Column(
        crossAxisAlignment:CrossAxisAlignment.stretch,children:[
        info('${r['sender']}',whenDate(r['received_ms'] as int?)),
        Text('${r['body']}',style:const TextStyle(fontSize:12)),
        const SizedBox(height:5),Text('${r['reason']}',style:const TextStyle(color:amber,fontSize:12)),
        TextButton.icon(onPressed:()async{
          Navigator.pop(sheet);await correctReview(r);
        },icon:const Icon(Icons.edit),label:const Text('مراجعة وإنشاء عملية')),
      ]))),
    ])))));
  }
  Future<void> correctReview(Map<String,dynamic> msg)async{
    final value=TextEditingController();String movement='expense';int? chosen;
    await showModalBottomSheet(context:context,isScrollControlled:true,showDragHandle:true,
      builder:(sheet)=>StatefulBuilder(builder:(c,update)=>SingleChildScrollView(child:Padding(
      padding:EdgeInsets.fromLTRB(18,8,18,MediaQuery.viewInsetsOf(c).bottom+25),
      child:Column(mainAxisSize:MainAxisSize.min,crossAxisAlignment:CrossAxisAlignment.stretch,children:[
      const Text('تصحيح رسالة بنكية',style:TextStyle(fontSize:19,fontWeight:FontWeight.bold)),
      const SizedBox(height:10),Text('${msg['body']}'),const SizedBox(height:12),
      TextField(controller:value,keyboardType:const TextInputType.numberWithOptions(decimal:true),
        decoration:const InputDecoration(labelText:'مبلغ العملية بالريال العماني')),
      const SizedBox(height:12),DropdownButtonFormField<String>(initialValue:movement,
        decoration:const InputDecoration(labelText:'نوع العملية'),items:const [
        DropdownMenuItem(value:'expense',child:Text('مصروف')),
        DropdownMenuItem(value:'income',child:Text('دخل'))],
        onChanged:(v)=>update(()=>movement=v??movement)),
      const SizedBox(height:12),DropdownButtonFormField<int?>(initialValue:chosen,
        decoration:const InputDecoration(labelText:'البند'),isExpanded:true,
        items:[const DropdownMenuItem<int?>(value:null,child:Text('غير مصنف')),
          ...items.map((i)=>DropdownMenuItem<int?>(value:i['id'] as int,child:Text('${i['name']}')))],
        onChanged:(v)=>update(()=>chosen=v)),
      const SizedBox(height:15),FilledButton(onPressed:()async{try{
        final b=parseMoneyInput(value.text);
        if(b==null||b<=0)throw const FormatException('المبلغ غير صحيح');
        await db.reviewToTransaction(smsId:msg['sms_id'] as int,amountBaisa:b,
          movementType:movement,itemId:chosen);
        if(!sheet.mounted)return;Navigator.pop(sheet);await reload();showOk('حُفظت العملية بعد مراجعتك');
      }catch(e){showError(e);}},child:const Text('اعتماد العملية')),
    ])))));
    value.dispose();
  }
}
