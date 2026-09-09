/**
 * ==========================================================
 * 61_DashboardInsights.gs
 *
 * محرك لوحة الميزانية الذكية V3
 * ==========================================================
 *
 * الجديد في V3:
 *
 * 1) دليل البنود هو المصدر الأساسي للفئة/الفترة/الصنف.
 * 2) إعادة تسمية البند لا تفقد التصنيف.
 * 3) مؤشرات الميزانية تبقى مرتبطة بالفترة الأصلية:
 *      - الشهري = الشهر الحالي
 *      - السنوي = السنة الحالية
 * 4) إضافة عرض تاريخي مستقل لقائمة المصروفات:
 *      - الشهر الحالي
 *      - آخر 3 أشهر
 *      - آخر 6 أشهر
 *      - السنة الحالية
 * 5) العرض التاريخي لا يغيّر رصيد الميزانية الحالية.
 *
 * قراءة وتحليل فقط.
 * لا يغير العمليات أو Gmail أو الإيصالات.
 * ==========================================================
 */


var DASHBOARD_INSIGHTS_CONFIG = Object.freeze({

  TIME_ZONE:
    'Asia/Muscat',

  MAX_TRANSACTIONS:
    100,

  MAX_GROUPS:
    100,

  HISTORY_PERIODS: {

    this_month: {
      key: 'this_month',
      label: 'الشهر الحالي'
    },

    last_3_months: {
      key: 'last_3_months',
      label: 'آخر 3 أشهر'
    },

    last_6_months: {
      key: 'last_6_months',
      label: 'آخر 6 أشهر'
    },

    this_year: {
      key: 'this_year',
      label: 'السنة الحالية'
    }

  },

  BUDGETS: {

    family_monthly: {

      key:
        'family_monthly',

      name:
        'عائلي شهري',

      scope:
        'عائلي',

      spendingPeriod:
        'شهري',

      analyticsPeriod:
        'monthly',

      datePeriod:
        'this_month'

    },


    personal_monthly: {

      key:
        'personal_monthly',

      name:
        'شخصي شهري',

      scope:
        'شخصي',

      spendingPeriod:
        'شهري',

      analyticsPeriod:
        'monthly',

      datePeriod:
        'this_month'

    },


    family_annual: {

      key:
        'family_annual',

      name:
        'عائلي سنوي',

      scope:
        'عائلي',

      spendingPeriod:
        'سنوي',

      analyticsPeriod:
        'annual',

      datePeriod:
        'this_year'

    },


    personal_annual: {

      key:
        'personal_annual',

      name:
        'شخصي سنوي',

      scope:
        'شخصي',

      spendingPeriod:
        'سنوي',

      analyticsPeriod:
        'annual',

      datePeriod:
        'this_year'

    }

  }

});


/* ==========================================================
 * الدالة الرئيسية
 * ==========================================================
 */

function getSmartBudgetDashboard(
  filters
) {

  filters =
    filters || {};


  var budgetDefinition =
    dashboardInsightsResolveBudget_(
      filters.budgetKey
    );


  var selectedCategory =
    appText(
      filters.category
    ) ||
    'all';


  var selectedHistoryPeriod =
    dashboardInsightsResolveHistoryPeriodKey_(
      filters.historyPeriod
    );


  var spreadsheet =
    appActiveSpreadsheet();


  var now =
    new Date();


  /* ========================================================
   * 1. الميزانية
   * ========================================================
   */

  var budgetAnalytics =
    getBudgetAnalytics({

      scope:
        budgetDefinition.scope,

      category:
        'all'

    });


  var periodBudget =
    budgetAnalytics[
      budgetDefinition.analyticsPeriod
    ] || {};


  var account =
    dashboardInsightsFindAccount_(

      periodBudget,

      budgetDefinition

    );


  /* ========================================================
   * 2. دليل البنود
   * ========================================================
   */

  var guideAnalytics =
    dashboardInsightsReadGuideAnalytics_(
      spreadsheet
    );


  /* ========================================================
   * 3. العمليات
   * ========================================================
   */

  var rawRecords =
    dashboardReadOperations_(
      spreadsheet
    );


  var allRecords =
    rawRecords.map(
      function(record) {

        return dashboardInsightsEnrichRecord_(

          record,

          guideAnalytics

        );

      }
    );


  /* ========================================================
   * 4. الفترة الأصلية للميزانية
   *
   * هذه الفترة هي التي تستخدم للمؤشرات والرصيد.
   * ========================================================
   */

  var currentDatePeriod =
    dashboardResolvePeriod_(

      {
        period:
          budgetDefinition.datePeriod
      },

      now

    );


  var operationFilters = {

    scope:
      budgetDefinition.scope,

    spendingPeriod:
      budgetDefinition.spendingPeriod,

    category:
      selectedCategory,

    bank:
      appText(
        filters.bank
      ) ||
      'all',

    system:
      appText(
        filters.system
      ) ||
      'all',

    item:
      appText(
        filters.item
      ) ||
      'all'

  };


  var currentRecords =
    dashboardFilterRecords_(

      allRecords,

      operationFilters,

      currentDatePeriod

    );


  var expenseRecords =
    currentRecords.filter(
      dashboardIsExpense_
    );


  /* ========================================================
   * 5. الفترة السابقة
   * ========================================================
   */

  var previousDatePeriod =
    dashboardPreviousPeriod_(
      currentDatePeriod
    );


  var previousRecords =
    previousDatePeriod

      ? dashboardFilterRecords_(

          allRecords,

          operationFilters,

          previousDatePeriod

        )

      : [];


  var previousExpenseRecords =
    previousRecords.filter(
      dashboardIsExpense_
    );


  /* ========================================================
   * 6. المؤشرات الحالية
   * ========================================================
   */

  var currentSummary =
    dashboardBuildSummary_(

      currentRecords,

      currentDatePeriod

    );


  var previousSummary =
    dashboardBuildSummary_(

      previousRecords,

      previousDatePeriod

    );


  var comparison =
    dashboardBuildComparison_(

      currentSummary,

      previousSummary,

      Boolean(
        previousDatePeriod
      )

    );


  var behavior =
    dashboardInsightsBuildBehavior_(

      expenseRecords,

      previousExpenseRecords,

      currentSummary,

      comparison,

      periodBudget,

      currentDatePeriod,

      now

    );


  /* ========================================================
   * 7. الفئات
   * ========================================================
   */

  var categories =
    dashboardInsightsBuildCategories_(

      periodBudget.cards || [],

      selectedCategory

    );


  /* ========================================================
   * 8. العمليات الحالية
   * ========================================================
   */

  var transactions =
    dashboardInsightsBuildTransactions_(

      expenseRecords,

      DASHBOARD_INSIGHTS_CONFIG
        .MAX_TRANSACTIONS

    );


  /* ========================================================
   * 9. البنود الحالية
   * ========================================================
   */

  var spendingGroups =
    dashboardInsightsBuildSpendingGroups_(

      expenseRecords,

      previousExpenseRecords,

      DASHBOARD_INSIGHTS_CONFIG
        .MAX_GROUPS

    );


  /* ========================================================
   * 10. العرض التاريخي المستقل
   *
   * لا يؤثر على مؤشرات الميزانية الحالية.
   * ========================================================
   */

  var historyDatePeriod =
    dashboardInsightsResolveHistoryPeriod_(

      selectedHistoryPeriod,

      now

    );


  var historyRecords =
    dashboardFilterRecords_(

      allRecords,

      operationFilters,

      historyDatePeriod

    );


  var historyExpenseRecords =
    historyRecords.filter(
      dashboardIsExpense_
    );


  var historyTransactions =
    dashboardInsightsBuildTransactions_(

      historyExpenseRecords,

      DASHBOARD_INSIGHTS_CONFIG
        .MAX_TRANSACTIONS

    );


  var historySpendingGroups =
    dashboardInsightsBuildSpendingGroups_(

      historyExpenseRecords,

      [],

      DASHBOARD_INSIGHTS_CONFIG
        .MAX_GROUPS

    );


  /* ========================================================
   * 11. خيارات الفلاتر
   * ========================================================
   */

  var baseBudgetRecords =
    dashboardFilterRecords_(

      allRecords,

      {

        scope:
          budgetDefinition.scope,

        spendingPeriod:
          budgetDefinition.spendingPeriod

      },

      currentDatePeriod

    );


  var filterOptions =
    dashboardBuildFilterOptions_(
      baseBudgetRecords
    );


  var recommendations =
    dashboardBuildRecommendations_(

      currentSummary,

      comparison

    );


  /* ========================================================
   * RETURN
   * ========================================================
   */

  return {

    generatedAt:
      Utilities.formatDate(

        now,

        DASHBOARD_INSIGHTS_CONFIG
          .TIME_ZONE,

        'dd/MM/yyyy HH:mm:ss'

      ),


    sheetUrl:
      spreadsheet.getUrl(),


    selectedBudget: {

      key:
        budgetDefinition.key,

      name:
        budgetDefinition.name,

      scope:
        budgetDefinition.scope,

      spendingPeriod:
        budgetDefinition.spendingPeriod,

      periodType:
        budgetDefinition.analyticsPeriod,

      category:
        selectedCategory

    },


    budgetOptions:
      dashboardInsightsBudgetOptions_(),


    account:
      dashboardInsightsNormalizeAccount_(

        account,

        budgetDefinition,

        periodBudget

      ),


    period: {

      label:
        budgetDefinition.analyticsPeriod ===
          'monthly'

          ? 'الشهر الحالي'

          : 'السنة الحالية',


      start:
        currentDatePeriod &&
        currentDatePeriod.start

          ? dashboardFormatDate_(
              currentDatePeriod.start
            )

          : '',


      end:
        currentDatePeriod &&
        currentDatePeriod.end

          ? dashboardFormatDate_(
              currentDatePeriod.end
            )

          : '',


      progressPercent:
        dashboardRound_(

          Number(
            periodBudget.progressPercent ||
            0
          )

        )

    },


    categories:
      categories,


    behavior:
      behavior,


    transactions:
      transactions,


    spendingGroups:
      spendingGroups,


    transactionCount:
      expenseRecords.length,


    groupedItemCount:
      spendingGroups.length,


    totalExpenseTransactions:
      expenseRecords.length,


    charts: {

      category:
        dashboardAggregate_(

          expenseRecords,

          'category',

          10

        ),


      items:
        dashboardAggregate_(

          expenseRecords,

          'item',

          10

        ),


      banks:
        dashboardAggregate_(

          expenseRecords,

          'bank',

          10

        ),


      trend:
        dashboardBuildMonthlyTrend_(
          currentRecords
        ),


      heatmap:
        dashboardBuildHeatmap_(
          expenseRecords
        )

    },


    /**
     * العرض التاريخي الجديد.
     *
     * مهم:
     * هذا الجزء لا يغير الرصيد ولا الميزانية الحالية.
     */
    history: {

      key:
        selectedHistoryPeriod,

      label:
        historyDatePeriod.label,

      start:
        historyDatePeriod.start

          ? dashboardFormatDate_(
              historyDatePeriod.start
            )

          : '',

      end:
        historyDatePeriod.end

          ? dashboardFormatDate_(
              historyDatePeriod.end
            )

          : '',

      transactionCount:
        historyExpenseRecords.length,

      groupedItemCount:
        historySpendingGroups.length,

      spent:
        dashboardRound_(
          dashboardSum_(
            historyExpenseRecords
          )
        ),

      transactions:
        historyTransactions,

      spendingGroups:
        historySpendingGroups,

      charts: {

        category:
          dashboardAggregate_(

            historyExpenseRecords,

            'category',

            10

          ),

        items:
          dashboardAggregate_(

            historyExpenseRecords,

            'item',

            10

          ),

        banks:
          dashboardAggregate_(

            historyExpenseRecords,

            'bank',

            10

          )

      }

    },


    filters: {

      categories: [

        'اساسي',

        'استثنائي',

        'ترفيهي'

      ],


      banks:
        filterOptions.banks ||
        [],


      systems:
        filterOptions.systems ||
        [],


      items:
        filterOptions.items ||
        [],


      historyPeriods:
        dashboardInsightsHistoryPeriodOptions_()

    },


    recommendations:
      recommendations,


    counts: {

      displayed:
        expenseRecords.length,

      groupedItems:
        spendingGroups.length,

      historyDisplayed:
        historyExpenseRecords.length,

      historyGroupedItems:
        historySpendingGroups.length,

      totalBudgetRecords:
        baseBudgetRecords.length,

      allOperations:
        allRecords.length

    }

  };

}


/* ==========================================================
 * العرض التاريخي
 * ==========================================================
 */

function dashboardInsightsResolveHistoryPeriodKey_(
  value
) {

  var key =
    appText(
      value
    );


  if (
    !key ||
    !DASHBOARD_INSIGHTS_CONFIG
      .HISTORY_PERIODS[
        key
      ]
  ) {

    key =
      'this_month';

  }


  return key;

}


function dashboardInsightsHistoryPeriodOptions_() {

  return [

    DASHBOARD_INSIGHTS_CONFIG
      .HISTORY_PERIODS
      .this_month,

    DASHBOARD_INSIGHTS_CONFIG
      .HISTORY_PERIODS
      .last_3_months,

    DASHBOARD_INSIGHTS_CONFIG
      .HISTORY_PERIODS
      .last_6_months,

    DASHBOARD_INSIGHTS_CONFIG
      .HISTORY_PERIODS
      .this_year

  ].map(
    function(item) {

      return {

        key:
          item.key,

        label:
          item.label

      };

    }
  );

}


function dashboardInsightsResolveHistoryPeriod_(

  key,

  now

) {

  key =
    dashboardInsightsResolveHistoryPeriodKey_(
      key
    );


  now =
    now instanceof Date

      ? now

      : new Date();


  var definition =
    DASHBOARD_INSIGHTS_CONFIG
      .HISTORY_PERIODS[
        key
      ];


  if (
    key ===
    'this_month'
  ) {

    var monthly =
      dashboardResolvePeriod_(

        {
          period:
            'this_month'
        },

        now

      );


    return {

      key:
        key,

      label:
        definition.label,

      start:
        monthly.start,

      end:
        monthly.end

    };

  }


  if (
    key ===
    'this_year'
  ) {

    var yearly =
      dashboardResolvePeriod_(

        {
          period:
            'this_year'
        },

        now

      );


    return {

      key:
        key,

      label:
        definition.label,

      start:
        yearly.start,

      end:
        yearly.end

    };

  }


  var months =
    key ===
      'last_3_months'

      ? 3

      : 6;


  var start =
    new Date(

      now.getFullYear(),

      now.getMonth() -
        (
          months -
          1
        ),

      1,

      0,

      0,

      0,

      0

    );


  var end =
    new Date(
      now.getTime()
    );


  return {

    key:
      key,

    label:
      definition.label,

    start:
      start,

    end:
      end

  };

}


/* ==========================================================
 * قراءة دليل البنود
 * ==========================================================
 */

function dashboardInsightsReadGuideAnalytics_(
  spreadsheet
) {

  var sheet =
    spreadsheet.getSheetByName(
      APP_CONFIG.GUIDE_SHEET
    );


  if (
    !sheet ||
    sheet.getLastRow() < 2
  ) {

    return {};

  }


  var lastRow =
    sheet.getLastRow();


  var lastColumn =
    sheet.getLastColumn();


  var values =
    sheet
      .getRange(

        1,

        1,

        lastRow,

        lastColumn

      )
      .getValues();


  var headers =
    values[0].map(
      appText
    );


  var itemColumn =
    headers.indexOf(
      'البند'
    );


  var legacyColumn =
    headers.indexOf(
      'التصنيف'
    );


  var activeColumn =
    headers.indexOf(
      'نشط'
    );


  var categoryColumn =
    headers.indexOf(
      'الفئة'
    );


  var periodColumn =
    headers.indexOf(
      'الفترة'
    );


  var scopeColumn =
    headers.indexOf(
      'الصنف'
    );


  if (
    itemColumn < 0
  ) {

    return {};

  }


  var result =
    {};


  values
    .slice(1)
    .forEach(
      function(row) {

        var item =
          appText(
            row[
              itemColumn
            ]
          );


        if (
          !item
        ) {

          return;

        }


        if (
          activeColumn >= 0 &&
          !appIsActive(
            row[
              activeColumn
            ]
          )
        ) {

          return;

        }


        var category =

          categoryColumn >= 0

            ? dashboardInsightsCanonicalCategory_(

                row[
                  categoryColumn
                ]

              )

            : '';


        var period =

          periodColumn >= 0

            ? dashboardInsightsCanonicalPeriod_(

                row[
                  periodColumn
                ]

              )

            : '';


        var scope =

          scopeColumn >= 0

            ? dashboardInsightsCanonicalScope_(

                row[
                  scopeColumn
                ]

              )

            : '';


        var legacyClassification =

          legacyColumn >= 0

            ? appText(
                row[
                  legacyColumn
                ]
              )

            : '';


        var parsed =
          dashboardInsightsParseClassification_(

            legacyClassification

          );


        if (
          !category &&
          parsed
        ) {

          category =
            parsed.category;

        }


        if (
          !period &&
          parsed
        ) {

          period =
            parsed.period;

        }


        if (
          !scope &&
          parsed
        ) {

          scope =
            parsed.scope;

        }


        result[
          appKey(
            item
          )
        ] = {

          item:
            item,

          category:
            category,

          spendingPeriod:
            period,

          scope:
            scope,

          legacyClassification:
            legacyClassification

        };

      }
    );


  return result;

}


/* ==========================================================
 * إثراء العملية من دليل البنود
 * ==========================================================
 */

function dashboardInsightsEnrichRecord_(

  record,

  guideAnalytics

) {

  var result =
    Object.assign(
      {},
      record
    );


  var guide =
    guideAnalytics[
      appKey(
        result.item
      )
    ] ||
    null;


  if (
    guide
  ) {

    if (
      guide.category
    ) {

      result.category =
        guide.category;

    }


    if (
      guide.spendingPeriod
    ) {

      result.spendingPeriod =
        guide.spendingPeriod;

    }


    if (
      guide.scope
    ) {

      result.scope =
        guide.scope;

    }

  }


  var parsed =
    dashboardInsightsParseClassification_(

      result.legacyClassification

    );


  if (
    parsed
  ) {

    if (
      dashboardInsightsAnalyticMissing_(
        result.category
      )
    ) {

      result.category =
        parsed.category;

    }


    if (
      dashboardInsightsAnalyticMissing_(
        result.spendingPeriod
      )
    ) {

      result.spendingPeriod =
        parsed.period;

    }


    if (
      dashboardInsightsAnalyticMissing_(
        result.scope
      )
    ) {

      result.scope =
        parsed.scope;

    }

  }


  result.classification =
    result.category;


  result.direction =
    dashboardDirection_(
      result
    );


  return result;

}


/* ==========================================================
 * تحليل التصنيف المركب
 * ==========================================================
 */

function dashboardInsightsParseClassification_(
  value
) {

  var text =
    dashboardInsightsNormalize_(
      value
    );


  if (
    !text
  ) {

    return null;

  }


  var category =
    '';


  var period =
    '';


  var scope =
    '';


  if (
    text.indexOf(
      'اساسي'
    ) !== -1
  ) {

    category =
      'اساسي';

  }


  else if (
    text.indexOf(
      'استثنائي'
    ) !== -1
  ) {

    category =
      'استثنائي';

  }


  else if (
    text.indexOf(
      'ترفيهي'
    ) !== -1
  ) {

    category =
      'ترفيهي';

  }


  if (
    text.indexOf(
      'شهري'
    ) !== -1
  ) {

    period =
      'شهري';

  }


  else if (
    text.indexOf(
      'سنوي'
    ) !== -1
  ) {

    period =
      'سنوي';

  }


  if (
    text.indexOf(
      'عائلي'
    ) !== -1
  ) {

    scope =
      'عائلي';

  }


  else if (
    text.indexOf(
      'شخصي'
    ) !== -1
  ) {

    scope =
      'شخصي';

  }


  if (
    !category ||
    !period ||
    !scope
  ) {

    return null;

  }


  return {

    category:
      category,

    period:
      period,

    scope:
      scope

  };

}


/* ==========================================================
 * توحيد القيم التحليلية
 * ==========================================================
 */

function dashboardInsightsCanonicalCategory_(
  value
) {

  var text =
    dashboardInsightsNormalize_(
      value
    );


  if (
    text ===
    'اساسي'
  ) {

    return 'اساسي';

  }


  if (
    text ===
    'استثنائي'
  ) {

    return 'استثنائي';

  }


  if (
    text ===
    'ترفيهي'
  ) {

    return 'ترفيهي';

  }


  return '';

}


function dashboardInsightsCanonicalPeriod_(
  value
) {

  var text =
    dashboardInsightsNormalize_(
      value
    );


  if (
    text ===
    'شهري'
  ) {

    return 'شهري';

  }


  if (
    text ===
    'سنوي'
  ) {

    return 'سنوي';

  }


  return '';

}


function dashboardInsightsCanonicalScope_(
  value
) {

  var text =
    dashboardInsightsNormalize_(
      value
    );


  if (
    text ===
    'عائلي'
  ) {

    return 'عائلي';

  }


  if (
    text ===
    'شخصي'
  ) {

    return 'شخصي';

  }


  return '';

}


function dashboardInsightsAnalyticMissing_(
  value
) {

  var text =
    dashboardInsightsNormalize_(
      value
    );


  return (

    !text ||

    text ===
      'غير محدد' ||

    text ===
      'غير مطبق' ||

    text ===
      'يحتاج اعداد'

  );

}


/* ==========================================================
 * الميزانيات الأربع
 * ==========================================================
 */

function dashboardInsightsResolveBudget_(
  budgetKey
) {

  var key =
    appText(
      budgetKey
    );


  if (
    !key ||
    !DASHBOARD_INSIGHTS_CONFIG
      .BUDGETS[
        key
      ]
  ) {

    key =
      'family_monthly';

  }


  return DASHBOARD_INSIGHTS_CONFIG
    .BUDGETS[
      key
    ];

}


function dashboardInsightsBudgetOptions_() {

  return [

    DASHBOARD_INSIGHTS_CONFIG
      .BUDGETS
      .family_monthly,

    DASHBOARD_INSIGHTS_CONFIG
      .BUDGETS
      .personal_monthly,

    DASHBOARD_INSIGHTS_CONFIG
      .BUDGETS
      .family_annual,

    DASHBOARD_INSIGHTS_CONFIG
      .BUDGETS
      .personal_annual

  ].map(
    function(item) {

      return {

        key:
          item.key,

        name:
          item.name,

        scope:
          item.scope,

        spendingPeriod:
          item.spendingPeriod

      };

    }
  );

}


/* ==========================================================
 * الحساب
 * ==========================================================
 */

function dashboardInsightsFindAccount_(

  periodBudget,

  definition

) {

  var accounts =
    periodBudget &&
    Array.isArray(
      periodBudget.accounts
    )

      ? periodBudget.accounts

      : [];


  var found =
    accounts.find(
      function(account) {

        var name =
          appText(
            account.name
          );


        var scope =
          appText(
            account.scope
          );


        var period =
          appText(
            account.period
          );


        if (
          name &&
          appKey(
            name
          ) ===
          appKey(
            definition.name
          )
        ) {

          return true;

        }


        return (

          appKey(
            scope
          ) ===
          appKey(
            definition.scope
          ) &&

          appKey(
            period
          ) ===
          appKey(
            definition.spendingPeriod
          )

        );

      }
    );


  if (
    found
  ) {

    return found;

  }


  return accounts.length

    ? accounts[0]

    : null;

}


/* ==========================================================
 * بيانات الحساب
 * ==========================================================
 */

function dashboardInsightsNormalizeAccount_(

  account,

  definition,

  periodBudget

) {

  account =
    account || {};


  var percentages =
    account.percentages ||
    {};


  var monthlyTopUp =
    dashboardInsightsNullableNumber_(

      account.monthlyTopUp !==
        undefined

        ? account.monthlyTopUp

        : periodBudget.monthlyTopUp

    );


  var availableBalance =
    dashboardInsightsNullableNumber_(

      account.availableBalance !==
        undefined

        ? account.availableBalance

        : periodBudget.availableBalance

    );


  var openingBalance =
    dashboardInsightsNullableNumber_(
      account.openingBalance
    );


  var contributionsToDate =
    dashboardInsightsNullableNumber_(
      account.contributionsToDate
    );


  var periodSpent =
    dashboardInsightsNullableNumber_(

      account.periodSpent !==
        undefined

        ? account.periodSpent

        : periodBudget.spent

    );


  return {

    name:
      appText(
        account.name
      ) ||
      definition.name,


    scope:
      definition.scope,


    period:
      definition.spendingPeriod,


    monthlyTopUp:
      monthlyTopUp,


    openingBalance:
      openingBalance,


    contributionsToDate:
      contributionsToDate,


    availableBalance:
      availableBalance,


    periodSpent:
      periodSpent,


    startDate:
      dashboardInsightsFormatMaybeDate_(
        account.startDate
      ),


    active:
      account.active !== false,


    distributionConfigured:
      Boolean(
        account.distributionConfigured
      ),


    percentages: {

      اساسي:
        dashboardInsightsPercent_(

          percentages.اساسي !==
            undefined

            ? percentages.اساسي

            : account.basicPercent

        ),


      استثنائي:
        dashboardInsightsPercent_(

          percentages.استثنائي !==
            undefined

            ? percentages.استثنائي

            : account.exceptionalPercent

        ),


      ترفيهي:
        dashboardInsightsPercent_(

          percentages.ترفيهي !==
            undefined

            ? percentages.ترفيهي

            : account.leisurePercent

        )

    },


    status:
      account.status ||
      dashboardInsightsAccountStatusFallback_(
        availableBalance
      )

  };

}


/* ==========================================================
 * الفئات
 * ==========================================================
 */

function dashboardInsightsBuildCategories_(

  cards,

  selectedCategory

) {

  var order = [

    'اساسي',

    'استثنائي',

    'ترفيهي'

  ];


  var map =
    {};


  cards.forEach(
    function(card) {

      var category =
        dashboardInsightsCanonicalCategory_(
          card.category
        );


      if (
        !category
      ) {

        return;

      }


      map[
        appKey(
          category
        )
      ] =
        card;

    }
  );


  return order.map(
    function(category) {

      var card =
        map[
          appKey(
            category
          )
        ] ||
        {};


      var target =

        card.target !==
          undefined

          ? card.target

          : card.budget;


      var usage =

        card.budgetUsage !==
          undefined

          ? card.budgetUsage

          : null;


      return {

        category:
          category,


        selected:
          selectedCategory ===
            'all' ||

          appKey(
            selectedCategory
          ) ===
          appKey(
            category
          ),


        spent:
          dashboardRound_(

            Number(
              card.spent ||
              0
            )

          ),


        target:
          dashboardInsightsNullableNumber_(
            target
          ),


        remaining:
          dashboardInsightsNullableNumber_(
            card.remaining
          ),


        expected:
          dashboardInsightsNullableNumber_(
            card.expected
          ),


        usagePercent:
          dashboardInsightsNullableNumber_(
            usage
          ),


        expectedUsage:
          dashboardInsightsNullableNumber_(
            card.expectedUsage
          ),


        varianceFromExpected:
          dashboardInsightsNullableNumber_(
            card.varianceFromExpected
          ),


        status:
          card.status ||
          {

            level:
              'neutral',

            label:
              'غير محدد'

          },


        items:
          Array.isArray(
            card.items
          )

            ? card.items.map(
                function(item) {

                  return {

                    item:
                      appText(
                        item.item
                      ) ||
                      'غير محدد',

                    spent:
                      dashboardRound_(

                        Number(
                          item.spent ||
                          0
                        )

                      ),

                    count:
                      Number(
                        item.count ||
                        0
                      )

                  };

                }
              )

            : []

      };

    }
  );

}


/* ==========================================================
 * العمليات الفردية
 * ==========================================================
 */

function dashboardInsightsBuildTransactions_(

  records,

  limit

) {

  return records
    .slice()
    .sort(
      function(
        first,
        second
      ) {

        return (

          second.date.getTime() -

          first.date.getTime()

        );

      }
    )
    .slice(
      0,
      limit || 100
    )
    .map(
      function(record) {

        return {

          id:
            appText(
              record.id
            ),


          date:
            Utilities.formatDate(

              record.date,

              DASHBOARD_INSIGHTS_CONFIG
                .TIME_ZONE,

              'dd/MM/yyyy'

            ),


          time:
            Utilities.formatDate(

              record.date,

              DASHBOARD_INSIGHTS_CONFIG
                .TIME_ZONE,

              'HH:mm'

            ),


          item:
            appText(
              record.item
            ) ||
            'غير محدد',


          category:
            appText(
              record.category
            ) ||
            'غير محدد',


          amount:
            dashboardRound_(
              record.amount
            ),


          party:
            appText(
              record.party
            ) ||
            'غير محدد',


          bank:
            appText(
              record.bank
            ) ||
            'غير محدد',


          channel:
            appText(
              record.channel
            ) ||
            'غير محدد'

        };

      }
    );

}


/* ==========================================================
 * دمج عمليات الصرف المتشابهة
 * ==========================================================
 */

function dashboardInsightsBuildSpendingGroups_(

  currentRecords,

  previousRecords,

  limit

) {

  var currentMap =
    dashboardInsightsAggregateSpendingItems_(
      currentRecords
    );


  var previousMap =
    dashboardInsightsAggregateSpendingItems_(
      previousRecords
    );


  var totalSpent =
    currentRecords.reduce(
      function(
        total,
        record
      ) {

        return (
          total +
          Number(
            record.amount ||
            0
          )
        );

      },
      0
    );


  return Object.keys(
    currentMap
  )
    .map(
      function(key) {

        var current =
          currentMap[
            key
          ];


        var previous =
          previousMap[
            key
          ] ||
          {
            total:
              0,

            count:
              0
          };


        var changePercent =
          null;


        if (
          previous.total > 0
        ) {

          changePercent =
            dashboardRound_(

              (
                (
                  current.total -
                  previous.total
                ) /
                previous.total
              ) *
              100

            );

        }


        else if (
          current.total === 0
        ) {

          changePercent =
            0;

        }


        return {

          item:
            current.item,


          category:
            current.category,


          count:
            current.count,


          totalSpent:
            dashboardRound_(
              current.total
            ),


          averageSpent:
            dashboardRound_(

              current.count > 0

                ? current.total /
                  current.count

                : 0

            ),


          lastDate:
            Utilities.formatDate(

              current.lastDate,

              DASHBOARD_INSIGHTS_CONFIG
                .TIME_ZONE,

              'dd/MM/yyyy'

            ),


          lastTime:
            Utilities.formatDate(

              current.lastDate,

              DASHBOARD_INSIGHTS_CONFIG
                .TIME_ZONE,

              'HH:mm'

            ),


          previousSpent:
            dashboardRound_(
              previous.total
            ),


          previousCount:
            previous.count,


          changePercent:
            changePercent,


          sharePercent:
            totalSpent > 0

              ? dashboardRound_(

                  (
                    current.total /
                    totalSpent
                  ) *
                  100

                )

              : 0,


          banks:
            Object.keys(
              current.banks
            ).sort(),


          channels:
            Object.keys(
              current.channels
            ).sort(),


          latestParty:
            current.latestParty ||
            'غير محدد'

        };

      }
    )
    .sort(
      function(
        first,
        second
      ) {

        return (

          second.totalSpent -

          first.totalSpent

        );

      }
    )
    .slice(
      0,
      limit || 100
    );

}


/**
 * تجميع داخلي حسب اسم البند.
 */
function dashboardInsightsAggregateSpendingItems_(
  records
) {

  var map =
    {};


  records.forEach(
    function(record) {

      var item =
        appText(
          record.item
        ) ||
        'غير محدد';


      var key =
        appKey(
          item
        );


      if (
        !map[
          key
        ]
      ) {

        map[
          key
        ] = {

          item:
            item,

          category:
            appText(
              record.category
            ) ||
            'غير محدد',

          total:
            0,

          count:
            0,

          lastDate:
            record.date,

          latestParty:
            appText(
              record.party
            ),

          banks:
            {},

          channels:
            {}

        };

      }


      var group =
        map[
          key
        ];


      group.total +=
        Number(
          record.amount ||
          0
        );


      group.count++;


      var bank =
        appText(
          record.bank
        );


      if (
        bank
      ) {

        group.banks[
          bank
        ] =
          true;

      }


      var channel =
        appText(
          record.channel
        );


      if (
        channel
      ) {

        group.channels[
          channel
        ] =
          true;

      }


      if (
        record.date >
        group.lastDate
      ) {

        group.lastDate =
          record.date;


        group.latestParty =
          appText(
            record.party
          );

      }

    }
  );


  return map;

}


/* ==========================================================
 * تحليل السلوك
 * ==========================================================
 */

function dashboardInsightsBuildBehavior_(

  currentExpenseRecords,

  previousExpenseRecords,

  currentSummary,

  comparison,

  periodBudget,

  period,

  now

) {

  var spent =
    dashboardSum_(
      currentExpenseRecords
    );


  var previousSpent =
    dashboardSum_(
      previousExpenseRecords
    );


  var transactionCount =
    currentExpenseRecords.length;


  var averageTransaction =
    transactionCount > 0

      ? spent /
        transactionCount

      : 0;


  var progressPercent =
    Number(
      periodBudget.progressPercent ||
      0
    );


  var projectedSpend =
    null;


  if (
    spent > 0 &&
    progressPercent > 0
  ) {

    projectedSpend =
      dashboardRound_(

        spent /

        (
          progressPercent /
          100
        )

      );

  }


  var expected =
    dashboardInsightsNullableNumber_(
      periodBudget.expected
    );


  var target =
    dashboardInsightsNullableNumber_(
      periodBudget.budget
    );


  var targetRemaining =
    dashboardInsightsNullableNumber_(
      periodBudget.targetRemaining
    );


  var availableBalance =
    dashboardInsightsNullableNumber_(
      periodBudget.availableBalance
    );


  var paceVariance =
    null;


  if (
    expected !== null
  ) {

    paceVariance =
      dashboardRound_(

        spent -
        expected

      );

  }


  var daysRemaining =
    dashboardInsightsDaysRemaining_(

      period,

      now

    );


  var topItem =
    dashboardAggregate_(

      currentExpenseRecords,

      'item',

      1

    );


  var topCategory =
    dashboardAggregate_(

      currentExpenseRecords,

      'category',

      1

    );


  var paceStatus =
    dashboardInsightsPaceStatus_(

      spent,

      expected,

      availableBalance

    );


  var expenseChange =
    comparison &&
    comparison.available

      ? comparison.expense

      : null;


  return {

    spent:
      dashboardRound_(
        spent
      ),


    previousSpent:
      dashboardRound_(
        previousSpent
      ),


    expenseChangePercent:
      expenseChange,


    transactionCount:
      transactionCount,


    averageTransaction:
      dashboardRound_(
        averageTransaction
      ),


    averageDaily:
      dashboardRound_(

        Number(
          currentSummary.averageDaily ||
          0
        )

      ),


    weekendShare:
      dashboardRound_(

        Number(
          currentSummary.weekendShare ||
          0
        )

      ),


    nightShare:
      dashboardRound_(

        Number(
          currentSummary.nightShare ||
          0
        )

      ),


    concentration:
      dashboardRound_(

        Number(
          currentSummary.concentration ||
          0
        )

      ),


    topItem:
      topItem.length

        ? topItem[0].name

        : 'لا توجد بيانات',


    topItemAmount:
      topItem.length

        ? topItem[0].amount

        : 0,


    topCategory:
      topCategory.length

        ? topCategory[0].name

        : 'لا توجد بيانات',


    target:
      target,


    expected:
      expected,


    availableBalance:
      availableBalance,


    targetRemaining:
      targetRemaining,


    paceVariance:
      paceVariance,


    progressPercent:
      dashboardRound_(
        progressPercent
      ),


    projectedSpend:
      projectedSpend,


    daysRemaining:
      daysRemaining,


    paceStatus:
      paceStatus,


    snapshot:
      dashboardInsightsSnapshot_(

        spent,

        expected,

        projectedSpend,

        availableBalance,

        expenseChange,

        currentSummary.weekendShare,

        currentSummary.nightShare,

        currentSummary.concentration

      )

  };

}


/* ==========================================================
 * ملخص السلوك
 * ==========================================================
 */

function dashboardInsightsSnapshot_(

  spent,

  expected,

  projectedSpend,

  availableBalance,

  expenseChange,

  weekendShare,

  nightShare,

  concentration

) {

  var messages =
    [];


  if (
    availableBalance !== null &&
    availableBalance < 0
  ) {

    messages.push({

      level:
        'danger',

      icon:
        'wallet',

      title:
        'تجاوز الرصيد',

      text:
        'المصروفات تجاوزت الرصيد المتاح للميزانية.'

    });

  }


  if (
    expected !== null &&
    spent > expected
  ) {

    messages.push({

      level:
        'warning',

      icon:
        'trend',

      title:
        'الصرف أعلى من المسار',

      text:
        'معدل الصرف الحالي أسرع من المستوى المتوقع حتى اليوم.'

    });

  }


  else if (
    expected !== null &&
    spent <= expected
  ) {

    messages.push({

      level:
        'good',

      icon:
        'check',

      title:
        'المسار منضبط',

      text:
        'الصرف الحالي ضمن المسار المتوقع للفترة.'

    });

  }


  if (
    expenseChange !== null &&
    expenseChange > 10
  ) {

    messages.push({

      level:
        'warning',

      icon:
        'compare',

      title:
        'ارتفاع عن الفترة السابقة',

      text:
        'المصروفات ارتفعت بنسبة ' +

        dashboardRound_(
          expenseChange
        ) +

        '%.'

    });

  }


  if (
    Number(
      weekendShare ||
      0
    ) >= 35
  ) {

    messages.push({

      level:
        'warning',

      icon:
        'calendar',

      title:
        'إنفاق نهاية الأسبوع مرتفع',

      text:
        dashboardRound_(
          weekendShare
        ) +

        '% من الصرف تم يومي الجمعة والسبت.'

    });

  }


  if (
    Number(
      nightShare ||
      0
    ) >= 20
  ) {

    messages.push({

      level:
        'warning',

      icon:
        'moon',

      title:
        'مشتريات ليلية ملحوظة',

      text:
        dashboardRound_(
          nightShare
        ) +

        '% من المصروفات تمت ليلًا.'

    });

  }


  if (
    Number(
      concentration ||
      0
    ) >= 50
  ) {

    messages.push({

      level:
        'info',

      icon:
        'target',

      title:
        'الصرف مركز في بنود محددة',

      text:
        dashboardRound_(
          concentration
        ) +

        '% من الصرف موجود في أعلى ثلاثة بنود.'

    });

  }


  if (
    projectedSpend !== null
  ) {

    messages.push({

      level:
        'info',

      icon:
        'forecast',

      title:
        'توقع نهاية الفترة',

      text:
        'إذا استمر نفس معدل الصرف فقد يصل المصروف إلى ' +

        projectedSpend.toFixed(
          3
        ) +

        ' ر.ع.'

    });

  }


  return messages.slice(
    0,
    6
  );

}


/* ==========================================================
 * حالة مسار الصرف
 * ==========================================================
 */

function dashboardInsightsPaceStatus_(

  spent,

  expected,

  availableBalance

) {

  if (
    availableBalance !== null &&
    availableBalance < 0
  ) {

    return {

      level:
        'danger',

      label:
        'تجاوز الرصيد'

    };

  }


  if (
    expected === null
  ) {

    return {

      level:
        'neutral',

      label:
        'المستهدف غير مكتمل'

    };

  }


  if (
    spent <= expected
  ) {

    return {

      level:
        'good',

      label:
        'ضمن المسار'

    };

  }


  var overPercent =
    expected > 0

      ? (
          (
            spent -
            expected
          ) /
          expected
        ) *
        100

      : 100;


  if (
    overPercent <= 15
  ) {

    return {

      level:
        'warning',

      label:
        'أعلى قليلًا من المسار'

    };

  }


  return {

    level:
      'danger',

    label:
      'الصرف سريع'

  };

}


/* ==========================================================
 * الأيام المتبقية
 * ==========================================================
 */

function dashboardInsightsDaysRemaining_(

  period,

  now

) {

  if (
    !period ||
    !period.end
  ) {

    return null;

  }


  var today =
    new Date(

      now.getFullYear(),

      now.getMonth(),

      now.getDate()

    );


  var end =
    new Date(

      period.end.getFullYear(),

      period.end.getMonth(),

      period.end.getDate()

    );


  return Math.max(

    0,

    Math.ceil(

      (
        end.getTime() -
        today.getTime()
      ) /

      86400000

    )

  );

}


/* ==========================================================
 * مساعدات
 * ==========================================================
 */

function dashboardInsightsNullableNumber_(
  value
) {

  if (
    value === null ||
    value === undefined ||
    value === ''
  ) {

    return null;

  }


  var number =
    Number(
      value
    );


  return Number.isFinite(
    number
  )

    ? dashboardRound_(
        number
      )

    : null;

}


function dashboardInsightsPercent_(
  value
) {

  return dashboardInsightsNullableNumber_(
    value
  );

}


function dashboardInsightsFormatMaybeDate_(
  value
) {

  if (
    !value
  ) {

    return '';

  }


  var date =
    value instanceof Date

      ? value

      : new Date(
          value
        );


  if (
    isNaN(
      date.getTime()
    )
  ) {

    return appText(
      value
    );

  }


  return Utilities.formatDate(

    date,

    DASHBOARD_INSIGHTS_CONFIG
      .TIME_ZONE,

    'yyyy-MM-dd'

  );

}


function dashboardInsightsAccountStatusFallback_(
  balance
) {

  if (
    balance === null
  ) {

    return {

      level:
        'neutral',

      label:
        'غير مكتملة'

    };

  }


  if (
    balance < 0
  ) {

    return {

      level:
        'danger',

      label:
        'تجاوز الرصيد'

    };

  }


  return {

    level:
      'good',

    label:
      'الرصيد متاح'

  };

}


function dashboardInsightsNormalize_(
  value
) {

  return appText(
    value
  )
    .toLowerCase()
    .replace(
      /[إأآ]/g,
      'ا'
    )
    .replace(
      /ى/g,
      'ي'
    )
    .replace(
      /ة/g,
      'ه'
    )
    .replace(
      /\s+/g,
      ' '
    )
    .trim();

}


/* ==========================================================
 * تشخيص إيجار السكن
 * ==========================================================
 */

function diagnoseHousingRentDashboard() {

  var ss =
    appActiveSpreadsheet();


  var guide =
    dashboardInsightsReadGuideAnalytics_(
      ss
    );


  var records =
    dashboardReadOperations_(
      ss
    )
      .map(
        function(record) {

          return dashboardInsightsEnrichRecord_(

            record,

            guide

          );

        }
      );


  var matches =
    records.filter(
      function(record) {

        var text =
          dashboardInsightsNormalize_(

            [
              record.item,
              record.party,
              record.legacyClassification
            ].join(
              ' '
            )

          );


        return (

          text.indexOf(
            'ايجار السكن'
          ) !== -1 ||

          (
            text.indexOf(
              'ايجار'
            ) !== -1 &&

            text.indexOf(
              'سكن'
            ) !== -1
          )

        );

      }
    );


  var result =
    matches.map(
      function(record) {

        return {

          date:
            Utilities.formatDate(

              record.date,

              DASHBOARD_INSIGHTS_CONFIG
                .TIME_ZONE,

              'dd/MM/yyyy HH:mm'

            ),

          item:
            record.item,

          amount:
            record.amount,

          category:
            record.category,

          period:
            record.spendingPeriod,

          scope:
            record.scope,

          type:
            record.type,

          direction:
            record.direction,

          legacyClassification:
            record.legacyClassification

        };

      }
    );


  console.log(

    JSON.stringify(
      result,
      null,
      2
    )

  );


  return result;

}


/* ==========================================================
 * الاختبار القديم — محفوظ للتوافق
 * ==========================================================
 */

function testDashboardInsightsV2() {

  var result =
    getSmartBudgetDashboard({

      budgetKey:
        'family_monthly',

      category:
        'all',

      bank:
        'all',

      system:
        'all',

      item:
        'all'

    });


  if (
    !result ||
    !result.selectedBudget ||
    !result.account ||
    !result.behavior ||
    !Array.isArray(
      result.categories
    ) ||
    !Array.isArray(
      result.spendingGroups
    )
  ) {

    throw new Error(
      'فشل اختبار محرك لوحة الميزانية الذكية V2.'
    );

  }


  if (
    result.categories.length !==
    3
  ) {

    throw new Error(
      'يجب أن يعيد المحرك الفئات الثلاث.'
    );

  }


  var itemKeys =
    result.spendingGroups.map(
      function(group) {

        return appKey(
          group.item
        );

      }
    );


  var uniqueKeys =
    Array.from(
      new Set(
        itemKeys
      )
    );


  if (
    itemKeys.length !==
    uniqueKeys.length
  ) {

    throw new Error(
      'يوجد تكرار في البنود المجمعة.'
    );

  }


  var testResult = {

    success:
      true,

    budget:
      result.selectedBudget.name,

    categories:
      result.categories.length,

    expenseTransactions:
      result.totalExpenseTransactions,

    groupedItems:
      result.spendingGroups.length,

    generatedAt:
      result.generatedAt

  };


  console.log(

    JSON.stringify(
      testResult,
      null,
      2
    )

  );


  return testResult;

}


/* ==========================================================
 * اختبار V3
 *
 * آمن:
 * لا يكتب في Sheets.
 * لا يغير Gmail.
 * لا ينشئ Trigger.
 * ==========================================================
 */

function testDashboardInsightsV3() {

  var current =
    getSmartBudgetDashboard({

      budgetKey:
        'family_monthly',

      category:
        'all',

      bank:
        'all',

      system:
        'all',

      item:
        'all',

      historyPeriod:
        'this_month'

    });


  var sixMonths =
    getSmartBudgetDashboard({

      budgetKey:
        'family_monthly',

      category:
        'all',

      bank:
        'all',

      system:
        'all',

      item:
        'all',

      historyPeriod:
        'last_6_months'

    });


  if (
    !current ||
    !current.history ||
    !sixMonths ||
    !sixMonths.history
  ) {

    throw new Error(
      'لم يتم إنشاء بيانات العرض التاريخي.'
    );

  }


  if (
    !Array.isArray(
      sixMonths.history.spendingGroups
    )
  ) {

    throw new Error(
      'history.spendingGroups ليست مصفوفة.'
    );

  }


  if (
    !current.filters ||
    !Array.isArray(
      current.filters.historyPeriods
    ) ||
    current.filters.historyPeriods.length !==
      4
  ) {

    throw new Error(
      'خيارات الفترة التاريخية غير مكتملة.'
    );

  }


  var currentSpent =
    Number(
      current.behavior.spent ||
      0
    );


  var sixMonthHistorySpent =
    Number(
      sixMonths.history.spent ||
      0
    );


  var result = {

    success:
      true,

    version:
      'V3',

    budget:
      current.selectedBudget.name,

    currentBudgetPeriod:
      current.period.label,

    currentMonthTransactions:
      current.totalExpenseTransactions,

    currentMonthGroups:
      current.spendingGroups.length,

    currentMonthSpent:
      currentSpent,

    historyPeriod:
      sixMonths.history.label,

    historyTransactions:
      sixMonths.history.transactionCount,

    historyGroups:
      sixMonths.history.groupedItemCount,

    historySpent:
      sixMonthHistorySpent,

    historyOptions:
      current.filters.historyPeriods.length,

    currentBudgetUnchanged:
      Number(
        sixMonths.behavior.spent ||
        0
      ) ===
      currentSpent,

    safeTest:
      true,

    generatedAt:
      current.generatedAt

  };


  console.log(

    JSON.stringify(
      result,
      null,
      2
    )

  );


  return result;

}
