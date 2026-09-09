/**
 * ==========================================================
 * 70_System.gs
 *
 * المشغّل الرئيسي لنظام الإدارة المالية
 * ==========================================================
 *
 * الترتيب:
 *
 * العمليات
 *   ↓
 * سجل المستأجرين
 *   ↓
 * ملخص الإيجارات
 *   ↓
 * الإيصالات الجديدة
 *
 * ملاحظة:
 * مزامنة Gmail → دليل البنود الحية
 * موجودة في 60_Dashboard.gs.
 *
 * هذا الملف لا ينشئ أو يحذف
 * مشغل runLiveDashboardSync.
 * ==========================================================
 */


var FINANCIAL_SYSTEM_CONFIG = Object.freeze({

  TRIGGER_HOURS:
    3,

  LOCK_WAIT_MS:
    5000,

  MAX_ATTEMPTS:
    3,

  RETRY_BASE_MS:
    5000,

  TIME_ZONE:
    'Asia/Muscat'

});


/* ==========================================================
 * تشغيل النظام الكامل
 * ==========================================================
 */


/**
 * تشغيل النظام المالي كاملًا بالترتيب.
 *
 * هذه الدالة لا تنشئ Lock بنفسها.
 *
 * التشغيل التلقائي يستخدم:
 * safeRunFinancialSystem()
 */
function runFinancialSystem() {

  var startedAt =
    new Date();


  var operationsResult =
    {};


  var operationsCount =
    0;


  var ledgerCount =
    0;


  var summaryCount =
    0;


  var receiptCount =
    0;


  /**
   * ==========================================
   * 1. تحديث ومطابقة العمليات
   * ==========================================
   *
   * نستخدم المحرك الجديد بدل
   * operationsRegister() القديم فقط.
   */
  if (
    typeof operationsRegisterAndReconcile ===
    'function'
  ) {

    operationsResult =
      operationsRegisterAndReconcile() ||
      {};


    operationsCount =
      Number(
        operationsResult.added
      ) || 0;

  }


  else {

    /**
     * توافق احتياطي فقط.
     */
    operationsCount =
      Number(
        operationsRegister()
      ) || 0;


    operationsResult = {

      added:
        operationsCount,

      updated:
        0,

      deleted:
        0

    };

  }


  /**
   * ==========================================
   * 2. إعادة بناء سجل المستأجرين
   * ==========================================
   */
  ledgerCount =
    tenantLedgerRebuild();


  /**
   * ==========================================
   * 3. إعادة بناء ملخص الإيجارات
   * ==========================================
   */
  summaryCount =
    rentSummaryRebuild();


  /**
   * ==========================================
   * 4. إرسال الإيصالات الجديدة
   * ==========================================
   *
   * إذا كانت الإيصالات غير مفعلة
   * receiptSendNew() يعيد 0.
   */
  receiptCount =
    receiptSendNew();


  SpreadsheetApp.flush();


  var completedAt =
    new Date();


  var result = {

    success:
      true,


    operationsCount:
      operationsCount,


    operations:
      operationsResult,


    ledgerCount:
      Number(
        ledgerCount
      ) || 0,


    summaryCount:
      Number(
        summaryCount
      ) || 0,


    receiptCount:
      Number(
        receiptCount
      ) || 0,


    startedAt:
      Utilities.formatDate(

        startedAt,

        FINANCIAL_SYSTEM_CONFIG
          .TIME_ZONE,

        'dd/MM/yyyy HH:mm:ss'

      ),


    completedAt:
      Utilities.formatDate(

        completedAt,

        FINANCIAL_SYSTEM_CONFIG
          .TIME_ZONE,

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

    'اكتمل تحديث النظام.' +

      ' العمليات الجديدة: ' +
      result.operationsCount +

      '، المحدثة: ' +
      (
        Number(
          operationsResult.updated
        ) || 0
      ) +

      '، المحذوفة: ' +
      (
        Number(
          operationsResult.deleted
        ) || 0
      ) +

      '، سجل المستأجرين: ' +
      result.ledgerCount +

      '، صفوف الملخص: ' +
      result.summaryCount +

      '، الإيصالات المرسلة: ' +
      result.receiptCount +
      '.',

    'نظام الإدارة المالية',

    10

  );


  return result;

}


/* ==========================================================
 * التشغيل الآمن
 * ==========================================================
 */


/**
 * تشغيل النظام بأمان.
 *
 * يمنع تشغيل نسختين من المشغّل الرئيسي
 * في الوقت نفسه.
 *
 * كما يمنع تعارضه مع مزامنة لوحة التحكم
 * التي تستخدم ScriptLock أيضًا.
 */
function safeRunFinancialSystem() {

  var lock =
    LockService.getScriptLock();


  /*
   * إذا كان هناك تشغيل آخر
   * لا نشغّل نسخة ثانية.
   */
  if (
    !lock.tryLock(
      FINANCIAL_SYSTEM_CONFIG
        .LOCK_WAIT_MS
    )
  ) {

    var busyResult = {

      success:
        false,

      busy:
        true,

      message:
        'تم تجاوز التشغيل لأن تشغيلًا آخر ما زال مستمرًا.',

      time:
        Utilities.formatDate(
          new Date(),
          FINANCIAL_SYSTEM_CONFIG
            .TIME_ZONE,
          'dd/MM/yyyy HH:mm:ss'
        )

    };


    console.log(
      JSON.stringify(
        busyResult,
        null,
        2
      )
    );


    return busyResult;
  }


  try {

    var lastError =
      null;


    for (
      var attempt = 1;
      attempt <=
        FINANCIAL_SYSTEM_CONFIG
          .MAX_ATTEMPTS;
      attempt++
    ) {

      try {

        /*
         * ===============================================
         * تشغيل النظام المالي الرئيسي
         * ===============================================
         */
        var result =
          runFinancialSystem();


        result.attempt =
          attempt;


        /*
         * ===============================================
         * تحديث مؤشرات الميزانيات
         *
         * مهم:
         * فشل المؤشرات لا يوقف النظام الرئيسي.
         * ===============================================
         */
        try {

          if (
            typeof financeBudgetRefreshIndicators ===
            'function'
          ) {

            var budgetResult =
              financeBudgetRefreshIndicators();


            result.budgetIndicators = {

              success:
                true,

              version:
                budgetResult &&
                budgetResult.version
                  ? budgetResult.version
                  : 'BUDGET_INDICATORS',

              month:
                budgetResult &&
                budgetResult.month
                  ? budgetResult.month
                  : ''

            };


          } else {

            result.budgetIndicators = {

              success:
                false,

              skipped:
                true,

              message:
                'دالة financeBudgetRefreshIndicators غير موجودة.'

            };

          }


        } catch (budgetError) {

          /*
           * لا نرمي الخطأ.
           *
           * النظام الرئيسي يعتبر ناجحًا
           * حتى لو تعذر تحديث المؤشرات.
           */
          result.budgetIndicators = {

            success:
              false,

            error:
              String(
                budgetError &&
                budgetError.message
                  ? budgetError.message
                  : budgetError
              )

          };


          console.error(
            'تعذر تحديث مؤشرات الميزانيات: ' +
            result.budgetIndicators.error
          );

        }


        /*
         * انتهى النظام الرئيسي بنجاح.
         */
        return result;


      } catch (error) {

        lastError =
          error;


        var errorMessage =
          String(
            error &&
            error.message
              ? error.message
              : error
          );


        /*
         * الخطأ الدائم أو البرمجي
         * لا يعاد تشغيله.
         */
        if (
          !appIsTemporaryError(
            error
          )
        ) {

          console.error(
            'خطأ دائم في النظام: ' +
            errorMessage
          );


          throw error;
        }


        console.log(
          'خطأ مؤقت في المحاولة رقم ' +
          attempt +
          ': ' +
          errorMessage
        );


        /*
         * لا ننتظر بعد آخر محاولة.
         */
        if (
          attempt <
          FINANCIAL_SYSTEM_CONFIG
            .MAX_ATTEMPTS
        ) {

          Utilities.sleep(

            attempt *

            FINANCIAL_SYSTEM_CONFIG
              .RETRY_BASE_MS

          );

        }

      }

    }


    if (
      lastError
    ) {

      throw lastError;
    }


    return {

      success:
        false,

      message:
        'لم يكتمل تشغيل النظام.'

    };


  } finally {

    lock.releaseLock();

  }

}


/**
 * حذف مشغلات النظام المالي الرئيسي.
 *
 * لا يحذف مشغل لوحة التحكم.
 */
function removeFinancialTriggers() {

  var deletedCount =
    deleteFinancialTriggers_();


  appToast(

    'تم حذف ' +
      deletedCount +
      ' مشغل من مشغلات النظام المالي الرئيسي.',

    'حذف المشغلات',

    8

  );


  return deletedCount;

}


/**
 * حذف مشغلات النظام القديم والجديد.
 */
function deleteFinancialTriggers_() {

  var functionNames = [

    'runFinancialSystem',

    'safeRunFinancialSystem'

  ];


  var deletedCount =
    0;


  ScriptApp
    .getProjectTriggers()
    .forEach(
      function(trigger) {

        var handlerName =
          trigger.getHandlerFunction();


        if (
          functionNames.indexOf(
            handlerName
          ) !== -1
        ) {

          ScriptApp.deleteTrigger(
            trigger
          );


          deletedCount++;

        }

      }
    );


  return deletedCount;

}


/* ==========================================================
 * حالة النظام
 * ==========================================================
 */


/**
 * عرض حالة تفعيل إيصالات الصور.
 *
 * اسم الدالة القديمة محفوظ.
 */
function showReceiptActivationStatus() {

  var status =
    PropertiesService
      .getScriptProperties()
      .getProperty(

        APP_CONFIG
          .RECEIPT_ACTIVE_PROPERTY

      );


  var message =
    status === 'true'

      ? 'إرسال إيصالات الصور مفعّل.'

      : 'إرسال إيصالات الصور غير مفعّل.';


  appToast(

    message,

    'حالة الإيصالات',

    8

  );


  return (
    status === 'true'
  );

}


/**
 * قراءة حالة المشغلات بدون تعديلها.
 */
function getFinancialSystemStatus() {

  var receiptActive =
    PropertiesService
      .getScriptProperties()
      .getProperty(

        APP_CONFIG
          .RECEIPT_ACTIVE_PROPERTY

      ) === 'true';


  var triggers =
    ScriptApp
      .getProjectTriggers();


  var financialTriggers =
    0;


  var dashboardTriggers =
    0;


  triggers.forEach(
    function(trigger) {

      var handler =
        trigger.getHandlerFunction();


      if (
        handler ===
          'safeRunFinancialSystem' ||
        handler ===
          'runFinancialSystem'
      ) {

        financialTriggers++;

      }


      if (
        handler ===
        'runLiveDashboardSync'
      ) {

        dashboardTriggers++;

      }

    }
  );


  return {

    receiptActive:
      receiptActive,

    financialTriggerActive:
      financialTriggers > 0,

    financialTriggerCount:
      financialTriggers,

    dashboardLiveTriggerActive:
      dashboardTriggers > 0,

    dashboardLiveTriggerCount:
      dashboardTriggers

  };

}


/* ==========================================================
 * الاختبارات
 * ==========================================================
 */


/**
 * اسم الاختبار القديم محفوظ.
 *
 * تنبيه:
 * هذه الدالة تشغّل النظام الحقيقي بالكامل
 * وقد ترسل إيصالًا إذا كان هناك إيصال جديد.
 */
function testSystemRunner() {

  var result =
    runFinancialSystem();


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
 * اختبار آمن لـ 70_System.gs.
 *
 * لا:
 * - يسجل عمليات جديدة
 * - يرسل إيصالات
 * - ينشئ Trigger
 * - يحذف Trigger
 *
 * فقط يتحقق من بنية المشغّل.
 */
function testSystemController() {

  var requiredFunctions = [

    'runFinancialSystem',

    'safeRunFinancialSystem',

    'createSafeFinancialTrigger',

    'removeFinancialTriggers',

    'deleteFinancialTriggers_',

    'showReceiptActivationStatus',

    'getFinancialSystemStatus',

    'operationsRegisterAndReconcile',

    'tenantLedgerRebuild',

    'rentSummaryRebuild',

    'receiptSendNew'

  ];


  requiredFunctions.forEach(
    function(functionName) {

      if (
        typeof this[
          functionName
        ] !== 'function'
      ) {

        throw new Error(

          'الدالة المطلوبة غير موجودة: ' +
          functionName

        );

      }

    },
    this
  );


  var status =
    getFinancialSystemStatus();


  var result = {

    success:
      true,

    receiptActive:
      status.receiptActive,

    financialTriggerActive:
      status.financialTriggerActive,

    financialTriggerCount:
      status.financialTriggerCount,

    dashboardLiveTriggerActive:
      status.dashboardLiveTriggerActive,

    dashboardLiveTriggerCount:
      status.dashboardLiveTriggerCount,

    triggerIntervalHours:
      FINANCIAL_SYSTEM_CONFIG
        .TRIGGER_HOURS,

    completedAt:
      Utilities.formatDate(

        new Date(),

        FINANCIAL_SYSTEM_CONFIG
          .TIME_ZONE,

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

    'نجح اختبار 70_System.gs — لم يتم تشغيل النظام أو إرسال إيصالات.',

    'اختبار النظام',

    8

  );


  return result;

}
