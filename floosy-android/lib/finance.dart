/// Money calculations never round intermediate values. All display amounts are OMR.
class Finance {
  static double? ratio(double numerator, double? denominator) =>
      denominator == null || denominator <= 0 ? null : numerator / denominator;

  static String budgetStatus(double spending, double? budget) {
    if (budget == null) return 'الموازنة غير محددة';
    if (budget <= 0) return spending > 0 ? 'صرف دون موازنة' : 'الموازنة صفرية';
    final fraction = spending / budget;
    return fraction < .8 ? 'متاح' : fraction < 1 ? 'قريب من الموازنة' : 'يتجاوز الموازنة';
  }

  static String balanceStatus(double projected, double? balance) {
    if (balance == null) return 'لا يوجد رصيد مؤكد لهذا الحساب';
    if (balance <= 0) return projected > 0 ? 'يتجاوز الرصيد المؤكد' : 'الرصيد صفر';
    final fraction = projected / balance;
    return fraction < .8 ? 'متاح' : fraction < 1 ? 'قريب من الرصيد المؤكد' : 'يتجاوز الرصيد المؤكد';
  }

  /// Never extrapolate from the earliest days of the period or sparse records.
  static double? forecast({required double spent, required DateTime start,
    required DateTime end, required DateTime now, required int records}) {
    final total = end.difference(start).inMilliseconds;
    if (total <= 0) return null;
    if (!now.isBefore(end)) return spent;
    if (now.isBefore(start)) return null;
    final elapsed = now.difference(start).inMilliseconds / total;
    if (elapsed < .20 || records < 5) return null;
    return spent / elapsed;
  }
}
