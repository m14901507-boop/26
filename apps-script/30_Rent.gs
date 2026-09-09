/**
 * ==========================================================
 * 30_Rent.gs
 *
 * نظام الإيجارات والمستأجرين الموحد
 * ==========================================================
 *
 * تم دمج:
 * - 05_TenantLedger.gs.gs
 * - 06_RentSummary.gs.gs
 *
 * الوظائف:
 * - بناء سجل المستأجرين
 * - ربط الإيجار والخدمات بالمستأجر
 * - حساب الدفعات الجزئية والكاملة
 * - إنشاء ملخص الإيجارات الشهري
 * - حساب المتبقي والمتأخر والخدمات
 * - تلوين حالات السداد
 *
 * تم الحفاظ على جميع أسماء Functions القديمة.
 * ==========================================================
 */


/* ==========================================================
 * سجل المستأجرين
 * ==========================================================
 */


/**
 * إعادة بناء سجل المستأجرين.
 */
function tenantLedgerRebuild() {

  var ss =
    appActiveSpreadsheet();


  var tenantsSheet =
    appSheet(
      ss,
      APP_CONFIG.TENANTS_SHEET
    );


  var operationsSheet =
    appSheet(
      ss,
      APP_CONFIG.OPERATIONS_SHEET
    );


  var timezone =
    appTimeZone(
      ss
    );


  var rebuiltAt =
    new Date();


  var tenantLastRow =
    tenantsSheet.getLastRow();


  if (
    tenantLastRow < 2
  ) {

    throw new Error(
      'ورقة المستأجرون لا تحتوي على بيانات.'
    );

  }


  /**
   * قراءة المستأجرين مرة واحدة.
   */
  var tenantValues =
    tenantsSheet
      .getRange(
        2,
        1,
        tenantLastRow - 1,
        10
      )
      .getValues();


  /**
   * خريطة:
   *
   * بند Gmail
   * ↓
   * بيانات المستأجر
   */
  var itemMap =
    new Map();


  tenantValues.forEach(
    function(
      row,
      index
    ) {

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


      var monthlyRent =
        appNumber(
          row[4]
        );


      var email =
        appText(
          row[5]
        );


      var dueDay =
        appText(
          row[6]
        );


      var waterMeter =
        appText(
          row[7]
        );


      var electricityMeter =
        appText(
          row[8]
        );


      var contractStatus =
        appText(
          row[9]
        );


      if (
        !tenantName
      ) {

        return;

      }


      var commonData = {

        tenantName:
          tenantName,

        unit:
          unit,

        monthlyRent:
          monthlyRent,

        email:
          email,

        dueDay:
          dueDay,

        waterMeter:
          waterMeter,

        electricityMeter:
          electricityMeter,

        contractStatus:
          contractStatus,

        tenantSheetRow:
          index + 2

      };


      /**
       * بند الإيجار.
       */
      if (
        rentItem
      ) {

        tenantLedgerAddMapping(

          itemMap,

          rentItem,

          {

            tenantName:
              commonData.tenantName,

            unit:
              commonData.unit,

            monthlyRent:
              commonData.monthlyRent,

            email:
              commonData.email,

            dueDay:
              commonData.dueDay,

            waterMeter:
              commonData.waterMeter,

            electricityMeter:
              commonData.electricityMeter,

            contractStatus:
              commonData.contractStatus,

            tenantSheetRow:
              commonData.tenantSheetRow,

            paymentType:
              'إيجار',

            item:
              rentItem

          }

        );

      }


      /**
       * بند الخدمات.
       */
      if (
        utilitiesItem
      ) {

        tenantLedgerAddMapping(

          itemMap,

          utilitiesItem,

          {

            tenantName:
              commonData.tenantName,

            unit:
              commonData.unit,

            monthlyRent:
              commonData.monthlyRent,

            email:
              commonData.email,

            dueDay:
              commonData.dueDay,

            waterMeter:
              commonData.waterMeter,

            electricityMeter:
              commonData.electricityMeter,

            contractStatus:
              commonData.contractStatus,

            tenantSheetRow:
              commonData.tenantSheetRow,

            paymentType:
              'خدمات',

            item:
              utilitiesItem

          }

        );

      }

    }
  );


  if (
    itemMap.size === 0
  ) {

    throw new Error(
      'لم يتم العثور على بنود إيجار أو خدمات في ورقة المستأجرون.'
    );

  }


  var ledgerRows =
    [];


  var rentCount =
    0;


  var utilitiesCount =
    0;


  var operationsLastRow =
    operationsSheet.getLastRow();


  /**
   * قراءة العمليات مرة واحدة.
   *
   * نحتاج A:L فقط.
   */
  if (
    operationsLastRow >= 2
  ) {

    var operationsValues =
      operationsSheet
        .getRange(

          2,

          1,

          operationsLastRow - 1,

          12

        )
        .getValues();


    operationsValues.forEach(
      function(row) {

        var messageId =
          appText(
            row[0]
          );


        var operationDate =
          appDate(
            row[1]
          );


        var item =
          appText(
            row[2]
          );


        var amount =
          appNumber(
            row[4]
          );


        var channel =
          appText(
            row[7]
          );


        var bank =
          appText(
            row[8]
          );


        var originalStatus =
          appText(
            row[10]
          );


        if (
          !messageId ||
          !item
        ) {

          return;

        }


        var tenantData =
          itemMap.get(
            appKey(
              item
            )
          );


        if (
          !tenantData
        ) {

          return;

        }


        var monthLabel =
          operationDate

            ? Utilities.formatDate(

                operationDate,

                timezone,

                'MM/yyyy'

              )

            : '';


        var paymentStatus =
          tenantLedgerPaymentStatus(

            tenantData.paymentType,

            amount,

            tenantData.monthlyRent

          );


        if (
          tenantData.paymentType ===
          'إيجار'
        ) {

          rentCount++;

        }


        else if (
          tenantData.paymentType ===
          'خدمات'
        ) {

          utilitiesCount++;

        }


        ledgerRows.push({

          sortDate:
            operationDate ||
            new Date(0),

          row: [

            messageId,

            operationDate || '',

            tenantData.tenantName,

            tenantData.unit,

            tenantData.email,

            tenantData.paymentType,

            item,

            Number.isFinite(
              amount
            )
              ? amount
              : '',

            monthLabel,

            Number.isFinite(
              tenantData.monthlyRent
            )
              ? tenantData.monthlyRent
              : '',

            tenantData.dueDay,

            tenantData.contractStatus,

            paymentStatus,

            bank,

            channel,

            originalStatus,

            rebuiltAt

          ]

        });

      }
    );

  }


  /**
   * ترتيب حسب التاريخ.
   */
  ledgerRows.sort(
    function(
      first,
      second
    ) {

      return (

        first.sortDate.getTime() -

        second.sortDate.getTime()

      );

    }
  );


  /**
   * إنشاء / إعادة بناء ورقة السجل.
   */
  var ledgerSheet =
    ss.getSheetByName(
      APP_CONFIG.TENANT_LEDGER_SHEET
    );


  if (
    !ledgerSheet
  ) {

    ledgerSheet =
      ss.insertSheet(
        APP_CONFIG.TENANT_LEDGER_SHEET
      );

  }


  else {

    var filter =
      ledgerSheet.getFilter();


    if (
      filter
    ) {

      filter.remove();

    }


    ledgerSheet.clear();

  }


  /**
   * العناوين.
   */
  ledgerSheet
    .getRange(

      1,

      1,

      1,

      TENANT_LEDGER_HEADERS.length

    )
    .setValues([
      Array.from(
        TENANT_LEDGER_HEADERS
      )
    ])
    .setFontWeight(
      'bold'
    )
    .setHorizontalAlignment(
      'center'
    );


  /**
   * كتابة السجل دفعة واحدة.
   */
  if (
    ledgerRows.length > 0
  ) {

    var outputRows =
      ledgerRows.map(
        function(record) {

          return record.row;

        }
      );


    ledgerSheet
      .getRange(

        2,

        1,

        outputRows.length,

        TENANT_LEDGER_HEADERS.length

      )
      .setValues(
        outputRows
      );


    /**
     * تاريخ السداد.
     */
    ledgerSheet
      .getRange(
        2,
        2,
        outputRows.length,
        1
      )
      .setNumberFormat(
        'dd/MM/yyyy HH:mm:ss'
      );


    /**
     * المبلغ.
     */
    ledgerSheet
      .getRange(
        2,
        8,
        outputRows.length,
        1
      )
      .setNumberFormat(
        '0.000'
      );


    /**
     * قيمة الإيجار.
     */
    ledgerSheet
      .getRange(
        2,
        10,
        outputRows.length,
        1
      )
      .setNumberFormat(
        '0.000'
      );


    /**
     * تاريخ التحديث.
     */
    ledgerSheet
      .getRange(
        2,
        17,
        outputRows.length,
        1
      )
      .setNumberFormat(
        'dd/MM/yyyy HH:mm:ss'
      );


    tenantLedgerColorStatuses(

      ledgerSheet,

      outputRows.length

    );

  }


  tenantLedgerFormat(
    ledgerSheet
  );


  SpreadsheetApp.flush();


  appToast(

    'تم إنشاء سجل المستأجرين: ' +
      rentCount +
      ' دفعات إيجار و' +
      utilitiesCount +
      ' دفعات خدمات.',

    'سجل المستأجرين',

    10

  );


  return ledgerRows.length;

}


/**
 * إضافة بند إلى خريطة المستأجرين.
 */
function tenantLedgerAddMapping(

  itemMap,

  item,

  tenantData

) {

  var key =
    appKey(
      item
    );


  if (
    !key
  ) {

    return;

  }


  if (
    itemMap.has(
      key
    )
  ) {

    var existing =
      itemMap.get(
        key
      );


    throw new Error(

      'البند "' +
      item +
      '" مستخدم لأكثر من مستأجر: ' +
      existing.tenantName +
      ' و' +
      tenantData.tenantName

    );

  }


  itemMap.set(
    key,
    tenantData
  );

}


/**
 * تحديد حالة الدفعة.
 */
function tenantLedgerPaymentStatus(

  paymentType,

  amount,

  monthlyRent

) {

  if (
    !Number.isFinite(
      amount
    )
  ) {

    return (
      'يحتاج مراجعة — المبلغ غير واضح'
    );

  }


  if (
    paymentType ===
    'خدمات'
  ) {

    return 'خدمات مسجلة';

  }


  if (
    !Number.isFinite(
      monthlyRent
    ) ||
    monthlyRent <= 0
  ) {

    return (
      'يحتاج مراجعة — قيمة الإيجار غير محددة'
    );

  }


  var tolerance =
    0.0005;


  var difference =
    amount -
    monthlyRent;


  if (
    Math.abs(
      difference
    ) <
    tolerance
  ) {

    return 'إيجار شهر كامل';

  }


  if (
    amount <
    monthlyRent
  ) {

    var remaining =
      monthlyRent -
      amount;


    return (

      'دفعة جزئية — المتبقي ' +

      remaining.toFixed(
        3
      ) +

      ' ر.ع'

    );

  }


  var numberOfMonths =
    amount /
    monthlyRent;


  var roundedMonths =
    Math.round(
      numberOfMonths
    );


  if (
    roundedMonths >= 2 &&

    Math.abs(

      numberOfMonths -
      roundedMonths

    ) <
    tolerance
  ) {

    return (

      'إيجار ' +

      roundedMonths +

      ' أشهر'

    );

  }


  return (
    'دفعة أعلى من الإيجار — تحتاج مراجعة'
  );

}


/**
 * تلوين حالات الدفعات.
 */
function tenantLedgerColorStatuses(

  sheet,

  numberOfRows

) {

  if (
    numberOfRows <= 0
  ) {

    return;

  }


  var range =
    sheet.getRange(

      2,

      13,

      numberOfRows,

      1

    );


  var statuses =
    range.getDisplayValues();


  var colors =
    statuses.map(
      function(row) {

        var status =
          appText(
            row[0]
          );


        if (
          status.includes(
            'يحتاج مراجعة'
          ) ||

          status.includes(
            'تحتاج مراجعة'
          )
        ) {

          return [
            '#fce5cd'
          ];

        }


        if (
          status.includes(
            'دفعة جزئية'
          )
        ) {

          return [
            '#fff2cc'
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

}


/**
 * تنسيق سجل المستأجرين.
 */
function tenantLedgerFormat(
  sheet
) {

  sheet.setRightToLeft(
    true
  );


  sheet.setFrozenRows(
    1
  );


  var widths = [

    190,
    180,
    170,
    130,
    230,
    110,
    190,
    100,
    110,
    140,
    110,
    120,
    260,
    150,
    180,
    300,
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

}


/* ==========================================================
 * ملخص الإيجارات
 * ==========================================================
 */


/**
 * إعادة بناء ملخص الإيجارات.
 */
function rentSummaryRebuild() {

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


  var timezone =
    appTimeZone(
      ss
    );


  var today =
    new Date();


  var currentMonth =
    Utilities.formatDate(

      today,

      timezone,

      'MM/yyyy'

    );


  var currentDay =
    Number(

      Utilities.formatDate(

        today,

        timezone,

        'd'

      )

    );


  /**
   * قراءة المستأجرين.
   */
  var tenantData =
    rentSummaryReadTenants(
      tenantsSheet
    );


  if (
    tenantData.tenants.length === 0
  ) {

    throw new Error(
      'لا توجد بيانات مستأجرين.'
    );

  }


  /**
   * قراءة دفعات الشهر.
   */
  var monthlyLedger =
    rentSummaryReadLedger(

      ledgerSheet,

      tenantData.itemMap,

      currentMonth,

      timezone

    );


  var records =
    [];


  tenantData.tenants.forEach(
    function(tenant) {

      var ledger =
        monthlyLedger.get(
          tenant.key
        ) || {

          rentPayments:
            [],

          utilitiesTotal:
            0

        };


      ledger.rentPayments.sort(
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


      var rentPaid =
        0;


      var completionDate =
        null;


      /**
       * جمع دفعات الإيجار.
       */
      ledger.rentPayments.forEach(
        function(payment) {

          rentPaid +=
            payment.amount;


          if (
            !completionDate &&

            Number.isFinite(
              tenant.monthlyRent
            ) &&

            tenant.monthlyRent > 0 &&

            rentPaid >=
            tenant.monthlyRent -
            0.0005
          ) {

            completionDate =
              payment.date;

          }

        }
      );


      var monthlyRent =
        Number.isFinite(
          tenant.monthlyRent
        )

          ? tenant.monthlyRent

          : 0;


      var remaining =
        Math.max(

          monthlyRent -
          rentPaid,

          0

        );


      var excess =
        Math.max(

          rentPaid -
          monthlyRent,

          0

        );


      var status =
        rentSummaryStatus(

          monthlyRent,

          rentPaid,

          completionDate,

          currentDay,

          tenant.dueDay,

          APP_CONFIG.GRACE_END_DAY,

          timezone

        );


      records.push({

        tenant:
          tenant,

        rentPaid:
          rentPaid,

        remaining:
          remaining,

        excess:
          excess,

        utilitiesTotal:
          ledger.utilitiesTotal,

        completionDate:
          completionDate,

        status:
          status

      });

    }
  );


  /**
   * ترتيب حسب الوحدة ثم الاسم.
   */
  records.sort(
    function(
      first,
      second
    ) {

      var firstUnit =
        Number(
          first.tenant.unit
        );


      var secondUnit =
        Number(
          second.tenant.unit
        );


      if (
        Number.isFinite(
          firstUnit
        ) &&

        Number.isFinite(
          secondUnit
        )
      ) {

        return (
          firstUnit -
          secondUnit
        );

      }


      return String(
        first.tenant.tenantName
      ).localeCompare(

        String(
          second.tenant.tenantName
        )

      );

    }
  );


  /**
   * صفوف الملخص.
   */
  var rows =
    records.map(
      function(record) {

        return [

          currentMonth,

          record.tenant.tenantName,

          record.tenant.unit,

          record.tenant.rentItem,

          record.tenant.monthlyRent,

          record.rentPaid,

          record.remaining,

          record.excess,

          record.utilitiesTotal,

          record.completionDate || '',

          record.tenant.dueDay,

          APP_CONFIG.GRACE_END_DAY,

          record.status,

          record.tenant.email,

          record.tenant.contractStatus

        ];

      }
    );


  /**
   * المؤشرات.
   */
  var totalRequired =
    0;


  var totalPaid =
    0;


  var totalRemaining =
    0;


  var totalUtilities =
    0;


  var paidCount =
    0;


  var lateCount =
    0;


  var partialCount =
    0;


  var graceCount =
    0;


  records.forEach(
    function(record) {

      if (
        Number.isFinite(
          record.tenant.monthlyRent
        )
      ) {

        totalRequired +=
          record.tenant.monthlyRent;

      }


      totalPaid +=
        record.rentPaid;


      totalRemaining +=
        record.remaining;


      totalUtilities +=
        record.utilitiesTotal;


      if (
        record.status.startsWith(
          'مدفوع'
        ) &&

        !record.status.includes(
          'جزئي'
        )
      ) {

        paidCount++;

      }


      if (
        record.status.includes(
          'متأخر'
        )
      ) {

        lateCount++;

      }


      if (
        record.status.includes(
          'جزئي'
        )
      ) {

        partialCount++;

      }


      if (
        record.status ===
        'ضمن مهلة السداد'
      ) {

        graceCount++;

      }

    }
  );


  /**
   * إنشاء / إعادة بناء الملخص.
   */
  var summarySheet =
    ss.getSheetByName(
      APP_CONFIG.RENT_SUMMARY_SHEET
    );


  if (
    !summarySheet
  ) {

    summarySheet =
      ss.insertSheet(
        APP_CONFIG.RENT_SUMMARY_SHEET
      );

  }


  var filter =
    summarySheet.getFilter();


  if (
    filter
  ) {

    filter.remove();

  }


  /**
   * فك أي دمج سابق.
   */
  try {

    summarySheet
      .getRange(

        1,

        1,

        1,

        RENT_SUMMARY_HEADERS.length

      )
      .breakApart();


  } catch (error) {

    console.log(
      'تم تجاوز فك دمج عنوان ملخص الإيجارات.'
    );

  }


  summarySheet.clear();


  summarySheet.setRightToLeft(
    true
  );


  /**
   * عنوان الملخص.
   */
  summarySheet
    .getRange(

      1,

      1,

      1,

      RENT_SUMMARY_HEADERS.length

    )
    .merge()
    .setValue(

      'ملخص الإيجارات — ' +
      currentMonth

    )
    .setFontWeight(
      'bold'
    )
    .setFontSize(
      14
    )
    .setHorizontalAlignment(
      'center'
    );


  /**
   * المؤشرات.
   */
  rentSummaryWriteIndicators(

    summarySheet,

    {

      totalRequired:
        totalRequired,

      totalPaid:
        totalPaid,

      totalRemaining:
        totalRemaining,

      totalUtilities:
        totalUtilities,

      paidCount:
        paidCount,

      lateCount:
        lateCount,

      partialCount:
        partialCount,

      graceCount:
        graceCount,

      currentMonth:
        currentMonth,

      currentDay:
        currentDay

    }

  );


  var headerRow =
    5;


  var firstDataRow =
    6;


  /**
   * عناوين الجدول.
   */
  summarySheet
    .getRange(

      headerRow,

      1,

      1,

      RENT_SUMMARY_HEADERS.length

    )
    .setValues([
      Array.from(
        RENT_SUMMARY_HEADERS
      )
    ])
    .setFontWeight(
      'bold'
    )
    .setHorizontalAlignment(
      'center'
    );


  /**
   * البيانات.
   */
  if (
    rows.length > 0
  ) {

    summarySheet
      .getRange(

        firstDataRow,

        1,

        rows.length,

        RENT_SUMMARY_HEADERS.length

      )
      .setValues(
        rows
      );


    /**
     * E:I
     */
    summarySheet
      .getRange(

        firstDataRow,

        5,

        rows.length,

        5

      )
      .setNumberFormat(
        '0.000'
      );


    /**
     * تاريخ اكتمال السداد.
     */
    summarySheet
      .getRange(

        firstDataRow,

        10,

        rows.length,

        1

      )
      .setNumberFormat(
        'dd/MM/yyyy HH:mm:ss'
      );


    rentSummaryColor(

      summarySheet,

      firstDataRow,

      rows.length

    );


    summarySheet
      .getRange(

        headerRow,

        1,

        rows.length + 1,

        RENT_SUMMARY_HEADERS.length

      )
      .createFilter();

  }


  rentSummaryFormat(

    summarySheet,

    headerRow

  );


  SpreadsheetApp.flush();


  appToast(

    'تم إنشاء ملخص الإيجارات لشهر ' +
      currentMonth +
      '. المتأخرون: ' +
      lateCount,

    'ملخص الإيجارات',

    10

  );


  return rows.length;

}


/* ==========================================================
 * قراءة المستأجرين للملخص
 * ==========================================================
 */

function rentSummaryReadTenants(
  sheet
) {

  var lastRow =
    sheet.getLastRow();


  if (
    lastRow < 2
  ) {

    return {

      tenants:
        [],

      itemMap:
        new Map()

    };

  }


  var values =
    sheet
      .getRange(

        2,

        1,

        lastRow - 1,

        10

      )
      .getValues();


  var tenants =
    [];


  var itemMap =
    new Map();


  values.forEach(
    function(
      row,
      index
    ) {

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


      var monthlyRent =
        appNumber(
          row[4]
        );


      var email =
        appText(
          row[5]
        );


      var dueDayValue =
        appNumber(
          row[6]
        );


      var contractStatus =
        appText(
          row[9]
        );


      if (
        !tenantName
      ) {

        return;

      }


      var dueDay =

        Number.isFinite(
          dueDayValue
        ) &&

        dueDayValue >= 1 &&

        dueDayValue <= 28

          ? Math.floor(
              dueDayValue
            )

          : 1;


      var key =
        appKey(

          tenantName +
          '|' +
          unit +
          '|' +
          rentItem

        );


      var tenant = {

        key:
          key,

        rentItem:
          rentItem,

        utilitiesItem:
          utilitiesItem,

        tenantName:
          tenantName,

        unit:
          unit,

        monthlyRent:
          monthlyRent,

        email:
          email,

        dueDay:
          dueDay,

        contractStatus:
          contractStatus,

        sheetRow:
          index + 2

      };


      tenants.push(
        tenant
      );


      /**
       * بند الإيجار.
       */
      if (
        rentItem
      ) {

        var rentKey =
          appKey(
            rentItem
          );


        if (
          itemMap.has(
            rentKey
          )
        ) {

          throw new Error(

            'بند الإيجار مكرر: ' +

            rentItem

          );

        }


        itemMap.set(

          rentKey,

          {

            tenantKey:
              key,

            paymentType:
              'إيجار'

          }

        );

      }


      /**
       * بند الخدمات.
       */
      if (
        utilitiesItem
      ) {

        var utilitiesKey =
          appKey(
            utilitiesItem
          );


        if (
          itemMap.has(
            utilitiesKey
          )
        ) {

          throw new Error(

            'بند الخدمات مكرر: ' +

            utilitiesItem

          );

        }


        itemMap.set(

          utilitiesKey,

          {

            tenantKey:
              key,

            paymentType:
              'خدمات'

          }

        );

      }

    }
  );


  return {

    tenants:
      tenants,

    itemMap:
      itemMap

  };

}


/* ==========================================================
 * قراءة سجل دفعات الشهر
 * ==========================================================
 */

function rentSummaryReadLedger(

  sheet,

  itemMap,

  currentMonth,

  timezone

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

        17

      )
      .getValues();


  values.forEach(
    function(row) {

      var paymentDate =
        appDate(
          row[1]
        );


      var item =
        appText(
          row[6]
        );


      var amount =
        appNumber(
          row[7]
        );


      if (
        !paymentDate ||
        !item ||
        !Number.isFinite(
          amount
        )
      ) {

        return;

      }


      var paymentMonth =
        Utilities.formatDate(

          paymentDate,

          timezone,

          'MM/yyyy'

        );


      if (
        paymentMonth !==
        currentMonth
      ) {

        return;

      }


      var mapping =
        itemMap.get(
          appKey(
            item
          )
        );


      if (
        !mapping
      ) {

        return;

      }


      if (
        !result.has(
          mapping.tenantKey
        )
      ) {

        result.set(

          mapping.tenantKey,

          {

            rentPayments:
              [],

            utilitiesTotal:
              0

          }

        );

      }


      var tenantLedger =
        result.get(
          mapping.tenantKey
        );


      if (
        mapping.paymentType ===
        'إيجار'
      ) {

        tenantLedger
          .rentPayments
          .push({

            amount:
              amount,

            date:
              paymentDate

          });

      }


      else {

        tenantLedger.utilitiesTotal +=
          amount;

      }

    }
  );


  return result;

}


/* ==========================================================
 * تحديد حالة الإيجار
 * ==========================================================
 */

function rentSummaryStatus(

  monthlyRent,

  rentPaid,

  completionDate,

  currentDay,

  dueDay,

  graceEndDay,

  timezone

) {

  if (
    !Number.isFinite(
      monthlyRent
    ) ||
    monthlyRent <= 0
  ) {

    return (
      'يحتاج مراجعة — قيمة الإيجار غير محددة'
    );

  }


  var tolerance =
    0.0005;


  /**
   * مكتمل السداد.
   */
  if (
    rentPaid >=
    monthlyRent -
    tolerance
  ) {

    if (
      !completionDate
    ) {

      return 'مدفوع بالكامل';

    }


    var paymentDay =
      Number(

        Utilities.formatDate(

          completionDate,

          timezone,

          'd'

        )

      );


    if (
      paymentDay <
      dueDay
    ) {

      return 'مدفوع مبكرًا';

    }


    if (
      paymentDay <=
      graceEndDay
    ) {

      return 'مدفوع ضمن المهلة';

    }


    return 'مدفوع متأخرًا';

  }


  /**
   * دفعة جزئية.
   */
  if (
    rentPaid > 0
  ) {

    if (
      currentDay <=
      graceEndDay
    ) {

      return (
        'مدفوع جزئيًا — ضمن المهلة'
      );

    }


    return (
      'متأخر — مدفوع جزئيًا'
    );

  }


  /**
   * لم يحن موعد الاستحقاق.
   */
  if (
    currentDay <
    dueDay
  ) {

    return (
      'لم يحن موعد الاستحقاق'
    );

  }


  /**
   * داخل المهلة.
   */
  if (
    currentDay <=
    graceEndDay
  ) {

    return 'ضمن مهلة السداد';

  }


  return 'متأخر — غير مدفوع';

}


/* ==========================================================
 * مؤشرات ملخص الإيجارات
 * ==========================================================
 */

function rentSummaryWriteIndicators(

  sheet,

  data

) {

  /**
   * بدل setValue مرات كثيرة،
   * نكتب المؤشرات كلها دفعة واحدة.
   *
   * A:N
   */
  var rows = [

    [
      'إجمالي الإيجار المستحق',
      data.totalRequired,
      '',
      'إجمالي المدفوع',
      data.totalPaid,
      '',
      'إجمالي المتبقي',
      data.totalRemaining,
      '',
      'الخدمات المحصلة',
      data.totalUtilities,
      '',
      'الشهر',
      data.currentMonth
    ],

    [
      'المسددون بالكامل',
      data.paidCount,
      '',
      'المتأخرون',
      data.lateCount,
      '',
      'الدفعات الجزئية',
      data.partialCount,
      '',
      'داخل المهلة',
      data.graceCount,
      '',
      'اليوم',
      data.currentDay
    ]

  ];


  sheet
    .getRange(
      2,
      1,
      2,
      14
    )
    .setValues(
      rows
    );


  /**
   * العناوين فقط.
   */
  sheet
    .getRangeList([

      'A2',
      'D2',
      'G2',
      'J2',
      'M2',

      'A3',
      'D3',
      'G3',
      'J3',
      'M3'

    ])
    .setFontWeight(
      'bold'
    );


  /**
   * المبالغ.
   */
  sheet
    .getRangeList([

      'B2',
      'E2',
      'H2',
      'K2'

    ])
    .setNumberFormat(
      '0.000'
    );

}


/* ==========================================================
 * تلوين حالات الملخص
 * ==========================================================
 */

function rentSummaryColor(

  sheet,

  startRow,

  rowCount

) {

  if (
    rowCount <= 0
  ) {

    return;

  }


  var range =
    sheet.getRange(

      startRow,

      13,

      rowCount,

      1

    );


  var values =
    range.getDisplayValues();


  var colors =
    values.map(
      function(row) {

        var status =
          appText(
            row[0]
          );


        /**
         * متأخر.
         */
        if (
          status.includes(
            'متأخر'
          )
        ) {

          return [
            '#f4cccc'
          ];

        }


        /**
         * يحتاج انتباه.
         */
        if (
          status.includes(
            'جزئي'
          ) ||

          status.includes(
            'ضمن مهلة السداد'
          ) ||

          status.includes(
            'يحتاج مراجعة'
          )
        ) {

          return [
            '#fff2cc'
          ];

        }


        /**
         * طبيعي / مسدد.
         */
        return [
          '#d9ead3'
        ];

      }
    );


  range.setBackgrounds(
    colors
  );

}


/* ==========================================================
 * تنسيق ملخص الإيجارات
 * ==========================================================
 */

function rentSummaryFormat(

  sheet,

  headerRow

) {

  sheet.setFrozenRows(
    headerRow
  );


  var widths = [

    115,
    170,
    90,
    190,
    145,
    130,
    110,
    100,
    135,
    185,
    110,
    110,
    250,
    230,
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

}


/* ==========================================================
 * الاختبارات
 * ==========================================================
 */


/**
 * اختبار الملف الموحد بالكامل.
 *
 * يعيد بناء:
 * 1. سجل المستأجرين
 * 2. ملخص الإيجارات
 */
function testRentSystem() {

  var ss =
    appActiveSpreadsheet();


  /**
   * بناء السجل أولًا.
   */
  var ledgerCount =
    tenantLedgerRebuild();


  /**
   * بناء الملخص من السجل الجديد.
   */
  var summaryCount =
    rentSummaryRebuild();


  var ledgerSheet =
    appSheet(
      ss,
      APP_CONFIG.TENANT_LEDGER_SHEET
    );


  var summarySheet =
    appSheet(
      ss,
      APP_CONFIG.RENT_SUMMARY_SHEET
    );


  /**
   * التحقق من عناوين سجل المستأجرين.
   */
  var ledgerHeaders =
    ledgerSheet
      .getRange(

        1,

        1,

        1,

        TENANT_LEDGER_HEADERS.length

      )
      .getDisplayValues()[0];


  if (
    ledgerHeaders[0] !==
    'معرف الرسالة'
  ) {

    throw new Error(
      'فشل التحقق من سجل المستأجرين.'
    );

  }


  /**
   * التحقق من وجود ملخص الإيجارات.
   */
  if (
    summarySheet.getLastRow() <
    5
  ) {

    throw new Error(
      'فشل التحقق من ملخص الإيجارات.'
    );

  }


  var result = {

    success:
      true,

    tenantLedgerRows:
      ledgerCount,

    rentSummaryRows:
      summaryCount,

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

    'نجح اختبار 30_Rent.gs',

    'اختبار النظام',

    6

  );


  return result;

}
