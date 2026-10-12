/// A cautious, offline parser for Omani financial SMS. It never invents values.
/// Templates vary by bank: users review messages that cannot be parsed safely.
class ParsedBankSms {
  final int? amountBaisa;
  final String? movementType; // expense | income
  final int? balanceBaisa;
  final String accountHint;
  final String merchant;
  final String status; // parsed | balance_only | review
  final String reason;

  const ParsedBankSms({this.amountBaisa, this.movementType, this.balanceBaisa,
      required this.accountHint, required this.merchant,
      required this.status, this.reason = ''});
}

class SmsParser {
  static String normalizeDigits(String value) {
    const arabic = '٠١٢٣٤٥٦٧٨٩';
    const persian = '۰۱۲۳۴۵۶۷۸۹';
    return value.split('').map((c) {
      final a = arabic.indexOf(c);
      if (a >= 0) return '$a';
      final p = persian.indexOf(c);
      return p >= 0 ? '$p' : c;
    }).join();
  }

  static final _money = RegExp(
    r'(?:\bOMR\b|\bRO\b|ر\s*\.?\s*ع\.?|ريال(?:\s+عماني)?)\s*[:=]?\s*([0-9][0-9,]*(?:\.[0-9]{1,3})?)|'
    r'([0-9][0-9,]*(?:\.[0-9]{1,3})?)\s*(?:\bOMR\b|\bRO\b|ر\s*\.?\s*ع\.?|ريال(?:\s+عماني)?)',
    caseSensitive: false,
  );

  static int? toBaisa(String? raw) {
    if (raw == null) return null;
    final s = normalizeDigits(raw).replaceAll(',', '').trim();
    if (!RegExp(r'^\d+(?:\.\d{1,3})?$').hasMatch(s)) return null;
    final parts = s.split('.');
    final whole = int.tryParse(parts[0]);
    if (whole == null || whole > 100000000) return null;
    final frac = parts.length == 2 ? int.parse(parts[1].padRight(3, '0')) : 0;
    return whole * 1000 + frac;
  }

  /// Exclude one-time passcodes, marketing messages, and non-financial SMS.
  /// The bank sender is already checked against a user-configured allowlist.
  static bool isFinancialCandidate(String raw) {
    final body = normalizeDigits(raw);
    if(RegExp(r'\b(?:otp|one.time.password|verification.code|passcode)\b|رمز التحقق|رمز التأكيد|كلمة المرور لمرة',caseSensitive:false).hasMatch(body)) {
      return false;
    }
    if(RegExp(r'\b(?:promo|promotion|discount|special.offer|cashback|win.prize)\b|عروض|عرض خاص|تخفيضات|اربح',caseSensitive:false).hasMatch(body) &&
       !RegExp(r'\b(?:debited|credited|withdrawn|purchased|spent|paid|deposited)\b|تم خصم|تم إيداع|تم ايداع|تم سحب').hasMatch(body)) {
      return false;
    }
    if(!_money.hasMatch(body))return false;
    return RegExp(r'\b(?:debited|credited|debit|credit|withdrawn|withdrawal|purchase|purchased|spent|paid|payment|transaction|transfer|deposit|balance|salary|pos|atm)\b|خصم|سحب|شراء|دفع|تحويل|إيداع|ايداع|الرصيد|راتب|مشتريات',caseSensitive:false).hasMatch(body);
  }

  static String redactSensitiveCodes(String raw) => raw.replaceAll(
    RegExp(r'(?:OTP|one.time.password|verification.code|رمز التحقق)\s*[:#\-]?\s*\d{4,8}',caseSensitive:false),
    '[رمز محجوب]');

  static ParsedBankSms parse(String original, String sender) {
    final body = normalizeDigits(original).replaceAll('٫', '.').replaceAll('٬', ',');
    final lower = body.toLowerCase();
    final balanceWord = RegExp(r'(?:available\s+bal(?:ance)?|avl\s+bal|current\s+balance|balance|الرصيد(?:\s+المتاح)?|رصيدك)', caseSensitive: false);
    final debit = RegExp(r'\b(?:debited|debit|withdrawn|withdrawal|purchase|purchased|spent|paid|payment|pos|atm)\b|خصم|سحب|شراء|دفع|مشتريات', caseSensitive: false).hasMatch(lower);
    final credit = RegExp(r'\b(?:credited|credit|deposit|deposited|received|salary)\b|إيداع|ايداع|إضافة|اضافة|استلام|راتب|تحويل وارد', caseSensitive: false).hasMatch(lower);
    final movement = debit == credit ? null : (debit ? 'expense' : 'income');

    String account = sender.trim();
    final accountMatch = RegExp(r'(?:\ba\/?c\b|\baccount\b|\bacc\b|الحساب)\s*[:#\-]?\s*(?:[xX*•\- ]+)?(\d{3,6})(?!\d)', caseSensitive: false).firstMatch(body);
    if (accountMatch != null) {
      final v = accountMatch.group(1)!;
      account = '${sender.trim()}:••${v.substring(v.length - (v.length < 4 ? v.length : 4))}';
    }

    String merchant = '';
    final merch = RegExp(r'(?:\bat\b|\bmerchant\b|لدى|متجر)\s+([^\d\s][^\n\r,;:.]{1,42})', caseSensitive:false).firstMatch(body);
    if (merch != null) merchant = merch.group(1)!.trim();

    // Amounts in an explicitly marked balance clause are not transactions.
    final candidates = <({int start, int end, int baisa, bool balance})>[];
    for (final match in _money.allMatches(body)) {
      final sum = toBaisa(match.group(1) ?? match.group(2));
      if (sum == null) continue;
      final preceding = lower.substring(match.start > 55 ? match.start - 55 : 0, match.start);
      final lastBalanceWord = balanceWord.allMatches(preceding).toList();
      final afterLast = lastBalanceWord.isNotEmpty
          ? preceding.substring(lastBalanceWord.last.end) : '';
      final isBalance = lastBalanceWord.isNotEmpty &&
          !RegExp(r'\b(?:debited|credited|withdrawn|purchase|paid|amount|transaction|transfer)\b|خصم|شراء|دفع|مبلغ|إيداع|ايداع').hasMatch(afterLast);
      candidates.add((start: match.start, end: match.end, baisa: sum, balance: isBalance));
    }

    final transactionAmounts = candidates.where((c) => !c.balance).toList();
    final balanceAmounts = candidates.where((c) => c.balance).toList();
    final balance = balanceAmounts.isEmpty ? null : balanceAmounts.last.baisa;
    // If there are several non-balance sums, don't guess which was transacted.
    final amount = transactionAmounts.length == 1 ? transactionAmounts.first.baisa : null;
    final parsed = amount != null && amount > 0 && movement != null;
    final onlyBalance = transactionAmounts.isEmpty && balance != null;
    return ParsedBankSms(
      amountBaisa: parsed ? amount : null,
      movementType: parsed ? movement : null,
      balanceBaisa: balance,
      accountHint: account,
      merchant: merchant,
      status: parsed ? 'parsed' : onlyBalance ? 'balance_only' : 'review',
      reason: parsed ? '' : onlyBalance ? 'رسالة رصيد فقط' :
        movement == null ? 'تعذّر تحديد نوع الحركة بشكل موثوق' :
        transactionAmounts.length > 1 ? 'أكثر من مبلغ؛ راجع الرسالة' : 'تعذّر استخراج مبلغ العملية',
    );
  }
}
