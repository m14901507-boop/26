/**
 * ==========================================================
 * 64_AssociationDashboard.gs
 *
 * محرك لوحة إدارة الجمعية المستقلة
 * ==========================================================
 *
 * يعتمد على:
 * 62_FinancialRouting.gs
 *
 * الجمعية مستقلة تمامًا عن:
 * - المصروف الشخصي
 * - الدخل الشخصي
 * - دخل الإيجارات
 * - التحويلات الداخلية
 *
 * هذا الملف:
 * - يقرأ أعضاء الجمعية
 * - يقرأ عمليات الجمعية
 * - يحسب التحصيل الشهري
 * - يحسب المبالغ المسلمة
 * - يحدد المسدد / الجزئي / غير المسدد
 * - يجمع دفعات كل عضو
 * - يعرض سجل العمليات
 *
 * قراءة وتحليل فقط.
 * لا يغير البيانات.
 * لا يرسل رسائل أو إيصالات.
 * ==========================================================
 */


var ASSOCIATION_DASHBOARD_CONFIG =
  Object.freeze({

    MEMBERS_SHEET:
      'أعضاء الجمعية',

    TIME_ZONE:
      'Asia/Muscat',

    MAX_TRANSACTIONS:
      100

  });


/* ==========================================================
 * الدالة الرئيسية
 * ==========================================================
 */

function getAssociationDashboard(
  filters
) {

  filters =
    filters || {};


  var period =
    appText(
      filters.period
    ) ||
    'this_month';


  var memberFilter =
    appText(
      filters.member
    ) ||
    'all';


  var bankFilter =
    appText(
      filters.bank
    ) ||
    'all';


  var ss =
    appActiveSpreadsheet();


  var routing =
    getFinancialRoutingData();


  var associationRecords =
    routing.routes.association ||
    [];


  var members =
    associationDashboardReadMembers_(
      ss
    );


  var now =
    new Date();


  var currentPeriod =
    associationDashboardResolvePeriod_(

      period,

      now

    );


  var previousPeriod =
    associationDashboardPreviousPeriod_(

      period,

      currentPeriod

    );


  /* ========================================================
   * 1. تجهيز عمليات الجمعية
   * ========================================================
   */

  var preparedRecords =
    associationRecords.map(
      associationDashboardPrepareRecord_
    );


  /* ========================================================
   * 2. عمليات الفترة الحالية
   * ========================================================
   */

  var currentRecords =
    associationDashboardFilterRecords_(

      preparedRecords,

      currentPeriod,

      {
        member:
          memberFilter,

        bank:
          bankFilter
      }

    );


  var previousRecords =
    associationDashboardFilterRecords_(

      preparedRecords,

      previousPeriod,

      {
        member:
          memberFilter,

        bank:
          bankFilter
      }

    );


  /* ========================================================
   * 3. فصل التحصيل عن التسليم
   * ========================================================
   */

  var currentCollections =
    currentRecords.filter(
      function(record) {

        return (
          record.flow ===
          'collection'
        );

      }
    );


  var currentPayouts =
    currentRecords.filter(
      function(record) {

        return (
          record.flow ===
          'payout'
        );

      }
    );


  var previousCollections =
    previousRecords.filter(
      function(record) {

        return (
          record.flow ===
          'collection'
        );

      }
    );


  /* ========================================================
   * 4. المجاميع
   * ========================================================
   */

  var collected =
    associationDashboardSum_(
      currentCollections
    );


  var paidOut =
    associationDashboardSum_(
      currentPayouts
    );


  var previousCollected =
    associationDashboardSum_(
      previousCollections
    );


  var collectionChange =
    associationDashboardChangePercent_(

      collected,

      previousCollected

    );


  /* ========================================================
   * 5. حالة كل عضو
   * ========================================================
   */

  var memberStatus =
    associationDashboardBuildMemberStatus_(

      members,

      currentCollections

    );


  var activeMembers =
    memberStatus.filter(
      function(member) {

        return (
          member.active !==
          false
        );

      }
    );


  var paidMembers =
    activeMembers.filter(
      function(member) {

        return (
          member.status ===
          'paid'
        );

      }
    );


  var partialMembers =
    activeMembers.filter(
      function(member) {

        return (
          member.status ===
          'partial'
        );

      }
    );


  var unpaidMembers =
    activeMembers.filter(
      function(member) {

        return (
          member.status ===
          'unpaid'
        );

      }
    );


  /* ========================================================
   * 6. المبلغ المتوقع
   * ========================================================
   */

  var expectedCollection =
    associationDashboardExpectedCollection_(

      activeMembers

    );


  var remainingCollection =
    expectedCollection === null

      ? null

      : associationDashboardRound_(

          expectedCollection -
          collected

        );


  var collectionPercent =
    expectedCollection !== null &&
    expectedCollection > 0

      ? associationDashboardRound_(

          (
            collected /
            expectedCollection
          ) *
          100

        )

      : null;


  /* ========================================================
   * 7. الدور القادم إن وجد في ورقة الأعضاء
   * ========================================================
   */

  var nextTurn =
    associationDashboardFindNextTurn_(

      members,

      now

    );


  /* ========================================================
   * 8. تجميع الحركات حسب العضو
   * ========================================================
   */

  var memberGroups =
    associationDashboardBuildMemberGroups_(

      currentCollections

    );


  /* ========================================================
   * 9. خيارات الفلاتر
   * ========================================================
   */

  var filterOptions =
    associationDashboardBuildFilterOptions_(

      preparedRecords,

      members

    );


  /* ========================================================
   * 10. اتجاه 12 شهر
   * ========================================================
   */

  var trend =
    associationDashboardBuild12MonthTrend_(

      preparedRecords,

      now

    );


  return {

    generatedAt:
      Utilities.formatDate(

        now,

        ASSOCIATION_DASHBOARD_CONFIG
          .TIME_ZONE,

        'dd/MM/yyyy HH:mm:ss'

      ),


    period: {

      key:
        period,


      label:
        period ===
          'this_year'

          ? 'السنة الحالية'

          : 'الشهر الحالي',


      start:
        associationDashboardFormatDate_(
          currentPeriod.start
        ),


      end:
        associationDashboardFormatDate_(
          currentPeriod.end
        )

    },


    summary: {

      activeMembers:
        activeMembers.length,


      paidMembers:
        paidMembers.length,


      partialMembers:
        partialMembers.length,


      unpaidMembers:
        unpaidMembers.length,


      collected:
        associationDashboardRound_(
          collected
        ),


      expectedCollection:
        expectedCollection,


      remainingCollection:
        remainingCollection,


      collectionPercent:
        collectionPercent,


      paidOut:
        associationDashboardRound_(
          paidOut
        ),


      balanceMovement:
        associationDashboardRound_(

          collected -
          paidOut

        ),


      previousCollected:
        associationDashboardRound_(
          previousCollected
        ),


      collectionChangePercent:
        collectionChange,


      collectionTransactions:
        currentCollections.length,


      payoutTransactions:
        currentPayouts.length

    },


    members:
      memberStatus,


    memberGroups:
      memberGroups,


    nextTurn:
      nextTurn,


    recentTransactions:
      associationDashboardRecentTransactions_(

        currentRecords,

        ASSOCIATION_DASHBOARD_CONFIG
          .MAX_TRANSACTIONS

      ),


    trend:
      trend,


    filters: {

      members:
        filterOptions.members,

      banks:
        filterOptions.banks

    },


    isolation: {

      associationOperations:
        associationRecords.length,


      /**
       * يجب ألا تدخل هذه العمليات
       * في لوحات الدخل والمصروف.
       */
      expenseOperations:
        routing.counts.expense ||
        0,


      incomeOperations:
        routing.counts.income ||
        0,


      rentIncomeOperations:
        routing.counts.rent_income ||
        0,


      internalTransfers:
        routing.counts.internal_transfer ||
        0

    }

  };

}


/* ==========================================================
 * قراءة أعضاء الجمعية
 * ==========================================================
 */

function associationDashboardReadMembers_(
  ss
) {

  var sheet =
    ss.getSheetByName(
      ASSOCIATION_DASHBOARD_CONFIG
        .MEMBERS_SHEET
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
      function(value) {

        return associationDashboardNormalize_(
          value
        );

      }
    );


  var indexes = {

    name:
      associationDashboardFindHeader_(

        headers,

        [
          'الاسم',
          'اسم العضو',
          'العضو',
          'اسم المشترك'
        ]

      ),


    email:
      associationDashboardFindHeader_(

        headers,

        [
          'البريد الالكتروني',
          'البريد',
          'email'
        ]

      ),


    phone:
      associationDashboardFindHeader_(

        headers,

        [
          'الهاتف',
          'رقم الهاتف',
          'الجوال',
          'رقم الجوال'
        ]

      ),


    contribution:
      associationDashboardFindHeader_(

        headers,

        [
          'الاشتراك الشهري',
          'المبلغ الشهري',
          'قيمة الاشتراك',
          'الاشتراك',
          'المبلغ'
        ]

      ),


    active:
      associationDashboardFindHeader_(

        headers,

        [
          'نشط',
          'فعال',
          'الحالة'
        ]

      ),


    turnDate:
      associationDashboardFindHeader_(

        headers,

        [
          'تاريخ الاستلام',
          'موعد الاستلام',
          'تاريخ الدور',
          'موعد الدور'
        ]

      ),


    turnNumber:
      associationDashboardFindHeader_(

        headers,

        [
          'رقم الدور',
          'الدور',
          'ترتيب الدور'
        ]

      )

  };


  var members =
    [];


  values
    .slice(1)
    .forEach(
      function(row) {

        var name =
          associationDashboardCell_(

            row,

            indexes.name

          );


        if (
          !appText(
            name
          )
        ) {

          return;

        }


        var activeValue =
          associationDashboardCell_(

            row,

            indexes.active

          );


        var active = true;


        if (
          indexes.active >= 0
        ) {

          active =
            associationDashboardIsActive_(
              activeValue
            );

        }


        members.push({

          name:
            appText(
              name
            ),


          email:
            appText(
              associationDashboardCell_(

                row,

                indexes.email

              )
            ),


          phone:
            appText(
              associationDashboardCell_(

                row,

                indexes.phone

              )
            ),


          contribution:
            associationDashboardNullableNumber_(

              associationDashboardCell_(

                row,

                indexes.contribution

              )

            ),


          active:
            active,


          turnDate:
            associationDashboardParseDate_(

              associationDashboardCell_(

                row,

                indexes.turnDate

              )

            ),


          turnNumber:
            associationDashboardCell_(

              row,

              indexes.turnNumber

            )

        });

      }
    );


  return members;

}


/* ==========================================================
 * تجهيز عملية الجمعية
 * ==========================================================
 */

function associationDashboardPrepareRecord_(
  record
) {

  var type =
    associationDashboardNormalize_(
      record.type
    );


  var flow =
    'other';


  /**
   * مبلغ داخل الجمعية.
   */
  if (

    type.indexOf(
      'وارد'
    ) !== -1 ||

    type.indexOf(
      'دخل'
    ) !== -1

  ) {

    flow =
      'collection';

  }


  /**
   * مبلغ خارج الجمعية:
   * مثل تسليم مبلغ الدور.
   */
  else if (

    type.indexOf(
      'مصروف'
    ) !== -1 ||

    type.indexOf(
      'صادر'
    ) !== -1

  ) {

    flow =
      'payout';

  }


  return {

    id:
      appText(
        record.id
      ),


    date:
      record.date,


    item:
      appText(
        record.item
      ) ||
      'جمعية',


    amount:
      Number(
        record.amount ||
        0
      ),


    member:
      associationDashboardResolveMemberName_(
        record
      ),


    party:
      appText(
        record.party
      ),


    bank:
      appText(
        record.bank
      ) ||
      'غير محدد',


    channel:
      appText(
        record.channel
      ) ||
      'غير محدد',


    type:
      appText(
        record.type
      ),


    flow:
      flow

  };

}


/* ==========================================================
 * تحديد اسم العضو من العملية
 * ==========================================================
 */

function associationDashboardResolveMemberName_(
  record
) {

  var party =
    appText(
      record.party
    );


  if (
    party
  ) {

    return party;

  }


  return appText(
    record.item
  ) ||
  'غير محدد';

}


/* ==========================================================
 * حالة الأعضاء
 * ==========================================================
 */

function associationDashboardBuildMemberStatus_(

  members,

  collectionRecords

) {

  var payments =
    {};


  collectionRecords.forEach(
    function(record) {

      var key =
        appKey(
          record.member
        );


      if (
        !payments[
          key
        ]
      ) {

        payments[
          key
        ] = {

          total:
            0,

          count:
            0,

          lastDate:
            null

        };

      }


      var data =
        payments[
          key
        ];


      data.total +=
        Number(
          record.amount ||
          0
        );


      data.count++;


      if (

        !data.lastDate ||

        (
          record.date &&
          record.date >
            data.lastDate
        )

      ) {

        data.lastDate =
          record.date;

      }

    }
  );


  return members.map(
    function(member) {

      var key =
        appKey(
          member.name
        );


      var payment =
        payments[
          key
        ] ||
        {

          total:
            0,

          count:
            0,

          lastDate:
            null

        };


      var expected =
        member.contribution;


      var status =
        'unpaid';


      if (
        expected !== null &&
        expected > 0
      ) {

        if (
          payment.total >=
          expected
        ) {

          status =
            'paid';

        }


        else if (
          payment.total > 0
        ) {

          status =
            'partial';

        }

      }


      else if (
        payment.total > 0
      ) {

        /**
         * إذا لم توجد قيمة اشتراك محددة
         * نثبت وجود دفعة فقط.
         */
        status =
          'paid';

      }


      var remaining =
        expected === null

          ? null

          : Math.max(

              0,

              expected -
              payment.total

            );


      return {

        name:
          member.name,


        email:
          member.email,


        phone:
          member.phone,


        active:
          member.active,


        expected:
          expected,


        paid:
          associationDashboardRound_(
            payment.total
          ),


        remaining:
          remaining === null

            ? null

            : associationDashboardRound_(
                remaining
              ),


        paymentCount:
          payment.count,


        status:
          status,


        statusLabel:
          associationDashboardStatusLabel_(
            status
          ),


        lastPaymentDate:
          payment.lastDate

            ? associationDashboardFormatDate_(
                payment.lastDate
              )

            : '',


        turnDate:
          member.turnDate

            ? associationDashboardFormatDate_(
                member.turnDate
              )

            : '',


        turnNumber:
          member.turnNumber

      };

    }
  );

}


/* ==========================================================
 * المبلغ المتوقع للتحصيل
 * ==========================================================
 */

function associationDashboardExpectedCollection_(
  members
) {

  if (
    !members.length
  ) {

    return null;

  }


  var allConfigured =
    members.every(
      function(member) {

        return (

          member.expected !==
            null &&

          Number(
            member.expected
          ) >= 0

        );

      }
    );


  if (
    !allConfigured
  ) {

    return null;

  }


  return associationDashboardRound_(

    members.reduce(
      function(
        total,
        member
      ) {

        return (

          total +

          Number(
            member.expected ||
            0
          )

        );

      },
      0
    )

  );

}


/* ==========================================================
 * تجميع دفعات الأعضاء
 * ==========================================================
 */

function associationDashboardBuildMemberGroups_(
  records
) {

  var map =
    {};


  records.forEach(
    function(record) {

      var member =
        record.member ||
        'غير محدد';


      var key =
        appKey(
          member
        );


      if (
        !map[
          key
        ]
      ) {

        map[
          key
        ] = {

          member:
            member,

          count:
            0,

          total:
            0,

          lastDate:
            record.date,

          banks:
            {}

        };

      }


      var group =
        map[
          key
        ];


      group.count++;


      group.total +=
        Number(
          record.amount ||
          0
        );


      if (
        record.bank
      ) {

        group.banks[
          record.bank
        ] =
          true;

      }


      if (
        record.date &&
        (
          !group.lastDate ||
          record.date >
            group.lastDate
        )
      ) {

        group.lastDate =
          record.date;

      }

    }
  );


  return Object
    .keys(
      map
    )
    .map(
      function(key) {

        var group =
          map[
            key
          ];


        return {

          member:
            group.member,


          count:
            group.count,


          total:
            associationDashboardRound_(
              group.total
            ),


          lastDate:
            group.lastDate

              ? associationDashboardFormatDate_(
                  group.lastDate
                )

              : '',


          banks:
            Object.keys(
              group.banks
            )

        };

      }
    )
    .sort(
      function(
        first,
        second
      ) {

        return (
          second.total -
          first.total
        );

      }
    );

}


/* ==========================================================
 * الدور القادم
 * ==========================================================
 */

function associationDashboardFindNextTurn_(

  members,

  now

) {

  var futureTurns =
    members
      .filter(
        function(member) {

          return (

            member.turnDate &&
            member.turnDate >=
              new Date(

                now.getFullYear(),

                now.getMonth(),

                now.getDate()

              )

          );

        }
      )
      .sort(
        function(
          first,
          second
        ) {

          return (

            first.turnDate.getTime() -

            second.turnDate.getTime()

          );

        }
      );


  if (
    !futureTurns.length
  ) {

    return null;

  }


  var next =
    futureTurns[0];


  return {

    member:
      next.name,


    date:
      associationDashboardFormatDate_(
        next.turnDate
      ),


    turnNumber:
      next.turnNumber || ''

  };

}


/* ==========================================================
 * آخر العمليات
 * ==========================================================
 */

function associationDashboardRecentTransactions_(

  records,

  limit

) {

  return records
    .slice()
    .sort(
      function(
        first,
        second
      ) {

        if (
          !first.date ||
          !second.date
        ) {

          return 0;

        }


        return (

          second.date.getTime() -

          first.date.getTime()

        );

      }
    )
    .slice(
      0,
      limit || 100
    )
    .map(
      function(record) {

        return {

          date:
            record.date

              ? associationDashboardFormatDate_(
                  record.date
                )

              : '',


          time:
            record.date

              ? Utilities.formatDate(

                  record.date,

                  ASSOCIATION_DASHBOARD_CONFIG
                    .TIME_ZONE,

                  'HH:mm'

                )

              : '',


          member:
            record.member,


          item:
            record.item,


          flow:
            record.flow,


          flowLabel:
            record.flow ===
              'collection'

              ? 'تحصيل'

              : record.flow ===
                  'payout'

                ? 'تسليم'

                : 'أخرى',


          amount:
            associationDashboardRound_(
              record.amount
            ),


          bank:
            record.bank,


          channel:
            record.channel

        };

      }
    );

}


/* ==========================================================
 * الاتجاه الشهري
 * ==========================================================
 */

function associationDashboardBuild12MonthTrend_(

  records,

  now

) {

  var result =
    [];


  for (
    var offset = 11;
    offset >= 0;
    offset--
  ) {

    var month =
      new Date(

        now.getFullYear(),

        now.getMonth() -
          offset,

        1

      );


    var start =
      new Date(

        month.getFullYear(),

        month.getMonth(),

        1

      );


    var end =
      new Date(

        month.getFullYear(),

        month.getMonth() + 1,

        0,

        23,
        59,
        59,
        999

      );


    var monthRecords =
      records.filter(
        function(record) {

          return (

            record.date &&
            record.date >=
              start &&
            record.date <=
              end

          );

        }
      );


    var collections =
      associationDashboardSum_(

        monthRecords.filter(
          function(record) {

            return (
              record.flow ===
              'collection'
            );

          }
        )

      );


    var payouts =
      associationDashboardSum_(

        monthRecords.filter(
          function(record) {

            return (
              record.flow ===
              'payout'
            );

          }
        )

      );


    result.push({

      key:
        Utilities.formatDate(

          month,

          ASSOCIATION_DASHBOARD_CONFIG
            .TIME_ZONE,

          'yyyy-MM'

        ),


      label:
        Utilities.formatDate(

          month,

          ASSOCIATION_DASHBOARD_CONFIG
            .TIME_ZONE,

          'MM/yyyy'

        ),


      collections:
        associationDashboardRound_(
          collections
        ),


      payouts:
        associationDashboardRound_(
          payouts
        )

    });

  }


  return result;

}


/* ==========================================================
 * الفلاتر
 * ==========================================================
 */

function associationDashboardFilterRecords_(

  records,

  period,

  filters

) {

  filters =
    filters || {};


  return records.filter(
    function(record) {

      if (
        !record.date ||
        isNaN(
          record.date.getTime()
        )
      ) {

        return false;

      }


      if (
        period &&
        (
          record.date <
            period.start ||

          record.date >
            period.end
        )
      ) {

        return false;

      }


      if (
        filters.member &&
        filters.member !==
          'all' &&
        appKey(
          record.member
        ) !==
        appKey(
          filters.member
        )
      ) {

        return false;

      }


      if (
        filters.bank &&
        filters.bank !==
          'all' &&
        appKey(
          record.bank
        ) !==
        appKey(
          filters.bank
        )
      ) {

        return false;

      }


      return true;

    }
  );

}


/* ==========================================================
 * خيارات الفلاتر
 * ==========================================================
 */

function associationDashboardBuildFilterOptions_(

  records,

  members

) {

  var memberMap =
    {};


  var bankMap =
    {};


  members.forEach(
    function(member) {

      if (
        member.name
      ) {

        memberMap[
          member.name
        ] =
          true;

      }

    }
  );


  records.forEach(
    function(record) {

      if (
        record.member
      ) {

        memberMap[
          record.member
        ] =
          true;

      }


      if (
        record.bank
      ) {

        bankMap[
          record.bank
        ] =
          true;

      }

    }
  );


  return {

    members:
      Object.keys(
        memberMap
      )
      .sort(),


    banks:
      Object.keys(
        bankMap
      )
      .sort()

  };

}


/* ==========================================================
 * الفترة
 * ==========================================================
 */

function associationDashboardResolvePeriod_(

  period,

  now

) {

  if (
    period ===
    'this_year'
  ) {

    return {

      start:
        new Date(

          now.getFullYear(),

          0,

          1

        ),


      end:
        new Date(

          now.getFullYear(),

          11,

          31,

          23,
          59,
          59,
          999

        )

    };

  }


  return {

    start:
      new Date(

        now.getFullYear(),

        now.getMonth(),

        1

      ),


    end:
      new Date(

        now.getFullYear(),

        now.getMonth() + 1,

        0,

        23,
        59,
        59,
        999

      )

  };

}


function associationDashboardPreviousPeriod_(

  period,

  current

) {

  if (
    period ===
    'this_year'
  ) {

    var year =
      current.start
        .getFullYear() -
      1;


    return {

      start:
        new Date(
          year,
          0,
          1
        ),


      end:
        new Date(

          year,
          11,
          31,

          23,
          59,
          59,
          999

        )

    };

  }


  var month =
    new Date(

      current.start
        .getFullYear(),

      current.start
        .getMonth() - 1,

      1

    );


  return {

    start:
      new Date(

        month.getFullYear(),

        month.getMonth(),

        1

      ),


    end:
      new Date(

        month.getFullYear(),

        month.getMonth() + 1,

        0,

        23,
        59,
        59,
        999

      )

  };

}


/* ==========================================================
 * Helpers
 * ==========================================================
 */

function associationDashboardFindHeader_(

  normalizedHeaders,

  aliases

) {

  var normalizedAliases =
    aliases.map(
      associationDashboardNormalize_
    );


  for (
    var i = 0;
    i < normalizedHeaders.length;
    i++
  ) {

    if (
      normalizedAliases.indexOf(
        normalizedHeaders[i]
      ) !== -1
    ) {

      return i;

    }

  }


  return -1;

}


function associationDashboardCell_(

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


function associationDashboardIsActive_(
  value
) {

  var text =
    associationDashboardNormalize_(
      value
    );


  if (
    !text
  ) {

    return true;

  }


  return [

    'نعم',
    'نشط',
    'فعال',
    'active',
    'true',
    '1'

  ]
  .indexOf(
    text
  ) !== -1;

}


function associationDashboardStatusLabel_(
  status
) {

  if (
    status ===
    'paid'
  ) {

    return 'مسدد';

  }


  if (
    status ===
    'partial'
  ) {

    return 'مسدد جزئيًا';

  }


  return 'غير مسدد';

}


function associationDashboardNullableNumber_(
  value
) {

  if (
    value === '' ||
    value === null ||
    value === undefined
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

    ? associationDashboardRound_(
        number
      )

    : null;

}


function associationDashboardParseDate_(
  value
) {

  if (
    !value
  ) {

    return null;

  }


  if (
    value instanceof Date
  ) {

    return isNaN(
      value.getTime()
    )

      ? null

      : value;

  }


  var parsed =
    new Date(
      value
    );


  return isNaN(
    parsed.getTime()
  )

    ? null

    : parsed;

}


function associationDashboardSum_(
  records
) {

  return records.reduce(
    function(
      total,
      record
    ) {

      return (

        total +

        Number(
          record.amount ||
          0
        )

      );

    },
    0
  );

}


function associationDashboardChangePercent_(

  current,

  previous

) {

  if (
    previous > 0
  ) {

    return associationDashboardRound_(

      (
        (
          current -
          previous
        ) /
        previous
      ) *
      100

    );

  }


  if (
    current === 0
  ) {

    return 0;

  }


  return null;

}


function associationDashboardRound_(
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


function associationDashboardFormatDate_(
  date
) {

  return Utilities.formatDate(

    date,

    ASSOCIATION_DASHBOARD_CONFIG
      .TIME_ZONE,

    'dd/MM/yyyy'

  );

}


function associationDashboardNormalize_(
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

function testAssociationDashboard() {

  var data =
    getAssociationDashboard({

      period:
        'this_month',

      member:
        'all',

      bank:
        'all'

    });


  if (
    !data ||
    !data.summary ||
    !Array.isArray(
      data.members
    ) ||
    !Array.isArray(
      data.recentTransactions
    ) ||
    !Array.isArray(
      data.trend
    )
  ) {

    throw new Error(
      'فشل محرك لوحة الجمعية.'
    );

  }


  /**
   * التحقق من أن أي سجل جمعية
   * لم يدخل الدخل أو المصروف.
   */
  var routing =
    getFinancialRoutingData();


  var associationIds =
    (routing.routes.association || [])
      .map(
        function(record) {

          return appText(
            record.id
          );

        }
      )
      .filter(
        Boolean
      );


  var wrongRecords =
    []
      .concat(
        routing.routes.expense || []
      )
      .concat(
        routing.routes.income || []
      )
      .concat(
        routing.routes.rent_income || []
      )
      .filter(
        function(record) {

          return (

            associationIds.indexOf(
              appText(
                record.id
              )
            ) !== -1

          );

        }
      );


  if (
    wrongRecords.length
  ) {

    throw new Error(
      'خطأ: توجد عمليات جمعية دخلت في لوحة الدخل أو المصروف.'
    );

  }


  var result = {

    success:
      true,


    activeMembers:
      data.summary.activeMembers,


    paidMembers:
      data.summary.paidMembers,


    partialMembers:
      data.summary.partialMembers,


    unpaidMembers:
      data.summary.unpaidMembers,


    collected:
      data.summary.collected,


    expectedCollection:
      data.summary.expectedCollection,


    paidOut:
      data.summary.paidOut,


    associationOperations:
      data.isolation
        .associationOperations,


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

    'نجح اختبار لوحة الجمعية المستقلة.',

    'اختبار الجمعية',

    8

  );


  return result;

}
