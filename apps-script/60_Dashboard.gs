/**
 * ==========================================================
 * 60_Dashboard.gs
 *
 * لوحة التحكم + المزامنة السريعة
 * ==========================================================
 *
 * التصميم:
 *
 * dashboardSyncOperations()
 *   تحديث العمليات الجديدة سريعًا.
 *
 * dashboardSyncLabels()
 *   تحديث دليل البنود من Gmail
 *   + تحديث الأسماء في العمليات القديمة.
 *
 * dashboardSyncAll()
 *   تحديث الكل اليومي السريع:
 *   الأسماء + البنود + العمليات الجديدة.
 *
 * dashboardMaintenanceFullSync()
 *   الصيانة الشاملة الثقيلة:
 *   البنود + المطابقة الكاملة + الإيجارات.
 *
 * ==========================================================
 */


var DASHBOARD_CONFIG = Object.freeze({

  OPERATIONS_SHEET:
    'العمليات',

  CURRENCY:
    'ر.ع',

  TIME_ZONE:
    'Asia/Muscat',

  TITLE:
    'لوحة التحليل المالي وسلوك الشراء',

  SYNC_LOCK_WAIT_MS:
    5000

});


/* ==========================================================
 * عرض لوحة الويب
 * ==========================================================
 */

function doGet(e) {

  var page =
    e &&
    e.parameter &&
    e.parameter.page
      ? String(
          e.parameter.page
        )
      : 'dashboard';


  if (
    page === 'receipt' &&
    typeof renderReceiptPage_ ===
      'function'
  ) {

    return renderReceiptPage_(
      e
    );

  }


  return HtmlService
    .createHtmlOutputFromFile(
      'Dashboard'
    )
    .setTitle(
      DASHBOARD_CONFIG.TITLE
    )
    .addMetaTag(
      'viewport',
      'width=device-width, initial-scale=1'
    );

}


/* ==========================================================
 * جلب بيانات لوحة التحكم
 * ==========================================================
 */

function getDashboardData(filters) {

  filters =
    filters || {};


  var spreadsheet =
    appActiveSpreadsheet();


  var records =
    dashboardReadOperations_(
      spreadsheet
    );


  var now =
    new Date();


  var datePeriod =
    dashboardResolvePeriod_(
      filters,
      now
    );


  var currentRecords =
    dashboardFilterRecords_(

      records,

      filters,

      datePeriod

    );


  var previousPeriod =
    dashboardPreviousPeriod_(
      datePeriod
    );


  var previousRecords =
    previousPeriod

      ? dashboardFilterRecords_(

          records,

          filters,

          previousPeriod

        )

      : [];


  var summary =
    dashboardBuildSummary_(

      currentRecords,

      datePeriod

    );


  var previousSummary =
    dashboardBuildSummary_(

      previousRecords,

      previousPeriod

    );


  var comparison =
    dashboardBuildComparison_(

      summary,

      previousSummary,

      Boolean(
        previousPeriod
      )

    );


  var expenseRecords =
    currentRecords.filter(
      dashboardIsExpense_
    );


  return {

    generatedAt:
      Utilities.formatDate(

        now,

        DASHBOARD_CONFIG.TIME_ZONE,

        'dd/MM/yyyy HH:mm:ss'

      ),


    sheetUrl:
      spreadsheet.getUrl(),


    period: {

      label:
        dashboardPeriodLabel_(
          filters.period ||
          'this_month'
        ),

      start:
        datePeriod &&
        datePeriod.start

          ? dashboardFormatDate_(
              datePeriod.start
            )

          : '',

      end:
        datePeriod &&
        datePeriod.end

          ? dashboardFormatDate_(
              datePeriod.end
            )

          : ''

    },


    summary:
      summary,


    comparison:
      comparison,


    filters:
      dashboardBuildFilterOptions_(
        records
      ),


    classificationChart:
      dashboardAggregate_(

        expenseRecords,

        'category',

        12

      ),


    categoryChart:
      dashboardAggregate_(

        expenseRecords,

        'category',

        12

      ),


    spendingPeriodChart:
      dashboardAggregate_(

        expenseRecords,

        'spendingPeriod',

        12

      ),


    scopeChart:
      dashboardAggregate_(

        expenseRecords,

        'scope',

        12

      ),


    analyticBreakdown:
      dashboardBuildAnalyticBreakdown_(
        expenseRecords
      ),


    itemsChart:
      dashboardAggregate_(

        expenseRecords,

        'item',

        10

      ),


    banksChart:
      dashboardAggregate_(

        expenseRecords,

        'bank',

        10

      ),


    monthlyTrend:
      dashboardBuildMonthlyTrend_(
        currentRecords
      ),


    heatmap:
      dashboardBuildHeatmap_(
        expenseRecords
      ),


    activeItems:
      dashboardBuildActiveItems_(
        expenseRecords
      ),


    recommendations:
      dashboardBuildRecommendations_(

        summary,

        comparison

      ),


    counts: {

      displayed:
        currentRecords.length,

      all:
        records.length,

      expenses:
        expenseRecords.length,

      excluded:
        currentRecords.filter(
          function(record) {

            return (
              record.direction ===
              'neutral'
            );

          }
        ).length

    }

  };

}


/* ==========================================================
 * قراءة ورقة العمليات
 * ==========================================================
 */

function dashboardReadOperations_(
  spreadsheet
) {

  var sheet =
    spreadsheet.getSheetByName(
      DASHBOARD_CONFIG.OPERATIONS_SHEET
    );


  if (!sheet) {

    throw new Error(

      'لم يتم العثور على ورقة: ' +
      DASHBOARD_CONFIG.OPERATIONS_SHEET

    );

  }


  var lastRow =
    sheet.getLastRow();


  var lastColumn =
    sheet.getLastColumn();


  if (
    lastRow < 2 ||
    lastColumn < 1
  ) {

    return [];

  }


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
      dashboardText_
    );


  var columns = {

    id:
      dashboardFindColumn_(
        headers,
        ['معرف الرسالة']
      ),

    date:
      dashboardFindColumn_(
        headers,
        ['التاريخ والوقت']
      ),

    item:
      dashboardFindColumn_(
        headers,
        ['البند']
      ),

    legacyClassification:
      dashboardFindColumn_(
        headers,
        ['التصنيف']
      ),

    amount:
      dashboardFindColumn_(
        headers,
        ['المبلغ']
      ),

    party:
      dashboardFindColumn_(
        headers,
        ['الطرف']
      ),

    type:
      dashboardFindColumn_(
        headers,
        ['نوع العملية']
      ),

    channel:
      dashboardFindColumn_(
        headers,
        ['قناة العملية']
      ),

    bank:
      dashboardFindColumn_(
        headers,
        ['البنك']
      ),

    system:
      dashboardFindColumn_(
        headers,
        ['النظام']
      ),

    status:
      dashboardFindColumn_(
        headers,
        ['حالة التسجيل']
      ),

    category:
      dashboardFindColumn_(
        headers,
        ['الفئة']
      ),

    spendingPeriod:
      dashboardFindColumn_(
        headers,
        ['الفترة']
      ),

    scope:
      dashboardFindColumn_(
        headers,
        ['الصنف']
      )

  };


  var requiredColumns = [

    columns.date,
    columns.item,
    columns.amount,
    columns.category,
    columns.spendingPeriod,
    columns.scope

  ];


  if (
    requiredColumns.some(
      function(column) {

        return column < 0;

      }
    )
  ) {

    throw new Error(

      'عناوين ورقة العمليات غير مكتملة. ' +
      'تحقق من وجود: التاريخ والوقت، البند، المبلغ، الفئة، الفترة، الصنف.'

    );

  }


  return values
    .slice(1)
    .map(
      function(row) {

        var category =
          dashboardText_(
            dashboardCell_(
              row,
              columns.category
            )
          );


        var spendingPeriod =
          dashboardText_(
            dashboardCell_(
              row,
              columns.spendingPeriod
            )
          );


        var scope =
          dashboardText_(
            dashboardCell_(
              row,
              columns.scope
            )
          );


        var record = {

          id:
            dashboardCell_(
              row,
              columns.id
            ),

          date:
            dashboardParseDate_(
              dashboardCell_(
                row,
                columns.date
              )
            ),

          item:
            dashboardText_(
              dashboardCell_(
                row,
                columns.item
              )
            ) ||
            'غير محدد',

          legacyClassification:
            dashboardText_(
              dashboardCell_(
                row,
                columns.legacyClassification
              )
            ),

          category:
            category ||
            'غير محدد',

          spendingPeriod:
            spendingPeriod ||
            'غير محدد',

          scope:
            scope ||
            'غير محدد',

          classification:
            category ||
            'غير محدد',

          amount:
            Math.abs(
              dashboardNumber_(
                dashboardCell_(
                  row,
                  columns.amount
                )
              )
            ),

          party:
            dashboardText_(
              dashboardCell_(
                row,
                columns.party
              )
            ) ||
            'غير محدد',

          type:
            dashboardText_(
              dashboardCell_(
                row,
                columns.type
              )
            ),

          channel:
            dashboardText_(
              dashboardCell_(
                row,
                columns.channel
              )
            ) ||
            'غير محدد',

          bank:
            dashboardText_(
              dashboardCell_(
                row,
                columns.bank
              )
            ) ||
            'غير محدد',

          system:
            dashboardText_(
              dashboardCell_(
                row,
                columns.system
              )
            ) ||
            'غير محدد',

          status:
            dashboardText_(
              dashboardCell_(
                row,
                columns.status
              )
            )

        };


        record.direction =
          dashboardDirection_(
            record
          );


        return record;

      }
    )
    .filter(
      function(record) {

        return (

          record.date instanceof Date &&

          !isNaN(
            record.date.getTime()
          ) &&

          Number.isFinite(
            record.amount
          ) &&

          record.amount > 0

        );

      }
    );

}


/* ==========================================================
 * تحديد الفترة
 * ==========================================================
 */

function dashboardResolvePeriod_(
  filters,
  now
) {

  var preset =
    String(
      filters.period ||
      'this_month'
    );


  var start =
    null;


  var end =
    dashboardEndOfDay_(
      new Date(
        now
      )
    );


  if (
    preset === 'all'
  ) {

    return {
      start: null,
      end: null
    };

  }


  if (
    preset === 'custom'
  ) {

    start =
      dashboardParseFilterDate_(
        filters.startDate,
        false
      );


    end =
      dashboardParseFilterDate_(
        filters.endDate,
        true
      );


    if (
      !start ||
      !end
    ) {

      throw new Error(
        'حدد تاريخ البداية والنهاية.'
      );

    }


    if (
      start.getTime() >
      end.getTime()
    ) {

      throw new Error(
        'تاريخ البداية يجب أن يسبق تاريخ النهاية.'
      );

    }


    return {
      start: start,
      end: end
    };

  }


  if (
    preset === 'last_month'
  ) {

    start =
      new Date(
        now.getFullYear(),
        now.getMonth() - 1,
        1
      );


    end =
      dashboardEndOfDay_(

        new Date(
          now.getFullYear(),
          now.getMonth(),
          0
        )

      );

  }


  else if (
    preset === 'three_months'
  ) {

    start =
      new Date(
        now.getFullYear(),
        now.getMonth() - 2,
        1
      );

  }


  else if (
    preset === 'six_months'
  ) {

    start =
      new Date(
        now.getFullYear(),
        now.getMonth() - 5,
        1
      );

  }


  else if (
    preset === 'this_year'
  ) {

    start =
      new Date(
        now.getFullYear(),
        0,
        1
      );

  }


  else {

    start =
      new Date(
        now.getFullYear(),
        now.getMonth(),
        1
      );

  }


  return {

    start:
      start,

    end:
      end

  };

}


/* ==========================================================
 * الفترة السابقة
 * ==========================================================
 */

function dashboardPreviousPeriod_(
  period
) {

  if (
    !period ||
    !period.start ||
    !period.end
  ) {

    return null;

  }


  var duration =
    period.end.getTime() -
    period.start.getTime() +
    1;


  var previousEnd =
    new Date(
      period.start.getTime() -
      1
    );


  var previousStart =
    new Date(
      previousEnd.getTime() -
      duration +
      1
    );


  return {

    start:
      previousStart,

    end:
      previousEnd

  };

}


/* ==========================================================
 * تصفية العمليات
 * ==========================================================
 */

function dashboardFilterRecords_(
  records,
  filters,
  period
) {

  var selectedBank =
    dashboardText_(
      filters.bank
    );


  var selectedSystem =
    dashboardText_(
      filters.system
    );


  var selectedCategory =
    dashboardText_(

      filters.category ||
      filters.classification

    );


  var selectedSpendingPeriod =
    dashboardText_(
      filters.spendingPeriod
    );


  var selectedScope =
    dashboardText_(
      filters.scope
    );


  var selectedItem =
    dashboardText_(
      filters.item
    );


  return records.filter(
    function(record) {

      if (
        period &&
        period.start &&
        record.date <
          period.start
      ) {

        return false;

      }


      if (
        period &&
        period.end &&
        record.date >
          period.end
      ) {

        return false;

      }


      if (
        selectedBank &&
        selectedBank !== 'all' &&
        record.bank !==
          selectedBank
      ) {

        return false;

      }


      if (
        selectedSystem &&
        selectedSystem !== 'all' &&
        record.system !==
          selectedSystem
      ) {

        return false;

      }


      if (
        selectedCategory &&
        selectedCategory !== 'all' &&
        record.category !==
          selectedCategory
      ) {

        return false;

      }


      if (
        selectedSpendingPeriod &&
        selectedSpendingPeriod !== 'all' &&
        record.spendingPeriod !==
          selectedSpendingPeriod
      ) {

        return false;

      }


      if (
        selectedScope &&
        selectedScope !== 'all' &&
        record.scope !==
          selectedScope
      ) {

        return false;

      }


      if (
        selectedItem &&
        selectedItem !== 'all' &&
        record.item !==
          selectedItem
      ) {

        return false;

      }


      return true;

    }
  );

}


/* ==========================================================
 * المؤشرات الرئيسية
 * ==========================================================
 */

function dashboardBuildSummary_(
  records,
  period
) {

  var incomeRecords =
    records.filter(
      dashboardIsIncome_
    );


  var expenseRecords =
    records.filter(
      dashboardIsExpense_
    );


  var income =
    dashboardSum_(
      incomeRecords
    );


  var expense =
    dashboardSum_(
      expenseRecords
    );


  var net =
    income -
    expense;


  var expenseCount =
    expenseRecords.length;


  var averageTransaction =
    expenseCount > 0
      ? expense /
        expenseCount
      : 0;


  var days =
    dashboardPeriodDays_(
      records,
      period
    );


  var averageDaily =
    days > 0
      ? expense /
        days
      : 0;


  var savingsRate =
    income > 0
      ? (
          net /
          income
        ) * 100
      : null;


  var categories =
    dashboardAggregate_(
      expenseRecords,
      'category',
      1000
    );


  var spendingPeriods =
    dashboardAggregate_(
      expenseRecords,
      'spendingPeriod',
      1000
    );


  var scopes =
    dashboardAggregate_(
      expenseRecords,
      'scope',
      1000
    );


  var items =
    dashboardAggregate_(
      expenseRecords,
      'item',
      1000
    );


  var topThreeAmount =
    items
      .slice(
        0,
        3
      )
      .reduce(
        function(
          total,
          row
        ) {

          return (
            total +
            row.amount
          );

        },
        0
      );


  var weekendAmount =
    expenseRecords
      .filter(
        function(record) {

          var day =
            dashboardDayIndex_(
              record.date
            );


          return (
            day === 5 ||
            day === 6
          );

        }
      )
      .reduce(
        function(
          total,
          record
        ) {

          return (
            total +
            record.amount
          );

        },
        0
      );


  var nightAmount =
    expenseRecords
      .filter(
        function(record) {

          var hour =
            dashboardHour_(
              record.date
            );


          return (
            hour >= 21 ||
            hour < 6
          );

        }
      )
      .reduce(
        function(
          total,
          record
        ) {

          return (
            total +
            record.amount
          );

        },
        0
      );


  return {

    income:
      dashboardRound_(
        income
      ),

    expense:
      dashboardRound_(
        expense
      ),

    net:
      dashboardRound_(
        net
      ),

    averageDaily:
      dashboardRound_(
        averageDaily
      ),

    averageTransaction:
      dashboardRound_(
        averageTransaction
      ),

    savingsRate:
      savingsRate === null
        ? null
        : dashboardRound_(
            savingsRate
          ),

    transactionCount:
      expenseCount,

    incomeCount:
      incomeRecords.length,

    neutralCount:
      records.filter(
        function(record) {

          return (
            record.direction ===
            'neutral'
          );

        }
      ).length,

    topCategory:
      categories.length
        ? categories[0].name
        : 'لا توجد بيانات',

    topCategoryAmount:
      categories.length
        ? categories[0].amount
        : 0,

    topSpendingPeriod:
      spendingPeriods.length
        ? spendingPeriods[0].name
        : 'لا توجد بيانات',

    topSpendingPeriodAmount:
      spendingPeriods.length
        ? spendingPeriods[0].amount
        : 0,

    topScope:
      scopes.length
        ? scopes[0].name
        : 'لا توجد بيانات',

    topScopeAmount:
      scopes.length
        ? scopes[0].amount
        : 0,

    topClassification:
      categories.length
        ? categories[0].name
        : 'لا توجد بيانات',

    topClassificationAmount:
      categories.length
        ? categories[0].amount
        : 0,

    topItem:
      items.length
        ? items[0].name
        : 'لا توجد بيانات',

    topItemAmount:
      items.length
        ? items[0].amount
        : 0,

    concentration:
      expense > 0

        ? dashboardRound_(

            (
              topThreeAmount /
              expense
            ) * 100

          )

        : 0,

    weekendShare:
      expense > 0

        ? dashboardRound_(

            (
              weekendAmount /
              expense
            ) * 100

          )

        : 0,

    nightShare:
      expense > 0

        ? dashboardRound_(

            (
              nightAmount /
              expense
            ) * 100

          )

        : 0

  };

}


/* ==========================================================
 * مقارنة الفترة السابقة
 * ==========================================================
 */

function dashboardBuildComparison_(
  current,
  previous,
  enabled
) {

  if (!enabled) {

    return {
      available: false
    };

  }


  return {

    available:
      true,

    expense:
      dashboardChangePercent_(
        current.expense,
        previous.expense
      ),

    income:
      dashboardChangePercent_(
        current.income,
        previous.income
      ),

    net:
      dashboardChangePercent_(
        current.net,
        previous.net
      ),

    averageDaily:
      dashboardChangePercent_(
        current.averageDaily,
        previous.averageDaily
      ),

    averageTransaction:
      dashboardChangePercent_(
        current.averageTransaction,
        previous.averageTransaction
      ),

    transactionCount:
      dashboardChangePercent_(
        current.transactionCount,
        previous.transactionCount
      ),

    previousExpense:
      previous.expense,

    previousIncome:
      previous.income

  };

}


/* ==========================================================
 * التجميع
 * ==========================================================
 */

function dashboardAggregate_(
  records,
  property,
  limit
) {

  var map = {};


  records.forEach(
    function(record) {

      var name =
        dashboardText_(
          record[property]
        ) ||
        'غير محدد';


      if (
        !map[name]
      ) {

        map[name] = {

          name:
            name,

          amount:
            0,

          count:
            0

        };

      }


      map[name].amount +=
        record.amount;


      map[name].count++;

    }
  );


  return Object.keys(
    map
  )
    .map(
      function(key) {

        return {

          name:
            map[key].name,

          amount:
            dashboardRound_(
              map[key].amount
            ),

          count:
            map[key].count

        };

      }
    )
    .sort(
      function(
        first,
        second
      ) {

        return (
          second.amount -
          first.amount
        );

      }
    )
    .slice(
      0,
      limit || 10
    );

}


/* ==========================================================
 * التقاطعات التحليلية
 * ==========================================================
 */

function dashboardBuildAnalyticBreakdown_(
  records
) {

  var map = {};


  records.forEach(
    function(record) {

      var category =
        dashboardText_(
          record.category
        ) ||
        'غير محدد';


      var spendingPeriod =
        dashboardText_(
          record.spendingPeriod
        ) ||
        'غير محدد';


      var scope =
        dashboardText_(
          record.scope
        ) ||
        'غير محدد';


      var key =
        category +
        '|' +
        spendingPeriod +
        '|' +
        scope;


      if (
        !map[key]
      ) {

        map[key] = {

          category:
            category,

          spendingPeriod:
            spendingPeriod,

          scope:
            scope,

          amount:
            0,

          count:
            0

        };

      }


      map[key].amount +=
        record.amount;


      map[key].count++;

    }
  );


  return Object.keys(
    map
  )
    .map(
      function(key) {

        return {

          category:
            map[key].category,

          spendingPeriod:
            map[key].spendingPeriod,

          scope:
            map[key].scope,

          amount:
            dashboardRound_(
              map[key].amount
            ),

          count:
            map[key].count

        };

      }
    )
    .sort(
      function(
        first,
        second
      ) {

        return (
          second.amount -
          first.amount
        );

      }
    );

}


/* ==========================================================
 * الاتجاه الشهري
 * ==========================================================
 */

function dashboardBuildMonthlyTrend_(
  records
) {

  var months = {};


  records.forEach(
    function(record) {

      if (
        record.direction !== 'income' &&
        record.direction !== 'expense'
      ) {

        return;

      }


      var key =
        Utilities.formatDate(

          record.date,

          DASHBOARD_CONFIG.TIME_ZONE,

          'yyyy-MM'

        );


      if (
        !months[key]
      ) {

        months[key] = {

          month:
            key,

          income:
            0,

          expense:
            0

        };

      }


      months[key][
        record.direction
      ] +=
        record.amount;

    }
  );


  return Object.keys(
    months
  )
    .sort()
    .map(
      function(key) {

        return {

          month:
            key.substring(
              5,
              7
            ) +
            '/' +
            key.substring(
              0,
              4
            ),

          income:
            dashboardRound_(
              months[key].income
            ),

          expense:
            dashboardRound_(
              months[key].expense
            )

        };

      }
    );

}


/* ==========================================================
 * خريطة وقت الشراء
 * ==========================================================
 */

function dashboardBuildHeatmap_(
  records
) {

  var days = [

    'الأحد',
    'الاثنين',
    'الثلاثاء',
    'الأربعاء',
    'الخميس',
    'الجمعة',
    'السبت'

  ];


  var blocks = [

    {
      label: '00–05',
      from: 0,
      to: 5
    },

    {
      label: '06–09',
      from: 6,
      to: 9
    },

    {
      label: '10–13',
      from: 10,
      to: 13
    },

    {
      label: '14–17',
      from: 14,
      to: 17
    },

    {
      label: '18–21',
      from: 18,
      to: 21
    },

    {
      label: '22–23',
      from: 22,
      to: 23
    }

  ];


  var matrix =
    days.map(
      function() {

        return blocks.map(
          function() {

            return 0;

          }
        );

      }
    );


  records.forEach(
    function(record) {

      var day =
        dashboardDayIndex_(
          record.date
        );


      var hour =
        dashboardHour_(
          record.date
        );


      var blockIndex =
        blocks.findIndex(
          function(block) {

            return (
              hour >= block.from &&
              hour <= block.to
            );

          }
        );


      if (
        blockIndex >= 0
      ) {

        matrix[
          day
        ][
          blockIndex
        ] +=
          record.amount;

      }

    }
  );


  var maximum =
    0;


  matrix.forEach(
    function(row) {

      row.forEach(
        function(value) {

          maximum =
            Math.max(
              maximum,
              value
            );

        }
      );

    }
  );


  return {

    days:
      days,

    blocks:
      blocks.map(
        function(block) {

          return block.label;

        }
      ),

    values:
      matrix.map(
        function(row) {

          return row.map(
            dashboardRound_
          );

        }
      ),

    maximum:
      dashboardRound_(
        maximum
      )

  };

}


/* ==========================================================
 * البنود الأكثر نشاطًا
 * ==========================================================
 */

function dashboardBuildActiveItems_(
  records
) {

  var map = {};


  records.forEach(
    function(record) {

      var key =
        record.item;


      if (
        !map[key]
      ) {

        map[key] = {

          item:
            record.item,

          category:
            record.category,

          spendingPeriod:
            record.spendingPeriod,

          scope:
            record.scope,

          amount:
            0,

          count:
            0,

          lastDate:
            record.date

        };

      }


      map[key].amount +=
        record.amount;


      map[key].count++;


      if (
        record.date >
        map[key].lastDate
      ) {

        map[key].lastDate =
          record.date;

      }

    }
  );


  return Object.keys(
    map
  )
    .map(
      function(key) {

        var item =
          map[key];


        return {

          item:
            item.item,

          category:
            item.category,

          spendingPeriod:
            item.spendingPeriod,

          scope:
            item.scope,

          classification:
            item.category,

          amount:
            dashboardRound_(
              item.amount
            ),

          count:
            item.count,

          average:
            dashboardRound_(

              item.amount /
              item.count

            ),

          lastDate:
            Utilities.formatDate(

              item.lastDate,

              DASHBOARD_CONFIG.TIME_ZONE,

              'dd/MM/yyyy'

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
          second.amount -
          first.amount
        );

      }
    )
    .slice(
      0,
      10
    );

}


/* ==========================================================
 * التوصيات
 * ==========================================================
 */

function dashboardBuildRecommendations_(
  summary,
  comparison
) {

  var recommendations =
    [];


  if (
    summary.transactionCount === 0
  ) {

    recommendations.push({

      level:
        'info',

      title:
        'لا توجد مصروفات في الفترة المحددة',

      text:
        'غيّر الفترة أو تحقق من تصنيفات Gmail ودليل البنود.'

    });


    return recommendations;

  }


  if (
    comparison.available &&
    comparison.expense !== null &&
    comparison.expense > 10
  ) {

    recommendations.push({

      level:
        'danger',

      title:
        'ارتفاع المصروفات',

      text:
        'زادت المصروفات بنسبة ' +

        dashboardRound_(
          comparison.expense
        ) +

        '% مقارنة بالفترة السابقة.'

    });

  }


  if (
    summary.concentration >= 50
  ) {

    recommendations.push({

      level:
        'warning',

      title:
        'تركيز مرتفع للإنفاق',

      text:
        summary.concentration +

        '% من المصروفات مركزة في أعلى ثلاثة بنود.'

    });

  }


  if (
    summary.weekendShare >= 35
  ) {

    recommendations.push({

      level:
        'warning',

      title:
        'إنفاق مرتفع في نهاية الأسبوع',

      text:
        summary.weekendShare +

        '% من المصروفات تمت يومي الجمعة والسبت.'

    });

  }


  if (
    summary.nightShare >= 20
  ) {

    recommendations.push({

      level:
        'warning',

      title:
        'مشتريات ليلية ملحوظة',

      text:
        summary.nightShare +

        '% من المصروفات تمت بين التاسعة مساءً والسادسة صباحًا.'

    });

  }


  if (
    summary.savingsRate !== null &&
    summary.savingsRate < 10
  ) {

    recommendations.push({

      level:
        'danger',

      title:
        'معدل الادخار منخفض',

      text:
        'معدل الادخار الحالي ' +

        summary.savingsRate +

        '%. راجع المصروفات غير الأساسية.'

    });

  }


  recommendations.push({

    level:
      'success',

    title:
      'البند الأعلى صرفًا',

    text:
      summary.topItem +

      ' بإجمالي ' +

      summary.topItemAmount.toFixed(
        3
      ) +

      ' ر.ع.'

  });


  return recommendations.slice(
    0,
    5
  );

}


/* ==========================================================
 * خيارات المرشحات
 * ==========================================================
 */

function dashboardBuildFilterOptions_(
  records
) {

  var categories =
    dashboardUnique_(
      records,
      'category'
    );


  return {

    banks:
      dashboardUnique_(
        records,
        'bank'
      ),

    systems:
      dashboardUnique_(
        records,
        'system'
      ),

    classifications:
      categories,

    categories:
      categories,

    spendingPeriods:
      dashboardUnique_(
        records,
        'spendingPeriod'
      ),

    scopes:
      dashboardUnique_(
        records,
        'scope'
      ),

    items:
      dashboardUnique_(
        records,
        'item'
      )

  };

}


/* ==========================================================
 * اتجاه العملية
 * ==========================================================
 */

function dashboardDirection_(
  record
) {

  var status =
    dashboardNormalize_(
      record.status
    );


  var combined =
    dashboardNormalize_(

      [

        record.item,
        record.category,
        record.spendingPeriod,
        record.scope,
        record.type,
        record.system,
        record.status

      ].join(
        ' '
      )

    );


  if (

    status.includes(
      'مستبعد'
    ) ||

    combined.includes(
      'تحويل داخلي'
    ) ||

    combined.includes(
      'تحويل بنكي مرتجع'
    ) ||

    combined.includes(
      'تحويل بنكي فاشل'
    ) ||

    combined.includes(
      'خصم مؤقت'
    ) ||

    combined.includes(
      'التسويات'
    )

  ) {

    return 'neutral';

  }


  if (
    dashboardContainsAny_(

      combined,

      [

        'وارد',
        'دخل',
        'راتب',
        'تحويل وارد',
        'إيداع',
        'استلام إيجار',
        'إيراد',
        'income'

      ]

    )
  ) {

    return 'income';

  }


  if (
    dashboardContainsAny_(

      combined,

      [

        'مصروف',
        'شراء',
        'خصم',
        'دفع',
        'سحب',
        'فاتورة',
        'تحويل صادر',
        'expense',
        'debit',
        'pos'

      ]

    )
  ) {

    return 'expense';

  }


  return 'neutral';

}


/* ==========================================================
 * مساعدات التحليل
 * ==========================================================
 */

function dashboardIsIncome_(
  record
) {

  return (
    record.direction ===
    'income'
  );

}


function dashboardIsExpense_(
  record
) {

  return (
    record.direction ===
    'expense'
  );

}


function dashboardSum_(
  records
) {

  return records.reduce(
    function(
      total,
      record
    ) {

      return (
        total +
        record.amount
      );

    },
    0
  );

}


function dashboardPeriodDays_(
  records,
  period
) {

  if (
    period &&
    period.start &&
    period.end
  ) {

    return Math.max(

      1,

      Math.ceil(

        (
          period.end.getTime() -
          period.start.getTime()
        ) /

        86400000

      )

    );

  }


  if (
    !records.length
  ) {

    return 1;

  }


  var times =
    records.map(
      function(record) {

        return record.date.getTime();

      }
    );


  return Math.max(

    1,

    Math.ceil(

      (
        Math.max.apply(
          null,
          times
        ) -

        Math.min.apply(
          null,
          times
        )
      ) /

      86400000

    ) +

    1

  );

}


function dashboardChangePercent_(
  current,
  previous
) {

  if (
    previous === 0 ||
    previous === null ||
    previous === undefined
  ) {

    return current === 0
      ? 0
      : null;

  }


  return dashboardRound_(

    (
      (
        current -
        previous
      ) /

      Math.abs(
        previous
      )
    ) *

    100

  );

}


function dashboardUnique_(
  records,
  property
) {

  return Array.from(

    new Set(

      records
        .map(
          function(record) {

            return dashboardText_(
              record[property]
            );

          }
        )
        .filter(
          function(value) {

            return (
              Boolean(
                value
              ) &&
              value !==
                'غير محدد'
            );

          }
        )

    )

  )
    .sort(
      function(
        first,
        second
      ) {

        return first.localeCompare(
          second,
          'ar'
        );

      }
    );

}


function dashboardFindColumn_(
  headers,
  names
) {

  for (
    var index = 0;
    index < names.length;
    index++
  ) {

    var position =
      headers.indexOf(
        names[index]
      );


    if (
      position >= 0
    ) {

      return position;

    }

  }


  return -1;

}


function dashboardCell_(
  row,
  index
) {

  return index >= 0
    ? row[index]
    : '';

}


function dashboardText_(
  value
) {

  return String(

    value === null ||
    value === undefined

      ? ''

      : value

  ).trim();

}


function dashboardNormalize_(
  value
) {

  return dashboardText_(
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
    );

}


function dashboardContainsAny_(
  text,
  terms
) {

  return terms.some(
    function(term) {

      return text.includes(
        dashboardNormalize_(
          term
        )
      );

    }
  );

}


function dashboardNumber_(
  value
) {

  if (
    typeof value ===
    'number'
  ) {

    return Number.isFinite(
      value
    )
      ? value
      : 0;

  }


  var text =
    dashboardLatinDigits_(
      dashboardText_(
        value
      )
    )
      .replace(
        /,/g,
        ''
      )
      .replace(
        /[^\d.-]/g,
        ''
      );


  var number =
    Number(
      text
    );


  return Number.isFinite(
    number
  )
    ? number
    : 0;

}


function dashboardLatinDigits_(
  text
) {

  var arabic =
    '٠١٢٣٤٥٦٧٨٩';


  var persian =
    '۰۱۲۳۴۵۶۷۸۹';


  return String(
    text
  )
    .replace(
      /[٠-٩]/g,
      function(digit) {

        return arabic.indexOf(
          digit
        );

      }
    )
    .replace(
      /[۰-۹]/g,
      function(digit) {

        return persian.indexOf(
          digit
        );

      }
    );

}


function dashboardParseDate_(
  value
) {

  if (
    value instanceof Date &&
    !isNaN(
      value.getTime()
    )
  ) {

    return new Date(
      value.getTime()
    );

  }


  var text =
    dashboardLatinDigits_(
      dashboardText_(
        value
      )
    );


  if (
    !text
  ) {

    return null;

  }


  var direct =
    new Date(
      text
    );


  if (
    !isNaN(
      direct.getTime()
    )
  ) {

    return direct;

  }


  var match =
    text.match(

      /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/

    );


  if (
    !match
  ) {

    return null;

  }


  return new Date(

    Number(
      match[3]
    ),

    Number(
      match[2]
    ) - 1,

    Number(
      match[1]
    ),

    Number(
      match[4] || 0
    ),

    Number(
      match[5] || 0
    ),

    Number(
      match[6] || 0
    )

  );

}


function dashboardParseFilterDate_(
  value,
  endOfDay
) {

  var text =
    dashboardText_(
      value
    );


  var match =
    text.match(
      /^(\d{4})-(\d{2})-(\d{2})$/
    );


  if (
    !match
  ) {

    return null;

  }


  var date =
    new Date(

      Number(
        match[1]
      ),

      Number(
        match[2]
      ) - 1,

      Number(
        match[3]
      )

    );


  return endOfDay

    ? dashboardEndOfDay_(
        date
      )

    : date;

}


function dashboardEndOfDay_(
  date
) {

  var result =
    new Date(
      date
    );


  result.setHours(
    23,
    59,
    59,
    999
  );


  return result;

}


function dashboardFormatDate_(
  date
) {

  return Utilities.formatDate(

    date,

    DASHBOARD_CONFIG.TIME_ZONE,

    'yyyy-MM-dd'

  );

}


function dashboardRound_(
  value
) {

  return Math.round(

    Number(
      value || 0
    ) *

    1000

  ) /

  1000;

}


function dashboardDayIndex_(
  date
) {

  var isoDay =
    Number(

      Utilities.formatDate(

        date,

        DASHBOARD_CONFIG.TIME_ZONE,

        'u'

      )

    );


  return isoDay % 7;

}


function dashboardHour_(
  date
) {

  return Number(

    Utilities.formatDate(

      date,

      DASHBOARD_CONFIG.TIME_ZONE,

      'H'

    )

  );

}


function dashboardPeriodLabel_(
  value
) {

  var labels = {

    this_month:
      'هذا الشهر',

    last_month:
      'الشهر السابق',

    three_months:
      'آخر 3 أشهر',

    six_months:
      'آخر 6 أشهر',

    this_year:
      'هذه السنة',

    all:
      'جميع الفترات',

    custom:
      'فترة مخصصة'

  };


  return (
    labels[value] ||
    labels.this_month
  );

}


/* ==========================================================
 * مزامنة تغييرات أسماء البنود
 * ==========================================================
 *
 * هذه الخطوة تسبق syncGmailLabelsToGuide().
 *
 * إذا تغير اسم Gmail Label مع بقاء Label ID نفسه:
 *
 * 1. يتم اكتشاف الاسم الجديد.
 * 2. يتحدث دليل البنود.
 * 3. تتحدث العمليات التاريخية بالاسم الجديد.
 * ==========================================================
 */

function dashboardSyncRenamedItems_() {

  var result = {

    available:
      false,

    checked:
      0,

    renamed:
      0,

    operationsUpdated:
      0,

    success:
      true

  };


  if (
    typeof syncItemDirectoryNamesFromGmail !==
    'function'
  ) {

    result.message =
      'محرك مزامنة أسماء البنود غير متوفر.';


    return result;

  }


  try {

    var syncResult =
      syncItemDirectoryNamesFromGmail() ||
      {};


    result.available =
      true;


    result.checked =
      Number(
        syncResult.checked
      ) || 0;


    result.renamed =
      Number(
        syncResult.renamed
      ) || 0;


    result.operationsUpdated =
      Number(

        syncResult.operationsUpdated !==
          undefined

          ? syncResult.operationsUpdated

          : syncResult.updatedOperations

      ) || 0;


    result.result =
      syncResult;


    result.message =

      'تم فحص أسماء البنود' +

      ' | تغير أسماء: ' +
      result.renamed +

      ' | عمليات تاريخية محدثة: ' +
      result.operationsUpdated;


    return result;


  } catch (error) {

    result.success =
      false;


    result.message =
      'تعذر تحديث أسماء البنود: ' +
      dashboardSyncError_(
        error
      );


    throw error;

  }

}


/* ==========================================================
 * تحديث التصنيفات والبنود
 * ==========================================================
 */

function dashboardSyncLabels() {

  var lock =
    LockService.getScriptLock();


  if (
    !lock.tryLock(
      DASHBOARD_CONFIG
        .SYNC_LOCK_WAIT_MS
    )
  ) {

    return {

      success:
        false,

      busy:
        true,

      message:
        'هناك عملية مزامنة أخرى تعمل حاليًا.'

    };

  }


  try {

    var startedAt =
      new Date();


    /*
     * 1. معالجة تغيير الأسماء أولًا.
     */
    var renameResult =
      dashboardSyncRenamedItems_();


    /*
     * 2. تحديث قائمة Gmail Labels.
     */
    var labelsResult =
      syncGmailLabelsToGuide() ||
      {};


    SpreadsheetApp.flush();


    var completedAt =
      new Date();


    var durationSeconds =
      Math.round(

        (
          completedAt.getTime() -
          startedAt.getTime()
        ) /

        1000

      );


    var renamed =
      Number(
        renameResult.renamed
      ) || 0;


    var operationsUpdated =
      Number(
        renameResult.operationsUpdated
      ) || 0;


    return {

      success:
        true,

      fast:
        true,

      renameSync:
        renameResult,

      labels:
        labelsResult,

      durationSeconds:
        durationSeconds,

      message:

        'تم تحديث التصنيفات' +

        ' | أسماء تغيرت: ' +
        renamed +

        ' | عمليات قديمة محدثة: ' +
        operationsUpdated +

        ' | جديد: ' +
        (
          Number(
            labelsResult.added
          ) || 0
        ) +

        ' | محذوف: ' +
        (
          Number(
            labelsResult.deleted
          ) || 0
        ) +

        ' | الوقت: ' +
        durationSeconds +
        ' ث',

      result:
        labelsResult

    };


  } catch (error) {

    return {

      success:
        false,

      message:
        'فشل تحديث التصنيفات: ' +
        dashboardSyncError_(
          error
        )

    };


  } finally {

    lock.releaseLock();

  }

}


/* ==========================================================
 * تحديث العمليات السريع
 * ==========================================================
 */

function dashboardSyncOperations() {

  var lock =
    LockService.getScriptLock();


  if (
    !lock.tryLock(
      DASHBOARD_CONFIG
        .SYNC_LOCK_WAIT_MS
    )
  ) {

    return {

      success:
        false,

      busy:
        true,

      message:
        'هناك مزامنة أخرى تعمل حاليًا. حاول مرة أخرى بعد قليل.'

    };

  }


  try {

    var startedAt =
      new Date();


    var result;


    if (
      typeof operationsRegisterFastDetailed ===
      'function'
    ) {

      result =
        operationsRegisterFastDetailed() ||
        {};

    }


    else {

      result =
        operationsRegisterAndReconcile() ||
        {};

    }


    if (
      result &&
      result.success ===
        false
    ) {

      return {

        success:
          false,

        fast:
          true,

        message:
          result.message ||
          'لم يكتمل تحديث العمليات.',

        result:
          result

      };

    }


    var completedAt =
      new Date();


    var durationSeconds =
      Math.round(

        (
          completedAt.getTime() -
          startedAt.getTime()
        ) /

        1000

      );


    var added =
      Number(
        result.added
      ) || 0;


    var known =
      Number(
        result.known
      ) || 0;


    var ignored =
      Number(
        result.ignored
      ) || 0;


    var failed =
      Number(
        result.failed
      ) || 0;


    var multiple =
      Number(
        result.multiple
      ) || 0;


    var message =

      'اكتمل تحديث العمليات' +

      ' | جديد: ' +
      added +

      ' | معروف: ' +
      known +

      ' | متجاهل: ' +
      ignored +

      ' | الوقت: ' +
      durationSeconds +
      ' ث';


    if (
      failed > 0
    ) {

      message +=
        ' | أخطاء: ' +
        failed;

    }


    if (
      multiple > 0
    ) {

      message +=
        ' | متعدد البنود: ' +
        multiple;

    }


    return {

      success:
        true,

      fast:
        typeof operationsRegisterFastDetailed ===
          'function',

      mode:
        result.mode ||
        'fast',

      durationSeconds:
        durationSeconds,

      message:
        message,

      result:
        result

    };


  } catch (error) {

    return {

      success:
        false,

      fast:
        true,

      message:
        'فشل تحديث العمليات: ' +
        dashboardSyncError_(
          error
        )

    };


  } finally {

    lock.releaseLock();

  }

}


/* ==========================================================
 * تحديث الكل السريع
 * ==========================================================
 *
 * الترتيب:
 *
 * 1. اكتشاف تغيير أسماء Gmail Labels.
 * 2. تحديث العمليات التاريخية بالاسم الجديد.
 * 3. تحديث دليل البنود.
 * 4. تسجيل العمليات الجديدة سريعًا.
 *
 * لا يشغل الصيانة الشاملة.
 * لا يعيد بناء الإيجارات.
 * ==========================================================
 */

function dashboardSyncAll() {

  var lock =
    LockService.getScriptLock();


  if (
    !lock.tryLock(
      DASHBOARD_CONFIG
        .SYNC_LOCK_WAIT_MS
    )
  ) {

    return {

      success:
        false,

      busy:
        true,

      message:
        'هناك مزامنة أخرى قيد التشغيل.'

    };

  }


  var startedAt =
    new Date();


  try {

    var renameResult =
      {};


    var labelsResult =
      {};


    var operationsResult =
      {};


    /*
     * 1. تغيير أسماء البنود.
     */
    renameResult =
      dashboardSyncRenamedItems_() ||
      {};


    /*
     * 2. تحديث دليل البنود.
     */
    labelsResult =
      syncGmailLabelsToGuide() ||
      {};


    /*
     * 3. تحديث العمليات الجديدة سريعًا.
     */
    if (
      typeof operationsRegisterFastDetailed ===
      'function'
    ) {

      operationsResult =
        operationsRegisterFastDetailed() ||
        {};

    }


    else {

      operationsResult =
        operationsRegisterAndReconcile() ||
        {};

    }


    if (
      operationsResult &&
      operationsResult.success ===
        false
    ) {

      return {

        success:
          false,

        fast:
          true,

        renameSync:
          renameResult,

        labels:
          labelsResult,

        operations:
          operationsResult,

        message:
          operationsResult.message ||
          'لم يكتمل تحديث العمليات.'

      };

    }


    SpreadsheetApp.flush();


    var completedAt =
      new Date();


    var durationSeconds =
      Math.round(

        (
          completedAt.getTime() -
          startedAt.getTime()
        ) /

        1000

      );


    var result = {

      success:
        true,

      fast:
        true,

      maintenance:
        false,

      renameSync:
        renameResult,

      labels:
        labelsResult,

      operations:
        operationsResult,

      rent: {

        rebuilt:
          false,

        message:
          'تحديث الإيجارات محفوظ للصيانة الشاملة.'

      },

      durationSeconds:
        durationSeconds,

      startedAt:
        Utilities.formatDate(

          startedAt,

          DASHBOARD_CONFIG.TIME_ZONE,

          'dd/MM/yyyy HH:mm:ss'

        ),

      completedAt:
        Utilities.formatDate(

          completedAt,

          DASHBOARD_CONFIG.TIME_ZONE,

          'dd/MM/yyyy HH:mm:ss'

        )

    };


    result.message =
      dashboardFastAllMessage_(
        result
      );


    console.log(

      JSON.stringify(
        result,
        null,
        2
      )

    );


    return result;


  } catch (error) {

    return {

      success:
        false,

      fast:
        true,

      message:
        'تعذر إكمال تحديث الكل: ' +
        dashboardSyncError_(
          error
        )

    };


  } finally {

    lock.releaseLock();

  }

}


/* ==========================================================
 * الصيانة الشاملة الثقيلة
 * ==========================================================
 */

function dashboardMaintenanceFullSync() {

  var lock =
    LockService.getScriptLock();


  if (
    !lock.tryLock(
      DASHBOARD_CONFIG
        .SYNC_LOCK_WAIT_MS
    )
  ) {

    return {

      success:
        false,

      busy:
        true,

      message:
        'هناك عملية أخرى تعمل حاليًا.'

    };

  }


  var startedAt =
    new Date();


  var result = {

    success:
      true,

    maintenance:
      true,

    labels:
      {},

    operations:
      {},

    rent:
      {}

  };


  try {

    /*
     * 1. تحديث البنود.
     */
    result.labels =
      syncGmailLabelsToGuide() ||
      {};


    /*
     * 2. الفحص الكامل للعمليات.
     */
    result.operations =
      operationsRegisterAndReconcile() ||
      {};


    /*
     * 3. إعادة بناء الإيجارات.
     */
    result.rent =
      dashboardRebuildRentData_();


    SpreadsheetApp.flush();


    var completedAt =
      new Date();


    result.durationSeconds =
      Math.round(

        (
          completedAt.getTime() -
          startedAt.getTime()
        ) /

        1000

      );


    result.startedAt =
      Utilities.formatDate(

        startedAt,

        DASHBOARD_CONFIG.TIME_ZONE,

        'dd/MM/yyyy HH:mm:ss'

      );


    result.completedAt =
      Utilities.formatDate(

        completedAt,

        DASHBOARD_CONFIG.TIME_ZONE,

        'dd/MM/yyyy HH:mm:ss'

      );


    result.message =
      dashboardMaintenanceMessage_(
        result
      );


    console.log(

      JSON.stringify(
        result,
        null,
        2
      )

    );


    return result;


  } catch (error) {

    result.success =
      false;


    result.message =
      'تعذر إكمال الصيانة الشاملة: ' +
      dashboardSyncError_(
        error
      );


    console.error(
      result.message,
      error
    );


    return result;


  } finally {

    lock.releaseLock();

  }

}


/* ==========================================================
 * إعادة بناء الإيجارات
 * ==========================================================
 */

function dashboardRebuildRentData_() {

  var result = {

    tenantLedger:
      false,

    rentSummary:
      false,

    errors:
      []

  };


  if (
    typeof tenantLedgerRebuild ===
    'function'
  ) {

    try {

      tenantLedgerRebuild();


      result.tenantLedger =
        true;

    } catch (error) {

      var ledgerError =
        dashboardSyncError_(
          error
        );


      result.errors.push(
        'سجل المستأجرين: ' +
        ledgerError
      );


      console.error(
        'تعذر تحديث سجل المستأجرين.',
        error
      );

    }

  }


  if (
    typeof rentSummaryRebuild ===
    'function'
  ) {

    try {

      rentSummaryRebuild();


      result.rentSummary =
        true;

    } catch (error) {

      var summaryError =
        dashboardSyncError_(
          error
        );


      result.errors.push(
        'ملخص الإيجارات: ' +
        summaryError
      );


      console.error(
        'تعذر تحديث ملخص الإيجارات.',
        error
      );

    }

  }


  return result;

}


/* ==========================================================
 * رسائل المزامنة
 * ==========================================================
 */

function dashboardFastAllMessage_(
  result
) {

  var labels =
    result.labels || {};


  var operations =
    result.operations || {};


  var renameSync =
    result.renameSync || {};


  return (

    'اكتمل تحديث الكل' +

    ' | أسماء تغيرت: ' +
    (
      Number(
        renameSync.renamed
      ) || 0
    ) +

    ' | عمليات قديمة محدثة: ' +
    (
      Number(
        renameSync.operationsUpdated
      ) || 0
    ) +

    ' | بنود جديدة: ' +
    (
      Number(
        labels.added
      ) || 0
    ) +

    ' | عمليات جديدة: ' +
    (
      Number(
        operations.added
      ) || 0
    ) +

    ' | عمليات معروفة: ' +
    (
      Number(
        operations.known
      ) || 0
    ) +

    ' | الوقت: ' +
    (
      Number(
        result.durationSeconds
      ) || 0
    ) +

    ' ث'

  );

}


function dashboardOperationsMessage_(
  result
) {

  result =
    result || {};


  return (

    'تمت مزامنة العمليات' +

    ' | جديد: ' +
    (
      Number(
        result.added
      ) || 0
    ) +

    ' | محدث: ' +
    (
      Number(
        result.updated
      ) || 0
    ) +

    ' | محذوف: ' +
    (
      Number(
        result.deleted
      ) || 0
    )

  );

}


/**
 * محفوظ للتوافق مع أي كود قديم.
 */
function dashboardFullSyncMessage_(
  result
) {

  return dashboardFastAllMessage_(
    result
  );

}


function dashboardMaintenanceMessage_(
  result
) {

  var labels =
    result.labels || {};


  var operations =
    result.operations || {};


  return (

    'اكتملت الصيانة الشاملة' +

    ' | بنود جديدة: ' +
    (
      Number(
        labels.added
      ) || 0
    ) +

    ' | عمليات جديدة: ' +
    (
      Number(
        operations.added
      ) || 0
    ) +

    ' | عمليات محدثة: ' +
    (
      Number(
        operations.updated
      ) || 0
    ) +

    ' | عمليات محذوفة: ' +
    (
      Number(
        operations.deleted
      ) || 0
    ) +

    ' | الوقت: ' +
    (
      Number(
        result.durationSeconds
      ) || 0
    ) +

    ' ث'

  );

}


function dashboardSyncError_(
  error
) {

  if (
    error &&
    error.message
  ) {

    return String(
      error.message
    );

  }


  return String(
    error ||
    'خطأ غير معروف'
  );

}


/* ==========================================================
 * المزامنة الحية
 * ==========================================================
 */

function runLiveDashboardSync() {

  var result =
    dashboardSyncOperations();


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
 * Trigger كل 5 دقائق
 * ==========================================================
 */

function createLiveDashboardSyncTrigger() {

  removeLiveDashboardSyncTrigger();


  ScriptApp
    .newTrigger(
      'runLiveDashboardSync'
    )
    .timeBased()
    .everyMinutes(
      5
    )
    .create();


  appToast(

    'تم تفعيل تحديث العمليات السريع كل 5 دقائق.',

    'النظام المالي',

    8

  );


  return true;

}


function removeLiveDashboardSyncTrigger() {

  var deleted =
    0;


  ScriptApp
    .getProjectTriggers()
    .forEach(
      function(trigger) {

        if (
          trigger.getHandlerFunction() ===
          'runLiveDashboardSync'
        ) {

          ScriptApp.deleteTrigger(
            trigger
          );


          deleted++;

        }

      }
    );


  return deleted;

}


/* ==========================================================
 * الاختبارات
 * ==========================================================
 */

function testDashboardAnalyticServer() {

  var result =
    getDashboardData({

      period:
        'this_month'

    });


  console.log(

    JSON.stringify(
      {

        summary:
          result.summary,

        categoryChart:
          result.categoryChart,

        spendingPeriodChart:
          result.spendingPeriodChart,

        scopeChart:
          result.scopeChart,

        analyticBreakdown:
          result.analyticBreakdown,

        counts:
          result.counts

      },

      null,

      2

    )

  );


  return result;

}


/**
 * اختبار التحديث السريع للعمليات.
 */
function testDashboardLiveSync() {

  var result =
    dashboardSyncOperations();


  console.log(

    JSON.stringify(
      result,
      null,
      2
    )

  );


  return result;

}


/**
 * اختبار تحديث الكل السريع.
 */
function testDashboardFullSync() {

  var result =
    dashboardSyncAll();


  console.log(

    JSON.stringify(
      result,
      null,
      2
    )

  );


  return result;

}


/**
 * اختبار الصيانة الشاملة.
 *
 * لا تشغله للاختبار العادي.
 */
function testDashboardMaintenanceSync() {

  var result =
    dashboardMaintenanceFullSync();


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
 * اختبار بنية النظام
 * ==========================================================
 */

function testDashboardSystem() {

  var dashboard =
    getDashboardData({

      period:
        'this_month'

    });


  if (
    !dashboard ||
    !dashboard.summary ||
    !dashboard.filters ||
    !dashboard.counts
  ) {

    throw new Error(
      'فشل اختبار بيانات لوحة التحكم.'
    );

  }


  if (
    !Array.isArray(
      dashboard.categoryChart
    ) ||
    !Array.isArray(
      dashboard.spendingPeriodChart
    ) ||
    !Array.isArray(
      dashboard.scopeChart
    )
  ) {

    throw new Error(
      'فشل اختبار البيانات التحليلية للوحة التحكم.'
    );

  }


  if (
    typeof getBudgetAnalytics !==
    'function'
  ) {

    throw new Error(
      'لم يتم العثور على getBudgetAnalytics في 50_Budget.gs.'
    );

  }


  var budget =
    getBudgetAnalytics({

      scope:
        'all',

      category:
        'all'

    });


  if (
    !budget ||
    !budget.monthly ||
    !budget.annual ||
    !budget.overall
  ) {

    throw new Error(
      'فشل ارتباط لوحة التحكم بمحرك الميزانية.'
    );

  }


  var requiredFunctions = [

    'dashboardSyncLabels',

    'dashboardSyncOperations',

    'dashboardSyncAll',

    'dashboardMaintenanceFullSync',

    'runLiveDashboardSync',

    'createLiveDashboardSyncTrigger',

    'removeLiveDashboardSyncTrigger'

  ];


  requiredFunctions.forEach(
    function(functionName) {

      if (
        typeof this[
          functionName
        ] !== 'function'
      ) {

        throw new Error(
          'الدالة غير موجودة: ' +
          functionName
        );

      }

    },
    this
  );


  var result = {

    success:
      true,

    dashboardRecords:
      dashboard.counts.all,

    displayedRecords:
      dashboard.counts.displayed,

    monthlyBudgetCards:
      budget.monthly.cards.length,

    annualBudgetCards:
      budget.annual.cards.length,

    fastOperationsAvailable:
      typeof operationsRegisterFastDetailed ===
        'function',

    fastAllSync:
      true,

    maintenanceAvailable:
      typeof dashboardMaintenanceFullSync ===
        'function',

    liveSyncUsesFastEngine:
      true,

    lockWaitSeconds:
      DASHBOARD_CONFIG
        .SYNC_LOCK_WAIT_MS /
      1000,

    completedAt:
      Utilities.formatDate(

        new Date(),

        DASHBOARD_CONFIG.TIME_ZONE,

        'dd/MM/yyyy HH:mm:ss'

      )

  };


  console.log(

    JSON.stringify(
      result,
      null,
      2
    )

  );


  appToast(

    'نجح اختبار 60_Dashboard.gs',

    'اختبار النظام',

    8

  );


  return result;

}
/* ==========================================================
 * DASHBOARD ANALYTIC SYNC PATCH V2
 *
 * الهدف:
 * - تحديث M:N:O تلقائيًا عند:
 *   1. تحديث التصنيفات
 *   2. تحديث العمليات
 *   3. تحديث الكل
 *
 * بدون الحاجة إلى الصيانة الشاملة.
 * ==========================================================
 */


/* ==========================================================
 * مزامنة الأعمدة التحليلية
 * ==========================================================
 */

function dashboardSyncAnalyticColumnsV2_() {

  var result = {

    available:
      false,

    synced:
      0,

    success:
      true

  };


  if (
    typeof syncOperationAnalyticColumns !==
    'function'
  ) {

    result.message =
      'دالة مزامنة الأعمدة التحليلية غير متوفرة.';


    return result;

  }


  try {

    result.available =
      true;


    /*
     * true =
     * لا يعمل Flush داخل 20_Operations
     * لأننا سنعمل Flush مرة واحدة
     * في نهاية مزامنة لوحة التحكم.
     */
    result.synced =
      Number(
        syncOperationAnalyticColumns(
          true
        )
      ) || 0;


    result.message =

      'تمت مزامنة أعمدة الفئة والفترة والصنف' +

      ' | العمليات المرتبطة: ' +
      result.synced;


    return result;


  } catch (error) {

    result.success =
      false;


    result.message =

      'تعذر تحديث الأعمدة التحليلية: ' +

      dashboardSyncError_(
        error
      );


    throw error;

  }

}


/* ==========================================================
 * تحديث التصنيفات V2
 * ==========================================================
 */

dashboardSyncLabels =
function() {

  var lock =
    LockService.getScriptLock();


  if (
    !lock.tryLock(
      DASHBOARD_CONFIG
        .SYNC_LOCK_WAIT_MS
    )
  ) {

    return {

      success:
        false,

      busy:
        true,

      message:
        'هناك عملية مزامنة أخرى تعمل حاليًا.'

    };

  }


  try {

    var startedAt =
      new Date();


    /*
     * 1. اكتشاف تغيير أسماء Gmail Labels.
     */
    var renameResult =
      dashboardSyncRenamedItems_() ||
      {};


    /*
     * 2. تحديث دليل البنود.
     */
    var labelsResult =
      syncGmailLabelsToGuide() ||
      {};


    /*
     * 3. مهم جدًا:
     *
     * نقل الفئة والفترة والصنف
     * من دليل البنود إلى العمليات القديمة.
     */
    var analyticResult =
      dashboardSyncAnalyticColumnsV2_();


    SpreadsheetApp.flush();


    var completedAt =
      new Date();


    var durationSeconds =
      Math.round(

        (
          completedAt.getTime() -
          startedAt.getTime()
        ) /

        1000

      );


    var renamed =
      Number(
        renameResult.renamed
      ) || 0;


    var renamedOperations =
      Number(
        renameResult.operationsUpdated
      ) || 0;


    return {

      success:
        true,

      fast:
        true,

      version:
        'DASHBOARD_SYNC_V2',

      renameSync:
        renameResult,

      labels:
        labelsResult,

      analyticSync:
        analyticResult,

      durationSeconds:
        durationSeconds,

      message:

        'تم تحديث التصنيفات' +

        ' | أسماء تغيرت: ' +
        renamed +

        ' | أسماء العمليات محدثة: ' +
        renamedOperations +

        ' | تحليل العمليات مزامن: ' +
        (
          Number(
            analyticResult.synced
          ) || 0
        ) +

        ' | بنود جديدة: ' +
        (
          Number(
            labelsResult.added
          ) || 0
        ) +

        ' | بنود محذوفة: ' +
        (
          Number(
            labelsResult.deleted
          ) || 0
        ) +

        ' | الوقت: ' +
        durationSeconds +
        ' ث',

      result:
        labelsResult

    };


  } catch (error) {

    return {

      success:
        false,

      version:
        'DASHBOARD_SYNC_V2',

      message:

        'فشل تحديث التصنيفات: ' +

        dashboardSyncError_(
          error
        )

    };


  } finally {

    lock.releaseLock();

  }

};


/* ==========================================================
 * تحديث العمليات V2
 * ==========================================================
 */

dashboardSyncOperations =
function() {

  var lock =
    LockService.getScriptLock();


  if (
    !lock.tryLock(
      DASHBOARD_CONFIG
        .SYNC_LOCK_WAIT_MS
    )
  ) {

    return {

      success:
        false,

      busy:
        true,

      message:
        'هناك مزامنة أخرى تعمل حاليًا. حاول مرة أخرى بعد قليل.'

    };

  }


  try {

    var startedAt =
      new Date();


    var operationsResult;


    /*
     * 1. تشغيل FAST_V2 الموجود في 20_Operations.
     */
    if (
      typeof operationsRegisterFastDetailed ===
      'function'
    ) {

      operationsResult =
        operationsRegisterFastDetailed() ||
        {};

    }


    else {

      operationsResult =
        operationsRegisterAndReconcile() ||
        {};

    }


    if (
      operationsResult &&
      operationsResult.success ===
        false
    ) {

      return {

        success:
          false,

        fast:
          true,

        version:
          'DASHBOARD_SYNC_V2',

        message:

          operationsResult.message ||

          'لم يكتمل تحديث العمليات.',

        result:
          operationsResult

      };

    }


    /*
     * 2. مهم:
     *
     * حتى لو لم تكن هناك رسالة Gmail جديدة،
     * نحدّث M:N:O من دليل البنود.
     */
    var analyticResult =
      dashboardSyncAnalyticColumnsV2_();


    SpreadsheetApp.flush();


    var completedAt =
      new Date();


    var durationSeconds =
      Math.round(

        (
          completedAt.getTime() -
          startedAt.getTime()
        ) /

        1000

      );


    var added =
      Number(
        operationsResult.added
      ) || 0;


    var updated =
      Number(
        operationsResult.updated
      ) || 0;


    var deleted =
      Number(
        operationsResult.deleted
      ) || 0;


    var known =
      Number(
        operationsResult.known
      ) || 0;


    var ignored =
      Number(
        operationsResult.ignored
      ) || 0;


    var failed =
      Number(
        operationsResult.failed
      ) || 0;


    var multiple =
      Number(
        operationsResult.multiple
      ) || 0;


    var message =

      'اكتمل تحديث العمليات' +

      ' | جديد: ' +
      added +

      ' | محدث: ' +
      updated +

      ' | محذوف: ' +
      deleted +

      ' | تحليل مزامن: ' +
      (
        Number(
          analyticResult.synced
        ) || 0
      ) +

      ' | معروف: ' +
      known +

      ' | الوقت: ' +
      durationSeconds +
      ' ث';


    if (
      failed > 0
    ) {

      message +=

        ' | أخطاء: ' +
        failed;

    }


    if (
      multiple > 0
    ) {

      message +=

        ' | متعدد البنود: ' +
        multiple;

    }


    if (
      ignored > 0
    ) {

      message +=

        ' | متجاهل: ' +
        ignored;

    }


    return {

      success:
        true,

      fast:
        typeof operationsRegisterFastDetailed ===
          'function',

      version:
        'DASHBOARD_SYNC_V2',

      mode:
        operationsResult.mode ||
        'fast',

      durationSeconds:
        durationSeconds,

      analyticSync:
        analyticResult,

      message:
        message,

      result:
        operationsResult

    };


  } catch (error) {

    return {

      success:
        false,

      fast:
        true,

      version:
        'DASHBOARD_SYNC_V2',

      message:

        'فشل تحديث العمليات: ' +

        dashboardSyncError_(
          error
        )

    };


  } finally {

    lock.releaseLock();

  }

};


/* ==========================================================
 * تحديث الكل V2
 * ==========================================================
 */

dashboardSyncAll =
function() {

  var lock =
    LockService.getScriptLock();


  if (
    !lock.tryLock(
      DASHBOARD_CONFIG
        .SYNC_LOCK_WAIT_MS
    )
  ) {

    return {

      success:
        false,

      busy:
        true,

      message:
        'هناك مزامنة أخرى قيد التشغيل.'

    };

  }


  var startedAt =
    new Date();


  try {

    var renameResult =
      {};


    var labelsResult =
      {};


    var operationsResult =
      {};


    var analyticResult =
      {};


    /*
     * =====================================================
     * 1. تحديث أسماء البنود
     * =====================================================
     */
    renameResult =
      dashboardSyncRenamedItems_() ||
      {};


    /*
     * =====================================================
     * 2. تحديث Gmail Labels → دليل البنود
     * =====================================================
     */
    labelsResult =
      syncGmailLabelsToGuide() ||
      {};


    /*
     * =====================================================
     * 3. المحرك السريع FAST_V2
     *
     * يلتقط:
     * - العمليات الجديدة
     * - تغيير Label على رسالة قديمة
     * =====================================================
     */
    if (
      typeof operationsRegisterFastDetailed ===
      'function'
    ) {

      operationsResult =
        operationsRegisterFastDetailed() ||
        {};

    }


    else {

      operationsResult =
        operationsRegisterAndReconcile() ||
        {};

    }


    if (
      operationsResult &&
      operationsResult.success ===
        false
    ) {

      return {

        success:
          false,

        fast:
          true,

        version:
          'DASHBOARD_SYNC_V2',

        renameSync:
          renameResult,

        labels:
          labelsResult,

        operations:
          operationsResult,

        message:

          operationsResult.message ||

          'لم يكتمل تحديث العمليات.'

      };

    }


    /*
     * =====================================================
     * 4. مهم جدًا
     *
     * نقل:
     * J = الفئة
     * K = الفترة
     * L = الصنف
     *
     * من دليل البنود
     *
     * إلى:
     * M = الفئة
     * N = الفترة
     * O = الصنف
     *
     * في ورقة العمليات.
     * =====================================================
     */
    analyticResult =
      dashboardSyncAnalyticColumnsV2_();


    SpreadsheetApp.flush();


    var completedAt =
      new Date();


    var durationSeconds =
      Math.round(

        (
          completedAt.getTime() -
          startedAt.getTime()
        ) /

        1000

      );


    var result = {

      success:
        true,

      fast:
        true,

      version:
        'DASHBOARD_SYNC_V2',

      maintenance:
        false,

      renameSync:
        renameResult,

      labels:
        labelsResult,

      operations:
        operationsResult,

      analyticSync:
        analyticResult,

      rent: {

        rebuilt:
          false,

        message:
          'تحديث الإيجارات محفوظ للصيانة الشاملة.'

      },

      durationSeconds:
        durationSeconds,

      startedAt:
        Utilities.formatDate(

          startedAt,

          DASHBOARD_CONFIG.TIME_ZONE,

          'dd/MM/yyyy HH:mm:ss'

        ),

      completedAt:
        Utilities.formatDate(

          completedAt,

          DASHBOARD_CONFIG.TIME_ZONE,

          'dd/MM/yyyy HH:mm:ss'

        )

    };


    result.message =
      dashboardFastAllMessageV2_(
        result
      );


    console.log(

      JSON.stringify(
        result,
        null,
        2
      )

    );


    return result;


  } catch (error) {

    return {

      success:
        false,

      fast:
        true,

      version:
        'DASHBOARD_SYNC_V2',

      message:

        'تعذر إكمال تحديث الكل: ' +

        dashboardSyncError_(
          error
        )

    };


  } finally {

    lock.releaseLock();

  }

};


/* ==========================================================
 * رسالة تحديث الكل V2
 * ==========================================================
 */

function dashboardFastAllMessageV2_(
  result
) {

  result =
    result || {};


  var labels =
    result.labels ||
    {};


  var operations =
    result.operations ||
    {};


  var renameSync =
    result.renameSync ||
    {};


  var analyticSync =
    result.analyticSync ||
    {};


  return (

    'اكتمل تحديث الكل' +

    ' | أسماء تغيرت: ' +
    (
      Number(
        renameSync.renamed
      ) || 0
    ) +

    ' | أسماء عمليات قديمة محدثة: ' +
    (
      Number(
        renameSync.operationsUpdated
      ) || 0
    ) +

    ' | بنود جديدة: ' +
    (
      Number(
        labels.added
      ) || 0
    ) +

    ' | عمليات جديدة: ' +
    (
      Number(
        operations.added
      ) || 0
    ) +

    ' | عمليات محدثة: ' +
    (
      Number(
        operations.updated
      ) || 0
    ) +

    ' | عمليات محذوفة: ' +
    (
      Number(
        operations.deleted
      ) || 0
    ) +

    ' | تحليل مزامن: ' +
    (
      Number(
        analyticSync.synced
      ) || 0
    ) +

    ' | الوقت: ' +
    (
      Number(
        result.durationSeconds
      ) || 0
    ) +

    ' ث'

  );

}


/* ==========================================================
 * اختبار الإصلاح
 * ==========================================================
 */

function testDashboardAnalyticSyncV2() {

  var startedAt =
    new Date();


  var analyticResult =
    dashboardSyncAnalyticColumnsV2_();


  SpreadsheetApp.flush();


  var result = {

    success:
      true,

    version:
      'DASHBOARD_ANALYTIC_V2',

    analyticAvailable:
      analyticResult.available,

    analyticSynced:
      Number(
        analyticResult.synced
      ) || 0,

    durationSeconds:
      Math.round(

        (
          new Date().getTime() -
          startedAt.getTime()
        ) /

        1000

      ),

    completedAt:
      Utilities.formatDate(

        new Date(),

        DASHBOARD_CONFIG.TIME_ZONE,

        'dd/MM/yyyy HH:mm:ss'

      )

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


