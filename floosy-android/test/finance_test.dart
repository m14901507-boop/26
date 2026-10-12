import 'package:flutter_test/flutter_test.dart';
import 'package:floosy_mobile/finance.dart';
void main() {
  test('80 percent warning and 100 percent over', () {
    expect(Finance.budgetStatus(79, 100), 'متاح');
    expect(Finance.budgetStatus(80, 100), 'قريب من الموازنة');
    expect(Finance.budgetStatus(100, 100), 'يتجاوز الموازنة');
    expect(Finance.budgetStatus(5, 0), 'صرف دون موازنة');
  });
  test('forecast respects insufficient-data window', () {
    final s=DateTime(2026,10,1), e=DateTime(2026,11,1);
    expect(Finance.forecast(spent: 20, start:s,end:e,now:DateTime(2026,10,2),records:20),isNull);
    expect(Finance.forecast(spent: 20, start:s,end:e,now:DateTime(2026,10,15),records:2),isNull);
    expect(Finance.forecast(spent: 20, start:s,end:e,now:DateTime(2026,11,2),records:5),20);
  });
}
