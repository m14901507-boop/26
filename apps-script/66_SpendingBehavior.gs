/*******************************************************
 * 66_SpendingBehavior.gs
 *
 * التحليل الذكي لسلوك المصروفات
 *
 * يعتمد على:
 *   getSmartBudgetDashboard()
 *
 * لا يكتب في أي Sheet
 * لا يرسل بريد
 * لا ينشئ Triggers
 *******************************************************/

const SPENDING_BEHAVIOR_CONFIG = {
  accounts: [
    {
      key: 'family_monthly',
      name: 'عائلي شهري',
      bank: 'الأهلي 001',
      scope: 'عائلي',
      period: 'شهري'
    },
    {
      key: 'family_annual',
      name: 'عائلي سنوي',
      bank: 'الأهلي 002',
      scope: 'عائلي',
      period: 'سنوي'
    },
    {
      key: 'personal_monthly',
      name: 'شخصي شهري',
      bank: 'صحار 1',
      scope: 'شخصي',
      period: 'شهري'
    },
    {
      key: 'personal_annual',
      name: 'شخصي سنوي',
      bank: 'صحار 2',
      scope: 'شخصي',
      period: 'سنوي'
    }
  ]
};


/* =====================================================
 * PUBLIC
 * ===================================================== */

/**
 * الواجهة العامة للتحليل الذكي للمصروفات
 *
 * filters:
 * {
 *   accountKey: 'family_monthly'
 * }
 */
function getSpendingBehaviorDashboard(filters) {
  filters = filters || {};

  const requestedKey =
    String(filters.accountKey || 'family_monthly').trim();

  const results = [];
  let selected = null;

  SPENDING_BEHAVIOR_CONFIG.accounts.forEach(function (config) {
    const smart = spendingBehaviorLoadAccount_(config);

    const summary = spendingBehaviorBuildAccountSummary_(
      config,
      smart
    );

    results.push(summary);

    if (config.key === requestedKey) {
      selected = spendingBehaviorBuildAccountDetails_(
        config,
        smart,
        summary
      );
    }
  });

  if (!selected) {
    const fallbackConfig = SPENDING_BEHAVIOR_CONFIG.accounts[0];
    const fallbackSmart =
      spendingBehaviorLoadAccount_(fallbackConfig);

    const fallbackSummary =
      spendingBehaviorBuildAccountSummary_(
        fallbackConfig,
        fallbackSmart
      );

    selected =
      spendingBehaviorBuildAccountDetails_(
        fallbackConfig,
        fallbackSmart,
        fallbackSummary
      );
  }

  return {
    generatedAt: new Date(),

    model: 'item_first_behavior',

    philosophy: {
      primaryAnalysis: 'البنود',
      secondaryClassification: [
        'اساسي',
        'استثنائي',
        'ترفيهي'
      ]
    },

    accounts: results,

    selectedAccount: selected,

    totals: spendingBehaviorBuildGlobalTotals_(results)
  };
}


/* =====================================================
 * LOAD
 * ===================================================== */

function spendingBehaviorLoadAccount_(config) {
  if (typeof getSmartBudgetDashboard !== 'function') {
    throw new Error(
      'الدالة getSmartBudgetDashboard غير موجودة. تأكد من وجود ملف 61_DashboardInsights.gs.'
    );
  }

  const result = getSmartBudgetDashboard({
    budgetKey: config.key
  });

  return result || {};
}


/* =====================================================
 * ACCOUNT SUMMARY
 * ===================================================== */

function spendingBehaviorBuildAccountSummary_(config, smart) {
  const groups =
    spendingBehaviorNormalizeGroups_(
      smart.spendingGroups || []
    );

  const totalSpent =
    spendingBehaviorSum_(
      groups.map(function (g) {
        return g.totalSpent;
      })
    );

  const transactionCount =
    spendingBehaviorSum_(
      groups.map(function (g) {
        return g.count;
      })
    );

  const topItem =
    groups.length
      ? groups[0]
      : null;

  const top3Spent =
    spendingBehaviorSum_(
      groups.slice(0, 3).map(function (g) {
        return g.totalSpent;
      })
    );

  const top3Concentration =
    totalSpent > 0
      ? spendingBehaviorRound_(
          (top3Spent / totalSpent) * 100,
          1
        )
      : 0;

  const balance =
    spendingBehaviorFindBalance_(smart);

  const target =
    spendingBehaviorFindTarget_(smart);

  const consumedPercent =
    target !== null && target > 0
      ? spendingBehaviorRound_(
          (totalSpent / target) * 100,
          1
        )
      : null;

  const elapsedPercent =
    spendingBehaviorElapsedPercent_(
      config.period
    );

  const paceGap =
    consumedPercent !== null
      ? spendingBehaviorRound_(
          consumedPercent - elapsedPercent,
          1
        )
      : null;

  return {
    key: config.key,
    name: config.name,
    bank: config.bank,
    scope: config.scope,
    period: config.period,

    spent: spendingBehaviorRound_(totalSpent, 3),

    transactionCount: transactionCount,

    activeItems: groups.length,

    averageTransaction:
      transactionCount > 0
        ? spendingBehaviorRound_(
            totalSpent / transactionCount,
            3
          )
        : 0,

    balance: balance,

    target: target,

    consumedPercent: consumedPercent,

    elapsedPercent: elapsedPercent,

    paceGap: paceGap,

    paceStatus:
      spendingBehaviorPaceStatus_(
        consumedPercent,
        elapsedPercent
      ),

    topItem: topItem
      ? {
          item: topItem.item,
          spent: topItem.totalSpent,
          count: topItem.count,
          sharePercent:
            totalSpent > 0
              ? spendingBehaviorRound_(
                  (topItem.totalSpent /
                    totalSpent) *
                    100,
                  1
                )
              : 0
        }
      : null,

    top3Concentration:
      top3Concentration
  };
}


/* =====================================================
 * ACCOUNT DETAILS
 * ===================================================== */

function spendingBehaviorBuildAccountDetails_(
  config,
  smart,
  summary
) {
  const groups =
    spendingBehaviorNormalizeGroups_(
      smart.spendingGroups || []
    );

  const totalSpent = summary.spent;

  const enriched =
    groups.map(function (group) {
      return spendingBehaviorEnrichGroup_(
        group,
        totalSpent,
        summary.target
      );
    });

  enriched.sort(function (a, b) {
    return b.totalSpent - a.totalSpent;
  });

  const mostDraining =
    enriched.length
      ? enriched[0]
      : null;

  const mostFrequent =
    spendingBehaviorMaxBy_(
      enriched,
      'count'
    );

  const fastestGrowing =
    spendingBehaviorFastestGrowing_(
      enriched
    );

  const largestTransaction =
    spendingBehaviorLargestTransaction_(
      smart.transactions || []
    );

  const categorySummary =
    spendingBehaviorCategorySummary_(
      enriched
    );

  const previousSpent =
    spendingBehaviorSum_(
      enriched.map(function (x) {
        return x.previousSpent;
      })
    );

  const previousCount =
    spendingBehaviorSum_(
      enriched.map(function (x) {
        return x.previousCount;
      })
    );

  const amountChangePercent =
    spendingBehaviorChangePercent_(
      totalSpent,
      previousSpent
    );

  const countChangePercent =
    spendingBehaviorChangePercent_(
      summary.transactionCount,
      previousCount
    );

  return {
    key: config.key,
    name: config.name,
    bank: config.bank,
    scope: config.scope,
    period: config.period,

    summary: summary,

    behavior: {
      mostDraining: mostDraining,

      mostFrequent: mostFrequent,

      fastestGrowing: fastestGrowing,

      largestTransaction:
        largestTransaction,

      top3Concentration:
        summary.top3Concentration,

      currentSpent:
        spendingBehaviorRound_(
          totalSpent,
          3
        ),

      previousSpent:
        spendingBehaviorRound_(
          previousSpent,
          3
        ),

      amountChangePercent:
        amountChangePercent,

      currentCount:
        summary.transactionCount,

      previousCount:
        previousCount,

      countChangePercent:
        countChangePercent
    },

    classification: categorySummary,

    items: enriched,

    recommendations:
      spendingBehaviorRecommendations_(
        summary,
        enriched,
        mostDraining,
        mostFrequent,
        fastestGrowing
      )
  };
}


/* =====================================================
 * NORMALIZE GROUPS
 * ===================================================== */

function spendingBehaviorNormalizeGroups_(groups) {
  if (!Array.isArray(groups)) return [];

  const map = {};

  groups.forEach(function (row) {
    if (!row) return;

    const item =
      String(
        row.item ||
        row.name ||
        row.label ||
        'غير مصنف'
      ).trim();

    const key =
      spendingBehaviorNormalizeText_(item);

    if (!key) return;

    const spent =
      spendingBehaviorNumber_(
        row.totalSpent !== undefined
          ? row.totalSpent
          : row.spent
      );

    const count =
      spendingBehaviorNumber_(
        row.count
      );

    const previousSpent =
      spendingBehaviorNumber_(
        row.previousSpent
      );

    const previousCount =
      spendingBehaviorNumber_(
        row.previousCount
      );

    if (!map[key]) {
      map[key] = {
        item: item,

        category:
          String(
            row.category || ''
          ).trim(),

        count: 0,

        totalSpent: 0,

        previousSpent: 0,

        previousCount: 0,

        lastDate:
          row.lastDate || '',

        lastTime:
          row.lastTime || '',

        banks: [],

        channels: []
      };
    }

    map[key].count += count;
    map[key].totalSpent += spent;
    map[key].previousSpent += previousSpent;
    map[key].previousCount += previousCount;

    spendingBehaviorPushUnique_(
      map[key].banks,
      row.banks
    );

    spendingBehaviorPushUnique_(
      map[key].channels,
      row.channels
    );

    if (
      row.lastDate &&
      (!map[key].lastDate ||
        String(row.lastDate) >
          String(map[key].lastDate))
    ) {
      map[key].lastDate =
        row.lastDate;

      map[key].lastTime =
        row.lastTime || '';
    }
  });

  return Object.keys(map)
    .map(function (key) {
      return map[key];
    })
    .sort(function (a, b) {
      return b.totalSpent -
        a.totalSpent;
    });
}


/* =====================================================
 * ITEM ANALYSIS
 * ===================================================== */

function spendingBehaviorEnrichGroup_(
  group,
  totalSpent,
  target
) {
  const expenseSharePercent =
    totalSpent > 0
      ? spendingBehaviorRound_(
          (group.totalSpent /
            totalSpent) *
            100,
          1
        )
      : 0;

  const budgetSharePercent =
    target !== null &&
    target > 0
      ? spendingBehaviorRound_(
          (group.totalSpent /
            target) *
            100,
          1
        )
      : null;

  const averageSpent =
    group.count > 0
      ? spendingBehaviorRound_(
          group.totalSpent /
            group.count,
          3
        )
      : 0;

  const amountChangePercent =
    spendingBehaviorChangePercent_(
      group.totalSpent,
      group.previousSpent
    );

  const countChangePercent =
    spendingBehaviorChangePercent_(
      group.count,
      group.previousCount
    );

  return {
    item: group.item,

    category:
      group.category || 'غير محدد',

    count:
      group.count,

    totalSpent:
      spendingBehaviorRound_(
        group.totalSpent,
        3
      ),

    averageSpent:
      averageSpent,

    expenseSharePercent:
      expenseSharePercent,

    budgetSharePercent:
      budgetSharePercent,

    previousSpent:
      spendingBehaviorRound_(
        group.previousSpent,
        3
      ),

    previousCount:
      group.previousCount,

    amountChangePercent:
      amountChangePercent,

    countChangePercent:
      countChangePercent,

    isNew:
      group.previousSpent <= 0 &&
      group.totalSpent > 0,

    lastDate:
      group.lastDate,

    lastTime:
      group.lastTime,

    banks:
      group.banks,

    channels:
      group.channels,

    drainReason:
      spendingBehaviorDrainReason_(
        group,
        averageSpent
      )
  };
}


/* =====================================================
 * CLASSIFICATION - مساعد فقط
 * ===================================================== */

function spendingBehaviorCategorySummary_(items) {
  const result = {
    basic: {
      key: 'اساسي',
      amount: 0,
      percent: 0
    },

    exceptional: {
      key: 'استثنائي',
      amount: 0,
      percent: 0
    },

    leisure: {
      key: 'ترفيهي',
      amount: 0,
      percent: 0
    },

    unclassified: {
      key: 'غير محدد',
      amount: 0,
      percent: 0
    }
  };

  items.forEach(function (item) {
    const category =
      spendingBehaviorNormalizeText_(
        item.category
      );

    if (
      category ===
      spendingBehaviorNormalizeText_(
        'اساسي'
      )
    ) {
      result.basic.amount +=
        item.totalSpent;

    } else if (
      category ===
      spendingBehaviorNormalizeText_(
        'استثنائي'
      )
    ) {
      result.exceptional.amount +=
        item.totalSpent;

    } else if (
      category ===
      spendingBehaviorNormalizeText_(
        'ترفيهي'
      )
    ) {
      result.leisure.amount +=
        item.totalSpent;

    } else {
      result.unclassified.amount +=
        item.totalSpent;
    }
  });

  const total =
    result.basic.amount +
    result.exceptional.amount +
    result.leisure.amount +
    result.unclassified.amount;

  Object.keys(result)
    .forEach(function (key) {
      result[key].amount =
        spendingBehaviorRound_(
          result[key].amount,
          3
        );

      result[key].percent =
        total > 0
          ? spendingBehaviorRound_(
              (result[key].amount /
                total) *
                100,
              1
            )
          : 0;
    });

  return result;
}


/* =====================================================
 * INSIGHTS
 * ===================================================== */

function spendingBehaviorFastestGrowing_(items) {
  const candidates =
    items.filter(function (item) {
      return (
        item.previousSpent > 0 &&
        item.amountChangePercent !== null &&
        item.amountChangePercent > 0
      );
    });

  if (!candidates.length) {
    return null;
  }

  candidates.sort(function (a, b) {
    return (
      b.amountChangePercent -
      a.amountChangePercent
    );
  });

  return candidates[0];
}


function spendingBehaviorLargestTransaction_(
  transactions
) {
  if (!Array.isArray(transactions)) {
    return null;
  }

  let best = null;

  transactions.forEach(function (row) {
    if (!row) return;

    const amount =
      Math.abs(
        spendingBehaviorNumber_(
          row.amount !== undefined
            ? row.amount
            : (
                row.spent !== undefined
                  ? row.spent
                  : row['المبلغ']
              )
        )
      );

    if (!amount) return;

    if (
      !best ||
      amount > best.amount
    ) {
      best = {
        item:
          String(
            row.item ||
            row.name ||
            row['البند'] ||
            'غير محدد'
          ),

        amount:
          spendingBehaviorRound_(
            amount,
            3
          ),

        date:
          row.date ||
          row.datetime ||
          row['التاريخ والوقت'] ||
          ''
      };
    }
  });

  return best;
}


function spendingBehaviorDrainReason_(
  group,
  averageSpent
) {
  const count =
    spendingBehaviorNumber_(
      group.count
    );

  const previousCount =
    spendingBehaviorNumber_(
      group.previousCount
    );

  const previousSpent =
    spendingBehaviorNumber_(
      group.previousSpent
    );

  const total =
    spendingBehaviorNumber_(
      group.totalSpent
    );

  const amountChange =
    spendingBehaviorChangePercent_(
      total,
      previousSpent
    );

  const countChange =
    spendingBehaviorChangePercent_(
      count,
      previousCount
    );

  if (
    count >= 6 &&
    countChange !== null &&
    countChange >= 25
  ) {
    return {
      code: 'frequency_growth',
      label:
        'زيادة التكرار هي العامل الأبرز'
    };
  }

  if (
    count <= 2 &&
    averageSpent > 0
  ) {
    return {
      code: 'high_value',
      label:
        'قيمة العملية هي العامل الأبرز'
    };
  }

  if (
    amountChange !== null &&
    amountChange >= 30
  ) {
    return {
      code: 'amount_growth',
      label:
        'إجمالي الصرف ارتفع عن الفترة السابقة'
    };
  }

  if (count >= 5) {
    return {
      code: 'frequency',
      label:
        'التكرار هو العامل الأبرز'
    };
  }

  return {
    code: 'accumulated',
    label:
      'إجمالي الصرف المتراكم'
  };
}


/* =====================================================
 * RECOMMENDATIONS
 * ===================================================== */

function spendingBehaviorRecommendations_(
  summary,
  items,
  mostDraining,
  mostFrequent,
  fastestGrowing
) {
  const list = [];

  if (mostDraining) {
    list.push({
      type: 'top_drain',
      title:
        'أكثر بند استنزافًا',
      item:
        mostDraining.item,
      message:
        'البند يمثل ' +
        mostDraining.expenseSharePercent +
        '% من مصروف الحساب.'
    });
  }

  if (
    mostFrequent &&
    mostFrequent.count >= 5
  ) {
    list.push({
      type: 'frequency',
      title:
        'أكثر بند تكرارًا',
      item:
        mostFrequent.item,
      message:
        'تم تسجيل ' +
        mostFrequent.count +
        ' عمليات خلال الفترة.'
    });
  }

  if (fastestGrowing) {
    list.push({
      type: 'growth',
      title:
        'أسرع بند ارتفاعًا',
      item:
        fastestGrowing.item,
      message:
        'ارتفع إجمالي الصرف عليه ' +
        fastestGrowing.amountChangePercent +
        '% مقارنة بالفترة السابقة.'
    });
  }

  if (
    summary.paceGap !== null &&
    summary.paceGap >= 15
  ) {
    list.push({
      type: 'pace',
      title:
        'سرعة الصرف مرتفعة',
      message:
        'استهلاك الميزانية متقدم عن الوقت المنقضي بنحو ' +
        summary.paceGap +
        ' نقطة مئوية.'
    });
  }

  if (
    summary.top3Concentration >= 60
  ) {
    list.push({
      type: 'concentration',
      title:
        'تركيز الصرف مرتفع',
      message:
        'أعلى 3 بنود تمثل ' +
        summary.top3Concentration +
        '% من مصروف الحساب.'
    });
  }

  return list;
}


/* =====================================================
 * GLOBAL TOTALS
 * ===================================================== */

function spendingBehaviorBuildGlobalTotals_(
  accounts
) {
  const totalSpent =
    spendingBehaviorSum_(
      accounts.map(function (a) {
        return a.spent;
      })
    );

  const transactionCount =
    spendingBehaviorSum_(
      accounts.map(function (a) {
        return a.transactionCount;
      })
    );

  return {
    spent:
      spendingBehaviorRound_(
        totalSpent,
        3
      ),

    transactionCount:
      transactionCount,

    averageTransaction:
      transactionCount > 0
        ? spendingBehaviorRound_(
            totalSpent /
              transactionCount,
            3
          )
        : 0
  };
}


/* =====================================================
 * BUDGET/BALANCE FALLBACKS
 * ===================================================== */

function spendingBehaviorFindBalance_(smart) {
  const candidates = [
    smart.balance,
    smart.remaining,
    smart.availableBalance,

    smart.account &&
      smart.account.balance,

    smart.account &&
      smart.account.remaining,

    smart.account &&
      smart.account.availableBalance,

    smart.summary &&
      smart.summary.balance,

    smart.summary &&
      smart.summary.remaining,

    smart.summary &&
      smart.summary.availableBalance
  ];

  return spendingBehaviorFirstNumber_(
    candidates
  );
}


function spendingBehaviorFindTarget_(smart) {
  const candidates = [
    smart.target,
    smart.budget,
    smart.periodTarget,

    smart.account &&
      smart.account.target,

    smart.account &&
      smart.account.budget,

    smart.account &&
      smart.account.periodTarget,

    smart.summary &&
      smart.summary.target,

    smart.summary &&
      smart.summary.budget,

    smart.summary &&
      smart.summary.periodTarget
  ];

  return spendingBehaviorFirstNumber_(
    candidates
  );
}


/* =====================================================
 * PACE
 * ===================================================== */

function spendingBehaviorElapsedPercent_(
  period
) {
  const now = new Date();

  if (period === 'سنوي') {
    const start =
      new Date(
        now.getFullYear(),
        0,
        1
      );

    const end =
      new Date(
        now.getFullYear() + 1,
        0,
        1
      );

    return spendingBehaviorRound_(
      ((now - start) /
        (end - start)) *
        100,
      1
    );
  }

  const start =
    new Date(
      now.getFullYear(),
      now.getMonth(),
      1
    );

  const end =
    new Date(
      now.getFullYear(),
      now.getMonth() + 1,
      1
    );

  return spendingBehaviorRound_(
    ((now - start) /
      (end - start)) *
      100,
    1
  );
}


function spendingBehaviorPaceStatus_(
  consumed,
  elapsed
) {
  if (
    consumed === null ||
    elapsed === null
  ) {
    return {
      code: 'unknown',
      label:
        'غير متاح'
    };
  }

  const gap =
    consumed - elapsed;

  if (gap >= 25) {
    return {
      code: 'critical',
      label:
        'مرتفع جدًا'
    };
  }

  if (gap >= 15) {
    return {
      code: 'high',
      label:
        'مرتفع'
    };
  }

  if (gap >= 5) {
    return {
      code: 'watch',
      label:
        'انتبه'
    };
  }

  return {
    code: 'normal',
    label:
      'طبيعي'
  };
}


/* =====================================================
 * GENERIC HELPERS
 * ===================================================== */

function spendingBehaviorMaxBy_(
  items,
  field
) {
  if (
    !Array.isArray(items) ||
    !items.length
  ) {
    return null;
  }

  let best = items[0];

  items.forEach(function (item) {
    if (
      spendingBehaviorNumber_(
        item[field]
      ) >
      spendingBehaviorNumber_(
        best[field]
      )
    ) {
      best = item;
    }
  });

  return best;
}


function spendingBehaviorChangePercent_(
  current,
  previous
) {
  current =
    spendingBehaviorNumber_(
      current
    );

  previous =
    spendingBehaviorNumber_(
      previous
    );

  if (previous === 0) {
    return current === 0
      ? 0
      : null;
  }

  return spendingBehaviorRound_(
    ((current - previous) /
      previous) *
      100,
    1
  );
}


function spendingBehaviorNumber_(value) {
  if (
    value === null ||
    value === undefined ||
    value === ''
  ) {
    return 0;
  }

  if (typeof value === 'number') {
    return isFinite(value)
      ? value
      : 0;
  }

  const cleaned =
    String(value)
      .replace(/,/g, '')
      .replace(/[^\d.\-]/g, '');

  const number =
    Number(cleaned);

  return isFinite(number)
    ? number
    : 0;
}


function spendingBehaviorFirstNumber_(
  candidates
) {
  for (
    let i = 0;
    i < candidates.length;
    i++
  ) {
    const value = candidates[i];

    if (
      value === null ||
      value === undefined ||
      value === ''
    ) {
      continue;
    }

    const num =
      spendingBehaviorNumber_(
        value
      );

    if (isFinite(num)) {
      return spendingBehaviorRound_(
        num,
        3
      );
    }
  }

  return null;
}


function spendingBehaviorRound_(
  value,
  digits
) {
  value =
    spendingBehaviorNumber_(
      value
    );

  digits =
    digits === undefined
      ? 3
      : digits;

  const factor =
    Math.pow(10, digits);

  return (
    Math.round(
      value * factor
    ) / factor
  );
}


function spendingBehaviorSum_(values) {
  return values.reduce(
    function (sum, value) {
      return (
        sum +
        spendingBehaviorNumber_(
          value
        )
      );
    },
    0
  );
}


function spendingBehaviorNormalizeText_(
  value
) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[\u064B-\u065F]/g, '')
    .replace(/[إأآ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/\s+/g, ' ');
}


function spendingBehaviorPushUnique_(
  target,
  values
) {
  if (!Array.isArray(target)) {
    return;
  }

  if (!Array.isArray(values)) {
    values =
      values
        ? [values]
        : [];
  }

  values.forEach(function (value) {
    const text =
      String(value || '').trim();

    if (
      text &&
      target.indexOf(text) === -1
    ) {
      target.push(text);
    }
  });
}


/* =====================================================
 * SAFE TEST
 * ===================================================== */

/**
 * اختبار آمن:
 * - لا يكتب في Sheets
 * - لا يرسل بريد
 * - لا ينشئ Trigger
 */
function testSpendingBehaviorDashboard() {
  const result =
    getSpendingBehaviorDashboard({
      accountKey:
        'family_monthly'
    });

  if (!result) {
    throw new Error(
      'لم يتم إرجاع نتيجة.'
    );
  }

  if (
    !Array.isArray(
      result.accounts
    )
  ) {
    throw new Error(
      'accounts ليست مصفوفة.'
    );
  }

  if (
    result.accounts.length !== 4
  ) {
    throw new Error(
      'يجب أن يحتوي النظام على 4 حسابات مصروفات.'
    );
  }

  const expectedKeys = [
    'family_monthly',
    'family_annual',
    'personal_monthly',
    'personal_annual'
  ];

  expectedKeys.forEach(
    function (key) {
      const found =
        result.accounts.some(
          function (account) {
            return (
              account.key === key
            );
          }
        );

      if (!found) {
        throw new Error(
          'الحساب غير موجود: ' +
          key
        );
      }
    }
  );

  if (
    !result.selectedAccount
  ) {
    throw new Error(
      'selectedAccount غير موجود.'
    );
  }

  if (
    !Array.isArray(
      result.selectedAccount.items
    )
  ) {
    throw new Error(
      'items ليست مصفوفة.'
    );
  }

  const seen = {};

  result.selectedAccount.items
    .forEach(function (item) {
      const key =
        spendingBehaviorNormalizeText_(
          item.item
        );

      if (seen[key]) {
        throw new Error(
          'يوجد بند مكرر بعد التجميع: ' +
          item.item
        );
      }

      seen[key] = true;
    });

  const classification =
    result.selectedAccount
      .classification;

  if (!classification) {
    throw new Error(
      'التصنيف المساعد غير موجود.'
    );
  }

  const response = {
    success: true,

    accounts:
      result.accounts.length,

    selected:
      result.selectedAccount.name,

    selectedBank:
      result.selectedAccount.bank,

    items:
      result.selectedAccount
        .items.length,

    spent:
      result.selectedAccount
        .summary.spent,

    topItem:
      result.selectedAccount
        .behavior.mostDraining
        ? result.selectedAccount
            .behavior.mostDraining
            .item
        : null,

    top3Concentration:
      result.selectedAccount
        .behavior
        .top3Concentration,

    classification: {
      basic:
        classification.basic.amount,

      exceptional:
        classification
          .exceptional.amount,

      leisure:
        classification.leisure.amount,

      unclassified:
        classification
          .unclassified.amount
    },

    model:
      result.model,

    safeTest: true
  };

  console.log(
    JSON.stringify(
      response,
      null,
      2
    )
  );

  return response;
}
