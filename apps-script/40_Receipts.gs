/**
 * ==========================================================
 * 40_Receipts.gs
 *
 * نظام إيصالات الإيجار الموحد
 * ==========================================================
 *
 * تم دمج:
 * - 07_ReceiptCore.gs.gs
 * - 08_ReceiptDesign.gs.gs
 * - 09_ReceiptEmail.gs
 * - 12_TemplateBuilder.gs
 *
 * الوظائف:
 * - تفعيل / إيقاف الإيصالات
 * - إرسال الإيصالات الجديدة
 * - منع تكرار الإرسال
 * - إنشاء صورة PNG من Google Slides
 * - عرض آخر 3 دفعات
 * - إرسال الإيصال بالبريد
 * - إنشاء قالب قابل للتعديل
 * - اعتماد قالب جديد من إعدادات الإيصالات
 *
 * تم الحفاظ على جميع أسماء Functions القديمة.
 * ==========================================================
 */


/* ==========================================================
 * إعدادات محرك قالب الإيصال
 * ==========================================================
 */

var RECEIPT_TEMPLATE_ENGINE = Object.freeze({

  TEMPLATE_PROPERTY:
    'RECEIPT_SLIDES_TEMPLATE_ID',

  HISTORY_COUNT:
    3,

  THUMBNAIL_SIZE:
    'LARGE',

  TEMPORARY_PREFIX:
    'TEMP - Rent Receipt - '

});


/* ==========================================================
 * إعدادات إنشاء قالب Google Slides
 * ==========================================================
 */

var RECEIPT_TEMPLATE_SETUP = Object.freeze({

  SOURCE_IMAGE_NAME:
    (
      typeof APP_CONFIG !== 'undefined' &&
      APP_CONFIG.RECEIPT_TEMPLATE_FILE_NAME
    )
      ? APP_CONFIG.RECEIPT_TEMPLATE_FILE_NAME
      : 'قالب إيصال الإيجار.png',

  TEMPLATE_TITLE:
    'قالب إيصال الإيجار — قابل للتعديل',

  TEMPLATE_PROPERTY:
    'RECEIPT_SLIDES_TEMPLATE_ID',

  SETTINGS_SHEET:
    'إعدادات الإيصالات',

  PAGE_WIDTH:
    720,

  PAGE_HEIGHT:
    480

});


/* ==========================================================
 * تفعيل / إيقاف الإيصالات
 * ==========================================================
 */


/**
 * تفعيل الإيصالات الجديدة.
 *
 * العمليات القديمة يتم تسجيلها
 * كعمليات قبل التفعيل ولا ترسل.
 */
function receiptActivate() {

  var ss =
    appActiveSpreadsheet();


  receiptSyncEmails();


  var ledgerSheet =
    appSheet(
      ss,
      APP_CONFIG.TENANT_LEDGER_SHEET
    );


  var logSheet =
    receiptGetOrCreateLogSheet(
      ss
    );


  var existingIndex =
    receiptReadLogIndex(
      logSheet
    );


  var timezone =
    appTimeZone(
      ss
    );


  var baselineRows =
    [];


  if (
    ledgerSheet.getLastRow() >= 2
  ) {

    var values =
      ledgerSheet
        .getRange(
          2,
          1,
          ledgerSheet.getLastRow() - 1,
          17
        )
        .getValues();


    values.forEach(
      function(row) {

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


        var paymentMonth =
          appText(
            row[8]
          );


        if (
          paymentType !== 'إيجار' ||
          !messageId ||
          existingIndex.has(
            messageId
          )
        ) {

          return;

        }


        var receiptNumber =
          receiptBuildNumber(

            messageId,

            paymentDate ||
            new Date(),

            timezone

          );


        baselineRows.push([

          messageId,

          receiptNumber,

          tenantName,

          unit,

          paymentMonth,

          Number.isFinite(
            amount
          )
            ? amount
            : '',

          email,

          '',

          'قبل التفعيل — لم يرسل',

          new Date()

        ]);


        existingIndex.set(

          messageId,

          {

            row:
              0,

            status:
              'قبل التفعيل — لم يرسل'

          }

        );

      }
    );

  }


  if (
    baselineRows.length > 0
  ) {

    logSheet
      .getRange(

        logSheet.getLastRow() + 1,

        1,

        baselineRows.length,

        RECEIPT_LOG_HEADERS.length

      )
      .setValues(
        baselineRows
      );

  }


  PropertiesService
    .getScriptProperties()
    .setProperty(

      APP_CONFIG
        .RECEIPT_ACTIVE_PROPERTY,

      'true'

    );


  receiptFormatLogSheet(
    logSheet
  );


  SpreadsheetApp.flush();


  appToast(

    'تم تفعيل إيصالات الصور. تم اعتماد ' +
      baselineRows.length +
      ' عملية قديمة ولن تُرسل.',

    'إيصالات الإيجار',

    10

  );


  return baselineRows.length;

}


/**
 * إيقاف الإيصالات.
 */
function receiptDeactivate() {

  PropertiesService
    .getScriptProperties()
    .setProperty(

      APP_CONFIG
        .RECEIPT_ACTIVE_PROPERTY,

      'false'

    );


  appToast(

    'تم إيقاف إرسال إيصالات الصور.',

    'إيصالات الإيجار',

    8

  );

}


/**
 * إرسال الإيصالات الجديدة.
 */
function receiptSendNew() {

  var active =
    PropertiesService
      .getScriptProperties()
      .getProperty(

        APP_CONFIG
          .RECEIPT_ACTIVE_PROPERTY

      );


  if (
    active !== 'true'
  ) {

    return 0;

  }


  return receiptProcess({

    limit:
      APP_CONFIG.MAX_RECEIPTS_PER_RUN,

    testMode:
      false

  });

}


/* ==========================================================
 * معالجة الإيصالات
 * ==========================================================
 */


/**
 * معالجة إيصالات الإيجار.
 */
function receiptProcess(
  options
) {

  receiptEnsureSlidesService();


  var ss =
    appActiveSpreadsheet();


  receiptSyncEmails();


  var ledgerSheet =
    appSheet(
      ss,
      APP_CONFIG.TENANT_LEDGER_SHEET
    );


  if (
    ledgerSheet.getLastRow() < 2
  ) {

    throw new Error(
      'سجل المستأجرين لا يحتوي على عمليات.'
    );

  }


  var config =
    options || {};


  var testMode =
    config.testMode === true;


  var limit =
    Number(
      config.limit
    ) > 0

      ? Number(
          config.limit
        )

      : 1;


  var timezone =
    appTimeZone(
      ss
    );


  var folder =
    receiptGetOrCreateFolder();


  var logSheet =
    receiptGetOrCreateLogSheet(
      ss
    );


  var logIndex =
    receiptReadLogIndex(
      logSheet
    );


  var values =
    ledgerSheet
      .getRange(

        2,

        1,

        ledgerSheet.getLastRow() - 1,

        17

      )
      .getValues();


  var sentCount =
    0;


  var skippedCount =
    0;


  var failedCount =
    0;


  var rentRows =
    0;


  var validEmailRows =
    0;


  for (
    var index = 0;
    index < values.length;
    index++
  ) {

    if (
      sentCount >= limit
    ) {

      break;

    }


    var row =
      values[index];


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


    var paymentMonth =
      appText(
        row[8]
      );


    var monthlyRent =
      appNumber(
        row[9]
      );


    var originalStatus =
      appText(
        row[12]
      );


    var bank =
      appText(
        row[13]
      );


    var paymentChannel =
      appText(
        row[14]
      );


    if (
      paymentType !== 'إيجار'
    ) {

      continue;

    }


    rentRows++;


    if (
      appValidEmail(
        email
      )
    ) {

      validEmailRows++;

    }


    if (
      !messageId ||
      !paymentDate ||
      !tenantName ||
      !email ||
      !Number.isFinite(
        amount
      )
    ) {

      skippedCount++;

      continue;

    }


    if (
      !appValidEmail(
        email
      )
    ) {

      failedCount++;


      console.error(

        'بريد غير صالح: ' +
        tenantName +
        ' — ' +
        email

      );


      continue;

    }


    var existing =
      logIndex.get(
        messageId
      );


    /**
     * منع تكرار إرسال الإيصال.
     */
    if (
      !testMode &&
      existing &&
      (
        existing.status ===
          'تم الإرسال' ||

        existing.status ===
          'قبل التفعيل — لم يرسل'
      )
    ) {

      skippedCount++;

      continue;

    }


    var receiptNumber =
      receiptBuildNumber(

        messageId,

        paymentDate,

        timezone

      );


    var status =
      receiptBuildStatus(

        paymentDate,

        amount,

        monthlyRent,

        originalStatus,

        timezone

      );


    var logRow =
      null;


    /**
     * نسجل الإيصال قبل إنشائه.
     *
     * هذا مقصود لحماية النظام
     * في حال توقف التنفيذ أثناء الإرسال.
     */
    if (
      !testMode
    ) {

      if (
        existing
      ) {

        logRow =
          existing.row;

      }


      else {

        logRow =
          logSheet.getLastRow() + 1;


        logSheet
          .getRange(

            logRow,

            1,

            1,

            RECEIPT_LOG_HEADERS.length

          )
          .setValues([[

            messageId,

            receiptNumber,

            tenantName,

            unit,

            paymentMonth,

            amount,

            email,

            '',

            'قيد الإنشاء',

            new Date()

          ]]);


        logIndex.set(

          messageId,

          {

            row:
              logRow,

            status:
              'قيد الإنشاء'

          }

        );

      }

    }


    try {

      if (
        MailApp
          .getRemainingDailyQuota() <
        1
      ) {

        throw new Error(
          'انتهت حصة إرسال البريد اليومية.'
        );

      }


      var imageFile =
        receiptCreateImage({

          folder:
            folder,

          receiptNumber:
            receiptNumber,

          tenantName:
            tenantName,

          unit:
            unit,

          paymentDate:
            paymentDate,

          paymentMonth:
            paymentMonth,

          amount:
            amount,

          monthlyRent:
            monthlyRent,

          statusArabic:
            status.ar,

          statusEnglish:
            status.en,

          bank:
            bank,

          paymentChannel:
            paymentChannel,

          timezone:
            timezone,

          testMode:
            testMode

        });


      if (
        !testMode &&
        logRow
      ) {

        logSheet
          .getRange(
            logRow,
            8
          )
          .setValue(
            imageFile.getUrl()
          );


        logSheet
          .getRange(
            logRow,
            9
          )
          .setValue(
            'قيد الإرسال'
          );

      }


      receiptSendEmail({

        email:
          email,

        tenantName:
          tenantName,

        unit:
          unit,

        paymentMonth:
          paymentMonth,

        amount:
          amount,

        receiptNumber:
          receiptNumber,

        statusArabic:
          status.ar,

        statusEnglish:
          status.en,

        imageFile:
          imageFile,

        testMode:
          testMode

      });


      if (
        !testMode &&
        logRow
      ) {

        logSheet
          .getRange(

            logRow,

            9,

            1,

            2

          )
          .setValues([[

            'تم الإرسال',

            new Date()

          ]]);


        logIndex.set(

          messageId,

          {

            row:
              logRow,

            status:
              'تم الإرسال'

          }

        );

      }


      sentCount++;


    } catch (error) {

      failedCount++;


      var errorMessage =
        String(

          error &&
          error.message

            ? error.message

            : error

        );


      if (
        !testMode &&
        logRow
      ) {

        logSheet
          .getRange(

            logRow,

            9,

            1,

            2

          )
          .setValues([[

            'فشل الإرسال: ' +
              errorMessage,

            new Date()

          ]]);

      }


      console.error(

        'فشل الإيصال ' +
        receiptNumber +
        ': ' +
        errorMessage

      );

    }

  }


  receiptFormatLogSheet(
    logSheet
  );


  SpreadsheetApp.flush();


  appToast(

    'تم الإرسال: ' +
      sentCount +
      ' | تم التخطي: ' +
      skippedCount +
      ' | فشل: ' +
      failedCount,

    testMode
      ? 'اختبار إيصال صورة'
      : 'إيصالات الإيجار',

    10

  );


  if (
    testMode &&
    sentCount === 0
  ) {

    throw new Error(

      'لم يتم إرسال الإيصال. ' +
      'صفوف الإيجار: ' +
      rentRows +
      '، الصفوف ذات البريد الصحيح: ' +
      validEmailRows +
      '. شغّل diagnoseReceiptData لمعرفة السبب.'

    );

  }


  return sentCount;

}


/* ==========================================================
 * مزامنة البريد
 * ==========================================================
 */


/**
 * مزامنة البريد من المستأجرون
 * إلى سجل المستأجرين.
 */
function receiptSyncEmails() {

  var ss =
    appActiveSpreadsheet();


  var tenantsSheet =
    appSheet(
      ss,
      APP_CONFIG.TENANTS_SHEET
    );


  var ledgerSheet =
    appSheet(
      ss,
      APP_CONFIG.TENANT_LEDGER_SHEET
    );


  if (
    tenantsSheet.getLastRow() < 2 ||
    ledgerSheet.getLastRow() < 2
  ) {

    return 0;

  }


  var tenantRows =
    tenantsSheet
      .getRange(

        2,

        1,

        tenantsSheet.getLastRow() - 1,

        10

      )
      .getValues();


  var byItem =
    new Map();


  var byNameAndUnit =
    new Map();


  var byName =
    new Map();


  tenantRows.forEach(
    function(row) {

      var rentItem =
        appText(
          row[0]
        );


      var utilitiesItem =
        appText(
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
          row[5]
        );


      if (
        !tenantName ||
        !appValidEmail(
          email
        )
      ) {

        return;

      }


      var tenantData = {

        tenantName:
          tenantName,

        unit:
          unit,

        email:
          email

      };


      if (
        rentItem
      ) {

        byItem.set(

          appKey(
            rentItem
          ),

          tenantData

        );

      }


      if (
        utilitiesItem
      ) {

        byItem.set(

          appKey(
            utilitiesItem
          ),

          tenantData

        );

      }


      if (
        tenantName &&
        unit
      ) {

        byNameAndUnit.set(

          appKey(

            tenantName +
            '|' +
            unit

          ),

          tenantData

        );

      }


      if (
        !byName.has(
          appKey(
            tenantName
          )
        )
      ) {

        byName.set(

          appKey(
            tenantName
          ),

          tenantData

        );

      }

    }
  );


  var ledgerRows =
    ledgerSheet
      .getRange(

        2,

        1,

        ledgerSheet.getLastRow() - 1,

        17

      )
      .getValues();


  var updatedCount =
    0;


  var emailOutput =
    ledgerRows.map(
      function(row) {

        var tenantName =
          appText(
            row[2]
          );


        var unit =
          appText(
            row[3]
          );


        var currentEmail =
          appText(
            row[4]
          );


        var item =
          appText(
            row[6]
          );


        if (
          appValidEmail(
            currentEmail
          )
        ) {

          return [
            currentEmail
          ];

        }


        var tenantData =
          null;


        if (
          item
        ) {

          tenantData =
            byItem.get(
              appKey(
                item
              )
            ) || null;

        }


        if (
          !tenantData &&
          tenantName &&
          unit
        ) {

          tenantData =
            byNameAndUnit.get(

              appKey(

                tenantName +
                '|' +
                unit

              )

            ) || null;

        }


        if (
          !tenantData &&
          tenantName
        ) {

          tenantData =
            byName.get(

              appKey(
                tenantName
              )

            ) || null;

        }


        if (
          tenantData &&
          appValidEmail(
            tenantData.email
          )
        ) {

          updatedCount++;


          return [
            tenantData.email
          ];

        }


        return [
          currentEmail
        ];

      }
    );


  ledgerSheet
    .getRange(

      2,

      5,

      emailOutput.length,

      1

    )
    .setValues(
      emailOutput
    );


  SpreadsheetApp.flush();


  return updatedCount;

}


/* ==========================================================
 * سجل الإيصالات
 * ==========================================================
 */


/**
 * إنشاء أو جلب سجل الإيصالات.
 */
function receiptGetOrCreateLogSheet(
  ss
) {

  var sheet =
    ss.getSheetByName(
      APP_CONFIG.RECEIPT_LOG_SHEET
    );


  if (
    !sheet
  ) {

    sheet =
      ss.insertSheet(
        APP_CONFIG.RECEIPT_LOG_SHEET
      );

  }


  sheet
    .getRange(

      1,

      1,

      1,

      RECEIPT_LOG_HEADERS.length

    )
    .setValues([
      Array.from(
        RECEIPT_LOG_HEADERS
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


  return sheet;

}


/**
 * قراءة سجل الإيصالات.
 */
function receiptReadLogIndex(
  sheet
) {

  var result =
    new Map();


  if (
    sheet.getLastRow() < 2
  ) {

    return result;

  }


  var values =
    sheet
      .getRange(

        2,

        1,

        sheet.getLastRow() - 1,

        RECEIPT_LOG_HEADERS.length

      )
      .getDisplayValues();


  values.forEach(
    function(
      row,
      index
    ) {

      var messageId =
        appText(
          row[0]
        );


      if (
        !messageId
      ) {

        return;

      }


      result.set(

        messageId,

        {

          row:
            index + 2,

          status:
            appText(
              row[8]
            )

        }

      );

    }
  );


  return result;

}


/**
 * إنشاء أو جلب مجلد الصور.
 */
function receiptGetOrCreateFolder() {

  var folders =
    DriveApp.getFoldersByName(
      APP_CONFIG.RECEIPT_FOLDER_NAME
    );


  if (
    folders.hasNext()
  ) {

    return folders.next();

  }


  return DriveApp.createFolder(
    APP_CONFIG.RECEIPT_FOLDER_NAME
  );

}


/**
 * إنشاء رقم الإيصال.
 */
function receiptBuildNumber(

  messageId,

  paymentDate,

  timezone

) {

  var datePart =
    Utilities.formatDate(

      paymentDate,

      timezone,

      'yyyyMMdd'

    );


  var messagePart =
    String(
      messageId
    )
      .replace(
        /[^a-zA-Z0-9]/g,
        ''
      )
      .slice(
        -7
      )
      .toUpperCase();


  return (

    'RENT-' +
    datePart +
    '-' +
    messagePart

  );

}


/**
 * تحديد حالة السداد.
 */
function receiptBuildStatus(

  paymentDate,

  amount,

  monthlyRent,

  originalStatus,

  timezone

) {

  if (
    Number.isFinite(
      monthlyRent
    ) &&
    monthlyRent > 0 &&
    amount <
      monthlyRent - 0.0005
  ) {

    return {

      ar:
        'دفعة جزئية',

      en:
        'Partial Payment'

    };

  }


  var paymentDay =
    Number(

      Utilities.formatDate(

        paymentDate,

        timezone,

        'd'

      )

    );


  if (
    paymentDay <=
    APP_CONFIG.GRACE_END_DAY
  ) {

    return {

      ar:
        'مدفوع ضمن المهلة',

      en:
        'Paid Within Grace Period'

    };

  }


  if (
    String(
      originalStatus || ''
    ).includes(
      'جزئي'
    )
  ) {

    return {

      ar:
        'دفعة جزئية متأخرة',

      en:
        'Late Partial Payment'

    };

  }


  return {

    ar:
      'مدفوع متأخرًا',

    en:
      'Paid After Grace Period'

  };

}


/**
 * تنسيق سجل الإيصالات.
 */
function receiptFormatLogSheet(
  sheet
) {

  var widths = [

    190,
    210,
    170,
    90,
    120,
    100,
    230,
    300,
    230,
    180

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
    sheet.getLastRow() > 1
  ) {

    sheet
      .getRange(

        2,

        6,

        sheet.getLastRow() - 1,

        1

      )
      .setNumberFormat(
        '0.000'
      );


    sheet
      .getRange(

        2,

        10,

        sheet.getLastRow() - 1,

        1

      )
      .setNumberFormat(
        'dd/MM/yyyy HH:mm:ss'
      );

  }

}


/* ==========================================================
 * إنشاء صورة الإيصال
 * ==========================================================
 */


/**
 * إنشاء صورة الإيصال من قالب Google Slides.
 */
function receiptCreateImage(
  data
) {

  receiptEnsureSlidesService();


  if (
    !data
  ) {

    throw new Error(
      'بيانات الإيصال غير موجودة.'
    );

  }


  if (
    !data.folder
  ) {

    throw new Error(
      'مجلد حفظ صور الإيصالات غير موجود.'
    );

  }


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

      'لم يتم اعتماد قالب Google Slides. ' +
      'شغّل updateReceiptTemplateFromSettings أولًا.'

    );

  }


  var temporaryFile =
    null;


  var temporaryPresentationId =
    '';


  var slideId =
    '';


  try {

    /**
     * التأكد من إمكانية الوصول للقالب.
     */
    var templateFile =
      DriveApp.getFileById(
        templateId
      );


    /**
     * نسخة مؤقتة.
     */
    temporaryFile =
      templateFile.makeCopy(

        RECEIPT_TEMPLATE_ENGINE
          .TEMPORARY_PREFIX +

        String(
          data.receiptNumber ||
          new Date().getTime()
        ),

        data.folder

      );


    temporaryPresentationId =
      temporaryFile.getId();


    var presentation =
      SlidesApp.openById(
        temporaryPresentationId
      );


    var slides =
      presentation.getSlides();


    if (
      slides.length === 0
    ) {

      throw new Error(
        'قالب الإيصال لا يحتوي على شريحة.'
      );

    }


    slideId =
      slides[0].getObjectId();


    /**
     * آخر ثلاث دفعات.
     */
    var history =
      receiptGetPreviousPayments_(
        data
      );


    /**
     * الحقول المتغيرة.
     */
    var replacements =
      receiptBuildTemplateReplacements_(

        data,

        history

      );


    var totalReplacements =
      0;


    Object.keys(
      replacements
    )
      .forEach(
        function(
          placeholder
        ) {

          var value =
            replacements[
              placeholder
            ];


          var replacedCount =
            presentation.replaceAllText(

              placeholder,

              String(

                value === null ||
                value === undefined ||
                value === ''

                  ? '-'

                  : value

              )

            );


          totalReplacements +=
            replacedCount;


          if (
            replacedCount === 0
          ) {

            console.log(

              'لم يتم العثور على الحقل في القالب: ' +
              placeholder

            );

          }

        }
      );


    if (
      totalReplacements === 0
    ) {

      throw new Error(
        'لم يتم العثور على أي حقول متغيرة داخل القالب الجديد.'
      );

    }


    presentation.saveAndClose();


    /**
     * منح Slides وقتًا لحفظ التغييرات.
     */
    Utilities.sleep(
      2500
    );


    var thumbnail =
      Slides.Presentations.Pages
        .getThumbnail(

          temporaryPresentationId,

          slideId,

          {

            'thumbnailProperties.mimeType':
              'PNG',

            'thumbnailProperties.thumbnailSize':
              RECEIPT_TEMPLATE_ENGINE
                .THUMBNAIL_SIZE

          }

        );


    if (
      !thumbnail ||
      !thumbnail.contentUrl
    ) {

      throw new Error(
        'تعذر إنشاء صورة PNG من قالب الإيصال.'
      );

    }


    var paymentMonth =
      receiptFormatRentMonth_(

        data.paymentMonth,

        data.paymentDate,

        data.timezone

      );


    var imageName =

      (
        data.testMode
          ? 'TEST - '
          : ''
      )

      +

      'Rent Receipt - ' +

      appSafeFileName(
        data.tenantName ||
        'Tenant'
      )

      +

      ' - ' +

      appSafeFileName(
        paymentMonth
      )

      +

      ' - ' +

      appSafeFileName(
        data.receiptNumber
      )

      +

      '.png';


    var response =
      UrlFetchApp.fetch(

        thumbnail.contentUrl,

        {
          muteHttpExceptions:
            true
        }

      );


    var responseCode =
      response.getResponseCode();


    if (
      responseCode < 200 ||
      responseCode >= 300
    ) {

      throw new Error(

        'فشل تنزيل صورة الإيصال. رمز الاستجابة: ' +
        responseCode

      );

    }


    var imageBlob =
      response
        .getBlob()
        .setName(
          imageName
        );


    return data.folder.createFile(
      imageBlob
    );


  } finally {

    /**
     * حذف نسخة Slides المؤقتة.
     */
    if (
      temporaryFile
    ) {

      try {

        temporaryFile.setTrashed(
          true
        );


      } catch (error) {

        console.log(

          'تعذر حذف نسخة القالب المؤقتة: ' +

          String(

            error &&
            error.message

              ? error.message

              : error

          )

        );

      }

    }

  }

}


/* ==========================================================
 * حقول قالب الإيصال
 * ==========================================================
 */


/**
 * تجهيز قيم الحقول.
 */
function receiptBuildTemplateReplacements_(

  data,

  history

) {

  var ss =
    appActiveSpreadsheet();


  var timezone =
    data.timezone ||
    appTimeZone(
      ss
    );


  var paymentDate =
    appDate(
      data.paymentDate
    ) ||
    new Date();


  var issueDate =
    new Date();


  var amount =
    appNumber(
      data.amount
    );


  var monthlyRent =
    appNumber(
      data.monthlyRent
    );


  var paymentMonth =
    receiptFormatRentMonth_(

      data.paymentMonth,

      paymentDate,

      timezone

    );


  var replacements = {

    '{{RECEIPT_NO}}':
      String(
        data.receiptNumber || '-'
      ),

    '{{ISSUE_DATE}}':
      Utilities.formatDate(
        issueDate,
        timezone,
        'dd/MM/yyyy HH:mm'
      ),

    '{{AMOUNT}}':
      Number.isFinite(
        amount
      )
        ? amount.toFixed(
            3
          )
        : '-',

    '{{MONTHLY_RENT}}':
      Number.isFinite(
        monthlyRent
      ) &&
      monthlyRent > 0

        ? monthlyRent.toFixed(
            3
          )

        : '-',

    '{{PAYMENT_STATUS_AR}}':
      String(
        data.statusArabic || '-'
      ),

    '{{PAYMENT_STATUS_EN}}':
      String(
        data.statusEnglish || '-'
      ),

    '{{TENANT_NAME}}':
      String(
        data.tenantName || '-'
      ),

    '{{UNIT_NO}}':
      String(
        data.unit || '-'
      ),

    '{{RENT_MONTH}}':
      paymentMonth,

    '{{PAYMENT_DATE}}':
      Utilities.formatDate(

        paymentDate,

        timezone,

        'dd/MM/yyyy HH:mm'

      ),

    '{{BANK_AR}}':
      String(
        data.bank || '-'
      ),

    '{{BANK_EN}}':
      receiptBankEnglish(
        data.bank
      ),

    '{{CHANNEL_AR}}':
      String(
        data.paymentChannel || '-'
      ),

    '{{CHANNEL_EN}}':
      receiptChannelEnglish(
        data.paymentChannel
      ),

    '{{VERIFY_TOKEN}}':
      receiptBuildVerificationToken_(
        data.receiptNumber
      )

  };


  /**
   * آخر ثلاث دفعات.
   */
  for (
    var index = 0;
    index <
      RECEIPT_TEMPLATE_ENGINE
        .HISTORY_COUNT;
    index++
  ) {

    var position =
      index + 1;


    var payment =
      history[index] ||
      null;


    replacements[
      '{{H' +
      position +
      '_MONTH}}'
    ] =
      payment
        ? payment.month
        : '-';


    replacements[
      '{{H' +
      position +
      '_DATE}}'
    ] =
      payment
        ? payment.date
        : '-';


    replacements[
      '{{H' +
      position +
      '_AMOUNT}}'
    ] =
      payment
        ? payment.amount
        : '-';


    replacements[
      '{{H' +
      position +
      '_STATUS}}'
    ] =
      payment
        ? payment.status
        : '-';


    replacements[
      '{{H' +
      position +
      '_RECEIPT}}'
    ] =
      payment
        ? payment.receiptNumber
        : '-';

  }


  return replacements;

}


/* ==========================================================
 * تاريخ الدفعات السابقة
 * ==========================================================
 */


/**
 * استخراج آخر ثلاث دفعات إيجار سابقة.
 */
function receiptGetPreviousPayments_(
  currentData
) {

  var ss =
    appActiveSpreadsheet();


  var ledgerSheet =
    appSheet(

      ss,

      APP_CONFIG
        .TENANT_LEDGER_SHEET

    );


  if (
    ledgerSheet.getLastRow() < 2
  ) {

    return [];

  }


  var timezone =
    currentData.timezone ||
    appTimeZone(
      ss
    );


  var currentTenant =
    appKey(
      currentData.tenantName
    );


  var currentUnit =
    appKey(
      currentData.unit
    );


  var currentDate =
    appDate(
      currentData.paymentDate
    );


  var currentReceiptNumber =
    appText(
      currentData.receiptNumber
    );


  var rows =
    ledgerSheet
      .getRange(

        2,

        1,

        ledgerSheet.getLastRow() - 1,

        17

      )
      .getValues();


  var previousPayments =
    [];


  rows.forEach(
    function(row) {

      var messageId =
        appText(
          row[0]
        );


      var paymentDate =
        appDate(
          row[1]
        );


      var tenantName =
        appKey(
          row[2]
        );


      var unit =
        appKey(
          row[3]
        );


      var paymentType =
        appText(
          row[5]
        );


      var amount =
        appNumber(
          row[7]
        );


      var paymentMonth =
        row[8];


      var monthlyRent =
        appNumber(
          row[9]
        );


      var originalStatus =
        appText(
          row[12]
        );


      if (
        paymentType !== 'إيجار'
      ) {

        return;

      }


      if (
        tenantName !==
        currentTenant
      ) {

        return;

      }


      if (
        currentUnit &&
        unit !== currentUnit
      ) {

        return;

      }


      if (
        !messageId ||
        !paymentDate ||
        !Number.isFinite(
          amount
        )
      ) {

        return;

      }


      var receiptNumber =
        receiptBuildNumber(

          messageId,

          paymentDate,

          timezone

        );


      /**
       * استبعاد الدفعة الحالية.
       */
      if (
        currentReceiptNumber &&
        receiptNumber ===
          currentReceiptNumber
      ) {

        return;

      }


      /**
       * لا نعتبر دفعة أحدث
       * من الحالية كسجل سابق.
       */
      if (
        currentDate &&
        paymentDate.getTime() >=
          currentDate.getTime()
      ) {

        return;

      }


      previousPayments.push({

        sortDate:
          paymentDate,

        month:
          receiptFormatRentMonth_(

            paymentMonth,

            paymentDate,

            timezone

          ),

        date:
          Utilities.formatDate(

            paymentDate,

            timezone,

            'dd/MM/yyyy'

          ),

        amount:
          amount.toFixed(
            3
          ),

        status:
          receiptHistoryStatus_(

            originalStatus,

            paymentDate,

            amount,

            monthlyRent,

            timezone

          ),

        receiptNumber:
          receiptNumber

      });

    }
  );


  previousPayments.sort(
    function(
      first,
      second
    ) {

      return (

        second.sortDate.getTime() -

        first.sortDate.getTime()

      );

    }
  );


  return previousPayments.slice(

    0,

    RECEIPT_TEMPLATE_ENGINE
      .HISTORY_COUNT

  );

}


/**
 * حالة مختصرة للدفعة السابقة.
 */
function receiptHistoryStatus_(

  originalStatus,

  paymentDate,

  amount,

  monthlyRent,

  timezone

) {

  var status =
    appText(
      originalStatus
    );


  if (
    status.includes(
      'جزئي'
    ) ||
    (
      Number.isFinite(
        monthlyRent
      ) &&
      monthlyRent > 0 &&
      amount <
        monthlyRent - 0.0005
    )
  ) {

    return 'جزئي / Partial';

  }


  var paymentDay =
    Number(

      Utilities.formatDate(

        paymentDate,

        timezone,

        'd'

      )

    );


  if (
    paymentDay >
    APP_CONFIG.GRACE_END_DAY
  ) {

    return 'متأخر / Late';

  }


  return 'مدفوع / Paid';

}


/**
 * تنسيق شهر الإيجار.
 */
function receiptFormatRentMonth_(

  value,

  fallbackDate,

  timezone

) {

  if (
    value instanceof Date &&
    !isNaN(
      value.getTime()
    )
  ) {

    return Utilities.formatDate(

      value,

      timezone,

      'MM/yyyy'

    );

  }


  var text =
    appText(
      value
    );


  if (
    /^\d{2}\/\d{4}$/.test(
      text
    )
  ) {

    return text;

  }


  if (
    /^\d{4}-\d{2}$/.test(
      text
    )
  ) {

    return (

      text.substring(
        5,
        7
      )

      +

      '/'

      +

      text.substring(
        0,
        4
      )

    );

  }


  if (
    text
  ) {

    var parsedDate =
      appDate(
        value
      );


    if (
      parsedDate
    ) {

      return Utilities.formatDate(

        parsedDate,

        timezone,

        'MM/yyyy'

      );

    }

  }


  var fallback =
    appDate(
      fallbackDate
    );


  if (
    fallback
  ) {

    return Utilities.formatDate(

      fallback,

      timezone,

      'MM/yyyy'

    );

  }


  return '-';

}


/**
 * إنشاء رمز تحقق.
 */
function receiptBuildVerificationToken_(
  receiptNumber
) {

  var source =
    String(
      receiptNumber || ''
    );


  if (
    !source
  ) {

    return '-';

  }


  var digest =
    Utilities.computeDigest(

      Utilities
        .DigestAlgorithm
        .SHA_256,

      source,

      Utilities.Charset.UTF_8

    );


  var hex =
    digest
      .map(
        function(byte) {

          var value =
            (
              byte + 256
            ) % 256;


          return (

            '0' +
            value.toString(
              16
            )

          ).slice(
            -2
          );

        }
      )
      .join(
        ''
      )
      .toUpperCase()
      .substring(
        0,
        12
      );


  return (

    'FMS-' +

    hex.substring(
      0,
      4
    )

    +

    '-'

    +

    hex.substring(
      4,
      8
    )

    +

    '-'

    +

    hex.substring(
      8,
      12
    )

  );

}


/* ==========================================================
 * ترجمة البنك وقناة السداد
 * ==========================================================
 */


function receiptBankEnglish(
  bank
) {

  var value =
    String(
      bank || ''
    )
      .toLowerCase();


  if (
    value.includes(
      'الأهلي'
    ) ||
    value.includes(
      'ahli'
    )
  ) {

    return 'Al Ahli Bank';

  }


  if (
    value.includes(
      'صحار'
    ) ||
    value.includes(
      'sohar'
    )
  ) {

    return 'Sohar International';

  }


  if (
    value.includes(
      'ميثاق'
    ) ||
    value.includes(
      'meethaq'
    )
  ) {

    return 'Meethaq Islamic Banking';

  }


  if (
    value.includes(
      'ظفار'
    ) ||
    value.includes(
      'dhofar'
    )
  ) {

    return 'Bank Dhofar';

  }


  if (
    value.includes(
      'مسقط'
    ) ||
    value.includes(
      'muscat'
    )
  ) {

    return 'Bank Muscat';

  }


  if (
    value.includes(
      'نزوى'
    ) ||
    value.includes(
      'nizwa'
    )
  ) {

    return 'Bank Nizwa';

  }


  if (
    value.includes(
      'العز'
    ) ||
    value.includes(
      'alizz'
    )
  ) {

    return 'Alizz Islamic Bank';

  }


  if (
    value.includes(
      'عمان العربي'
    ) ||
    value.includes(
      'oman arab'
    )
  ) {

    return 'Oman Arab Bank';

  }


  if (
    value.includes(
      'الوطني العماني'
    ) ||
    value.includes(
      'national bank of oman'
    )
  ) {

    return 'National Bank of Oman';

  }


  return String(
    bank || '-'
  );

}


function receiptChannelEnglish(
  channel
) {

  var value =
    String(
      channel || ''
    )
      .toLowerCase();


  if (
    value.includes(
      'برقم الهاتف'
    )
  ) {

    return 'Mobile Number Transfer';

  }


  if (
    value.includes(
      'تحويل'
    ) ||
    value.includes(
      'transfer'
    )
  ) {

    return 'Bank Transfer';

  }


  if (
    value.includes(
      'بطاقة'
    ) ||
    value.includes(
      'card'
    )
  ) {

    return 'Card Payment';

  }


  if (
    value.includes(
      'نقد'
    ) ||
    value.includes(
      'cash'
    )
  ) {

    return 'Cash Payment';

  }


  if (
    value.includes(
      'فاتورة'
    ) ||
    value.includes(
      'bill'
    )
  ) {

    return 'Bill Payment';

  }


  return String(
    channel || '-'
  );

}


/* ==========================================================
 * إرسال البريد
 * ==========================================================
 */


/**
 * إرسال إيصال الإيجار بالبريد.
 */
function receiptSendEmail(
  data
) {

  if (
    !data
  ) {

    throw new Error(
      'بيانات الإيصال غير موجودة.'
    );

  }


  if (
    !appValidEmail(
      data.email
    )
  ) {

    throw new Error(

      'البريد الإلكتروني غير صالح: ' +

      String(
        data.email || ''
      )

    );

  }


  if (
    !data.imageFile
  ) {

    throw new Error(
      'ملف صورة الإيصال غير موجود.'
    );

  }


  var amountText =

    'OMR ' +

    Number(
      data.amount || 0
    )
      .toFixed(
        3
      );


  var subject =

    (
      data.testMode === true
        ? '[TEST] '
        : ''
    )

    +

    'إيصال إيجار ' +

    String(
      data.paymentMonth || ''
    )

    +

    ' | Rent Payment Receipt';


  var imageBlob =
    data.imageFile
      .getBlob()
      .setName(

        'Rent Receipt - ' +

        appSafeFileName(
          data.tenantName
        )

        +

        ' - ' +

        appSafeFileName(
          data.paymentMonth
        )

        +

        '.png'

      );


  var plainBody = [

    'السلام عليكم،',

    '',

    'تم استلام مبلغ الإيجار بنجاح.',

    'Rent payment received successfully.',

    '',

    'اسم المستأجر / Tenant: ' +
      String(
        data.tenantName || '-'
      ),

    'الوحدة / Unit: ' +
      String(
        data.unit || '-'
      ),

    'شهر الإيجار / Rent Month: ' +
      String(
        data.paymentMonth || '-'
      ),

    'المبلغ / Amount: ' +
      amountText,

    'حالة الدفعة / Payment Status: ' +
      String(
        data.statusArabic || '-'
      ) +
      ' / ' +
      String(
        data.statusEnglish || '-'
      ),

    'رقم الإيصال / Receipt No.: ' +
      String(
        data.receiptNumber || '-'
      ),

    '',

    'صورة الإيصال مرفقة بهذه الرسالة.',

    'The receipt image is attached.'

  ].join(
    '\n'
  );


  var htmlBody = [

    '<table role="presentation" ',
    'width="100%" cellspacing="0" ',
    'cellpadding="0" border="0" ',
    'style="',
    'background:#F2F2F2;',
    'padding:24px 0;',
    'font-family:Arial,sans-serif;',
    '">',

      '<tr>',
        '<td align="center">',

          '<table role="presentation" ',
          'width="560" cellspacing="0" ',
          'cellpadding="0" border="0" ',
          'style="',
          'width:560px;',
          'max-width:94%;',
          'background:#111111;',
          'border:1px solid #D9A441;',
          'border-radius:16px;',
          'overflow:hidden;',
          '">',

            '<tr>',
              '<td align="center" style="',
              'padding:22px 20px 10px;',
              'color:#FFFFFF;',
              'font-size:22px;',
              'font-weight:bold;',
              '">',
                'إيصال استلام إيجار',
              '</td>',
            '</tr>',

            '<tr>',
              '<td align="center" style="',
              'padding:0 20px 18px;',
              'color:#D9A441;',
              'font-size:13px;',
              'font-weight:bold;',
              'letter-spacing:1px;',
              '">',
                'RENT PAYMENT RECEIPT',
              '</td>',
            '</tr>',

            '<tr>',
              '<td align="center" style="',
              'padding:0 20px 18px;',
              '">',

                '<div style="',
                'background:#1A1A1A;',
                'border-radius:12px;',
                'padding:14px;',
                'color:#FFFFFF;',
                '">',

                  '<div style="',
                  'font-size:13px;',
                  'color:#B7B7B7;',
                  '">',
                    'المبلغ المستلم / Amount Received',
                  '</div>',

                  '<div style="',
                  'font-size:28px;',
                  'font-weight:bold;',
                  'color:#F3C96B;',
                  'margin-top:4px;',
                  '">',

                    appEscapeHtml(
                      amountText
                    ),

                  '</div>',

                '</div>',

              '</td>',
            '</tr>',

            '<tr>',
              '<td align="center" style="',
              'padding:0 20px 20px;',
              '">',

                '<img ',
                'src="cid:rentReceiptImage" ',
                'width="500" ',
                'alt="Rent Payment Receipt" ',
                'style="',
                'display:block;',
                'width:500px;',
                'max-width:100%;',
                'height:auto;',
                'margin:auto;',
                'border:0;',
                'border-radius:12px;',
                '">',

              '</td>',
            '</tr>',

            '<tr>',
              '<td align="center" style="',
              'padding:15px 20px;',
              'background:#090909;',
              'border-top:1px solid #3A3021;',
              'color:#B7B7B7;',
              'font-size:12px;',
              'line-height:1.7;',
              '">',

                'نظام الإدارة المالية',

                '<br>',

                '<span style="',
                'color:#D9A441;',
                '">',

                  'Financial Management System',

                '</span>',

              '</td>',
            '</tr>',

          '</table>',

        '</td>',
      '</tr>',

    '</table>'

  ].join(
    ''
  );


  MailApp.sendEmail({

    to:
      data.email,

    subject:
      subject,

    body:
      plainBody,

    htmlBody:
      htmlBody,

    name:
      'نظام الإدارة المالية',

    inlineImages: {

      rentReceiptImage:
        imageBlob

    },

    attachments: [
      imageBlob
    ]

  });

}


/* ==========================================================
 * إنشاء قالب Google Slides
 * ==========================================================
 */


/**
 * إنشاء القالب لأول مرة.
 */
function buildEditableReceiptTemplate() {

  templateEnsureSlidesService_();


  var ss =
    appActiveSpreadsheet();


  var oldTemplateId =
    PropertiesService
      .getScriptProperties()
      .getProperty(

        RECEIPT_TEMPLATE_SETUP
          .TEMPLATE_PROPERTY

      );


  if (
    oldTemplateId &&
    templateDriveFileExists_(
      oldTemplateId
    )
  ) {

    var oldUrl =

      'https://docs.google.com/presentation/d/' +

      oldTemplateId +

      '/edit';


    templateWriteSettings_(

      ss,

      oldTemplateId,

      oldUrl

    );


    console.log(

      'القالب موجود مسبقًا: ' +
      oldUrl

    );


    appToast(

      'القالب موجود مسبقًا. افتح ورقة إعدادات الإيصالات للوصول إليه.',

      'قالب الإيصال',

      10

    );


    return oldUrl;

  }


  var sourceImageFile =
    templateFindImageFile_(

      RECEIPT_TEMPLATE_SETUP
        .SOURCE_IMAGE_NAME

    );


  var created =
    Slides.Presentations.create({

      title:
        RECEIPT_TEMPLATE_SETUP
          .TEMPLATE_TITLE,

      pageSize: {

        width: {

          magnitude:
            RECEIPT_TEMPLATE_SETUP
              .PAGE_WIDTH,

          unit:
            'PT'

        },

        height: {

          magnitude:
            RECEIPT_TEMPLATE_SETUP
              .PAGE_HEIGHT,

          unit:
            'PT'

        }

      }

    });


  var presentationId =
    created.presentationId;


  if (
    !presentationId
  ) {

    throw new Error(
      'تعذر إنشاء عرض Google Slides.'
    );

  }


  var presentation =
    SlidesApp.openById(
      presentationId
    );


  var slides =
    presentation.getSlides();


  var slide;


  if (
    slides.length === 0
  ) {

    slide =
      presentation.appendSlide(

        SlidesApp
          .PredefinedLayout
          .BLANK

      );


  } else {

    slide =
      slides[0];

  }


  slide
    .getPageElements()
    .forEach(
      function(element) {

        element.remove();

      }
    );


  /**
   * التصميم الأساسي.
   */
  var backgroundImage =
    slide.insertImage(

      sourceImageFile.getBlob(),

      0,

      0,

      RECEIPT_TEMPLATE_SETUP
        .PAGE_WIDTH,

      RECEIPT_TEMPLATE_SETUP
        .PAGE_HEIGHT

    );


  backgroundImage.setTitle(
    'RECEIPT_BACKGROUND'
  );


  backgroundImage.setDescription(
    'يمكن استبدال هذه الصورة لتغيير تصميم الإيصال دون تعديل الكود.'
  );


  backgroundImage.sendToBack();


  /**
   * رقم الإيصال.
   */
  templateAddValue_(

    slide,

    512,
    53,
    167,
    19,

    '{{RECEIPT_NO}}',

    9,

    '#F2B63D',

    true,

    SlidesApp
      .ParagraphAlignment
      .LEFT,

    '#171717'

  );


  /**
   * تاريخ الإصدار.
   */
  templateAddValue_(

    slide,

    512,
    101,
    167,
    17,

    '{{ISSUE_DATE}}',

    8,

    '#FFFFFF',

    false,

    SlidesApp
      .ParagraphAlignment
      .LEFT,

    '#171717'

  );


  /**
   * المبلغ.
   */
  templateAddValue_(

    slide,

    119,
    174,
    190,
    36,

    'OMR {{AMOUNT}}',

    21,

    '#E4B34F',

    true,

    SlidesApp
      .ParagraphAlignment
      .CENTER,

    '#151515'

  );


  /**
   * الإيجار الشهري.
   */
  templateAddValue_(

    slide,

    120,
    211,
    190,
    15,

    'OMR {{MONTHLY_RENT}}',

    7,

    '#FFFFFF',

    false,

    SlidesApp
      .ParagraphAlignment
      .CENTER,

    '#151515'

  );


  /**
   * الحالة العربية.
   */
  templateAddValue_(

    slide,

    324,
    176,
    117,
    18,

    '{{PAYMENT_STATUS_AR}}',

    9,

    '#8BD455',

    true,

    SlidesApp
      .ParagraphAlignment
      .CENTER,

    '#151515'

  );


  /**
   * الحالة الإنجليزية.
   */
  templateAddValue_(

    slide,

    315,
    197,
    134,
    18,

    '{{PAYMENT_STATUS_EN}}',

    8,

    '#8BD455',

    true,

    SlidesApp
      .ParagraphAlignment
      .CENTER,

    '#151515'

  );


  /**
   * المستأجر.
   */
  templateAddValue_(

    slide,

    576,
    185,
    106,
    18,

    '{{TENANT_NAME}}',

    9,

    '#FFFFFF',

    true,

    SlidesApp
      .ParagraphAlignment
      .LEFT,

    '#171717'

  );


  /**
   * الوحدة.
   */
  templateAddValue_(

    slide,

    576,
    227,
    106,
    18,

    '{{UNIT_NO}}',

    9,

    '#FFFFFF',

    true,

    SlidesApp
      .ParagraphAlignment
      .LEFT,

    '#171717'

  );


  /**
   * شهر الإيجار.
   */
  templateAddValue_(

    slide,

    576,
    269,
    106,
    28,

    '{{RENT_MONTH}}',

    8,

    '#FFFFFF',

    true,

    SlidesApp
      .ParagraphAlignment
      .LEFT,

    '#171717'

  );


  /**
   * تاريخ الدفعة.
   */
  templateAddValue_(

    slide,

    576,
    311,
    106,
    23,

    '{{PAYMENT_DATE}}',

    8,

    '#FFFFFF',

    true,

    SlidesApp
      .ParagraphAlignment
      .LEFT,

    '#171717'

  );


  /**
   * البنك.
   */
  templateAddValue_(

    slide,

    576,
    350,
    106,
    27,

    '{{BANK_AR}}\n{{BANK_EN}}',

    7.5,

    '#FFFFFF',

    true,

    SlidesApp
      .ParagraphAlignment
      .LEFT,

    '#171717'

  );


  /**
   * قناة السداد.
   */
  templateAddValue_(

    slide,

    576,
    389,
    106,
    30,

    '{{CHANNEL_AR}}\n{{CHANNEL_EN}}',

    7.5,

    '#FFFFFF',

    true,

    SlidesApp
      .ParagraphAlignment
      .LEFT,

    '#171717'

  );


  /**
   * آخر ثلاث دفعات.
   */
  templateAddHistoryRow_(
    slide,
    1,
    287
  );


  templateAddHistoryRow_(
    slide,
    2,
    319
  );


  templateAddHistoryRow_(
    slide,
    3,
    351
  );


  /**
   * رمز التحقق.
   */
  templateAddValue_(

    slide,

    303,
    425,
    165,
    18,

    '{{VERIFY_TOKEN}}',

    7.5,

    '#F2B63D',

    true,

    SlidesApp
      .ParagraphAlignment
      .CENTER,

    '#111111'

  );


  presentation.saveAndClose();


  PropertiesService
    .getScriptProperties()
    .setProperty(

      RECEIPT_TEMPLATE_SETUP
        .TEMPLATE_PROPERTY,

      presentationId

    );


  var templateUrl =

    'https://docs.google.com/presentation/d/' +

    presentationId +

    '/edit';


  templateWriteSettings_(

    ss,

    presentationId,

    templateUrl

  );


  console.log(

    'تم إنشاء القالب: ' +
    templateUrl

  );


  appToast(

    'تم إنشاء قالب Google Slides القابل للتعديل. افتح ورقة إعدادات الإيصالات.',

    'قالب الإيصال',

    10

  );


  return templateUrl;

}


/**
 * إضافة صف من جدول آخر ثلاث دفعات.
 */
function templateAddHistoryRow_(

  slide,

  rowNumber,

  top

) {

  var prefix =

    '{{H' +
    rowNumber +
    '_';


  templateAddValue_(

    slide,

    26,
    top,
    18,
    20,

    String(
      rowNumber
    ),

    7,

    '#FFFFFF',

    false,

    SlidesApp
      .ParagraphAlignment
      .CENTER,

    '#171717'

  );


  templateAddValue_(

    slide,

    48,
    top,
    74,
    20,

    prefix +
    'MONTH}}',

    7,

    '#FFFFFF',

    false,

    SlidesApp
      .ParagraphAlignment
      .CENTER,

    '#171717'

  );


  templateAddValue_(

    slide,

    122,
    top,
    99,
    20,

    prefix +
    'DATE}}',

    7,

    '#FFFFFF',

    false,

    SlidesApp
      .ParagraphAlignment
      .CENTER,

    '#171717'

  );


  templateAddValue_(

    slide,

    221,
    top,
    66,
    20,

    prefix +
    'AMOUNT}}',

    7,

    '#FFFFFF',

    true,

    SlidesApp
      .ParagraphAlignment
      .CENTER,

    '#171717'

  );


  templateAddValue_(

    slide,

    287,
    top,
    90,
    20,

    prefix +
    'STATUS}}',

    6.5,

    '#8BD455',

    true,

    SlidesApp
      .ParagraphAlignment
      .CENTER,

    '#171717'

  );


  templateAddValue_(

    slide,

    377,
    top,
    68,
    20,

    prefix +
    'RECEIPT}}',

    5.7,

    '#FFFFFF',

    false,

    SlidesApp
      .ParagraphAlignment
      .CENTER,

    '#171717'

  );

}


/**
 * إضافة منطقة متغيرة فوق التصميم.
 */
function templateAddValue_(

  slide,

  left,

  top,

  width,

  height,

  placeholder,

  fontSize,

  fontColor,

  bold,

  alignment,

  backgroundColor

) {

  var mask =
    slide.insertShape(

      SlidesApp.ShapeType.RECTANGLE,

      left,

      top,

      width,

      height

    );


  mask
    .getFill()
    .setSolidFill(
      backgroundColor
    );


  mask
    .getBorder()
    .getLineFill()
    .setSolidFill(
      backgroundColor
    );


  mask
    .getBorder()
    .setWeight(
      0.1
    );


  mask.setTitle(

    'MASK_' +
    placeholder

  );


  var textBox =
    slide.insertTextBox(

      placeholder,

      left + 2,

      top + 1,

      width - 4,

      height - 2

    );


  textBox.setTitle(
    placeholder
  );


  var text =
    textBox.getText();


  text
    .getTextStyle()
    .setFontFamily(
      'Arial'
    )
    .setFontSize(
      fontSize
    )
    .setForegroundColor(
      fontColor
    )
    .setBold(
      bold === true
    );


  try {

    text
      .getParagraphStyle()
      .setParagraphAlignment(
        alignment
      );


  } catch (error) {

    console.log(

      'تم تجاوز محاذاة الحقل: ' +
      placeholder

    );

  }


  try {

    textBox.setContentAlignment(

      SlidesApp
        .ContentAlignment
        .MIDDLE

    );


  } catch (error) {

    console.log(
      'تم تجاوز المحاذاة الرأسية للحقل.'
    );

  }


  return textBox;

}


/**
 * العثور على صورة القالب.
 */
function templateFindImageFile_(
  fileName
) {

  var files =
    DriveApp.getFilesByName(
      fileName
    );


  if (
    !files.hasNext()
  ) {

    throw new Error(

      'لم يتم العثور على الصورة في Google Drive باسم: ' +
      fileName

    );

  }


  var file =
    files.next();


  var mimeType =
    String(
      file.getMimeType() || ''
    );


  if (
    mimeType.indexOf(
      'image/'
    ) !== 0
  ) {

    throw new Error(

      'الملف الموجود ليس صورة صالحة: ' +
      fileName

    );

  }


  return file;

}


/**
 * التأكد من وجود ملف Drive.
 */
function templateDriveFileExists_(
  fileId
) {

  try {

    DriveApp
      .getFileById(
        fileId
      )
      .getName();


    return true;


  } catch (error) {

    return false;

  }

}


/**
 * كتابة إعدادات القالب.
 */
function templateWriteSettings_(

  ss,

  templateId,

  templateUrl

) {

  var sheet =
    ss.getSheetByName(

      RECEIPT_TEMPLATE_SETUP
        .SETTINGS_SHEET

    );


  if (
    !sheet
  ) {

    sheet =
      ss.insertSheet(

        RECEIPT_TEMPLATE_SETUP
          .SETTINGS_SHEET

      );

  }


  sheet.clear();


  sheet.setRightToLeft(
    true
  );


  var rows = [

    [
      'الإعداد',
      'القيمة'
    ],

    [
      'اسم صورة التصميم',
      RECEIPT_TEMPLATE_SETUP
        .SOURCE_IMAGE_NAME
    ],

    [
      'معرف قالب Google Slides',
      templateId
    ],

    [
      'رابط تعديل القالب',
      templateUrl
    ],

    [
      'حالة القالب',
      'جاهز للتعديل'
    ]

  ];


  sheet
    .getRange(

      1,

      1,

      rows.length,

      2

    )
    .setValues(
      rows
    );


  sheet
    .getRange(
      1,
      1,
      1,
      2
    )
    .setFontWeight(
      'bold'
    )
    .setHorizontalAlignment(
      'center'
    );


  sheet.setColumnWidth(
    1,
    230
  );


  sheet.setColumnWidth(
    2,
    550
  );


  sheet.setFrozenRows(
    1
  );

}


/**
 * عرض رابط القالب.
 */
function showEditableReceiptTemplateLink() {

  var templateId =
    PropertiesService
      .getScriptProperties()
      .getProperty(

        RECEIPT_TEMPLATE_SETUP
          .TEMPLATE_PROPERTY

      );


  if (
    !templateId
  ) {

    throw new Error(

      'لم يتم إنشاء القالب بعد. شغّل buildEditableReceiptTemplate أولًا.'

    );

  }


  var url =

    'https://docs.google.com/presentation/d/' +

    templateId +

    '/edit';


  console.log(
    url
  );


  appToast(

    'افتح ورقة إعدادات الإيصالات للوصول إلى رابط القالب.',

    'قالب الإيصال',

    8

  );


  return url;

}


/**
 * اعتماد رابط قالب Google Slides
 * الموجود في B4.
 */
function updateReceiptTemplateFromSettings() {

  var ss =
    appActiveSpreadsheet();


  var sheet =
    appSheet(

      ss,

      RECEIPT_TEMPLATE_SETUP
        .SETTINGS_SHEET

    );


  var templateUrl =
    appText(

      sheet
        .getRange(
          'B4'
        )
        .getValue()

    );


  if (
    !templateUrl
  ) {

    throw new Error(
      'رابط القالب غير موجود في الخلية B4.'
    );

  }


  var match =
    templateUrl.match(

      /\/presentation\/d\/([a-zA-Z0-9_-]+)/

    );


  if (
    !match ||
    !match[1]
  ) {

    throw new Error(
      'رابط Google Slides غير صحيح.'
    );

  }


  var templateId =
    match[1];


  /**
   * التأكد من فتح القالب.
   */
  var presentation =
    SlidesApp.openById(
      templateId
    );


  if (
    !presentation
  ) {

    throw new Error(
      'تعذر فتح قالب Google Slides الجديد.'
    );

  }


  PropertiesService
    .getScriptProperties()
    .setProperty(

      RECEIPT_TEMPLATE_ENGINE
        .TEMPLATE_PROPERTY,

      templateId

    );


  sheet
    .getRange(
      'B3'
    )
    .setValue(
      templateId
    );


  sheet
    .getRange(
      'B5'
    )
    .setValue(
      'تم اعتماد القالب الجديد'
    );


  appToast(

    'تم اعتماد قالب الإيصال الجديد بنجاح.',

    'قالب الإيصالات',

    10

  );


  return templateId;

}


/* ==========================================================
 * Services
 * ==========================================================
 */


/**
 * التأكد من تفعيل Slides API.
 */
function receiptEnsureSlidesService() {

  if (
    typeof Slides === 'undefined' ||
    !Slides.Presentations ||
    !Slides.Presentations.Pages
  ) {

    throw new Error(

      'Google Slides API غير مفعلة. ' +
      'اضغط + بجانب Services، ثم اختر Google Slides API واضغط Add.'

    );

  }

}


/**
 * اسم الدالة القديمة محفوظ.
 */
function templateEnsureSlidesService_() {

  if (
    typeof Slides === 'undefined' ||
    !Slides.Presentations
  ) {

    throw new Error(

      'Google Slides API غير مفعلة. ' +
      'اضغط + بجانب Services، ثم اختر Google Slides API واضغط Add.'

    );

  }

}


/* ==========================================================
 * الاختبارات القديمة
 * ==========================================================
 */


/**
 * اختبار الاتصال بالقالب دون إرسال بريد.
 */
function testReceiptTemplateConnection() {

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
      'لم يتم العثور على معرف القالب المعتمد.'
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
      'القالب لا يحتوي على شريحة.'
    );

  }


  appToast(

    'تم الاتصال بالقالب الجديد بنجاح.',

    'اختبار قالب الإيصال',

    8

  );


  return templateId;

}


/**
 * اختبار إعداد البريد.
 *
 * لا يرسل بريدًا.
 */
function testReceiptEmailConfiguration() {

  var remainingQuota =
    MailApp
      .getRemainingDailyQuota();


  appToast(

    'إعداد البريد سليم. المتبقي من حصة الإرسال اليومية: ' +
      remainingQuota,

    'اختبار البريد',

    8

  );


  return remainingQuota;

}


/* ==========================================================
 * اختبار الملف الموحد
 * ==========================================================
 */


/**
 * اختبار آمن لنظام الإيصالات.
 *
 * مهم:
 * لا يرسل أي إيصال فعلي.
 */
function testReceiptSystem() {

  var ss =
    appActiveSpreadsheet();


  /**
   * 1. Slides API.
   */
  receiptEnsureSlidesService();


  /**
   * 2. القالب المعتمد.
   */
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


  /**
   * 3. سجل الإيصالات.
   */
  var logSheet =
    receiptGetOrCreateLogSheet(
      ss
    );


  var headers =
    logSheet
      .getRange(

        1,

        1,

        1,

        RECEIPT_LOG_HEADERS.length

      )
      .getDisplayValues()[0];


  if (
    headers[0] !==
    'معرف الرسالة' ||

    headers[1] !==
    'رقم الإيصال'
  ) {

    throw new Error(
      'عناوين سجل الإيصالات غير صحيحة.'
    );

  }


  /**
   * 4. البريد.
   *
   * فقط قراءة الحصة المتبقية.
   * لا يتم إرسال شيء.
   */
  var mailQuota =
    MailApp
      .getRemainingDailyQuota();


  /**
   * 5. اختبار رقم الإيصال ورمز التحقق.
   */
  var testNumber =
    receiptBuildNumber(

      'TEST_MESSAGE_1234567',

      new Date(),

      appTimeZone(
        ss
      )

    );


  var verifyToken =
    receiptBuildVerificationToken_(
      testNumber
    );


  if (
    !testNumber ||
    !verifyToken ||
    verifyToken === '-'
  ) {

    throw new Error(
      'فشل اختبار رقم الإيصال أو رمز التحقق.'
    );

  }


  /**
   * 6. مزامنة بريد المستأجرين.
   */
  var syncedEmails =
    receiptSyncEmails();


  var result = {

    success:
      true,

    templateId:
      templateId,

    logRows:
      Math.max(
        0,
        logSheet.getLastRow() - 1
      ),

    mailQuota:
      mailQuota,

    syncedEmails:
      syncedEmails,

    testReceiptNumber:
      testNumber,

    verificationToken:
      verifyToken,

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

    'نجح اختبار 40_Receipts.gs — لم يتم إرسال أي بريد.',

    'اختبار النظام',

    8

  );


  return result;

}
