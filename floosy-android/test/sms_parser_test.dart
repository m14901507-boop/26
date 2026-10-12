import 'package:flutter_test/flutter_test.dart';
import 'package:floosy_mobile/sms_parser.dart';

void main() {
  test('bank debited SMS with second balance amount', () {
    final parsed=SmsParser.parse(
      'Your account XX1234 was debited OMR 12.350 at LULU. Available balance OMR 500.200',
      'MYBANK');
    expect(parsed.status,'parsed');
    expect(parsed.movementType,'expense');
    expect(parsed.amountBaisa,12350);
    expect(parsed.balanceBaisa,500200);
    expect(parsed.accountHint,'MYBANK:••1234');
  });
  test('arabic numerical SMS and credit', () {
    final p=SmsParser.parse('تم إيداع مبلغ ٢٥.٥٠٠ ر.ع في الحساب **4567. الرصيد ١٠٠.٧٥٠ ر.ع', 'BANK');
    expect(p.movementType,'income');
    expect(p.amountBaisa,25500);
    expect(p.balanceBaisa,100750);
  });
  test('balance-only bank message has no invented transaction', () {
    final p=SmsParser.parse('Available Balance OMR 50.000', 'BANK');
    expect(p.status,'balance_only');
    expect(p.amountBaisa,isNull);
    expect(p.balanceBaisa,50000);
  });
  test('ambiguous amount does not create transaction', () {
    final p=SmsParser.parse('Debited OMR 20.000 and OMR 30.000', 'BANK');
    expect(p.status,'review');
    expect(p.amountBaisa,isNull);
  });
  test('does not import OTP messages', () {
    expect(SmsParser.isFinancialCandidate('OTP 324589 for purchase of OMR 25.000'),false);
    expect(SmsParser.isFinancialCandidate('Debited OMR 25.000 at store'),true);
    expect(SmsParser.isFinancialCandidate('Special offer discount purchase OMR 20.000'),false);
  });
  test('baisa precision without floating-point money', () {
    expect(SmsParser.toBaisa('12.005'),12005);
    expect(SmsParser.toBaisa('١٢.٠٠٥'),12005);
    expect(SmsParser.toBaisa('12.0056'),isNull);
  });
}
