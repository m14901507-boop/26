/**
 * ==========================================================
 * 63_IncomeDashboard.gs
 *
 * محرك لوحة إدارة الدخل المستقلة
 * ==========================================================
 *
 * يعتمد على:
 * 62_FinancialRouting.gs
 *
 * يدخل في لوحة الدخل:
 * - الدخل الحقيقي
 * - دخل الإيجارات
 *
 * يظهر بشكل منفصل:
 * - الاستردادات
 *
 * مستبعد تمامًا:
 * - المصروفات
 * - الجمعية
 * - التحويلات الداخلية
 * - غير المالي
 *
 * قراءة وتحليل فقط.
 * لا يغير أي بيانات.
 * ==========================================================
 */


var INCOME_DASHBOARD_CONFIG =
  Object.freeze({

    TIME_ZONE:
      'Asia/Muscat',

    MAX_GROUPS:
      100,

    MAX_RECENT:
      100

  });


/* ==========================================================
 * الدالة الرئيسية
 * ==========================================================
 */

/**
 * filters:
 *
 * {
 *   period: 'this_month' | 'this_year',
 *   source: 'all',
 *   bank: 'all',
 *   item: 'all'
 * }
 */
function getIncomeDashboard(
  filters
) {

  filters =
    filters || {};


  var period =
    appText(
      filters.period
    ) ||
    'this_month';


  var sourceFilter =
    appText(
      filters.source
    ) ||
    'all';


  var bankFilter =
    appText(
      filters.bank
    ) ||
    'all';


  var itemFilter =
    appText(
      filters.item
    ) ||
    'all';


  var routing =
    getFinancialRoutingData();


  var now =
    new Date();


  /* ========================================================
   * 1. الدخل الحقيقي
   * ========================================================
   */

  var normalIncome =
    (
      routing.routes.income ||
      []
    )
    .map(
      function(record) {

        return incomeDashboardPrepareRecord_(

          record,

          'income'

        );

      }
    );


  /* ========================================================
   * 2. دخل الإيجارات
   * ========================================================
   */

  var rentIncome =
    (
      routing.routes.rent_income ||
      []
    )
    .map(
      function(record) {

        return incomeDashboardPrepareRecord_(

          record,

          'rent_income'

        );

      }
    );


  /* ========================================================
   * 3. الاستردادات
   *
   * تظهر في لوحة الدخل كحركة نقدية مستقلة،
   * لكنها لا تدخل في إجمالي الدخل الحقيقي.
   * ========================================================
   */

  var refunds =
    (
      routing.routes.refund ||
      []
    )
    .map(
      function(record) {

        return incomeDashboardPrepareRecord_(

          record,

          'refund'

        );

      }
    );


  /* ========================================================
   * 4. جميع الحركات التي يمكن أن تظهر في لوحة الدخل
   * ========================================================
   */

  var allIncomeRecords =
    normalIncome
      .concat(
        rentIncome
      );


  var allVisibleRecords =
    allIncomeRecords
      .concat(
        refunds
      );


  /* ========================================================
   * 5. الفترة
   * ========================================================
   */

  var currentPeriod =
    incomeDashboardResolvePeriod_(

      period,

      now

    );


  var previousPeriod =
    incomeDashboardPreviousPeriod_(

      period,

      currentPeriod

    );


  /* ========================================================
   * 6. الفلترة الحالية
   * ========================================================
   */

  var currentIncome =
    incomeDashboardFilterRecords_(

      allIncomeRecords,

      currentPeriod,

      {
        source:
          sourceFilter,

        bank:
          bankFilter,

        item:
          itemFilter
      }

    );


  var currentRefunds =
    incomeDashboardFilterRecords_(

      refunds,

      currentPeriod,

      {
        source:
          sourceFilter,

        bank:
          bankFilter,

        item:
          itemFilter
      }

    );


  var previousIncome =
    incomeDashboardFilterRecords_(

      allIncomeRecords,

      previousPeriod,

      {
        source:
          sourceFilter,

        bank:
          bankFilter,

        item:
          itemFilter
      }

    );


  /* ========================================================
   * 7. تقسيم الدخل الحقيقي
   * ========================================================
   */

  var currentNormalIncome =
    currentIncome.filter(
      function(record) {

        return (
          record.route ===
          'income'
        );

      }
    );


  var currentRentIncome =
    currentIncome.filter(
      function(record) {

        return (
          record.route ===
          'rent_income'
        );

      }
    );


  /* ========================================================
   * 8. المجاميع
   * ========================================================
   */

  var realIncomeTotal =
    incomeDashboardSum_(
      currentIncome
    );


  var normalIncomeTotal =
    incomeDashboardSum_(
      currentNormalIncome
    );


  var rentIncomeTotal =
    incomeDashboardSum_(
      currentRentIncome
    );


  var refundTotal =
    incomeDashboardSum_(
      currentRefunds
    );


  var cashInTotal =
    realIncomeTotal +
    refundTotal;


  var previousRealIncomeTotal =
    incomeDashboardSum_(
      previousIncome
    );


  var incomeChangePercent =
    incomeDashboardChangePercent_(

      realIncomeTotal,

      previousRealIncomeTotal

    );


  /* ========================================================
   * 9. متوسط الدخل الشهري
   * ========================================================
   */

  var monthlyAverage =
    incomeDashboardMonthlyAverage_(

      allIncomeRecords,

      now

    );


  /* ========================================================
   * 10. تجميع مصادر الدخل
   * ========================================================
   */

  var sourceGroups =
    incomeDashboardBuildSourceGroups_(

      currentIncome,

      INCOME_DASHBOARD_CONFIG
        .MAX_GROUPS

    );


  var refundGroups =
    incomeDashboardBuildSourceGroups_(

      currentRefunds,

      INCOME_DASHBOARD_CONFIG
        .MAX_GROUPS

    );


  /* ========================================================
   * 11. الاتجاه الشهري
   * ========================================================
   */

  var trend =
    incomeDashboardBuild12MonthTrend_(

      allIncomeRecords,

      refunds,

      now

    );


  /* ========================================================
   * 12. خيارات الفلاتر
   * ========================================================
   */

  var filterBase =
    incomeDashboardFilterRecords_(

      allVisibleRecords,

      currentPeriod,

      {}

    );


  var filterOptions =
    incomeDashboardBuildFilterOptions_(
      filterBase
    );


  /* ========================================================
   * 13. أعلى مصدر دخل
   * ========================================================
   */

  var topSource =
    sourceGroups.length

      ? sourceGroups[0]

      : null;


  /* ========================================================
   * 14. النتائج
   * ========================================================
   */

  return {

    generatedAt:
      Utilities.formatDate(

        now,

        INCOME_DASHBOARD_CONFIG
          .TIME_ZONE,

        'dd/MM/yyyy HH:mm:ss'

      ),


    period: {

      key:
        period,

      label:
        period ===
          'this_year'

          ? 'السنة الحالية'

          : 'الشهر الحالي',

      start:
        incomeDashboardFormatDate_(
          currentPeriod.start
        ),

      end:
        incomeDashboardFormatDate_(
          currentPeriod.end
        )

    },


    summary: {

      /**
       * الدخل الحقيقي فقط.
       */
      realIncome:
        incomeDashboardRound_(
          realIncomeTotal
        ),


      /**
       * دخل غير عقاري.
       */
      normalIncome:
        incomeDashboardRound_(
          normalIncomeTotal
        ),


      /**
       * دخل الإيجارات.
       */
      rentIncome:
        incomeDashboardRound_(
          rentIncomeTotal
        ),


      /**
       * الاستردادات مستقلة.
       */
      refunds:
        incomeDashboardRound_(
          refundTotal
        ),


      /**
       * إجمالي المبالغ الداخلة فعليًا للحساب
       * = دخل حقيقي + استرداد.
       *
       * لا يستخدم كمؤشر دخل.
       */
      cashIn:
        incomeDashboardRound_(
          cashInTotal
        ),


      previousIncome:
        incomeDashboardRound_(
          previousRealIncomeTotal
        ),


      changePercent:
        incomeChangePercent,


      monthlyAverage:
        incomeDashboardRound_(
          monthlyAverage
        ),


      incomeTransactions:
        currentIncome.length,


      refundTransactions:
        currentRefunds.length,


      topSource:
        topSource
          ? topSource.item
          : 'لا توجد بيانات',


      topSourceAmount:
        topSource
          ? topSource.total
          : 0

    },


    sources:
      sourceGroups,


    refunds:
      refundGroups,


    trend:
      trend,


    recentIncome:
      incomeDashboardRecentRecords_(

        currentIncome,

        INCOME_DASHBOARD_CONFIG
          .MAX_RECENT

      ),


    recentRefunds:
      incomeDashboardRecentRecords_(

        currentRefunds,

        INCOME_DASHBOARD_CONFIG
          .MAX_RECENT

      ),


    filters: {

      sources:
        [
          'دخل',
          'دخل إيجارات',
          'استرداد'
        ],

      banks:
        filterOptions.banks,

      items:
        filterOptions.items

    },


    exclusions: {

      expenses:
        routing.counts.expense ||
        0,

      association:
        routing.counts.association ||
        0,

      internalTransfers:
        routing.counts.internal_transfer ||
        0,

      nonFinancial:
        routing.counts.non_financial ||
        0

    }

  };

}


/* ==========================================================
 * تجهيز السجل
 * ==========================================================
 */

function incomeDashboardPrepareRecord_(

  record,

  route

) {

  return {

    id:
      appText(
        record.id
      ),


    date:
      record.date,


    item:
      appText(
        record.item
      ) ||
      'غير محدد',


    amount:
      Number(
        record.amount ||
        0
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
      'غير محدد',


    system:
      appText(
        record.system
      ),


    route:
      route,


    source:
      incomeDashboardSourceLabel_(
        route
      )

  };

}


/* ==========================================================
 * مسمى المصدر
 * ==========================================================
 */

function incomeDashboardSourceLabel_(
  route
) {

  if (
    route ===
    'rent_income'
  ) {

    return 'دخل إيجارات';

  }


  if (
    route ===
    'refund'
  ) {

    return 'استرداد';

  }


  return 'دخل';

}


/* ==========================================================
 * الفترة الحالية
 * ==========================================================
 */

function incomeDashboardResolvePeriod_(

  period,

  now

) {

  if (
    period ===
    'this_year'
  ) {

    return {

      start:
        new Date(
          now.getFullYear(),
          0,
          1,
          0,
          0,
          0,
          0
        ),

      end:
        new Date(
          now.getFullYear(),
          11,
          31,
          23,
          59,
          59,
          999
        )

    };

  }


  return {

    start:
      new Date(
        now.getFullYear(),
        now.getMonth(),
        1,
        0,
        0,
        0,
        0
      ),

    end:
      new Date(
        now.getFullYear(),
        now.getMonth() + 1,
        0,
        23,
        59,
        59,
        999
      )

  };

}


/* ==========================================================
 * الفترة السابقة
 * ==========================================================
 */

function incomeDashboardPreviousPeriod_(

  period,

  currentPeriod

) {

  if (
    period ===
    'this_year'
  ) {

    var year =
      currentPeriod.start
        .getFullYear() -
      1;


    return {

      start:
        new Date(
          year,
          0,
          1,
          0,
          0,
          0,
          0
        ),

      end:
        new Date(
          year,
          11,
          31,
          23,
          59,
          59,
          999
        )

    };

  }


  var previousMonth =
    new Date(

      currentPeriod.start
        .getFullYear(),

      currentPeriod.start
        .getMonth() - 1,

      1

    );


  return {

    start:
      new Date(
        previousMonth.getFullYear(),
        previousMonth.getMonth(),
        1,
        0,
        0,
        0,
        0
      ),

    end:
      new Date(
        previousMonth.getFullYear(),
        previousMonth.getMonth() + 1,
        0,
        23,
        59,
        59,
        999
      )

  };

}


/* ==========================================================
 * الفلترة
 * ==========================================================
 */

function incomeDashboardFilterRecords_(

  records,

  period,

  filters

) {

  filters =
    filters || {};


  return records.filter(
    function(record) {

      if (
        !record.date ||
        isNaN(
          record.date.getTime()
        )
      ) {

        return false;

      }


      if (
        period &&
        (
          record.date <
            period.start ||

          record.date >
            period.end
        )
      ) {

        return false;

      }


      if (
        filters.source &&
        filters.source !==
          'all' &&
        appKey(
          record.source
        ) !==
        appKey(
          filters.source
        )
      ) {

        return false;

      }


      if (
        filters.bank &&
        filters.bank !==
          'all' &&
        appKey(
          record.bank
        ) !==
        appKey(
          filters.bank
        )
      ) {

        return false;

      }


      if (
        filters.item &&
        filters.item !==
          'all' &&
        appKey(
          record.item
        ) !==
        appKey(
          filters.item
        )
      ) {

        return false;

      }


      return true;

    }
  );

}


/* ==========================================================
 * تجميع المصادر
 * ==========================================================
 */

function incomeDashboardBuildSourceGroups_(

  records,

  limit

) {

  var map =
    {};


  var grandTotal =
    incomeDashboardSum_(
      records
    );


  records.forEach(
    function(record) {

      var key =
        appKey(
          record.item
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
            record.item,

          source:
            record.source,

          count:
            0,

          total:
            0,

          lastDate:
            record.date,

          latestParty:
            record.party,

          banks:
            {}

        };

      }


      var group =
        map[
          key
        ];


      group.count++;


      group.total +=
        Number(
          record.amount ||
          0
        );


      if (
        record.bank
      ) {

        group.banks[
          record.bank
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
          record.party;

      }

    }
  );


  return Object
    .keys(
      map
    )
    .map(
      function(key) {

        var group =
          map[
            key
          ];


        return {

          item:
            group.item,


          source:
            group.source,


          count:
            group.count,


          total:
            incomeDashboardRound_(
              group.total
            ),


          average:
            incomeDashboardRound_(

              group.count

                ? group.total /
                  group.count

                : 0

            ),


          sharePercent:
            grandTotal > 0

              ? incomeDashboardRound_(

                  (
                    group.total /
                    grandTotal
                  ) *
                  100

                )

              : 0,


          latestParty:
            group.latestParty,


          lastDate:
            group.lastDate

              ? Utilities.formatDate(

                  group.lastDate,

                  INCOME_DASHBOARD_CONFIG
                    .TIME_ZONE,

                  'dd/MM/yyyy'

                )

              : '',


          banks:
            Object.keys(
              group.banks
            )

        };

      }
    )
    .sort(
      function(
        first,
        second
      ) {

        return (
          second.total -
          first.total
        );

      }
    )
    .slice(
      0,
      limit ||
      100
    );

}


/* ==========================================================
 * آخر الحركات
 * ==========================================================
 */

function incomeDashboardRecentRecords_(

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
      limit ||
      100
    )
    .map(
      function(record) {

        return {

          date:
            Utilities.formatDate(

              record.date,

              INCOME_DASHBOARD_CONFIG
                .TIME_ZONE,

              'dd/MM/yyyy'

            ),


          time:
            Utilities.formatDate(

              record.date,

              INCOME_DASHBOARD_CONFIG
                .TIME_ZONE,

              'HH:mm'

            ),


          item:
            record.item,


          source:
            record.source,


          amount:
            incomeDashboardRound_(
              record.amount
            ),


          party:
            record.party,


          bank:
            record.bank,


          channel:
            record.channel

        };

      }
    );

}


/* ==========================================================
 * اتجاه 12 شهر
 * ==========================================================
 */

function incomeDashboardBuild12MonthTrend_(

  incomeRecords,

  refundRecords,

  now

) {

  var result =
    [];


  for (
    var offset = 11;
    offset >= 0;
    offset--
  ) {

    var monthDate =
      new Date(

        now.getFullYear(),

        now.getMonth() -
          offset,

        1

      );


    var start =
      new Date(

        monthDate.getFullYear(),

        monthDate.getMonth(),

        1,

        0,
        0,
        0,
        0

      );


    var end =
      new Date(

        monthDate.getFullYear(),

        monthDate.getMonth() + 1,

        0,

        23,
        59,
        59,
        999

      );


    var income =
      incomeDashboardSum_(

        incomeRecords.filter(
          function(record) {

            return (

              record.date >=
                start &&

              record.date <=
                end

            );

          }
        )

      );


    var rent =
      incomeDashboardSum_(

        incomeRecords.filter(
          function(record) {

            return (

              record.route ===
                'rent_income' &&

              record.date >=
                start &&

              record.date <=
                end

            );

          }
        )

      );


    var refunds =
      incomeDashboardSum_(

        refundRecords.filter(
          function(record) {

            return (

              record.date >=
                start &&

              record.date <=
                end

            );

          }
        )

      );


    result.push({

      key:
        Utilities.formatDate(

          monthDate,

          INCOME_DASHBOARD_CONFIG
            .TIME_ZONE,

          'yyyy-MM'

        ),


      label:
        Utilities.formatDate(

          monthDate,

          INCOME_DASHBOARD_CONFIG
            .TIME_ZONE,

          'MM/yyyy'

        ),


      income:
        incomeDashboardRound_(
          income
        ),


      rentIncome:
        incomeDashboardRound_(
          rent
        ),


      refunds:
        incomeDashboardRound_(
          refunds
        )

    });

  }


  return result;

}


/* ==========================================================
 * متوسط الدخل الشهري
 * ==========================================================
 */

function incomeDashboardMonthlyAverage_(

  records,

  now

) {

  var start =
    new Date(

      now.getFullYear(),

      0,

      1

    );


  var yearRecords =
    records.filter(
      function(record) {

        return (

          record.date &&
          record.date >=
            start &&
          record.date <=
            now

        );

      }
    );


  var total =
    incomeDashboardSum_(
      yearRecords
    );


  var monthsElapsed =
    now.getMonth() +
    1;


  return monthsElapsed > 0

    ? total /
      monthsElapsed

    : 0;

}


/* ==========================================================
 * خيارات الفلاتر
 * ==========================================================
 */

function incomeDashboardBuildFilterOptions_(
  records
) {

  var banks =
    {};


  var items =
    {};


  records.forEach(
    function(record) {

      if (
        record.bank
      ) {

        banks[
          record.bank
        ] =
          true;

      }


      if (
        record.item
      ) {

        items[
          record.item
        ] =
          true;

      }

    }
  );


  return {

    banks:
      Object.keys(
        banks
      )
      .sort(),


    items:
      Object.keys(
        items
      )
      .sort()

  };

}


/* ==========================================================
 * Helpers
 * ==========================================================
 */

function incomeDashboardSum_(
  records
) {

  return records.reduce(
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

}


function incomeDashboardChangePercent_(

  current,

  previous

) {

  if (
    previous > 0
  ) {

    return incomeDashboardRound_(

      (
        (
          current -
          previous
        ) /
        previous
      ) *
      100

    );

  }


  if (
    current === 0
  ) {

    return 0;

  }


  return null;

}


function incomeDashboardRound_(
  value
) {

  return Math.round(

    (
      Number(
        value ||
        0
      ) +
      Number.EPSILON
    ) *
    1000

  ) /
  1000;

}


function incomeDashboardFormatDate_(
  date
) {

  return Utilities.formatDate(

    date,

    INCOME_DASHBOARD_CONFIG
      .TIME_ZONE,

    'dd/MM/yyyy'

  );

}


/* ==========================================================
 * اختبار آمن
 * ==========================================================
 */

function testIncomeDashboard() {

  var data =
    getIncomeDashboard({

      period:
        'this_month',

      source:
        'all',

      bank:
        'all',

      item:
        'all'

    });


  if (
    !data ||
    !data.summary ||
    !Array.isArray(
      data.sources
    ) ||
    !Array.isArray(
      data.refunds
    ) ||
    !Array.isArray(
      data.trend
    )
  ) {

    throw new Error(
      'فشل محرك لوحة الدخل.'
    );

  }


  /**
   * تأكيد عدم ظهور إيجار السكن
   * كدخل.
   */
  var housingInIncome =
    data.sources.find(
      function(row) {

        return (

          appKey(
            row.item
          ) ===
          appKey(
            'إيجار السكن'
          )

        );

      }
    );


  if (
    housingInIncome
  ) {

    throw new Error(
      'خطأ: إيجار السكن ظهر في لوحة الدخل.'
    );

  }


  /**
   * تأكيد أن المصروفات والجمعية
   * ليست جزءًا من مجموع الدخل.
   */
  var result = {

    success:
      true,

    realIncome:
      data.summary.realIncome,

    normalIncome:
      data.summary.normalIncome,

    rentIncome:
      data.summary.rentIncome,

    refunds:
      data.summary.refunds,

    cashIn:
      data.summary.cashIn,

    incomeSources:
      data.sources.length,

    excludedExpenses:
      data.exclusions.expenses,

    excludedAssociation:
      data.exclusions.association,

    excludedInternalTransfers:
      data.exclusions.internalTransfers,

    housingRentExcluded:
      true

  };


  console.log(

    JSON.stringify(
      result,
      null,
      2
    )

  );


  appToast(

    'نجح اختبار لوحة الدخل المستقلة.',

    'اختبار الدخل',

    8

  );


  return result;

}
