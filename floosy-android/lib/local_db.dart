import 'package:path/path.dart' as p;
import 'package:sqflite/sqflite.dart';
import 'sms_parser.dart';

class ImportStats {
  final int received, inserted, transactions, balances, review, skipped;
  const ImportStats(this.received, this.inserted, this.transactions,
      this.balances, this.review, this.skipped);
}

/// Every table lives in the app-private SQLite database on the Android device.
/// There are no network calls, synchronization jobs, or server credentials.
class LocalDb {
  Database? _db;
  Future<Database> get db async {
    if (_db != null) return _db!;
    final path = p.join(await getDatabasesPath(), 'floosy_local.db');
    return _db = await openDatabase(path, version: 1, onConfigure: (db) async {
      await db.execute('PRAGMA foreign_keys=ON');
    }, onCreate: (db, version) async {
      await db.execute('''CREATE TABLE bank_senders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        address TEXT NOT NULL UNIQUE COLLATE NOCASE, label TEXT NOT NULL)''');
      await db.execute('''CREATE TABLE items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE COLLATE NOCASE,
        category TEXT NOT NULL DEFAULT 'أساسي')''');
      await db.execute('''CREATE TABLE rules (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        keyword TEXT NOT NULL UNIQUE COLLATE NOCASE,
        item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE)''');
      await db.execute('''CREATE TABLE sms_messages (
        sms_id INTEGER PRIMARY KEY,
        sender TEXT NOT NULL, body TEXT NOT NULL,
        received_ms INTEGER NOT NULL, parse_status TEXT NOT NULL,
        reason TEXT NOT NULL, account_key TEXT NOT NULL,
        merchant TEXT NOT NULL)''');
      await db.execute('''CREATE TABLE transactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sms_id INTEGER NOT NULL UNIQUE REFERENCES sms_messages(sms_id) ON DELETE CASCADE,
        account_key TEXT NOT NULL, occurred_ms INTEGER NOT NULL,
        amount_baisa INTEGER NOT NULL CHECK(amount_baisa > 0),
        movement_type TEXT NOT NULL CHECK(movement_type IN ('income','expense')),
        item_id INTEGER REFERENCES items(id) ON DELETE SET NULL,
        merchant TEXT NOT NULL, classification_status TEXT NOT NULL DEFAULT 'unclassified')''');
      await db.execute('''CREATE TABLE confirmed_balances (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sms_id INTEGER NOT NULL UNIQUE REFERENCES sms_messages(sms_id) ON DELETE CASCADE,
        account_key TEXT NOT NULL,
        balance_baisa INTEGER NOT NULL, confirmed_ms INTEGER NOT NULL)''');
      await db.execute('''CREATE TABLE budgets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        month TEXT NOT NULL, account_key TEXT NOT NULL DEFAULT '',
        name TEXT NOT NULL, amount_baisa INTEGER NOT NULL CHECK(amount_baisa >= 0),
        UNIQUE(month,account_key,name))''');
      await db.execute('CREATE INDEX ix_transactions_date ON transactions(occurred_ms)');
      await db.execute('CREATE INDEX ix_transactions_account ON transactions(account_key)');
      await db.execute('CREATE INDEX ix_balances_account_time ON confirmed_balances(account_key,confirmed_ms DESC)');
      for (final name in ['المواد الغذائية','الوقود','المطاعم','فواتير الخدمات',
        'السكن','الصحة','التعليم','التسوق','تحويلات','سحب نقدي','الراتب','أخرى']) {
        await db.insert('items', {'name': name});
      }
    });
  }

  Future<List<Map<String,dynamic>>> senders() async =>
      (await (await db).query('bank_senders',orderBy:'label COLLATE NOCASE'));
  Future<void> addSender(String address, String label) async {
    address = address.trim();label=label.trim();
    if (address.length < 2 || address.length > 48 || label.isEmpty) {
      throw const FormatException('أدخل معرّف المرسل كما يظهر في الرسالة واسم البنك');
    }
    await (await db).insert('bank_senders',{'address':address,'label':label},
      conflictAlgorithm:ConflictAlgorithm.ignore);
  }
  Future<void> removeSender(int id) async {
    await (await db).delete('bank_senders',where:'id=?',whereArgs:[id]);
  }

  Future<List<Map<String,dynamic>>> items() async =>
      (await db).query('items',orderBy:'name COLLATE NOCASE');
  Future<void> addItem(String name) async {
    name = name.trim().replaceAll(RegExp(r'\s+'),' ');
    if (name.length < 2) throw const FormatException('اسم البند قصير');
    await (await db).insert('items',{'name':name},conflictAlgorithm:ConflictAlgorithm.ignore);
  }
  Future<List<Map<String,dynamic>>> rules() async => (await db).rawQuery('''
    SELECT rules.id,keyword,item_id,items.name AS item_name
    FROM rules JOIN items ON items.id=rules.item_id ORDER BY rules.keyword''');
  Future<void> addRule(String keyword,int itemId) async {
    keyword = keyword.trim();
    if(keyword.length < 3)throw const FormatException('الكلمة المفتاحية قصيرة جدًا');
    await (await db).insert('rules',{'keyword':keyword,'item_id':itemId},
      conflictAlgorithm:ConflictAlgorithm.replace);
  }
  Future<void> deleteRule(int ruleId) async {
    await (await db).delete('rules',where:'id=?',whereArgs:[ruleId]);
  }

  Future<ImportStats> importSms(List<Map<String,dynamic>> incoming) async {
    final database = await db;
    int inserted = 0, operations = 0, balances = 0, review = 0, skipped = 0;
    await database.transaction((txn) async {
      final ruleList=await txn.query('rules',orderBy:'LENGTH(keyword) DESC');
      for(final sms in incoming) {
        final id=(sms['id'] as num?)?.toInt();
        final body=sms['body'] as String?;
        final sender=sms['address'] as String?;
        final date=(sms['date'] as num?)?.toInt();
        if(id==null||body==null||sender==null||date==null){skipped++;continue;}
        if(await txn.query('sms_messages',columns:['sms_id'],where:'sms_id=?',whereArgs:[id],limit:1).then((r)=>r.isNotEmpty)) {
          skipped++;continue;
        }
        if(!SmsParser.isFinancialCandidate(body)) {skipped++;continue;}
        final safeBody=SmsParser.redactSensitiveCodes(body);
        final parsed=SmsParser.parse(safeBody,sender);
        await txn.insert('sms_messages',{'sms_id':id,'sender':sender,'body':safeBody,
          'received_ms':date,'parse_status':parsed.status,'reason':parsed.reason,
          'account_key':parsed.accountHint,'merchant':parsed.merchant});
        inserted++;
        if(parsed.status=='review')review++;
        if(parsed.balanceBaisa!=null){
          await txn.insert('confirmed_balances',{'sms_id':id,'account_key':parsed.accountHint,
            'balance_baisa':parsed.balanceBaisa,'confirmed_ms':date});
          balances++;
        }
        if(parsed.status!='parsed')continue;
        int? itemId;
        final searchable='${parsed.merchant} $safeBody'.toLowerCase();
        for(final rule in ruleList){
          if(searchable.contains((rule['keyword'] as String).toLowerCase())) {
            itemId=rule['item_id'] as int;break;
          }
        }
        await txn.insert('transactions',{'sms_id':id,'account_key':parsed.accountHint,
          'occurred_ms':date,'amount_baisa':parsed.amountBaisa,
          'movement_type':parsed.movementType,'item_id':itemId,
          'merchant':parsed.merchant,'classification_status':itemId==null?'unclassified':'auto'});
        operations++;
      }
    });
    return ImportStats(incoming.length,inserted,operations,balances,review,skipped);
  }

  Future<List<Map<String,dynamic>>> transactions({required String month,String account=''}) async {
    final d=DateTime.parse('$month-01');final end=DateTime(d.year,d.month+1);
    return (await db).rawQuery('''SELECT t.*,i.name AS item_name,s.body AS sms_body,s.sender
      FROM transactions t JOIN sms_messages s ON s.sms_id=t.sms_id
      LEFT JOIN items i ON i.id=t.item_id
      WHERE t.occurred_ms>=? AND t.occurred_ms<?
      AND (?='' OR t.account_key=?) ORDER BY t.occurred_ms DESC''',
      [d.millisecondsSinceEpoch,end.millisecondsSinceEpoch,account,account]);
  }
  Future<List<Map<String,dynamic>>> allAccounts() async => (await db).rawQuery('''
     SELECT DISTINCT account_key FROM sms_messages ORDER BY account_key''');
  Future<List<Map<String,dynamic>>> reviewMessages() async => (await db).query('sms_messages',
     where:"parse_status='review'",orderBy:'received_ms DESC',limit:300);
  Future<void> classify(int transactionId,int? itemId) async {
    await (await db).update('transactions',
      {'item_id':itemId,'classification_status':itemId==null?'unclassified':'manual'},
      where:'id=?',whereArgs:[transactionId]);
  }
  Future<void> reviewToTransaction({required int smsId,required int amountBaisa,
      required String movementType, int? itemId}) async {
    if(amountBaisa<=0||!['expense','income'].contains(movementType)){
      throw const FormatException('قيمة العملية أو نوع الحركة غير صحيح');
    }
    final database=await db;
    await database.transaction((txn)async{
      final row=await txn.query('sms_messages',where:'sms_id=?',whereArgs:[smsId]);
      if(row.isEmpty)throw const FormatException('الرسالة غير موجودة');
      final m=row.first;
      await txn.insert('transactions',{'sms_id':smsId,'account_key':m['account_key'],
        'occurred_ms':m['received_ms'],'amount_baisa':amountBaisa,'movement_type':movementType,
        'item_id':itemId,'merchant':m['merchant'],
        'classification_status':itemId==null?'unclassified':'manual'},
        conflictAlgorithm:ConflictAlgorithm.abort);
      await txn.update('sms_messages',{'parse_status':'reviewed','reason':''},
        where:'sms_id=?',whereArgs:[smsId]);
    });
  }
  Future<List<Map<String,dynamic>>> budgets({required String month, String account=''}) async =>
    (await db).query('budgets',where:"month=? AND (?='' OR account_key=?)",whereArgs:[month,account,account],orderBy:'name');
  Future<void> saveBudget({required String month,required String name,
      required int amountBaisa,String account=''}) async {
    name=name.trim();if(name.isEmpty||amountBaisa<0)throw const FormatException('موازنة غير صحيحة');
    await (await db).insert('budgets',{'month':month,'name':name,'amount_baisa':amountBaisa,
      'account_key':account},conflictAlgorithm:ConflictAlgorithm.replace);
  }
  Future<void> deleteBudget(int id) async {
    await (await db).delete('budgets',where:'id=?',whereArgs:[id]);
  }
  /// The latest bank-reported balance. No balance is computed from spending.
  Future<Map<String,dynamic>?> latestConfirmedBalance(String account) async {
    if(account.isEmpty)return null;
    final rows=await (await db).query('confirmed_balances',where:'account_key=?',
       whereArgs:[account],orderBy:'confirmed_ms DESC,id DESC',limit:1);
    return rows.isEmpty?null:rows.first;
  }
  Future<void> deleteMessage(int smsId) async {
    await (await db).delete('sms_messages',where:'sms_id=?',whereArgs:[smsId]);
  }
}
