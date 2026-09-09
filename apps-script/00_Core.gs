/**
 * ==========================================================
 * 00_Core.gs
 * النواة الأساسية لنظام الإدارة المالية
 * ==========================================================
 *
 * يحتوي على:
 * - إعدادات النظام
 * - أسماء الأوراق
 * - عناوين الأعمدة
 * - الدوال المشتركة
 *
 * ملاحظة:
 * تم الحفاظ على جميع أسماء Functions والثوابت القديمة
 * حتى لا تتأثر بقية ملفات النظام.
 * ==========================================================
 */


/* ==========================================================
 * إعدادات النظام
 * ==========================================================
 */

var APP_CONFIG = Object.freeze({

  GUIDE_SHEET:
    'دليل البنود',

  OPERATIONS_SHEET:
    'العمليات',

  MATCHING_SHEET:
    'اختبار المطابقة',

  TEST_MESSAGES_SHEET:
    'اختبار الرسائل',


  TENANTS_SHEET:
    'المستأجرون',

  TENANT_LEDGER_SHEET:
    'سجل المستأجرين',

  RENT_SUMMARY_SHEET:
    'ملخص الإيجارات',


  RECEIPT_LOG_SHEET:
    'سجل إيصالات الصور',

  RECEIPT_FOLDER_NAME:
    'صور إيصالات الإيجار',

  RECEIPT_ACTIVE_PROPERTY:
    'IMG_RECEIPTS_ACTIVE',


  DIAGNOSTIC_SHEET:
    'تشخيص الإيصالات',


  MAX_MESSAGES_PER_LABEL:
    100,

  MAX_TEST_MESSAGES:
    30,

  MAX_RECORDS_PER_RUN:
    100,

  MAX_RECEIPTS_PER_RUN:
    20,


  GRACE_END_DAY:
    5,

  DEFAULT_TIME_ZONE:
    'Asia/Muscat'

});


/* ==========================================================
 * عناوين ورقة العمليات
 * ==========================================================
 */

var OPERATIONS_HEADERS = Object.freeze([

  'معرف الرسالة',

  'التاريخ والوقت',

  'البند',

  'التصنيف',

  'المبلغ',

  'الطرف',

  'نوع العملية',

  'قناة العملية',

  'البنك',

  'النظام',

  'حالة التسجيل',

  'تاريخ الإدخال'

]);


/* ==========================================================
 * عناوين سجل المستأجرين
 * ==========================================================
 */

var TENANT_LEDGER_HEADERS = Object.freeze([

  'معرف الرسالة',

  'تاريخ السداد',

  'اسم المستأجر',

  'الوحدة',

  'البريد الإلكتروني',

  'نوع السداد',

  'البند',

  'المبلغ',

  'شهر العملية',

  'قيمة الإيجار الشهري',

  'يوم الاستحقاق',

  'حالة العقد',

  'حالة الدفعة',

  'البنك',

  'قناة العملية',

  'حالة التسجيل الأصلية',

  'تاريخ التحديث'

]);


/* ==========================================================
 * عناوين ملخص الإيجارات
 * ==========================================================
 */

var RENT_SUMMARY_HEADERS = Object.freeze([

  'شهر المتابعة',

  'اسم المستأجر',

  'الوحدة',

  'بند الإيجار',

  'قيمة الإيجار الشهري',

  'المدفوع للإيجار',

  'المتبقي',

  'الزيادة',

  'الخدمات المحصلة',

  'تاريخ اكتمال السداد',

  'يوم الاستحقاق',

  'نهاية المهلة',

  'حالة الشهر',

  'البريد الإلكتروني',

  'حالة العقد'

]);


/* ==========================================================
 * عناوين سجل الإيصالات
 * ==========================================================
 */

var RECEIPT_LOG_HEADERS = Object.freeze([

  'معرف الرسالة',

  'رقم الإيصال',

  'اسم المستأجر',

  'الوحدة',

  'شهر الإيجار',

  'المبلغ',

  'البريد الإلكتروني',

  'رابط الصورة',

  'حالة الإرسال',

  'تاريخ الإرسال'

]);


/* ==========================================================
 * الدوال المشتركة
 * ==========================================================
 */


/**
 * تنظيف النص.
 */
function appText(value) {

  return String(
    value || ''
  )

    .replace(
      /\u00A0/g,
      ' '
    )

    .replace(
      /\s+/g,
      ' '
    )

    .trim();

}


/**
 * مفتاح موحد للمقارنة.
 */
function appKey(value) {

  return appText(
    value
  ).toLowerCase();

}


/**
 * تحويل القيمة إلى رقم.
 */
function appNumber(value) {

  if (
    typeof value === 'number' &&
    Number.isFinite(value)
  ) {

    return value;

  }


  var cleaned =
    String(
      value || ''
    )

      .replace(
        /,/g,
        ''
      )

      .replace(
        /[^\d.-]/g,
        ''
      )

      .trim();


  if (
    !cleaned
  ) {

    return NaN;

  }


  var numberValue =
    Number(
      cleaned
    );


  return Number.isFinite(
    numberValue
  )
    ? numberValue
    : NaN;

}


/**
 * تحويل القيمة إلى تاريخ.
 */
function appDate(value) {

  if (
    value instanceof Date &&
    !isNaN(
      value.getTime()
    )
  ) {

    return value;

  }


  if (
    !value
  ) {

    return null;

  }


  var date =
    new Date(
      value
    );


  return isNaN(
    date.getTime()
  )
    ? null
    : date;

}


/**
 * الوصول إلى ملف Google Sheets.
 */
function appActiveSpreadsheet() {

  var ss =
    SpreadsheetApp
      .getActiveSpreadsheet();


  if (
    !ss
  ) {

    throw new Error(
      'تعذر الوصول إلى ملف Google Sheets الحالي.'
    );

  }


  return ss;

}


/**
 * إحضار ورقة بالاسم.
 */
function appSheet(
  ss,
  sheetName
) {

  var sheet =
    ss.getSheetByName(
      sheetName
    );


  if (
    !sheet
  ) {

    throw new Error(

      'لم يتم العثور على ورقة باسم: ' +

      sheetName

    );

  }


  return sheet;

}


/**
 * المنطقة الزمنية.
 */
function appTimeZone(ss) {

  var spreadsheet =
    ss ||
    SpreadsheetApp
      .getActiveSpreadsheet();


  return (

    (
      spreadsheet &&
      spreadsheet
        .getSpreadsheetTimeZone()
    )

    ||

    Session
      .getScriptTimeZone()

    ||

    APP_CONFIG
      .DEFAULT_TIME_ZONE

  );

}


/**
 * تحديد قيمة نشط.
 */
function appIsActive(value) {

  return [

    'نعم',

    'نشط',

    'yes',

    'true',

    '1'

  ].includes(

    appText(
      value
    ).toLowerCase()

  );

}


/**
 * التحقق من البريد الإلكتروني.
 */
function appValidEmail(email) {

  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/

    .test(
      String(
        email || ''
      )
    );

}


/**
 * تنظيف اسم الملف.
 */
function appSafeFileName(value) {

  return appText(
    value
  )

    .replace(
      /[\\/:*?"<>|]/g,
      '-'
    );

}


/**
 * حماية النص داخل HTML.
 */
function appEscapeHtml(value) {

  return String(
    value || ''
  )

    .replace(
      /&/g,
      '&amp;'
    )

    .replace(
      /</g,
      '&lt;'
    )

    .replace(
      />/g,
      '&gt;'
    )

    .replace(
      /"/g,
      '&quot;'
    )

    .replace(
      /'/g,
      '&#039;'
    );

}


/**
 * عرض رسالة داخل Google Sheets.
 */
function appToast(
  message,
  title,
  seconds
) {

  var ss =
    SpreadsheetApp
      .getActiveSpreadsheet();


  if (
    !ss
  ) {

    return;

  }


  ss.toast(

    message,

    title ||
      'نظام الإدارة المالية',

    seconds ||
      8

  );

}


/**
 * تحديد الأخطاء المؤقتة.
 */
function appIsTemporaryError(error) {

  var message =
    String(

      error &&
      error.message

        ? error.message

        : error

    );


  return /429|too many requests|rate limit|service unavailable|backend error|internal error|timeout|timed out|temporarily unavailable/i

    .test(
      message
    );

}


/* ==========================================================
 * اختبار النواة
 * ==========================================================
 *
 * شغّل هذه الدالة بعد تركيب الملف.
 * ==========================================================
 */

function testCoreSystem() {

  var ss =
    appActiveSpreadsheet();


  var result = {

    success:
      true,


    spreadsheetName:
      ss.getName(),


    timeZone:
      appTimeZone(
        ss
      ),


    guideSheet:
      APP_CONFIG
        .GUIDE_SHEET,


    operationsSheet:
      APP_CONFIG
        .OPERATIONS_SHEET,


    textTest:
      appText(
        '  اختبار   النظام  '
      ),


    numberTest:
      appNumber(
        '1,250.500'
      ),


    activeTest:
      appIsActive(
        'نعم'
      ),


    emailTest:
      appValidEmail(
        'test@example.com'
      ),


    headers: {

      operations:
        OPERATIONS_HEADERS.length,

      tenantLedger:
        TENANT_LEDGER_HEADERS.length,

      rentSummary:
        RENT_SUMMARY_HEADERS.length,

      receiptLog:
        RECEIPT_LOG_HEADERS.length

    }

  };


  console.log(

    JSON.stringify(
      result,
      null,
      2
    )

  );


  appToast(

    'نجح اختبار 00_Core.gs',

    'اختبار النظام',

    5

  );


  return result;

}
