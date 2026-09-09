/**
 * ==========================================================
 * 99_Tests.gs
 *
 * الاختبارات والتشخيص النهائي
 * لنظام الإدارة المالية
 * ==========================================================
 *
 * الاختبارات العامة الموجودة داخل الوحدات الجديدة
 * لم يتم تكرارها هنا:
 *
 * 00_Core.gs
 * 10_Gmail.gs
 * 20_Operations.gs
 * 30_Rent.gs
 * 40_Receipts.gs
 * 50_Budget.gs
 * 60_Dashboard.gs
 * 70_System.gs
 *
 * هذا الملف يحتوي على:
 *
 * - اختبارات Gmail المتخصصة
 * - اختبار قراءة الرسائل
 * - تشخيص الإيصالات
 * - اختبار Slides
 * - اختبار إيصال تجريبي يدوي
 * - اختبار التكامل النهائي الآمن
 * ==========================================================
 */


/* ==========================================================
 * Gmail
 * ==========================================================
 */


/**
 * اختبار Gmail API.
 *
 * قراءة فقط.
 * لا يعدل Gmail.
 */
function testAdvancedGmailService() {

  var labels =
    gmailGetLabelsByName();


  var result = {

    success:
      true,

    labelCount:
      labels.size

  };


  appToast(

    'خدمة Gmail API تعمل. عدد التصنيفات: ' +
      labels.size,

    'اختبار Gmail API',

    8

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


/**
 * اختبار مطابقة بنود دليل البنود
 * مع تصنيفات Gmail.
 *
 * ينشئ / يعيد بناء:
 * اختبار المطابقة
 */
function testLabelMatching() {

  var ss =
    appActiveSpreadsheet();


  var guideSheet =
    appSheet(
      ss,
      APP_CONFIG.GUIDE_SHEET
    );


  var guideItems =
    operationsReadGuideItems(
      guideSheet,
      false
    );


  if (
    guideItems.length === 0
  ) {

    throw new Error(
      'لا توجد بنود في ورقة دليل البنود.'
    );

  }


  var labelsByName =
    gmailGetLabelsByName();


  var counts = {};


  guideItems.forEach(
    function(item) {

      var key =
        appKey(
          item.item
        );


      if (!key) {
        return;
      }


      counts[key] =
        (
          counts[key] || 0
        ) + 1;

    }
  );


  var uniqueItems =
    [];


  var seen =
    new Set();


  guideItems.forEach(
    function(item) {

      var key =
        appKey(
          item.item
        );


      if (
        !key ||
        seen.has(
          key
        )
      ) {

        return;

      }


      seen.add(
        key
      );


      uniqueItems.push(
        item
      );

    }
  );


  var matchedCount =
    0;


  var missingCount =
    0;


  var duplicateCount =
    0;


  var rows =
    uniqueItems.map(
      function(item) {

        var key =
          appKey(
            item.item
          );


        var exists =
          labelsByName.has(
            key
          );


        var repetitions =
          counts[key] || 0;


        var result =
          'مطابق';


        if (
          !exists
        ) {

          result =
            'غير موجود في Gmail أو يوجد اختلاف في الكتابة';


          missingCount++;

        }


        else {

          matchedCount++;

        }


        if (
          repetitions > 1
        ) {

          duplicateCount++;


          if (
            exists
          ) {

            result =
              'مطابق، لكنه مكرر في دليل البنود ' +
              repetitions +
              ' مرات';

          }

        }


        return [

          item.item,

          exists
            ? 'نعم'
            : 'لا',

          result

        ];

      }
    );


  var sheet =
    ss.getSheetByName(
      APP_CONFIG.MATCHING_SHEET
    );


  if (
    !sheet
  ) {

    sheet =
      ss.insertSheet(
        APP_CONFIG.MATCHING_SHEET
      );


  } else {

    sheet.clear();

  }


  sheet
    .getRange(
      1,
      1,
      1,
      3
    )
    .setValues([[

      'البند في دليل البنود',

      'موجود في Gmail؟',

      'النتيجة'

    ]])
    .setFontWeight(
      'bold'
    )
    .setHorizontalAlignment(
      'center'
    );


  if (
    rows.length > 0
  ) {

    sheet
      .getRange(
        2,
        1,
        rows.length,
        3
      )
      .setValues(
        rows
      );


    sheet
      .getRange(
        2,
        2,
        rows.length,
        1
      )
      .setBackgrounds(

        rows.map(
          function(row) {

            return [

              row[1] === 'نعم'

                ? '#d9ead3'

                : '#f4cccc'

            ];

          }
        )

      );

  }


  sheet.setFrozenRows(
    1
  );


  sheet.setRightToLeft(
    true
  );


  sheet.autoResizeColumns(
    1,
    3
  );


  SpreadsheetApp.flush();


  var result = {

    success:
      true,

    total:
      rows.length,

    matched:
      matchedCount,

    missing:
      missingCount,

    duplicated:
      duplicateCount

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
 * اختبار تحليل رسائل Gmail
 * ==========================================================
 */


/**
 * قراءة الرسائل المصنفة وتحليلها.
 *
 * لا تسجل عمليات جديدة.
 *
 * تنشئ / تعيد بناء:
 * اختبار الرسائل
 */
function testReadLabeledMessages() {

  var ss =
    appActiveSpreadsheet();


  var guideSheet =
    appSheet(
      ss,
      APP_CONFIG.GUIDE_SHEET
    );


  var guideItems =
    operationsReadGuideItems(
      guideSheet,
      true
    );


  if (
    guideItems.length === 0
  ) {

    throw new Error(
      'لا توجد بنود نشطة.'
    );

  }


  var assignments =
    gmailCollectAssignments(
      guideItems
    );


  var records =
    [];


  assignments.forEach(
    function(assignment) {

      var guideItem =
        assignment.items &&
        assignment.items.length

          ? assignment.items[0]

          : null;


      var message =
        gmailGetMessage(
          assignment.messageId
        );


      if (
        !message ||
        !guideItem
      ) {

        return;

      }


      var parsed =
        bankParseMessage(

          gmailPlainBody(
            message
          ),

          guideItem.item,

          message.getDate(),

          message.getFrom(),

          message.getSubject()

        );


      var status =
        bankRegistrationStatus(

          parsed,

          guideItem,

          assignment.items

        );


      records.push({

        date:
          parsed.dateValue ||
          new Date(0),

        row: [

          assignment.messageId,

          assignment.items
            .map(
              function(item) {

                return item.item;

              }
            )
            .join(
              '، '
            ),

          guideItem.item,

          parsed.dateDisplay,

          Number.isFinite(
            parsed.amount
          )
            ? parsed.amount
            : '',

          parsed.operationType,

          parsed.party,

          parsed.channel,

          parsed.bank,

          parsed.summary,

          status

        ]

      });

    }
  );


  records.sort(
    function(
      first,
      second
    ) {

      return (

        second.date.getTime() -

        first.date.getTime()

      );

    }
  );


  var rows =
    records
      .slice(
        0,
        APP_CONFIG.MAX_TEST_MESSAGES
      )
      .map(
        function(record) {

          return record.row;

        }
      );


  var sheet =
    ss.getSheetByName(
      APP_CONFIG.TEST_MESSAGES_SHEET
    );


  if (
    !sheet
  ) {

    sheet =
      ss.insertSheet(
        APP_CONFIG.TEST_MESSAGES_SHEET
      );


  } else {

    sheet.clear();

  }


  var headers = [

    'معرف الرسالة',

    'البنود الموجودة على الرسالة',

    'البند المختار',

    'تاريخ العملية',

    'المبلغ',

    'نوع العملية',

    'الطرف',

    'قناة العملية',

    'البنك',

    'ملخص العملية',

    'حالة التحليل'

  ];


  sheet
    .getRange(
      1,
      1,
      1,
      headers.length
    )
    .setValues([
      headers
    ])
    .setFontWeight(
      'bold'
    )
    .setHorizontalAlignment(
      'center'
    );


  if (
    rows.length > 0
  ) {

    sheet
      .getRange(
        2,
        1,
        rows.length,
        headers.length
      )
      .setValues(
        rows
      );


    sheet
      .getRange(
        2,
        5,
        rows.length,
        1
      )
      .setNumberFormat(
        '0.000'
      );


    operationsColorStatus(

      sheet,

      2,

      rows.length,

      11

    );

  }


  sheet.setFrozenRows(
    1
  );


  sheet.setRightToLeft(
    true
  );


  SpreadsheetApp.flush();


  appToast(

    'تم تحليل ' +
      rows.length +
      ' رسالة.',

    'اختبار الرسائل',

    8

  );


  return {

    success:
      true,

    analyzed:
      rows.length

  };

}


/* ==========================================================
 * اختبار Slides
 * ==========================================================
 */


/**
 * اختبار Google Slides API والصور.
 *
 * ينشئ ملف Slides مؤقتًا
 * ثم يحذفه تلقائيًا.
 *
 * لا يرسل بريدًا.
 */
function testImageReceiptService() {

  receiptEnsureSlidesService();


  var presentationId =
    '';


  try {

    var presentation =
      SlidesApp.create(
        'اختبار خدمة إيصالات الصور'
      );


    presentationId =
      presentation.getId();


    var slides =
      presentation.getSlides();


    if (
      slides.length === 0
    ) {

      throw new Error(
        'تعذر إنشاء شريحة الاختبار.'
      );

    }


    var slide =
      slides[0];


    var slideId =
      slide.getObjectId();


    presentation.saveAndClose();


    Utilities.sleep(
      1000
    );


    var thumbnail =
      Slides.Presentations.Pages
        .getThumbnail(

          presentationId,

          slideId,

          {

            'thumbnailProperties.mimeType':
              'PNG',

            'thumbnailProperties.thumbnailSize':
              'LARGE'

          }

        );


    if (
      !thumbnail ||
      !thumbnail.contentUrl
    ) {

      throw new Error(
        'لم يتم إنشاء صورة الاختبار.'
      );

    }


    appToast(

      'خدمة Google Slides API تعمل بنجاح.',

      'اختبار إيصالات الصور',

      8

    );


    return {

      success:
        true,

      thumbnailCreated:
        true

    };


  } finally {

    if (
      presentationId
    ) {

      try {

        DriveApp
          .getFileById(
            presentationId
          )
          .setTrashed(
            true
          );


      } catch (error) {

        console.log(
          'تعذر حذف ملف الاختبار.'
        );

      }

    }

  }

}


/* ==========================================================
 * اختبار إيصال فعلي بوضع TEST
 * ==========================================================
 */


/**
 * إرسال إيصال صورة تجريبي واحد.
 *
 * تنبيه:
 * هذه الدالة ترسل بريدًا حقيقيًا
 * إلى بريد أحد المستأجرين ولكن
 * بوضع TEST.
 *
 * لا تستخدم ضمن اختبار التكامل الآمن.
 */
function testSendOneRentReceiptImage() {

  return receiptProcess({

    limit:
      1,

    testMode:
      true

  });

}


/* ==========================================================
 * مزامنة بريد المستأجرين
 * ==========================================================
 */


/**
 * مزامنة بريد المستأجرين
 * مع سجل المستأجرين.
 *
 * كانت هذه الدالة مكررة مرتين
 * في 11_Tests.gs.gs.
 *
 * تم الاحتفاظ بنسخة واحدة فقط.
 */
function syncTenantEmailsToLedger() {

  var updatedCount =
    receiptSyncEmails();


  appToast(

    'تم تحديث البريد في ' +
      updatedCount +
      ' صف.',

    'مزامنة بريد المستأجرين',

    8

  );


  return updatedCount;

}


/* ==========================================================
 * تشخيص بيانات الإيصالات
 * ==========================================================
 */


/**
 * تشخيص بيانات الإيصالات.
 *
 * ينشئ / يعيد بناء:
 * تشخيص الإيصالات
 *
 * لا يرسل بريدًا.
 */
function diagnoseReceiptData() {

  var ss =
    appActiveSpreadsheet();


  var ledgerSheet =
    appSheet(

      ss,

      APP_CONFIG
        .TENANT_LEDGER_SHEET

    );


  var values =
    [];


  if (
    ledgerSheet.getLastRow() >= 2
  ) {

    values =
      ledgerSheet
        .getRange(

          2,

          1,

          ledgerSheet.getLastRow() - 1,

          17

        )
        .getValues();

  }


  var validCount =
    0;


  var invalidCount =
    0;


  var rows =
    values.map(
      function(
        row,
        index
      ) {

        var messageId =
          appText(
            row[0]
          );


        var paymentDate =
          appDate(
            row[1]
          );


        var tenantName =
          appText(
            row[2]
          );


        var unit =
          appText(
            row[3]
          );


        var email =
          appText(
            row[4]
          );


        var paymentType =
          appText(
            row[5]
          );


        var amount =
          appNumber(
            row[7]
          );


        var reasons =
          [];


        if (
          paymentType !==
          'إيجار'
        ) {

          reasons.push(
            'ليس دفعة إيجار'
          );

        }


        if (
          !messageId
        ) {

          reasons.push(
            'معرف الرسالة فارغ'
          );

        }


        if (
          !paymentDate
        ) {

          reasons.push(
            'تاريخ السداد غير صالح'
          );

        }


        if (
          !tenantName
        ) {

          reasons.push(
            'اسم المستأجر فارغ'
          );

        }


        if (
          !email
        ) {

          reasons.push(
            'البريد فارغ'
          );


        } else if (
          !appValidEmail(
            email
          )
        ) {

          reasons.push(
            'صيغة البريد غير صحيحة'
          );

        }


        if (
          !Number.isFinite(
            amount
          )
        ) {

          reasons.push(
            'المبلغ غير صالح'
          );

        }


        var status =
          reasons.length === 0

            ? 'صالح للإرسال'

            : reasons.join(
                '، '
              );


        if (
          reasons.length === 0
        ) {

          validCount++;

        } else {

          invalidCount++;

        }


        return [

          index + 2,

          tenantName,

          unit,

          paymentType,

          email,

          paymentDate || '',

          Number.isFinite(
            amount
          )
            ? amount
            : '',

          status

        ];

      }
    );


  var sheet =
    ss.getSheetByName(
      APP_CONFIG.DIAGNOSTIC_SHEET
    );


  if (
    !sheet
  ) {

    sheet =
      ss.insertSheet(
        APP_CONFIG.DIAGNOSTIC_SHEET
      );


  } else {

    sheet.clear();

  }


  var headers = [

    'رقم الصف',

    'اسم المستأجر',

    'الوحدة',

    'نوع السداد',

    'البريد الإلكتروني',

    'تاريخ السداد',

    'المبلغ',

    'نتيجة التشخيص'

  ];


  sheet
    .getRange(
      1,
      1,
      1,
      headers.length
    )
    .setValues([
      headers
    ])
    .setFontWeight(
      'bold'
    )
    .setHorizontalAlignment(
      'center'
    );


  if (
    rows.length > 0
  ) {

    sheet
      .getRange(
        2,
        1,
        rows.length,
        headers.length
      )
      .setValues(
        rows
      );


    sheet
      .getRange(
        2,
        6,
        rows.length,
        1
      )
      .setNumberFormat(
        'dd/MM/yyyy HH:mm:ss'
      );


    sheet
      .getRange(
        2,
        7,
        rows.length,
        1
      )
      .setNumberFormat(
        '0.000'
      );


    var colors =
      rows.map(
        function(row) {

          return [

            row[7] ===
              'صالح للإرسال'

              ? '#d9ead3'

              : '#f4cccc'

          ];

        }
      );


    sheet
      .getRange(
        2,
        8,
        rows.length,
        1
      )
      .setBackgrounds(
        colors
      );

  }


  sheet.setRightToLeft(
    true
  );


  sheet.setFrozenRows(
    1
  );


  sheet.autoResizeColumns(
    1,
    headers.length
  );


  SpreadsheetApp.flush();


  appToast(

    'تم إنشاء ورقة تشخيص الإيصالات.',

    'تشخيص الإيصالات',

    8

  );


  return {

    success:
      true,

    total:
      rows.length,

    valid:
      validCount,

    needsReview:
      invalidCount

  };

}


/* ==========================================================
 * تشغيل النظام الحقيقي للاختبار اليدوي
 * ==========================================================
 */


/**
 * اختبار تشغيل النظام يدويًا.
 *
 * تنبيه مهم:
 *
 * هذه الدالة تشغّل النظام الحقيقي:
 *
 * - العمليات
 * - الإيجارات
 * - الإيصالات
 *
 * وقد ترسل إيصالًا فعليًا إذا كان
 * نظام الإيصالات مفعّلًا ويوجد
 * إيصال جديد.
 *
 * لا تستخدم ضمن اختبار التكامل الآمن.
 */
function testRunFinancialSystem() {

  return safeRunFinancialSystem();

}


/* ==========================================================
 * اختبار التكامل النهائي الآمن
 * ==========================================================
 */


/**
 * اختبار الترابط الكامل للنظام.
 *
 * ==========================================================
 * آمن:
 * ==========================================================
 *
 * لا يقوم بـ:
 *
 * - إضافة عمليات جديدة
 * - حذف عمليات
 * - إعادة بناء سجل الإيجارات
 * - إرسال إيصالات
 * - إنشاء Triggers
 * - حذف Triggers
 * - تعديل تصنيفات Gmail
 *
 * ==========================================================
 * يتحقق من:
 * ==========================================================
 *
 * 00 Core
 * 10 Gmail
 * 20 Operations
 * 30 Rent
 * 40 Receipts
 * 50 Budget
 * 60 Dashboard
 * 70 System
 */
function testFullSystemIntegrationSafe() {

  var startedAt =
    new Date();


  var ss =
    appActiveSpreadsheet();


  var checks = [];


  /**
   * ========================================================
   * 1. Core
   * ========================================================
   */
  if (
    typeof appText !==
      'function' ||
    typeof appKey !==
      'function' ||
    typeof appNumber !==
      'function' ||
    typeof appDate !==
      'function'
  ) {

    throw new Error(
      'فشل اختبار 00_Core.gs.'
    );

  }


  checks.push({

    module:
      '00_Core',

    success:
      true

  });


  /**
   * ========================================================
   * 2. Gmail
   * ========================================================
   *
   * قراءة التصنيفات فقط.
   */
  if (
    typeof gmailGetLabelsByName !==
      'function'
  ) {

    throw new Error(
      'لم يتم العثور على gmailGetLabelsByName.'
    );

  }


  var gmailLabels =
    gmailGetLabelsByName();


  if (
    !gmailLabels ||
    typeof gmailLabels.size !==
      'number'
  ) {

    throw new Error(
      'تعذر قراءة تصنيفات Gmail.'
    );

  }


  checks.push({

    module:
      '10_Gmail',

    success:
      true,

    labels:
      gmailLabels.size

  });


  /**
   * ========================================================
   * 3. Operations
   * ========================================================
   */
  var operationsSheet =
    appSheet(

      ss,

      APP_CONFIG
        .OPERATIONS_SHEET

    );


  var operationHeaders =
    operationsSheet
      .getRange(
        1,
        1,
        1,
        Math.min(
          15,
          operationsSheet.getLastColumn()
        )
      )
      .getDisplayValues()[0];


  var requiredOperationHeaders = [

    'معرف الرسالة',

    'التاريخ والوقت',

    'البند',

    'المبلغ',

    'نوع العملية',

    'البنك',

    'النظام',

    'حالة التسجيل',

    'الفئة',

    'الفترة',

    'الصنف'

  ];


  requiredOperationHeaders.forEach(
    function(header) {

      if (
        operationHeaders.indexOf(
          header
        ) === -1
      ) {

        throw new Error(

          'عمود مفقود في العمليات: ' +
          header

        );

      }

    }
  );


  checks.push({

    module:
      '20_Operations',

    success:
      true,

    rows:
      Math.max(
        0,
        operationsSheet.getLastRow() - 1
      )

  });


  /**
   * ========================================================
   * 4. Rent
   * ========================================================
   */
  if (
    typeof tenantLedgerRebuild !==
      'function' ||
    typeof rentSummaryRebuild !==
      'function'
  ) {

    throw new Error(
      'دوال 30_Rent.gs غير مكتملة.'
    );

  }


  var ledgerSheet =
    ss.getSheetByName(
      APP_CONFIG.TENANT_LEDGER_SHEET
    );


  var rentSummarySheet =
    ss.getSheetByName(
      APP_CONFIG.RENT_SUMMARY_SHEET
    );


  if (
    !ledgerSheet ||
    !rentSummarySheet
  ) {

    throw new Error(
      'لم يتم العثور على أوراق الإيجارات المطلوبة.'
    );

  }


  checks.push({

    module:
      '30_Rent',

    success:
      true,

    ledgerRows:
      Math.max(
        0,
        ledgerSheet.getLastRow() - 1
      ),

    summaryRows:
      Math.max(
        0,
        rentSummarySheet.getLastRow() - 5
      )

  });


  /**
   * ========================================================
   * 5. Receipts
   * ========================================================
   */
  if (
    typeof receiptCreateImage !==
      'function' ||
    typeof receiptSendEmail !==
      'function' ||
    typeof receiptSendNew !==
      'function'
  ) {

    throw new Error(
      'دوال 40_Receipts.gs غير مكتملة.'
    );

  }


  receiptEnsureSlidesService();


  var templateId =
    PropertiesService
      .getScriptProperties()
      .getProperty(
        RECEIPT_TEMPLATE_ENGINE
          .TEMPLATE_PROPERTY
      );


  if (
    !templateId
  ) {

    throw new Error(
      'لا يوجد قالب إيصال معتمد.'
    );

  }


  var presentation =
    SlidesApp.openById(
      templateId
    );


  if (
    presentation
      .getSlides()
      .length === 0
  ) {

    throw new Error(
      'قالب الإيصال لا يحتوي على شريحة.'
    );

  }


  var receiptLogSheet =
    ss.getSheetByName(
      APP_CONFIG.RECEIPT_LOG_SHEET
    );


  checks.push({

    module:
      '40_Receipts',

    success:
      true,

    template:
      true,

    logRows:
      receiptLogSheet

        ? Math.max(
            0,
            receiptLogSheet.getLastRow() - 1
          )

        : 0,

    mailQuota:
      MailApp
        .getRemainingDailyQuota()

  });


  /**
   * ========================================================
   * 6. Budget
   * ========================================================
   */
  if (
    typeof getBudgetAnalytics !==
      'function' ||
    typeof getBudgetSettings !==
      'function'
  ) {

    throw new Error(
      'دوال 50_Budget.gs غير مكتملة.'
    );

  }


  var budgetSettings =
    getBudgetSettings();


  if (
    !budgetSettings ||
    !Array.isArray(
      budgetSettings.accounts
    ) ||
    budgetSettings.accounts.length !== 4
  ) {

    throw new Error(
      'نظام الميزانية الموحد لا يحتوي على أربع ميزانيات.'
    );

  }


  var budgetAnalytics =
    getBudgetAnalytics({

      scope:
        'all',

      category:
        'all'

    });


  if (
    !budgetAnalytics ||
    !budgetAnalytics.monthly ||
    !budgetAnalytics.annual ||
    !budgetAnalytics.overall
  ) {

    throw new Error(
      'تعذر إنشاء مؤشرات الميزانية.'
    );

  }


  checks.push({

    module:
      '50_Budget',

    success:
      true,

    accounts:
      budgetSettings.accounts.length,

    monthlyCards:
      budgetAnalytics.monthly.cards.length,

    annualCards:
      budgetAnalytics.annual.cards.length

  });


  /**
   * ========================================================
   * 7. Dashboard
   * ========================================================
   */
  if (
    typeof getDashboardData !==
      'function'
  ) {

    throw new Error(
      'لم يتم العثور على getDashboardData.'
    );

  }


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
      'تعذر إنشاء بيانات لوحة التحكم.'
    );

  }


  checks.push({

    module:
      '60_Dashboard',

    success:
      true,

    records:
      dashboard.counts.all,

    displayed:
      dashboard.counts.displayed

  });


  /**
   * ========================================================
   * 8. System
   * ========================================================
   */
  if (
    typeof getFinancialSystemStatus !==
      'function' ||
    typeof safeRunFinancialSystem !==
      'function'
  ) {

    throw new Error(
      'دوال 70_System.gs غير مكتملة.'
    );

  }


  var systemStatus =
    getFinancialSystemStatus();


  checks.push({

    module:
      '70_System',

    success:
      true,

    receiptActive:
      systemStatus.receiptActive,

    financialTrigger:
      systemStatus.financialTriggerActive,

    dashboardTrigger:
      systemStatus.dashboardLiveTriggerActive

  });


  /**
   * ========================================================
   * النتيجة النهائية
   * ========================================================
   */
  var completedAt =
    new Date();


  var result = {

    success:
      true,

    modulesPassed:
      checks.length,

    modulesExpected:
      8,

    checks:
      checks,

    startedAt:
      Utilities.formatDate(

        startedAt,

        appTimeZone(
          ss
        ),

        'dd/MM/yyyy HH:mm:ss'

      ),

    completedAt:
      Utilities.formatDate(

        completedAt,

        appTimeZone(
          ss
        ),

        'dd/MM/yyyy HH:mm:ss'

      ),

    durationSeconds:
      Math.round(

        (
          completedAt.getTime() -
          startedAt.getTime()
        ) /

        1000

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

    'نجح اختبار التكامل النهائي: 8 من 8 وحدات.',

    'اختبار النظام الكامل',

    10

  );


  return result;

}
