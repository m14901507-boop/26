/**
 * ==========================================================
 * 50_Budget.gs
 *
 * نظام الميزانيات الموحد
 * ==========================================================
 *
 * بديل عن:
 * - 15_BudgetSetup
 * - 19_BudgetAnalytics.gs
 *
 * النموذج الجديد:
 *
 * 1) عائلي شهري
 * 2) شخصي شهري
 * 3) عائلي سنوي
 * 4) شخصي سنوي
 *
 * اساسي / استثنائي / ترفيهي
 * ليست أرصدة مستقلة.
 *
 * هي نسب استرشادية داخل نفس الرصيد.
 *
 * الرصيد الحقيقي:
 * الرصيد الافتتاحي
 * + الإضافات الشهرية
 * - المصروفات
 *
 * الرصيد غير المستخدم يرحل تلقائيًا.
 *
 * النسب تطبق على الإضافة الجديدة فقط،
 * ولا تعيد تقسيم الرصيد المرحل.
 * ==========================================================
 */


var BUDGET_SETUP_CONFIG = Object.freeze({
  OPERATIONS_SHEET: 'العمليات',
  BUDGET_SHEET: 'الميزانيات',
  TIME_ZONE: 'Asia/Muscat'
});


var BUDGET_ANALYTICS_CONFIG = Object.freeze({

  SHEET: 'الميزانيات',

  HISTORY_SHEET:
    'سجل إعدادات الميزانيات',

  OPERATIONS_SHEET:
    'العمليات',

  TIME_ZONE:
    'Asia/Muscat',

  MONTHLY:
    'شهري',

  ANNUAL:
    'سنوي',

  CATEGORIES: [
    'اساسي',
    'استثنائي',
    'ترفيهي'
  ],

  SCOPES: [
    'عائلي',
    'شخصي'
  ]

});


var BUDGET_UNIFIED_HEADERS = Object.freeze([
  'الميزانية',
  'الصنف',
  'الفترة',
  'الإضافة الشهرية',
  'الرصيد الافتتاحي',
  'نسبة الأساسي %',
  'نسبة الاستثنائي %',
  'نسبة الترفيهي %',
  'تاريخ البداية',
  'نشط',
  'ملاحظات'
]);


var BUDGET_HISTORY_HEADERS = Object.freeze([
  'معرف السجل',
  'الميزانية',
  'سريان من',
  'الإضافة الشهرية',
  'نسبة الأساسي %',
  'نسبة الاستثنائي %',
  'نسبة الترفيهي %',
  'تاريخ الحفظ',
  'ملاحظات'
]);


/* ==========================================================
 * إنشاء هيكل الميزانية
 * ==========================================================
 */


/**
 * اسم الدالة القديمة محفوظ.
 */
function setupBudgetsSheet() {

  return budgetSetupUnifiedSheet_();

}


/**
 * اسم الدالة القديمة محفوظ.
 */
function setupBudgetAnalyticsSheet() {

  return budgetSetupUnifiedSheet_();

}


/**
 * إنشاء نموذج الميزانية الموحد.
 *
 * إذا وجد النموذج القديم:
 * يتم إنشاء نسخة احتياطية قبل استبداله.
 */
function budgetSetupUnifiedSheet_() {

  var ss =
    appActiveSpreadsheet();


  var sheet =
    ss.getSheetByName(
      BUDGET_ANALYTICS_CONFIG.SHEET
    );


  if (!sheet) {

    sheet =
      ss.insertSheet(
        BUDGET_ANALYTICS_CONFIG.SHEET
      );

  }


  var schema =
    budgetDetectSheetSchema_(
      sheet
    );


  var backupSheetName =
    '';


  /**
   * النظام القديم موجود.
   *
   * ننشئ نسخة احتياطية أولًا.
   */
  if (
    schema === 'legacy'
  ) {

    backupSheetName =
      budgetCreateBackup_(
        ss,
        sheet
      );


    sheet.clear();

  }


  /**
   * التأكد من 11 عمودًا.
   */
  if (
    sheet.getMaxColumns() <
    BUDGET_UNIFIED_HEADERS.length
  ) {

    sheet.insertColumnsAfter(

      sheet.getMaxColumns(),

      BUDGET_UNIFIED_HEADERS.length -
      sheet.getMaxColumns()

    );

  }


  sheet
    .getRange(
      1,
      1,
      1,
      BUDGET_UNIFIED_HEADERS.length
    )
    .setValues([
      Array.from(
        BUDGET_UNIFIED_HEADERS
      )
    ])
    .setFontWeight(
      'bold'
    )
    .setHorizontalAlignment(
      'center'
    );


  var existingMap =
    new Map();


  /**
   * إذا كان النموذج الموحد موجودًا،
   * نحافظ على القيم الحالية.
   */
  if (
    schema === 'unified' &&
    sheet.getLastRow() >= 2
  ) {

    var existingRows =
      sheet
        .getRange(
          2,
          1,
          sheet.getLastRow() - 1,
          BUDGET_UNIFIED_HEADERS.length
        )
        .getValues();


    existingRows.forEach(
      function(row) {

        var scope =
          budgetAnalyticsText_(
            row[1]
          );


        var period =
          budgetAnalyticsText_(
            row[2]
          );


        if (
          scope &&
          period
        ) {

          existingMap.set(

            budgetAnalyticsAccountKey_(
              scope,
              period
            ),

            row

          );

        }

      }
    );

  }


  var now =
    new Date();


  var defaultStart =
    new Date(
      now.getFullYear(),
      now.getMonth(),
      1
    );


  var definitions = [

    {
      name:
        'عائلي شهري',
      scope:
        'عائلي',
      period:
        'شهري'
    },

    {
      name:
        'شخصي شهري',
      scope:
        'شخصي',
      period:
        'شهري'
    },

    {
      name:
        'عائلي سنوي',
      scope:
        'عائلي',
      period:
        'سنوي'
    },

    {
      name:
        'شخصي سنوي',
      scope:
        'شخصي',
      period:
        'سنوي'
    }

  ];


  var output =
    definitions.map(
      function(definition) {

        var key =
          budgetAnalyticsAccountKey_(

            definition.scope,

            definition.period

          );


        var existing =
          existingMap.get(
            key
          );


        if (existing) {

          return [

            definition.name,

            definition.scope,

            definition.period,

            existing[3],

            existing[4],

            existing[5],

            existing[6],

            existing[7],

            existing[8] || defaultStart,

            existing[9] || 'نعم',

            existing[10]

          ];

        }


        /**
         * لا نفترض مبالغ أو نسبًا.
         *
         * المستخدم يحددها.
         */
        return [

          definition.name,

          definition.scope,

          definition.period,

          '',

          '',

          '',

          '',

          '',

          defaultStart,

          'نعم',

          ''

        ];

      }
    );


  var oldDataRows =
    Math.max(
      0,
      sheet.getLastRow() - 1
    );


  var clearRows =
    Math.max(
      oldDataRows,
      output.length
    );


  if (
    clearRows > 0
  ) {

    sheet
      .getRange(
        2,
        1,
        clearRows,
        BUDGET_UNIFIED_HEADERS.length
      )
      .clearContent();

  }


  sheet
    .getRange(
      2,
      1,
      output.length,
      BUDGET_UNIFIED_HEADERS.length
    )
    .setValues(
      output
    );


  formatBudgetsSheet_(
    sheet
  );


  budgetGetOrCreateHistorySheet_(
    ss
  );


  SpreadsheetApp.flush();


  var result = {

    success:
      true,

    accounts:
      output.length,

    migrated:
      schema === 'legacy',

    backupSheet:
      backupSheetName

  };


  console.log(
    JSON.stringify(
      result,
      null,
      2
    )
  );


  appToast(

    schema === 'legacy'

      ? 'تم إنشاء نموذج الميزانية الموحد مع حفظ نسخة احتياطية من النموذج القديم.'

      : 'تم تجهيز نموذج الميزانية الموحد.',

    'الميزانيات',

    8

  );


  return result;

}


/**
 * التعرف على نوع ورقة الميزانية.
 */
function budgetDetectSheetSchema_(
  sheet
) {

  if (
    sheet.getLastRow() < 1
  ) {

    return 'empty';

  }


  var numberOfColumns =
    Math.min(
      sheet.getMaxColumns(),
      BUDGET_UNIFIED_HEADERS.length
    );


  if (
    numberOfColumns <= 0
  ) {

    return 'empty';

  }


  var headers =
    sheet
      .getRange(
        1,
        1,
        1,
        numberOfColumns
      )
      .getDisplayValues()[0]
      .map(
        budgetAnalyticsText_
      );


  var hasContent =
    headers.some(
      function(value) {
        return value !== '';
      }
    );


  if (
    !hasContent
  ) {

    return 'empty';

  }


  if (
    headers[0] === 'الميزانية' &&
    headers[1] === 'الصنف' &&
    headers[2] === 'الفترة' &&
    headers[3] === 'الإضافة الشهرية'
  ) {

    return 'unified';

  }


  return 'legacy';

}


/**
 * إنشاء نسخة احتياطية من النموذج القديم.
 */
function budgetCreateBackup_(
  ss,
  sheet
) {

  var timestamp =
    Utilities.formatDate(

      new Date(),

      appTimeZone(
        ss
      ),

      'yyyyMMdd_HHmmss'

    );


  var baseName =
    'الميزانيات_قبل_النظام_الموحد_' +
    timestamp;


  var name =
    baseName;


  var counter =
    1;


  while (
    ss.getSheetByName(
      name
    )
  ) {

    name =
      baseName +
      '_' +
      counter;


    counter++;

  }


  sheet
    .copyTo(
      ss
    )
    .setName(
      name
    );


  return name;

}


/**
 * تنسيق ورقة الميزانيات.
 *
 * اسم الدالة القديمة محفوظ.
 */
function formatBudgetsSheet_(
  sheet
) {

  sheet.setRightToLeft(
    true
  );


  sheet.setFrozenRows(
    1
  );


  var widths = [
    165,
    100,
    100,
    150,
    150,
    135,
    145,
    140,
    130,
    85,
    270
  ];


  widths.forEach(
    function(
      width,
      index
    ) {

      sheet.setColumnWidth(
        index + 1,
        width
      );

    }
  );


  if (
    sheet.getLastRow() < 2
  ) {

    return;

  }


  var rows =
    sheet.getLastRow() - 1;


  /**
   * المبالغ.
   */
  sheet
    .getRange(
      2,
      4,
      rows,
      2
    )
    .setNumberFormat(
      '0.000'
    );


  /**
   * النسب.
   *
   * المستخدم يكتب:
   * 70
   * 20
   * 10
   */
  sheet
    .getRange(
      2,
      6,
      rows,
      3
    )
    .setNumberFormat(
      '0.0"%"'
    );


  /**
   * التاريخ.
   */
  sheet
    .getRange(
      2,
      9,
      rows,
      1
    )
    .setNumberFormat(
      'dd/MM/yyyy'
    );


  var scopeRule =
    SpreadsheetApp
      .newDataValidation()
      .requireValueInList(
        [
          'عائلي',
          'شخصي'
        ],
        true
      )
      .setAllowInvalid(
        false
      )
      .build();


  var periodRule =
    SpreadsheetApp
      .newDataValidation()
      .requireValueInList(
        [
          'شهري',
          'سنوي'
        ],
        true
      )
      .setAllowInvalid(
        false
      )
      .build();


  var percentageRule =
    SpreadsheetApp
      .newDataValidation()
      .requireNumberBetween(
        0,
        100
      )
      .setAllowInvalid(
        false
      )
      .build();


  var activeRule =
    SpreadsheetApp
      .newDataValidation()
      .requireValueInList(
        [
          'نعم',
          'لا'
        ],
        true
      )
      .setAllowInvalid(
        false
      )
      .build();


  sheet
    .getRange(
      2,
      2,
      rows,
      1
    )
    .setDataValidation(
      scopeRule
    );


  sheet
    .getRange(
      2,
      3,
      rows,
      1
    )
    .setDataValidation(
      periodRule
    );


  sheet
    .getRange(
      2,
      6,
      rows,
      3
    )
    .setDataValidation(
      percentageRule
    );


  sheet
    .getRange(
      2,
      10,
      rows,
      1
    )
    .setDataValidation(
      activeRule
    );


  /**
   * تمييز الصف إذا كانت النسب
   * موجودة ولكن مجموعها ليس 100%.
   */
  var fullRange =
    sheet.getRange(
      2,
      1,
      rows,
      BUDGET_UNIFIED_HEADERS.length
    );


  var rules = [

    SpreadsheetApp
      .newConditionalFormatRule()
      .whenFormulaSatisfied(
        '=AND(COUNTA($F2:$H2)>0,ABS(SUM($F2:$H2)-100)>0.001)'
      )
      .setBackground(
        '#fff2cc'
      )
      .setRanges([
        fullRange
      ])
      .build()

  ];


  sheet.setConditionalFormatRules(
    rules
  );

}


/* ==========================================================
 * سجل تغييرات الميزانية
 * ==========================================================
 */


/**
 * إنشاء سجل إعدادات الميزانية.
 *
 * هذا السجل يسمح لاحقًا بتغيير النسب
 * من الشهر الحالي أو الشهر التالي
 * دون تغيير الأشهر القديمة.
 */
function budgetGetOrCreateHistorySheet_(
  ss
) {

  var sheet =
    ss.getSheetByName(
      BUDGET_ANALYTICS_CONFIG.HISTORY_SHEET
    );


  if (!sheet) {

    sheet =
      ss.insertSheet(
        BUDGET_ANALYTICS_CONFIG.HISTORY_SHEET
      );

  }


  if (
    sheet.getMaxColumns() <
    BUDGET_HISTORY_HEADERS.length
  ) {

    sheet.insertColumnsAfter(

      sheet.getMaxColumns(),

      BUDGET_HISTORY_HEADERS.length -
      sheet.getMaxColumns()

    );

  }


  sheet
    .getRange(
      1,
      1,
      1,
      BUDGET_HISTORY_HEADERS.length
    )
    .setValues([
      Array.from(
        BUDGET_HISTORY_HEADERS
      )
    ])
    .setFontWeight(
      'bold'
    )
    .setHorizontalAlignment(
      'center'
    );


  sheet.setRightToLeft(
    true
  );


  sheet.setFrozenRows(
    1
  );


  var widths = [
    210,
    165,
    120,
    150,
    135,
    145,
    140,
    180,
    260
  ];


  widths.forEach(
    function(
      width,
      index
    ) {

      sheet.setColumnWidth(
        index + 1,
        width
      );

    }
  );


  if (
    sheet.getLastRow() >= 2
  ) {

    var rows =
      sheet.getLastRow() - 1;


    sheet
      .getRange(
        2,
        3,
        rows,
        1
      )
      .setNumberFormat(
        'dd/MM/yyyy'
      );


    sheet
      .getRange(
        2,
        4,
        rows,
        1
      )
      .setNumberFormat(
        '0.000'
      );


    sheet
      .getRange(
        2,
        5,
        rows,
        3
      )
      .setNumberFormat(
        '0.0"%"'
      );


    sheet
      .getRange(
        2,
        8,
        rows,
        1
      )
      .setNumberFormat(
        'dd/MM/yyyy HH:mm:ss'
      );

  }


  return sheet;

}


/* ==========================================================
 * قراءة الإعدادات
 * ==========================================================
 */


/**
 * قراءة الميزانيات الموحدة.
 *
 * اسم الدالة القديمة محفوظ.
 */
function budgetAnalyticsReadBudgets_(
  ss
) {

  var sheet =
    ss.getSheetByName(
      BUDGET_ANALYTICS_CONFIG.SHEET
    );


  if (
    !sheet ||
    sheet.getLastRow() < 2
  ) {

    return [];

  }


  var schema =
    budgetDetectSheetSchema_(
      sheet
    );


  if (
    schema !== 'unified'
  ) {

    throw new Error(
      'ورقة الميزانيات ما زالت تستخدم النظام القديم. شغّل setupBudgetAnalyticsSheet أولًا.'
    );

  }


  var rows =
    sheet
      .getRange(
        2,
        1,
        sheet.getLastRow() - 1,
        BUDGET_UNIFIED_HEADERS.length
      )
      .getValues();


  return rows

    .map(
      function(
        row,
        index
      ) {

        var monthlyTopUpText =
          budgetAnalyticsText_(
            row[3]
          );


        var openingBalanceText =
          budgetAnalyticsText_(
            row[4]
          );


        var basicText =
          budgetAnalyticsText_(
            row[5]
          );


        var exceptionalText =
          budgetAnalyticsText_(
            row[6]
          );


        var leisureText =
          budgetAnalyticsText_(
            row[7]
          );


        var account = {

          rowNumber:
            index + 2,

          name:
            budgetAnalyticsText_(
              row[0]
            ),

          scope:
            budgetAnalyticsText_(
              row[1]
            ),

          type:
            budgetAnalyticsText_(
              row[2]
            ),

          monthlyTopUp:
            monthlyTopUpText === ''

              ? null

              : Math.max(
                  0,
                  budgetAnalyticsNumber_(
                    row[3]
                  )
                ),

          openingBalance:
            openingBalanceText === ''

              ? 0

              : budgetAnalyticsNumber_(
                  row[4]
                ),

          percentages: {

            اساسي:
              basicText === ''
                ? null
                : budgetAnalyticsNumber_(
                    row[5]
                  ),

            استثنائي:
              exceptionalText === ''
                ? null
                : budgetAnalyticsNumber_(
                    row[6]
                  ),

            ترفيهي:
              leisureText === ''
                ? null
                : budgetAnalyticsNumber_(
                    row[7]
                  )

          },

          startDate:
            budgetMonthStart_(

              budgetAnalyticsDate_(
                row[8]
              ) ||
              new Date()

            ),

          active:
            budgetAnalyticsIsActive_(
              row[9]
            ),

          notes:
            budgetAnalyticsText_(
              row[10]
            )

        };


        account.distributionConfigured =
          budgetPercentagesValid_(
            account.percentages
          );


        return account;

      }
    )

    .filter(
      function(account) {

        return (
          account.name &&
          account.scope &&
          account.type
        );

      }
    );

}


/**
 * قراءة سجل التغييرات.
 */
function budgetAnalyticsReadHistory_(
  ss
) {

  var sheet =
    ss.getSheetByName(
      BUDGET_ANALYTICS_CONFIG.HISTORY_SHEET
    );


  if (
    !sheet ||
    sheet.getLastRow() < 2
  ) {

    return [];

  }


  var rows =
    sheet
      .getRange(
        2,
        1,
        sheet.getLastRow() - 1,
        BUDGET_HISTORY_HEADERS.length
      )
      .getValues();


  return rows

    .map(
      function(
        row,
        index
      ) {

        var topUpText =
          budgetAnalyticsText_(
            row[3]
          );


        var basicText =
          budgetAnalyticsText_(
            row[4]
          );


        var exceptionalText =
          budgetAnalyticsText_(
            row[5]
          );


        var leisureText =
          budgetAnalyticsText_(
            row[6]
          );


        return {

          rowNumber:
            index + 2,

          id:
            budgetAnalyticsText_(
              row[0]
            ),

          account:
            budgetAnalyticsText_(
              row[1]
            ),

          effectiveFrom:
            budgetMonthStart_(

              budgetAnalyticsDate_(
                row[2]
              )

            ),

          monthlyTopUp:
            topUpText === ''

              ? null

              : Math.max(
                  0,
                  budgetAnalyticsNumber_(
                    row[3]
                  )
                ),

          percentages: {

            اساسي:
              basicText === ''
                ? null
                : budgetAnalyticsNumber_(
                    row[4]
                  ),

            استثنائي:
              exceptionalText === ''
                ? null
                : budgetAnalyticsNumber_(
                    row[5]
                  ),

            ترفيهي:
              leisureText === ''
                ? null
                : budgetAnalyticsNumber_(
                    row[6]
                  )

          },

          savedAt:
            budgetAnalyticsDate_(
              row[7]
            ),

          notes:
            budgetAnalyticsText_(
              row[8]
            )

        };

      }
    )

    .filter(
      function(record) {

        return (
          record.account &&
          record.effectiveFrom
        );

      }
    );

}


/**
 * تحديد الإعداد الصحيح لشهر معين.
 */
function budgetResolveSettingForMonth_(

  account,

  monthStart,

  history

) {

  var selected =
    null;


  history.forEach(
    function(record) {

      if (
        budgetAnalyticsNormalize_(
          record.account
        ) !==
        budgetAnalyticsNormalize_(
          account.name
        )
      ) {

        return;

      }


      if (
        record.effectiveFrom.getTime() >
        monthStart.getTime()
      ) {

        return;

      }


      if (
        !selected ||
        record.effectiveFrom.getTime() >
          selected.effectiveFrom.getTime() ||
        (
          record.effectiveFrom.getTime() ===
            selected.effectiveFrom.getTime() &&
          record.rowNumber >
            selected.rowNumber
        )
      ) {

        selected =
          record;

      }

    }
  );


  var topUp =
    selected &&
    selected.monthlyTopUp !== null

      ? selected.monthlyTopUp

      : account.monthlyTopUp;


  var percentages =
    selected
      ? selected.percentages
      : account.percentages;


  return {

    monthlyTopUp:
      topUp,

    percentages:
      percentages,

    distributionConfigured:
      budgetPercentagesValid_(
        percentages
      )

  };

}


/* ==========================================================
 * قراءة العمليات
 * ==========================================================
 */


/**
 * قراءة العمليات من A:O.
 *
 * اسم الدالة القديمة محفوظ.
 */
function budgetAnalyticsReadOperations_(
  ss
) {

  var sheet =
    ss.getSheetByName(
      BUDGET_ANALYTICS_CONFIG.OPERATIONS_SHEET
    );


  if (
    !sheet ||
    sheet.getLastRow() < 2
  ) {

    return [];

  }


  var values =
    sheet
      .getDataRange()
      .getValues();


  var headers =
    values[0].map(
      budgetAnalyticsText_
    );


  var dateIndex =
    headers.indexOf(
      'التاريخ والوقت'
    );


  var itemIndex =
    headers.indexOf(
      'البند'
    );


  var amountIndex =
    headers.indexOf(
      'المبلغ'
    );


  var typeIndex =
    headers.indexOf(
      'نوع العملية'
    );


  var systemIndex =
    headers.indexOf(
      'النظام'
    );


  var statusIndex =
    headers.indexOf(
      'حالة التسجيل'
    );


  var categoryIndex =
    headers.indexOf(
      'الفئة'
    );


  var spendingPeriodIndex =
    headers.indexOf(
      'الفترة'
    );


  var scopeIndex =
    headers.indexOf(
      'الصنف'
    );


  if (
    dateIndex < 0 ||
    amountIndex < 0 ||
    categoryIndex < 0 ||
    spendingPeriodIndex < 0 ||
    scopeIndex < 0
  ) {

    throw new Error(

      'ورقة العمليات لا تحتوي الأعمدة المطلوبة: ' +
      'التاريخ والوقت، المبلغ، الفئة، الفترة، الصنف.'

    );

  }


  return values
    .slice(
      1
    )
    .map(
      function(row) {

        var record = {

          date:
            budgetAnalyticsDate_(
              row[dateIndex]
            ),

          item:
            itemIndex >= 0
              ? budgetAnalyticsText_(
                  row[itemIndex]
                )
              : '',

          amount:
            Math.abs(
              budgetAnalyticsNumber_(
                row[amountIndex]
              )
            ),

          category:
            budgetAnalyticsText_(
              row[categoryIndex]
            ),

          spendingPeriod:
            budgetAnalyticsText_(
              row[spendingPeriodIndex]
            ),

          scope:
            budgetAnalyticsText_(
              row[scopeIndex]
            ),

          type:
            typeIndex >= 0
              ? budgetAnalyticsText_(
                  row[typeIndex]
                )
              : '',

          system:
            systemIndex >= 0
              ? budgetAnalyticsText_(
                  row[systemIndex]
                )
              : '',

          status:
            statusIndex >= 0
              ? budgetAnalyticsText_(
                  row[statusIndex]
                )
              : ''

        };


        record.direction =
          budgetAnalyticsDirection_(
            record
          );


        return record;

      }
    )
    .filter(
      function(record) {

        return (
          record.date &&
          record.amount > 0 &&
          record.category &&
          record.spendingPeriod &&
          record.scope
        );

      }
    );

}


/**
 * تحديد المصروف الحقيقي.
 *
 * التحويلات الداخلية لا تدخل في الميزانية.
 */
function budgetAnalyticsDirection_(
  record
) {

  var status =
    budgetAnalyticsNormalize_(
      record.status
    );


  var type =
    budgetAnalyticsNormalize_(
      record.type
    );


  if (
    status.indexOf(
      'مستبعد'
    ) !== -1 ||
    type.indexOf(
      'تحويل داخلي'
    ) !== -1
  ) {

    return 'neutral';

  }


  if (
    type.indexOf(
      'مصروف'
    ) !== -1 ||
    type.indexOf(
      'شراء'
    ) !== -1 ||
    type.indexOf(
      'خصم'
    ) !== -1 ||
    type.indexOf(
      'دفع'
    ) !== -1
  ) {

    return 'expense';

  }


  return 'neutral';

}


/* ==========================================================
 * المحرك الرئيسي
 * ==========================================================
 */


/**
 * الدالة التي تستخدمها لوحة التحكم.
 *
 * تم الحفاظ على اسمها وشكلها الأساسي.
 */
function getBudgetAnalytics(
  filters
) {

  filters =
    filters || {};


  var ss =
    appActiveSpreadsheet();


  var budgetSheet =
    ss.getSheetByName(
      BUDGET_ANALYTICS_CONFIG.SHEET
    );


  if (
    !budgetSheet ||
    budgetDetectSheetSchema_(
      budgetSheet
    ) !== 'unified'
  ) {

    budgetSetupUnifiedSheet_();

  }


  var now =
    new Date();


  var budgets =
    budgetAnalyticsReadBudgets_(
      ss
    );


  var history =
    budgetAnalyticsReadHistory_(
      ss
    );


  var operations =
    budgetAnalyticsReadOperations_(
      ss
    );


  var selectedScope =
    budgetAnalyticsText_(
      filters.scope
    ) || 'all';


  var selectedCategory =
    budgetAnalyticsText_(
      filters.category
    ) || 'all';


  var monthly =
    budgetAnalyticsBuildPeriod_(

      BUDGET_ANALYTICS_CONFIG.MONTHLY,

      budgets,

      operations,

      now,

      selectedScope,

      selectedCategory,

      history

    );


  var annual =
    budgetAnalyticsBuildPeriod_(

      BUDGET_ANALYTICS_CONFIG.ANNUAL,

      budgets,

      operations,

      now,

      selectedScope,

      selectedCategory,

      history

    );


  var overall =
    budgetAnalyticsBuildOverall_(

      monthly,

      annual

    );


  return {

    generatedAt:
      Utilities.formatDate(

        now,

        appTimeZone(
          ss
        ),

        'dd/MM/yyyy HH:mm:ss'

      ),

    model:
      'unified_pool',

    filters: {

      scope:
        selectedScope,

      category:
        selectedCategory

    },

    monthly:
      monthly,

    annual:
      annual,

    overall:
      overall

  };

}


/**
 * بناء الشهري أو السنوي.
 *
 * اسم الدالة القديمة محفوظ.
 */
function budgetAnalyticsBuildPeriod_(

  budgetType,

  budgets,

  operations,

  now,

  selectedScope,

  selectedCategory,

  history

) {

  history =
    history || [];


  var start =
    budgetType ===
      BUDGET_ANALYTICS_CONFIG.MONTHLY

      ? new Date(
          now.getFullYear(),
          now.getMonth(),
          1
        )

      : new Date(
          now.getFullYear(),
          0,
          1
        );


  var end =
    new Date(
      now
    );


  var progress =
    budgetType ===
      BUDGET_ANALYTICS_CONFIG.MONTHLY

      ? budgetAnalyticsMonthProgress_(
          now
        )

      : budgetAnalyticsYearProgress_(
          now
        );


  var accounts =
    budgets.filter(
      function(account) {

        if (
          !account.active
        ) {

          return false;

        }


        if (
          account.type !==
          budgetType
        ) {

          return false;

        }


        return (
          selectedScope === 'all' ||
          account.scope ===
            selectedScope
        );

      }
    );


  var accountMetrics =
    accounts.map(
      function(account) {

        return budgetBuildAccountMetrics_(

          account,

          operations,

          history,

          now

        );

      }
    );


  var categories =
    BUDGET_ANALYTICS_CONFIG
      .CATEGORIES
      .filter(
        function(category) {

          return (
            selectedCategory === 'all' ||
            category ===
              selectedCategory
          );

        }
      );


  var cards =
    categories.map(
      function(category) {

        var categoryOperations =
          operations.filter(
            function(operation) {

              if (
                operation.direction !==
                'expense'
              ) {

                return false;

              }


              if (
                operation.spendingPeriod !==
                budgetType
              ) {

                return false;

              }


              if (
                operation.category !==
                category
              ) {

                return false;

              }


              if (
                selectedScope !== 'all' &&
                operation.scope !==
                  selectedScope
              ) {

                return false;

              }


              if (
                operation.date < start ||
                operation.date > end
              ) {

                return false;

              }


              return true;

            }
          );


        var spent =
          categoryOperations.reduce(
            function(total, operation) {

              return (
                total +
                operation.amount
              );

            },
            0
          );


        var target =
          0;


        var targetConfigured =
          false;


        accountMetrics.forEach(
          function(account) {

            var value =
              account
                .periodCategoryTargets[
                  category
                ];


            if (
              value !== null
            ) {

              target += value;

              targetConfigured =
                true;

            }

          }
        );


        var expected =
          null;


        if (
          targetConfigured
        ) {

          /**
           * الشهري:
           * نراقب سرعة الصرف داخل الشهر.
           *
           * السنوي:
           * الهدف نفسه متراكم من الإضافات
           * الشهرية، لذلك لا نضاعف عامل الوقت.
           */
          expected =
            budgetType ===
              BUDGET_ANALYTICS_CONFIG.MONTHLY

              ? target *
                progress

              : target;

        }


        var remaining =
          targetConfigured
            ? target - spent
            : null;


        var budgetUsage =
          targetConfigured &&
          target > 0

            ? (
                spent /
                target
              ) * 100

            : null;


        var expectedUsage =
          expected !== null &&
          expected > 0

            ? (
                spent /
                expected
              ) * 100

            : null;


        return {

          category:
            category,

          spent:
            budgetAnalyticsRound_(
              spent
            ),

          /**
           * للتوافق مع لوحة التحكم القديمة،
           * نستخدم budget بمعنى:
           * مستهدف هذه الفئة.
           */
          budget:
            targetConfigured

              ? budgetAnalyticsRound_(
                  target
                )

              : null,

          target:
            targetConfigured

              ? budgetAnalyticsRound_(
                  target
                )

              : null,

          expected:
            expected === null

              ? null

              : budgetAnalyticsRound_(
                  expected
                ),

          remaining:
            remaining === null

              ? null

              : budgetAnalyticsRound_(
                  remaining
                ),

          budgetUsage:
            budgetUsage === null

              ? null

              : budgetAnalyticsRound_(
                  budgetUsage
                ),

          expectedUsage:
            expectedUsage === null

              ? null

              : budgetAnalyticsRound_(
                  expectedUsage
                ),

          varianceFromExpected:
            expected === null

              ? null

              : budgetAnalyticsRound_(
                  spent -
                  expected
                ),

          /**
           * تفاصيل البنود ستظهر لاحقًا
           * داخل بطاقة اساسي/استثنائي/ترفيهي.
           */
          items:
            budgetAggregateItems_(
              categoryOperations
            ),

          status:
            budgetAnalyticsStatus_(

              spent,

              target,

              expected,

              targetConfigured

            )

        };

      }
    );


  var totalSpent =
    cards.reduce(
      function(total, card) {

        return (
          total +
          card.spent
        );

      },
      0
    );


  var configuredCards =
    cards.filter(
      function(card) {

        return (
          card.budget !== null
        );

      }
    );


  var totalTarget =
    configuredCards.reduce(
      function(total, card) {

        return (
          total +
          card.budget
        );

      },
      0
    );


  var totalExpected =
    configuredCards.reduce(
      function(total, card) {

        return (
          total +
          (
            card.expected || 0
          )
        );

      },
      0
    );


  /**
   * الرصيد الحقيقي للحسابات،
   * وليس مجموع أهداف الفئات.
   */
  var availableBalance =
    accountMetrics.reduce(
      function(total, account) {

        return (
          total +
          account.availableBalance
        );

      },
      0
    );


  var targetRemaining =
    configuredCards.reduce(
      function(total, card) {

        return (
          total +
          (
            card.remaining || 0
          )
        );

      },
      0
    );


  var highestPressure =
    cards
      .filter(
        function(card) {

          return (
            card.budgetUsage !== null
          );

        }
      )
      .sort(
        function(
          first,
          second
        ) {

          return (
            second.budgetUsage -
            first.budgetUsage
          );

        }
      )[0] ||
      null;


  return {

    type:
      budgetType,

    start:
      Utilities.formatDate(

        start,

        BUDGET_ANALYTICS_CONFIG.TIME_ZONE,

        'dd/MM/yyyy'

      ),

    end:
      Utilities.formatDate(

        end,

        BUDGET_ANALYTICS_CONFIG.TIME_ZONE,

        'dd/MM/yyyy'

      ),

    progressPercent:
      budgetAnalyticsRound_(
        progress * 100
      ),

    spent:
      budgetAnalyticsRound_(
        totalSpent
      ),

    /**
     * مجموع المستهدف المتاح
     * للفئات في الفترة الحالية.
     */
    budget:
      configuredCards.length

        ? budgetAnalyticsRound_(
            totalTarget
          )

        : null,

    expected:
      configuredCards.length

        ? budgetAnalyticsRound_(
            totalExpected
          )

        : null,

    /**
     * remaining الآن هو الرصيد الحقيقي
     * شاملاً الترحيل.
     *
     * هذا مهم لتوافق لوحة التحكم.
     */
    remaining:
      accountMetrics.length

        ? budgetAnalyticsRound_(
            availableBalance
          )

        : null,

    availableBalance:
      accountMetrics.length

        ? budgetAnalyticsRound_(
            availableBalance
          )

        : null,

    targetRemaining:
      configuredCards.length

        ? budgetAnalyticsRound_(
            targetRemaining
          )

        : null,

    cards:
      cards,

    accounts:
      accountMetrics,

    highestPressure:
      highestPressure

  };

}


/* ==========================================================
 * حساب الرصيد الموحد
 * ==========================================================
 */


/**
 * حساب حساب واحد.
 */
function budgetBuildAccountMetrics_(

  account,

  operations,

  history,

  now

) {

  var startMonth =
    budgetMonthStart_(
      account.startDate
    );


  var currentMonth =
    budgetMonthStart_(
      now
    );


  var months =
    budgetMonthSequence_(

      startMonth,

      currentMonth

    );


  var contributionsToDate =
    0;


  var hasContribution =
    false;


  var currentYear =
    now.getFullYear();


  var periodTarget =
    0;


  var periodTargetConfigured =
    false;


  var categoryTargets = {

    اساسي:
      0,

    استثنائي:
      0,

    ترفيهي:
      0

  };


  var categoryConfigured = {

    اساسي:
      false,

    استثنائي:
      false,

    ترفيهي:
      false

  };


  months.forEach(
    function(month) {

      var setting =
        budgetResolveSettingForMonth_(

          account,

          month,

          history

        );


      if (
        setting.monthlyTopUp !== null
      ) {

        contributionsToDate +=
          setting.monthlyTopUp;


        hasContribution =
          true;

      }


      var belongsToPeriod =
        account.type ===
          BUDGET_ANALYTICS_CONFIG.MONTHLY

          ? (
              month.getFullYear() ===
                currentMonth.getFullYear() &&
              month.getMonth() ===
                currentMonth.getMonth()
            )

          : (
              month.getFullYear() ===
              currentYear
            );


      if (
        !belongsToPeriod ||
        setting.monthlyTopUp === null
      ) {

        return;

      }


      periodTarget +=
        setting.monthlyTopUp;


      periodTargetConfigured =
        true;


      if (
        setting.distributionConfigured
      ) {

        BUDGET_ANALYTICS_CONFIG
          .CATEGORIES
          .forEach(
            function(category) {

              categoryTargets[
                category
              ] +=

                setting.monthlyTopUp *

                setting.percentages[
                  category
                ] /

                100;


              categoryConfigured[
                category
              ] =
                true;

            }
          );

      }

    }
  );


  var lifetimeSpent =
    0;


  var periodSpent =
    0;


  var periodStart =
    account.type ===
      BUDGET_ANALYTICS_CONFIG.MONTHLY

      ? currentMonth

      : new Date(
          now.getFullYear(),
          0,
          1
        );


  operations.forEach(
    function(operation) {

      if (
        operation.direction !==
          'expense'
      ) {

        return;

      }


      if (
        operation.scope !==
          account.scope
      ) {

        return;

      }


      if (
        operation.spendingPeriod !==
          account.type
      ) {

        return;

      }


      if (
        operation.date <
          startMonth ||
        operation.date >
          now
      ) {

        return;

      }


      lifetimeSpent +=
        operation.amount;


      if (
        operation.date >=
          periodStart
      ) {

        periodSpent +=
          operation.amount;

      }

    }
  );


  var availableBalance =

    account.openingBalance +

    contributionsToDate -

    lifetimeSpent;


  var periodCategoryTargets = {};


  BUDGET_ANALYTICS_CONFIG
    .CATEGORIES
    .forEach(
      function(category) {

        periodCategoryTargets[
          category
        ] =
          categoryConfigured[
            category
          ]

            ? budgetAnalyticsRound_(
                categoryTargets[
                  category
                ]
              )

            : null;

      }
    );


  var currentSetting =
    budgetResolveSettingForMonth_(

      account,

      currentMonth,

      history

    );


  var status =
    budgetAccountStatus_(

      availableBalance,

      hasContribution,

      account.openingBalance

    );


  return {

    name:
      account.name,

    scope:
      account.scope,

    period:
      account.type,

    monthlyTopUp:
      currentSetting.monthlyTopUp,

    openingBalance:
      budgetAnalyticsRound_(
        account.openingBalance
      ),

    contributionsToDate:
      budgetAnalyticsRound_(
        contributionsToDate
      ),

    spentToDate:
      budgetAnalyticsRound_(
        lifetimeSpent
      ),

    periodSpent:
      budgetAnalyticsRound_(
        periodSpent
      ),

    periodTarget:
      periodTargetConfigured

        ? budgetAnalyticsRound_(
            periodTarget
          )

        : null,

    availableBalance:
      budgetAnalyticsRound_(
        availableBalance
      ),

    /**
     * هذا هو الرصيد المرحل الفعلي.
     */
    rolloverBalance:
      budgetAnalyticsRound_(
        availableBalance
      ),

    percentages:
      currentSetting.percentages,

    distributionConfigured:
      currentSetting
        .distributionConfigured,

    periodCategoryTargets:
      periodCategoryTargets,

    startDate:
      Utilities.formatDate(

        startMonth,

        BUDGET_ANALYTICS_CONFIG.TIME_ZONE,

        'dd/MM/yyyy'

      ),

    status:
      status

  };

}


/**
 * حالة الرصيد الحقيقي.
 */
function budgetAccountStatus_(

  availableBalance,

  hasContribution,

  openingBalance

) {

  if (
    !hasContribution &&
    !openingBalance
  ) {

    return {

      code:
        'no_budget',

      label:
        'الميزانية غير محددة',

      level:
        'neutral'

    };

  }


  if (
    availableBalance < -0.0005
  ) {

    return {

      code:
        'over_account_balance',

      label:
        'تجاوز رصيد الميزانية',

      level:
        'danger'

    };

  }


  if (
    Math.abs(
      availableBalance
    ) <= 0.0005
  ) {

    return {

      code:
        'balance_used',

      label:
        'تم استخدام كامل الرصيد',

      level:
        'warning'

    };

  }


  return {

    code:
      'available',

    label:
      'يوجد رصيد متاح',

    level:
      'good'

  };

}


/* ==========================================================
 * حالات الفئات
 * ==========================================================
 */


/**
 * اسم الدالة القديمة محفوظ.
 *
 * تجاوز مستهدف ترفيهي مثلًا
 * لا يعني أن الحساب نفسه تجاوز الميزانية.
 */
function budgetAnalyticsStatus_(

  spent,

  budget,

  expected,

  budgetConfigured

) {

  if (
    !budgetConfigured
  ) {

    return {

      code:
        'no_budget',

      label:
        'المستهدف غير محدد',

      level:
        'neutral'

    };

  }


  if (
    budget !== null &&
    spent >
      budget + 0.0005
  ) {

    return {

      code:
        'over_target',

      label:
        'تجاوز مستهدف الفئة',

      level:
        'warning'

    };

  }


  if (
    expected === null ||
    expected <= 0
  ) {

    return {

      code:
        'within_target',

      label:
        'ضمن المستهدف',

      level:
        'good'

    };

  }


  var ratio =
    spent /
    expected;


  if (
    ratio <= 1
  ) {

    return {

      code:
        'on_track',

      label:
        'ضمن المسار',

      level:
        'good'

    };

  }


  return {

    code:
      'above_expected',

    label:
      'أعلى من المسار المتوقع',

    level:
      'warning'

  };

}


/* ==========================================================
 * المؤشر العام
 * ==========================================================
 */


/**
 * اسم الدالة القديمة محفوظ.
 */
function budgetAnalyticsBuildOverall_(

  monthly,

  annual

) {

  var accountProblems =
    [];


  [monthly, annual]
    .forEach(
      function(period) {

        period.accounts
          .forEach(
            function(account) {

              if (
                account.status.level ===
                'danger'
              ) {

                accountProblems.push({

                  type:
                    period.type,

                  account:
                    account.name,

                  status:
                    account.status

                });

              }

            }
          );

      }
    );


  var candidates =
    [];


  monthly.cards.forEach(
    function(card) {

      if (
        card.budgetUsage !== null
      ) {

        candidates.push({

          type:
            'شهري',

          category:
            card.category,

          usage:
            card.budgetUsage,

          expectedUsage:
            card.expectedUsage,

          status:
            card.status

        });

      }

    }
  );


  annual.cards.forEach(
    function(card) {

      if (
        card.budgetUsage !== null
      ) {

        candidates.push({

          type:
            'سنوي',

          category:
            card.category,

          usage:
            card.budgetUsage,

          expectedUsage:
            card.expectedUsage,

          status:
            card.status

        });

      }

    }
  );


  candidates.sort(
    function(
      first,
      second
    ) {

      return (
        second.usage -
        first.usage
      );

    }
  );


  var highestPressure =
    candidates.length
      ? candidates[0]
      : null;


  var overallStatus;


  /**
   * تجاوز الرصيد الفعلي أخطر
   * من تجاوز نسبة فئة.
   */
  if (
    accountProblems.length
  ) {

    overallStatus = {

      code:
        'over_budget',

      label:
        'تجاوز رصيد إحدى الميزانيات',

      level:
        'danger'

    };

  }


  else if (
    highestPressure
  ) {

    overallStatus =
      highestPressure.status;

  }


  else {

    overallStatus = {

      code:
        'no_budget',

      label:
        'الميزانية غير مكتملة',

      level:
        'neutral'

    };

  }


  return {

    monthlySpent:
      monthly.spent,

    monthlyRemaining:
      monthly.remaining,

    monthlyTargetRemaining:
      monthly.targetRemaining,

    annualSpent:
      annual.spent,

    annualRemaining:
      annual.remaining,

    annualTargetRemaining:
      annual.targetRemaining,

    status:
      overallStatus,

    highestPressure:
      highestPressure,

    accountProblems:
      accountProblems

  };

}


/* ==========================================================
 * تفاصيل البنود داخل الفئات
 * ==========================================================
 */


/**
 * تجميع المصروف حسب البند.
 */
function budgetAggregateItems_(
  operations
) {

  var map =
    new Map();


  operations.forEach(
    function(operation) {

      var item =
        budgetAnalyticsText_(
          operation.item
        ) || 'غير محدد';


      if (
        !map.has(
          item
        )
      ) {

        map.set(

          item,

          {
            item:
              item,

            spent:
              0,

            count:
              0
          }

        );

      }


      var record =
        map.get(
          item
        );


      record.spent +=
        operation.amount;


      record.count++;

    }
  );


  return Array.from(
    map.values()
  )
    .map(
      function(record) {

        return {

          item:
            record.item,

          spent:
            budgetAnalyticsRound_(
              record.spent
            ),

          count:
            record.count

        };

      }
    )
    .sort(
      function(
        first,
        second
      ) {

        return (
          second.spent -
          first.spent
        );

      }
    );

}


/* ==========================================================
 * إعدادات لوحة التحكم المستقبلية
 * ==========================================================
 */


/**
 * قراءة إعدادات الميزانية للواجهة.
 */
function getBudgetSettings() {

  var ss =
    appActiveSpreadsheet();


  var sheet =
    ss.getSheetByName(
      BUDGET_ANALYTICS_CONFIG.SHEET
    );


  if (
    !sheet ||
    budgetDetectSheetSchema_(
      sheet
    ) !== 'unified'
  ) {

    budgetSetupUnifiedSheet_();

  }


  var accounts =
    budgetAnalyticsReadBudgets_(
      ss
    );


  return {

    accounts:
      accounts.map(
        function(account) {

          var totalPercentage =
            budgetPercentageTotal_(
              account.percentages
            );


          return {

            name:
              account.name,

            scope:
              account.scope,

            period:
              account.type,

            monthlyTopUp:
              account.monthlyTopUp,

            openingBalance:
              account.openingBalance,

            basicPercent:
              account.percentages
                .اساسي,

            exceptionalPercent:
              account.percentages
                .استثنائي,

            leisurePercent:
              account.percentages
                .ترفيهي,

            percentageTotal:
              totalPercentage,

            distributionConfigured:
              account
                .distributionConfigured,

            startDate:
              Utilities.formatDate(

                account.startDate,

                appTimeZone(
                  ss
                ),

                'yyyy-MM-dd'

              ),

            active:
              account.active,

            notes:
              account.notes

          };

        }
      )

  };

}


/**
 * حفظ الإعدادات.
 *
 * يدعم مستقبلًا:
 *
 * effectiveFrom = current
 * effectiveFrom = next
 *
 * ويمنع الحفظ إذا لم يكن مجموع
 * اساسي + استثنائي + ترفيهي = 100.
 */
function saveBudgetSettings(
  payload
) {

  payload =
    payload || {};


  var ss =
    appActiveSpreadsheet();


  var sheet =
    ss.getSheetByName(
      BUDGET_ANALYTICS_CONFIG.SHEET
    );


  if (
    !sheet ||
    budgetDetectSheetSchema_(
      sheet
    ) !== 'unified'
  ) {

    budgetSetupUnifiedSheet_();


    sheet =
      ss.getSheetByName(
        BUDGET_ANALYTICS_CONFIG.SHEET
      );

  }


  var inputs =
    Array.isArray(
      payload.accounts
    )

      ? payload.accounts

      : [payload];


  var effectiveDate =
    budgetResolveEffectiveDate_(

      payload.effectiveFrom ||
      payload.applyFrom ||
      'current'

    );


  var rows =
    sheet
      .getRange(
        2,
        1,
        4,
        BUDGET_UNIFIED_HEADERS.length
      )
      .getValues();


  var historySheet =
    budgetGetOrCreateHistorySheet_(
      ss
    );


  var existingHistory =
    budgetAnalyticsReadHistory_(
      ss
    );


  var newHistoryRows =
    [];


  inputs.forEach(
    function(input) {

      var inputName =
        budgetAnalyticsText_(

          input.name ||
          input.account

        );


      if (
        !inputName
      ) {

        throw new Error(
          'اسم الميزانية غير موجود.'
        );

      }


      var rowIndex =
        -1;


      for (
        var index = 0;
        index < rows.length;
        index++
      ) {

        if (
          budgetAnalyticsNormalize_(
            rows[index][0]
          ) ===
          budgetAnalyticsNormalize_(
            inputName
          )
        ) {

          rowIndex =
            index;

          break;

        }

      }


      if (
        rowIndex < 0
      ) {

        throw new Error(
          'لم يتم العثور على الميزانية: ' +
          inputName
        );

      }


      var oldRow =
        rows[rowIndex];


      /**
       * نحتفظ بالإعداد السابق في السجل
       * قبل أي تعديل مستقبلي.
       */
      var hasOldHistory =
        existingHistory.some(
          function(record) {

            return (
              budgetAnalyticsNormalize_(
                record.account
              ) ===
              budgetAnalyticsNormalize_(
                inputName
              )
            );

          }
        );


      var oldPercentages = {

        اساسي:
          budgetOptionalNumber_(
            oldRow[5]
          ),

        استثنائي:
          budgetOptionalNumber_(
            oldRow[6]
          ),

        ترفيهي:
          budgetOptionalNumber_(
            oldRow[7]
          )

      };


      var oldTopUp =
        budgetOptionalNumber_(
          oldRow[3]
        );


      if (
        !hasOldHistory &&
        oldTopUp !== null &&
        budgetPercentagesValid_(
          oldPercentages
        )
      ) {

        var oldStart =
          budgetMonthStart_(

            budgetAnalyticsDate_(
              oldRow[8]
            ) ||
            new Date()

          );


        newHistoryRows.push(

          budgetBuildHistoryRow_(

            inputName,

            oldStart,

            oldTopUp,

            oldPercentages,

            'الإعداد الأساسي قبل التعديل'

          )

        );

      }


      var monthlyTopUp =
        budgetInputNumber_(

          input,

          [
            'monthlyTopUp',
            'topUp'
          ],

          oldTopUp

        );


      var openingBalance =
        budgetInputNumber_(

          input,

          [
            'openingBalance'
          ],

          budgetOptionalNumber_(
            oldRow[4]
          ) || 0

        );


      var percentages = {

        اساسي:
          budgetInputNumber_(

            input,

            [
              'basicPercent',
              'basicPct'
            ],

            oldPercentages.اساسي

          ),

        استثنائي:
          budgetInputNumber_(

            input,

            [
              'exceptionalPercent',
              'exceptionalPct'
            ],

            oldPercentages.استثنائي

          ),

        ترفيهي:
          budgetInputNumber_(

            input,

            [
              'leisurePercent',
              'leisurePct'
            ],

            oldPercentages.ترفيهي

          )

      };


      var percentageValues =
        [
          percentages.اساسي,
          percentages.استثنائي,
          percentages.ترفيهي
        ];


      var anyPercentage =
        percentageValues.some(
          function(value) {

            return value !== null;

          }
        );


      if (
        anyPercentage &&
        !budgetPercentagesValid_(
          percentages
        )
      ) {

        throw new Error(

          'يجب أن يكون مجموع نسب اساسي + استثنائي + ترفيهي = 100% للميزانية: ' +
          inputName

        );

      }


      var startDate =
        budgetInputDate_(

          input,

          'startDate',

          budgetAnalyticsDate_(
            oldRow[8]
          ) ||
          new Date()

        );


      var active =
        budgetInputText_(

          input,

          'active',

          oldRow[9] || 'نعم'

        );


      var notes =
        budgetInputText_(

          input,

          'notes',

          oldRow[10]

        );


      oldRow[3] =
        monthlyTopUp === null
          ? ''
          : monthlyTopUp;


      oldRow[4] =
        openingBalance === null
          ? ''
          : openingBalance;


      oldRow[5] =
        percentages.اساسي === null
          ? ''
          : percentages.اساسي;


      oldRow[6] =
        percentages.استثنائي === null
          ? ''
          : percentages.استثنائي;


      oldRow[7] =
        percentages.ترفيهي === null
          ? ''
          : percentages.ترفيهي;


      oldRow[8] =
        startDate;


      oldRow[9] =
        active;


      oldRow[10] =
        notes;


      rows[rowIndex] =
        oldRow;


      /**
       * لا نسجل إصدارًا جديدًا
       * إلا عندما يكون التوزيع كاملًا.
       */
      if (
        monthlyTopUp !== null &&
        budgetPercentagesValid_(
          percentages
        )
      ) {

        newHistoryRows.push(

          budgetBuildHistoryRow_(

            inputName,

            effectiveDate,

            monthlyTopUp,

            percentages,

            effectiveDate.getMonth() ===
              new Date().getMonth()

              ? 'تطبيق من الشهر الحالي'

              : 'تطبيق من شهر لاحق'

          )

        );

      }

    }
  );


  sheet
    .getRange(
      2,
      1,
      rows.length,
      BUDGET_UNIFIED_HEADERS.length
    )
    .setValues(
      rows
    );


  if (
    newHistoryRows.length
  ) {

    historySheet
      .getRange(

        historySheet.getLastRow() + 1,

        1,

        newHistoryRows.length,

        BUDGET_HISTORY_HEADERS.length

      )
      .setValues(
        newHistoryRows
      );

  }


  formatBudgetsSheet_(
    sheet
  );


  budgetGetOrCreateHistorySheet_(
    ss
  );


  SpreadsheetApp.flush();


  return {

    success:
      true,

    updated:
      inputs.length,

    historyAdded:
      newHistoryRows.length,

    effectiveFrom:
      Utilities.formatDate(

        effectiveDate,

        appTimeZone(
          ss
        ),

        'dd/MM/yyyy'

      )

  };

}


/**
 * اسم أبسط لاستخدامه لاحقًا
 * من لوحة التحكم.
 */
function saveBudgetDistribution(
  payload
) {

  return saveBudgetSettings(
    payload
  );

}


/* ==========================================================
 * سجل الإعدادات
 * ==========================================================
 */


function budgetBuildHistoryRow_(

  accountName,

  effectiveDate,

  monthlyTopUp,

  percentages,

  notes

) {

  var id =

    'BUD-' +

    Utilities.formatDate(

      new Date(),

      BUDGET_ANALYTICS_CONFIG.TIME_ZONE,

      'yyyyMMddHHmmss'

    )

    +

    '-' +

    Math.floor(
      Math.random() * 100000
    );


  return [

    id,

    accountName,

    budgetMonthStart_(
      effectiveDate
    ),

    monthlyTopUp,

    percentages.اساسي,

    percentages.استثنائي,

    percentages.ترفيهي,

    new Date(),

    notes || ''

  ];

}


/**
 * current = الشهر الحالي
 * next = الشهر التالي
 */
function budgetResolveEffectiveDate_(
  value
) {

  var normalized =
    budgetAnalyticsNormalize_(
      value
    );


  var now =
    new Date();


  if (
    normalized === 'next' ||
    normalized === 'الشهر التالي'
  ) {

    return new Date(
      now.getFullYear(),
      now.getMonth() + 1,
      1
    );

  }


  if (
    normalized === 'current' ||
    normalized === 'الشهر الحالي' ||
    normalized === ''
  ) {

    return new Date(
      now.getFullYear(),
      now.getMonth(),
      1
    );

  }


  var date =
    budgetAnalyticsDate_(
      value
    );


  if (
    !date
  ) {

    throw new Error(
      'تاريخ سريان إعداد الميزانية غير صحيح.'
    );

  }


  return budgetMonthStart_(
    date
  );

}


/* ==========================================================
 * تقدم الشهر والسنة
 * ==========================================================
 */


function budgetAnalyticsMonthProgress_(
  date
) {

  var year =
    date.getFullYear();


  var month =
    date.getMonth();


  var day =
    date.getDate();


  var daysInMonth =
    new Date(
      year,
      month + 1,
      0
    ).getDate();


  return Math.min(

    1,

    Math.max(
      0,
      day /
      daysInMonth
    )

  );

}


function budgetAnalyticsYearProgress_(
  date
) {

  var start =
    new Date(
      date.getFullYear(),
      0,
      1
    );


  var nextYear =
    new Date(
      date.getFullYear() + 1,
      0,
      1
    );


  var elapsed =

    date.getTime() -
    start.getTime() +
    86400000;


  var total =

    nextYear.getTime() -
    start.getTime();


  return Math.min(

    1,

    Math.max(
      0,
      elapsed /
      total
    )

  );

}


/* ==========================================================
 * مساعدات الميزانية
 * ==========================================================
 */


function budgetMonthStart_(
  value
) {

  var date =
    budgetAnalyticsDate_(
      value
    );


  if (
    !date
  ) {

    return null;

  }


  return new Date(
    date.getFullYear(),
    date.getMonth(),
    1
  );

}


function budgetMonthSequence_(

  start,

  end

) {

  if (
    !start ||
    !end ||
    start.getTime() >
      end.getTime()
  ) {

    return [];

  }


  var result =
    [];


  var current =
    new Date(
      start.getFullYear(),
      start.getMonth(),
      1
    );


  var last =
    new Date(
      end.getFullYear(),
      end.getMonth(),
      1
    );


  while (
    current.getTime() <=
    last.getTime()
  ) {

    result.push(
      new Date(
        current.getTime()
      )
    );


    current =
      new Date(

        current.getFullYear(),

        current.getMonth() + 1,

        1

      );

  }


  return result;

}


function budgetPercentagesValid_(
  percentages
) {

  if (
    !percentages
  ) {

    return false;

  }


  var values = [

    percentages.اساسي,

    percentages.استثنائي,

    percentages.ترفيهي

  ];


  if (
    values.some(
      function(value) {

        return (
          value === null ||
          !Number.isFinite(
            Number(
              value
            )
          ) ||
          Number(
            value
          ) < 0 ||
          Number(
            value
          ) > 100
        );

      }
    )
  ) {

    return false;

  }


  return (
    Math.abs(
      budgetPercentageTotal_(
        percentages
      ) -
      100
    ) <
    0.001
  );

}


function budgetPercentageTotal_(
  percentages
) {

  if (
    !percentages
  ) {

    return 0;

  }


  return budgetAnalyticsRound_(

    Number(
      percentages.اساسي || 0
    ) +

    Number(
      percentages.استثنائي || 0
    ) +

    Number(
      percentages.ترفيهي || 0
    )

  );

}


function budgetAnalyticsAccountKey_(

  scope,

  period

) {

  return [

    budgetAnalyticsNormalize_(
      scope
    ),

    budgetAnalyticsNormalize_(
      period
    )

  ].join(
    '|'
  );

}


/**
 * اسم الدالة القديمة محفوظ.
 */
function budgetAnalyticsKey_(

  type,

  scope,

  category

) {

  return [

    budgetAnalyticsNormalize_(
      type
    ),

    budgetAnalyticsNormalize_(
      scope
    ),

    budgetAnalyticsNormalize_(
      category
    )

  ].join(
    '|'
  );

}


function budgetOptionalNumber_(
  value
) {

  var text =
    budgetAnalyticsText_(
      value
    );


  if (
    text === ''
  ) {

    return null;

  }


  return budgetAnalyticsNumber_(
    value
  );

}


function budgetInputNumber_(

  object,

  keys,

  fallback

) {

  for (
    var index = 0;
    index < keys.length;
    index++
  ) {

    var key =
      keys[index];


    if (
      Object.prototype
        .hasOwnProperty
        .call(
          object,
          key
        )
    ) {

      if (
        object[key] === '' ||
        object[key] === null
      ) {

        return null;

      }


      return budgetAnalyticsNumber_(
        object[key]
      );

    }

  }


  return fallback;

}


function budgetInputText_(

  object,

  key,

  fallback

) {

  if (
    Object.prototype
      .hasOwnProperty
      .call(
        object,
        key
      )
  ) {

    return budgetAnalyticsText_(
      object[key]
    );

  }


  return budgetAnalyticsText_(
    fallback
  );

}


function budgetInputDate_(

  object,

  key,

  fallback

) {

  if (
    Object.prototype
      .hasOwnProperty
      .call(
        object,
        key
      )
  ) {

    var date =
      budgetAnalyticsDate_(
        object[key]
      );


    if (
      !date
    ) {

      throw new Error(
        'تاريخ البداية غير صحيح.'
      );

    }


    return budgetMonthStart_(
      date
    );

  }


  return budgetMonthStart_(
    fallback
  );

}


/* ==========================================================
 * مساعدات قديمة محفوظة
 * ==========================================================
 */


function budgetAnalyticsIsActive_(
  value
) {

  var text =
    budgetAnalyticsNormalize_(
      value
    );


  return (
    text === 'نعم' ||
    text === 'yes' ||
    text === 'true' ||
    text === '1' ||
    text === 'نشط'
  );

}


function budgetAnalyticsNumber_(
  value
) {

  if (
    typeof value === 'number'
  ) {

    return Number.isFinite(
      value
    )
      ? value
      : 0;

  }


  var text =
    budgetAnalyticsLatinDigits_(

      budgetAnalyticsText_(
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


function budgetAnalyticsDate_(
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
    budgetAnalyticsLatinDigits_(

      budgetAnalyticsText_(
        value
      )

    );


  if (
    !text
  ) {

    return null;

  }


  /**
   * yyyy-MM-dd
   */
  var isoMatch =
    text.match(
      /^(\d{4})-(\d{1,2})-(\d{1,2})$/
    );


  if (
    isoMatch
  ) {

    return new Date(

      Number(
        isoMatch[1]
      ),

      Number(
        isoMatch[2]
      ) - 1,

      Number(
        isoMatch[3]
      )

    );

  }


  /**
   * dd/MM/yyyy
   */
  var match =
    text.match(

      /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/

    );


  if (
    match
  ) {

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


  return null;

}


function budgetAnalyticsLatinDigits_(
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


function budgetAnalyticsNormalize_(
  value
) {

  return budgetAnalyticsText_(
    value
  )

    .toLowerCase()

    .replace(
      /[أإآ]/g,
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


function budgetAnalyticsText_(
  value
) {

  return String(

    value === null ||
    value === undefined

      ? ''

      : value

  ).trim();

}


function budgetAnalyticsRound_(
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


/* ==========================================================
 * الاختبارات
 * ==========================================================
 */


/**
 * اسم الاختبار القديم محفوظ.
 */
function testBudgetAnalytics() {

  var result =
    getBudgetAnalytics({

      scope:
        'all',

      category:
        'all'

    });


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
 * اختبار النظام الموحد.
 *
 * لا يضيف مبالغ ولا يغير النسب.
 */
function testBudgetSystem() {

  var ss =
    appActiveSpreadsheet();


  var setupResult =
    setupBudgetAnalyticsSheet();


  var settings =
    getBudgetSettings();


  if (
    settings.accounts.length !== 4
  ) {

    throw new Error(
      'يجب أن يحتوي النظام على أربع ميزانيات موحدة.'
    );

  }


  var analytics =
    getBudgetAnalytics({

      scope:
        'all',

      category:
        'all'

    });


  if (
    !analytics.monthly ||
    !analytics.annual ||
    !analytics.overall
  ) {

    throw new Error(
      'فشل إنشاء مؤشرات الميزانية.'
    );

  }


  if (
    analytics.monthly.cards.length !== 3 ||
    analytics.annual.cards.length !== 3
  ) {

    throw new Error(
      'فشل إنشاء فئات اساسي / استثنائي / ترفيهي.'
    );

  }


  var historySheet =
    budgetGetOrCreateHistorySheet_(
      ss
    );


  var result = {

    success:
      true,

    setup:
      setupResult,

    accounts:
      settings.accounts.length,

    monthlyCards:
      analytics.monthly.cards.length,

    annualCards:
      analytics.annual.cards.length,

    historyRows:
      Math.max(
        0,
        historySheet.getLastRow() - 1
      ),

    completedAt:
      Utilities.formatDate(

        new Date(),

        appTimeZone(
          ss
        ),

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

    'نجح اختبار 50_Budget.gs',

    'اختبار النظام',

    8

  );


  return result;

}
/* ==========================================================
 * ACCOUNT BALANCE NULL FIX V2.1
 *
 * إصلاح:
 * null لا يتحول إلى رصيد 0.000
 *
 * لا يحذف عمليات.
 * لا يغير A:O.
 * ==========================================================
 */


/* ==========================================================
 * استبدال محلل بيانات الحساب فقط
 * ==========================================================
 */

operationsAccountParseMessageV2_ =
function(
  messageId,
  itemName
) {

  messageId =
    appText(
      messageId
    );


  if (
    !messageId
  ) {

    return {
      success: false,
      reason: 'missing_message_id'
    };

  }


  var message =
    null;


  try {

    message =
      gmailGetMessage(
        messageId
      );

  } catch (error) {

    message =
      null;

  }


  if (
    !message
  ) {

    return {
      success: false,
      reason: 'message_not_found'
    };

  }


  var parsed =
    null;


  try {

    parsed =
      bankParseMessage(

        gmailPlainBody(
          message
        ),

        itemName,

        message.getDate(),

        message.getFrom(),

        message.getSubject()

      );

  } catch (error) {

    return {

      success:
        false,

      reason:
        'parse_error',

      error:
        operationsErrorMessage_(
          error
        )

    };

  }


  if (
    !parsed
  ) {

    return {
      success: false,
      reason: 'empty_parser'
    };

  }


  if (
    !parsed.accountDetected ||
    !appText(
      parsed.accountKey
    )
  ) {

    return {

      success:
        true,

      detected:
        false,

      bank:
        appText(
          parsed.bank
        )

    };

  }


  /*
   * التصحيح المهم:
   *
   * لا نستخدم:
   *
   * Number(null)
   *
   * لأن نتيجتها 0.
   */
  var rawBalance =
    parsed.availableBalance;


  var hasBalance = (

    rawBalance !== null

    &&

    rawBalance !== undefined

    &&

    rawBalance !== ''

    &&

    Number.isFinite(
      Number(
        rawBalance
      )
    )

  );


  var balanceDate =
    null;


  if (
    hasBalance &&
    parsed.balanceDate instanceof Date &&
    !isNaN(
      parsed.balanceDate.getTime()
    )
  ) {

    balanceDate =
      parsed.balanceDate;

  }


  return {

    success:
      true,

    detected:
      true,

    accountKey:
      appText(
        parsed.accountKey
      ),

    budgetKey:
      appText(
        parsed.budgetKey
      ),

    availableBalance:

      hasBalance

        ? Number(
            rawBalance
          )

        : null,

    movement:
      appText(
        parsed.accountMovement
      ),

    balanceDate:
      balanceDate,

    bank:
      appText(
        parsed.bank
      )

  };

};


/* ==========================================================
 * اختبار الأرصدة الصفرية المشبوهة
 *
 * قراءة فقط
 * ==========================================================
 */

function testFalseZeroBalancesV21() {

  var ss =
    appActiveSpreadsheet();


  var sheet =
    appSheet(
      ss,
      APP_CONFIG.OPERATIONS_SHEET
    );


  var lastRow =
    sheet.getLastRow();


  if (
    lastRow < 2
  ) {

    return {

      success:
        true,

      version:
        'FALSE_ZERO_BALANCE_TEST_V2_1',

      candidates:
        0

    };

  }


  var rows =
    sheet
      .getRange(
        2,
        1,
        lastRow - 1,
        20
      )
      .getValues();


  var candidates =
    [];


  var byBudget =
    {};


  rows.forEach(
    function(
      row,
      index
    ) {

      var accountKey =
        appText(
          row[15]
        );


      var budgetKey =
        appText(
          row[16]
        );


      var balance =
        row[17];


      var balanceDate =
        row[19];


      if (
        !accountKey
      ) {

        return;

      }


      /*
       * الرصيد 0 بدون تاريخ رصيد
       * هو النمط الناتج عن الخطأ السابق.
       */
      var numericBalance =
        Number(
          balance
        );


      var hasBalanceDate = (

        balanceDate instanceof Date

        &&

        !isNaN(
          balanceDate.getTime()
        )

      );


      if (
        numericBalance !== 0 ||
        hasBalanceDate
      ) {

        return;

      }


      candidates.push({

        row:
          index + 2,

        item:
          appText(
            row[2]
          ),

        accountKey:
          accountKey,

        budgetKey:
          budgetKey

      });


      byBudget[
        budgetKey || accountKey
      ] =

        (
          byBudget[
            budgetKey || accountKey
          ] || 0
        )

        + 1;

    }
  );


  var result = {

    success:
      true,

    version:
      'FALSE_ZERO_BALANCE_TEST_V2_1',

    candidates:
      candidates.length,

    byBudget:
      byBudget,

    preview:
      candidates.slice(
        0,
        15
      ),

    safety:
      'قراءة فقط ولم يتم تعديل أي خلية.'

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
/* ==========================================================
 * 51_AccountBudgetV2.gs
 * ACCOUNT BUDGET ENGINE V2
 *
 * نظام الموازنات حسب الحساب البنكي الفعلي.
 *
 * يعتمد على العمليات:
 * P = معرف الحساب
 * Q = مصدر الموازنة
 * R = الرصيد الفعلي
 * S = اتجاه الحساب
 * T = تاريخ الرصيد
 *
 * آمن:
 * - لا يعدل A:T في العمليات.
 * - لا يعدل الميزانيات القديمة.
 * - لا يعدل تحديث الكل أو FAST.
 * ==========================================================
 */


var ACCOUNT_BUDGET_V2_CONFIG = Object.freeze({
  SHEET: 'موازنات الحسابات',
  OPERATIONS_SHEET: 'العمليات',
  TIME_ZONE: 'Asia/Muscat'
});


var ACCOUNT_BUDGET_V2_HEADERS = [
  'الشهر',
  'معرف الحساب',
  'الموازنة',
  'الحساب',
  'الموازنة الشهرية',
  'نشط',
  'ملاحظات',
  'آخر حفظ'
];


/* ==========================================================
 * أدوات أساسية مستقلة
 * ==========================================================
 */

function accountBudgetSpreadsheetV2_() {

  if (
    typeof appActiveSpreadsheet === 'function'
  ) {
    return appActiveSpreadsheet();
  }

  return SpreadsheetApp.getActiveSpreadsheet();
}


function accountBudgetTextV2_(value) {

  if (
    value === null ||
    value === undefined
  ) {
    return '';
  }

  return String(value)
    .replace(/\s+/g, ' ')
    .trim();
}


function accountBudgetNumberV2_(value) {

  if (
    value === '' ||
    value === null ||
    value === undefined
  ) {
    return 0;
  }

  var number = Number(value);

  return Number.isFinite(number)
    ? number
    : 0;
}


function accountBudgetRoundV2_(value) {

  return Math.round(
    accountBudgetNumberV2_(value) * 1000
  ) / 1000;
}


function accountBudgetNormalizeV2_(value) {

  return accountBudgetTextV2_(value)
    .toLowerCase()
    .replace(/[أإآ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/\s+/g, ' ')
    .trim();
}


function accountBudgetIsActiveV2_(value) {

  var text =
    accountBudgetNormalizeV2_(value);

  return !(
    text === 'لا' ||
    text === 'false' ||
    text === '0' ||
    text === 'غير نشط'
  );
}


/* ==========================================================
 * الحسابات المعتمدة
 * ==========================================================
 */

function accountBudgetDefinitionsV2_() {

  return [
    {
      accountKey: 'AHLI_001',
      budgetKey: 'عائلي شهري',
      accountName: 'الأهلي 001',
      type: 'spending'
    },

    {
      accountKey: 'AHLI_002',
      budgetKey: 'عائلي سنوي',
      accountName: 'الأهلي 002',
      type: 'spending'
    },

    {
      accountKey: 'SOHAR_7010',
      budgetKey: 'شخصي شهري',
      accountName: 'صحار 7010',
      type: 'spending'
    },

    {
      accountKey: 'SOHAR_7240',
      budgetKey: 'شخصي سنوي',
      accountName: 'صحار 7240',
      type: 'spending'
    },

    {
      accountKey: 'MEETHAQ_21',
      budgetKey: 'تأمين المصروف',
      accountName: 'ميثاق 21',
      type: 'expense_insurance'
    },

    {
      accountKey: 'MEETHAQ_22',
      budgetKey: 'تأمين الدخل',
      accountName: 'ميثاق 22',
      type: 'income_insurance'
    }
  ];
}


/* ==========================================================
 * التاريخ والشهر
 * ==========================================================
 */

function accountBudgetValidDateV2_(value) {

  if (
    value instanceof Date &&
    !isNaN(value.getTime())
  ) {
    return new Date(value.getTime());
  }

  return null;
}


function accountBudgetMonthStartV2_(value) {

  var date =
    accountBudgetValidDateV2_(value);

  if (!date) {
    return null;
  }

  return new Date(
    date.getFullYear(),
    date.getMonth(),
    1
  );
}


function accountBudgetMonthKeyV2_(value) {

  if (!value) {
    return '';
  }

  return Utilities.formatDate(
    value,
    ACCOUNT_BUDGET_V2_CONFIG.TIME_ZONE,
    'yyyy-MM'
  );
}


function accountBudgetResolveMonthV2_(value) {

  if (
    value instanceof Date &&
    !isNaN(value.getTime())
  ) {
    return accountBudgetMonthStartV2_(value);
  }

  var text =
    accountBudgetTextV2_(value);

  if (!text) {
    return accountBudgetMonthStartV2_(
      new Date()
    );
  }

  var match =
    text.match(/^(\d{4})-(\d{1,2})$/);

  if (match) {

    return new Date(
      Number(match[1]),
      Number(match[2]) - 1,
      1
    );
  }

  match =
    text.match(/^(\d{1,2})\/(\d{4})$/);

  if (match) {

    return new Date(
      Number(match[2]),
      Number(match[1]) - 1,
      1
    );
  }

  throw new Error(
    'صيغة الشهر غير صحيحة. استخدم YYYY-MM'
  );
}


/* ==========================================================
 * إنشاء ورقة موازنات الحسابات
 * ==========================================================
 */

function setupAccountBudgetsV2() {

  var ss =
    accountBudgetSpreadsheetV2_();

  var sheet =
    ss.getSheetByName(
      ACCOUNT_BUDGET_V2_CONFIG.SHEET
    );

  if (!sheet) {

    sheet =
      ss.insertSheet(
        ACCOUNT_BUDGET_V2_CONFIG.SHEET
      );
  }

  if (
    sheet.getMaxColumns() <
    ACCOUNT_BUDGET_V2_HEADERS.length
  ) {

    sheet.insertColumnsAfter(
      sheet.getMaxColumns(),
      ACCOUNT_BUDGET_V2_HEADERS.length -
      sheet.getMaxColumns()
    );
  }

  sheet
    .getRange(
      1,
      1,
      1,
      ACCOUNT_BUDGET_V2_HEADERS.length
    )
    .setValues([
      ACCOUNT_BUDGET_V2_HEADERS
    ])
    .setFontWeight('bold')
    .setHorizontalAlignment('center');

  sheet.setRightToLeft(true);
  sheet.setFrozenRows(1);

  var widths = [
    120,
    150,
    170,
    150,
    150,
    80,
    250,
    180
  ];

  widths.forEach(
    function(width, index) {
      sheet.setColumnWidth(
        index + 1,
        width
      );
    }
  );

  var monthStart =
    accountBudgetMonthStartV2_(
      new Date()
    );

  accountBudgetEnsureMonthRowsV2_(
    sheet,
    monthStart
  );

  accountBudgetFormatSheetV2_(
    sheet
  );

  SpreadsheetApp.flush();

  return {
    success: true,
    version: 'ACCOUNT_BUDGET_V2',
    sheet: ACCOUNT_BUDGET_V2_CONFIG.SHEET,
    accounts: accountBudgetDefinitionsV2_().length,
    month: accountBudgetMonthKeyV2_(monthStart),
    safety:
      'لم يتم تعديل العمليات أو الميزانيات القديمة.'
  };
}


/* ==========================================================
 * ضمان وجود 6 حسابات لكل شهر
 * ==========================================================
 */

function accountBudgetEnsureMonthRowsV2_(
  sheet,
  monthStart
) {

  var definitions =
    accountBudgetDefinitionsV2_();

  var existing = {};

  if (
    sheet.getLastRow() >= 2
  ) {

    var rows =
      sheet
        .getRange(
          2,
          1,
          sheet.getLastRow() - 1,
          ACCOUNT_BUDGET_V2_HEADERS.length
        )
        .getValues();

    rows.forEach(
      function(row) {

        var date =
          accountBudgetValidDateV2_(
            row[0]
          );

        var accountKey =
          accountBudgetTextV2_(
            row[1]
          );

        if (
          !date ||
          !accountKey
        ) {
          return;
        }

        existing[
          accountBudgetMonthKeyV2_(date) +
          '|' +
          accountKey
        ] = true;
      }
    );
  }

  var output = [];

  definitions.forEach(
    function(definition) {

      var key =
        accountBudgetMonthKeyV2_(
          monthStart
        ) +
        '|' +
        definition.accountKey;

      if (existing[key]) {
        return;
      }

      output.push([
        monthStart,
        definition.accountKey,
        definition.budgetKey,
        definition.accountName,
        '',
        'نعم',
        '',
        new Date()
      ]);
    }
  );

  if (output.length) {

    sheet
      .getRange(
        sheet.getLastRow() + 1,
        1,
        output.length,
        ACCOUNT_BUDGET_V2_HEADERS.length
      )
      .setValues(output);
  }

  return output.length;
}


/* ==========================================================
 * التنسيق
 * ==========================================================
 */

function accountBudgetFormatSheetV2_(sheet) {

  if (
    sheet.getLastRow() < 2
  ) {
    return;
  }

  var count =
    sheet.getLastRow() - 1;

  sheet
    .getRange(2, 1, count, 1)
    .setNumberFormat('MM/yyyy');

  sheet
    .getRange(2, 5, count, 1)
    .setNumberFormat('0.000');

  sheet
    .getRange(2, 8, count, 1)
    .setNumberFormat(
      'dd/MM/yyyy HH:mm:ss'
    );

  var rule =
    SpreadsheetApp
      .newDataValidation()
      .requireValueInList(
        ['نعم', 'لا'],
        true
      )
      .setAllowInvalid(false)
      .build();

  sheet
    .getRange(2, 6, count, 1)
    .setDataValidation(rule);
}


/* ==========================================================
 * حفظ الموازنة الشهرية
 * ==========================================================
 */

function saveAccountMonthlyBudgetV2(payload) {

  payload = payload || {};

  var ss =
    accountBudgetSpreadsheetV2_();

  var sheet =
    ss.getSheetByName(
      ACCOUNT_BUDGET_V2_CONFIG.SHEET
    );

  if (!sheet) {

    setupAccountBudgetsV2();

    sheet =
      ss.getSheetByName(
        ACCOUNT_BUDGET_V2_CONFIG.SHEET
      );
  }

  var monthStart =
    accountBudgetResolveMonthV2_(
      payload.month
    );

  accountBudgetEnsureMonthRowsV2_(
    sheet,
    monthStart
  );

  var inputs =
    Array.isArray(payload.accounts)
      ? payload.accounts
      : [payload];

  var definitions =
    accountBudgetDefinitionsV2_();

  var rows =
    sheet
      .getRange(
        2,
        1,
        sheet.getLastRow() - 1,
        ACCOUNT_BUDGET_V2_HEADERS.length
      )
      .getValues();

  var updated = 0;

  inputs.forEach(
    function(input) {

      input = input || {};

      var accountKey =
        accountBudgetTextV2_(
          input.accountKey
        );

      var budgetKey =
        accountBudgetTextV2_(
          input.budgetKey
        );

      var definition =
        definitions.find(
          function(item) {

            if (accountKey) {
              return (
                item.accountKey ===
                accountKey
              );
            }

            return (
              item.budgetKey ===
              budgetKey
            );
          }
        );

      if (!definition) {

        throw new Error(
          'الحساب غير معروف في نظام الموازنات.'
        );
      }

      var budgetValue =
        input.budget;

      if (
        budgetValue === '' ||
        budgetValue === null ||
        budgetValue === undefined
      ) {
        budgetValue = '';
      }

      else {

        budgetValue =
          Number(budgetValue);

        if (
          !Number.isFinite(budgetValue) ||
          budgetValue < 0
        ) {

          throw new Error(
            'قيمة الموازنة غير صحيحة: ' +
            definition.budgetKey
          );
        }
      }

      var targetRow = -1;

      for (
        var index = 0;
        index < rows.length;
        index++
      ) {

        var rowMonth =
          accountBudgetValidDateV2_(
            rows[index][0]
          );

        if (!rowMonth) {
          continue;
        }

        if (
          accountBudgetMonthKeyV2_(
            rowMonth
          ) !==
          accountBudgetMonthKeyV2_(
            monthStart
          )
        ) {
          continue;
        }

        if (
          accountBudgetTextV2_(
            rows[index][1]
          ) !==
          definition.accountKey
        ) {
          continue;
        }

        targetRow =
          index + 2;

        break;
      }

      if (
        targetRow < 0
      ) {

        throw new Error(
          'تعذر العثور على صف الحساب.'
        );
      }

      sheet
        .getRange(
          targetRow,
          5,
          1,
          4
        )
        .setValues([[
          budgetValue,
          'نعم',
          accountBudgetTextV2_(
            input.notes
          ),
          new Date()
        ]]);

      updated++;
    }
  );

  accountBudgetFormatSheetV2_(
    sheet
  );

  SpreadsheetApp.flush();

  return {
    success: true,
    version: 'ACCOUNT_BUDGET_SAVE_V2',
    month: accountBudgetMonthKeyV2_(monthStart),
    updated: updated
  };
}


/* ==========================================================
 * قراءة إعدادات الشهر
 * ==========================================================
 */

function accountBudgetReadMonthSettingsV2_(
  ss,
  monthStart
) {

  var sheet =
    ss.getSheetByName(
      ACCOUNT_BUDGET_V2_CONFIG.SHEET
    );

  if (!sheet) {

    setupAccountBudgetsV2();

    sheet =
      ss.getSheetByName(
        ACCOUNT_BUDGET_V2_CONFIG.SHEET
      );
  }

  accountBudgetEnsureMonthRowsV2_(
    sheet,
    monthStart
  );

  var result = {};

  if (
    sheet.getLastRow() < 2
  ) {
    return result;
  }

  var rows =
    sheet
      .getRange(
        2,
        1,
        sheet.getLastRow() - 1,
        ACCOUNT_BUDGET_V2_HEADERS.length
      )
      .getValues();

  rows.forEach(
    function(row) {

      var rowMonth =
        accountBudgetValidDateV2_(
          row[0]
        );

      if (!rowMonth) {
        return;
      }

      if (
        accountBudgetMonthKeyV2_(
          rowMonth
        ) !==
        accountBudgetMonthKeyV2_(
          monthStart
        )
      ) {
        return;
      }

      var accountKey =
        accountBudgetTextV2_(
          row[1]
        );

      if (!accountKey) {
        return;
      }

      var rawBudget =
        row[4];

      var hasBudget = !(
        rawBudget === '' ||
        rawBudget === null ||
        rawBudget === undefined
      );

      result[accountKey] = {
        accountKey: accountKey,
        budgetKey:
          accountBudgetTextV2_(row[2]),
        accountName:
          accountBudgetTextV2_(row[3]),
        budget:
          hasBudget
            ? Math.max(
                0,
                accountBudgetNumberV2_(
                  rawBudget
                )
              )
            : null,
        active:
          accountBudgetIsActiveV2_(
            row[5]
          ),
        notes:
          accountBudgetTextV2_(
            row[6]
          )
      };
    }
  );

  return result;
}


/* ==========================================================
 * قراءة العمليات A:T
 * ==========================================================
 */

function accountBudgetReadOperationsV2_(
  ss
) {

  var sheet =
    ss.getSheetByName(
      ACCOUNT_BUDGET_V2_CONFIG.OPERATIONS_SHEET
    );

  if (
    !sheet ||
    sheet.getLastRow() < 2 ||
    sheet.getMaxColumns() < 20
  ) {
    return [];
  }

  var rows =
    sheet
      .getRange(
        2,
        1,
        sheet.getLastRow() - 1,
        20
      )
      .getValues();

  var byMessageId =
    new Map();

  rows.forEach(
    function(row) {

      var messageId =
        accountBudgetTextV2_(
          row[0]
        );

      var date =
        accountBudgetValidDateV2_(
          row[1]
        );

      if (
        !messageId ||
        !date
      ) {
        return;
      }

      var rawBalance =
        row[17];

      var hasBalance = !(
        rawBalance === '' ||
        rawBalance === null ||
        rawBalance === undefined
      );

      var record = {
        messageId: messageId,
        date: date,

        item:
          accountBudgetTextV2_(
            row[2]
          ) || 'غير محدد',

        amount:
          Math.abs(
            accountBudgetNumberV2_(
              row[4]
            )
          ),

        operationType:
          accountBudgetTextV2_(
            row[6]
          ),

        bank:
          accountBudgetTextV2_(
            row[8]
          ),

        status:
          accountBudgetTextV2_(
            row[10]
          ),

        category:
          accountBudgetTextV2_(
            row[12]
          ),

        period:
          accountBudgetTextV2_(
            row[13]
          ),

        scope:
          accountBudgetTextV2_(
            row[14]
          ),

        accountKey:
          accountBudgetTextV2_(
            row[15]
          ),

        budgetKey:
          accountBudgetTextV2_(
            row[16]
          ),

        balance:
          hasBalance
            ? accountBudgetNumberV2_(
                rawBalance
              )
            : null,

        accountMovement:
          accountBudgetTextV2_(
            row[18]
          ).toLowerCase(),

        balanceDate:
          accountBudgetValidDateV2_(
            row[19]
          )
      };

      byMessageId.set(
        messageId,
        record
      );
    }
  );

  return Array.from(
    byMessageId.values()
  );
}


/* ==========================================================
 * تحديد الحركات
 * ==========================================================
 */

function accountBudgetIsInternalV2_(
  operation
) {

  var type =
    accountBudgetNormalizeV2_(
      operation.operationType
    );

  var status =
    accountBudgetNormalizeV2_(
      operation.status
    );

  return (
    type.indexOf('تحويل داخلي') !== -1 ||
    status.indexOf('مستبعد') !== -1
  );
}


function accountBudgetIsExpenseV2_(
  operation
) {

  if (
    !operation ||
    !operation.accountKey
  ) {
    return false;
  }


  if (
    accountBudgetIsInternalV2_(
      operation
    )
  ) {

      var operationType =
    accountBudgetNormalizeV2_(
      operation.operationType
    );

  if (
    operationType.indexOf(
      'استرداد'
    ) !== -1
  ) {
    return false;
  }

    return false;
  }


  var operationType =
    accountBudgetNormalizeV2_(
      operation.operationType
    );


  /*
   * الاسترداد لا يعتبر مصروفًا،
   * حتى لو ظهرت الحركة البنكية كـ debit.
   */
  if (
    operationType.indexOf(
      'استرداد'
    ) !== -1
  ) {
    return false;
  }


  return (
    operation.accountMovement ===
    'debit'
  );
}


function accountBudgetIsCreditV2_(
  operation
) {

  if (
    !operation ||
    !operation.accountKey
  ) {
    return false;
  }

  if (
    accountBudgetIsInternalV2_(
      operation
    )
  ) {
    return false;
  }

  return (
    operation.accountMovement ===
    'credit'
  );
}


/* ==========================================================
 * آخر رصيد معروف
 * ==========================================================
 */

function accountBudgetBalanceTimeV2_(
  operation
) {

  var date =
    operation.balanceDate ||
    operation.date;

  return (
    date instanceof Date
      ? date.getTime()
      : 0
  );
}


function accountBudgetFindLatestBalanceV2_(
  operations,
  periodEnd
) {

  var candidates =
    operations
      .filter(
        function(operation) {

          if (
            operation.balance === null
          ) {
            return false;
          }

          var date =
            operation.balanceDate ||
            operation.date;

          return (
            date <= periodEnd
          );
        }
      )
      .sort(
        function(a, b) {
          return (
            accountBudgetBalanceTimeV2_(b) -
            accountBudgetBalanceTimeV2_(a)
          );
        }
      );

  if (!candidates.length) {

    return {
      balance: null,
      date: ''
    };
  }

  var latest =
    candidates[0];

  var date =
    latest.balanceDate ||
    latest.date;

  return {
    balance:
      accountBudgetRoundV2_(
        latest.balance
      ),

    date:
      Utilities.formatDate(
        date,
        ACCOUNT_BUDGET_V2_CONFIG.TIME_ZONE,
        'dd/MM/yyyy HH:mm:ss'
      )
  };
}


/* ==========================================================
 * الرصيد الافتتاحي
 * ==========================================================
 */

function accountBudgetFindOpeningBalanceV2_(
  operations,
  monthStart,
  periodEnd
) {

  var prior =
    operations
      .filter(
        function(operation) {

          if (
            operation.balance === null
          ) {
            return false;
          }

          var date =
            operation.balanceDate ||
            operation.date;

          return (
            date < monthStart
          );
        }
      )
      .sort(
        function(a, b) {
          return (
            accountBudgetBalanceTimeV2_(b) -
            accountBudgetBalanceTimeV2_(a)
          );
        }
      );

  if (prior.length) {

    return {
      balance:
        accountBudgetRoundV2_(
          prior[0].balance
        ),

      source:
        'آخر رصيد قبل بداية الشهر'
    };
  }

  var first =
    operations
      .filter(
        function(operation) {

          return (
            operation.balance !== null &&
            operation.date >= monthStart &&
            operation.date <= periodEnd
          );
        }
      )
      .sort(
        function(a, b) {
          return a.date - b.date;
        }
      )[0];

  if (!first) {

    return {
      balance: null,
      source: 'غير متوفر'
    };
  }

  var estimated =
    first.balance;

  if (
    first.accountMovement === 'debit'
  ) {
    estimated += first.amount;
  }

  else if (
    first.accountMovement === 'credit'
  ) {
    estimated -= first.amount;
  }

  return {
    balance:
      accountBudgetRoundV2_(
        estimated
      ),

    source:
      'تقديري من أول عملية في الشهر'
  };
}


/* ==========================================================
 * حالة الموازنة
 * ==========================================================
 */

function accountBudgetStatusV2_(
  budget,
  spent
) {

  if (
    budget === null ||
    budget === undefined
  ) {

    return {
      code: 'undefined',
      label: 'غير محدد',
      level: 'neutral'
    };
  }

  if (budget === 0) {

    if (spent > 0) {

      return {
        code: 'over',
        label: 'متجاوز',
        level: 'danger'
      };
    }

    return {
      code: 'available',
      label: 'متاح',
      level: 'good'
    };
  }

  var usage =
    spent / budget * 100;

  if (usage > 100.0005) {

    return {
      code: 'over',
      label: 'متجاوز',
      level: 'danger'
    };
  }

  if (
    Math.abs(
      usage - 100
    ) <= 0.0005
  ) {

    return {
      code: 'complete',
      label: 'مكتمل',
      level: 'warning'
    };
  }

  if (usage >= 80) {

    return {
      code: 'near_limit',
      label: 'قرب الحد',
      level: 'warning'
    };
  }

  return {
    code: 'available',
    label: 'متاح',
    level: 'good'
  };
}


/* ==========================================================
 * تركيز البند
 * ==========================================================
 */

function accountBudgetItemConcentrationV2_(
  share
) {

  share =
    Number(share || 0);

  if (share >= 40) {

    return {
      code: 'concentrated',
      label: 'مركز',
      level: 'danger'
    };
  }

  if (share >= 25) {

    return {
      code: 'high',
      label: 'مرتفع',
      level: 'warning'
    };
  }

  if (share >= 10) {

    return {
      code: 'normal',
      label: 'طبيعي',
      level: 'good'
    };
  }

  return {
    code: 'low',
    label: 'منخفض',
    level: 'low'
  };
}


/* ==========================================================
 * تحليل السلوك لكل بند
 * ==========================================================
 */

function accountBudgetBuildBehaviorV2_(
  accountKey,
  currentExpenses,
  allOperations,
  monthStart
) {

  var totalSpent =
    currentExpenses.reduce(
      function(total, operation) {
        return total + operation.amount;
      },
      0
    );

  var previousStart =
    new Date(
      monthStart.getFullYear(),
      monthStart.getMonth() - 1,
      1
    );

  var previousEnd =
    new Date(
      monthStart.getFullYear(),
      monthStart.getMonth(),
      0,
      23,
      59,
      59,
      999
    );

  var previousMap = {};

  allOperations
    .filter(
      function(operation) {

        return (
          operation.accountKey === accountKey &&
          operation.date >= previousStart &&
          operation.date <= previousEnd &&
          accountBudgetIsExpenseV2_(operation)
        );
      }
    )
    .forEach(
      function(operation) {

        previousMap[
          operation.item
        ] =
          (
            previousMap[
              operation.item
            ] || 0
          ) +
          operation.amount;
      }
    );

  var currentMap = {};

  currentExpenses.forEach(
    function(operation) {

      var item =
        operation.item ||
        'غير محدد';

      if (!currentMap[item]) {

        currentMap[item] = {
          item: item,
          spent: 0,
          count: 0
        };
      }

      currentMap[item].spent +=
        operation.amount;

      currentMap[item].count++;
    }
  );

  var items =
    Object.keys(currentMap)
      .map(
        function(itemName) {

          var record =
            currentMap[itemName];

          var share =
            totalSpent > 0
              ? record.spent /
                totalSpent *
                100
              : 0;

          var average =
            record.count > 0
              ? record.spent /
                record.count
              : 0;

          var previousSpent =
            previousMap[itemName] || 0;

          var changePercent = null;

          if (previousSpent > 0) {

            changePercent =
              (
                record.spent -
                previousSpent
              ) /
              previousSpent *
              100;
          }

          return {
            item: itemName,

            spent:
              accountBudgetRoundV2_(
                record.spent
              ),

            sharePercent:
              accountBudgetRoundV2_(
                share
              ),

            count:
              record.count,

            average:
              accountBudgetRoundV2_(
                average
              ),

            previousSpent:
              accountBudgetRoundV2_(
                previousSpent
              ),

            changePercent:
              changePercent === null
                ? null
                : accountBudgetRoundV2_(
                    changePercent
                  ),

            concentration:
              accountBudgetItemConcentrationV2_(
                share
              )
          };
        }
      )
      .sort(
        function(a, b) {
          return b.spent - a.spent;
        }
      );

  var top3 =
    items
      .slice(0, 3)
      .reduce(
        function(total, item) {
          return (
            total +
            item.sharePercent
          );
        },
        0
      );

  return {
    totalSpent:
      accountBudgetRoundV2_(
        totalSpent
      ),

    itemsCount:
      items.length,

    topItem:
      items.length
        ? items[0]
        : null,

    top3Concentration:
      accountBudgetRoundV2_(
        top3
      ),

    items: items
  };
}


/* ==========================================================
 * بناء حساب واحد
 * ==========================================================
 */

function accountBudgetBuildAccountV2_(
  definition,
  setting,
  operations,
  monthStart,
  periodEnd
) {

  var all =
    operations.filter(
      function(operation) {
        return (
          operation.accountKey ===
          definition.accountKey
        );
      }
    );

  var monthOperations =
    all.filter(
      function(operation) {

        return (
          operation.date >= monthStart &&
          operation.date <= periodEnd
        );
      }
    );

  var expenses =
    monthOperations.filter(
      accountBudgetIsExpenseV2_
    );

  var credits =
    monthOperations.filter(
      accountBudgetIsCreditV2_
    );

  var internal =
    monthOperations.filter(
      accountBudgetIsInternalV2_
    );

  var spent =
    expenses.reduce(
      function(total, operation) {
        return total + operation.amount;
      },
      0
    );

  var credited =
    credits.reduce(
      function(total, operation) {
        return total + operation.amount;
      },
      0
    );

  var monthlyBudget =
    setting &&
    setting.budget !== undefined
      ? setting.budget
      : null;

  if (
    monthlyBudget === ''
  ) {
    monthlyBudget = null;
  }

  var remaining =
    monthlyBudget === null
      ? null
      : monthlyBudget - spent;

  var usage =
    monthlyBudget !== null &&
    monthlyBudget > 0
      ? spent / monthlyBudget * 100
      : (
          monthlyBudget === 0 &&
          spent === 0
            ? 0
            : null
        );

  var overrun =
    monthlyBudget === null
      ? null
      : Math.max(
          0,
          spent - monthlyBudget
        );

  var overrunPercent =
    monthlyBudget !== null &&
    monthlyBudget > 0 &&
    overrun > 0
      ? overrun /
        monthlyBudget *
        100
      : (
          overrun === 0
            ? 0
            : null
        );

  var opening =
    accountBudgetFindOpeningBalanceV2_(
      all,
      monthStart,
      periodEnd
    );

  var latest =
    accountBudgetFindLatestBalanceV2_(
      all,
      periodEnd
    );

  return {
    accountKey:
      definition.accountKey,

    budgetKey:
      definition.budgetKey,

    accountName:
      definition.accountName,

    accountType:
      definition.type,

    monthlyBudget:
      monthlyBudget === null
        ? null
        : accountBudgetRoundV2_(
            monthlyBudget
          ),

    spent:
      accountBudgetRoundV2_(
        spent
      ),

    credits:
      accountBudgetRoundV2_(
        credited
      ),

    remaining:
      remaining === null
        ? null
        : accountBudgetRoundV2_(
            remaining
          ),

    usagePercent:
      usage === null
        ? null
        : accountBudgetRoundV2_(
            usage
          ),

    overrun:
      overrun === null
        ? null
        : accountBudgetRoundV2_(
            overrun
          ),

    overrunPercent:
      overrunPercent === null
        ? null
        : accountBudgetRoundV2_(
            overrunPercent
          ),

    openingBalance:
      opening.balance,

    openingBalanceSource:
      opening.source,

    actualBalance:
      latest.balance,

    balanceDate:
      latest.date,

    operationsCount:
      expenses.length,

    creditsCount:
      credits.length,

    internalTransfers:
      internal.length,

    status:
      accountBudgetStatusV2_(
        monthlyBudget,
        spent
      ),

    behavior:
      accountBudgetBuildBehaviorV2_(
        definition.accountKey,
        expenses,
        operations,
        monthStart
      )
  };
}


/* ==========================================================
 * العمليات غير المحددة
 * ==========================================================
 */

function accountBudgetBuildUnmappedV2_(
  operations,
  monthStart,
  periodEnd
) {

  var rows =
    operations.filter(
      function(operation) {

        return (
          !operation.accountKey &&
          operation.date >= monthStart &&
          operation.date <= periodEnd &&
          !accountBudgetIsInternalV2_(
            operation
          )
        );
      }
    );

  var expenseRows =
    rows.filter(
      function(operation) {

        var type =
          accountBudgetNormalizeV2_(
            operation.operationType
          );

        return (
          type.indexOf('مصروف') !== -1 ||
          type.indexOf('شراء') !== -1 ||
          type.indexOf('دفع') !== -1
        );
      }
    );

  var refundRows =
    rows.filter(
      function(operation) {

        return (
          accountBudgetNormalizeV2_(
            operation.operationType
          )
          .indexOf('استرداد') !== -1
        );
      }
    );

  var amount =
    expenseRows.reduce(
      function(total, operation) {
        return total + operation.amount;
      },
      0
    );

  return {
    count: rows.length,
    expenseCount: expenseRows.length,
    expenseAmount:
      accountBudgetRoundV2_(amount),
    refundCount: refundRows.length
  };
}


/* ==========================================================
 * المؤشر العام
 * ==========================================================
 */

function accountBudgetBuildSummaryV2_(
  accounts
) {

  var configured =
    accounts.filter(
      function(account) {
        return (
          account.monthlyBudget !== null
        );
      }
    );

  var totalBudget =
    configured.reduce(
      function(total, account) {
        return (
          total +
          account.monthlyBudget
        );
      },
      0
    );

  var totalSpent =
    accounts.reduce(
      function(total, account) {
        return total + account.spent;
      },
      0
    );

  var totalRemaining =
    configured.reduce(
      function(total, account) {
        return (
          total +
          account.remaining
        );
      },
      0
    );

  var balances =
    accounts.filter(
      function(account) {
        return (
          account.actualBalance !== null
        );
      }
    );

  var totalBalance =
    balances.reduce(
      function(total, account) {
        return (
          total +
          account.actualBalance
        );
      },
      0
    );

  return {
    accounts:
      accounts.length,

    configuredAccounts:
      configured.length,

    totalBudget:
      configured.length
        ? accountBudgetRoundV2_(
            totalBudget
          )
        : null,

    totalSpent:
      accountBudgetRoundV2_(
        totalSpent
      ),

    totalRemaining:
      configured.length
        ? accountBudgetRoundV2_(
            totalRemaining
          )
        : null,

    totalActualBalance:
      balances.length
        ? accountBudgetRoundV2_(
            totalBalance
          )
        : null
  };
}


/* ==========================================================
 * المحرك الرئيسي
 * ==========================================================
 */

function getAccountBudgetDashboardV2(
  filters
) {

  filters = filters || {};

  var ss =
    accountBudgetSpreadsheetV2_();

  var monthStart =
    accountBudgetResolveMonthV2_(
      filters.month
    );

  var monthEnd =
    new Date(
      monthStart.getFullYear(),
      monthStart.getMonth() + 1,
      0,
      23,
      59,
      59,
      999
    );

  var now =
    new Date();

  var currentMonth =
    accountBudgetMonthStartV2_(
      now
    );

  var periodEnd =
    accountBudgetMonthKeyV2_(
      monthStart
    ) ===
    accountBudgetMonthKeyV2_(
      currentMonth
    )
      ? now
      : monthEnd;

  var settings =
    accountBudgetReadMonthSettingsV2_(
      ss,
      monthStart
    );

  var operations =
    accountBudgetReadOperationsV2_(
      ss
    );

  var definitions =
    accountBudgetDefinitionsV2_();

  var requestedAccount =
    accountBudgetTextV2_(
      filters.accountKey
    );

  var requestedBudget =
    accountBudgetTextV2_(
      filters.budgetKey
    );

  var selected =
    definitions.filter(
      function(definition) {

        if (
          requestedAccount &&
          requestedAccount !== 'all'
        ) {

          return (
            definition.accountKey ===
            requestedAccount
          );
        }

        if (
          requestedBudget &&
          requestedBudget !== 'all'
        ) {

          return (
            definition.budgetKey ===
            requestedBudget
          );
        }

        return true;
      }
    );

  var accounts =
    selected.map(
      function(definition) {

        return accountBudgetBuildAccountV2_(
          definition,
          settings[
            definition.accountKey
          ] || {},
          operations,
          monthStart,
          periodEnd
        );
      }
    );

  return {
    success: true,

    version:
      'ACCOUNT_BUDGET_DASHBOARD_V2',

    generatedAt:
      Utilities.formatDate(
        now,
        ACCOUNT_BUDGET_V2_CONFIG.TIME_ZONE,
        'dd/MM/yyyy HH:mm:ss'
      ),

    month:
      accountBudgetMonthKeyV2_(
        monthStart
      ),

    summary:
      accountBudgetBuildSummaryV2_(
        accounts
      ),

    accounts: accounts,

    unmapped:
      accountBudgetBuildUnmappedV2_(
        operations,
        monthStart,
        periodEnd
      )
  };
}


/* ==========================================================
 * الاختبار
 * ==========================================================
 */

function testAccountBudgetEngineV2() {

  var setup =
    setupAccountBudgetsV2();

  var month =
    accountBudgetMonthKeyV2_(
      new Date()
    );

  var dashboard =
    getAccountBudgetDashboardV2({
      month: month
    });

  if (
    dashboard.accounts.length !== 6
  ) {

    throw new Error(
      'يجب أن يحتوي النظام على 6 حسابات.'
    );
  }

  var ss =
    accountBudgetSpreadsheetV2_();

  var operations =
    accountBudgetReadOperationsV2_(
      ss
    );

  var mapped =
    operations.filter(
      function(operation) {
        return Boolean(
          operation.accountKey
        );
      }
    ).length;

  var result = {
    success: true,

    version:
      'ACCOUNT_BUDGET_ENGINE_V2',

    sheet:
      setup.sheet,

    accounts:
      dashboard.accounts.length,

    mappedOperations:
      mapped,

    unmappedCurrentMonth:
      dashboard.unmapped.count,

    unmappedExpensesCurrentMonth:
      dashboard.unmapped.expenseCount,

    totalSpent:
      dashboard.summary.totalSpent,

    configuredBudgets:
      dashboard.summary.configuredAccounts,

    accountPreview:
      dashboard.accounts.map(
        function(account) {

          return {
            accountKey:
              account.accountKey,

            budget:
              account.budgetKey,

            monthlyBudget:
              account.monthlyBudget,

            spent:
              account.spent,

            actualBalance:
              account.actualBalance,

            status:
              account.status.label,

            topItem:
              account.behavior.topItem
                ? account.behavior
                    .topItem.item
                : ''
          };
        }
      ),

    safety:
      'قراءة فقط للعمليات. لم يتم تعديل نظام الميزانيات القديم.'
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
/* =========================================================
   TEST SPENDING BEHAVIOR V4
   قراءة فقط - لا يعدل أي بيانات
   ========================================================= */

function testSpendingBehaviorV4() {

  var dashboard =
    getAccountBudgetDashboardV3({
      month:
        accountBudgetMonthKeyV2_(
          new Date()
        )
    });


  var account =
    dashboard.accounts.find(
      function(row) {
        return row.accountKey === 'AHLI_001';
      }
    );


  var result = {

    success:
      true,

    version:
      'SPENDING_BEHAVIOR_TEST_V4',

    accountKey:
      account
        ? account.accountKey
        : null,

    accountName:
      account
        ? account.accountName
        : null,

    budget:
      account
        ? account.budgetKey
        : null,

    spent:
      account
        ? account.spent
        : null,

    operationsCount:
      account
        ? account.operationsCount
        : null,

    behavior:
      account
        ? account.behavior
        : null,

    safety:
      'قراءة فقط. لم يتم تعديل العمليات أو الموازنات.'
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
function testRefundItemsInBehaviorV5() {

  var ss =
    accountBudgetSpreadsheetV2_();

  var sheet =
    ss.getSheetByName(
      'العمليات'
    );

  var rows =
    sheet.getRange(
      2,
      1,
      sheet.getLastRow() - 1,
      20
    ).getValues();

  var result =
    rows
      .filter(
        function(row) {

          var item =
            String(
              row[2] || ''
            );

          return (
            item.indexOf('استرداد') !== -1 ||
            item.indexOf('مرتجع') !== -1
          );

        }
      )
      .map(
        function(row) {

          return {

            date:
              row[1],

            item:
              row[2],

            amount:
              row[4],

            operationType:
              row[6],

            bank:
              row[8],

            accountKey:
              row[15],

            budgetKey:
              row[16],

            accountMovement:
              row[18]

          };

        }
      );

  console.log(
    JSON.stringify(
      {
        success:true,
        version:'REFUND_BEHAVIOR_DIAGNOSTIC_V5',
        count:result.length,
        rows:result,
        safety:'قراءة فقط. لم يتم تعديل أي بيانات.'
      },
      null,
      2
    )
  );

}
/* =========================================================
   REFUND EXPENSE EXCLUSION PATCH V2.2
   استبعاد الاستردادات من المصروف
   ========================================================= */

accountBudgetIsExpenseV2_ =
function(operation) {

  if (
    !operation ||
    !operation.accountKey
  ) {
    return false;
  }


  /*
   * التحويل الداخلي أو المستبعد
   * لا يدخل في المصروف.
   */
  if (
    accountBudgetIsInternalV2_(
      operation
    )
  ) {
    return false;
  }


  var operationType =
    accountBudgetNormalizeV2_(
      operation.operationType
    );


  /*
   * أي عملية مصنفة استرداد
   * لا تعتبر مصروفًا،
   * حتى إذا كانت الحركة البنكية debit.
   */
  if (
    operationType.indexOf(
      'استرداد'
    ) !== -1
  ) {
    return false;
  }


  return (
    operation.accountMovement ===
    'debit'
  );

};
function testActiveExpenseRuleV6() {


  var refundDebit = {
    accountKey: 'AHLI_001',
    operationType: 'استرداد',
    status: '',
    accountMovement: 'debit'
  };

  var normalDebit = {
    accountKey: 'AHLI_001',
    operationType: 'مصروف',
    status: '',
    accountMovement: 'debit'
  };

  var functionText =
    String(
      accountBudgetIsExpenseV2_
    );

  var result = {

    success: true,

    version:
      'ACTIVE_EXPENSE_RULE_V6',

    refundDebitIsExpense:
      accountBudgetIsExpenseV2_(
        refundDebit
      ),

    normalDebitIsExpense:
      accountBudgetIsExpenseV2_(
        normalDebit
      ),

    activeFunctionContainsRefundRule:
      functionText.indexOf(
        'استرداد'
      ) !== -1,

    activeFunction:
      functionText,

    safety:
      'قراءة فقط. لم يتم تعديل أي بيانات.'
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
/* =========================================================
   ACCOUNT BUDGET ENGINE V3
   إعادة المحرك V3 بعد إزالة النسخة المكررة من 50_Budget.gs

   يعتمد على V2 الموجود أعلاه.
   لا يعدل العمليات.
   لا يعدل الموازنات.
   ========================================================= */


/* =========================================================
   حالة هدف تأمين الدخل
   ========================================================= */

function accountBudgetIncomeGoalStatusV3_(
  target,
  achieved
) {

  if (
    target === null ||
    target === undefined ||
    target === ''
  ) {

    return {
      code: 'undefined',
      label: 'غير محدد',
      level: 'neutral'
    };

  }


  target =
    accountBudgetNumberV2_(
      target
    );


  achieved =
    accountBudgetNumberV2_(
      achieved
    );


  if (
    achieved >
    target + 0.0005
  ) {

    return {
      code: 'above_goal',
      label: 'فوق الهدف',
      level: 'excellent'
    };

  }


  if (
    Math.abs(
      achieved - target
    ) <= 0.0005
  ) {

    return {
      code: 'achieved',
      label: 'محقق',
      level: 'good'
    };

  }


  return {
    code: 'remaining',
    label: 'متبقي',
    level: 'warning'
  };

}


/* =========================================================
   قراءة الحركات للحسابات V3

   الفرق عن V2:
   لا نحذف أحد طرفي التحويل الداخلي إذا كان
   messageId نفسه مستخدمًا في حسابين.
   ========================================================= */

function accountBudgetReadAccountMovementsV3_(
  ss
) {

  var sheet =
    ss.getSheetByName(
      ACCOUNT_BUDGET_V2_CONFIG.OPERATIONS_SHEET
    );


  if (
    !sheet ||
    sheet.getLastRow() < 2 ||
    sheet.getMaxColumns() < 20
  ) {
    return [];
  }


  var rows =
    sheet
      .getRange(
        2,
        1,
        sheet.getLastRow() - 1,
        20
      )
      .getValues();


  var byMovement =
    new Map();


  rows.forEach(
    function(row) {

      var messageId =
        accountBudgetTextV2_(
          row[0]
        );


      var date =
        accountBudgetValidDateV2_(
          row[1]
        );


      if (
        !messageId ||
        !date
      ) {
        return;
      }


      var rawBalance =
        row[17];


      var hasBalance = !(
        rawBalance === '' ||
        rawBalance === null ||
        rawBalance === undefined
      );


      var accountKey =
        accountBudgetTextV2_(
          row[15]
        );


      var movement =
        accountBudgetTextV2_(
          row[18]
        ).toLowerCase();


      var amount =
        Math.abs(
          accountBudgetNumberV2_(
            row[4]
          )
        );


      var record = {

        messageId:
          messageId,

        date:
          date,

        item:
          accountBudgetTextV2_(
            row[2]
          ) || 'غير محدد',

        amount:
          amount,

        operationType:
          accountBudgetTextV2_(
            row[6]
          ),

        bank:
          accountBudgetTextV2_(
            row[8]
          ),

        status:
          accountBudgetTextV2_(
            row[10]
          ),

        category:
          accountBudgetTextV2_(
            row[12]
          ),

        period:
          accountBudgetTextV2_(
            row[13]
          ),

        scope:
          accountBudgetTextV2_(
            row[14]
          ),

        accountKey:
          accountKey,

        budgetKey:
          accountBudgetTextV2_(
            row[16]
          ),

        balance:
          hasBalance
            ? accountBudgetNumberV2_(
                rawBalance
              )
            : null,

        accountMovement:
          movement,

        balanceDate:
          accountBudgetValidDateV2_(
            row[19]
          )

      };


      /*
       * نفس الرسالة يمكن أن تمثل طرفين
       * لتحويل داخلي.
       *
       * لذلك مفتاح V3 يحتوي الحساب
       * والاتجاه والمبلغ.
       */
      var key =
        [
          messageId,
          accountKey,
          movement,
          amount
        ].join('|');


      if (
        !byMovement.has(
          key
        )
      ) {

        byMovement.set(
          key,
          record
        );

      }

    }
  );


  return Array.from(
    byMovement.values()
  );

}


/* =========================================================
   مساهمات تأمين الدخل

   MEETHAQ_22
   credit = مساهمة في الهدف

   التحويل الداخلي مسموح هنا لأنه بالفعل
   تمويل لتأمين الدخل.

   الاسترداد لا يعتبر مساهمة.
   ========================================================= */

function accountBudgetIncomeContributionsV3_(
  movements,
  monthStart,
  periodEnd
) {

  var rows =
    movements.filter(
      function(operation) {

        if (
          operation.accountKey !==
          'MEETHAQ_22'
        ) {
          return false;
        }


        if (
          operation.date < monthStart ||
          operation.date > periodEnd
        ) {
          return false;
        }


        if (
          operation.accountMovement !==
          'credit'
        ) {
          return false;
        }


        var type =
          accountBudgetNormalizeV2_(
            operation.operationType
          );


        /*
         * الاسترداد لا يدخل في هدف الدخل.
         */
        if (
          type.indexOf(
            'استرداد'
          ) !== -1
        ) {
          return false;
        }


        return true;

      }
    );


  var amount =
    rows.reduce(
      function(total, operation) {

        return (
          total +
          operation.amount
        );

      },
      0
    );


  return {

    amount:
      accountBudgetRoundV2_(
        amount
      ),

    count:
      rows.length,

    rows:
      rows

  };

}


/* =========================================================
   ملخص V3

   تأمين الدخل ليس موازنة صرف.
   ========================================================= */

function accountBudgetBuildSummaryV3_(
  accounts
) {

  var spendingAccounts =
    accounts.filter(
      function(account) {

        return (
          account.accountType !==
          'income_insurance'
        );

      }
    );


  var configured =
    spendingAccounts.filter(
      function(account) {

        return (
          account.monthlyBudget !== null
        );

      }
    );


  var totalBudget =
    configured.reduce(
      function(total, account) {

        return (
          total +
          account.monthlyBudget
        );

      },
      0
    );


  var totalSpent =
    spendingAccounts.reduce(
      function(total, account) {

        return (
          total +
          account.spent
        );

      },
      0
    );


  var totalRemaining =
    configured.reduce(
      function(total, account) {

        return (
          total +
          account.remaining
        );

      },
      0
    );


  var income =
    accounts.find(
      function(account) {

        return (
          account.accountType ===
          'income_insurance'
        );

      }
    ) || null;


  return {

    spendingAccounts:
      spendingAccounts.length,

    configuredSpendingBudgets:
      configured.length,

    totalBudget:
      configured.length
        ? accountBudgetRoundV2_(
            totalBudget
          )
        : null,

    totalSpent:
      accountBudgetRoundV2_(
        totalSpent
      ),

    totalRemaining:
      configured.length
        ? accountBudgetRoundV2_(
            totalRemaining
          )
        : null,

    incomeProtection:
      income
        ? {

            target:
              income.goalTarget,

            achieved:
              income.achieved,

            remaining:
              income.remainingToGoal,

            excess:
              income.excessAboveGoal,

            progressPercent:
              income.progressPercent,

            status:
              income.status

          }
        : null

  };

}


/* =========================================================
   المحرك الرئيسي V3
   ========================================================= */

function getAccountBudgetDashboardV3(
  filters
) {

  filters =
    filters || {};


  /*
   * نستخدم V2 كأساس.
   */
  var base =
    getAccountBudgetDashboardV2(
      filters
    );


  var ss =
    accountBudgetSpreadsheetV2_();


  var monthStart =
    accountBudgetResolveMonthV2_(
      filters.month
    );


  var monthEnd =
    new Date(
      monthStart.getFullYear(),
      monthStart.getMonth() + 1,
      0,
      23,
      59,
      59,
      999
    );


  var now =
    new Date();


  var currentMonth =
    accountBudgetMonthStartV2_(
      now
    );


  var periodEnd =
    accountBudgetMonthKeyV2_(
      monthStart
    ) ===
    accountBudgetMonthKeyV2_(
      currentMonth
    )

      ? now

      : monthEnd;


  var movements =
    accountBudgetReadAccountMovementsV3_(
      ss
    );


  var incomeContributions =
    accountBudgetIncomeContributionsV3_(
      movements,
      monthStart,
      periodEnd
    );


  var accounts =
    (base.accounts || [])
      .map(
        function(account) {

          /*
           * حساب صرف عادي.
           */
          if (
            account.accountType ===
            'spending'
          ) {

            account.budgetMode =
              'spending_budget';

            return account;

          }


          /*
           * تأمين المصروف.
           */
          if (
            account.accountType ===
            'expense_insurance'
          ) {

            account.budgetMode =
              'expense_insurance';


            account.allocated =
              account.monthlyBudget;


            account.used =
              account.spent;


            account.insuranceRemaining =
              account.remaining;


            return account;

          }


          /*
           * تأمين الدخل:
           * المبلغ المحدد هو هدف وليس
           * موازنة إنفاق.
           */
          if (
            account.accountType ===
            'income_insurance'
          ) {

            var target =
              account.monthlyBudget;


            var achieved =
              incomeContributions.amount;


            var remaining =
              target === null

                ? null

                : Math.max(
                    0,
                    target - achieved
                  );


            var excess =
              target === null

                ? null

                : Math.max(
                    0,
                    achieved - target
                  );


            var progress =
              null;


            if (
              target !== null
            ) {

              if (
                target > 0
              ) {

                progress =
                  achieved /
                  target *
                  100;

              }

              else if (
                achieved === 0
              ) {

                progress =
                  100;

              }

            }


            account.budgetMode =
              'income_goal';


            account.goalTarget =
              target;


            account.achieved =
              accountBudgetRoundV2_(
                achieved
              );


            account.remainingToGoal =
              remaining === null
                ? null
                : accountBudgetRoundV2_(
                    remaining
                  );


            account.excessAboveGoal =
              excess === null
                ? null
                : accountBudgetRoundV2_(
                    excess
                  );


            account.progressPercent =
              progress === null
                ? null
                : accountBudgetRoundV2_(
                    progress
                  );


            account.contributionsCount =
              incomeContributions.count;


            /*
             * إذا حدث خصم من حساب تأمين الدخل
             * نحفظه كمسحوبات، وليس كتحقيق للهدف.
             */
            account.withdrawals =
              account.spent;


            /*
             * credits في V3 تعني المساهمات
             * الصحيحة في الهدف.
             */
            account.credits =
              accountBudgetRoundV2_(
                achieved
              );


            account.creditsCount =
              incomeContributions.count;


            /*
             * للتوافق مع الواجهة:
             * remaining = المتبقي من الهدف
             * usagePercent = نسبة تحقيق الهدف
             */
            account.remaining =
              account.remainingToGoal;


            account.usagePercent =
              account.progressPercent;


            account.status =
              accountBudgetIncomeGoalStatusV3_(
                target,
                achieved
              );


            return account;

          }


          return account;

        }
      );


  var spendingSummary =
    accountBudgetBuildSummaryV3_(
      accounts
    );


  var expenseInsuranceAccount =
    accounts.find(
      function(account) {

        return (
          account.accountType ===
          'expense_insurance'
        );

      }
    ) || null;


  var incomeProtectionAccount =
    accounts.find(
      function(account) {

        return (
          account.accountType ===
          'income_insurance'
        );

      }
    ) || null;


  /*
   * نحافظ على كل مخرجات V2
   * ونضيف عليها V3.
   */
  var result = {};


  Object.keys(
    base
  ).forEach(
    function(key) {

      result[key] =
        base[key];

    }
  );


  result.version =
    'ACCOUNT_BUDGET_DASHBOARD_V3';


  result.accounts =
    accounts;


  result.spendingSummary =
    spendingSummary;


  /*
   * نحتفظ أيضًا بـ summary القديم
   * حتى لا تنكسر أي واجهة قديمة.
   */
  result.summary =
    base.summary;


  result.expenseInsurance =
    expenseInsuranceAccount

      ? {

          accountKey:
            expenseInsuranceAccount.accountKey,

          budget:
            expenseInsuranceAccount.budgetKey,

          account:
            expenseInsuranceAccount.accountName,

          allocated:
            expenseInsuranceAccount.monthlyBudget,

          used:
            expenseInsuranceAccount.spent,

          remaining:
            expenseInsuranceAccount.remaining,

          actualBalance:
            expenseInsuranceAccount.actualBalance,

          topItem:
            expenseInsuranceAccount.behavior &&
            expenseInsuranceAccount.behavior.topItem

              ? expenseInsuranceAccount
                  .behavior
                  .topItem
                  .item

              : '',

          behavior:
            expenseInsuranceAccount.behavior,

          status:
            expenseInsuranceAccount.status

        }

      : null;


  result.incomeProtection =
    incomeProtectionAccount

      ? {

          accountKey:
            incomeProtectionAccount.accountKey,

          budget:
            incomeProtectionAccount.budgetKey,

          account:
            incomeProtectionAccount.accountName,

          target:
            incomeProtectionAccount.goalTarget,

          achieved:
            incomeProtectionAccount.achieved,

          remaining:
            incomeProtectionAccount.remainingToGoal,

          excess:
            incomeProtectionAccount.excessAboveGoal,

          progressPercent:
            incomeProtectionAccount.progressPercent,

          contributionsCount:
            incomeProtectionAccount.contributionsCount,

          withdrawals:
            incomeProtectionAccount.withdrawals,

          actualBalance:
            incomeProtectionAccount.actualBalance,

          status:
            incomeProtectionAccount.status

        }

      : null;


  return result;

}


/* =========================================================
   اختبار محرك V3
   قراءة فقط
   ========================================================= */

function testAccountBudgetEngineV3() {

  var month =
    accountBudgetMonthKeyV2_(
      new Date()
    );


  var dashboard =
    getAccountBudgetDashboardV3({
      month: month
    });


  var expenseInsurance =
    dashboard.expenseInsurance;


  var incomeProtection =
    dashboard.incomeProtection;


  var result = {

    success:
      true,

    version:
      'ACCOUNT_BUDGET_ENGINE_V3',

    spendingSummary:
      dashboard.spendingSummary,

    expenseInsurance:
      expenseInsurance

        ? {

            account:
              expenseInsurance.account,

            allocated:
              expenseInsurance.allocated,

            used:
              expenseInsurance.used,

            remaining:
              expenseInsurance.remaining,

            actualBalance:
              expenseInsurance.actualBalance,

            topItem:
              expenseInsurance.topItem,

            status:
              expenseInsurance.status
                ? expenseInsurance.status.label
                : ''

          }

        : null,

    incomeProtection:
      incomeProtection

        ? {

            account:
              incomeProtection.account,

            target:
              incomeProtection.target,

            achieved:
              incomeProtection.achieved,

            remaining:
              incomeProtection.remaining,

            excess:
              incomeProtection.excess,

            progressPercent:
              incomeProtection.progressPercent,

            contributionsCount:
              incomeProtection.contributionsCount,

            withdrawals:
              incomeProtection.withdrawals,

            actualBalance:
              incomeProtection.actualBalance,

            status:
              incomeProtection.status
                ? incomeProtection.status.label
                : ''

          }

        : null,

    safety:
      'قراءة فقط. لم يتم تعديل العمليات أو الموازنات.'

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

/* ==========================================================
 * ACCOUNT BUDGET MAPPING V4
 *
 * الربط الجديد:
 *
 * AHLI_001
 * - عائلي شهري
 * - عائلي سنوي
 * - شخصي شهري
 * - شخصي سنوي
 *
 * AHLI_002
 * - تأمين المصروف
 * - تأمين الدخل
 *
 * مهم:
 * - لا يعدل العمليات.
 * - لا يعدل الأشهر القديمة.
 * - الموازنة هي المفتاح الأساسي.
 * ==========================================================
 */


/* ==========================================================
 * توحيد اسم الموازنة
 * ==========================================================
 */

function accountBudgetCanonicalBudgetV4_(
  value
) {

  var text =
    accountBudgetNormalizeV2_(
      value
    );


  var map = {};


  map[
    accountBudgetNormalizeV2_(
      'عائلي شهري'
    )
  ] =
    'عائلي شهري';


  map[
    accountBudgetNormalizeV2_(
      'العائلي الشهري'
    )
  ] =
    'عائلي شهري';


  map[
    accountBudgetNormalizeV2_(
      'عائلي سنوي'
    )
  ] =
    'عائلي سنوي';


  map[
    accountBudgetNormalizeV2_(
      'العائلي السنوي'
    )
  ] =
    'عائلي سنوي';


  map[
    accountBudgetNormalizeV2_(
      'شخصي شهري'
    )
  ] =
    'شخصي شهري';


  map[
    accountBudgetNormalizeV2_(
      'الشخصي الشهري'
    )
  ] =
    'شخصي شهري';


  map[
    accountBudgetNormalizeV2_(
      'شخصي سنوي'
    )
  ] =
    'شخصي سنوي';


  map[
    accountBudgetNormalizeV2_(
      'الشخصي السنوي'
    )
  ] =
    'شخصي سنوي';


  map[
    accountBudgetNormalizeV2_(
      'تأمين المصروف'
    )
  ] =
    'تأمين المصروف';


  map[
    accountBudgetNormalizeV2_(
      'تامين المصروف'
    )
  ] =
    'تأمين المصروف';


  map[
    accountBudgetNormalizeV2_(
      'تأمين الدخل'
    )
  ] =
    'تأمين الدخل';


  map[
    accountBudgetNormalizeV2_(
      'تامين الدخل'
    )
  ] =
    'تأمين الدخل';


  return (
    map[text] ||
    ''
  );

}


/* ==========================================================
 * تعريف الموازنات بالحسابين الجديدين
 * ==========================================================
 */

accountBudgetDefinitionsV2_ =
function() {

  return [

    {
      accountKey:
        'AHLI_001',

      budgetKey:
        'عائلي شهري',

      accountName:
        'الأهلي 001',

      type:
        'spending'
    },


    {
      accountKey:
        'AHLI_001',

      budgetKey:
        'عائلي سنوي',

      accountName:
        'الأهلي 001',

      type:
        'spending'
    },


    {
      accountKey:
        'AHLI_001',

      budgetKey:
        'شخصي شهري',

      accountName:
        'الأهلي 001',

      type:
        'spending'
    },


    {
      accountKey:
        'AHLI_001',

      budgetKey:
        'شخصي سنوي',

      accountName:
        'الأهلي 001',

      type:
        'spending'
    },


    {
      accountKey:
        'AHLI_002',

      budgetKey:
        'تأمين المصروف',

      accountName:
        'الأهلي 002',

      type:
        'expense_insurance'
    },


    {
      accountKey:
        'AHLI_002',

      budgetKey:
        'تأمين الدخل',

      accountName:
        'الأهلي 002',

      type:
        'income_insurance'
    }

  ];

};


/* ==========================================================
 * إنشاء صفوف الشهر
 *
 * سابقًا:
 * الشهر + الحساب
 *
 * الآن:
 * الشهر + الموازنة
 *
 * لأن الحساب الواحد يحتوي عدة موازنات.
 * ==========================================================
 */

accountBudgetEnsureMonthRowsV2_ =
function(
  sheet,
  monthStart
) {

  var definitions =
    accountBudgetDefinitionsV2_();


  var existing = {};


  if (
    sheet.getLastRow() >= 2
  ) {

    var rows =
      sheet
        .getRange(
          2,
          1,
          sheet.getLastRow() - 1,
          ACCOUNT_BUDGET_V2_HEADERS.length
        )
        .getValues();


    rows.forEach(
      function(
        row,
        index
      ) {

        var date =
          accountBudgetValidDateV2_(
            row[0]
          );


        var budgetKey =
          accountBudgetCanonicalBudgetV4_(
            row[2]
          );


        if (
          !date ||
          !budgetKey
        ) {

          return;

        }


        existing[
          accountBudgetMonthKeyV2_(
            date
          ) +
          '|' +
          budgetKey
        ] = index + 2;

      }
    );

  }


  var output = [];


  definitions.forEach(
    function(definition) {

      var key =
        accountBudgetMonthKeyV2_(
          monthStart
        ) +
        '|' +
        definition.budgetKey;


      if (
        existing[key]
      ) {

        return;

      }


      output.push([

        monthStart,

        definition.accountKey,

        definition.budgetKey,

        definition.accountName,

        '',

        'نعم',

        '',

        new Date()

      ]);

    }
  );


  if (
    output.length
  ) {

    sheet
      .getRange(
        sheet.getLastRow() + 1,
        1,
        output.length,
        ACCOUNT_BUDGET_V2_HEADERS.length
      )
      .setValues(
        output
      );

  }


  return output.length;

};


/* ==========================================================
 * قراءة إعدادات الشهر حسب الموازنة
 * وليس حسب الحساب.
 * ==========================================================
 */

accountBudgetReadMonthSettingsV2_ =
function(
  ss,
  monthStart
) {

  var sheet =
    ss.getSheetByName(
      ACCOUNT_BUDGET_V2_CONFIG.SHEET
    );


  if (!sheet) {

    setupAccountBudgetsV2();


    sheet =
      ss.getSheetByName(
        ACCOUNT_BUDGET_V2_CONFIG.SHEET
      );

  }


  accountBudgetEnsureMonthRowsV2_(
    sheet,
    monthStart
  );


  var result = {};


  if (
    sheet.getLastRow() < 2
  ) {

    return result;

  }


  var rows =
    sheet
      .getRange(
        2,
        1,
        sheet.getLastRow() - 1,
        ACCOUNT_BUDGET_V2_HEADERS.length
      )
      .getValues();


  rows.forEach(
    function(row) {

      var rowMonth =
        accountBudgetValidDateV2_(
          row[0]
        );


      if (!rowMonth) {

        return;

      }


      if (
        accountBudgetMonthKeyV2_(
          rowMonth
        ) !==
        accountBudgetMonthKeyV2_(
          monthStart
        )
      ) {

        return;

      }


      var budgetKey =
        accountBudgetCanonicalBudgetV4_(
          row[2]
        );


      if (!budgetKey) {

        return;

      }


      var rawBudget =
        row[4];


      var hasBudget =
        !(
          rawBudget === '' ||
          rawBudget === null ||
          rawBudget === undefined
        );


      result[
        budgetKey
      ] = {

        accountKey:
          accountBudgetTextV2_(
            row[1]
          ),

        budgetKey:
          budgetKey,

        accountName:
          accountBudgetTextV2_(
            row[3]
          ),

        budget:
          hasBudget
            ? Math.max(
                0,
                accountBudgetNumberV2_(
                  rawBudget
                )
              )
            : null,

        active:
          accountBudgetIsActiveV2_(
            row[5]
          ),

        notes:
          accountBudgetTextV2_(
            row[6]
          )

      };

    }
  );


  return result;

};


/* ==========================================================
 * قراءة العمليات
 *
 * التصنيف D هو المصدر الأول للموازنة.
 * Q يستخدم كخيار احتياطي.
 * ==========================================================
 */

accountBudgetReadOperationsV2_ =
function(
  ss
) {

  var sheet =
    ss.getSheetByName(
      ACCOUNT_BUDGET_V2_CONFIG.OPERATIONS_SHEET
    );


  if (
    !sheet ||
    sheet.getLastRow() < 2 ||
    sheet.getMaxColumns() < 20
  ) {

    return [];

  }


  var rows =
    sheet
      .getRange(
        2,
        1,
        sheet.getLastRow() - 1,
        20
      )
      .getValues();


  var byMessageId =
    new Map();


  rows.forEach(
    function(row) {

      var messageId =
        accountBudgetTextV2_(
          row[0]
        );


      var date =
        accountBudgetValidDateV2_(
          row[1]
        );


      if (
        !messageId ||
        !date
      ) {

        return;

      }


      var classification =
        accountBudgetCanonicalBudgetV4_(
          row[3]
        );


      var sourceBudget =
        accountBudgetCanonicalBudgetV4_(
          row[16]
        );


      /*
       * التصنيف هو المصدر الأساسي.
       *
       * مصدر الموازنة Q احتياطي فقط.
       */
      var budgetKey =
        classification ||
        sourceBudget;


      var rawBalance =
        row[17];


      var hasBalance =
        !(
          rawBalance === '' ||
          rawBalance === null ||
          rawBalance === undefined
        );


      var record = {

        messageId:
          messageId,

        date:
          date,

        item:
          accountBudgetTextV2_(
            row[2]
          ) ||
          'غير محدد',

        amount:
          Math.abs(
            accountBudgetNumberV2_(
              row[4]
            )
          ),

        operationType:
          accountBudgetTextV2_(
            row[6]
          ),

        bank:
          accountBudgetTextV2_(
            row[8]
          ),

        status:
          accountBudgetTextV2_(
            row[10]
          ),

        category:
          accountBudgetTextV2_(
            row[12]
          ),

        period:
          accountBudgetTextV2_(
            row[13]
          ),

        scope:
          accountBudgetTextV2_(
            row[14]
          ),

        accountKey:
          accountBudgetTextV2_(
            row[15]
          ),

        budgetKey:
          budgetKey,

        balance:
          hasBalance
            ? accountBudgetNumberV2_(
                rawBalance
              )
            : null,

        accountMovement:
          accountBudgetTextV2_(
            row[18]
          ).toLowerCase(),

        balanceDate:
          accountBudgetValidDateV2_(
            row[19]
          )

      };


      byMessageId.set(
        messageId,
        record
      );

    }
  );


  return Array.from(
    byMessageId.values()
  );

};


/* ==========================================================
 * تحليل سلوك الصرف حسب الموازنة
 * ==========================================================
 */

function accountBudgetBuildBehaviorByBudgetV4_(
  budgetKey,
  currentExpenses,
  allOperations,
  monthStart
) {

  var totalSpent =
    currentExpenses.reduce(
      function(
        total,
        operation
      ) {

        return (
          total +
          operation.amount
        );

      },
      0
    );


  var previousStart =
    new Date(
      monthStart.getFullYear(),
      monthStart.getMonth() - 1,
      1
    );


  var previousEnd =
    new Date(
      monthStart.getFullYear(),
      monthStart.getMonth(),
      0,
      23,
      59,
      59,
      999
    );


  var previousMap = {};


  allOperations
    .filter(
      function(operation) {

        return (

          accountBudgetCanonicalBudgetV4_(
            operation.budgetKey
          ) ===
          budgetKey

          &&

          operation.date >=
            previousStart

          &&

          operation.date <=
            previousEnd

          &&

          accountBudgetIsExpenseV2_(
            operation
          )

        );

      }
    )
    .forEach(
      function(operation) {

        previousMap[
          operation.item
        ] =
          (
            previousMap[
              operation.item
            ] || 0
          ) +
          operation.amount;

      }
    );


  var currentMap = {};


  currentExpenses.forEach(
    function(operation) {

      var item =
        operation.item ||
        'غير محدد';


      if (
        !currentMap[item]
      ) {

        currentMap[item] = {

          item:
            item,

          spent:
            0,

          count:
            0

        };

      }


      currentMap[item].spent +=
        operation.amount;


      currentMap[item].count++;

    }
  );


  var items =
    Object.keys(
      currentMap
    )
      .map(
        function(itemName) {

          var record =
            currentMap[
              itemName
            ];


          var share =
            totalSpent > 0
              ? record.spent /
                totalSpent *
                100
              : 0;


          var average =
            record.count > 0
              ? record.spent /
                record.count
              : 0;


          var previousSpent =
            previousMap[
              itemName
            ] || 0;


          var changePercent =
            null;


          if (
            previousSpent > 0
          ) {

            changePercent =
              (
                record.spent -
                previousSpent
              ) /
              previousSpent *
              100;

          }


          return {

            item:
              itemName,

            spent:
              accountBudgetRoundV2_(
                record.spent
              ),

            sharePercent:
              accountBudgetRoundV2_(
                share
              ),

            count:
              record.count,

            average:
              accountBudgetRoundV2_(
                average
              ),

            previousSpent:
              accountBudgetRoundV2_(
                previousSpent
              ),

            changePercent:
              changePercent === null
                ? null
                : accountBudgetRoundV2_(
                    changePercent
                  ),

            concentration:
              accountBudgetItemConcentrationV2_(
                share
              )

          };

        }
      )
      .sort(
        function(a, b) {

          return (
            b.spent -
            a.spent
          );

        }
      );


  var top3 =
    items
      .slice(
        0,
        3
      )
      .reduce(
        function(
          total,
          item
        ) {

          return (
            total +
            item.sharePercent
          );

        },
        0
      );


  return {

    totalSpent:
      accountBudgetRoundV2_(
        totalSpent
      ),

    itemsCount:
      items.length,

    topItem:
      items.length
        ? items[0]
        : null,

    top3Concentration:
      accountBudgetRoundV2_(
        top3
      ),

    items:
      items

  };

}


/* ==========================================================
 * بناء الموازنة
 *
 * المصروف:
 * حسب الموازنة.
 *
 * الرصيد البنكي:
 * حسب الحساب الفعلي.
 * ==========================================================
 */

accountBudgetBuildAccountV2_ =
function(
  definition,
  setting,
  operations,
  monthStart,
  periodEnd
) {

  /*
   * عمليات هذه الموازنة.
   */
  var budgetOperations =
    operations.filter(
      function(operation) {

        return (
          accountBudgetCanonicalBudgetV4_(
            operation.budgetKey
          ) ===
          definition.budgetKey
        );

      }
    );


  /*
   * عمليات الحساب البنكي الفعلي.
   *
   * تستخدم فقط لمعرفة:
   * - آخر رصيد معروف
   * - الرصيد الافتتاحي
   */
  var physicalAccountOperations =
    operations.filter(
      function(operation) {

        return (
          operation.accountKey ===
          definition.accountKey
        );

      }
    );


  var monthOperations =
    budgetOperations.filter(
      function(operation) {

        return (
          operation.date >=
            monthStart &&
          operation.date <=
            periodEnd
        );

      }
    );


  var expenses =
    monthOperations.filter(
      accountBudgetIsExpenseV2_
    );


  var credits =
    monthOperations.filter(
      accountBudgetIsCreditV2_
    );


  var internal =
    monthOperations.filter(
      accountBudgetIsInternalV2_
    );


  var spent =
    expenses.reduce(
      function(
        total,
        operation
      ) {

        return (
          total +
          operation.amount
        );

      },
      0
    );


  var credited =
    credits.reduce(
      function(
        total,
        operation
      ) {

        return (
          total +
          operation.amount
        );

      },
      0
    );


  var monthlyBudget =
    setting &&
    setting.budget !== undefined
      ? setting.budget
      : null;


  if (
    monthlyBudget === ''
  ) {

    monthlyBudget =
      null;

  }


  var remaining =
    monthlyBudget === null
      ? null
      : monthlyBudget -
        spent;


  var usage =
    monthlyBudget !== null &&
    monthlyBudget > 0
      ? spent /
        monthlyBudget *
        100
      : (
          monthlyBudget === 0 &&
          spent === 0
            ? 0
            : null
        );


  var overrun =
    monthlyBudget === null
      ? null
      : Math.max(
          0,
          spent -
          monthlyBudget
        );


  var overrunPercent =
    monthlyBudget !== null &&
    monthlyBudget > 0 &&
    overrun > 0
      ? overrun /
        monthlyBudget *
        100
      : (
          overrun === 0
            ? 0
            : null
        );


  var opening =
    accountBudgetFindOpeningBalanceV2_(
      physicalAccountOperations,
      monthStart,
      periodEnd
    );


  var latest =
    accountBudgetFindLatestBalanceV2_(
      physicalAccountOperations,
      periodEnd
    );


  return {

    accountKey:
      definition.accountKey,

    budgetKey:
      definition.budgetKey,

    accountName:
      definition.accountName,

    accountType:
      definition.type,

    monthlyBudget:
      monthlyBudget === null
        ? null
        : accountBudgetRoundV2_(
            monthlyBudget
          ),

    spent:
      accountBudgetRoundV2_(
        spent
      ),

    credits:
      accountBudgetRoundV2_(
        credited
      ),

    remaining:
      remaining === null
        ? null
        : accountBudgetRoundV2_(
            remaining
          ),

    usagePercent:
      usage === null
        ? null
        : accountBudgetRoundV2_(
            usage
          ),

    overrun:
      overrun === null
        ? null
        : accountBudgetRoundV2_(
            overrun
          ),

    overrunPercent:
      overrunPercent === null
        ? null
        : accountBudgetRoundV2_(
            overrunPercent
          ),

    openingBalance:
      opening.balance,

    openingBalanceSource:
      opening.source,

    actualBalance:
      latest.balance,

    balanceDate:
      latest.date,

    operationsCount:
      expenses.length,

    creditsCount:
      credits.length,

    internalTransfers:
      internal.length,

    status:
      accountBudgetStatusV2_(
        monthlyBudget,
        spent
      ),

    behavior:
      accountBudgetBuildBehaviorByBudgetV4_(
        definition.budgetKey,
        expenses,
        operations,
        monthStart
      )

  };

};


/* ==========================================================
 * المؤشر العام
 *
 * لا نجمع رصيد الأهلي 001 أربع مرات.
 * ولا الأهلي 002 مرتين.
 * ==========================================================
 */

accountBudgetBuildSummaryV2_ =
function(
  accounts
) {

  var configured =
    accounts.filter(
      function(account) {

        return (
          account.monthlyBudget !==
          null
        );

      }
    );


  var totalBudget =
    configured.reduce(
      function(
        total,
        account
      ) {

        return (
          total +
          account.monthlyBudget
        );

      },
      0
    );


  var totalSpent =
    accounts.reduce(
      function(
        total,
        account
      ) {

        return (
          total +
          account.spent
        );

      },
      0
    );


  var totalRemaining =
    configured.reduce(
      function(
        total,
        account
      ) {

        return (
          total +
          account.remaining
        );

      },
      0
    );


  /*
   * آخر رصيد معروف لكل حساب
   * يحسب مرة واحدة فقط.
   */
  var balancesByAccount = {};


  accounts.forEach(
    function(account) {

      if (
        account.actualBalance ===
        null
      ) {

        return;

      }


      balancesByAccount[
        account.accountKey
      ] =
        account.actualBalance;

    }
  );


  var balanceKeys =
    Object.keys(
      balancesByAccount
    );


  var totalBalance =
    balanceKeys.reduce(
      function(
        total,
        key
      ) {

        return (
          total +
          balancesByAccount[key]
        );

      },
      0
    );


  return {

    accounts:
      accounts.length,

    configuredAccounts:
      configured.length,

    totalBudget:
      configured.length
        ? accountBudgetRoundV2_(
            totalBudget
          )
        : null,

    totalSpent:
      accountBudgetRoundV2_(
        totalSpent
      ),

    totalRemaining:
      configured.length
        ? accountBudgetRoundV2_(
            totalRemaining
          )
        : null,

    totalActualBalance:
      balanceKeys.length
        ? accountBudgetRoundV2_(
            totalBalance
          )
        : null

  };

};


/* ==========================================================
 * لوحة الحسابات V2
 *
 * إعداد الشهر يقرأ حسب اسم الموازنة.
 * ==========================================================
 */

getAccountBudgetDashboardV2 =
function(
  filters
) {

  filters =
    filters || {};


  var ss =
    accountBudgetSpreadsheetV2_();


  var monthStart =
    accountBudgetResolveMonthV2_(
      filters.month
    );


  var monthEnd =
    new Date(
      monthStart.getFullYear(),
      monthStart.getMonth() + 1,
      0,
      23,
      59,
      59,
      999
    );


  var now =
    new Date();


  var currentMonth =
    accountBudgetMonthStartV2_(
      now
    );


  var periodEnd =
    accountBudgetMonthKeyV2_(
      monthStart
    ) ===
    accountBudgetMonthKeyV2_(
      currentMonth
    )
      ? now
      : monthEnd;


  var settings =
    accountBudgetReadMonthSettingsV2_(
      ss,
      monthStart
    );


  var operations =
    accountBudgetReadOperationsV2_(
      ss
    );


  var definitions =
    accountBudgetDefinitionsV2_();


  var requestedAccount =
    accountBudgetTextV2_(
      filters.accountKey
    );


  var requestedBudget =
    accountBudgetCanonicalBudgetV4_(
      filters.budgetKey
    );


  var selected =
    definitions.filter(
      function(definition) {

        if (
          requestedAccount &&
          requestedAccount !== 'all'
        ) {

          return (
            definition.accountKey ===
            requestedAccount
          );

        }


        if (
          requestedBudget &&
          requestedBudget !== 'all'
        ) {

          return (
            definition.budgetKey ===
            requestedBudget
          );

        }


        return true;

      }
    );


  var accounts =
    selected.map(
      function(definition) {

        return accountBudgetBuildAccountV2_(

          definition,

          settings[
            definition.budgetKey
          ] || {},

          operations,

          monthStart,

          periodEnd

        );

      }
    );


  return {

    success:
      true,

    version:
      'ACCOUNT_BUDGET_DASHBOARD_V4',

    generatedAt:
      Utilities.formatDate(
        now,
        ACCOUNT_BUDGET_V2_CONFIG.TIME_ZONE,
        'dd/MM/yyyy HH:mm:ss'
      ),

    month:
      accountBudgetMonthKeyV2_(
        monthStart
      ),

    summary:
      accountBudgetBuildSummaryV2_(
        accounts
      ),

    accounts:
      accounts,

    unmapped:
      accountBudgetBuildUnmappedV2_(
        operations,
        monthStart,
        periodEnd
      )

  };

};


/* ==========================================================
 * تأمين الدخل
 *
 * أصبح على AHLI_002.
 * يجب أن تكون العملية مصنفة
 * "تأمين الدخل" حتى لا تختلط
 * بتأمين المصروف.
 * ==========================================================
 */

accountBudgetIncomeContributionsV3_ =
function(
  movements,
  monthStart,
  periodEnd
) {

  var rows =
    movements.filter(
      function(operation) {

        if (
          operation.accountKey !==
          'AHLI_002'
        ) {

          return false;

        }


        if (
          accountBudgetCanonicalBudgetV4_(
            operation.budgetKey
          ) !==
          'تأمين الدخل'
        ) {

          return false;

        }


        if (
          operation.date <
            monthStart ||
          operation.date >
            periodEnd
        ) {

          return false;

        }


        if (
          operation.accountMovement !==
          'credit'
        ) {

          return false;

        }


        var type =
          accountBudgetNormalizeV2_(
            operation.operationType
          );


        if (
          type.indexOf(
            'استرداد'
          ) !== -1
        ) {

          return false;

        }


        return true;

      }
    );


  var amount =
    rows.reduce(
      function(
        total,
        operation
      ) {

        return (
          total +
          operation.amount
        );

      },
      0
    );


  return {

    amount:
      accountBudgetRoundV2_(
        amount
      ),

    count:
      rows.length,

    rows:
      rows

  };

};


/* ==========================================================
 * تحديث الربط في موازنات الحسابات
 *
 * يعدل الشهر الحالي والأشهر المستقبلية فقط.
 *
 * لا يغير:
 * - قيمة الموازنة الشهرية
 * - نشط
 * - الملاحظات
 * - الأشهر السابقة
 * ==========================================================
 */

function applyCurrentAccountBudgetMappingV4() {

  var ss =
    accountBudgetSpreadsheetV2_();


  var sheet =
    ss.getSheetByName(
      ACCOUNT_BUDGET_V2_CONFIG.SHEET
    );


  if (!sheet) {

    throw new Error(
      'ورقة "موازنات الحسابات" غير موجودة.'
    );

  }


  if (
    sheet.getLastRow() < 2
  ) {

    return {

      success:
        true,

      updated:
        0

    };

  }


  var currentMonth =
    accountBudgetMonthStartV2_(
      new Date()
    );


  var definitions =
    accountBudgetDefinitionsV2_();


  var byBudget = {};


  definitions.forEach(
    function(definition) {

      byBudget[
        definition.budgetKey
      ] =
        definition;

    }
  );


  var range =
    sheet.getRange(
      2,
      1,
      sheet.getLastRow() - 1,
      ACCOUNT_BUDGET_V2_HEADERS.length
    );


  var rows =
    range.getValues();


  var updated =
    0;


  rows.forEach(
    function(row) {

      var month =
        accountBudgetValidDateV2_(
          row[0]
        );


      if (
        !month ||
        month <
          currentMonth
      ) {

        return;

      }


      var budgetKey =
        accountBudgetCanonicalBudgetV4_(
          row[2]
        );


      var definition =
        byBudget[
          budgetKey
        ];


      if (!definition) {

        return;

      }


      var changed =
        false;


      if (
        row[1] !==
        definition.accountKey
      ) {

        row[1] =
          definition.accountKey;

        changed =
          true;

      }


      if (
        row[2] !==
        definition.budgetKey
      ) {

        row[2] =
          definition.budgetKey;

        changed =
          true;

      }


      if (
        row[3] !==
        definition.accountName
      ) {

        row[3] =
          definition.accountName;

        changed =
          true;

      }


      if (changed) {

        row[7] =
          new Date();


        updated++;

      }

    }
  );


  range.setValues(
    rows
  );


  accountBudgetFormatSheetV2_(
    sheet
  );


  SpreadsheetApp.flush();


  var result = {

    success:
      true,

    version:
      'ACCOUNT_BUDGET_MAPPING_V4',

    updated:
      updated,

    mapping: [

      'عائلي شهري -> AHLI_001',

      'عائلي سنوي -> AHLI_001',

      'شخصي شهري -> AHLI_001',

      'شخصي سنوي -> AHLI_001',

      'تأمين المصروف -> AHLI_002',

      'تأمين الدخل -> AHLI_002'

    ],

    safety:
      'تم تعديل ربط الحساب فقط للشهر الحالي والأشهر المستقبلية. لم يتم تعديل العمليات أو الأشهر السابقة.'

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

/* ==========================================================
 * SAVE MONTHLY BUDGET V4
 *
 * الحفظ حسب الموازنة وليس حسب الحساب.
 *
 * السبب:
 * AHLI_001 يحتوي 4 موازنات.
 * AHLI_002 يحتوي موازنتين.
 * ==========================================================
 */

saveAccountMonthlyBudgetV2 =
function(payload) {

  payload = payload || {};


  var ss =
    accountBudgetSpreadsheetV2_();


  var sheet =
    ss.getSheetByName(
      ACCOUNT_BUDGET_V2_CONFIG.SHEET
    );


  if (!sheet) {

    setupAccountBudgetsV2();

    sheet =
      ss.getSheetByName(
        ACCOUNT_BUDGET_V2_CONFIG.SHEET
      );

  }


  var monthStart =
    accountBudgetResolveMonthV2_(
      payload.month
    );


  accountBudgetEnsureMonthRowsV2_(
    sheet,
    monthStart
  );


  var inputs =
    Array.isArray(
      payload.accounts
    )
      ? payload.accounts
      : [payload];


  var definitions =
    accountBudgetDefinitionsV2_();


  var rows =
    sheet
      .getRange(
        2,
        1,
        sheet.getLastRow() - 1,
        ACCOUNT_BUDGET_V2_HEADERS.length
      )
      .getValues();


  var updated = 0;


  inputs.forEach(
    function(input) {

      input =
        input || {};


      /*
       * الموازنة هي المفتاح الأساسي.
       */
      var budgetKey =
        accountBudgetCanonicalBudgetV4_(
          input.budgetKey ||
          input.budgetName ||
          input.name
        );


      if (!budgetKey) {

        throw new Error(
          'اسم الموازنة غير موجود.'
        );

      }


      var definition =
        definitions.find(
          function(item) {

            return (
              item.budgetKey ===
              budgetKey
            );

          }
        );


      if (!definition) {

        throw new Error(
          'الموازنة غير معروفة: ' +
          budgetKey
        );

      }


      var budgetValue =
        input.budget;


      if (
        budgetValue === '' ||
        budgetValue === null ||
        budgetValue === undefined
      ) {

        budgetValue = '';

      } else {

        budgetValue =
          Number(
            budgetValue
          );


        if (
          !Number.isFinite(
            budgetValue
          ) ||
          budgetValue < 0
        ) {

          throw new Error(
            'قيمة الموازنة غير صحيحة: ' +
            budgetKey
          );

        }

      }


      var targetRow =
        -1;


      for (
        var index = 0;
        index < rows.length;
        index++
      ) {

        var rowMonth =
          accountBudgetValidDateV2_(
            rows[index][0]
          );


        if (!rowMonth) {

          continue;

        }


        if (
          accountBudgetMonthKeyV2_(
            rowMonth
          ) !==
          accountBudgetMonthKeyV2_(
            monthStart
          )
        ) {

          continue;

        }


        var rowBudget =
          accountBudgetCanonicalBudgetV4_(
            rows[index][2]
          );


        /*
         * المطابقة حسب الموازنة.
         */
        if (
          rowBudget !==
          budgetKey
        ) {

          continue;

        }


        targetRow =
          index + 2;

        break;

      }


      if (
        targetRow < 0
      ) {

        throw new Error(
          'تعذر العثور على صف الموازنة: ' +
          budgetKey
        );

      }


      /*
       * تأكيد الربط الصحيح أيضًا.
       */
      sheet
        .getRange(
          targetRow,
          2,
          1,
          7
        )
        .setValues([[
          definition.accountKey,
          definition.budgetKey,
          definition.accountName,
          budgetValue,
          'نعم',
          accountBudgetTextV2_(
            input.notes
          ),
          new Date()
        ]]);


      updated++;

    }
  );


  accountBudgetFormatSheetV2_(
    sheet
  );


  SpreadsheetApp.flush();


  var result = {

    success:
      true,

    version:
      'ACCOUNT_BUDGET_SAVE_V4',

    month:
      accountBudgetMonthKeyV2_(
        monthStart
      ),

    updated:
      updated,

    safety:
      'تم حفظ الموازنة الشهرية حسب اسم الموازنة.'

  };


  console.log(
    JSON.stringify(
      result,
      null,
      2
    )
  );


  return result;

};
function diagnoseAccountBudgetSettingsV4() {

  var ss =
    accountBudgetSpreadsheetV2_();

  var sheet =
    ss.getSheetByName(
      'موازنات الحسابات'
    );

  if (!sheet) {
    throw new Error(
      'ورقة موازنات الحسابات غير موجودة.'
    );
  }

  var monthStart =
    accountBudgetMonthStartV2_(
      new Date()
    );

  var monthKey =
    accountBudgetMonthKeyV2_(
      monthStart
    );

  var rows =
    sheet
      .getRange(
        2,
        1,
        sheet.getLastRow() - 1,
        8
      )
      .getValues();

  var currentRows = [];

  rows.forEach(
    function(row, index) {

      var rowMonth =
        accountBudgetValidDateV2_(
          row[0]
        );

      if (!rowMonth) {
        return;
      }

      if (
        accountBudgetMonthKeyV2_(
          rowMonth
        ) !==
        monthKey
      ) {
        return;
      }

      currentRows.push({

        row:
          index + 2,

        month:
          monthKey,

        accountKey:
          accountBudgetTextV2_(
            row[1]
          ),

        budget:
          accountBudgetTextV2_(
            row[2]
          ),

        canonicalBudget:
          accountBudgetCanonicalBudgetV4_(
            row[2]
          ),

        account:
          accountBudgetTextV2_(
            row[3]
          ),

        monthlyBudget:
          row[4],

        active:
          accountBudgetTextV2_(
            row[5]
          )

      });

    }
  );

  var settings =
    accountBudgetReadMonthSettingsV2_(
      ss,
      monthStart
    );

  var definitions =
    accountBudgetDefinitionsV2_();

  var result = {

    success:
      true,

    version:
      'ACCOUNT_BUDGET_SETTINGS_DIAGNOSTIC_V4',

    month:
      monthKey,

    definitions:
      definitions,

    rows:
      currentRows,

    settings:
      settings,

    safety:
      'قراءة فقط. لم يتم تعديل أي خلية.'

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
function cleanupDuplicateAccountBudgetRowsV4() {

  var ss =
    accountBudgetSpreadsheetV2_();

  var sheet =
    ss.getSheetByName(
      ACCOUNT_BUDGET_V2_CONFIG.SHEET
    );


  if (!sheet) {

    throw new Error(
      'ورقة موازنات الحسابات غير موجودة.'
    );

  }


  if (
    sheet.getLastRow() < 2
  ) {

    return {
      success: true,
      deleted: 0
    };

  }


  var rows =
    sheet
      .getRange(
        2,
        1,
        sheet.getLastRow() - 1,
        ACCOUNT_BUDGET_V2_HEADERS.length
      )
      .getValues();


  var groups = {};


  rows.forEach(
    function(row, index) {

      var month =
        accountBudgetValidDateV2_(
          row[0]
        );


      var budget =
        accountBudgetCanonicalBudgetV4_(
          row[2]
        );


      if (
        !month ||
        !budget
      ) {

        return;

      }


      var key =
        accountBudgetMonthKeyV2_(
          month
        ) +
        '|' +
        budget;


      if (
        !groups[key]
      ) {

        groups[key] = [];

      }


      groups[key].push({

        sheetRow:
          index + 2,

        budgetValue:
          row[4],

        hasBudget:
          !(
            row[4] === '' ||
            row[4] === null ||
            row[4] === undefined
          )

      });

    }
  );


  var rowsToDelete = [];


  Object.keys(
    groups
  ).forEach(
    function(key) {

      var group =
        groups[key];


      if (
        group.length <= 1
      ) {

        return;

      }


      var populated =
        group.filter(
          function(item) {

            return item.hasBudget;

          }
        );


      /*
       * نحذف فقط الصفوف المكررة الفارغة
       * عندما يوجد صف آخر لنفس الموازنة
       * يحتوي قيمة فعلية.
       */
      if (
        populated.length > 0
      ) {

        group.forEach(
          function(item) {

            if (
              !item.hasBudget
            ) {

              rowsToDelete.push(
                item.sheetRow
              );

            }

          }
        );

      }

    }
  );


  /*
   * الحذف من الأسفل للأعلى
   * حتى لا تتغير أرقام الصفوف.
   */
  rowsToDelete
    .sort(
      function(a, b) {
        return b - a;
      }
    )
    .forEach(
      function(rowNumber) {

        sheet.deleteRow(
          rowNumber
        );

      }
    );


  SpreadsheetApp.flush();


  var result = {

    success:
      true,

    version:
      'ACCOUNT_BUDGET_DUPLICATE_CLEANUP_V4',

    deleted:
      rowsToDelete.length,

    deletedRows:
      rowsToDelete.sort(
        function(a, b) {
          return a - b;
        }
      ),

    safety:
      'تم حذف الصفوف المكررة الفارغة فقط. لم يتم حذف أي صف يحتوي قيمة موازنة.'

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

/* ==========================================================
 * MOBILE BUDGET API V1
 *
 * طبقة عرض فقط.
 *
 * لا تعدل:
 * - العمليات
 * - موازنات الحسابات
 * - المحرك V2/V3
 *
 * الهدف:
 * تجهيز نفس البيانات للوحة الحالية
 * ولتطبيق الهاتف مستقبلًا.
 * ==========================================================
 */


/* ==========================================================
 * قراءة تاريخ بداية شهر
 * ==========================================================
 */

function mobileBudgetMonthStartV1_(
  value
) {

  return accountBudgetResolveMonthV2_(
    value
  );

}


/* ==========================================================
 * نهاية الشهر
 * ==========================================================
 */

function mobileBudgetMonthEndV1_(
  monthStart
) {

  return new Date(
    monthStart.getFullYear(),
    monthStart.getMonth() + 1,
    0,
    23,
    59,
    59,
    999
  );

}


/* ==========================================================
 * قراءة جميع موازنات الحسابات
 * ==========================================================
 */

function mobileBudgetReadBudgetRowsV1_(
  ss
) {

  var sheet =
    ss.getSheetByName(
      ACCOUNT_BUDGET_V2_CONFIG.SHEET
    );


  if (
    !sheet ||
    sheet.getLastRow() < 2
  ) {

    return [];

  }


  var rows =
    sheet
      .getRange(
        2,
        1,
        sheet.getLastRow() - 1,
        ACCOUNT_BUDGET_V2_HEADERS.length
      )
      .getValues();


  return rows
    .map(
      function(row) {

        var month =
          accountBudgetValidDateV2_(
            row[0]
          );


        var budget =
          accountBudgetCanonicalBudgetV4_(
            row[2]
          );


        var rawAmount =
          row[4];


        var hasAmount =
          !(
            rawAmount === '' ||
            rawAmount === null ||
            rawAmount === undefined
          );


        return {

          month:
            month,

          monthKey:
            month
              ? accountBudgetMonthKeyV2_(
                  month
                )
              : '',

          accountKey:
            accountBudgetTextV2_(
              row[1]
            ),

          budget:
            budget,

          accountName:
            accountBudgetTextV2_(
              row[3]
            ),

          amount:
            hasAmount
              ? accountBudgetNumberV2_(
                  rawAmount
                )
              : null,

          active:
            accountBudgetIsActiveV2_(
              row[5]
            )

        };

      }
    )
    .filter(
      function(row) {

        return (
          row.month &&
          row.budget
        );

      }
    );

}


/* ==========================================================
 * مجموع تعزيز موازنة حتى تاريخ معين
 *
 * يستخدم خصوصًا للتأمين.
 * ==========================================================
 */

function mobileBudgetContributionsUntilV1_(
  budgetRows,
  budgetName,
  endMonth
) {

  var total =
    0;


  budgetRows.forEach(
    function(row) {

      if (
        row.budget !==
        budgetName
      ) {

        return;

      }


      if (
        !row.active
      ) {

        return;

      }


      if (
        row.amount === null
      ) {

        return;

      }


      if (
        row.month.getTime() >
        endMonth.getTime()
      ) {

        return;

      }


      total +=
        row.amount;

    }
  );


  return accountBudgetRoundV2_(
    total
  );

}


/* ==========================================================
 * تعزيز شهر محدد
 * ==========================================================
 */

function mobileBudgetCurrentTopUpV1_(
  budgetRows,
  budgetName,
  monthStart
) {

  var monthKey =
    accountBudgetMonthKeyV2_(
      monthStart
    );


  var found =
    null;


  budgetRows.forEach(
    function(row) {

      if (
        row.budget !==
        budgetName
      ) {

        return;

      }


      if (
        row.monthKey !==
        monthKey
      ) {

        return;

      }


      if (
        row.amount !== null
      ) {

        found =
          row.amount;

      }

    }
  );


  return found === null
    ? null
    : accountBudgetRoundV2_(
        found
      );

}


/* ==========================================================
 * مجموع المصروف لموازنة حتى تاريخ معين
 * ==========================================================
 */

function mobileBudgetSpentUntilV1_(
  operations,
  budgetName,
  periodEnd
) {

  var total =
    0;


  operations.forEach(
    function(operation) {

      var budget =
        accountBudgetCanonicalBudgetV4_(
          operation.budgetKey
        );


      if (
        budget !==
        budgetName
      ) {

        return;

      }


      if (
        operation.date >
        periodEnd
      ) {

        return;

      }


      if (
        !accountBudgetIsExpenseV2_(
          operation
        )
      ) {

        return;

      }


      total +=
        operation.amount;

    }
  );


  return accountBudgetRoundV2_(
    total
  );

}


/* ==========================================================
 * مصروف موازنة داخل شهر
 * ==========================================================
 */

function mobileBudgetSpentInMonthV1_(
  operations,
  budgetName,
  monthStart,
  periodEnd
) {

  var rows =
    operations.filter(
      function(operation) {

        return (

          accountBudgetCanonicalBudgetV4_(
            operation.budgetKey
          ) ===
          budgetName

          &&

          operation.date >=
            monthStart

          &&

          operation.date <=
            periodEnd

          &&

          accountBudgetIsExpenseV2_(
            operation
          )

        );

      }
    );


  var amount =
    rows.reduce(
      function(
        total,
        operation
      ) {

        return (
          total +
          operation.amount
        );

      },
      0
    );


  var itemMap = {};


  rows.forEach(
    function(operation) {

      var item =
        operation.item ||
        'غير محدد';


      itemMap[item] =
        (
          itemMap[item] || 0
        ) +
        operation.amount;

    }
  );


  var items =
    Object.keys(
      itemMap
    )
      .map(
        function(item) {

          return {

            item:
              item,

            spent:
              accountBudgetRoundV2_(
                itemMap[item]
              )

          };

        }
      )
      .sort(
        function(a, b) {

          return (
            b.spent -
            a.spent
          );

        }
      );


  return {

    spent:
      accountBudgetRoundV2_(
        amount
      ),

    operationsCount:
      rows.length,

    itemsCount:
      items.length,

    topItem:
      items.length
        ? items[0].item
        : '',

    topItemSpent:
      items.length
        ? items[0].spent
        : 0,

    items:
      items

  };

}


/* ==========================================================
 * بطاقة موازنة صرف
 * ==========================================================
 */

function mobileBudgetBuildSpendingCardV1_(
  account
) {

  var topItem =
    account.behavior &&
    account.behavior.topItem
      ? account.behavior.topItem
      : null;


  return {

    budget:
      account.budgetKey,

    accountKey:
      account.accountKey,

    accountName:
      account.accountName,

    allocated:
      account.monthlyBudget,

    spent:
      account.spent,

    remaining:
      account.remaining,

    usagePercent:
      account.usagePercent,

    operationsCount:
      account.operationsCount || 0,

    itemsCount:
      account.behavior
        ? account.behavior.itemsCount || 0
        : 0,

    topItem:
      topItem
        ? topItem.item
        : '',

    topItemSpent:
      topItem
        ? topItem.spent
        : 0,

    status:
      account.status

  };

}


/* ==========================================================
 * بطاقة تأمين تراكمية
 * ==========================================================
 */

function mobileBudgetBuildInsuranceCardV1_(
  budgetName,
  accountName,
  accountKey,
  budgetRows,
  operations,
  monthStart,
  periodEnd
) {

  /*
   * الشهر السابق.
   */
  var previousMonth =
    new Date(
      monthStart.getFullYear(),
      monthStart.getMonth() - 1,
      1
    );


  var previousMonthEnd =
    mobileBudgetMonthEndV1_(
      previousMonth
    );


  /*
   * جميع التعزيزات حتى الشهر السابق.
   */
  var contributionsBefore =
    mobileBudgetContributionsUntilV1_(
      budgetRows,
      budgetName,
      previousMonth
    );


  /*
   * جميع المصروفات حتى نهاية الشهر السابق.
   */
  var spentBefore =
    mobileBudgetSpentUntilV1_(
      operations,
      budgetName,
      previousMonthEnd
    );


  var previousBalance =
    Math.max(
      0,
      contributionsBefore -
      spentBefore
    );


  /*
   * تعزيز الشهر الحالي.
   */
  var currentTopUp =
    mobileBudgetCurrentTopUpV1_(
      budgetRows,
      budgetName,
      monthStart
    );


  var currentTopUpValue =
    currentTopUp === null
      ? 0
      : currentTopUp;


  /*
   * إجمالي المتوفر.
   */
  var totalAvailable =
    previousBalance +
    currentTopUpValue;


  /*
   * مصروف الشهر الحالي.
   */
  var current =
    mobileBudgetSpentInMonthV1_(
      operations,
      budgetName,
      monthStart,
      periodEnd
    );


  var remaining =
    totalAvailable -
    current.spent;


  var status;


  if (
    currentTopUp === null &&
    previousBalance <= 0
  ) {

    status = {
      code:
        'undefined',

      label:
        'غير محدد',

      level:
        'neutral'
    };

  }

  else if (
    remaining < -0.0005
  ) {

    status = {
      code:
        'over',

      label:
        'تجاوز',

      level:
        'danger'
    };

  }

  else if (
    remaining <= 0.0005
  ) {

    status = {
      code:
        'empty',

      label:
        'نفد',

      level:
        'warning'
    };

  }

  else {

    var ratio =
      totalAvailable > 0
        ? remaining /
          totalAvailable
        : 0;


    status =
      ratio <= 0.15
        ? {
            code:
              'near_limit',

            label:
              'قرب الحد',

            level:
              'warning'
          }
        : {
            code:
              'available',

            label:
              'متاح',

            level:
              'good'
          };

  }


  return {

    budget:
      budgetName,

    accountKey:
      accountKey,

    accountName:
      accountName,

    previousBalance:
      accountBudgetRoundV2_(
        previousBalance
      ),

    currentTopUp:
      currentTopUp,

    totalAvailable:
      accountBudgetRoundV2_(
        totalAvailable
      ),

    spent:
      current.spent,

    remaining:
      accountBudgetRoundV2_(
        remaining
      ),

    operationsCount:
      current.operationsCount,

    itemsCount:
      current.itemsCount,

    topItem:
      current.topItem,

    topItemSpent:
      current.topItemSpent,

    status:
      status,

    items:
      current.items

  };

}


/* ==========================================================
 * API الرئيسي للوحة والتطبيق
 * ==========================================================
 */

function getMobileBudgetDashboardV1(
  filters
) {

  filters =
    filters || {};


  var ss =
    accountBudgetSpreadsheetV2_();


  var monthStart =
    mobileBudgetMonthStartV1_(
      filters.month
    );


  var monthEnd =
    mobileBudgetMonthEndV1_(
      monthStart
    );


  var now =
    new Date();


  var currentMonth =
    accountBudgetMonthStartV2_(
      now
    );


  var periodEnd =
    accountBudgetMonthKeyV2_(
      monthStart
    ) ===
    accountBudgetMonthKeyV2_(
      currentMonth
    )
      ? now
      : monthEnd;


  /*
   * المحرك الحالي الذي ثبت أنه يعمل.
   */
  var dashboard =
    getAccountBudgetDashboardV3({
      month:
        accountBudgetMonthKeyV2_(
          monthStart
        )
    });


  var operations =
    accountBudgetReadOperationsV2_(
      ss
    );


  var budgetRows =
    mobileBudgetReadBudgetRowsV1_(
      ss
    );


  /*
   * الأربع موازنات الأساسية.
   */
  var spendingNames = [
    'عائلي شهري',
    'عائلي سنوي',
    'شخصي شهري',
    'شخصي سنوي'
  ];


  var spending =
  spendingNames
    .map(
      function(name) {

        var account =
          dashboard.accounts.find(
            function(row) {

              return (
                row.budgetKey ===
                name
              );

            }
          );


        if (!account) {
          return null;
        }


        /*
         * القيمة المعتمدة تؤخذ مباشرة
         * من موازنات الحسابات للشهر المختار.
         */
        var allocated =
          mobileBudgetCurrentTopUpV1_(
            budgetRows,
            name,
            monthStart
          );


        return mobileBudgetBuildSpendingCardV11_(
          account,
          allocated
        );

      }
    )
    .filter(
      Boolean
    );
  /*
   * التأمين.
   */
  var expenseInsurance =
    mobileBudgetBuildInsuranceCardV1_(

      'تأمين المصروف',

      'الأهلي 002',

      'AHLI_002',

      budgetRows,

      operations,

      monthStart,

      periodEnd

    );


  var incomeInsurance =
    mobileBudgetBuildInsuranceCardV1_(

      'تأمين الدخل',

      'الأهلي 002',

      'AHLI_002',

      budgetRows,

      operations,

      monthStart,

      periodEnd

    );


  var insurance = [
    expenseInsurance,
    incomeInsurance
  ];


  /*
   * إجمالي المصروفات الأربع.
   */
  var spendingTotalBudget =
    spending.reduce(
      function(
        total,
        row
      ) {

        return (
          total +
          Number(
            row.allocated || 0
          )
        );

      },
      0
    );


  var spendingTotalSpent =
    spending.reduce(
      function(
        total,
        row
      ) {

        return (
          total +
          Number(
            row.spent || 0
          )
        );

      },
      0
    );


  var spendingTotalRemaining =
    spending.reduce(
      function(
        total,
        row
      ) {

        return (
          total +
          Number(
            row.remaining || 0
          )
        );

      },
      0
    );


  /*
   * إجمالي التأمين.
   */
  var insurancePrevious =
    insurance.reduce(
      function(
        total,
        row
      ) {

        return (
          total +
          row.previousBalance
        );

      },
      0
    );


  var insuranceTopUp =
    insurance.reduce(
      function(
        total,
        row
      ) {

        return (
          total +
          Number(
            row.currentTopUp || 0
          )
        );

      },
      0
    );


  var insuranceAvailable =
    insurance.reduce(
      function(
        total,
        row
      ) {

        return (
          total +
          row.totalAvailable
        );

      },
      0
    );


  var insuranceSpent =
    insurance.reduce(
      function(
        total,
        row
      ) {

        return (
          total +
          row.spent
        );

      },
      0
    );


  var insuranceRemaining =
    insurance.reduce(
      function(
        total,
        row
      ) {

        return (
          total +
          row.remaining
        );

      },
      0
    );


  /*
   * آخر رصيد معروف للحسابات البنكية.
   * نعرضه مرة واحدة لكل حساب.
   */
  var ahli001 =
    dashboard.accounts.find(
      function(row) {

        return (
          row.accountKey ===
          'AHLI_001'
        );

      }
    );


  var ahli002 =
    dashboard.accounts.find(
      function(row) {

        return (
          row.accountKey ===
          'AHLI_002'
        );

      }
    );


  var result = {

    success:
      true,

    version:
      'MOBILE_BUDGET_DASHBOARD_V1',

    month:
      accountBudgetMonthKeyV2_(
        monthStart
      ),

    generatedAt:
      Utilities.formatDate(
        now,
        ACCOUNT_BUDGET_V2_CONFIG.TIME_ZONE,
        'dd/MM/yyyy HH:mm:ss'
      ),


    summary: {

      totalBudget:
        accountBudgetRoundV2_(
          spendingTotalBudget
        ),

      totalSpent:
        accountBudgetRoundV2_(
          spendingTotalSpent
        ),

      totalRemaining:
        accountBudgetRoundV2_(
          spendingTotalRemaining
        ),

      operationsCount:
        spending.reduce(
          function(
            total,
            row
          ) {

            return (
              total +
              row.operationsCount
            );

          },
          0
        ),

      itemsCount:
        spending.reduce(
          function(
            total,
            row
          ) {

            return (
              total +
              row.itemsCount
            );

          },
          0
        )

    },


    bankAccounts: {

      AHLI_001: {

        accountKey:
          'AHLI_001',

        accountName:
          'الأهلي 001',

        lastKnownBalance:
          ahli001
            ? ahli001.actualBalance
            : null,

        balanceDate:
          ahli001
            ? ahli001.balanceDate
            : ''

      },


      AHLI_002: {

        accountKey:
          'AHLI_002',

        accountName:
          'الأهلي 002',

        lastKnownBalance:
          ahli002
            ? ahli002.actualBalance
            : null,

        balanceDate:
          ahli002
            ? ahli002.balanceDate
            : ''

      }

    },


    spending: {

      title:
        'المصروفات',

      accounts:
        spending

    },


    insurance: {

      title:
        'التأمين',

      summary: {

        previousBalance:
          accountBudgetRoundV2_(
            insurancePrevious
          ),

        currentTopUp:
          accountBudgetRoundV2_(
            insuranceTopUp
          ),

        totalAvailable:
          accountBudgetRoundV2_(
            insuranceAvailable
          ),

        spent:
          accountBudgetRoundV2_(
            insuranceSpent
          ),

        remaining:
          accountBudgetRoundV2_(
            insuranceRemaining
          )

      },

      accounts:
        insurance

    }

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


/* ==========================================================
 * اختبار قراءة فقط
 * ==========================================================
 */

function testMobileBudgetDashboardV1() {

  var result =
    getMobileBudgetDashboardV1({
      month:
        accountBudgetMonthKeyV2_(
          new Date()
        )
    });


  console.log(
    JSON.stringify(
      result,
      null,
      2
    )
  );


  return {

    success:
      true,

    version:
      result.version,

    month:
      result.month,

    summary:
      result.summary,

    bankAccounts:
      result.bankAccounts,

    spending:
      result.spending.accounts.map(
        function(row) {

          return {

            budget:
              row.budget,

            account:
              row.accountName,

            allocated:
              row.allocated,

            spent:
              row.spent,

            remaining:
              row.remaining,

            operationsCount:
              row.operationsCount,

            itemsCount:
              row.itemsCount,

            topItem:
              row.topItem,

            status:
              row.status
                ? row.status.label
                : ''

          };

        }
      ),

    insurance:
      result.insurance,

    safety:
      'قراءة فقط. لم يتم تعديل العمليات أو الموازنات.'

  };


}

/* ==========================================================
 * MOBILE SPENDING CARD PATCH V1.1
 *
 * الموازنة الشهرية تؤخذ مباشرة من:
 * "موازنات الحسابات"
 *
 * ولا نعتمد في واجهة الهاتف على
 * account.monthlyBudget.
 *
 * لا يعدل أي بيانات.
 * ==========================================================
 */

function mobileBudgetBuildSpendingCardV11_(
  account,
  allocated
) {

  var spent =
    accountBudgetRoundV2_(
      account &&
      account.spent
        ? account.spent
        : 0
    );


  var hasBudget =
    !(
      allocated === null ||
      allocated === undefined ||
      allocated === ''
    );


  var budgetValue =
    hasBudget
      ? accountBudgetRoundV2_(
          allocated
        )
      : null;


  var remaining =
    hasBudget
      ? accountBudgetRoundV2_(
          budgetValue -
          spent
        )
      : null;


  var usagePercent =
    null;


  if (
    hasBudget &&
    budgetValue > 0
  ) {

    usagePercent =
      accountBudgetRoundV2_(
        spent /
        budgetValue *
        100
      );

  }

  else if (
    hasBudget &&
    budgetValue === 0 &&
    spent === 0
  ) {

    usagePercent =
      0;

  }


  var status;


  if (!hasBudget) {

    status = {
      code:
        'undefined',

      label:
        'غير محدد',

      level:
        'neutral'
    };

  }

  else if (
    remaining < -0.0005
  ) {

    status = {
      code:
        'over',

      label:
        'متجاوز',

      level:
        'danger'
    };

  }

  else if (
    Math.abs(
      remaining
    ) <= 0.0005
  ) {

    status = {
      code:
        'complete',

      label:
        'نفد',

      level:
        'warning'
    };

  }

  else if (
    budgetValue > 0 &&
    remaining /
    budgetValue <= 0.15
  ) {

    status = {
      code:
        'near_limit',

      label:
        'قرب الحد',

      level:
        'warning'
    };

  }

  else {

    status = {
      code:
        'available',

      label:
        'متاح',

      level:
        'good'
    };

  }


  var topItem =
    account &&
    account.behavior &&
    account.behavior.topItem
      ? account.behavior.topItem
      : null;


  return {

    budget:
      account.budgetKey,

    accountKey:
      account.accountKey,

    accountName:
      account.accountName,

    allocated:
      budgetValue,

    spent:
      spent,

    remaining:
      remaining,

    usagePercent:
      usagePercent,

    operationsCount:
      account.operationsCount || 0,

    itemsCount:
      account.behavior
        ? account.behavior.itemsCount || 0
        : 0,

    topItem:
      topItem
        ? topItem.item
        : '',

    topItemSpent:
      topItem
        ? topItem.spent
        : 0,

    status:
      status

  };

}

/* ==========================================================
 * MOBILE ANNUAL BUDGET V1.2
 *
 * الموازنة السنوية:
 * - تجمع التعزيزات من بداية الخطة حتى الشهر المختار.
 * - تجمع المصروف السنوي حتى التاريخ.
 * - تنظر أيضًا إلى التعزيزات المستقبلية المسجلة.
 *
 * الحالات:
 * متاح
 * قرب الحد
 * استخدام مقدم
 * متجاوز
 *
 * قراءة فقط.
 * ==========================================================
 */


/* ==========================================================
 * تحليل المصروف بين تاريخين
 * ==========================================================
 */

function mobileBudgetSpendBetweenV12_(
  operations,
  budgetName,
  startDate,
  endDate
) {

  var rows =
    operations.filter(
      function(operation) {

        return (

          accountBudgetCanonicalBudgetV4_(
            operation.budgetKey
          ) ===
          budgetName

          &&

          operation.date >=
            startDate

          &&

          operation.date <=
            endDate

          &&

          accountBudgetIsExpenseV2_(
            operation
          )

        );

      }
    );


  var spent =
    rows.reduce(
      function(total, operation) {

        return (
          total +
          operation.amount
        );

      },
      0
    );


  var itemsMap = {};


  rows.forEach(
    function(operation) {

      var item =
        operation.item ||
        'غير محدد';


      itemsMap[item] =
        (
          itemsMap[item] || 0
        ) +
        operation.amount;

    }
  );


  var items =
    Object.keys(
      itemsMap
    )
      .map(
        function(item) {

          return {

            item:
              item,

            spent:
              accountBudgetRoundV2_(
                itemsMap[item]
              )

          };

        }
      )
      .sort(
        function(a, b) {

          return (
            b.spent -
            a.spent
          );

        }
      );


  return {

    spent:
      accountBudgetRoundV2_(
        spent
      ),

    operationsCount:
      rows.length,

    itemsCount:
      items.length,

    topItem:
      items.length
        ? items[0].item
        : '',

    topItemSpent:
      items.length
        ? items[0].spent
        : 0,

    items:
      items

  };

}


/* ==========================================================
 * بطاقة الموازنة السنوية
 * ==========================================================
 */

function mobileBudgetBuildAnnualCardV12_(
  account,
  budgetRows,
  operations,
  monthStart,
  periodEnd
) {

  var budgetName =
    account.budgetKey;


  var year =
    monthStart.getFullYear();


  /*
   * جميع التعزيزات المعرفة
   * لهذه الموازنة داخل السنة.
   */
  var annualRows =
    budgetRows
      .filter(
        function(row) {

          return (

            row.budget ===
              budgetName

            &&

            row.active

            &&

            row.amount !==
              null

            &&

            row.month.getFullYear() ===
              year

          );

        }
      )
      .sort(
        function(a, b) {

          return (
            a.month -
            b.month
          );

        }
      );


  /*
   * التعزيز الحالي.
   */
  var currentTopUp =
    mobileBudgetCurrentTopUpV1_(
      budgetRows,
      budgetName,
      monthStart
    );


  if (
    !annualRows.length
  ) {

    return mobileBudgetBuildSpendingCardV11_(
      account,
      currentTopUp
    );

  }


  /*
   * بداية الخطة السنوية:
   * أول شهر يحتوي موازنة فعلية.
   */
  var startMonth =
    annualRows[0].month;


  /*
   * التعزيزات المتاحة حتى الشهر المختار.
   */
  var availableToDate =
    annualRows.reduce(
      function(total, row) {

        if (
          row.month >
          monthStart
        ) {

          return total;

        }


        return (
          total +
          row.amount
        );

      },
      0
    );


  /*
   * إجمالي الخطة السنوية المعروفة.
   *
   * يشمل الأشهر المستقبلية التي
   * تم إدخال موازنتها مسبقًا.
   */
  var plannedAnnual =
    annualRows.reduce(
      function(total, row) {

        return (
          total +
          row.amount
        );

      },
      0
    );


  var activity =
    mobileBudgetSpendBetweenV12_(

      operations,

      budgetName,

      startMonth,

      periodEnd

    );


  var remaining =
    availableToDate -
    activity.spent;


  var usagePercent =
    availableToDate > 0

      ? (
          activity.spent /
          availableToDate *
          100
        )

      : null;


  var status;


  if (
    availableToDate <= 0
  ) {

    status = {

      code:
        'undefined',

      label:
        'غير محدد',

      level:
        'neutral'

    };

  }

  else if (
    remaining < -0.0005
  ) {

    /*
     * تم استخدام جزء من تعزيز
     * الأشهر القادمة.
     */
    if (
      plannedAnnual >
        availableToDate

      &&

      activity.spent <=
        plannedAnnual + 0.0005
    ) {

      status = {

        code:
          'advance_use',

        label:
          'استخدام مقدم',

        level:
          'info'

      };

    }

    else {

      status = {

        code:
          'over',

        label:
          'متجاوز',

        level:
          'danger'

      };

    }

  }

  else if (
    Math.abs(
      remaining
    ) <= 0.0005
  ) {

    status = {

      code:
        'complete',

      label:
        'نفد',

      level:
        'warning'

    };

  }

  else if (
    remaining /
      availableToDate <=
    0.15
  ) {

    status = {

      code:
        'near_limit',

      label:
        'قرب الحد',

      level:
        'warning'

    };

  }

  else {

    status = {

      code:
        'available',

      label:
        'متاح',

      level:
        'good'

    };

  }


  return {

    budget:
      budgetName,

    accountKey:
      account.accountKey,

    accountName:
      account.accountName,

    /*
     * تعزيز الشهر نفسه.
     */
    allocated:
      currentTopUp,

    /*
     * المتاح المتراكم حتى الشهر.
     */
    availableToDate:
      accountBudgetRoundV2_(
        availableToDate
      ),

    /*
     * إجمالي الخطة السنوية
     * المدخلة حتى الآن.
     */
    plannedAnnual:
      accountBudgetRoundV2_(
        plannedAnnual
      ),

    spent:
      activity.spent,

    remaining:
      accountBudgetRoundV2_(
        remaining
      ),

    usagePercent:
      usagePercent === null
        ? null
        : accountBudgetRoundV2_(
            usagePercent
          ),

    operationsCount:
      activity.operationsCount,

    itemsCount:
      activity.itemsCount,

    topItem:
      activity.topItem,

    topItemSpent:
      activity.topItemSpent,

    status:
      status,

    items:
      activity.items

  };

}
/* ==========================================================
 * MOBILE BUDGET DASHBOARD V1.3
 *
 * طبقة نهائية للعرض:
 * - تعتمد على V1 العامل.
 * - تصحح الموازنات السنوية فقط.
 * - لا تعدل العمليات.
 * - لا تعدل موازنات الحسابات.
 * ==========================================================
 */

function getMobileBudgetDashboardV13(
  filters
) {

  filters =
    filters || {};


  /*
   * نبدأ من النسخة التي ثبت أنها تعمل.
   */
  var result =
    getMobileBudgetDashboardV1(
      filters
    );


  var ss =
    accountBudgetSpreadsheetV2_();


  var monthStart =
    accountBudgetResolveMonthV2_(
      filters.month
    );


  var monthEnd =
    new Date(
      monthStart.getFullYear(),
      monthStart.getMonth() + 1,
      0,
      23,
      59,
      59,
      999
    );


  var now =
    new Date();


  var currentMonth =
    accountBudgetMonthStartV2_(
      now
    );


  var periodEnd =
    accountBudgetMonthKeyV2_(
      monthStart
    ) ===
    accountBudgetMonthKeyV2_(
      currentMonth
    )
      ? now
      : monthEnd;


  var budgetRows =
    mobileBudgetReadBudgetRowsV1_(
      ss
    );


  var operations =
    accountBudgetReadOperationsV2_(
      ss
    );


  var annualBudgets = [
    'عائلي سنوي',
    'شخصي سنوي'
  ];


  /*
   * استبدال بطاقات السنوي فقط.
   */
  result.spending.accounts =
    result.spending.accounts.map(
      function(account) {

        if (
          annualBudgets.indexOf(
            account.budget
          ) < 0
        ) {

          return account;

        }


        /*
         * نحول البطاقة الحالية إلى
         * الشكل الذي تحتاجه الدالة السنوية.
         */
        var annualAccount = {

          budgetKey:
            account.budget,

          accountKey:
            account.accountKey,

          accountName:
            account.accountName,

          spent:
            account.spent,

          operationsCount:
            account.operationsCount,

          behavior: {

            itemsCount:
              account.itemsCount,

            topItem:
              account.topItem
                ? {
                    item:
                      account.topItem,

                    spent:
                      account.topItemSpent
                  }
                : null

          }

        };


        return mobileBudgetBuildAnnualCardV12_(

          annualAccount,

          budgetRows,

          operations,

          monthStart,

          periodEnd

        );

      }
    );


  /*
   * إعادة حساب المؤشر العام
   * بعد تصحيح البطاقات السنوية.
   *
   * totalBudget =
   * تعزيز الشهر الحالي فقط.
   */
  var accounts =
    result.spending.accounts;


  result.summary = {

    totalBudget:
      accountBudgetRoundV2_(

        accounts.reduce(
          function(total, row) {

            return (
              total +
              Number(
                row.allocated || 0
              )
            );

          },
          0
        )

      ),


    totalSpent:
      accountBudgetRoundV2_(

        accounts.reduce(
          function(total, row) {

            return (
              total +
              Number(
                row.spent || 0
              )
            );

          },
          0
        )

      ),


    totalRemaining:
      accountBudgetRoundV2_(

        accounts.reduce(
          function(total, row) {

            return (
              total +
              Number(
                row.remaining || 0
              )
            );

          },
          0
        )

      ),


    operationsCount:
      accounts.reduce(
        function(total, row) {

          return (
            total +
            Number(
              row.operationsCount || 0
            )
          );

        },
        0
      ),


    itemsCount:
      accounts.reduce(
        function(total, row) {

          return (
            total +
            Number(
              row.itemsCount || 0
            )
          );

        },
        0
      )

  };


  result.version =
    'MOBILE_BUDGET_DASHBOARD_V1_3';


  return result;

}


/* ==========================================================
 * اختبار V1.3
 * قراءة فقط
 * ==========================================================
 */

function testMobileBudgetDashboardV13() {

  var result =
    getMobileBudgetDashboardV13({
      month:
        accountBudgetMonthKeyV2_(
          new Date()
        )
    });


  console.log(
    JSON.stringify(
      result,
      null,
      2
    )
  );


  return {

    success:
      true,

    version:
      result.version,

    month:
      result.month,

    summary:
      result.summary,

    spending:
      result.spending.accounts.map(
        function(row) {

          return {

            budget:
              row.budget,

            allocated:
              row.allocated,

            availableToDate:
              row.availableToDate !==
                undefined
                ? row.availableToDate
                : null,

            plannedAnnual:
              row.plannedAnnual !==
                undefined
                ? row.plannedAnnual
                : null,

            spent:
              row.spent,

            remaining:
              row.remaining,

            operationsCount:
              row.operationsCount,

            itemsCount:
              row.itemsCount,

            topItem:
              row.topItem,

            status:
              row.status
                ? row.status.label
                : ''

          };

        }
      ),

    insurance:
      result.insurance,

    safety:
      'قراءة فقط. لم يتم تعديل العمليات أو موازنات الحسابات.'

  };

}


/* ==========================================================
 * MOBILE BUDGET SAVE V8
 *
 * جسر الحفظ بين Dashboard.html ونظام موازنات الحسابات.
 * - Dashboard يرسل القيمة في amount.
 * - saveAccountMonthlyBudgetV2 يحفظ القيمة في budget.
 * - بعد الحفظ تعاد لوحة V1.3 لتحديث الواجهة مباشرة.
 * ==========================================================
 */

function saveMobileBudgetMonthlyV8(payload) {

  payload =
    payload || {};


  var amount =
    payload.amount;


  if (
    amount === '' ||
    amount === null ||
    amount === undefined
  ) {

    throw new Error(
      'قيمة الموازنة مطلوبة.'
    );

  }


  amount =
    Number(
      amount
    );


  if (
    !Number.isFinite(
      amount
    ) ||
    amount < 0
  ) {

    throw new Error(
      'قيمة الموازنة غير صحيحة.'
    );

  }


  var budgetKey =
    accountBudgetCanonicalBudgetV4_(
      payload.budgetKey ||
      payload.budgetName ||
      payload.budget
    );


  if (
    !budgetKey
  ) {

    throw new Error(
      'اسم الموازنة غير موجود.'
    );

  }


  var saveResult =
    saveAccountMonthlyBudgetV2({

      month:
        payload.month,

      budgetKey:
        budgetKey,

      budgetName:
        budgetKey,

      budget:
        amount,

      accountKey:
        payload.accountKey,

      accountName:
        payload.accountName,

      notes:
        payload.notes

    });


  var dashboard =
    getMobileBudgetDashboardV13({

      month:
        payload.month

    });


  return {

    success:
      true,

    version:
      'MOBILE_BUDGET_SAVE_V8',

    saved:
      saveResult,

    dashboard:
      dashboard

  };

}

