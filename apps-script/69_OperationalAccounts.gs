/*********************************************************
 * 69_OperationalAccounts.gs
 *
 * مراقبة الحسابات التشغيلية الأربعة
 *
 * 1 عائلي شهري  → الأهلي 001
 * 2 عائلي سنوي  → الأهلي 002
 * 3 شخصي شهري   → صحار 1
 * 4 شخصي سنوي   → صحار 2
 *
 * مهم:
 * الرصيد هنا = رصيد النظام المحسوب
 * وليس رصيد البنك المؤكد.
 *********************************************************/


const OPERATIONAL_ACCOUNTS_CONFIG = [

  {
    key: 'family_monthly',
    budgetKey: 'family_monthly',
    name: 'عائلي شهري',
    bank: 'الأهلي 001',
    scope: 'عائلي',
    period: 'شهري'
  },

  {
    key: 'family_annual',
    budgetKey: 'family_annual',
    name: 'عائلي سنوي',
    bank: 'الأهلي 002',
    scope: 'عائلي',
    period: 'سنوي'
  },

  {
    key: 'personal_monthly',
    budgetKey: 'personal_monthly',
    name: 'شخصي شهري',
    bank: 'صحار 1',
    scope: 'شخصي',
    period: 'شهري'
  },

  {
    key: 'personal_annual',
    budgetKey: 'personal_annual',
    name: 'شخصي سنوي',
    bank: 'صحار 2',
    scope: 'شخصي',
    period: 'سنوي'
  }

];


/* =========================================================
   PUBLIC
   ========================================================= */


/**
 * يستخدم لاحقًا داخل صفحة المصروفات.
 */
function getOperationalAccountsOverview() {

  if (
    typeof getSmartBudgetDashboard !==
    'function'
  ) {

    throw new Error(
      'لم يتم العثور على getSmartBudgetDashboard.'
    );

  }


  const accounts =
    [];


  OPERATIONAL_ACCOUNTS_CONFIG
    .forEach(
      function(config) {

        accounts.push(
          operationalAccountLoad_(
            config
          )
        );

      }
    );


  const knownBalances =
    accounts.filter(
      function(account) {

        return account.balanceKnown;

      }
    );


  const totalSystemBalance =
    knownBalances.reduce(
      function(total, account) {

        return (
          total +
          Number(
            account.systemBalance ||
            0
          )
        );

      },
      0
    );


  const totalSpent =
    accounts.reduce(
      function(total, account) {

        return (
          total +
          Number(
            account.spent ||
            0
          )
        );

      },
      0
    );


  const totalTransactions =
    accounts.reduce(
      function(total, account) {

        return (
          total +
          Number(
            account.transactionCount ||
            0
          )
        );

      },
      0
    );


  const negativeAccounts =
    accounts.filter(
      function(account) {

        return (
          account.balanceKnown &&
          account.systemBalance < 0
        );

      }
    ).length;


  const zeroAccounts =
    accounts.filter(
      function(account) {

        return (
          account.balanceKnown &&
          account.systemBalance === 0
        );

      }
    ).length;


  return {

    success:
      true,

    generatedAt:
      new Date().toISOString(),

    balanceType:
      'system_calculated',

    balanceLabel:
      'الرصيد المتبقي بالنظام',

    allBalancesKnown:
      knownBalances.length ===
      OPERATIONAL_ACCOUNTS_CONFIG.length,

    summary: {

      accounts:
        accounts.length,

      knownBalances:
        knownBalances.length,

      totalSystemBalance:
        knownBalances.length
          ? totalSystemBalance
          : null,

      totalSpent:
        totalSpent,

      totalTransactions:
        totalTransactions,

      negativeAccounts:
        negativeAccounts,

      zeroAccounts:
        zeroAccounts
    },

    accounts:
      accounts
  };

}


/* =========================================================
   LOAD ONE ACCOUNT
   ========================================================= */


function operationalAccountLoad_(
  config
) {

  const data =
    getSmartBudgetDashboard({

      budgetKey:
        config.budgetKey,

      category:
        'all',

      bank:
        'all',

      system:
        'all',

      item:
        'all'

    }) || {};


  const account =
    data.account || {};


  const behavior =
    data.behavior || {};


  const groups =
    Array.isArray(
      data.spendingGroups
    )
      ? data.spendingGroups
      : [];


  /*
   * الرصيد المعتمد حاليًا من محرك الميزانية.
   */
  const systemBalance =
    operationalNullableNumber_(
      account.availableBalance
    );


  const spent =
    operationalFirstNumber_(
      [
        behavior.spent,
        account.spent,
        data.totalSpent
      ],
      0
    );


  const transactionCount =
    operationalFirstNumber_(
      [
        data.totalExpenseTransactions,
        behavior.transactionCount,
        behavior.count
      ],
      0
    );


  let topItem =
    '';


  let topItemSpent =
    0;


  if (
    groups.length
  ) {

    topItem =
      String(
        groups[0].item ||
        groups[0].name ||
        ''
      );


    topItemSpent =
      operationalFirstNumber_(
        [
          groups[0].totalSpent,
          groups[0].spent,
          groups[0].amount
        ],
        0
      );

  }


  const status =
    operationalBalanceStatus_(
      systemBalance
    );


  return {

    key:
      config.key,

    budgetKey:
      config.budgetKey,

    name:
      config.name,

    bank:
      config.bank,

    scope:
      config.scope,

    period:
      config.period,

    systemBalance:
      systemBalance,

    availableBalance:
      systemBalance,

    balanceKnown:
      systemBalance !== null,

    balanceType:
      'system_calculated',

    balanceLabel:
      'الرصيد المتبقي بالنظام',

    /*
     * سنضيفه لاحقًا عندما نحدد
     * رصيد الأمان لكل حساب.
     */
    safetyBalance:
      null,

    safeAvailable:
      null,

    spent:
      spent,

    transactionCount:
      transactionCount,

    activeItems:
      groups.length,

    topItem:
      topItem,

    topItemSpent:
      topItemSpent,

    status:
      status
  };

}


/* =========================================================
   STATUS
   ========================================================= */


function operationalBalanceStatus_(
  balance
) {

  if (
    balance === null ||
    balance === undefined
  ) {

    return {

      code:
        'unknown',

      label:
        'الرصيد غير محدد',

      level:
        'unknown'
    };

  }


  if (
    balance < 0
  ) {

    return {

      code:
        'negative',

      label:
        'تجاوز الرصيد',

      level:
        'danger'
    };

  }


  if (
    balance === 0
  ) {

    return {

      code:
        'zero',

      label:
        'الرصيد مستنفد',

      level:
        'warning'
    };

  }


  return {

    code:
      'available',

    label:
      'رصيد متاح',

    level:
      'good'
  };

}


/* =========================================================
   NUMBERS
   ========================================================= */


function operationalNullableNumber_(
  value
) {

  if (
    value === null ||
    value === undefined ||
    value === ''
  ) {

    return null;

  }


  const number =
    Number(
      value
    );


  if (
    !isFinite(
      number
    )
  ) {

    return null;

  }


  return number;

}


function operationalFirstNumber_(
  candidates,
  fallback
) {

  for (
    let i = 0;
    i < candidates.length;
    i++
  ) {

    const value =
      operationalNullableNumber_(
        candidates[i]
      );


    if (
      value !== null
    ) {

      return value;

    }

  }


  return fallback;

}


/* =========================================================
   SAFE TEST
   ========================================================= */


/**
 * اختبار آمن 100%
 *
 * لا يكتب في الشيت.
 * لا يغير Gmail.
 * لا ينشئ Trigger.
 * لا يحول أي مبالغ.
 */
function testOperationalAccountsOverview() {

  const data =
    getOperationalAccountsOverview();


  if (
    !data ||
    data.success !== true
  ) {

    throw new Error(
      'فشل تحميل حالة الحسابات.'
    );

  }


  if (
    !Array.isArray(
      data.accounts
    ) ||
    data.accounts.length !== 4
  ) {

    throw new Error(
      'يجب أن تكون الحسابات التشغيلية 4.'
    );

  }


  const expected = {

    family_monthly:
      'الأهلي 001',

    family_annual:
      'الأهلي 002',

    personal_monthly:
      'صحار 1',

    personal_annual:
      'صحار 2'
  };


  const seen =
    {};


  data.accounts.forEach(
    function(account) {

      if (
        !expected[
          account.key
        ]
      ) {

        throw new Error(
          'حساب غير متوقع: ' +
          account.key
        );

      }


      if (
        expected[
          account.key
        ] !==
        account.bank
      ) {

        throw new Error(
          'ربط البنك غير صحيح للحساب: ' +
          account.name
        );

      }


      if (
        seen[
          account.key
        ]
      ) {

        throw new Error(
          'الحساب مكرر: ' +
          account.key
        );

      }


      seen[
        account.key
      ] =
        true;

    }
  );


  const response = {

    success:
      true,

    safeTest:
      true,

    accounts:
      data.accounts.length,

    balancesKnown:
      data.summary.knownBalances,

    totalSystemBalance:
      data.summary.totalSystemBalance,

    totalSpent:
      data.summary.totalSpent,

    totalTransactions:
      data.summary.totalTransactions,

    negativeAccounts:
      data.summary.negativeAccounts,

    accountsDetail:
      data.accounts.map(
        function(account) {

          return {

            account:
              account.name,

            bank:
              account.bank,

            balance:
              account.systemBalance,

            balanceKnown:
              account.balanceKnown,

            spent:
              account.spent,

            status:
              account.status.label

          };

        }
      )
  };


  console.log(
    JSON.stringify(
      response,
      null,
      2
    )
  );


  return response;

}
