/**
 * ==========================================================
 * 20_Operations.gs
 *
 * نظام العمليات الموحد
 * ==========================================================
 *
 * تم دمج:
 * - 04_Operations.gs.gs
 * - 17_OperationsReconcile.gs
 * - 18_AnalyticColumns.gs
 *
 * الوظائف:
 * - تسجيل العمليات من Gmail
 * - تحديث العمليات القديمة
 * - حذف العملية عند إزالة بند Gmail
 * - منع أكثر من بند مالي على الرسالة
 * - مزامنة الفئة / الفترة / الصنف
 * - تجهيز الأعمدة التحليلية
 *
 * تم الحفاظ على أسماء Functions القديمة.
 * ==========================================================
 */


/* ==========================================================
 * الإعدادات
 * ==========================================================
 */

var OPERATIONS_UPDATE_CHECK_LIMIT = 200;

var OPERATIONS_ANALYTIC_START_COLUMN = 13;

var OPERATIONS_ANALYTIC_HEADERS = [
  'الفئة',
  'الفترة',
  'الصنف'
];

var OPERATIONS_TOTAL_COLUMNS = 15;


/* ==========================================================
 * تسجيل العمليات
 * ==========================================================
 */


/**
 * الدالة القديمة الرئيسية.
 */
function operationsRegister() {

  var result =
    operationsRegisterDetailed();

  return result.added;
}


/**
 * تسجيل وتحديث العمليات.
 */
function operationsRegisterDetailed() {

  var ss =
    appActiveSpreadsheet();


  var guideSheet =
    appSheet(
      ss,
      APP_CONFIG.GUIDE_SHEET
    );


  var operationsSheet =
    appSheet(
      ss,
      APP_CONFIG.OPERATIONS_SHEET
    );


  operationsEnsureHeaders(
    operationsSheet
  );


 var guideItems =
operationsReadGuideItems(
  guideSheet,
  true
);

/*
 * استبعاد البنود غير المالية من تسجيل العمليات.
 *
 * تبقى Labels موجودة ومتزامنة مع Gmail،
 * لكنها لا تدخل ورقة العمليات.
 */
guideItems =
guideItems.filter(
  operationsIsFinancialGuideItemV4_
);


  if (
    guideItems.length === 0
  ) {

    throw new Error(
      'لا توجد بنود نشطة. تأكد أن عمود نشط يحتوي على نعم.'
    );

  }


  var existingRows =
    operationsReadExistingRows(
      operationsSheet
    );


  /**
   * قراءة الرسائل المصنفة من Gmail.
   */
  var collectedAssignments =
    gmailCollectAssignments(
      guideItems
    ) || [];


  var assignmentMap =
    new Map();


  collectedAssignments.forEach(
    function(assignment) {

      var messageId =
        appText(
          assignment &&
          assignment.messageId
        );


      if (
        !messageId
      ) {

        return;

      }


      assignmentMap.set(

        messageId,

        {
          messageId:
            messageId,

          items:
            operationsNormalizeMatchingItems_(
              assignment.items
            )
        }

      );

    }
  );


  /**
   * فحص العمليات القديمة لاكتشاف تغيير Label.
   */
  operationsCollectExistingAssignments_(

    existingRows,

    guideItems,

    assignmentMap,

    Math.max(

      Number(
        APP_CONFIG.MAX_RECORDS_PER_RUN
      ) || 0,

      OPERATIONS_UPDATE_CHECK_LIMIT

    )

  );


  var assignments =
    Array.from(
      assignmentMap.values()
    );


  var addedRecords = [];

  var updatedRecords = [];


  var unchangedCount = 0;

  var skippedCount = 0;

  var processedCount = 0;


  var maximumPerRun =
    Math.max(

      Number(
        APP_CONFIG.MAX_RECORDS_PER_RUN
      ) || 0,

      OPERATIONS_UPDATE_CHECK_LIMIT

    );


  for (
    var index = 0;
    index < assignments.length;
    index++
  ) {

    if (
      processedCount >=
      maximumPerRun
    ) {

      break;

    }


    var assignment =
      assignments[index];


    var messageId =
      appText(
        assignment &&
        assignment.messageId
      );


    if (
      !messageId
    ) {

      skippedCount++;

      continue;

    }


    var matchingItems =
      operationsNormalizeMatchingItems_(
        assignment.items
      );


    /**
     * لا يوجد بند.
     */
    if (
      matchingItems.length === 0
    ) {

      skippedCount++;

      continue;

    }


    /**
     * أكثر من بند.
     */
    if (
      matchingItems.length > 1
    ) {

      skippedCount++;

      continue;

    }


    var guideItem =
      matchingItems[0];


    var message = null;


    try {

      message =
        gmailGetMessage(
          messageId
        );


    } catch (error) {

      console.error(
        'تعذر قراءة رسالة Gmail: ' +
        messageId,
        error
      );


      skippedCount++;

      continue;

    }


    if (
      !message ||
      !guideItem
    ) {

      skippedCount++;

      continue;

    }


    /**
     * تحليل رسالة البنك.
     */
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


    var existingInfo =
      existingRows.has(
        messageId
      )

        ? existingRows.get(
            messageId
          )

        : null;


    var existingValues =
      existingInfo

        ? existingInfo.values

        : null;


    var row =
      operationsBuildRow_(

        messageId,

        parsed,

        guideItem,

        matchingItems,

        existingValues

      );


    /**
     * عملية موجودة.
     */
    if (
      existingInfo
    ) {

      if (
        operationsClassificationFieldsDiffer_(
          existingValues,
          row
        )
      ) {

        updatedRecords.push({

          rowNumber:
            existingInfo.rowNumber,

          row:
            row

        });


      } else {

        unchangedCount++;

      }

    }


    /**
     * عملية جديدة.
     */
    else {

      addedRecords.push({

        date:
          operationsValidDate_(
            row[1]
          )

            ? row[1]

            : new Date(),

        row:
          row

      });

    }


    processedCount++;

  }


  /**
   * كتابة التحديثات.
   */
  operationsWriteUpdatedRows_(

    operationsSheet,

    updatedRecords

  );


  /**
   * إضافة العمليات الجديدة.
   */
  operationsWriteNewRows_(

    operationsSheet,

    addedRecords

  );


  operationsFormat(
    operationsSheet
  );


  /**
   * تلوين الحالات دفعة واحدة.
   */
  if (
    operationsSheet.getLastRow() >= 2
  ) {

    operationsColorStatus(

      operationsSheet,

      2,

      operationsSheet.getLastRow() - 1,

      11

    );

  }


  SpreadsheetApp.flush();


  var reviewCount =
    operationsCountReviewRows_(

      addedRecords,

      updatedRecords

    );


  var result = {

    success:
      true,

    added:
      addedRecords.length,

    updated:
      updatedRecords.length,

    unchanged:
      unchangedCount,

    skipped:
      skippedCount,

    review:
      reviewCount,

    processed:
      processedCount,

    completedAt:
      Utilities.formatDate(

        new Date(),

        appTimeZone(
          ss
        ),

        'dd/MM/yyyy HH:mm:ss'

      )

  };


  operationsSaveLastResult_(
    result
  );


  if (
    result.added === 0 &&
    result.updated === 0
  ) {

    appToast(

      'تم الفحص، ولا توجد عمليات جديدة أو تغييرات.',

      'سجل العمليات',

      8

    );


    return result;

  }


  appToast(

    'تمت إضافة ' +
      result.added +
      ' عملية جديدة، وتحديث ' +
      result.updated +
      ' عملية سابقة.',

    'سجل العمليات',

    10

  );


  return result;
}


/* ==========================================================
 * بناء صف العملية
 * ==========================================================
 */

function operationsBuildRow_(

  messageId,

  parsed,

  guideItem,

  matchingItems,

  existingValues

) {

  parsed =
    parsed || {};


  existingValues =
    Array.isArray(
      existingValues
    )

      ? existingValues

      : [];


  var registrationStatus =
    bankRegistrationStatus(

      parsed,

      guideItem,

      matchingItems

    );


  var finalOperationType =

    appText(
      guideItem.movementType
    )

    ||

    appText(
      parsed.operationType
    )

    ||

    appText(
      existingValues[6]
    )

    ||

    'غير محدد';
/*
 * التحويل بين حساباتي لا يعتبر
 * دخلًا ولا مصروفًا.
 *
 * توحيد الحالة هنا يمنع
 * إعادة تحديث نفس العملية في كل تشغيل.
 */
if (
  operationsNormalizeText_(
    finalOperationType
  )
  ===
  operationsNormalizeText_(
    'تحويل داخلي'
  )
) {

  registrationStatus =
    'مستبعد من الدخل والمصروف';

}

  var finalDate =

    operationsValidDate_(
      existingValues[1]
    )

      ? existingValues[1]

      : operationsValidDate_(
          parsed.dateValue
        )

        ? parsed.dateValue

        : new Date();


  var finalAmount =
    operationsExistingAmount_(
      existingValues[4]
    );


  if (
    finalAmount === ''
  ) {

    finalAmount =
      Number.isFinite(
        parsed.amount
      )

        ? parsed.amount

        : '';

  }


  var finalParty =

    appText(
      existingValues[5]
    )

    ||

    appText(
      parsed.party
    )

    ||

    appText(
      guideItem.item
    );


  var finalChannel =

    appText(
      existingValues[7]
    )

    ||

    appText(
      parsed.channel
    )

    ||

    'غير محدد';


  var finalBank =

    appText(
      existingValues[8]
    )

    ||

    appText(
      parsed.bank
    )

    ||

    'غير محدد';


  var insertedAt =

    existingValues.length >= 12 &&

    existingValues[11] !== '' &&

    existingValues[11] !== null

      ? existingValues[11]

      : new Date();


  var legacyClassification =
    appText(
      guideItem.classification
    );


  var category =
    appText(
      guideItem.category
    );


  var period =
    appText(
      guideItem.period
    );


  var scope =
    appText(
      guideItem.scope
    );


  return [

    messageId,

    finalDate,

    appText(
      guideItem.item
    ),

    legacyClassification,

    finalAmount,

    finalParty,

    finalOperationType,

    finalChannel,

    finalBank,

    appText(
      guideItem.system
    ),

    registrationStatus,

    insertedAt,

    category,

    period,

    scope

  ];

}


/* ==========================================================
 * مطابقة البنود
 * ==========================================================
 */

function operationsNormalizeMatchingItems_(
  items
) {

  if (
    !Array.isArray(
      items
    )
  ) {

    return [];

  }


  var used =
    new Set();


  return items

    .filter(
      function(item) {

        if (
          !item ||
          !appText(
            item.item
          )
        ) {

          return false;

        }


        var key =

          appText(
            item.gmailLabelId
          )

          ||

          appText(
            item.rowNumber
          )

          ||

          operationsNormalizeLabel_(
            item.item
          );


        if (
          used.has(
            key
          )
        ) {

          return false;

        }


        used.add(
          key
        );


        return true;

      }
    )

    .sort(
      function(
        first,
        second
      ) {

        return (

          Number(
            first.rowNumber || 0
          )

          -

          Number(
            second.rowNumber || 0
          )

        );

      }
    );

}


/* ==========================================================
 * فحص العمليات القديمة
 * ==========================================================
 */

function operationsCollectExistingAssignments_(

  existingRows,

  guideItems,

  assignmentMap,

  maximumChecks

) {

  if (
    !existingRows ||
    existingRows.size === 0
  ) {

    return;

  }


  var guideByLabelId = {};

  var guideByName = {};


  guideItems.forEach(
    function(guideItem) {

      var normalizedName =
        operationsNormalizeLabel_(
          guideItem.item
        );


      if (
        normalizedName
      ) {

        guideByName[
          normalizedName
        ] = guideItem;

      }


      var gmailLabelId =
        appText(
          guideItem.gmailLabelId
        );


      if (
        gmailLabelId
      ) {

        guideByLabelId[
          gmailLabelId
        ] = guideItem;

      }

    }
  );


  var existingList =
    Array.from(
      existingRows.values()
    )

      .sort(
        function(
          first,
          second
        ) {

          return (

            second.rowNumber -

            first.rowNumber

          );

        }
      );


  var checkedCount = 0;


  var limit =
    Math.max(

      1,

      Number(
        maximumChecks
      )

      ||

      OPERATIONS_UPDATE_CHECK_LIMIT

    );


  for (
    var index = 0;
    index < existingList.length;
    index++
  ) {

    if (
      checkedCount >=
      limit
    ) {

      break;

    }


    var existingInfo =
      existingList[index];


    var messageId =
      appText(
        existingInfo.messageId
      );


    if (
      !messageId
    ) {

      continue;

    }


    if (
      assignmentMap.has(
        messageId
      )
    ) {

      continue;

    }


    checkedCount++;


    var matchingItems = [];


    try {

      var apiMessage =
        Gmail.Users.Messages.get(

          'me',

          messageId,

          {
            format:
              'minimal'
          }

        );


      var labelIds =

        apiMessage &&
        apiMessage.labelIds

          ? apiMessage.labelIds

          : [];


      labelIds.forEach(
        function(labelId) {

          var guideItem =
            guideByLabelId[
              labelId
            ];


          if (
            guideItem
          ) {

            matchingItems.push(
              guideItem
            );

          }

        }
      );


    } catch (apiError) {

      console.warn(

        'تعذر قراءة labelIds للرسالة: ' +

        messageId +

        ' - ' +

        operationsErrorMessage_(
          apiError
        )

      );

    }


    /**
     * الطريقة الاحتياطية بالاسم.
     */
    if (
      matchingItems.length === 0
    ) {

      var message = null;


      try {

        message =
          gmailGetMessage(
            messageId
          );


      } catch (error) {

        console.error(

          'تعذر فحص الرسالة المسجلة: ' +

          messageId,

          error

        );


        continue;

      }


      if (
        !message
      ) {

        continue;

      }


      var labelNames =
        operationsGetMessageLabelNames_(
          message
        );


      labelNames.forEach(
        function(labelName) {

          var normalizedName =
            operationsNormalizeLabel_(
              labelName
            );


          var guideItem =
            guideByName[
              normalizedName
            ];


          if (
            guideItem
          ) {

            matchingItems.push(
              guideItem
            );

          }

        }
      );

    }


    matchingItems =
      operationsNormalizeMatchingItems_(
        matchingItems
      );


    if (
      matchingItems.length > 0
    ) {

      assignmentMap.set(

        messageId,

        {

          messageId:
            messageId,

          items:
            matchingItems

        }

      );

    }

  }

}


/**
 * قراءة أسماء Labels من Thread.
 */
function operationsGetMessageLabelNames_(
  message
) {

  try {

    var thread =
      message.getThread();


    if (
      !thread
    ) {

      return [];

    }


    var labels =
      thread.getLabels();


    if (
      !labels
    ) {

      return [];

    }


    return Array.prototype.slice

      .call(
        labels
      )

      .map(
        function(label) {

          try {

            return appText(
              label.getName()
            );


          } catch (error) {

            return '';

          }

        }
      )

      .filter(
        function(name) {

          return (
            name !== ''
          );

        }
      );


  } catch (error) {

    console.error(
      'تعذر قراءة تصنيفات الرسالة.',
      error
    );


    return [];

  }

}


/* ==========================================================
 * كتابة العمليات
 * ==========================================================
 */


/**
 * العمليات الجديدة.
 *
 * كتابة A:O دفعة واحدة.
 */
function operationsWriteNewRows_(

  operationsSheet,

  records

) {

  if (
    !records ||
    records.length === 0
  ) {

    return;

  }


  records.sort(
    function(
      first,
      second
    ) {

      return (

        first.date.getTime() -

        second.date.getTime()

      );

    }
  );


  var startRow =
    operationsSheet.getLastRow() + 1;


  var rows =
    records.map(
      function(record) {

        return record.row.slice(
          0,
          OPERATIONS_TOTAL_COLUMNS
        );

      }
    );


  operationsSheet
    .getRange(

      startRow,

      1,

      rows.length,

      OPERATIONS_TOTAL_COLUMNS

    )
    .setValues(
      rows
    );


  operationsApplyFormats_(

    operationsSheet,

    startRow,

    records.length

  );

}


/**
 * تحديث العمليات القديمة.
 *
 * بدلاً من عدة عمليات كتابة لكل صف،
 * يتم تحديث C:O في عملية كتابة واحدة.
 */
function operationsWriteUpdatedRows_(

  operationsSheet,

  records

) {

  if (
    !records ||
    records.length === 0
  ) {

    return;

  }


  records.forEach(
    function(record) {

      var rowNumber =
        record.rowNumber;


      var row =
        record.row;


      /**
       * C:O
       *
       * نحافظ على:
       * E المبلغ
       * F الطرف
       * H القناة
       * I البنك
       * L تاريخ الإدخال
       *
       * لأنها موجودة أصلًا في row.
       */
      operationsSheet
        .getRange(

          rowNumber,

          3,

          1,

          13

        )
        .setValues([
          row.slice(
            2,
            15
          )
        ]);

    }
  );

}


/* ==========================================================
 * التنسيق
 * ==========================================================
 */

function operationsApplyFormats_(

  sheet,

  startRow,

  rowCount

) {

  if (
    rowCount <= 0
  ) {

    return;

  }


  operationsSafeNumberFormat_(

    sheet.getRange(

      startRow,

      2,

      rowCount,

      1

    ),

    'dd/MM/yyyy HH:mm:ss'

  );


  operationsSafeNumberFormat_(

    sheet.getRange(

      startRow,

      5,

      rowCount,

      1

    ),

    '0.000'

  );


  operationsSafeNumberFormat_(

    sheet.getRange(

      startRow,

      12,

      rowCount,

      1

    ),

    'dd/MM/yyyy HH:mm:ss'

  );

}


function operationsSafeNumberFormat_(

  range,

  numberFormat

) {

  try {

    range.setNumberFormat(
      numberFormat
    );


  } catch (error) {

    console.warn(

      'تم تجاوز تنسيق العمود: ' +

      operationsErrorMessage_(
        error
      )

    );

  }

}


/* ==========================================================
 * مقارنة العملية
 * ==========================================================
 */

function operationsClassificationFieldsDiffer_(

  oldRow,

  newRow

) {

  if (
    !Array.isArray(
      oldRow
    ) ||

    !Array.isArray(
      newRow
    )
  ) {

    return true;

  }


  var indexes = [

    2,  // البند
    3,  // التصنيف القديم
    6,  // نوع الحركة
    9,  // النظام
    10, // الحالة
    12, // الفئة
    13, // الفترة
    14  // الصنف

  ];


  return indexes.some(
    function(index) {

      return (

        appText(
          oldRow[index]
        )

        !==

        appText(
          newRow[index]
        )

      );

    }
  );

}


/* ==========================================================
 * قراءة العمليات
 * ==========================================================
 */

function operationsReadExistingRows(
  sheet
) {

  var result =
    new Map();


  var lastRow =
    sheet.getLastRow();


  if (
    lastRow < 2
  ) {

    return result;

  }


  var values =
    sheet
      .getRange(

        2,

        1,

        lastRow - 1,

        OPERATIONS_TOTAL_COLUMNS

      )
      .getValues();


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

          messageId:
            messageId,

          rowNumber:
            index + 2,

          values:
            row

        }

      );

    }
  );


  return result;

}


/**
 * التوافق القديم.
 */
function operationsReadExistingIds(
  sheet
) {

  var rows =
    operationsReadExistingRows(
      sheet
    );


  return new Set(
    Array.from(
      rows.keys()
    )
  );

}


/* ==========================================================
 * قراءة دليل البنود
 * ==========================================================
 */

function operationsReadGuideItems(

  guideSheet,

  activeOnly

) {

  var lastRow =
    guideSheet.getLastRow();


  if (
    lastRow < 2
  ) {

    return [];

  }


  var values =
    guideSheet
      .getRange(

        2,

        1,

        lastRow - 1,

        12

      )
      .getDisplayValues();


  return values

    .map(
      function(
        row,
        index
      ) {

        return {

          rowNumber:
            index + 2,

          item:
            appText(
              row[0]
            ),

          classification:
            appText(
              row[1]
            ),

          system:
            appText(
              row[2]
            ),

          movementType:
            appText(
              row[3]
            ),

          automaticAction:
            appText(
              row[4]
            ),

          active:
            appText(
              row[5]
            ),

          gmailLabelId:
            appText(
              row[6]
            ),

          category:
            appText(
              row[9]
            ),

          period:
            appText(
              row[10]
            ),

          scope:
            appText(
              row[11]
            )

        };

      }
    )

    .filter(
      function(item) {

        if (
          !item.item
        ) {

          return false;

        }


        return (

          !activeOnly ||

          appIsActive(
            item.active
          )

        );

      }
    );

}


/* ==========================================================
 * عناوين العمليات
 * ==========================================================
 */

function operationsEnsureHeaders(
  sheet
) {

  /**
   * التأكد من عدد الأعمدة.
   */
  if (
    sheet.getMaxColumns() <
    OPERATIONS_TOTAL_COLUMNS
  ) {

    sheet.insertColumnsAfter(

      sheet.getMaxColumns(),

      OPERATIONS_TOTAL_COLUMNS -
      sheet.getMaxColumns()

    );

  }


  var currentHeaders =
    sheet
      .getRange(

        1,

        1,

        1,

        OPERATIONS_HEADERS.length

      )
      .getDisplayValues()[0];


  var sheetIsEmpty =
    currentHeaders.every(
      function(value) {

        return (
          appText(
            value
          ) === ''
        );

      }
    );


  if (
    sheetIsEmpty
  ) {

    sheet
      .getRange(

        1,

        1,

        1,

        OPERATIONS_HEADERS.length

      )
      .setValues([
        Array.from(
          OPERATIONS_HEADERS
        )
      ]);


  } else {

    var aliases = {
      '#': 'التصنيف',
      'النوع': 'التصنيف',
      'نوع التصنيف': 'التصنيف',
      'الفئة': 'التصنيف',
      'وقت العملية': 'التاريخ والوقت',
      'التاريخ': 'التاريخ والوقت',
      'المعرف': 'معرف الرسالة'
    };

    var repairedHeaders = currentHeaders.map(function(value) {
      var current = appText(value);
      return aliases[current] || current;
    });

    var errors = [];
    var exactMatches = 0;


    OPERATIONS_HEADERS.forEach(
      function(
        expected,
        index
      ) {

        var current =
          appText(
            repairedHeaders[index]
          );


        if (current === appText(expected)) {
          exactMatches++;
        } else {

          errors.push(

            'العمود ' +
            (index + 1) +
            ' يجب أن يكون: ' +
            expected

          );

          repairedHeaders[index] = expected;

        }

      }
    );


    if (errors.length > 0 && exactMatches >= 8) {
      sheet
        .getRange(1, 1, 1, OPERATIONS_HEADERS.length)
        .setValues([repairedHeaders]);
    } else if (errors.length > 0) {
      throw new Error(
        'عناوين ورقة العمليات غير مطابقة:\n' +
        errors.join('\n') +
        '\nالعناوين الموجودة فعليًا: ' +
        JSON.stringify(currentHeaders)
      );
    }

  }


  sheet
    .getRange(

      1,

      OPERATIONS_ANALYTIC_START_COLUMN,

      1,

      3

    )
    .setValues([
      OPERATIONS_ANALYTIC_HEADERS
    ]);


  try {

    sheet
      .getRange(

        1,

        1,

        1,

        OPERATIONS_TOTAL_COLUMNS

      )
      .setFontWeight(
        'bold'
      )
      .setHorizontalAlignment(
        'center'
      );


  } catch (error) {

    console.warn(

      'تم تجاوز تنسيق عناوين العمليات: ' +

      operationsErrorMessage_(
        error
      )

    );

  }

}


/* ==========================================================
 * تنسيق ورقة العمليات
 * ==========================================================
 */

function operationsFormat(
  sheet
) {

  try {

    sheet.setFrozenRows(
      1
    );


    sheet.setRightToLeft(
      true
    );


    var widths = [

      190,
      180,
      190,
      170,
      100,
      260,
      150,
      190,
      160,
      160,
      340,
      180,
      120,
      120,
      120

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


    try {

      sheet.hideColumns(
        4
      );


    } catch (hideError) {

      console.warn(
        'تعذر إخفاء عمود التصنيف القديم.'
      );

    }


  } catch (error) {

    console.warn(

      'تم تجاوز تنسيق ورقة العمليات: ' +

      operationsErrorMessage_(
        error
      )

    );

  }

}


/* ==========================================================
 * تلوين حالة التسجيل
 * ==========================================================
 */

function operationsColorStatus(

  sheet,

  startRow,

  rowCount,

  statusColumn

) {

  if (
    rowCount <= 0
  ) {

    return;

  }


  try {

    var range =
      sheet.getRange(

        startRow,

        statusColumn,

        rowCount,

        1

      );


    var values =
      range.getDisplayValues();


    var colors =
      values.map(
        function(row) {

          var status =
            String(
              row[0] || ''
            );


          if (
            status.startsWith(
              'يحتاج مراجعة'
            )

            ||

            status.startsWith(
              'مراجعة'
            )
          ) {

            return [
              '#fce5cd'
            ];

          }


          if (
            status.includes(
              'الطرف مأخوذ من البند'
            )
          ) {

            return [
              '#fff2cc'
            ];

          }


          if (
            status.includes(
              'مستبعد'
            )
          ) {

            return [
              '#d9eaf7'
            ];

          }


          return [
            '#d9ead3'
          ];

        }
      );


    range.setBackgrounds(
      colors
    );


  } catch (error) {

    console.warn(

      'تم تجاوز تلوين حالة التسجيل: ' +

      operationsErrorMessage_(
        error
      )

    );

  }

}


/* ==========================================================
 * العمليات التي تحتاج مراجعة
 * ==========================================================
 */

function operationsCountReviewRows_(

  addedRecords,

  updatedRecords

) {

  var count = 0;


  addedRecords
    .concat(
      updatedRecords
    )
    .forEach(
      function(record) {

        var status =
          appText(
            record.row[10]
          );


        if (
          status.startsWith(
            'يحتاج مراجعة'
          )

          ||

          status.startsWith(
            'مراجعة'
          )
        ) {

          count++;

        }

      }
    );


  return count;

}


/* ==========================================================
 * حفظ آخر نتيجة
 * ==========================================================
 */

function operationsSaveLastResult_(
  result
) {

  try {

    PropertiesService
      .getScriptProperties()
      .setProperty(

        'LAST_OPERATIONS_SYNC_RESULT',

        JSON.stringify(
          result
        )

      );


  } catch (error) {

    console.error(
      'تعذر حفظ نتيجة المزامنة.',
      error
    );

  }

}


function operationsGetLastSyncResult() {

  var text =
    PropertiesService
      .getScriptProperties()
      .getProperty(
        'LAST_OPERATIONS_SYNC_RESULT'
      );


  if (
    !text
  ) {

    return operationsDefaultSyncResult_();

  }


  try {

    return JSON.parse(
      text
    );


  } catch (error) {

    return operationsDefaultSyncResult_();

  }

}


function operationsDefaultSyncResult_() {

  return {

    added:
      0,

    updated:
      0,

    unchanged:
      0,

    skipped:
      0,

    review:
      0

  };

}


/* ==========================================================
 * المطابقة الحية Gmail → العمليات
 * ==========================================================
 */


/**
 * تسجيل الرسائل الجديدة ثم المطابقة.
 */
function operationsRegisterAndReconcile() {

  var result = {

    success:
      true,

    added:
      0,

    updated:
      0,

    deleted:
      0,

    multiple:
      0,

    skipped:
      0

  };


  if (
    typeof operationsRegisterDetailed ===
    'function'
  ) {

    var registerResult =
      operationsRegisterDetailed();


    result.added =
      Number(
        registerResult.added
      ) || 0;

  }


  var reconcileResult =
    operationsReconcileFromGmail();


  result.updated =
    Number(
      reconcileResult.updated
    ) || 0;


  result.deleted =
    Number(
      reconcileResult.deleted
    ) || 0;


  result.multiple =
    Number(
      reconcileResult.multiple
    ) || 0;


  result.skipped =
    Number(
      reconcileResult.skipped
    ) || 0;


  result.completedAt =
    Utilities.formatDate(

      new Date(),

      appTimeZone(),

      'dd/MM/yyyy HH:mm:ss'

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
 * إعادة مطابقة العمليات مع Gmail.
 */
function operationsReconcileFromGmail() {

  var ss =
    appActiveSpreadsheet();


  var operationsSheet =
    appSheet(
      ss,
      APP_CONFIG.OPERATIONS_SHEET
    );


  var guideSheet =
    appSheet(
      ss,
      APP_CONFIG.GUIDE_SHEET
    );


  operationsEnsureHeaders(
    operationsSheet
  );


  var guide =
    operationsReconcileReadGuide_(
      guideSheet
    );


  var gmailLabelNamesById =
    operationsReconcileReadGmailLabels_();


  var lastRow =
    operationsSheet.getLastRow();


  if (
    lastRow < 2
  ) {

    return {

      success:
        true,

      updated:
        0,

      deleted:
        0,

      multiple:
        0,

      skipped:
        0

    };

  }


  var rowCount =
    lastRow - 1;


  var rows =
    operationsSheet
      .getRange(

        2,

        1,

        rowCount,

        OPERATIONS_TOTAL_COLUMNS

      )
      .getValues();


  var rowsToDelete = [];


  var updatedCount = 0;

  var multipleCount = 0;

  var skippedCount = 0;


  var seenMessageIds = {};


  rows.forEach(
    function(
      row,
      index
    ) {

      var sheetRow =
        index + 2;


      var messageId =
        appText(
          row[0]
        );


      /**
       * صف بدون Message ID.
       */
      if (
        !messageId
      ) {

        rowsToDelete.push(
          sheetRow
        );


        return;

      }


      /**
       * Message ID مكرر.
       */
      if (
        seenMessageIds[
          messageId
        ]
      ) {

        rowsToDelete.push(
          sheetRow
        );


        return;

      }


      seenMessageIds[
        messageId
      ] = true;


      var apiMessage = null;


      try {

        apiMessage =
          Gmail.Users.Messages.get(

            'me',

            messageId,

            {
              format:
                'minimal'
            }

          );


      } catch (error) {

        var errorText =
          operationsErrorMessage_(
            error
          ).toLowerCase();


        /**
         * الرسالة محذوفة من Gmail.
         */
        if (
          errorText.indexOf(
            '404'
          ) !== -1

          ||

          errorText.indexOf(
            'not found'
          ) !== -1
        ) {

          rowsToDelete.push(
            sheetRow
          );


        } else {

          console.error(

            'تعذر فحص رسالة Gmail: ' +

            messageId,

            error

          );


          skippedCount++;

        }


        return;

      }


      if (
        !apiMessage
      ) {

        skippedCount++;

        return;

      }


      var labelIds =
        Array.isArray(
          apiMessage.labelIds
        )

          ? apiMessage.labelIds

          : [];


      var matchingItems = [];


      labelIds.forEach(
        function(labelId) {

          /**
           * المطابقة بمعرف Gmail.
           */
          var item =
            guide.byLabelId[
              labelId
            ];


          if (
            item
          ) {

            matchingItems.push(
              item
            );


            return;

          }


          /**
           * المطابقة بالاسم.
           */
          var gmailLabelName =
            gmailLabelNamesById[
              labelId
            ];


          if (
            !gmailLabelName
          ) {

            return;

          }


          var normalizedName =
            operationsReconcileNormalize_(
              gmailLabelName
            );


          var itemByName =
            guide.byName[
              normalizedName
            ];


          if (
            itemByName
          ) {

            matchingItems.push(
              itemByName
            );

          }

        }
      );


      matchingItems =
        operationsReconcileUniqueItems_(
          matchingItems
        );


      /**
       * لا يوجد بند مالي.
       */
      if (
        matchingItems.length === 0
      ) {

        rowsToDelete.push(
          sheetRow
        );


        return;

      }


      /**
       * أكثر من بند مالي.
       */
      if (
        matchingItems.length > 1
      ) {

        rowsToDelete.push(
          sheetRow
        );


        multipleCount++;


        return;

      }


      var guideItem =
        matchingItems[0];


      var changed =
        operationsReconcileUpdateRow_(

          operationsSheet,

          sheetRow,

          row,

          guideItem

        );


      if (
        changed
      ) {

        updatedCount++;

      }

    }
  );


  /**
   * حذف الصفوف على شكل مجموعات
   * لتقليل عمليات deleteRow.
   */
  var uniqueRowsToDelete =
    rowsToDelete

      .filter(
        function(
          rowNumber,
          index,
          array
        ) {

          return (
            array.indexOf(
              rowNumber
            ) ===
            index
          );

        }
      )

      .sort(
        function(
          first,
          second
        ) {

          return (
            first -
            second
          );

        }
      );


  operationsDeleteRowsGrouped_(

    operationsSheet,

    uniqueRowsToDelete

  );


  if (
    operationsSheet.getLastRow() >= 2
  ) {

    operationsColorStatus(

      operationsSheet,

      2,

      operationsSheet.getLastRow() - 1,

      11

    );

  }


  SpreadsheetApp.flush();


  var result = {

    success:
      true,

    updated:
      updatedCount,

    deleted:
      uniqueRowsToDelete.length,

    multiple:
      multipleCount,

    skipped:
      skippedCount,

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


  return result;

}


/**
 * حذف الصفوف كمجموعات متتالية.
 */
function operationsDeleteRowsGrouped_(

  sheet,

  rows

) {

  if (
    !rows ||
    rows.length === 0
  ) {

    return;

  }


  var groups = [];


  var start =
    rows[0];


  var previous =
    rows[0];


  for (
    var index = 1;
    index < rows.length;
    index++
  ) {

    var current =
      rows[index];


    if (
      current ===
      previous + 1
    ) {

      previous =
        current;


      continue;

    }


    groups.push({

      start:
        start,

      count:
        previous - start + 1

    });


    start =
      current;


    previous =
      current;

  }


  groups.push({

    start:
      start,

    count:
      previous - start + 1

  });


  /**
   * الحذف من أسفل إلى أعلى.
   */
  groups

    .sort(
      function(
        first,
        second
      ) {

        return (
          second.start -
          first.start
        );

      }
    )

    .forEach(
      function(group) {

        sheet.deleteRows(

          group.start,

          group.count

        );

      }
    );

}


/* ==========================================================
 * قراءة دليل المطابقة
 * ==========================================================
 */

function operationsReconcileReadGuide_(
  guideSheet
) {

  var result = {

    byLabelId:
      {},

    byName:
      {}

  };


  var lastRow =
    guideSheet.getLastRow();


  if (
    lastRow < 2
  ) {

    return result;

  }


  var values =
    guideSheet
      .getRange(

        2,

        1,

        lastRow - 1,

        12

      )
      .getDisplayValues();


  var analyticLabels =
    operationsReservedAnalyticLabels_();


  values.forEach(
    function(
      row,
      index
    ) {

      var item =
        appText(
          row[0]
        );


      var system =
        appText(
          row[2]
        );


      var movementType =
        appText(
          row[3]
        );


      var automaticAction =
        appText(
          row[4]
        );


      var active =
        appText(
          row[5]
        );


      var gmailLabelId =
        appText(
          row[6]
        );


      var category =
        appText(
          row[9]
        );


      var period =
        appText(
          row[10]
        );


      var scope =
        appText(
          row[11]
        );


      if (
        !item
      ) {

        return;

      }


      if (
        !appIsActive(
          active
        )
      ) {

        return;

      }


      var normalizedItem =
        operationsReconcileNormalize_(
          item
        );


      if (
        analyticLabels[
          normalizedItem
        ]
      ) {

        return;

      }


      /**
       * غير مالي.
       */
      if (
        operationsReconcileNormalize_(
          system
        )

        ===

        operationsReconcileNormalize_(
          'غير مالي'
        )
      ) {

        return;

      }


      if (
        operationsReconcileNormalize_(
          movementType
        )

        ===

        operationsReconcileNormalize_(
          'غير مالي'
        )
      ) {

        return;

      }


      if (
        automaticAction ===
        'تجاهل — غير مالي'
      ) {

        return;

      }


      var info = {

        rowNumber:
          index + 2,

        item:
          item,

        system:
          system,

        movementType:
          movementType,

        automaticAction:
          automaticAction,

        gmailLabelId:
          gmailLabelId,

        category:
          category,

        period:
          period,

        scope:
          scope

      };


      result.byName[
        normalizedItem
      ] = info;


      if (
        gmailLabelId
      ) {

        result.byLabelId[
          gmailLabelId
        ] = info;

      }

    }
  );


  return result;

}


/* ==========================================================
 * قراءة Gmail Labels
 * ==========================================================
 */

function operationsReconcileReadGmailLabels_() {

  var result = {};


  try {

    /**
     * نستخدم Snapshot الموجود في 10_Gmail.gs
     * لتوحيد طريقة القراءة.
     */
    if (
      typeof gmailGetLabelsSnapshot_ ===
      'function'
    ) {

      var snapshot =
        gmailGetLabelsSnapshot_();


      snapshot.byId.forEach(
        function(
          label,
          id
        ) {

          result[
            id
          ] =
            label.name;

        }
      );


      return result;

    }


    /**
     * طريقة احتياطية.
     */
    var response =
      Gmail.Users.Labels.list(
        'me'
      );


    var labels =
      response &&
      Array.isArray(
        response.labels
      )

        ? response.labels

        : [];


    labels.forEach(
      function(label) {

        if (
          !label ||
          !label.id ||
          !label.name
        ) {

          return;

        }


        result[
          label.id
        ] =
          label.name;

      }
    );


  } catch (error) {

    console.error(
      'تعذر قراءة قائمة تصنيفات Gmail.',
      error
    );

  }


  return result;

}


/* ==========================================================
 * تحديث صف العملية من دليل البنود
 * ==========================================================
 */

function operationsReconcileUpdateRow_(

  sheet,

  rowNumber,

  oldRow,

  guideItem

) {

  var changed =
    false;


  /**
   * ننسخ C:O إلى الذاكرة.
   */
  var segment =
    oldRow.slice(
      2,
      15
    );


  /**
   * C = البند
   * segment[0]
   */
  if (
    appText(
      oldRow[2]
    )

    !==

    appText(
      guideItem.item
    )
  ) {

    segment[0] =
      guideItem.item;


    changed =
      true;

  }


  /**
   * G = نوع العملية
   * G - C = 4
   */
  if (
    appText(
      oldRow[6]
    )

    !==

    appText(
      guideItem.movementType
    )
  ) {

    segment[4] =
      guideItem.movementType;


    changed =
      true;

  }


  /**
   * J = النظام
   * J - C = 7
   */
  if (
    appText(
      oldRow[9]
    )

    !==

    appText(
      guideItem.system
    )
  ) {

    segment[7] =
      guideItem.system;


    changed =
      true;

  }


  /**
   * K = حالة التسجيل
   */
  var currentStatus =
    appText(
      oldRow[10]
    );


  var newStatus =
    currentStatus;


  if (
    operationsNormalizeText_(
      guideItem.movementType
    )

    ===

    operationsNormalizeText_(
      'تحويل داخلي'
    )
  ) {

    newStatus =
      'مستبعد من الدخل والمصروف';

  }


  else if (
    currentStatus === ''

    ||

    currentStatus.indexOf(
      'مستبعد'
    ) !== -1
  ) {

    newStatus =
      'مسجل';

  }


  if (
    currentStatus !==
    newStatus
  ) {

    segment[8] =
      newStatus;


    changed =
      true;

  }


  /**
   * M:N:O
   */
  var newCategory =
    appText(
      guideItem.category
    );


  var newPeriod =
    appText(
      guideItem.period
    );


  var newScope =
    appText(
      guideItem.scope
    );


  if (
    appText(
      oldRow[12]
    ) !== newCategory

    ||

    appText(
      oldRow[13]
    ) !== newPeriod

    ||

    appText(
      oldRow[14]
    ) !== newScope
  ) {

    /**
     * M - C = 10
     */
    segment[10] =
      newCategory;

    segment[11] =
      newPeriod;

    segment[12] =
      newScope;


    changed =
      true;

  }


  if (
    changed
  ) {

    /**
     * تحديث C:O بعملية كتابة واحدة.
     */
    sheet
      .getRange(

        rowNumber,

        3,

        1,

        13

      )
      .setValues([
        segment
      ]);

  }


  return changed;

}


/* ==========================================================
 * إزالة التكرار
 * ==========================================================
 */

function operationsReconcileUniqueItems_(
  items
) {

  var result = [];

  var used = {};


  (items || []).forEach(
    function(item) {

      if (
        !item ||
        !item.item
      ) {

        return;

      }


      var key =

        appText(
          item.gmailLabelId
        )

        ||

        operationsReconcileNormalize_(
          item.item
        );


      if (
        used[
          key
        ]
      ) {

        return;

      }


      used[
        key
      ] = true;


      result.push(
        item
      );

    }
  );


  return result;

}


/* ==========================================================
 * الأعمدة التحليلية
 * ==========================================================
 */


/**
 * تجهيز الفئة / الفترة / الصنف.
 */
function setupAnalyticColumns() {

  var ss =
    appActiveSpreadsheet();


  var guideSheet =
    appSheet(
      ss,
      APP_CONFIG.GUIDE_SHEET
    );


  var operationsSheet =
    appSheet(
      ss,
      APP_CONFIG.OPERATIONS_SHEET
    );


  /**
   * العناوين.
   */
  guideSheet
    .getRange(
      'J1:L1'
    )
    .setValues([[
      'الفئة',
      'الفترة',
      'الصنف'
    ]]);


  var guideLastRow =
    guideSheet.getLastRow();


  var guideUpdated = 0;

  var guideIncomplete = 0;


  if (
    guideLastRow >= 2
  ) {

    var rows =
      guideSheet
        .getRange(

          2,

          1,

          guideLastRow - 1,

          12

        )
        .getValues();


    var output = [];


    rows.forEach(
      function(row) {

        var classification =
          appText(
            row[1]
          );


        var movement =
          appText(
            row[3]
          );


        var category =
          appText(
            row[9]
          );


        var period =
          appText(
            row[10]
          );


        var scope =
          appText(
            row[11]
          );


        if (
          !category
        ) {

          category =
            analyticDetectCategory_(
              classification
            );

        }


        if (
          !period
        ) {

          period =
            analyticDetectPeriod_(
              classification
            );

        }


        if (
          !scope
        ) {

          scope =
            analyticDetectScope_(
              classification
            );

        }


        output.push([

          category,

          period,

          scope

        ]);


        if (
          movement ===
          'مصروف'
        ) {

          if (
            category &&
            period &&
            scope
          ) {

            guideUpdated++;


          } else {

            guideIncomplete++;

          }

        }

      }
    );


    guideSheet
      .getRange(

        2,

        10,

        output.length,

        3

      )
      .setValues(
        output
      );


    /**
     * قوائم الاختيار.
     */
    var categoryRule =
      SpreadsheetApp
        .newDataValidation()
        .requireValueInList(
          [
            'اساسي',
            'استثنائي',
            'ترفيهي'
          ],
          true
        )
        .setAllowInvalid(
          true
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
          true
        )
        .build();


    var scopeRule =
      SpreadsheetApp
        .newDataValidation()
        .requireValueInList(
          [
            'شخصي',
            'عائلي'
          ],
          true
        )
        .setAllowInvalid(
          true
        )
        .build();


    guideSheet
      .getRange(

        2,

        10,

        guideLastRow - 1,

        1

      )
      .setDataValidation(
        categoryRule
      );


    guideSheet
      .getRange(

        2,

        11,

        guideLastRow - 1,

        1

      )
      .setDataValidation(
        periodRule
      );


    guideSheet
      .getRange(

        2,

        12,

        guideLastRow - 1,

        1

      )
      .setDataValidation(
        scopeRule
      );

  }


  operationsSheet
    .getRange(
      'M1:O1'
    )
    .setValues([[
      'الفئة',
      'الفترة',
      'الصنف'
    ]]);


  /**
   * true يمنع flush إضافي.
   */
  var operationsUpdated =
    syncOperationAnalyticColumns(
      true
    );


  SpreadsheetApp.flush();


  var result = {

    success:
      true,

    guideUpdated:
      guideUpdated,

    guideIncomplete:
      guideIncomplete,

    operationsUpdated:
      operationsUpdated

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


/**
 * تحديث M:N:O في العمليات.
 *
 * skipFlush:
 * يستخدم داخليًا لتقليل flush المتكرر.
 */
function syncOperationAnalyticColumns(
  skipFlush
) {

  var ss =
    appActiveSpreadsheet();


  var guideSheet =
    ss.getSheetByName(
      APP_CONFIG.GUIDE_SHEET
    );


  var operationsSheet =
    ss.getSheetByName(
      APP_CONFIG.OPERATIONS_SHEET
    );


  if (
    !guideSheet ||
    !operationsSheet
  ) {

    return 0;

  }


  var guideLastRow =
    guideSheet.getLastRow();


  if (
    guideLastRow < 2
  ) {

    return 0;

  }


  var guideRows =
    guideSheet
      .getRange(

        2,

        1,

        guideLastRow - 1,

        12

      )
      .getValues();


  var guideMap = {};


  guideRows.forEach(
    function(row) {

      var item =
        appText(
          row[0]
        );


      if (
        !item
      ) {

        return;

      }


      guideMap[
        analyticNormalize_(
          item
        )
      ] = {

        category:
          appText(
            row[9]
          ),

        period:
          appText(
            row[10]
          ),

        scope:
          appText(
            row[11]
          )

      };

    }
  );


  var operationsLastRow =
    operationsSheet.getLastRow();


  if (
    operationsLastRow < 2
  ) {

    return 0;

  }


  var operationItems =
    operationsSheet
      .getRange(

        2,

        3,

        operationsLastRow - 1,

        1

      )
      .getValues();


  var output = [];

  var updated = 0;


  operationItems.forEach(
    function(row) {

      var item =
        appText(
          row[0]
        );


      var guideItem =
        guideMap[
          analyticNormalize_(
            item
          )
        ];


      if (
        guideItem
      ) {

        output.push([

          guideItem.category,

          guideItem.period,

          guideItem.scope

        ]);


        if (
          guideItem.category ||
          guideItem.period ||
          guideItem.scope
        ) {

          updated++;

        }


      } else {

        output.push([
          '',
          '',
          ''
        ]);

      }

    }
  );


  operationsSheet
    .getRange(

      2,

      13,

      output.length,

      3

    )
    .setValues(
      output
    );


  if (
    !skipFlush
  ) {

    SpreadsheetApp.flush();

  }


  return updated;

}


/* ==========================================================
 * اكتشاف التحليل من التصنيف القديم
 * ==========================================================
 */

function analyticDetectCategory_(
  text
) {

  var value =
    analyticNormalize_(
      text
    );


  if (
    value.indexOf(
      'اساسي'
    ) !== -1
  ) {

    return 'اساسي';

  }


  if (
    value.indexOf(
      'استثنائي'
    ) !== -1
  ) {

    return 'استثنائي';

  }


  if (
    value.indexOf(
      'ترفيهي'
    ) !== -1
  ) {

    return 'ترفيهي';

  }


  return '';

}


function analyticDetectPeriod_(
  text
) {

  var value =
    analyticNormalize_(
      text
    );


  if (
    value.indexOf(
      'شهري'
    ) !== -1
  ) {

    return 'شهري';

  }


  if (
    value.indexOf(
      'سنوي'
    ) !== -1
  ) {

    return 'سنوي';

  }


  if (
    value.indexOf(
      'موسمي'
    ) !== -1
  ) {

    return 'سنوي';

  }


  return '';

}


function analyticDetectScope_(
  text
) {

  var value =
    analyticNormalize_(
      text
    );


  if (
    value.indexOf(
      'شخصي'
    ) !== -1
  ) {

    return 'شخصي';

  }


  if (
    value.indexOf(
      'عائلي'
    ) !== -1
  ) {

    return 'عائلي';

  }


  return '';

}


/* ==========================================================
 * التوحيد النصي
 * ==========================================================
 */


/**
 * المحرك الموحد.
 */
function operationsNormalizeText_(
  value
) {

  return appText(
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
    )

    .trim();

}


/**
 * اسم الدالة القديمة محفوظ.
 */
function operationsNormalizeLabel_(
  value
) {

  return operationsNormalizeText_(
    value
  );

}


/**
 * اسم الدالة القديمة محفوظ.
 */
function operationsReconcileNormalize_(
  value
) {

  return operationsNormalizeText_(
    value
  );

}


/**
 * اسم الدالة القديمة محفوظ.
 */
function analyticNormalize_(
  value
) {

  return operationsNormalizeText_(
    value
  );

}


/**
 * Labels التحليلية ليست بنودًا.
 */
function operationsReservedAnalyticLabels_() {

  return {

    'اساسي':
      true,

    'استثنائي':
      true,

    'ترفيهي':
      true,

    'شهري':
      true,

    'سنوي':
      true,

    'شخصي':
      true,

    'عائلي':
      true

  };

}


/* ==========================================================
 * أدوات مساعدة
 * ==========================================================
 */

function operationsValidDate_(
  value
) {

  return (

    value instanceof Date &&

    !isNaN(
      value.getTime()
    )

  );

}


function operationsExistingAmount_(
  value
) {

  if (
    value === '' ||
    value === null ||
    value === undefined
  ) {

    return '';

  }


  var number =
    Number(
      value
    );


  return Number.isFinite(
    number
  )

    ? number

    : '';

}


function operationsErrorMessage_(
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
 * الاختبارات القديمة
 * ==========================================================
 */

function testOperationsSyncUpdate() {

  var result =
    operationsRegisterDetailed();


  console.log(

    JSON.stringify(
      result,
      null,
      2
    )

  );


  return result;

}


function testOperationsReconcile() {

  var result =
    operationsRegisterAndReconcile();


  console.log(

    JSON.stringify(
      result,
      null,
      2
    )

  );


  return result;

}


function testAnalyticColumns() {

  var result =
    setupAnalyticColumns();


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
 * اختبار الملف الموحد
 * ==========================================================
 */

function testOperationsSystem() {

  var ss =
    appActiveSpreadsheet();


  var operationsSheet =
    appSheet(
      ss,
      APP_CONFIG.OPERATIONS_SHEET
    );


  /**
   * 1. التأكد من العناوين.
   */
  operationsEnsureHeaders(
    operationsSheet
  );


  /**
   * 2. التأكد من الأعمدة التحليلية.
   */
  var analyticResult =
    setupAnalyticColumns();


  /**
   * 3. تسجيل ومطابقة العمليات.
   */
  var syncResult =
    operationsRegisterAndReconcile();


  /**
   * 4. التحقق من العناوين الجديدة.
   */
  var analyticHeaders =
    operationsSheet
      .getRange(
        1,
        13,
        1,
        3
      )
      .getDisplayValues()[0];


  if (
    analyticHeaders[0] !==
      'الفئة' ||

    analyticHeaders[1] !==
      'الفترة' ||

    analyticHeaders[2] !==
      'الصنف'
  ) {

    throw new Error(
      'فشل التحقق من أعمدة الفئة والفترة والصنف.'
    );

  }


  var result = {

    success:
      true,

    analytic:
      analyticResult,

    operations:
      syncResult,

    rows:
      Math.max(
        0,
        operationsSheet.getLastRow() - 1
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

    'نجح اختبار 20_Operations.gs',

    'اختبار النظام',

    6

  );


  return result;

}
/* ==========================================================
 * المحرك السريع للعمليات
 * Fast Operations Sync
 *
 * لا يلغي المحرك القديم.
 *
 * الفكرة:
 * - لا يفحص كل Gmail Label.
 * - لا يعيد فحص كل العمليات القديمة.
 * - يعتمد على Gmail History لمعرفة ما تغير فقط.
 * - يفحص الرسائل الجديدة أو التي أضيف لها Label.
 * - يتجاهل Message IDs الموجودة أصلًا في العمليات.
 * ==========================================================
 */


var OPERATIONS_FAST_CONFIG = Object.freeze({

  HISTORY_PROPERTY:
    'OPERATIONS_FAST_GMAIL_HISTORY_ID',

  BOOTSTRAP_DAYS:
    3,

  MAX_HISTORY_PAGES:
    10,

  MAX_HISTORY_RESULTS:
    500,

  MAX_BOOTSTRAP_PAGES:
    3,

  MAX_CANDIDATES:
    500

});


/* ==========================================================
 * تهيئة المؤشر لأول مرة
 * ==========================================================
 */


/**
 * شغّل هذه الدالة مرة واحدة فقط
 * بعد أن تكون المزامنة الحالية مكتملة.
 *
 * لا تقرأ محتوى الرسائل.
 * فقط تحفظ Gmail History ID الحالي.
 */
function initializeOperationsFastCursor() {

  gmailLabelSyncEnsureService_();


  var profile =
    Gmail.Users.getProfile(
      'me'
    );


  var historyId =
    appText(
      profile &&
      profile.historyId
    );


  if (
    !historyId
  ) {

    throw new Error(
      'تعذر الحصول على Gmail History ID.'
    );

  }


  PropertiesService
    .getScriptProperties()
    .setProperty(

      OPERATIONS_FAST_CONFIG
        .HISTORY_PROPERTY,

      historyId

    );


  var result = {

    success:
      true,

    initialized:
      true,

    message:
      'تم تجهيز المزامنة السريعة بنجاح.'

  };


  console.log(
    JSON.stringify(
      result,
      null,
      2
    )
  );


  appToast(

    'تم تجهيز المزامنة السريعة.',

    'المزامنة السريعة',

    5

  );


  return result;

}


/**
 * حذف المؤشر فقط عند الحاجة للصيانة.
 *
 * لا يحذف أي عملية ولا رسالة.
 */
function resetOperationsFastCursor() {

  PropertiesService
    .getScriptProperties()
    .deleteProperty(

      OPERATIONS_FAST_CONFIG
        .HISTORY_PROPERTY

    );


  return {

    success:
      true,

    reset:
      true

  };

}


/* ==========================================================
 * الدالة العامة
 * ==========================================================
 */


function operationsRegisterFast() {

  var result =
    operationsRegisterFastDetailed();


  return Number(
    result.added
  ) || 0;

}


/**
 * مزامنة العمليات الجديدة فقط.
 */
function operationsRegisterFastDetailed() {

  var startedAt =
    new Date();


  gmailLabelSyncEnsureService_();


  var ss =
    appActiveSpreadsheet();


  var guideSheet =
    appSheet(
      ss,
      APP_CONFIG.GUIDE_SHEET
    );


  var operationsSheet =
    appSheet(
      ss,
      APP_CONFIG.OPERATIONS_SHEET
    );


  operationsEnsureHeaders(
    operationsSheet
  );


  /**
   * ==========================================
   * 1. قراءة البنود النشطة
   * ==========================================
   */

  var guideItems =
    operationsReadGuideItems(
      guideSheet,
      true
    );


  if (
    guideItems.length === 0
  ) {

    throw new Error(
      'لا توجد بنود نشطة في دليل البنود.'
    );

  }


  var guideByLabelId =
    operationsFastBuildGuideMap_(
      guideItems
    );


  var unlinkedGuideItems =
    guideItems.filter(
      function(item) {

        return !appText(
          item.gmailLabelId
        );

      }
    ).length;


  /**
   * ==========================================
   * 2. قراءة Message IDs الموجودة
   * ==========================================
   */

  var existingRows =
    operationsReadExistingRows(
      operationsSheet
    );


  /**
   * ==========================================
   * 3. الحصول على الرسائل التي تغيرت فقط
   * ==========================================
   */

  var changeSet =
    operationsFastCollectChanges_();


  var candidates =
    changeSet.messageIds || [];


  var addedRecords = [];


  var knownCount =
    0;


  var ignoredCount =
    0;


  var multipleCount =
    0;


  var failedCount =
    0;


  var processedCount =
    0;


  var retryRequired =
    false;


  var maximum =
    Math.min(

      OPERATIONS_FAST_CONFIG
        .MAX_CANDIDATES,

      Math.max(

        1,

        Number(
          APP_CONFIG.MAX_RECORDS_PER_RUN
        ) || 100

      )

    );


  /**
   * ==========================================
   * 4. معالجة المرشحين فقط
   * ==========================================
   */

  for (
    var index = 0;
    index < candidates.length;
    index++
  ) {

    if (
      processedCount >=
      maximum
    ) {

      break;

    }


    var messageId =
      appText(
        candidates[index]
      );


    if (
      !messageId
    ) {

      continue;

    }


    /**
     * موجود مسبقًا.
     *
     * لا نقرأ Gmail مرة أخرى.
     */
    if (
      existingRows.has(
        messageId
      )
    ) {

      knownCount++;

      continue;

    }


    var apiMessage;


    try {

      apiMessage =
        Gmail.Users.Messages.get(

          'me',

          messageId,

          {
            format:
              'minimal'
          }

        );


    } catch (error) {

      console.warn(
        'تعذر فحص رسالة جديدة.'
      );


      failedCount++;

      retryRequired =
        true;


      continue;

    }


    if (
      !apiMessage
    ) {

      failedCount++;

      retryRequired =
        true;

      continue;

    }


    var labelIds =
      Array.isArray(
        apiMessage.labelIds
      )

        ? apiMessage.labelIds

        : [];


    /**
     * نتجاهل Trash / Spam.
     */
    if (
      labelIds.indexOf(
        'TRASH'
      ) !== -1

      ||

      labelIds.indexOf(
        'SPAM'
      ) !== -1
    ) {

      ignoredCount++;

      continue;

    }


    var matchingItems = [];


    labelIds.forEach(
      function(labelId) {

        var guideItem =
          guideByLabelId[
            appText(
              labelId
            )
          ];


        if (
          guideItem
        ) {

          matchingItems.push(
            guideItem
          );

        }

      }
    );


    matchingItems =
      operationsNormalizeMatchingItems_(
        matchingItems
      );


    /**
     * لا يوجد بند مالي نشط.
     */
    if (
      matchingItems.length === 0
    ) {

      ignoredCount++;

      continue;

    }


    /**
     * أكثر من بند مالي على نفس الرسالة.
     */
    if (
      matchingItems.length > 1
    ) {

      multipleCount++;

      continue;

    }


    var guideItem =
      matchingItems[0];


    var message;


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

      failedCount++;

      retryRequired =
        true;

      continue;

    }


    var parsed;


    try {

      parsed =
        bankParseMessage(

          gmailPlainBody(
            message
          ),

          guideItem.item,

          message.getDate(),

          message.getFrom(),

          message.getSubject()

        );


    } catch (error) {

      console.warn(
        'تعذر تحليل عملية جديدة.'
      );


      failedCount++;

      retryRequired =
        true;

      continue;

    }


    var row =
      operationsBuildRow_(

        messageId,

        parsed,

        guideItem,

        matchingItems,

        null

      );


    addedRecords.push({

      date:
        operationsValidDate_(
          row[1]
        )

          ? row[1]

          : new Date(),

      row:
        row

    });


    processedCount++;

  }


  /**
   * ==========================================
   * 5. كتابة العمليات الجديدة فقط
   * ==========================================
   */

  var firstNewRow =
    operationsSheet.getLastRow() + 1;


  operationsWriteNewRows_(

    operationsSheet,

    addedRecords

  );


  /**
   * تلوين الصفوف الجديدة فقط.
   *
   * لا نعيد تلوين كامل ورقة العمليات.
   */
  if (
    addedRecords.length > 0
  ) {

    operationsColorStatus(

      operationsSheet,

      firstNewRow,

      addedRecords.length,

      11

    );

  }


  SpreadsheetApp.flush();


  /**
   * ==========================================
   * 6. تحديث Gmail History Cursor
   * ==========================================
   *
   * إذا حدث فشل في قراءة رسالة،
   * لا نقدم المؤشر حتى نحاولها مرة أخرى.
   */

  var cursorAdvanced =
    false;


  if (
    !retryRequired &&
    changeSet.nextHistoryId
  ) {

    PropertiesService
      .getScriptProperties()
      .setProperty(

        OPERATIONS_FAST_CONFIG
          .HISTORY_PROPERTY,

        String(
          changeSet.nextHistoryId
        )

      );


    cursorAdvanced =
      true;

  }


  var reviewCount =
    operationsCountReviewRows_(

      addedRecords,

      []

    );


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

    mode:
      changeSet.mode,

    candidates:
      candidates.length,

    processed:
      processedCount,

    added:
      addedRecords.length,

    known:
      knownCount,

    ignored:
      ignoredCount,

    multiple:
      multipleCount,

    failed:
      failedCount,

    review:
      reviewCount,

    unlinkedGuideItems:
      unlinkedGuideItems,

    cursorAdvanced:
      cursorAdvanced,

    durationSeconds:
      durationSeconds,

    completedAt:
      Utilities.formatDate(

        completedAt,

        appTimeZone(
          ss
        ),

        'dd/MM/yyyy HH:mm:ss'

      )

  };


  operationsSaveLastResult_(
    result
  );


  console.log(
    JSON.stringify(
      result,
      null,
      2
    )
  );


  if (
    result.added > 0
  ) {

    appToast(

      'تحديث سريع: تمت إضافة ' +
        result.added +
        ' عملية خلال ' +
        result.durationSeconds +
        ' ثانية.',

      'المزامنة السريعة',

      7

    );


  } else {

    appToast(

      'التحديث السريع اكتمل خلال ' +
        result.durationSeconds +
        ' ثانية، ولا توجد عمليات جديدة.',

      'المزامنة السريعة',

      6

    );

  }


  return result;

}


/* ==========================================================
 * Gmail History
 * ==========================================================
 */


/**
 * الحصول على التغييرات منذ آخر تشغيل.
 */
function operationsFastCollectChanges_() {

  var properties =
    PropertiesService
      .getScriptProperties();


  var storedHistoryId =
    appText(

      properties.getProperty(

        OPERATIONS_FAST_CONFIG
          .HISTORY_PROPERTY

      )

    );


  /**
   * تاريخ Gmail الحالي قبل أي Bootstrap.
   *
   * حتى لا نفقد رسالة تصل أثناء التنفيذ.
   */
  var currentHistoryId =
    operationsFastGetCurrentHistoryId_();


  /**
   * إذا لم يوجد Cursor،
   * نستخدم Bootstrap محدودًا.
   */
  if (
    !storedHistoryId
  ) {

    return {

      mode:
        'bootstrap',

      messageIds:
        operationsFastBootstrapMessages_(),

      nextHistoryId:
        currentHistoryId

    };

  }


  /**
   * Gmail History هو المسار الأساسي.
   */
  if (
    Gmail.Users.History &&
    typeof Gmail.Users.History.list ===
      'function'
  ) {

    try {

      var historyResult =
        operationsFastReadHistory_(
          storedHistoryId
        );


      return {

        mode:
          'history',

        messageIds:
          historyResult.messageIds,

        nextHistoryId:
          historyResult.nextHistoryId ||
          currentHistoryId

      };


    } catch (error) {

      console.warn(

        'تعذر استخدام Gmail History، سيتم استخدام فحص حديث محدود: ' +

        operationsErrorMessage_(
          error
        )

      );

    }

  }


  /**
   * Fallback آمن.
   */
  return {

    mode:
      'bootstrap_fallback',

    messageIds:
      operationsFastBootstrapMessages_(),

    nextHistoryId:
      currentHistoryId

  };

}


/**
 * قراءة Gmail History.
 */
function operationsFastReadHistory_(
  startHistoryId
) {

  var used = {};


  var messageIds = [];


  var pageToken =
    null;


  var nextHistoryId =
    '';


  var pageCount =
    0;


  do {

    var options = {

      startHistoryId:
        String(
          startHistoryId
        ),

      maxResults:
        OPERATIONS_FAST_CONFIG
          .MAX_HISTORY_RESULTS

    };


    if (
      pageToken
    ) {

      options.pageToken =
        pageToken;

    }


    var response =
      Gmail.Users.History.list(

        'me',

        options

      );


    var historyRows =
      response.history || [];


    historyRows.forEach(
      function(historyRow) {

        /**
         * رسائل مرتبطة بأي تغيير.
         */
        operationsFastCollectMessageRefs_(

          historyRow.messages,

          used,

          messageIds

        );


        /**
         * رسائل جديدة.
         */
        (historyRow.messagesAdded || [])
          .forEach(
            function(record) {

              operationsFastCollectMessageRefs_(

                record &&
                record.message

                  ? [
                      record.message
                    ]

                  : [],

                used,

                messageIds

              );

            }
          );


        /**
         * Label تمت إضافته إلى رسالة.
         *
         * هذا مهم إذا صنفت رسالة قديمة
         * ببند مالي جديد.
         */
        (historyRow.labelsAdded || [])
          .forEach(
            function(record) {

              operationsFastCollectMessageRefs_(

                record &&
                record.message

                  ? [
                      record.message
                    ]

                  : [],

                used,

                messageIds

              );

            }
          );

      }
    );


    nextHistoryId =
      appText(
        response.historyId
      ) ||
      nextHistoryId;


    pageToken =
      response.nextPageToken ||
      null;


    pageCount++;


    if (
      messageIds.length >=
      OPERATIONS_FAST_CONFIG
        .MAX_CANDIDATES
    ) {

      break;

    }


  } while (

    pageToken &&

    pageCount <
      OPERATIONS_FAST_CONFIG
        .MAX_HISTORY_PAGES

  );


  return {

    messageIds:
      messageIds.slice(

        0,

        OPERATIONS_FAST_CONFIG
          .MAX_CANDIDATES

      ),

    nextHistoryId:
      nextHistoryId

  };

}


/**
 * تجميع Message IDs بدون تكرار.
 */
function operationsFastCollectMessageRefs_(

  references,

  used,

  output

) {

  (references || [])
    .forEach(
      function(reference) {

        var messageId =
          appText(
            reference &&
            reference.id
          );


        if (
          !messageId ||
          used[
            messageId
          ]
        ) {

          return;

        }


        used[
          messageId
        ] =
          true;


        output.push(
          messageId
        );

      }
    );

}


/* ==========================================================
 * Bootstrap
 * ==========================================================
 */


/**
 * يستخدم فقط إذا لم يوجد Gmail History Cursor.
 *
 * بدل فحص كل Label،
 * يقرأ الرسائل الحديثة مرة واحدة.
 */
function operationsFastBootstrapMessages_() {

  var used = {};


  var result = [];


  var pageToken =
    null;


  var pageCount =
    0;


  do {

    var options = {

      q:
        'newer_than:' +
        OPERATIONS_FAST_CONFIG
          .BOOTSTRAP_DAYS +
        'd -in:spam -in:trash',

      maxResults:
        100

    };


    if (
      pageToken
    ) {

      options.pageToken =
        pageToken;

    }


    var response =
      Gmail.Users.Messages.list(

        'me',

        options

      );


    var messages =
      response.messages || [];


    messages.forEach(
      function(reference) {

        var messageId =
          appText(
            reference &&
            reference.id
          );


        if (
          !messageId ||
          used[
            messageId
          ]
        ) {

          return;

        }


        used[
          messageId
        ] =
          true;


        result.push(
          messageId
        );

      }
    );


    pageToken =
      response.nextPageToken ||
      null;


    pageCount++;


    if (
      result.length >=
      OPERATIONS_FAST_CONFIG
        .MAX_CANDIDATES
    ) {

      break;

    }


  } while (

    pageToken &&

    pageCount <
      OPERATIONS_FAST_CONFIG
        .MAX_BOOTSTRAP_PAGES

  );


  return result.slice(

    0,

    OPERATIONS_FAST_CONFIG
      .MAX_CANDIDATES

  );

}


/* ==========================================================
 * دليل البنود
 * ==========================================================
 */


/**
 * بناء خريطة Gmail Label ID → البند.
 */
function operationsFastBuildGuideMap_(
  guideItems
) {

  var result = {};


  (guideItems || [])
    .forEach(
      function(item) {

        var labelId =
          appText(
            item.gmailLabelId
          );


        if (
          !labelId
        ) {

          return;

        }


        result[
          labelId
        ] =
          item;

      }
    );


  return result;

}


/* ==========================================================
 * Gmail Profile
 * ==========================================================
 */


function operationsFastGetCurrentHistoryId_() {

  var profile =
    Gmail.Users.getProfile(
      'me'
    );


  var historyId =
    appText(
      profile &&
      profile.historyId
    );


  if (
    !historyId
  ) {

    throw new Error(
      'تعذر قراءة Gmail History ID.'
    );

  }


  return historyId;

}


/* ==========================================================
 * اختبار المزامنة السريعة
 * ==========================================================
 */


/**
 * هذا الاختبار حقيقي:
 * يسجل أي عملية جديدة موجودة.
 *
 * لكنه لا:
 * - يعيد فحص العمليات القديمة
 * - يحذف عمليات
 * - يعيد بناء الإيجارات
 * - يرسل إيصالات
 */
function testOperationsFastSync() {

  var result =
    operationsRegisterFastDetailed();


  console.log(

    JSON.stringify(
      {
        success:
          result.success,

        mode:
          result.mode,

        candidates:
          result.candidates,

        added:
          result.added,

        known:
          result.known,

        ignored:
          result.ignored,

        multiple:
          result.multiple,

        failed:
          result.failed,

        durationSeconds:
          result.durationSeconds,

        cursorAdvanced:
          result.cursorAdvanced
      },

      null,

      2
    )

  );


  return result;

}
/* ==========================================================
 * FAST OPERATIONS PATCH V2
 *
 * إصلاح:
 * تغيير Label لرسالة قديمة موجودة في ورقة العمليات.
 *
 * لا يحذف المحرك القديم.
 * هذا الإصدار يحل محل التنفيذ السريع عند التشغيل.
 * ==========================================================
 */


function operationsFastV2BuildExistingRow_(
  oldRow,
  guideItem
) {

  oldRow =
    Array.isArray(oldRow)
      ? oldRow
      : [];


  guideItem =
    guideItem || {};


  var row =
    oldRow.slice(
      0,
      OPERATIONS_TOTAL_COLUMNS
    );


  while (
    row.length <
    OPERATIONS_TOTAL_COLUMNS
  ) {

    row.push('');

  }


  /* C = البند */
  row[2] =
    appText(
      guideItem.item
    );


  /* D = التصنيف القديم */
  row[3] =
    appText(
      guideItem.classification
    );


  /* G = نوع الحركة */
  var movementType =
    appText(
      guideItem.movementType
    );


  if (
    movementType
  ) {

    row[6] =
      movementType;

  }


  /* J = النظام */
  row[9] =
    appText(
      guideItem.system
    );


  /* K = حالة التسجيل */
  var currentStatus =
    appText(
      row[10]
    );


  if (
    operationsNormalizeText_(
      movementType
    )
    ===
    operationsNormalizeText_(
      'تحويل داخلي'
    )
  ) {

    row[10] =
      'مستبعد من الدخل والمصروف';

  }


  else if (
    !currentStatus ||
    currentStatus.indexOf(
      'مستبعد'
    ) !== -1
  ) {

    row[10] =
      'مسجل';

  }


  /* M = الفئة */
  row[12] =
    appText(
      guideItem.category
    );


  /* N = الفترة */
  row[13] =
    appText(
      guideItem.period
    );


  /* O = الصنف */
  row[14] =
    appText(
      guideItem.scope
    );


  return row;

}


/* ==========================================================
 * هل رسالة Gmail محذوفة؟
 * ==========================================================
 */


function operationsFastV2IsNotFound_(
  error
) {

  var text =
    operationsErrorMessage_(
      error
    )
    .toLowerCase();


  return (

    text.indexOf(
      '404'
    ) !== -1

    ||

    text.indexOf(
      'not found'
    ) !== -1

  );

}


/* ==========================================================
 * قراءة Gmail History V2
 *
 * الجديد:
 * - labelsAdded
 * - labelsRemoved
 * - messagesAdded
 * - messagesDeleted
 * ==========================================================
 */


function operationsFastV2ReadHistory_(
  startHistoryId
) {

  var used = {};

  var messageIds = [];

  var pageToken = null;

  var nextHistoryId = '';

  var pageCount = 0;


  do {

    var options = {

      startHistoryId:
        String(
          startHistoryId
        ),

      maxResults:
        OPERATIONS_FAST_CONFIG
          .MAX_HISTORY_RESULTS

    };


    if (
      pageToken
    ) {

      options.pageToken =
        pageToken;

    }


    var response =
      Gmail.Users.History.list(
        'me',
        options
      );


    var historyRows =
      response.history || [];


    historyRows.forEach(
      function(historyRow) {


        operationsFastCollectMessageRefs_(

          historyRow.messages,

          used,

          messageIds

        );


        (historyRow.messagesAdded || [])
          .forEach(
            function(record) {

              operationsFastCollectMessageRefs_(

                record &&
                record.message
                  ? [record.message]
                  : [],

                used,

                messageIds

              );

            }
          );


        (historyRow.messagesDeleted || [])
          .forEach(
            function(record) {

              operationsFastCollectMessageRefs_(

                record &&
                record.message
                  ? [record.message]
                  : [],

                used,

                messageIds

              );

            }
          );


        (historyRow.labelsAdded || [])
          .forEach(
            function(record) {

              operationsFastCollectMessageRefs_(

                record &&
                record.message
                  ? [record.message]
                  : [],

                used,

                messageIds

              );

            }
          );


        /*
         * مهم جدًا:
         * التقاط إزالة Label القديم من الرسالة.
         */
        (historyRow.labelsRemoved || [])
          .forEach(
            function(record) {

              operationsFastCollectMessageRefs_(

                record &&
                record.message
                  ? [record.message]
                  : [],

                used,

                messageIds

              );

            }
          );

      }
    );


    nextHistoryId =
      appText(
        response.historyId
      ) ||
      nextHistoryId;


    pageToken =
      response.nextPageToken ||
      null;


    pageCount++;


    if (
      messageIds.length >=
      OPERATIONS_FAST_CONFIG.MAX_CANDIDATES
    ) {

      break;

    }


  } while (

    pageToken &&

    pageCount <
      OPERATIONS_FAST_CONFIG.MAX_HISTORY_PAGES

  );


  return {

    messageIds:
      messageIds.slice(
        0,
        OPERATIONS_FAST_CONFIG.MAX_CANDIDATES
      ),

    nextHistoryId:
      nextHistoryId

  };

}


/* ==========================================================
 * جمع التغييرات V2
 * ==========================================================
 */


function operationsFastV2CollectChanges_() {

  var properties =
    PropertiesService
      .getScriptProperties();


  var storedHistoryId =
    appText(

      properties.getProperty(

        OPERATIONS_FAST_CONFIG
          .HISTORY_PROPERTY

      )

    );


  var currentHistoryId =
    operationsFastGetCurrentHistoryId_();


  /*
   * في حالة عدم وجود Cursor.
   */
  if (
    !storedHistoryId
  ) {

    return {

      mode:
        'bootstrap',

      messageIds:
        operationsFastBootstrapMessages_(),

      nextHistoryId:
        currentHistoryId

    };

  }


  try {

    var historyResult =
      operationsFastV2ReadHistory_(
        storedHistoryId
      );


    return {

      mode:
        'history_v2',

      messageIds:
        historyResult.messageIds,

      nextHistoryId:
        historyResult.nextHistoryId ||
        currentHistoryId

    };


  } catch (error) {

    console.warn(

      'تعذر استخدام Gmail History V2: ' +

      operationsErrorMessage_(
        error
      )

    );


    return {

      mode:
        'bootstrap_fallback',

      messageIds:
        operationsFastBootstrapMessages_(),

      nextHistoryId:
        currentHistoryId

    };

  }

}


/* ==========================================================
 * المحرك السريع V2
 * ==========================================================
 */


operationsRegisterFastDetailed =
function() {

  var startedAt =
    new Date();


  gmailLabelSyncEnsureService_();


  var ss =
    appActiveSpreadsheet();


  var guideSheet =
    appSheet(
      ss,
      APP_CONFIG.GUIDE_SHEET
    );


  var operationsSheet =
    appSheet(
      ss,
      APP_CONFIG.OPERATIONS_SHEET
    );


  operationsEnsureHeaders(
    operationsSheet
  );


  /* ======================================================
     1. دليل البنود
     ====================================================== */


  var guideItems =
    operationsReadGuideItems(
      guideSheet,
      true
    );


  if (
    guideItems.length === 0
  ) {

    throw new Error(
      'لا توجد بنود نشطة في دليل البنود.'
    );

  }


  var guideByLabelId =
    operationsFastBuildGuideMap_(
      guideItems
    );


  var unlinkedGuideItems =
    guideItems.filter(
      function(item) {

        return !appText(
          item.gmailLabelId
        );

      }
    ).length;


  /* ======================================================
     2. العمليات الموجودة
     ====================================================== */


  var existingRows =
    operationsReadExistingRows(
      operationsSheet
    );


  /* ======================================================
     3. تغييرات Gmail فقط
     ====================================================== */


  var changeSet =
    operationsFastV2CollectChanges_();


  var candidates =
    changeSet.messageIds || [];


  var addedRecords = [];

  var updatedRecords = [];

  var rowsToDelete = [];


  var knownCount = 0;

  var ignoredCount = 0;

  var multipleCount = 0;

  var failedCount = 0;

  var processedCount = 0;

  var retryRequired = false;


  /* ======================================================
     4. فحص الرسائل التي تغيرت
     ====================================================== */


  for (
    var index = 0;
    index < candidates.length;
    index++
  ) {

    var messageId =
      appText(
        candidates[index]
      );


    if (
      !messageId
    ) {

      continue;

    }


    processedCount++;


    var existingInfo =

      existingRows.has(
        messageId
      )

        ? existingRows.get(
            messageId
          )

        : null;


    /*
     * الفرق الأساسي عن المحرك القديم:
     *
     * لا يوجد:
     *
     * if (existingRows.has(messageId)) continue;
     *
     * الرسالة القديمة يتم فحصها الآن.
     */


    var apiMessage = null;


    try {

      apiMessage =
        Gmail.Users.Messages.get(

          'me',

          messageId,

          {
            format:
              'minimal'
          }

        );


    } catch (error) {


      if (
        operationsFastV2IsNotFound_(
          error
        )
      ) {

        if (
          existingInfo
        ) {

          rowsToDelete.push(
            existingInfo.rowNumber
          );

        }


        else {

          ignoredCount++;

        }


        continue;

      }


      console.warn(

        'تعذر فحص رسالة Gmail: ' +

        messageId +

        ' - ' +

        operationsErrorMessage_(
          error
        )

      );


      failedCount++;

      retryRequired =
        true;


      continue;

    }


    if (
      !apiMessage
    ) {

      failedCount++;

      retryRequired =
        true;

      continue;

    }


    var labelIds =
      Array.isArray(
        apiMessage.labelIds
      )

        ? apiMessage.labelIds

        : [];


    /*
     * Spam / Trash
     */
    if (
      labelIds.indexOf(
        'TRASH'
      ) !== -1

      ||

      labelIds.indexOf(
        'SPAM'
      ) !== -1
    ) {

      ignoredCount++;

      continue;

    }


    /* ====================================================
       معرفة البند الحالي على الرسالة
       ==================================================== */


    var matchingItems = [];


    labelIds.forEach(
      function(labelId) {

        var guideItem =
          guideByLabelId[
            appText(
              labelId
            )
          ];


        if (
          guideItem
        ) {

          matchingItems.push(
            guideItem
          );

        }

      }
    );


    matchingItems =
      operationsNormalizeMatchingItems_(
        matchingItems
      );


    /* ====================================================
       رسالة موجودة مسبقًا
       ==================================================== */


    if (
      existingInfo
    ) {


      /*
       * تمت إزالة جميع البنود المالية.
       */
      if (
        matchingItems.length === 0
      ) {

        rowsToDelete.push(
          existingInfo.rowNumber
        );


        continue;

      }


      /*
       * أكثر من بند مالي.
       */
      if (
        matchingItems.length > 1
      ) {

        rowsToDelete.push(
          existingInfo.rowNumber
        );


        multipleCount++;


        continue;

      }


      var currentGuideItem =
        matchingItems[0];


      var updatedRow =
        operationsFastV2BuildExistingRow_(

          existingInfo.values,

          currentGuideItem

        );


      /*
       * هل تغير البند أو تصنيفه؟
       */
      if (
        operationsClassificationFieldsDiffer_(

          existingInfo.values,

          updatedRow

        )
      ) {

        updatedRecords.push({

          rowNumber:
            existingInfo.rowNumber,

          row:
            updatedRow

        });


      } else {

        knownCount++;

      }


      continue;

    }


    /* ====================================================
       رسالة غير موجودة = عملية جديدة
       ==================================================== */


    if (
      matchingItems.length === 0
    ) {

      ignoredCount++;

      continue;

    }


    if (
      matchingItems.length > 1
    ) {

      multipleCount++;

      continue;

    }


    var guideItem =
      matchingItems[0];


    var message = null;


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

      failedCount++;

      retryRequired =
        true;

      continue;

    }


    var parsed = null;


    try {

      parsed =
        bankParseMessage(

          gmailPlainBody(
            message
          ),

          guideItem.item,

          message.getDate(),

          message.getFrom(),

          message.getSubject()

        );


    } catch (error) {

      console.warn(

        'تعذر تحليل العملية الجديدة: ' +
        messageId

      );


      failedCount++;

      retryRequired =
        true;

      continue;

    }


    var row =
      operationsBuildRow_(

        messageId,

        parsed,

        guideItem,

        matchingItems,

        null

      );


    addedRecords.push({

      date:
        operationsValidDate_(
          row[1]
        )

          ? row[1]

          : new Date(),

      row:
        row

    });

  }


  /* ======================================================
     5. تحديث العمليات القديمة
     ====================================================== */


  operationsWriteUpdatedRows_(

    operationsSheet,

    updatedRecords

  );


  /* ======================================================
     6. حذف العمليات التي لم يعد عليها بند
     ====================================================== */


  var uniqueRowsToDelete =
    rowsToDelete

      .filter(
        function(
          rowNumber,
          index,
          array
        ) {

          return (
            array.indexOf(
              rowNumber
            ) === index
          );

        }
      )

      .sort(
        function(
          first,
          second
        ) {

          return (
            first -
            second
          );

        }
      );


  operationsDeleteRowsGrouped_(

    operationsSheet,

    uniqueRowsToDelete

  );


  /* ======================================================
     7. إضافة العمليات الجديدة
     ====================================================== */


  var firstNewRow =
    operationsSheet.getLastRow() +
    1;


  operationsWriteNewRows_(

    operationsSheet,

    addedRecords

  );


  if (
    addedRecords.length > 0
  ) {

    operationsColorStatus(

      operationsSheet,

      firstNewRow,

      addedRecords.length,

      11

    );

  }


  SpreadsheetApp.flush();


  /* ======================================================
     8. تحريك Gmail History Cursor
     ====================================================== */


  var cursorAdvanced =
    false;


  if (
    !retryRequired &&
    changeSet.nextHistoryId
  ) {

    PropertiesService
      .getScriptProperties()
      .setProperty(

        OPERATIONS_FAST_CONFIG
          .HISTORY_PROPERTY,

        String(
          changeSet.nextHistoryId
        )

      );


    cursorAdvanced =
      true;

  }


  /* ======================================================
     9. النتيجة
     ====================================================== */


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

    version:
      'FAST_V2',

    mode:
      changeSet.mode,

    candidates:
      candidates.length,

    processed:
      processedCount,

    added:
      addedRecords.length,

    updated:
      updatedRecords.length,

    deleted:
      uniqueRowsToDelete.length,

    known:
      knownCount,

    ignored:
      ignoredCount,

    multiple:
      multipleCount,

    failed:
      failedCount,

    unlinkedGuideItems:
      unlinkedGuideItems,

    cursorAdvanced:
      cursorAdvanced,

    durationSeconds:
      durationSeconds,

    completedAt:
      Utilities.formatDate(

        completedAt,

        appTimeZone(
          ss
        ),

        'dd/MM/yyyy HH:mm:ss'

      )

  };


  operationsSaveLastResult_(
    result
  );


  console.log(

    JSON.stringify(
      result,
      null,
      2
    )

  );


  appToast(

    'سريع V2' +
    ' | جديد: ' +
    result.added +
    ' | محدث: ' +
    result.updated +
    ' | محذوف: ' +
    result.deleted +
    ' | ' +
    result.durationSeconds +
    ' ث',

    'المزامنة السريعة',

    8

  );


  return result;

};


/* ==========================================================
 * اختبار واضح لـ V2
 * ==========================================================
 */


testOperationsFastSync =
function() {

  var result =
    operationsRegisterFastDetailed();


  console.log(

    JSON.stringify(

      {

        success:
          result.success,

        version:
          result.version,

        mode:
          result.mode,

        candidates:
          result.candidates,

        processed:
          result.processed,

        added:
          result.added,

        updated:
          result.updated,

        deleted:
          result.deleted,

        known:
          result.known,

        ignored:
          result.ignored,

        multiple:
          result.multiple,

        failed:
          result.failed,

        durationSeconds:
          result.durationSeconds,

        cursorAdvanced:
          result.cursorAdvanced

      },

      null,

      2

    )

  );


  return result;

};
/* ==========================================================
 * FAST OPERATIONS V3
 *
 * إصلاح الرسائل القديمة التي:
 * - تحمل Gmail Label صحيح.
 * - لكن لا يوجد لها صف في ورقة العمليات.
 * - وتم لاحقًا استكمال/تعديل إعداد البند في دليل البنود.
 *
 * V3 يحتفظ بـ FAST_V2 ويضيف Backfill ذكي للبند المتغير فقط.
 * ==========================================================
 */


var OPERATIONS_FAST_V3_CONFIG = Object.freeze({

  GUIDE_STATE_PROPERTY:
    'OPERATIONS_FAST_V3_GUIDE_STATE',

  MAX_ITEMS_PER_RUN:
    20,

  MAX_MESSAGE_PAGES_PER_ITEM:
    5,

  MAX_MESSAGES_PER_PAGE:
    100

});


/* ==========================================================
 * حفظ نسخة FAST_V2 الحالية
 * ==========================================================
 */

var operationsRegisterFastDetailedV2_ =
  operationsRegisterFastDetailed;


/* ==========================================================
 * المحرك FAST_V3
 * ==========================================================
 */

operationsRegisterFastDetailed =
function() {

  var startedAt =
    new Date();


  /*
   * أولًا:
   * تشغيل FAST_V2 كما هو.
   *
   * يعالج:
   * - الرسائل الجديدة.
   * - تغيير Label على رسالة قديمة.
   */
  var result =
    operationsRegisterFastDetailedV2_() ||
    {};


  if (
    result.success === false
  ) {

    return result;

  }


  /*
   * ثانيًا:
   * البحث عن الرسائل القديمة المفقودة
   * للبنود التي تغير إعدادها.
   */
  var backfill =
    operationsFastV3BackfillChangedGuideItems_();


  result.version =
    'FAST_V3';


  result.fastV2Added =
    Number(
      result.added
    ) || 0;


  result.backfilled =
    Number(
      backfill.added
    ) || 0;


  result.added =
    result.fastV2Added +
    result.backfilled;


  result.guideBackfill =
    backfill;


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


  result.completedAt =
    Utilities.formatDate(

      completedAt,

      appTimeZone(),

      'dd/MM/yyyy HH:mm:ss'

    );


  operationsSaveLastResult_(
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

};


/* ==========================================================
 * Backfill البنود التي تغيرت
 * ==========================================================
 */

function operationsFastV3BackfillChangedGuideItems_() {

  gmailLabelSyncEnsureService_();


  var ss =
    appActiveSpreadsheet();


  var guideSheet =
    appSheet(
      ss,
      APP_CONFIG.GUIDE_SHEET
    );


  var operationsSheet =
    appSheet(
      ss,
      APP_CONFIG.OPERATIONS_SHEET
    );


  operationsEnsureHeaders(
    operationsSheet
  );


  /*
   * قراءة البنود النشطة.
   */
  var guideItems =
    operationsReadGuideItems(
      guideSheet,
      true
    );


  /*
   * خريطة Label ID → البند.
   */
  var guideByLabelId =
    operationsFastBuildGuideMap_(
      guideItems
    );


  /*
   * العمليات الموجودة حاليًا.
   */
  var existingRows =
    operationsReadExistingRows(
      operationsSheet
    );


  /*
   * معرفة البنود الموجودة أصلًا في العمليات.
   */
  var existingItems =
    {};


  existingRows.forEach(
    function(info) {

      var itemName =
        operationsNormalizeText_(

          info &&
          info.values

            ? info.values[2]

            : ''

        );


      if (
        itemName
      ) {

        existingItems[
          itemName
        ] =
          true;

      }

    }
  );


  /*
   * حالة دليل البنود في آخر تشغيل.
   */
  var previousState =
    operationsFastV3ReadGuideState_();


  var hasPreviousState =
    Object.keys(
      previousState
    ).length > 0;


  var currentState =
    {};


  var itemsToScan =
    [];


  /*
   * تحديد البنود التي تستحق الفحص.
   */
  guideItems.forEach(
    function(item) {

      if (
        !operationsFastV3IsEligibleItem_(
          item
        )
      ) {

        return;

      }


      var labelId =
        appText(
          item.gmailLabelId
        );


      var signature =
        operationsFastV3GuideSignature_(
          item
        );


      currentState[
        labelId
      ] =
        signature;


      var changed =
        false;


      /*
       * من التشغيل الثاني فصاعدًا:
       * نفحص فقط البند الذي تغيرت إعداداته.
       */
      if (
        hasPreviousState
      ) {

        changed =

          previousState[
            labelId
          ] !==
          signature;

      }


      /*
       * أول تشغيل لـ V3:
       *
       * نفحص البنود المكتملة التي لا يوجد
       * لها أي عملية حتى الآن.
       *
       * هذا يعالج مشكلتك الحالية.
       */
      else {

        var normalizedItem =
          operationsNormalizeText_(
            item.item
          );


        changed =
          !existingItems[
            normalizedItem
          ];

      }


      if (
        changed
      ) {

        itemsToScan.push(
          item
        );

      }

    }
  );


  /*
   * حماية السرعة.
   */
  itemsToScan =
    itemsToScan.slice(

      0,

      OPERATIONS_FAST_V3_CONFIG
        .MAX_ITEMS_PER_RUN

    );


  var addedRecords =
    [];


  var queuedIds =
    {};


  var scannedMessages =
    0;


  var skippedExisting =
    0;


  var ignored =
    0;


  var multiple =
    0;


  var failed =
    0;


  var truncated =
    false;


  /*
   * فحص Gmail للبنود المتغيرة فقط.
   */
  itemsToScan.forEach(
    function(item) {

      var labelId =
        appText(
          item.gmailLabelId
        );


      if (
        !labelId
      ) {

        return;

      }


      var pageToken =
        null;


      var pageCount =
        0;


      do {

        var options = {

          labelIds:
            [
              labelId
            ],

          maxResults:
            OPERATIONS_FAST_V3_CONFIG
              .MAX_MESSAGES_PER_PAGE

        };


        if (
          pageToken
        ) {

          options.pageToken =
            pageToken;

        }


        var response;


        try {

          response =
            Gmail.Users.Messages.list(

              'me',

              options

            ) || {};


        } catch (error) {

          failed++;


          console.warn(

            'تعذر فحص رسائل البند: ' +

            item.item +

            ' - ' +

            operationsErrorMessage_(
              error
            )

          );


          break;

        }


        var messages =
          response.messages ||
          [];


        for (
          var index = 0;
          index < messages.length;
          index++
        ) {

          var messageId =
            appText(

              messages[index] &&
              messages[index].id

            );


          if (
            !messageId
          ) {

            continue;

          }


          scannedMessages++;


          /*
           * موجود أصلًا في العمليات.
           */
          if (
            existingRows.has(
              messageId
            ) ||

            queuedIds[
              messageId
            ]
          ) {

            skippedExisting++;


            continue;

          }


          var apiMessage;


          try {

            apiMessage =
              Gmail.Users.Messages.get(

                'me',

                messageId,

                {
                  format:
                    'minimal'
                }

              );


          } catch (error) {

            failed++;


            continue;

          }


          if (
            !apiMessage
          ) {

            failed++;


            continue;

          }


          var labelIds =
            Array.isArray(
              apiMessage.labelIds
            )

              ? apiMessage.labelIds

              : [];


          /*
           * تجاهل Spam و Trash.
           */
          if (
            labelIds.indexOf(
              'TRASH'
            ) !== -1

            ||

            labelIds.indexOf(
              'SPAM'
            ) !== -1
          ) {

            ignored++;


            continue;

          }


          /*
           * التأكد من وجود بند مالي واحد فقط.
           */
          var matchingItems =
            [];


          labelIds.forEach(
            function(currentLabelId) {

              var guideItem =
                guideByLabelId[
                  appText(
                    currentLabelId
                  )
                ];


              if (
                guideItem
              ) {

                matchingItems.push(
                  guideItem
                );

              }

            }
          );


          matchingItems =
            operationsNormalizeMatchingItems_(
              matchingItems
            );


          if (
            matchingItems.length === 0
          ) {

            ignored++;


            continue;

          }


          if (
            matchingItems.length > 1
          ) {

            multiple++;


            continue;

          }


          var currentGuideItem =
            matchingItems[0];


          var message;


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

            failed++;


            continue;

          }


          var parsed;


          try {

            parsed =
              bankParseMessage(

                gmailPlainBody(
                  message
                ),

                currentGuideItem.item,

                message.getDate(),

                message.getFrom(),

                message.getSubject()

              );


          } catch (error) {

            failed++;


            console.warn(

              'تعذر تحليل رسالة قديمة للبند: ' +

              currentGuideItem.item

            );


            continue;

          }


          var row =
            operationsBuildRow_(

              messageId,

              parsed,

              currentGuideItem,

              matchingItems,

              null

            );


          addedRecords.push({

            date:

              operationsValidDate_(
                row[1]
              )

                ? row[1]

                : new Date(),

            row:
              row

          });


          queuedIds[
            messageId
          ] =
            true;

        }


        pageToken =
          response.nextPageToken ||
          null;


        pageCount++;


      } while (

        pageToken &&

        pageCount <
          OPERATIONS_FAST_V3_CONFIG
            .MAX_MESSAGE_PAGES_PER_ITEM

      );


      /*
       * يوجد صفحات أكثر من الحد.
       */
      if (
        pageToken
      ) {

        truncated =
          true;

      }

    }
  );


  /*
   * كتابة العمليات الجديدة.
   */
  var firstNewRow =
    operationsSheet.getLastRow() +
    1;


  operationsWriteNewRows_(

    operationsSheet,

    addedRecords

  );


  if (
    addedRecords.length > 0
  ) {

    operationsColorStatus(

      operationsSheet,

      firstNewRow,

      addedRecords.length,

      11

    );

  }


  SpreadsheetApp.flush();


  /*
   * نحفظ حالة دليل البنود فقط إذا
   * انتهى الفحص بدون أخطاء أو اقتطاع.
   *
   * حتى يعيد المحاولة في التشغيل التالي
   * إذا حصل خطأ.
   */
  var stateSaved =
    false;


  if (
    failed === 0 &&
    !truncated
  ) {

    operationsFastV3SaveGuideState_(
      currentState
    );


    stateSaved =
      true;

  }


  return {

    success:
      failed === 0,

    version:
      'GUIDE_BACKFILL_V3',

    firstRun:
      !hasPreviousState,

    itemsScanned:
      itemsToScan.length,

    scannedMessages:
      scannedMessages,

    added:
      addedRecords.length,

    skippedExisting:
      skippedExisting,

    ignored:
      ignored,

    multiple:
      multiple,

    failed:
      failed,

    truncated:
      truncated,

    stateSaved:
      stateSaved

  };

}


/* ==========================================================
 * هل البند مناسب للمزامنة؟
 * ==========================================================
 */

function operationsFastV3IsEligibleItem_(
  item
) {

  if (
    !item ||
    !appText(
      item.item
    ) ||
    !appText(
      item.gmailLabelId
    )
  ) {

    return false;

  }


  if (
    !appIsActive(
      item.active
    )
  ) {

    return false;

  }


  var system =
    operationsNormalizeText_(
      item.system
    );


  var movement =
    operationsNormalizeText_(
      item.movementType
    );


  var action =
    operationsNormalizeText_(
      item.automaticAction
    );


  if (
    system ===
      operationsNormalizeText_(
        'غير مالي'
      )

    ||

    movement ===
      operationsNormalizeText_(
        'غير مالي'
      )

    ||

    action ===
      operationsNormalizeText_(
        'تجاهل — غير مالي'
      )
  ) {

    return false;

  }


  /*
   * بالنسبة للمصروف:
   * لا ندخله إلى Backfill إلا بعد اكتمال:
   * الفئة + الفترة + الصنف.
   */
  if (
    movement ===
    operationsNormalizeText_(
      'مصروف'
    )
  ) {

    return Boolean(

      appText(
        item.category
      ) &&

      appText(
        item.period
      ) &&

      appText(
        item.scope
      )

    );

  }


  return true;

}


/* ==========================================================
 * توقيع حالة البند
 * ==========================================================
 */

function operationsFastV3GuideSignature_(
  item
) {

  return [

    appText(
      item.gmailLabelId
    ),

    appText(
      item.item
    ),

    appText(
      item.classification
    ),

    appText(
      item.system
    ),

    appText(
      item.movementType
    ),

    appText(
      item.automaticAction
    ),

    appText(
      item.active
    ),

    appText(
      item.category
    ),

    appText(
      item.period
    ),

    appText(
      item.scope
    )

  ].join(
    '|'
  );

}


/* ==========================================================
 * قراءة حالة دليل البنود
 * ==========================================================
 */

function operationsFastV3ReadGuideState_() {

  var text =
    PropertiesService
      .getScriptProperties()
      .getProperty(

        OPERATIONS_FAST_V3_CONFIG
          .GUIDE_STATE_PROPERTY

      );


  if (
    !text
  ) {

    return {};

  }


  try {

    var parsed =
      JSON.parse(
        text
      );


    return (
      parsed &&
      typeof parsed ===
        'object'
    )

      ? parsed

      : {};


  } catch (error) {

    return {};

  }

}


/* ==========================================================
 * حفظ حالة دليل البنود
 * ==========================================================
 */

function operationsFastV3SaveGuideState_(
  state
) {

  PropertiesService
    .getScriptProperties()
    .setProperty(

      OPERATIONS_FAST_V3_CONFIG
        .GUIDE_STATE_PROPERTY,

      JSON.stringify(
        state || {}
      )

    );

}


/* ==========================================================
 * اختبار V3
 * ==========================================================
 */

function testOperationsFastBackfillV3() {

  var result =
    operationsRegisterFastDetailed();


  console.log(

    JSON.stringify(

      {

        success:
          result.success,

        version:
          result.version,

        mode:
          result.mode,

        added:
          result.added,

        updated:
          result.updated,

        backfilled:
          result.backfilled,

        guideBackfill:
          result.guideBackfill,

        durationSeconds:
          result.durationSeconds

      },


      null,

      2

    )

  );


  return result;

}
/* ==========================================================
 * GUIDE BACKFILL V3.1
 *
 * إصلاح خطأ V3:
 * - لا يعتبر البنود غير المفحوصة أنها فُحصت.
 * - أول تشغيل يفحص حتى 100 بند.
 * - إذا بقيت بنود، يكملها في التشغيل التالي.
 * - يحفظ حالة البند فقط بعد فحصه فعليًا.
 * ==========================================================
 */


var OPERATIONS_FAST_V31_STATE_PROPERTY =
  'OPERATIONS_FAST_V31_GUIDE_STATE';


var OPERATIONS_FAST_V31_MAX_ITEMS_PER_RUN =
  100;


/* ==========================================================
 * استبدال Backfill V3 فقط
 * ==========================================================
 */

operationsFastV3BackfillChangedGuideItems_ =
function() {

  gmailLabelSyncEnsureService_();


  var ss =
    appActiveSpreadsheet();


  var guideSheet =
    appSheet(
      ss,
      APP_CONFIG.GUIDE_SHEET
    );


  var operationsSheet =
    appSheet(
      ss,
      APP_CONFIG.OPERATIONS_SHEET
    );


  operationsEnsureHeaders(
    operationsSheet
  );


  /* ======================================================
     1. دليل البنود
     ====================================================== */

  var guideItems =
    operationsReadGuideItems(
      guideSheet,
      true
    );


  var guideByLabelId =
    operationsFastBuildGuideMap_(
      guideItems
    );


  /* ======================================================
     2. العمليات الموجودة
     ====================================================== */

  var existingRows =
    operationsReadExistingRows(
      operationsSheet
    );


  /* ======================================================
     3. قراءة الحالة السابقة V3.1
     ====================================================== */

  var properties =
    PropertiesService
      .getScriptProperties();


  var previousState =
    {};


  var stateText =
    properties.getProperty(
      OPERATIONS_FAST_V31_STATE_PROPERTY
    );


  if (
    stateText
  ) {

    try {

      previousState =
        JSON.parse(
          stateText
        ) || {};


    } catch (error) {

      previousState =
        {};

    }

  }


  var firstRun =
    Object.keys(
      previousState
    ).length === 0;


  /* ======================================================
     4. معرفة البنود التي تحتاج فحص
     ====================================================== */

  var pendingItems =
    [];


  guideItems.forEach(
    function(item) {

      if (
        !operationsFastV3IsEligibleItem_(
          item
        )
      ) {

        return;

      }


      var labelId =
        appText(
          item.gmailLabelId
        );


      if (
        !labelId
      ) {

        return;

      }


      var signature =
        operationsFastV3GuideSignature_(
          item
        );


      /*
       * إذا لم يسبق فحص البند
       * أو تغيرت بياناته بعد آخر فحص.
       */
      if (
        previousState[
          labelId
        ] !==
        signature
      ) {

        pendingItems.push(
          item
        );

      }

    }
  );


  /*
   * في التشغيل الأول يمكننا فحص حتى 100 بند.
   */
  var itemsToScan =
    pendingItems.slice(

      0,

      OPERATIONS_FAST_V31_MAX_ITEMS_PER_RUN

    );


  /* ======================================================
     5. النتائج
     ====================================================== */

  var addedRecords =
    [];


  var queuedIds =
    {};


  var scannedMessages =
    0;


  var skippedExisting =
    0;


  var ignored =
    0;


  var multiple =
    0;


  var failed =
    0;


  var truncated =
    false;


  var scannedItems =
    [];


  /*
   * نبدأ من الحالة السابقة.
   *
   * المهم:
   * لن نضيف إليها إلا البند الذي فُحص فعلًا.
   */
  var newState =
    {};


  Object.keys(
    previousState
  ).forEach(
    function(key) {

      newState[
        key
      ] =
        previousState[
          key
        ];

    }
  );


  /* ======================================================
     6. فحص Gmail للبنود المطلوبة
     ====================================================== */

  itemsToScan.forEach(
    function(item) {

      var labelId =
        appText(
          item.gmailLabelId
        );


      if (
        !labelId
      ) {

        return;

      }


      var signature =
        operationsFastV3GuideSignature_(
          item
        );


      var itemFailed =
        false;


      var itemTruncated =
        false;


      var itemMessageCount =
        0;


      var pageToken =
        null;


      var pageCount =
        0;


      do {

        var options = {

          labelIds:
            [
              labelId
            ],

          maxResults:
            OPERATIONS_FAST_V3_CONFIG
              .MAX_MESSAGES_PER_PAGE

        };


        if (
          pageToken
        ) {

          options.pageToken =
            pageToken;

        }


        var response;


        try {

          response =
            Gmail.Users.Messages.list(

              'me',

              options

            ) || {};


        } catch (error) {

          itemFailed =
            true;


          failed++;


          console.warn(

            'تعذر فحص البند: ' +

            item.item +

            ' - ' +

            operationsErrorMessage_(
              error
            )

          );


          break;

        }


        var messages =
          response.messages ||
          [];


        itemMessageCount +=
          messages.length;


        for (
          var index = 0;
          index < messages.length;
          index++
        ) {

          var messageId =
            appText(

              messages[index] &&
              messages[index].id

            );


          if (
            !messageId
          ) {

            continue;

          }


          scannedMessages++;


          /*
           * العملية موجودة مسبقًا.
           */
          if (
            existingRows.has(
              messageId
            )

            ||

            queuedIds[
              messageId
            ]
          ) {

            skippedExisting++;


            continue;

          }


          /* ==============================================
             قراءة Labels الحالية للرسالة
             ============================================== */

          var apiMessage;


          try {

            apiMessage =
              Gmail.Users.Messages.get(

                'me',

                messageId,

                {
                  format:
                    'minimal'
                }

              );


          } catch (error) {

            failed++;

            itemFailed =
              true;


            continue;

          }


          if (
            !apiMessage
          ) {

            failed++;

            itemFailed =
              true;


            continue;

          }


          var labelIds =
            Array.isArray(
              apiMessage.labelIds
            )

              ? apiMessage.labelIds

              : [];


          /*
           * تجاهل Spam و Trash.
           */
          if (
            labelIds.indexOf(
              'TRASH'
            ) !== -1

            ||

            labelIds.indexOf(
              'SPAM'
            ) !== -1
          ) {

            ignored++;


            continue;

          }


          /* ==============================================
             التأكد من البند المالي
             ============================================== */

          var matchingItems =
            [];


          labelIds.forEach(
            function(currentLabelId) {

              var guideItem =
                guideByLabelId[
                  appText(
                    currentLabelId
                  )
                ];


              if (
                guideItem
              ) {

                matchingItems.push(
                  guideItem
                );

              }

            }
          );


          matchingItems =
            operationsNormalizeMatchingItems_(
              matchingItems
            );


          if (
            matchingItems.length === 0
          ) {

            ignored++;


            continue;

          }


          if (
            matchingItems.length > 1
          ) {

            multiple++;


            continue;

          }


          var currentGuideItem =
            matchingItems[0];


          /* ==============================================
             قراءة وتحليل الرسالة
             ============================================== */

          var message;


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

            failed++;

            itemFailed =
              true;


            continue;

          }


          var parsed;


          try {

            parsed =
              bankParseMessage(

                gmailPlainBody(
                  message
                ),

                currentGuideItem.item,

                message.getDate(),

                message.getFrom(),

                message.getSubject()

              );


          } catch (error) {

            failed++;

            itemFailed =
              true;


            console.warn(

              'تعذر تحليل رسالة للبند: ' +

              currentGuideItem.item

            );


            continue;

          }


          var row =
            operationsBuildRow_(

              messageId,

              parsed,

              currentGuideItem,

              matchingItems,

              null

            );


          addedRecords.push({

            date:

              operationsValidDate_(
                row[1]
              )

                ? row[1]

                : new Date(),

            row:
              row

          });


          queuedIds[
            messageId
          ] =
            true;

        }


        pageToken =
          response.nextPageToken ||
          null;


        pageCount++;


      } while (

        pageToken &&

        pageCount <
          OPERATIONS_FAST_V3_CONFIG
            .MAX_MESSAGE_PAGES_PER_ITEM

      );


      /*
       * إذا بقيت صفحات،
       * لا نعتبر هذا البند مكتمل الفحص.
       */
      if (
        pageToken
      ) {

        itemTruncated =
          true;


        truncated =
          true;

      }


      scannedItems.push({

        item:
          item.item,

        messages:
          itemMessageCount,

        success:
          !itemFailed &&
          !itemTruncated

      });


      /*
       * أهم إصلاح:
       *
       * نحفظ توقيع هذا البند فقط
       * إذا فُحص كاملًا ونجح.
       */
      if (
        !itemFailed &&
        !itemTruncated
      ) {

        newState[
          labelId
        ] =
          signature;

      }

    }
  );


  /* ======================================================
     7. كتابة العمليات الجديدة
     ====================================================== */

  var firstNewRow =
    operationsSheet.getLastRow() +
    1;


  operationsWriteNewRows_(

    operationsSheet,

    addedRecords

  );


  if (
    addedRecords.length > 0
  ) {

    operationsColorStatus(

      operationsSheet,

      firstNewRow,

      addedRecords.length,

      11

    );

  }


  SpreadsheetApp.flush();


  /* ======================================================
     8. حفظ البنود التي فُحصت فقط
     ====================================================== */

  properties.setProperty(

    OPERATIONS_FAST_V31_STATE_PROPERTY,

    JSON.stringify(
      newState
    )

  );


  /*
   * ما زال هناك بنود لم تصل لها هذه الجولة.
   */
  var remainingItems =
    Math.max(

      0,

      pendingItems.length -
      itemsToScan.length

    );


  var result = {

    success:
      failed === 0,

    version:
      'GUIDE_BACKFILL_V3_1',

    firstRun:
      firstRun,

    pendingItems:
      pendingItems.length,

    itemsScanned:
      itemsToScan.length,

    remainingItems:
      remainingItems,

    scannedItems:
      scannedItems,

    scannedMessages:
      scannedMessages,

    added:
      addedRecords.length,

    skippedExisting:
      skippedExisting,

    ignored:
      ignored,

    multiple:
      multiple,

    failed:
      failed,

    truncated:
      truncated,

    stateSaved:
      true

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
/* ==========================================================
 * OPERATION ACCOUNT DATA V2
 *
 * طبقة آمنة مستقلة عن A:O.
 *
 * P = معرف الحساب
 * Q = مصدر الموازنة
 * R = الرصيد الفعلي
 * S = اتجاه الحساب
 * T = تاريخ الرصيد
 *
 * لا تغير:
 * - تسجيل العمليات A:O
 * - FAST V2
 * - FAST V3
 * - V3.1
 * - حذف العمليات
 * - تعديل البنود
 * - M:N:O
 * ==========================================================
 */


var OPERATIONS_ACCOUNT_V2_START_COLUMN = 16;

var OPERATIONS_ACCOUNT_V2_HEADERS = [
  'معرف الحساب',
  'مصدر الموازنة',
  'الرصيد الفعلي',
  'اتجاه الحساب',
  'تاريخ الرصيد'
];


/* ==========================================================
 * تجهيز الأعمدة P:T
 * ==========================================================
 */

function operationsAccountEnsureColumnsV2_() {

  var ss =
    appActiveSpreadsheet();


  var sheet =
    appSheet(
      ss,
      APP_CONFIG.OPERATIONS_SHEET
    );


  var requiredColumns =
    20;


  if (
    sheet.getMaxColumns() <
    requiredColumns
  ) {

    sheet.insertColumnsAfter(

      sheet.getMaxColumns(),

      requiredColumns -
      sheet.getMaxColumns()

    );

  }


  sheet
    .getRange(
      1,
      OPERATIONS_ACCOUNT_V2_START_COLUMN,
      1,
      OPERATIONS_ACCOUNT_V2_HEADERS.length
    )
    .setValues([
      OPERATIONS_ACCOUNT_V2_HEADERS
    ])
    .setFontWeight(
      'bold'
    )
    .setHorizontalAlignment(
      'center'
    );


  /*
   * عرض الأعمدة.
   */
  sheet.setColumnWidth(
    16,
    150
  );

  sheet.setColumnWidth(
    17,
    160
  );

  sheet.setColumnWidth(
    18,
    130
  );

  sheet.setColumnWidth(
    19,
    120
  );

  sheet.setColumnWidth(
    20,
    180
  );


  /*
   * تنسيق الرصيد.
   */
  if (
    sheet.getLastRow() >= 2
  ) {

    sheet
      .getRange(
        2,
        18,
        sheet.getLastRow() - 1,
        1
      )
      .setNumberFormat(
        '0.000'
      );


    sheet
      .getRange(
        2,
        20,
        sheet.getLastRow() - 1,
        1
      )
      .setNumberFormat(
        'dd/MM/yyyy HH:mm:ss'
      );

  }


  return sheet;

}


/* ==========================================================
 * هل الصف يحتاج بيانات حساب؟
 * ==========================================================
 */

function operationsAccountNeedsSyncV2_(
  row
) {

  row =
    Array.isArray(row)
      ? row
      : [];


  /*
   * P = index 15
   * Q = index 16
   * S = index 18
   *
   * إذا كانت البيانات الأساسية موجودة
   * نعتبر الحساب قد تمت معالجته.
   */
  return !(
    appText(
      row[15]
    )

    ||

    appText(
      row[16]
    )

    ||

    appText(
      row[18]
    )
  );

}


/* ==========================================================
 * قراءة وتحليل حساب عملية واحدة
 * ==========================================================
 */

function operationsAccountParseMessageV2_(
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


  /*
   * البنك معروف،
   * لكن الحساب المحدد غير معروف.
   *
   * مثال:
   * ظفار حاليًا.
   */
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

      Number.isFinite(
        Number(
          parsed.availableBalance
        )
      )

        ? Number(
            parsed.availableBalance
          )

        : null,

    movement:
      appText(
        parsed.accountMovement
      ),

    balanceDate:

      parsed.balanceDate instanceof Date &&
      !isNaN(
        parsed.balanceDate.getTime()
      )

        ? parsed.balanceDate

        : null,

    bank:
      appText(
        parsed.bank
      )

  };

}


/* ==========================================================
 * تحديث آخر العمليات فقط
 *
 * تستخدم بعد أي مزامنة جديدة.
 * لا تلمس A:O.
 * ==========================================================
 */

function operationsSyncRecentAccountDataV2_(
  maximumRows
) {

  var sheet =
    operationsAccountEnsureColumnsV2_();


  var lastRow =
    sheet.getLastRow();


  if (
    lastRow < 2
  ) {

    return {

      success:
        true,

      scanned:
        0,

      updated:
        0,

      unmapped:
        0,

      failed:
        0

    };

  }


  var limit =
    Math.max(

      1,

      Number(
        maximumRows
      ) || 50

    );


  var startRow =
    Math.max(
      2,
      lastRow - limit + 1
    );


  var rowCount =
    lastRow -
    startRow +
    1;


  /*
   * نقرأ A:T.
   */
  var rows =
    sheet
      .getRange(
        startRow,
        1,
        rowCount,
        20
      )
      .getValues();


  var output =
    rows.map(
      function(row) {

        return row.slice(
          15,
          20
        );

      }
    );


  var scanned =
    0;


  var updated =
    0;


  var unmapped =
    0;


  var failed =
    0;


  rows.forEach(
    function(
      row,
      index
    ) {

      if (
        !operationsAccountNeedsSyncV2_(
          row
        )
      ) {

        return;

      }


      var messageId =
        appText(
          row[0]
        );


      var itemName =
        appText(
          row[2]
        );


      if (
        !messageId
      ) {

        return;

      }


      scanned++;


      var result =
        operationsAccountParseMessageV2_(

          messageId,

          itemName

        );


      if (
        !result.success
      ) {

        failed++;

        return;

      }


      if (
        !result.detected
      ) {

        unmapped++;

        return;

      }


      output[index] = [

        result.accountKey,

        result.budgetKey,

        result.availableBalance === null
          ? ''
          : result.availableBalance,

        result.movement,

        result.balanceDate || ''

      ];


      updated++;

    }
  );


  if (
    updated > 0
  ) {

    /*
     * الكتابة فقط P:T.
     *
     * لا يوجد أي تعديل على A:O.
     */
    sheet
      .getRange(
        startRow,
        16,
        rowCount,
        5
      )
      .setValues(
        output
      );


    sheet
      .getRange(
        startRow,
        18,
        rowCount,
        1
      )
      .setNumberFormat(
        '0.000'
      );


    sheet
      .getRange(
        startRow,
        20,
        rowCount,
        1
      )
      .setNumberFormat(
        'dd/MM/yyyy HH:mm:ss'
      );

  }


  SpreadsheetApp.flush();


  return {

    success:
      true,

    rangeStart:
      startRow,

    rangeEnd:
      lastRow,

    scanned:
      scanned,

    updated:
      updated,

    unmapped:
      unmapped,

    failed:
      failed

  };

}


/* ==========================================================
 * Backfill العمليات السابقة
 *
 * آمن:
 * - لا يحذف صفًا.
 * - لا يعدل A:O.
 * - يكتب فقط P:T.
 *
 * يمكن تشغيله أكثر من مرة.
 * ==========================================================
 */

function backfillOperationAccountDataV2() {

  var sheet =
    operationsAccountEnsureColumnsV2_();


  var lastRow =
    sheet.getLastRow();


  if (
    lastRow < 2
  ) {

    return {

      success:
        true,

      processed:
        0,

      updated:
        0,

      unmapped:
        0,

      failed:
        0

    };

  }


  var rowCount =
    lastRow - 1;


  var rows =
    sheet
      .getRange(
        2,
        1,
        rowCount,
        20
      )
      .getValues();


  var output =
    rows.map(
      function(row) {

        return row.slice(
          15,
          20
        );

      }
    );


  /*
   * حماية وقت التنفيذ.
   *
   * 200 تكفي حاليًا غالبًا،
   * وإذا زاد العدد يمكن تشغيل الدالة مرة أخرى.
   */
  var maximum =
    200;


  var processed =
    0;


  var updated =
    0;


  var alreadyFilled =
    0;


  var unmapped =
    0;


  var failed =
    0;


  /*
   * نبدأ من أحدث عملية إلى الأقدم.
   */
  for (
    var index = rows.length - 1;
    index >= 0;
    index--
  ) {

    var row =
      rows[index];


    if (
      !operationsAccountNeedsSyncV2_(
        row
      )
    ) {

      alreadyFilled++;

      continue;

    }


    if (
      processed >=
      maximum
    ) {

      break;

    }


    var messageId =
      appText(
        row[0]
      );


    var itemName =
      appText(
        row[2]
      );


    if (
      !messageId
    ) {

      continue;

    }


    processed++;


    var result =
      operationsAccountParseMessageV2_(

        messageId,

        itemName

      );


    if (
      !result.success
    ) {

      failed++;

      continue;

    }


    if (
      !result.detected
    ) {

      unmapped++;

      continue;

    }


    output[index] = [

      result.accountKey,

      result.budgetKey,

      result.availableBalance === null
        ? ''
        : result.availableBalance,

      result.movement,

      result.balanceDate || ''

    ];


    updated++;

  }


  /*
   * كتابة P:T فقط.
   */
  if (
    updated > 0
  ) {

    sheet
      .getRange(
        2,
        16,
        rowCount,
        5
      )
      .setValues(
        output
      );


    sheet
      .getRange(
        2,
        18,
        rowCount,
        1
      )
      .setNumberFormat(
        '0.000'
      );


    sheet
      .getRange(
        2,
        20,
        rowCount,
        1
      )
      .setNumberFormat(
        'dd/MM/yyyy HH:mm:ss'
      );

  }


  SpreadsheetApp.flush();


  var result = {

    success:
      failed === 0,

    version:
      'OPERATION_ACCOUNT_BACKFILL_V2',

    rows:
      rowCount,

    processed:
      processed,

    updated:
      updated,

    alreadyFilled:
      alreadyFilled,

    unmapped:
      unmapped,

    failed:
      failed,

    note:
      'تم تعديل P:T فقط ولم يتم تعديل A:O.'

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
 * ربط طبقة الحساب مع التسجيل الكامل
 *
 * نحفظ المحرك الحالي كما هو.
 * ==========================================================
 */

var operationsRegisterDetailedBeforeAccountV2_ =
  operationsRegisterDetailed;


operationsRegisterDetailed =
function() {

  var result =
    operationsRegisterDetailedBeforeAccountV2_();


  /*
   * لا نفحص Gmail إضافيًا
   * إذا لم تحدث إضافة أو تحديث.
   */
  if (
    result &&
    (
      Number(
        result.added
      ) > 0

      ||

      Number(
        result.updated
      ) > 0
    )
  ) {

    result.accountSync =
      operationsSyncRecentAccountDataV2_(
        60
      );


    operationsSaveLastResult_(
      result
    );

  }


  return result;

};


/* ==========================================================
 * ربط طبقة الحساب مع FAST V3 الحالي
 *
 * مهم:
 * نحن نحفظ V3 الحالي بكامل V2 + V3 + V3.1.
 * ==========================================================
 */

var operationsRegisterFastDetailedBeforeAccountV2_ =
  operationsRegisterFastDetailed;


operationsRegisterFastDetailed =
function() {

  var result =
    operationsRegisterFastDetailedBeforeAccountV2_();


  if (
    result &&
    (
      Number(
        result.added
      ) > 0

      ||

      Number(
        result.updated
      ) > 0

      ||

      Number(
        result.backfilled
      ) > 0
    )
  ) {

    result.accountSync =
      operationsSyncRecentAccountDataV2_(
        60
      );


    operationsSaveLastResult_(
      result
    );

  }


  return result;

};


/* ==========================================================
 * اختبار آمن
 *
 * لا يكتب بيانات حساب داخل العمليات.
 *
 * فقط:
 * - ينشئ P:T والعناوين.
 * - يقرأ عدة رسائل حديثة.
 * - يعرض Preview.
 * ==========================================================
 */

function testOperationsAccountIntegrationV2() {

  var sheet =
    operationsAccountEnsureColumnsV2_();


  var headers =
    sheet
      .getRange(
        1,
        16,
        1,
        5
      )
      .getDisplayValues()[0];


  var headersOk =
    headers.join('|') ===
    OPERATIONS_ACCOUNT_V2_HEADERS.join('|');


  var lastRow =
    sheet.getLastRow();


  var preview =
    [];


  if (
    lastRow >= 2
  ) {

    var startRow =
      Math.max(
        2,
        lastRow - 9
      );


    var rowCount =
      lastRow -
      startRow +
      1;


    var rows =
      sheet
        .getRange(
          startRow,
          1,
          rowCount,
          3
        )
        .getValues();


    /*
     * من الأحدث للأقدم.
     */
    for (
      var index = rows.length - 1;
      index >= 0;
      index--
    ) {

      if (
        preview.length >= 5
      ) {

        break;

      }


      var messageId =
        appText(
          rows[index][0]
        );


      var itemName =
        appText(
          rows[index][2]
        );


      if (
        !messageId
      ) {

        continue;

      }


      var parsed =
        operationsAccountParseMessageV2_(

          messageId,

          itemName

        );


      preview.push({

        item:
          itemName,

        success:
          parsed.success,

        detected:
          Boolean(
            parsed.detected
          ),

        accountKey:
          parsed.accountKey || '',

        budgetKey:
          parsed.budgetKey || '',

        balance:
          parsed.availableBalance === undefined
            ? null
            : parsed.availableBalance,

        movement:
          parsed.movement || '',

        bank:
          parsed.bank || '',

        reason:
          parsed.reason || ''

      });

    }

  }


  var result = {

    success:
      headersOk,

    version:
      'OPERATION_ACCOUNT_INTEGRATION_V2',

    headersOk:
      headersOk,

    columns:
      headers,

    preview:
      preview,

    safety:
      'لم يتم تعديل أي قيمة في A:O ولم يتم حذف أي عملية.'

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
 * تشخيص العمليات غير المرتبطة بحساب
 * قراءة فقط - لا يغير أي بيانات
 * ==========================================================
 */

function testUnmappedOperationAccountsV2() {

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
      success: true,
      unmapped: 0
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


  var byBank = {};
  var byType = {};
  var byItem = {};

  var samples = [];

  var unmapped = 0;


  rows.forEach(
    function(row) {

      var messageId =
        appText(
          row[0]
        );

      var item =
        appText(
          row[2]
        ) || 'غير محدد';

      var operationType =
        appText(
          row[6]
        ) || 'غير محدد';

      var bank =
        appText(
          row[8]
        ) || 'غير محدد';

      var accountKey =
        appText(
          row[15]
        );

      var budgetKey =
        appText(
          row[16]
        );


      /*
       * العملية مرتبطة أصلًا بحساب.
       */
      if (
        accountKey ||
        budgetKey
      ) {

        return;

      }


      unmapped++;


      byBank[bank] =
        (byBank[bank] || 0) + 1;


      byType[operationType] =
        (byType[operationType] || 0) + 1;


      byItem[item] =
        (byItem[item] || 0) + 1;


      if (
        samples.length < 15
      ) {

        samples.push({

          item:
            item,

          operationType:
            operationType,

          bank:
            bank,

          messageId:
            messageId
              ? messageId.substring(0, 8) + '…'
              : ''

        });

      }

    }
  );


  function sortObject_(object) {

    return Object.keys(object)

      .map(
        function(key) {

          return {
            name: key,
            count: object[key]
          };

        }
      )

      .sort(
        function(first, second) {

          return second.count - first.count;

        }
      );

  }


  var result = {

    success:
      true,

    version:
      'UNMAPPED_ACCOUNT_DIAGNOSTIC_V2',

    totalRows:
      rows.length,

    unmapped:
      unmapped,

    byBank:
      sortObject_(
        byBank
      ),

    byOperationType:
      sortObject_(
        byType
      ),

    topItems:
      sortObject_(
        byItem
      ).slice(
        0,
        20
      ),

    samples:
      samples,

    safety:
      'قراءة فقط - لم يتم تعديل أي خلية.'

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
 * UNMAPPED BANK MESSAGE PATTERN DIAGNOSTIC V3
 *
 * الهدف:
 * معرفة صيغة الحساب في رسائل البنك القديمة
 * بدون عرض الرسالة كاملة.
 *
 * قراءة فقط:
 * - لا يعدل العمليات.
 * - لا يحذف صفوفًا.
 * - لا يغير Gmail.
 * ==========================================================
 */


function testUnmappedBankPatternsV3() {

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
      success: true,
      version: 'UNMAPPED_PATTERN_V3',
      samples: []
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


  /*
   * نرتب المصروف والاسترداد أولًا،
   * ثم التحويل الداخلي.
   */
  var candidates =
    rows
      .filter(
        function(row) {

          var accountKey =
            appText(
              row[15]
            );


          var budgetKey =
            appText(
              row[16]
            );


          return !(
            accountKey ||
            budgetKey
          );

        }
      )
      .sort(
        function(first, second) {

          var firstType =
            appText(
              first[6]
            );


          var secondType =
            appText(
              second[6]
            );


          var firstPriority =
            firstType === 'مصروف'
              ? 1
              : firstType === 'استرداد'
                ? 2
                : 3;


          var secondPriority =
            secondType === 'مصروف'
              ? 1
              : secondType === 'استرداد'
                ? 2
                : 3;


          return (
            firstPriority -
            secondPriority
          );

        }
      );


  var usedMessageIds = {};


  var samples = [];


  var maximum =
    20;


  for (
    var index = 0;
    index < candidates.length;
    index++
  ) {

    if (
      samples.length >=
      maximum
    ) {

      break;

    }


    var row =
      candidates[index];


    var messageId =
      appText(
        row[0]
      );


    if (
      !messageId ||
      usedMessageIds[
        messageId
      ]
    ) {

      continue;

    }


    usedMessageIds[
      messageId
    ] =
      true;


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

      continue;

    }


    var body =
      gmailPlainBody(
        message
      );


    var compact =
      String(
        body || ''
      )

        .replace(
          /\r/g,
          ' '
        )

        .replace(
          /\n+/g,
          ' '
        )

        .replace(
          /\s+/g,
          ' '
        )

        .trim();


    var accountTokens =
      operationsFindAccountTokensV3_(
        compact
      );


    samples.push({

      item:
        appText(
          row[2]
        ),

      operationType:
        appText(
          row[6]
        ),

      bank:
        appText(
          row[8]
        ),

      hasCardOfAccount:
        /\bCard\s+of\s+a\/c\b/i
          .test(
            compact
          ),

      hasAccountWord:
        /\baccount\b/i
          .test(
            compact
          ),

      hasAcctWord:
        /\bAcct\b/i
          .test(
            compact
          ),

      hasAcWord:
        /\ba\/c\b/i
          .test(
            compact
          ),

      credited:
        /\bcredited\b/i
          .test(
            compact
          ),

      debited:
        /\bdebited\b/i
          .test(
            compact
          ),

      usedFor:
        /\bused\s+for\s+OMR\b/i
          .test(
            compact
          ),

      accountTokens:
        accountTokens,

      accountContext:
        operationsExtractAccountContextV3_(
          compact
        ),

      balanceContext:
        operationsExtractBalanceContextV3_(
          compact
        )

    });

  }


  var result = {

    success:
      true,

    version:
      'UNMAPPED_PATTERN_V3',

    totalUnmappedRows:
      candidates.length,

    uniqueSamples:
      samples.length,

    samples:
      samples,

    safety:
      'قراءة فقط. تم إخفاء أرقام الحسابات ولم يتم تعديل أي خلية.'

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
 * البحث عن رقم حساب قريب من كلمات الحساب
 * ==========================================================
 */

function operationsFindAccountTokensV3_(
  text
) {

  var source =
    String(
      text || ''
    );


  var patterns = [

    /Card\s+of\s+a\/c\s+([0-9Xx#*]+)/ig,

    /(?:a\/c|account|acct)\s*(?:no\.?)?\s*[:\-]?\s*([0-9Xx#*]{6,})/ig,

    /(?:from|to)\s+(?:a\/c|account|acct)\s*(?:no\.?)?\s*[:\-]?\s*([0-9Xx#*]{6,})/ig

  ];


  var found = [];


  patterns.forEach(
    function(pattern) {

      var match;


      while (
        (
          match =
            pattern.exec(
              source
            )
        ) !== null
      ) {

        if (
          !match[1]
        ) {

          continue;

        }


        var token =
          String(
            match[1]
          );


        var last4 =
          token.length >= 4
            ? token.slice(
                -4
              )
            : token;


        var record = {

          masked:
            operationsMaskAccountTokenV3_(
              token
            ),

          last4:
            last4

        };


        var duplicate =
          found.some(
            function(existing) {

              return (
                existing.masked ===
                record.masked
              );

            }
          );


        if (
          !duplicate
        ) {

          found.push(
            record
          );

        }

      }

    }
  );


  return found;

}


/* ==========================================================
 * إخفاء رقم الحساب
 * ==========================================================
 */

function operationsMaskAccountTokenV3_(
  value
) {

  var text =
    String(
      value || ''
    );


  if (
    text.length <= 4
  ) {

    return text;

  }


  var first4 =
    text.substring(
      0,
      Math.min(
        4,
        text.length
      )
    );


  var last4 =
    text.substring(
      Math.max(
        0,
        text.length - 4
      )
    );


  return (
    first4 +
    '…' +
    last4
  );

}


/* ==========================================================
 * جزء الرسالة المحيط بالحساب
 * ==========================================================
 */

function operationsExtractAccountContextV3_(
  text
) {

  var source =
    String(
      text || ''
    );


  var match =
    source.match(

      /.{0,45}(?:Card\s+of\s+a\/c|a\/c|account|acct).{0,75}/i

    );


  if (
    !match
  ) {

    return '';

  }


  return operationsMaskSensitiveContextV3_(
    match[0]
  );

}


/* ==========================================================
 * جزء الرسالة المحيط بالرصيد
 * ==========================================================
 */

function operationsExtractBalanceContextV3_(
  text
) {

  var source =
    String(
      text || ''
    );


  var match =
    source.match(

      /.{0,35}(?:Avl\s+Bal|Available\s+Bal(?:ance)?|New\s+Available\s+Balance).{0,45}/i

    );


  if (
    !match
  ) {

    return '';

  }


  return operationsMaskSensitiveContextV3_(
    match[0]
  );

}


/* ==========================================================
 * إخفاء أي تسلسل يشبه رقم حساب
 * داخل النص المختصر
 * ==========================================================
 */

function operationsMaskSensitiveContextV3_(
  value
) {

  return String(
    value || ''
  )

    .replace(
      /[0-9Xx#*]{8,}/g,
      function(token) {

        return operationsMaskAccountTokenV3_(
          token
        );

      }
    )

    .replace(
      /\s+/g,
      ' '
    )

    .trim();

}
function testOneUnmappedRationMessageV4() {

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
      success: false,
      reason: 'no_rows'
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


  var selected =
    null;


  for (
    var index = rows.length - 1;
    index >= 0;
    index--
  ) {

    var row =
      rows[index];

    var item =
      appText(
        row[2]
      );

    var accountKey =
      appText(
        row[15]
      );

    var budgetKey =
      appText(
        row[16]
      );


    if (
      item === 'راشن' &&
      !accountKey &&
      !budgetKey
    ) {

      selected =
        row;

      break;

    }

  }


  if (
    !selected
  ) {

    return {
      success: false,
      reason: 'no_unmapped_ration'
    };

  }


  var messageId =
    appText(
      selected[0]
    );


  var message =
    gmailGetMessage(
      messageId
    );


  if (
    !message
  ) {

    return {
      success: false,
      reason: 'message_not_found'
    };

  }


  var body =
    gmailPlainBody(
      message
    );


  var text =
    String(
      body || ''
    )

      .replace(
        /\r/g,
        ' '
      )

      .replace(
        /\n+/g,
        ' '
      )

      .replace(
        /\s+/g,
        ' '
      )

      .trim();


  /*
   * إخفاء أي رقم طويل مع إبقاء آخر 4 فقط.
   */
  var safeText =
    text.replace(

      /[0-9Xx#*]{8,}/g,

      function(token) {

        var last4 =
          token.slice(
            -4
          );

        return '****…' + last4;

      }

    );


  /*
   * استخراج مقاطع مهمة فقط.
   */
  var contexts = [];


  [
    /Card.{0,100}/ig,
    /Account\s+number.{0,120}/ig,
    /a\/c.{0,100}/ig,
    /0611.{0,100}/ig,
    /Description.{0,120}/ig
  ]
  .forEach(
    function(pattern) {

      var match;


      while (
        (
          match =
            pattern.exec(
              safeText
            )
        ) !== null
      ) {

        contexts.push(
          match[0]
        );

      }

    }
  );


  var result = {

    success:
      true,

    version:
      'UNMAPPED_RATION_V4',

    item:
      appText(
        selected[2]
      ),

    bank:
      appText(
        selected[8]
      ),

    operationType:
      appText(
        selected[6]
      ),

    sender:
      message.getFrom(),

    subject:
      message.getSubject(),

    contexts:
      contexts,

    note:
      'قراءة فقط. الأرقام الطويلة مخفية.'

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
 * REPAIR FALSE ZERO BALANCES V2.1
 *
 * يعالج فقط:
 * R = الرصيد الفعلي
 * T = تاريخ الرصيد
 *
 * لا يعدل:
 * A:Q
 * S
 * البنود
 * نوع العملية
 * الحساب
 * الموازنة
 * ==========================================================
 */

function repairFalseZeroBalancesV21() {

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
      success: true,
      version: 'FALSE_ZERO_BALANCE_REPAIR_V2_1',
      candidates: 0,
      repaired: 0
    };

  }


  var rowCount =
    lastRow - 1;


  var rows =
    sheet
      .getRange(
        2,
        1,
        rowCount,
        20
      )
      .getValues();


  /*
   * نحفظ R و T منفصلين،
   * حتى لا نلمس S أو أي عمود آخر.
   */
  var balances =
    sheet
      .getRange(
        2,
        18,
        rowCount,
        1
      )
      .getValues();


  var balanceDates =
    sheet
      .getRange(
        2,
        20,
        rowCount,
        1
      )
      .getValues();


  var candidates =
    0;


  var cleared =
    0;


  var restored =
    0;


  var unchanged =
    0;


  var failed =
    0;


  var preview =
    [];


  rows.forEach(
    function(
      row,
      index
    ) {

      var messageId =
        appText(
          row[0]
        );


      var operationDate =
        row[1];


      var item =
        appText(
          row[2]
        );


      var accountKey =
        appText(
          row[15]
        );


      var budgetKey =
        appText(
          row[16]
        );


      var currentBalance =
        row[17];


      var currentBalanceDate =
        row[19];


      if (
        !messageId ||
        !accountKey
      ) {

        return;

      }


      var numericBalance =
        Number(
          currentBalance
        );


      var hasBalanceDate = (

        currentBalanceDate instanceof Date

        &&

        !isNaN(
          currentBalanceDate.getTime()
        )

      );


      /*
       * فقط النمط المشبوه:
       * رصيد صفر + لا يوجد تاريخ رصيد.
       */
      if (
        numericBalance !== 0 ||
        hasBalanceDate
      ) {

        return;

      }


      candidates++;


      var parsed;


      try {

        parsed =
          operationsAccountParseMessageV2_(
            messageId,
            item
          );

      }

      catch (error) {

        failed++;


        if (
          preview.length < 15
        ) {

          preview.push({

            row:
              index + 2,

            item:
              item,

            accountKey:
              accountKey,

            budgetKey:
              budgetKey,

            action:
              'failed',

            reason:
              String(
                error &&
                error.message
                  ? error.message
                  : error
              )

          });

        }


        return;

      }


      if (
        !parsed ||
        !parsed.success ||
        !parsed.detected
      ) {

        failed++;


        if (
          preview.length < 15
        ) {

          preview.push({

            row:
              index + 2,

            item:
              item,

            accountKey:
              accountKey,

            budgetKey:
              budgetKey,

            action:
              'failed',

            reason:
              parsed
                ? parsed.reason || 'not_detected'
                : 'empty_result'

          });

        }


        return;

      }


      var rawBalance =
        parsed.availableBalance;


      var hasRealBalance = (

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


      /*
       * لا يوجد رصيد في الرسالة أصلًا:
       * نمسح الصفر الخاطئ من R
       * ونترك T فارغًا.
       */
      if (
        !hasRealBalance
      ) {

        balances[index][0] =
          '';


        balanceDates[index][0] =
          '';


        cleared++;


        if (
          preview.length < 15
        ) {

          preview.push({

            row:
              index + 2,

            item:
              item,

            accountKey:
              accountKey,

            budgetKey:
              budgetKey,

            action:
              'cleared_false_zero'

          });

        }


        return;

      }


      /*
       * الرسالة تحتوي رصيدًا حقيقيًا.
       */
      balances[index][0] =
        Number(
          rawBalance
        );


      var parsedDate =
        parsed.balanceDate;


      if (
        parsedDate instanceof Date &&
        !isNaN(
          parsedDate.getTime()
        )
      ) {

        balanceDates[index][0] =
          parsedDate;

      }

      else if (
        operationDate instanceof Date &&
        !isNaN(
          operationDate.getTime()
        )
      ) {

        /*
         * احتياط:
         * إذا لم يرجع المحلل تاريخ الرصيد،
         * نستخدم تاريخ رسالة العملية.
         */
        balanceDates[index][0] =
          operationDate;

      }

      else {

        balanceDates[index][0] =
          '';

      }


      restored++;


      if (
        preview.length < 15
      ) {

        preview.push({

          row:
            index + 2,

          item:
            item,

          accountKey:
            accountKey,

          budgetKey:
            budgetKey,

          action:
            'restored_real_balance',

          balance:
            Number(
              rawBalance
            )

        });

      }

    }
  );


  /*
   * الكتابة في R فقط.
   */
  sheet
    .getRange(
      2,
      18,
      rowCount,
      1
    )
    .setValues(
      balances
    );


  /*
   * الكتابة في T فقط.
   */
  sheet
    .getRange(
      2,
      20,
      rowCount,
      1
    )
    .setValues(
      balanceDates
    );


  SpreadsheetApp.flush();


  var result = {

    success:
      true,

    version:
      'FALSE_ZERO_BALANCE_REPAIR_V2_1',

    candidates:
      candidates,

    clearedFalseZeros:
      cleared,

    restoredRealBalances:
      restored,

    unchanged:
      unchanged,

    failed:
      failed,

    preview:
      preview,

    safety:
      'تم تعديل العمودين R و T فقط. لم يتم تعديل A:Q أو S.'

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
 * THREE ACCOUNT MERGE V1
 *
 * دمج الحسابات من الآن فصاعدًا فقط.
 *
 * الحسابات الجديدة:
 *
 * AHLI_001
 * - عائلي شهري
 * - عائلي سنوي
 * - شخصي شهري
 * - شخصي سنوي
 *
 * AHLI_002
 * - تامين المصروف
 * - تامين الدخل
 *
 * DHOFAR
 * - الادخار والاستثمار
 *
 * مهم:
 * - لا يعدل A:O.
 * - لا يعدل العمليات القديمة.
 * - لا يشغل Backfill.
 * - يكتب فقط P:T للعمليات الجديدة.
 * ==========================================================
 */


var OPERATIONS_THREE_ACCOUNT_V1 = Object.freeze({

  CUTOVER_PROPERTY:
    'OPERATIONS_THREE_ACCOUNT_CUTOVER_V1'

});


/* ==========================================================
 * تفعيل نظام الحسابات الثلاثة
 *
 * شغّلها مرة واحدة فقط.
 * ==========================================================
 */

function initializeThreeAccountMergeV1() {

  var properties =
    PropertiesService
      .getScriptProperties();


  var existing =
    properties.getProperty(
      OPERATIONS_THREE_ACCOUNT_V1
        .CUTOVER_PROPERTY
    );


  /*
   * لا نغير التاريخ إذا سبق التفعيل.
   */
  if (!existing) {

    existing =
      new Date().toISOString();


    properties.setProperty(

      OPERATIONS_THREE_ACCOUNT_V1
        .CUTOVER_PROPERTY,

      existing

    );

  }


  var result = {

    success:
      true,

    version:
      'THREE_ACCOUNT_MERGE_V1',

    cutover:
      existing,

    accounts: {

      AHLI_001: [
        'عائلي شهري',
        'عائلي سنوي',
        'شخصي شهري',
        'شخصي سنوي'
      ],

      AHLI_002: [
        'تامين المصروف',
        'تامين الدخل'
      ],

      DHOFAR: [
        'الادخار والاستثمار'
      ]

    },

    safety:
      'لم يتم تعديل أي عملية قديمة.'

  };


  console.log(
    JSON.stringify(
      result,
      null,
      2
    )
  );


  appToast(

    'تم تفعيل نظام الحسابات الثلاثة للعمليات الجديدة فقط.',

    'الحسابات',

    7

  );


  return result;

}


/* ==========================================================
 * قراءة تاريخ بدء النظام الجديد
 * ==========================================================
 */

function operationsThreeAccountCutoverDateV1_() {

  var text =
    PropertiesService
      .getScriptProperties()
      .getProperty(

        OPERATIONS_THREE_ACCOUNT_V1
          .CUTOVER_PROPERTY

      );


  if (!text) {

    return null;

  }


  var date =
    new Date(text);


  if (
    isNaN(
      date.getTime()
    )
  ) {

    return null;

  }


  return date;

}


/* ==========================================================
 * توحيد اسم الموازنة
 * ==========================================================
 */

function operationsThreeAccountBudgetV1_(
  value
) {

  var text =
    operationsNormalizeText_(
      value
    );


  var map = {};


  /*
   * العائلي الشهري
   */
  map[
    operationsNormalizeText_(
      'عائلي شهري'
    )
  ] =
    'عائلي شهري';


  map[
    operationsNormalizeText_(
      'العائلي الشهري'
    )
  ] =
    'عائلي شهري';


  /*
   * العائلي السنوي
   */
  map[
    operationsNormalizeText_(
      'عائلي سنوي'
    )
  ] =
    'عائلي سنوي';


  map[
    operationsNormalizeText_(
      'العائلي السنوي'
    )
  ] =
    'عائلي سنوي';


  /*
   * الشخصي الشهري
   */
  map[
    operationsNormalizeText_(
      'شخصي شهري'
    )
  ] =
    'شخصي شهري';


  map[
    operationsNormalizeText_(
      'الشخصي الشهري'
    )
  ] =
    'شخصي شهري';


  /*
   * الشخصي السنوي
   */
  map[
    operationsNormalizeText_(
      'شخصي سنوي'
    )
  ] =
    'شخصي سنوي';


  map[
    operationsNormalizeText_(
      'الشخصي السنوي'
    )
  ] =
    'شخصي سنوي';


  /*
   * تامين المصروف
   */
  map[
    operationsNormalizeText_(
      'تامين المصروف'
    )
  ] =
    'تامين المصروف';


  map[
    operationsNormalizeText_(
      'تأمين المصروف'
    )
  ] =
    'تامين المصروف';


  map[
    operationsNormalizeText_(
      'تامين المصروفات'
    )
  ] =
    'تامين المصروف';


  map[
    operationsNormalizeText_(
      'تأمين المصروفات'
    )
  ] =
    'تامين المصروف';


  /*
   * تامين الدخل
   */
  map[
    operationsNormalizeText_(
      'تامين الدخل'
    )
  ] =
    'تامين الدخل';


  map[
    operationsNormalizeText_(
      'تأمين الدخل'
    )
  ] =
    'تامين الدخل';


  /*
   * الادخار والاستثمار
   */
  map[
    operationsNormalizeText_(
      'الادخار والاستثمار'
    )
  ] =
    'الادخار والاستثمار';


  /*
   * الاسم القديم الموجود في الميزانيات.
   */
  map[
    operationsNormalizeText_(
      'الادخال والاستثمار'
    )
  ] =
    'الادخار والاستثمار';


  map[
    operationsNormalizeText_(
      'الادخار'
    )
  ] =
    'الادخار والاستثمار';


  map[
    operationsNormalizeText_(
      'الاستثمار'
    )
  ] =
    'الادخار والاستثمار';


  return (
    map[text] ||
    ''
  );

}


/* ==========================================================
 * الحساب المتوقع حسب الموازنة
 * ==========================================================
 */

function operationsThreeAccountExpectedV1_(
  budgetName
) {

  var budget =
    operationsThreeAccountBudgetV1_(
      budgetName
    );


  if (
    [
      'عائلي شهري',
      'عائلي سنوي',
      'شخصي شهري',
      'شخصي سنوي'
    ].indexOf(
      budget
    ) >= 0
  ) {

    return 'AHLI_001';

  }


  if (
    [
      'تامين المصروف',
      'تامين الدخل'
    ].indexOf(
      budget
    ) >= 0
  ) {

    return 'AHLI_002';

  }


  if (
    budget ===
    'الادخار والاستثمار'
  ) {

    return 'DHOFAR';

  }


  return '';

}


/* ==========================================================
 * تحديد حساب العملية
 *
 * الأولوية:
 *
 * 1. الحساب الحقيقي الموجود في رسالة البنك.
 * 2. ظفار من اسم البنك عند عدم وجود accountKey.
 *
 * لا نكذب على السجل:
 * إذا البنك قال AHLI_002 يبقى AHLI_002.
 * ==========================================================
 */

function operationsThreeAccountResolveActualV1_(
  parsed,
  budget
) {

  parsed =
    parsed || {};


  var actual =
    appText(
      parsed.accountKey
    )
      .toUpperCase();


  /*
   * الحساب الحقيقي معروف.
   */
  if (actual) {

    return actual;

  }


  var bank =
    operationsNormalizeText_(
      parsed.bank
    );


  var expected =
    operationsThreeAccountExpectedV1_(
      budget
    );


  /*
   * ظفار قد لا يملك accountKey
   * في المحلل الحالي.
   */
  if (
    expected ===
    'DHOFAR'
  ) {

    if (
      bank.indexOf(
        'ظفار'
      ) !== -1

      ||

      bank.indexOf(
        'dhofar'
      ) !== -1
    ) {

      return 'DHOFAR';

    }

  }


  return '';

}


/* ==========================================================
 * هل العملية بعد تاريخ التفعيل؟
 * ==========================================================
 */

function operationsThreeAccountIsNewV1_(
  insertedAt,
  cutoverDate
) {

  if (
    !cutoverDate
  ) {

    return false;

  }


  if (
    !(
      insertedAt instanceof Date
    )

    ||

    isNaN(
      insertedAt.getTime()
    )
  ) {

    return false;

  }


  return (
    insertedAt.getTime() >=
    cutoverDate.getTime()
  );

}


/* ==========================================================
 * حفظ نسخة الدالة السابقة
 * ==========================================================
 */

var operationsSyncRecentAccountDataV2BeforeThreeAccountV1_ =
  operationsSyncRecentAccountDataV2_;


/* ==========================================================
 * استبدال مزامنة P:T للعمليات الجديدة فقط
 * ==========================================================
 */

operationsSyncRecentAccountDataV2_ =
function(
  maximumRows
) {

  var cutoverDate =
    operationsThreeAccountCutoverDateV1_();


  /*
   * لم يتم التفعيل بعد.
   *
   * لا نكتب شيئًا.
   */
  if (!cutoverDate) {

    return {

      success:
        true,

      version:
        'THREE_ACCOUNT_MERGE_V1',

      active:
        false,

      scanned:
        0,

      updated:
        0,

      message:
        'شغّل initializeThreeAccountMergeV1 مرة واحدة.'

    };

  }


  var sheet =
    operationsAccountEnsureColumnsV2_();


  var lastRow =
    sheet.getLastRow();


  if (
    lastRow < 2
  ) {

    return {

      success:
        true,

      version:
        'THREE_ACCOUNT_MERGE_V1',

      active:
        true,

      scanned:
        0,

      updated:
        0

    };

  }


  var limit =
    Math.max(

      1,

      Number(
        maximumRows
      ) || 60

    );


  var startRow =
    Math.max(

      2,

      lastRow -
      limit +
      1

    );


  var rowCount =
    lastRow -
    startRow +
    1;


  /*
   * A:T
   */
  var rows =
    sheet
      .getRange(

        startRow,

        1,

        rowCount,

        20

      )
      .getValues();


  var updates =
    [];


  var scanned =
    0;


  var updated =
    0;


  var skippedOld =
    0;


  var alreadyFilled =
    0;


  var unmapped =
    0;


  var failed =
    0;


  rows.forEach(
    function(
      row,
      index
    ) {

      /*
       * L = تاريخ الإدخال.
       *
       * index 11
       */
      var insertedAt =
        row[11];


      /*
       * أهم حماية:
       *
       * العملية السابقة لتاريخ التفعيل
       * لا يتم لمس P:T فيها.
       */
      if (
        !operationsThreeAccountIsNewV1_(

          insertedAt,

          cutoverDate

        )
      ) {

        skippedOld++;

        return;

      }


      /*
       * إذا كان الحساب قد تم تسجيله مسبقًا،
       * لا نعيد كتابته.
       */
      if (
        !operationsAccountNeedsSyncV2_(
          row
        )
      ) {

        alreadyFilled++;

        return;

      }


      var messageId =
        appText(
          row[0]
        );


      var itemName =
        appText(
          row[2]
        );


      /*
       * D = التصنيف / الموازنة.
       */
      var classification =
        appText(
          row[3]
        );


      if (
        !messageId
      ) {

        return;

      }


      scanned++;


      /*
       * نقرأ الحساب الحقيقي والرصيد
       * من نفس محلل البنك الحالي.
       */
      var parsed =
        operationsAccountParseMessageV2_(

          messageId,

          itemName

        );


      if (
        !parsed ||
        !parsed.success
      ) {

        failed++;

        return;

      }


      /*
       * الموازنة تعتمد على التصنيف
       * وليس الحساب القديم.
       */
      var budget =
        operationsThreeAccountBudgetV1_(
          classification
        );


      /*
       * للأنواع التي ليست موازنة
       * مثل:
       * - إيجار
       * - استرداد
       * - تحويل داخلي
       *
       * نحافظ على نتيجة المحلل القديم.
       */
      if (!budget) {

        budget =
          operationsThreeAccountBudgetV1_(

            parsed.budgetKey

          )

          ||

          appText(
            parsed.budgetKey
          );

      }


      var accountKey =
        operationsThreeAccountResolveActualV1_(

          parsed,

          budget

        );


      /*
       * إذا لم نعرف الحساب الفعلي،
       * لا نخترع حسابًا للأهلي.
       *
       * الاستثناء الوحيد:
       * ظفار عندما يتضح من اسم البنك.
       */
      if (
        !accountKey &&
        !budget
      ) {

        unmapped++;

        return;

      }


      var balance = '';


      if (
        parsed.availableBalance !== null &&
        parsed.availableBalance !== undefined &&
        parsed.availableBalance !== '' &&
        Number.isFinite(
          Number(
            parsed.availableBalance
          )
        )
      ) {

        balance =
          Number(
            parsed.availableBalance
          );

      }


      var movement =
        appText(
          parsed.movement
        );


      var balanceDate = '';


      if (
        parsed.balanceDate instanceof Date &&
        !isNaN(
          parsed.balanceDate.getTime()
        )
      ) {

        balanceDate =
          parsed.balanceDate;

      }


      /*
       * لا نكتب الآن.
       *
       * نجمع الصفوف التي تخص النظام الجديد فقط.
       */
      updates.push({

        rowNumber:
          startRow + index,

        values: [

          accountKey,

          budget,

          balance,

          movement,

          balanceDate

        ]

      });


      updated++;

    }
  );


  /*
   * الكتابة صفًا صفًا فقط للعمليات الجديدة.
   *
   * هذا مقصود حتى لا نعيد كتابة P:T
   * للعمليات التاريخية.
   */
  updates.forEach(
    function(update) {

      sheet
        .getRange(

          update.rowNumber,

          16,

          1,

          5

        )
        .setValues([
          update.values
        ]);

    }
  );


  if (
    updates.length > 0
  ) {

    /*
     * R = الرصيد
     */
    updates.forEach(
      function(update) {

        sheet
          .getRange(
            update.rowNumber,
            18
          )
          .setNumberFormat(
            '0.000'
          );


        /*
         * T = تاريخ الرصيد
         */
        sheet
          .getRange(
            update.rowNumber,
            20
          )
          .setNumberFormat(
            'dd/MM/yyyy HH:mm:ss'
          );

      }
    );

  }


  SpreadsheetApp.flush();


  var result = {

    success:
      failed === 0,

    version:
      'THREE_ACCOUNT_MERGE_V1',

    active:
      true,

    cutover:
      cutoverDate.toISOString(),

    rangeStart:
      startRow,

    rangeEnd:
      lastRow,

    scanned:
      scanned,

    updated:
      updated,

    skippedOld:
      skippedOld,

    alreadyFilled:
      alreadyFilled,

    unmapped:
      unmapped,

    failed:
      failed,

    safety:
      'تم فحص العمليات بعد تاريخ التفعيل فقط، والكتابة في P:T فقط.'

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


/* ==========================================================
 * اختبار النظام بدون تعديل العمليات القديمة
 * ==========================================================
 */

function testThreeAccountMergeV1() {

  var cutover =
    operationsThreeAccountCutoverDateV1_();


  var result = {

    success:
      Boolean(
        cutover
      ),

    version:
      'THREE_ACCOUNT_MERGE_V1',

    active:
      Boolean(
        cutover
      ),

    cutover:
      cutover
        ? cutover.toISOString()
        : '',

    mapping: [

      {
        budget:
          'عائلي شهري',
        account:
          'AHLI_001'
      },

      {
        budget:
          'عائلي سنوي',
        account:
          'AHLI_001'
      },

      {
        budget:
          'شخصي شهري',
        account:
          'AHLI_001'
      },

      {
        budget:
          'شخصي سنوي',
        account:
          'AHLI_001'
      },

      {
        budget:
          'تامين المصروف',
        account:
          'AHLI_002'
      },

      {
        budget:
          'تامين الدخل',
        account:
          'AHLI_002'
      },

      {
        budget:
          'الادخار والاستثمار',
        account:
          'DHOFAR'
      }

    ],

    safety:
      'اختبار قراءة فقط. لم يتم تعديل أي عملية.'

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
 * FINANCIAL GUIDE FILTER V4
 *
 * يمنع البنود غير المالية من دخول ورقة العمليات.
 *
 * لا يغير:
 * - Gmail Labels
 * - دليل البنود
 * - العمليات القديمة
 * ==========================================================
 */

function operationsIsFinancialGuideItemV4_(
  item
) {

  if (!item) {
    return false;
  }


  var system =
    operationsNormalizeText_(
      item.system
    );


  var movement =
    operationsNormalizeText_(
      item.movementType
    );


  var action =
    operationsNormalizeText_(
      item.automaticAction
    );


  /*
   * النظام غير مالي.
   */
  if (
    system ===
    operationsNormalizeText_(
      'غير مالي'
    )
  ) {

    return false;

  }


  /*
   * نوع الحركة غير مالي.
   */
  if (
    movement ===
    operationsNormalizeText_(
      'غير مالي'
    )
  ) {

    return false;

  }


  /*
   * الإجراء = تجاهل غير مالي.
   */
  if (
    action.indexOf(
      operationsNormalizeText_(
        'تجاهل'
      )
    ) !== -1

    &&

    action.indexOf(
      operationsNormalizeText_(
        'غير مالي'
      )
    ) !== -1
  ) {

    return false;

  }


  return true;

}
/* ==========================================================
 * DIAGNOSE REPEATED OPERATION UPDATES V1
 *
 * قراءة فقط.
 * لا يعدل أي خلية.
 * يحدد الحقول التي تجعل العمليات تتحدث كل تشغيل.
 * ==========================================================
 */

function diagnoseRepeated63UpdatesV1() {

  var ss =
    appActiveSpreadsheet();


  var guideSheet =
    appSheet(
      ss,
      APP_CONFIG.GUIDE_SHEET
    );


  var operationsSheet =
    appSheet(
      ss,
      APP_CONFIG.OPERATIONS_SHEET
    );


  var guideItems =
    operationsReadGuideItems(
      guideSheet,
      true
    );


  /*
   * البنود المالية فقط.
   */
  if (
    typeof operationsIsFinancialGuideItemV4_ ===
    'function'
  ) {

    guideItems =
      guideItems.filter(
        operationsIsFinancialGuideItemV4_
      );

  }


  /*
   * خريطة البند.
   */
  var guideMap = {};


  guideItems.forEach(
    function(item) {

      var key =
        operationsNormalizeText_(
          item.item
        );


      if (key) {

        guideMap[key] =
          item;

      }

    }
  );


  var lastRow =
    operationsSheet.getLastRow();


  if (
    lastRow < 2
  ) {

    return {

      success:
        true,

      scanned:
        0,

      differences:
        0

    };

  }


  /*
   * نقرأ A:O فقط.
   */
  var rows =
    operationsSheet
      .getRange(
        2,
        1,
        lastRow - 1,
        15
      )
      .getValues();


  var fields = {

    2:
      'البند',

    3:
      'التصنيف',

    6:
      'نوع العملية',

    9:
      'النظام',

    10:
      'حالة التسجيل',

    12:
      'الفئة',

    13:
      'الفترة',

    14:
      'الصنف'

  };


  var scanned =
    0;


  var matched =
    0;


  var failed =
    0;


  var differences =
    0;


  var byField = {};


  var samples = [];


  /*
   * حماية من طول التنفيذ.
   */
  var maximumScanned =
    100;


  var maximumSamples =
    20;


  for (
    var index = rows.length - 1;
    index >= 0;
    index--
  ) {

    if (
      scanned >=
      maximumScanned
    ) {

      break;

    }


    var oldRow =
      rows[index];


    var messageId =
      appText(
        oldRow[0]
      );


    var itemName =
      appText(
        oldRow[2]
      );


    var guideItem =
      guideMap[
        operationsNormalizeText_(
          itemName
        )
      ];


    if (
      !messageId ||
      !guideItem
    ) {

      continue;

    }


    scanned++;


    var message =
      null;


    try {

      message =
        gmailGetMessage(
          messageId
        );

    } catch (error) {

      failed++;

      continue;

    }


    if (!message) {

      failed++;

      continue;

    }


    var parsed =
      null;


    try {

      parsed =
        bankParseMessage(

          gmailPlainBody(
            message
          ),

          guideItem.item,

          message.getDate(),

          message.getFrom(),

          message.getSubject()

        );

    } catch (error) {

      failed++;

      continue;

    }


    /*
     * هذا هو الصف الذي سيحاول
     * operationsRegisterDetailed كتابته
     * في التشغيل القادم.
     *
     * لا تتم كتابته فعليًا.
     */
    var expectedRow =
      operationsBuildRow_(

        messageId,

        parsed,

        guideItem,

        [
          guideItem
        ],

        oldRow

      );


    var rowDifferences =
      [];


    Object.keys(
      fields
    )
      .forEach(
        function(indexText) {

          var columnIndex =
            Number(
              indexText
            );


          var currentValue =
            appText(
              oldRow[
                columnIndex
              ]
            );


          var expectedValue =
            appText(
              expectedRow[
                columnIndex
              ]
            );


          if (
            currentValue !==
            expectedValue
          ) {

            var fieldName =
              fields[
                columnIndex
              ];


            byField[
              fieldName
            ] =
              (
                byField[
                  fieldName
                ] || 0
              ) + 1;


            rowDifferences.push({

              field:
                fieldName,

              current:
                currentValue,

              expected:
                expectedValue

            });

          }

        }
      );


    if (
      rowDifferences.length > 0
    ) {

      differences++;

      matched++;


      if (
        samples.length <
        maximumSamples
      ) {

        samples.push({

          row:
            index + 2,

          item:
            itemName,

          differences:
            rowDifferences

        });

      }

    }

  }


  var result = {

    success:
      true,

    version:
      'REPEATED_UPDATE_DIAGNOSTIC_V1',

    scanned:
      scanned,

    rowsWithDifferences:
      differences,

    byField:
      byField,

    failed:
      failed,

    samples:
      samples,

    safety:
      'قراءة فقط - لم يتم تعديل أي خلية.'

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

