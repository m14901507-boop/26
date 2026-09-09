/**
 * ==========================================================
 * 62_FinancialRouting.gs
 *
 * محرك فصل العمليات المالية
 * ==========================================================
 *
 * الهدف:
 * - المصروفات تبقى مستقلة.
 * - الدخل الحقيقي مستقل.
 * - دخل الإيجارات مستقل.
 * - الجمعية مستقلة.
 * - الاستردادات لا تعتبر دخلاً جديدًا.
 * - التحويلات بين الحسابات لا تعتبر دخلاً أو مصروفًا.
 *
 * هذا الملف قراءة وتحليل فقط.
 * لا يغير ورقة العمليات.
 * لا يغير Gmail.
 * لا يرسل إيصالات.
 * ==========================================================
 */


var FINANCIAL_ROUTING_CONFIG =
  Object.freeze({

    OPERATIONS_SHEET:
      'العمليات',

    TIME_ZONE:
      'Asia/Muscat',

    ROUTES: {

      EXPENSE:
        'expense',

      INCOME:
        'income',

      RENT_INCOME:
        'rent_income',

      REFUND:
        'refund',

      INTERNAL_TRANSFER:
        'internal_transfer',

      ASSOCIATION:
        'association',

      NON_FINANCIAL:
        'non_financial',

      REVIEW:
        'review'

    }

  });


/* ==========================================================
 * الدالة الرئيسية
 * ==========================================================
 */

/**
 * تعيد جميع العمليات بعد فصلها إلى المسارات الصحيحة.
 */
function getFinancialRoutingData() {

  var ss =
    appActiveSpreadsheet();


  var sheet =
    ss.getSheetByName(
      FINANCIAL_ROUTING_CONFIG
        .OPERATIONS_SHEET
    );


  if (
    !sheet ||
    sheet.getLastRow() < 2
  ) {

    return {

      generatedAt:
        new Date(),

      counts:
        {},

      routes:
        {},

      records:
        []

    };

  }


  var values =
    sheet
      .getRange(

        1,

        1,

        sheet.getLastRow(),

        Math.max(
          15,
          sheet.getLastColumn()
        )

      )
      .getValues();


  var headers =
    values[0]
      .map(
        function(value) {

          return appText(
            value
          );

        }
      );


  var indexes =
    financialRoutingBuildIndexes_(
      headers
    );


  var routedRecords =
    [];


  values
    .slice(1)
    .forEach(
      function(row) {

        var record =
          financialRoutingBuildRecord_(

            row,

            indexes

          );


        if (
          !record.id &&
          !record.item &&
          !record.amount
        ) {

          return;

        }


        record.route =
          financialRoutingDetectRoute_(
            record
          );


        routedRecords.push(
          record
        );

      }
    );


  var routes = {

    expense:
      [],

    income:
      [],

    rent_income:
      [],

    refund:
      [],

    internal_transfer:
      [],

    association:
      [],

    non_financial:
      [],

    review:
      []

  };


  routedRecords.forEach(
    function(record) {

      if (
        !routes[
          record.route
        ]
      ) {

        routes.review.push(
          record
        );


        return;

      }


      routes[
        record.route
      ].push(
        record
      );

    }
  );


  var counts =
    {};


  Object.keys(
    routes
  )
  .forEach(
    function(route) {

      counts[
        route
      ] =
        routes[
          route
        ].length;

    }
  );


  return {

    generatedAt:
      Utilities.formatDate(

        new Date(),

        FINANCIAL_ROUTING_CONFIG
          .TIME_ZONE,

        'dd/MM/yyyy HH:mm:ss'

      ),

    counts:
      counts,

    routes:
      routes,

    records:
      routedRecords

  };

}


/* ==========================================================
 * تحديد مسار العملية
 * ==========================================================
 */

function financialRoutingDetectRoute_(
  record
) {

  var type =
    financialRoutingNormalize_(
      record.type
    );


  var system =
    financialRoutingNormalize_(
      record.system
    );


  var item =
    financialRoutingNormalize_(
      record.item
    );


  var classification =
    financialRoutingNormalize_(
      record.classification
    );


  var status =
    financialRoutingNormalize_(
      record.status
    );


  var combined =

    [
      item,
      classification,
      system,
      status
    ]
    .join(
      ' '
    );


  /* ========================================================
   * 1. الجمعية
   *
   * لها الأولوية حتى لا تدخل في الدخل أو المصروف.
   * ========================================================
   */

  if (

    combined.indexOf(
      'جمعيه'
    ) !== -1 ||

    combined.indexOf(
      'الجمعيه'
    ) !== -1

  ) {

    return FINANCIAL_ROUTING_CONFIG
      .ROUTES
      .ASSOCIATION;

  }


  /* ========================================================
   * 2. التحويل الداخلي
   * ========================================================
   */

  if (

    type.indexOf(
      'تحويل داخلي'
    ) !== -1 ||

    item.indexOf(
      'تحويل بين حساباتي'
    ) !== -1 ||

    classification.indexOf(
      'تحويل داخلي'
    ) !== -1

  ) {

    return FINANCIAL_ROUTING_CONFIG
      .ROUTES
      .INTERNAL_TRANSFER;

  }


  /* ========================================================
   * 3. الاستردادات والمرتجعات
   *
   * لا تعامل كدخل حقيقي.
   * ========================================================
   */

  if (

    item.indexOf(
      'استرداد'
    ) !== -1 ||

    classification.indexOf(
      'استرداد'
    ) !== -1 ||

    item.indexOf(
      'مرتجع'
    ) !== -1 ||

    classification.indexOf(
      'مرتجع'
    ) !== -1

  ) {

    return FINANCIAL_ROUTING_CONFIG
      .ROUTES
      .REFUND;

  }


  /* ========================================================
   * 4. دخل الإيجارات
   *
   * مثل:
   * Kumar Rent
   * Amon Rent
   * Majed Rent
   * Salah Al Din Rent
   * ========================================================
   */

  if (

    (
      system.indexOf(
        'ايجارات'
      ) !== -1 ||

      item.indexOf(
        ' rent'
      ) !== -1 ||

      /\brent\b/i.test(
        record.item || ''
      )
    )

    &&

    (
      type.indexOf(
        'وارد'
      ) !== -1 ||

      type.indexOf(
        'دخل'
      ) !== -1
    )

  ) {

    return FINANCIAL_ROUTING_CONFIG
      .ROUTES
      .RENT_INCOME;

  }


  /* ========================================================
   * 5. المصروفات
   *
   * مثال:
   * إيجار السكن
   * وقود
   * مواد غذائية
   * فواتير
   * ========================================================
   */

  if (

    type.indexOf(
      'مصروف'
    ) !== -1

  ) {

    return FINANCIAL_ROUTING_CONFIG
      .ROUTES
      .EXPENSE;

  }


  /* ========================================================
   * 6. الدخل الحقيقي
   *
   * راتب
   * دخل إضافي
   * أرباح...
   * ========================================================
   */

  if (

    type.indexOf(
      'وارد'
    ) !== -1 ||

    type.indexOf(
      'دخل'
    ) !== -1

  ) {

    return FINANCIAL_ROUTING_CONFIG
      .ROUTES
      .INCOME;

  }


  /* ========================================================
   * 7. غير مالي
   * ========================================================
   */

  if (

    type.indexOf(
      'غير مالي'
    ) !== -1 ||

    system.indexOf(
      'غير مالي'
    ) !== -1

  ) {

    return FINANCIAL_ROUTING_CONFIG
      .ROUTES
      .NON_FINANCIAL;

  }


  return FINANCIAL_ROUTING_CONFIG
    .ROUTES
    .REVIEW;

}


/* ==========================================================
 * تجهيز سجل العملية
 * ==========================================================
 */

function financialRoutingBuildRecord_(

  row,

  indexes

) {

  var dateValue =
    financialRoutingValue_(

      row,

      indexes.date

    );


  var date =
    dateValue instanceof Date

      ? dateValue

      : new Date(
          dateValue
        );


  if (
    isNaN(
      date.getTime()
    )
  ) {

    date =
      null;

  }


  return {

    id:
      appText(
        financialRoutingValue_(

          row,

          indexes.id

        )
      ),


    date:
      date,


    item:
      appText(
        financialRoutingValue_(

          row,

          indexes.item

        )
      ),


    classification:
      appText(
        financialRoutingValue_(

          row,

          indexes.classification

        )
      ),


    amount:
      appNumber(
        financialRoutingValue_(

          row,

          indexes.amount

        )
      ),


    party:
      appText(
        financialRoutingValue_(

          row,

          indexes.party

        )
      ),


    type:
      appText(
        financialRoutingValue_(

          row,

          indexes.type

        )
      ),


    channel:
      appText(
        financialRoutingValue_(

          row,

          indexes.channel

        )
      ),


    bank:
      appText(
        financialRoutingValue_(

          row,

          indexes.bank

        )
      ),


    system:
      appText(
        financialRoutingValue_(

          row,

          indexes.system

        )
      ),


    status:
      appText(
        financialRoutingValue_(

          row,

          indexes.status

        )
      ),


    category:
      appText(
        financialRoutingValue_(

          row,

          indexes.category

        )
      ),


    spendingPeriod:
      appText(
        financialRoutingValue_(

          row,

          indexes.period

        )
      ),


    scope:
      appText(
        financialRoutingValue_(

          row,

          indexes.scope

        )
      )

  };

}


/* ==========================================================
 * تحديد الأعمدة
 * ==========================================================
 */

function financialRoutingBuildIndexes_(
  headers
) {

  return {

    id:
      headers.indexOf(
        'معرف الرسالة'
      ),

    date:
      headers.indexOf(
        'التاريخ والوقت'
      ),

    item:
      headers.indexOf(
        'البند'
      ),

    classification:
      headers.indexOf(
        'التصنيف'
      ),

    amount:
      headers.indexOf(
        'المبلغ'
      ),

    party:
      headers.indexOf(
        'الطرف'
      ),

    type:
      headers.indexOf(
        'نوع العملية'
      ),

    channel:
      headers.indexOf(
        'قناة العملية'
      ),

    bank:
      headers.indexOf(
        'البنك'
      ),

    system:
      headers.indexOf(
        'النظام'
      ),

    status:
      headers.indexOf(
        'حالة التسجيل'
      ),

    category:
      headers.indexOf(
        'الفئة'
      ),

    period:
      headers.indexOf(
        'الفترة'
      ),

    scope:
      headers.indexOf(
        'الصنف'
      )

  };

}


/* ==========================================================
 * Helpers
 * ==========================================================
 */

function financialRoutingValue_(

  row,

  index

) {

  if (
    index === null ||
    index === undefined ||
    index < 0
  ) {

    return '';

  }


  return row[
    index
  ];

}


function financialRoutingNormalize_(
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
 * اختبار آمن
 * ==========================================================
 */

/**
 * قراءة فقط.
 *
 * لا يغير أي بيانات.
 */
function testFinancialRouting() {

  var data =
    getFinancialRoutingData();


  if (
    !data ||
    !data.routes ||
    !data.counts
  ) {

    throw new Error(
      'فشل محرك فصل العمليات.'
    );

  }


  /**
   * التأكد أن إيجار السكن مصروف،
   * وليس دخل إيجارات.
   */
  var housingExpense =
    data.routes.expense.find(
      function(record) {

        return (

          financialRoutingNormalize_(
            record.item
          ) ===
          financialRoutingNormalize_(
            'إيجار السكن'
          )

        );

      }
    );


  var housingInIncome =
    data.routes.income.concat(
      data.routes.rent_income
    )
    .find(
      function(record) {

        return (

          financialRoutingNormalize_(
            record.item
          ) ===
          financialRoutingNormalize_(
            'إيجار السكن'
          )

        );

      }
    );


  if (
    housingInIncome
  ) {

    throw new Error(
      'خطأ: إيجار السكن ظهر ضمن الدخل.'
    );

  }


  var result = {

    success:
      true,

    expense:
      data.counts.expense,

    income:
      data.counts.income,

    rentIncome:
      data.counts.rent_income,

    refunds:
      data.counts.refund,

    internalTransfers:
      data.counts.internal_transfer,

    association:
      data.counts.association,

    review:
      data.counts.review,

    housingRentAsExpense:
      Boolean(
        housingExpense
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

    'نجح اختبار فصل الدخل والمصروف والجمعية.',

    'اختبار النظام',

    8

  );


  return result;

}
