import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:floosy_mobile/sms_reader.dart';
import 'package:floosy_mobile/sms_parser.dart';
import 'package:floosy_mobile/local_db.dart';

const phase = String.fromEnvironment('SMS_TEST_PHASE', defaultValue: 'granted');
const bank = '+96890001111';
const other = '+96890002222';

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  testWidgets('Android SMS permission and offline finance integration', (tester) async {
    final permitted = await LocalSmsReader.hasPermission();
    if (phase == 'denied') {
      expect(permitted, isFalse, reason: 'Read SMS must not be available before explicit grant');
      return;
    }

    expect(permitted, isTrue, reason: 'Emulator must grant READ_SMS for this phase');

    // The CI runner injects fictitious text messages into this fresh emulator.
    final messages = await LocalSmsReader.readBankMessages([bank]);
    expect(messages, isNotEmpty, reason: 'Injected bank SMS must be readable');
    expect(messages.every((m) => m['address'] == bank), isTrue);
    expect(messages.any((m) => (m['body'] as String).contains('LULU')), isTrue);
    expect(messages.any((m) => (m['body'] as String).contains('25.000')), isTrue);
    expect(messages.every((m) => m['address'] != other), isTrue);

    final parsed = messages.map((m) => SmsParser.parse(m['body'] as String, bank)).toList();
    expect(parsed.any((p) => p.amountBaisa == 12350 &&
        p.balanceBaisa == 500200 && p.movementType == 'expense'), isTrue);
    expect(parsed.any((p) => p.amountBaisa == 25000 &&
        p.movementType == 'income'), isTrue);

    final store = LocalDb();
    await store.addSender(bank, 'Test Bank');
    final first = await store.importSms(messages);
    expect(first.transactions, 2, reason: 'A purchase and a deposit are imported, but not an OTP');
    expect(first.balances, greaterThanOrEqualTo(1));

    final second = await store.importSms(messages);
    expect(second.transactions, 0);
    expect(second.inserted, 0);

    final d = DateTime.now();
    final month = '${d.year.toString().padLeft(4, '0')}-${d.month.toString().padLeft(2, '0')}';
    final transactions = await store.transactions(month: month);
    expect(transactions.where((t) => t['movement_type'] == 'expense' &&
        t['amount_baisa'] == 12350).length, 1);
    expect(transactions.where((t) => t['movement_type'] == 'income' &&
        t['amount_baisa'] == 25000).length, 1);

    final purchase = transactions.firstWhere((t) => t['amount_baisa'] == 12350);
    final categories = await store.items();
    final food = categories.firstWhere((i) => i['name'] == 'المواد الغذائية');
    await store.classify(purchase['id'] as int, food['id'] as int);
    final after = await store.transactions(month: month);
    expect(after.firstWhere((t) => t['id'] == purchase['id'])['item_name'], 'المواد الغذائية');

    await store.addRule('LULU', food['id'] as int);
    final rules = await store.rules();
    expect(rules.any((r) => r['keyword'] == 'LULU'), isTrue);
    final balance = await store.latestConfirmedBalance('$bank:••1234');
    expect(balance?['balance_baisa'], 500200);
  });
}
