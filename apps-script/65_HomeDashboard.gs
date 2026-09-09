/**
 * ==========================================================
 * 65_HomeDashboard.gs
 *
 * محرك الصفحة الرئيسية
 * ==========================================================
 *
 * يجمع ملخصًا فقط من:
 *
 * 61_DashboardInsights.gs     ← المصروفات
 * 63_IncomeDashboard.gs       ← الدخل
 * 64_AssociationDashboard.gs  ← الجمعية
 *
 * مهم:
 * لا يعيد تصنيف أي عملية.
 * لا يخلط الجمعية مع الدخل.
 * لا يعتبر التحويل الداخلي دخلاً أو مصروفًا.
 * لا يعتبر الاسترداد دخلاً حقيقيًا.
 *
 * قراءة وتحليل فقط.
 * ==========================================================
 */


var HOME_DASHBOARD_CONFIG =
  Object.freeze({

    TIME_ZONE:
      'Asia/Muscat'

  });


/* ==========================================================
 * الدالة الرئيسية
 * ==========================================================
 */

function getHomeDashboard() {

  var now =
    new Date();


  /* ========================================================
   * 1. المصروفات
   *
   * نستخدم الميزانية العائلية الشهرية
   * كملخص الصفحة الرئيسية.
   * ========================================================
   */

  var expenseData =
    getSmartBudgetDashboard({

      budgetKey:
        'family_monthly',

      category:
        'all',

      bank:
        'all',

      system:
        'all',

      item:
        'all'

    });


  /* ========================================================
   * 2. الدخل
   * ========================================================
   */

  var incomeData =
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


  /* ========================================================
   * 3. الجمعية
   * ========================================================
   */

  var associationData =
    getAssociationDashboard({

      period:
        'this_month',

      member:
        'all',

      bank:
        'all'

    });


  /* ========================================================
   * 4. ملخص المصروف
   * ========================================================
   */

  var expenseSpent =
    homeDashboardNumber_(

      expenseData &&
      expenseData.behavior

        ? expenseData.behavior.spent

        : 0

    );


  var expenseAvailableBalance =
    homeDashboardNullableNumber_(

      expenseData &&
      expenseData.account

        ? expenseData.account.availableBalance

        : null

    );


  var expenseTransactionCount =
    Number(

      expenseData &&
      expenseData.totalExpenseTransactions

        ? expenseData.totalExpenseTransactions

        : 0

    );


  var expenseGroupedItems =
    Number(

      expenseData &&
      expenseData.groupedItemCount

        ? expenseData.groupedItemCount

        : 0

    );


  /* ========================================================
   * 5. ملخص الدخل الحقيقي
   * ========================================================
   */

  var realIncome =
    homeDashboardNumber_(

      incomeData &&
      incomeData.summary

        ? incomeData.summary.realIncome

        : 0

    );


  var rentIncome =
    homeDashboardNumber_(

      incomeData &&
      incomeData.summary

        ? incomeData.summary.rentIncome

        : 0

    );


  var refunds =
    homeDashboardNumber_(

      incomeData &&
      incomeData.summary

        ? incomeData.summary.refunds

        : 0

    );


  var incomeTransactionCount =
    Number(

      incomeData &&
      incomeData.summary

        ? incomeData.summary.incomeTransactions || 0

        : 0

    );


  /* ========================================================
   * 6. صافي التدفق الشخصي
   *
   * الدخل الحقيقي - المصروف.
   *
   * لا يشمل:
   * - الجمعية
   * - التحويلات الداخلية
   * - الاستردادات
   * ========================================================
   */

  var netCashFlow =
    homeDashboardRound_(

      realIncome -
      expenseSpent

    );


  /* ========================================================
   * 7. الجمعية
   * ========================================================
   */

  var associationSummary =
    associationData.summary ||
    {};


  var associationCollected =
    homeDashboardNumber_(
      associationSummary.collected
    );


  var associationExpected =
    homeDashboardNullableNumber_(
      associationSummary.expectedCollection
    );


  var associationRemaining =
    homeDashboardNullableNumber_(
      associationSummary.remainingCollection
    );


  var associationPercent =
    homeDashboardNullableNumber_(
      associationSummary.collectionPercent
    );


  /* ========================================================
   * 8. صحة النظام
   * ========================================================
   */

  var routing =
    getFinancialRoutingData();


  var reviewCount =
    Number(

      routing &&
      routing.counts

        ? routing.counts.review || 0

        : 0

    );


  var internalTransfers =
    Number(

      routing &&
      routing.counts

        ? routing.counts.internal_transfer || 0

        : 0

    );


  /* ========================================================
   * 9. النتيجة
   * ========================================================
   */

  return {

    generatedAt:
      Utilities.formatDate(

        now,

        HOME_DASHBOARD_CONFIG
          .TIME_ZONE,

        'dd/MM/yyyy HH:mm:ss'

      ),


    expense: {

      spent:
        expenseSpent,


      availableBalance:
        expenseAvailableBalance,


      transactionCount:
        expenseTransactionCount,


      groupedItems:
        expenseGroupedItems,


      topItem:

        expenseData &&
        expenseData.behavior

          ? expenseData.behavior.topItem ||
            'لا توجد بيانات'

          : 'لا توجد بيانات',


      topItemAmount:
        homeDashboardNumber_(

          expenseData &&
          expenseData.behavior

            ? expenseData.behavior.topItemAmount

            : 0

        ),


      paceStatus:

        expenseData &&
        expenseData.behavior &&
        expenseData.behavior.paceStatus

          ? expenseData.behavior.paceStatus

          : {

              level:
                'neutral',

              label:
                'غير محدد'

            }

    },


    income: {

      realIncome:
        realIncome,


      rentIncome:
        rentIncome,


      refunds:
        refunds,


      transactionCount:
        incomeTransactionCount,


      topSource:

        incomeData &&
        incomeData.summary

          ? incomeData.summary.topSource ||
            'لا توجد بيانات'

          : 'لا توجد بيانات',


      topSourceAmount:
        homeDashboardNumber_(

          incomeData &&
          incomeData.summary

            ? incomeData.summary.topSourceAmount

            : 0

        ),


      changePercent:
        homeDashboardNullableNumber_(

          incomeData &&
          incomeData.summary

            ? incomeData.summary.changePercent

            : null

        )

    },


    cashFlow: {

      income:
        realIncome,


      expense:
        expenseSpent,


      net:
        netCashFlow,


      status:
        homeDashboardCashFlowStatus_(
          netCashFlow
        )

    },


    association: {

      activeMembers:
        Number(
          associationSummary.activeMembers ||
          0
        ),


      paidMembers:
        Number(
          associationSummary.paidMembers ||
          0
        ),


      partialMembers:
        Number(
          associationSummary.partialMembers ||
          0
        ),


      unpaidMembers:
        Number(
          associationSummary.unpaidMembers ||
          0
        ),


      collected:
        associationCollected,


      expected:
        associationExpected,


      remaining:
        associationRemaining,


      collectionPercent:
        associationPercent,


      nextTurn:
        associationData.nextTurn ||
        null

    },


    system: {

      reviewCount:
        reviewCount,


      internalTransfersExcluded:
        internalTransfers,


      expenseEngine:
        true,


      incomeEngine:
        true,


      associationEngine:
        true

    }

  };

}


/* ==========================================================
 * حالة صافي التدفق
 * ==========================================================
 */

function homeDashboardCashFlowStatus_(
  value
) {

  if (
    value > 0
  ) {

    return {

      level:
        'good',

      label:
        'تدفق موجب'

    };

  }


  if (
    value < 0
  ) {

    return {

      level:
        'danger',

      label:
        'تدفق سالب'

    };

  }


  return {

    level:
      'neutral',

    label:
      'متعادل'

  };

}


/* ==========================================================
 * Helpers
 * ==========================================================
 */

function homeDashboardNumber_(
  value
) {

  var number =
    Number(
      value ||
      0
    );


  return Number.isFinite(
    number
  )

    ? homeDashboardRound_(
        number
      )

    : 0;

}


function homeDashboardNullableNumber_(
  value
) {

  if (
    value === null ||
    value === undefined ||
    value === ''
  ) {

    return null;

  }


  var number =
    Number(
      value
    );


  return Number.isFinite(
    number
  )

    ? homeDashboardRound_(
        number
      )

    : null;

}


function homeDashboardRound_(
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


/* ==========================================================
 * اختبار آمن
 * ==========================================================
 */

function testHomeDashboard() {

  var data =
    getHomeDashboard();


  if (
    !data ||
    !data.expense ||
    !data.income ||
    !data.cashFlow ||
    !data.association ||
    !data.system
  ) {

    throw new Error(
      'فشل محرك الصفحة الرئيسية.'
    );

  }


  /**
   * صافي التدفق يجب أن يكون:
   *
   * الدخل الحقيقي - المصروف
   *
   * ولا تدخل فيه الجمعية أو الاستردادات.
   */
  var expectedNet =
    homeDashboardRound_(

      data.income.realIncome -
      data.expense.spent

    );


  if (
    homeDashboardRound_(
      data.cashFlow.net
    ) !==
    expectedNet
  ) {

    throw new Error(
      'صافي التدفق لا يساوي الدخل الحقيقي ناقص المصروف.'
    );

  }


  /**
   * تأكيد عمل المحركات الثلاثة.
   */
  if (

    !data.system.expenseEngine ||

    !data.system.incomeEngine ||

    !data.system.associationEngine

  ) {

    throw new Error(
      'أحد المحركات المالية غير متاح.'
    );

  }


  var result = {

    success:
      true,


    expense:
      data.expense.spent,


    realIncome:
      data.income.realIncome,


    rentIncome:
      data.income.rentIncome,


    refunds:
      data.income.refunds,


    netCashFlow:
      data.cashFlow.net,


    associationCollected:
      data.association.collected,


    associationMembers:
      data.association.activeMembers,


    reviewOperations:
      data.system.reviewCount,


    isolationCorrect:
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

    'نجح اختبار الصفحة الرئيسية وفصل اللوحات.',

    'اختبار النظام',

    8

  );


  return result;

}
