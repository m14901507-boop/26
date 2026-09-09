/**
 * ==========================================================
 * 10_Gmail.gs
 * Gmail + تحليل الرسائل البنكية + مزامنة دليل البنود
 * ==========================================================
 *
 * تم دمج:
 *
 * 02_Gmail.gs.gs
 * 03_BankParser.gs.gs
 * 13_GmailLabelSync.gs
 *
 * مع الحفاظ على جميع أسماء Functions الحالية.
 *
 * تحسينات:
 * - قراءة Gmail Labels بشكل موحد.
 * - الاستفادة من Gmail Label ID إن كان موجودًا.
 * - تقليل عمليات الكتابة المنفردة في Google Sheets.
 * - تحديث دليل البنود دفعة واحدة.
 * - LockService لمنع المزامنة المتزامنة.
 * ==========================================================
 */


/* ==========================================================
 * إعدادات مزامنة Gmail Labels
 * ==========================================================
 */

var GMAIL_LABEL_SYNC_CONFIG = Object.freeze({

  GUIDE_SHEET:
    'دليل البنود',

  LABEL_ID_COLUMN:
    7,

  SYNC_STATUS_COLUMN:
    8,

  LAST_SYNC_COLUMN:
    9,

  CATEGORY_COLUMN:
    10,

  PERIOD_COLUMN:
    11,

  SCOPE_COLUMN:
    12,

  NEW_LABEL_CLASSIFICATION:
    'غير مصنف',

  NEW_LABEL_SYSTEM:
    'غير محدد',

  NEW_LABEL_MOVEMENT:
    '',

  NEW_LABEL_ACTION:
    'يحتاج إعداد',

  NEW_LABEL_ACTIVE:
    'نعم'

});


/* ==========================================================
 * Gmail API
 * ==========================================================
 */


/**
 * التأكد من تفعيل Gmail API.
 */
function gmailLabelSyncEnsureService_() {

  if (
    typeof Gmail === 'undefined' ||
    !Gmail.Users ||
    !Gmail.Users.Labels ||
    !Gmail.Users.Messages
  ) {

    throw new Error(

      'Gmail API غير مفعلة. ' +
      'اضغط + بجانب Services، ثم اختر Gmail API واضغط Add.'

    );

  }

}


/**
 * قراءة Gmail Labels مرة واحدة وإرجاع خرائط جاهزة.
 */
function gmailGetLabelsSnapshot_() {

  gmailLabelSyncEnsureService_();


  var response =
    Gmail.Users.Labels.list(
      'me'
    );


  var labels =
    response.labels || [];


  var byName =
    new Map();


  var byId =
    new Map();


  labels.forEach(
    function(label) {

      var id =
        appText(
          label.id
        );


      var name =
        appText(
          label.name
        );


      if (
        !id ||
        !name
      ) {

        return;

      }


      var record = {

        id:
          id,

        name:
          name,

        type:
          appText(
            label.type
          )

      };


      byName.set(
        appKey(name),
        record
      );


      byId.set(
        id,
        record
      );

    }
  );


  return {

    labels:
      labels,

    byName:
      byName,

    byId:
      byId

  };

}


/**
 * قراءة تصنيفات Gmail عبر Gmail API.
 *
 * تم الحفاظ على نفس اسم الدالة القديمة.
 */
function gmailGetLabelsByName() {

  try {

    return gmailGetLabelsSnapshot_()
      .byName;


  } catch (error) {

    throw new Error(

      'خدمة Gmail API غير مفعلة. ' +

      'اضغط + بجانب Services، ثم اختر Gmail API واضغط Add. ' +

      'التفاصيل: ' +

      String(
        error && error.message
          ? error.message
          : error
      )

    );

  }

}


/**
 * جمع الرسائل حسب التصنيف الموجود على الرسالة نفسها.
 */
function gmailCollectAssignments(
  guideItems
) {

  var snapshot =
    gmailGetLabelsSnapshot_();


  var labelsByName =
    snapshot.byName;


  var labelsById =
    snapshot.byId;


  var assignmentMap =
    new Map();


  (guideItems || []).forEach(
    function(guideItem) {

      var storedLabelId =
        appText(

          guideItem.gmailLabelId ||

          guideItem.labelId ||

          ''

        );


      var label =
        null;


      /**
       * الأفضل استخدام Gmail ID
       * إذا كان موجودًا وصحيحًا.
       */
      if (
        storedLabelId &&
        labelsById.has(
          storedLabelId
        )
      ) {

        label =
          labelsById.get(
            storedLabelId
          );

      }


      /**
       * fallback إلى اسم البند.
       */
      if (
        !label
      ) {

        label =
          labelsByName.get(

            appKey(
              guideItem.item
            )

          );

      }


      if (
        !label
      ) {

        return;

      }


      var pageToken =
        null;


      var collected =
        0;


      do {

        var remaining =

          APP_CONFIG.MAX_MESSAGES_PER_LABEL -

          collected;


        if (
          remaining <= 0
        ) {

          break;

        }


        var options = {

          labelIds:
            [
              label.id
            ],

          maxResults:
            Math.min(
              100,
              remaining
            ),

          includeSpamTrash:
            false

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


        var references =
          response.messages || [];


        references.forEach(
          function(reference) {

            var messageId =
              appText(
                reference.id
              );


            if (
              !messageId
            ) {

              return;

            }


            if (
              !assignmentMap.has(
                messageId
              )
            ) {

              assignmentMap.set(

                messageId,

                {

                  messageId:
                    messageId,

                  items:
                    []

                }

              );

            }


            var assignment =
              assignmentMap.get(
                messageId
              );


            var alreadyAdded =
              assignment.items.some(

                function(item) {

                  /**
                   * نفضل Gmail ID.
                   */
                  var existingId =
                    appText(

                      item.gmailLabelId ||

                      item.labelId ||

                      ''

                    );


                  var incomingId =
                    appText(

                      guideItem.gmailLabelId ||

                      guideItem.labelId ||

                      ''

                    );


                  if (
                    existingId &&
                    incomingId
                  ) {

                    return (
                      existingId ===
                      incomingId
                    );

                  }


                  return (

                    appKey(
                      item.item
                    ) ===

                    appKey(
                      guideItem.item
                    )

                  );

                }

              );


            if (
              !alreadyAdded
            ) {

              assignment.items.push(
                guideItem
              );

            }

          }
        );


        collected +=
          references.length;


        pageToken =
          response.nextPageToken ||
          null;


      } while (

        pageToken &&

        collected <
        APP_CONFIG.MAX_MESSAGES_PER_LABEL

      );

    }
  );


  return Array.from(
    assignmentMap.values()
  );

}


/**
 * قراءة رسالة Gmail بالمعرف.
 */
function gmailGetMessage(
  messageId
) {

  try {

    return GmailApp
      .getMessageById(
        messageId
      );


  } catch (error) {

    return null;

  }

}


/**
 * قراءة نص الرسالة دون HTML.
 */
function gmailPlainBody(
  message
) {

  try {

    return String(

      message.getPlainBody() ||

      ''

    );


  } catch (error) {

    return '';

  }

}


/* ==========================================================
 * تحليل الرسائل البنكية
 * ==========================================================
 */


/**
 * تحليل رسالة البنك.
 */
function bankParseMessage(
  rawBody,
  itemName,
  emailDate,
  sender,
  subject
) {

  var text =
    bankPrepareMessage(
      rawBody
    );


  var amount =
    bankExtractAmount(
      text
    );


  var dateValue =
    bankExtractDate(
      text,
      emailDate
    );


  var dateDisplay =
    Utilities.formatDate(

      dateValue,

      appTimeZone(),

      'dd/MM/yyyy HH:mm:ss'

    );


  var credited =
    /\bcredited\b/i.test(
      text
    );


  var debited =
    /\bdebited\b/i.test(
      text
    );


  var profit =

    /\bcredited\s+by\s+profit\b/i
      .test(
        text
      )

    ||

    (
      /\bMudaraba\b/i.test(
        text
      )

      &&

      /\bprofit\b/i.test(
        text
      )
    );


  var cashWithdrawal =

    /\bATM\b/i.test(
      text
    )

    ||

    /\bcash withdrawal\b/i.test(
      text
    )

    ||

    /\bwithdrawn\b/i.test(
      text
    );


  var billPayment =

    /\bbill payment\b/i.test(
      text
    )

    ||

    /\butility payment\b/i.test(
      text
    )

    ||

    /\belectricity bill\b/i.test(
      text
    )

    ||

    /\bwater bill\b/i.test(
      text
    );


  var merchant =
    bankExtractMerchant(
      text
    );


  var transferParty =
    bankExtractTransferParty(
      text
    );


  var phoneTransfer =

    /\bEasy Transfer\b/i.test(
      text
    )

    ||

    /\bMobile Payment\b/i.test(
      text
    )

    ||

    /\bby\s+Transfer\b/i.test(
      text
    );


  var cardMentioned =

    /\bDebit Card\b/i.test(
      text
    )

    ||

    /\bCredit Card\b/i.test(
      text
    )

    ||

    /\bCard No\b/i.test(
      text
    )

    ||

    /\bPOS\b/i.test(
      text
    );


  var operationType =
    'غير محدد';


  var party =
    '';


  var channel =
    'غير محدد';


  var partyFromItem =
    false;


  if (
    profit
  ) {

    operationType =
      'دخل';

    party =
      'أرباح حساب المضاربة';

    channel =
      'أرباح بنكية';

  }


  else if (
    cashWithdrawal
  ) {

    operationType =
      'مصروف';

    party =
      merchant ||
      'سحب نقدي';

    channel =
      'سحب نقدي';

  }


  else if (
    billPayment
  ) {

    operationType =
      debited
        ? 'مصروف'
        : 'غير محدد';


    party =
      merchant ||
      itemName;


    channel =
      'دفع فاتورة';


    partyFromItem =
      !merchant;

  }


  else if (
    merchant
  ) {

    operationType =

      debited

        ? 'مصروف'

        : credited

          ? 'استرداد'

          : 'غير محدد';


    party =
      merchant;


    channel =

      bankIsOnlineMerchant(
        merchant
      )

        ? 'شراء إلكتروني'

        : 'شراء بالبطاقة';

  }


  else if (
    transferParty
  ) {

    operationType =

      credited

        ? 'تحويل وارد'

        : debited

          ? 'تحويل صادر'

          : 'غير محدد';


    party =
      transferParty;


    channel =
      'تحويل بنكي';

  }


  else if (
    phoneTransfer
  ) {

    operationType =

      credited

        ? 'تحويل وارد'

        : debited

          ? 'تحويل صادر'

          : 'غير محدد';


    party =
      itemName;


    channel =
      'تحويل برقم الهاتف';


    partyFromItem =
      true;

  }


  else if (
    cardMentioned
  ) {

    operationType =

      debited

        ? 'مصروف'

        : credited

          ? 'استرداد'

          : 'غير محدد';


    party =
      itemName;


    channel =
      'شراء بالبطاقة';


    partyFromItem =
      true;

  }


  else if (
    credited ||
    debited
  ) {

    operationType =
      credited
        ? 'تحويل وارد'
        : 'تحويل صادر';


    party =
      itemName;


    channel =
      'تحويل برقم الهاتف';


    partyFromItem =
      true;

  }


  party =
    appText(
      party
    );


  var amountDisplay =

    Number.isFinite(
      amount
    )

      ? amount.toFixed(
          3
        ) +
        ' ر.ع'

      : '';


  var summary = [

    operationType,

    amountDisplay,

    dateDisplay,

    party,

    channel

  ]

    .filter(
      function(value) {

        return (
          value !==
          ''
        );

      }
    )

    .join(
      ' | '
    );


  return {

    amount:
      amount,

    dateValue:
      dateValue,

    dateDisplay:
      dateDisplay,

    operationType:
      operationType,

    party:
      party,

    channel:
      channel,


    bank:
      bankDetectBank(

        sender,

        subject,

        text

      ),


    partyFromItem:
      partyFromItem,

    summary:
      summary

  };

}


/**
 * استخراج اسم التاجر.
 */
function bankExtractMerchant(
  text
) {

  var source =
    appText(
      text
    );


  var merchant =
    '';


  var datedMatch =
    source.match(

      /\bon\s+\d{2}\/\d{2}\/\d{4}(?:\s+\d{1,2}:\d{2}(?::\d{2})?)?\s+for\s+(.+)$/i

    );


  if (
    datedMatch &&
    datedMatch[1]
  ) {

    merchant =
      datedMatch[1];

  }


  if (
    !merchant
  ) {

    var regex =

      /\bfor\s+(?!OMR\s*[0-9])(.+)$/gi;


    var match;


    var lastMatch =
      null;


    while (

      (
        match =
          regex.exec(
            source
          )
      )

      !==
      null

    ) {

      lastMatch =
        match;

    }


    if (
      lastMatch &&
      lastMatch[1]
    ) {

      merchant =
        lastMatch[1];

    }

  }


  if (
    !merchant
  ) {

    return '';

  }


  merchant =
    merchant

      .split(
        '|'
      )[0]

      .replace(
        /\\+/g,
        ' - '
      )

      .replace(
        /\s+/g,
        ' '
      )

      .trim();


  if (
    /NETFLIX\.COM/i.test(
      merchant
    )
  ) {

    return 'NETFLIX.COM';

  }


  merchant =
    merchant

      .replace(
        /\s+SS\s*-\s*.*$/i,
        ''
      )

      .replace(
        /\s+SS$/i,
        ''
      )

      .replace(
        /\s+\d{3,}[A-Z]?\s*$/i,
        ''
      )

      .replace(
        /\s*-\s*[A-Z]\.?(?:\s*)$/i,
        ''
      )

      .replace(
        /^[\s.,;:|\\/-]+/,
        ''
      )

      .replace(
        /[\s.,;:|\\/-]+$/,
        ''
      )

      .replace(
        /\s+/g,
        ' '
      )

      .trim();


  return merchant.substring(
    0,
    120
  );

}


/**
 * استخراج اسم طرف التحويل.
 */
function bankExtractTransferParty(
  text
) {

  var source =
    appText(
      text
    );


  var match =
    source.match(
      /\bfrom\s+(.+)$/i
    );


  if (
    !match
  ) {

    match =
      source.match(
        /\bby\s+(.+)$/i
      );

  }


  if (
    !match ||
    !match[1]
  ) {

    return '';

  }


  var party =
    appText(

      match[1]
        .split(
          '|'
        )[0]

    );


  var genericNames = [

    'easy transfer',

    'transfer',

    'mobile payment'

  ];


  if (

    genericNames.includes(
      party.toLowerCase()
    )

    ||

    /^profit\b/i.test(
      party
    )

    ||

    /^OMR\b/i.test(
      party
    )

  ) {

    return '';

  }


  party =
    party

      .replace(
        /^[\s.,;:|\\/-]+/,
        ''
      )

      .replace(
        /[\s.,;:|\\/-]+$/,
        ''
      )

      .trim();


  return party.substring(
    0,
    120
  );

}


/**
 * تنظيف رسالة البنك.
 */
function bankPrepareMessage(
  rawBody
) {

  var text =
    String(
      rawBody || ''
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


  text =
    text.split(

      /Your available balance|Available Bal|_{5,}|Disclaimer\s*:|Confidentiality Notice|إخلاء المسؤولية/i

    )[0];


  return appText(
    text
  );

}


/**
 * استخراج المبلغ.
 */
function bankExtractAmount(
  text
) {

  var match =
    String(
      text || ''
    ).match(

      /\bOMR\s*([0-9,]+(?:\.[0-9]{1,3})?)/i

    );


  if (
    !match
  ) {

    return NaN;

  }


  var amount =
    Number(

      match[1]
        .replace(
          /,/g,
          ''
        )

    );


  return Number.isFinite(
    amount
  )
    ? amount
    : NaN;

}


/**
 * استخراج التاريخ.
 */
function bankExtractDate(
  text,
  emailDate
) {

  var match =
    String(
      text || ''
    ).match(

      /\b(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/i

    );


  if (
    match
  ) {

    var value =
      new Date(

        Number(
          match[3]
        ),

        Number(
          match[2]
        ) - 1,

        Number(
          match[1]
        ),

        Number(
          match[4] || 0
        ),

        Number(
          match[5] || 0
        ),

        Number(
          match[6] || 0
        )

      );


    if (
      !isNaN(
        value.getTime()
      )
    ) {

      return value;

    }

  }


  if (

    emailDate instanceof Date &&

    !isNaN(
      emailDate.getTime()
    )

  ) {

    return emailDate;

  }


  return new Date();

}


/**
 * تحديد الشراء الإلكتروني.
 */
function bankIsOnlineMerchant(
  merchant
) {

  var value =
    String(
      merchant || ''
    )
      .toUpperCase();


  var keywords = [

    'NETFLIX',

    'AMAZON',

    'GOOGLE',

    'APPLE.COM',

    'PAYPAL',

    'SPOTIFY',

    'MICROSOFT',

    'YOUTUBE',

    'FACEBOOK',

    'INSTAGRAM',

    'STEAM',

    'PLAYSTATION'

  ];


  return keywords.some(
    function(keyword) {

      return value.includes(
        keyword
      );

    }
  );

}


/**
 * تحديد البنك.
 */
function bankDetectBank(
  sender,
  subject,
  text
) {

  var value = (

    String(
      sender || ''
    )

    + ' ' +

    String(
      subject || ''
    )

    + ' ' +

    String(
      text || ''
    )

  ).toLowerCase();


  if (

    value.includes(
      'ahlibank'
    )

    ||

    value.includes(
      'ahli bank'
    )

    ||

    value.includes(
      'al ahli'
    )

  ) {

    return 'البنك الأهلي';

  }


  if (

    value.includes(
      'sohar international'
    )

    ||

    value.includes(
      'bank sohar'
    )

    ||

    value.includes(
      'sohar'
    )

  ) {

    return 'بنك صحار';

  }


  if (
    value.includes(
      'meethaq'
    )
  ) {

    return 'ميثاق';

  }


  if (

    value.includes(
      'bank muscat'
    )

    ||

    value.includes(
      'bankmuscat'
    )

  ) {

    return 'بنك مسقط';

  }


  if (
    value.includes(
      'dhofar'
    )
  ) {

    return 'بنك ظفار';

  }


  if (

    value.includes(
      'bank nizwa'
    )

    ||

    value.includes(
      'nizwa'
    )

  ) {

    return 'بنك نزوى';

  }


  if (

    value.includes(
      'alizz'
    )

    ||

    value.includes(
      'al izz'
    )

  ) {

    return 'العز الإسلامي';

  }


  if (

    value.includes(
      'oman arab bank'
    )

    ||

    value.includes(
      'oab'
    )

  ) {

    return 'البنك العربي العماني';

  }


  if (

    value.includes(
      'national bank of oman'
    )

    ||

    value.includes(
      'nbo'
    )

  ) {

    return 'البنك الوطني العماني';

  }


  return 'غير محدد';

}


/**
 * إنشاء حالة التسجيل.
 */
function bankRegistrationStatus(
  parsed,
  guideItem,
  matchingItems
) {

  var notes =
    [];


  if (
    !Number.isFinite(
      parsed.amount
    )
  ) {

    notes.push(
      'المبلغ غير واضح'
    );

  }


  if (
    !parsed.party
  ) {

    notes.push(
      'الطرف غير واضح'
    );

  }


  if (

    !parsed.channel ||

    parsed.channel ===
    'غير محدد'

  ) {

    notes.push(
      'قناة العملية غير واضحة'
    );

  }


  if (
    !guideItem.classification
  ) {

    notes.push(
      'التصنيف غير موجود في دليل البنود'
    );

  }


  if (
    !guideItem.system
  ) {

    notes.push(
      'النظام غير موجود في دليل البنود'
    );

  }


  if (
    matchingItems.length >
    1
  ) {

    notes.push(

      'الرسالة تحمل أكثر من بند: ' +

      matchingItems
        .map(
          function(item) {

            return item.item;

          }
        )
        .join(
          '، '
        )

    );

  }


  if (

    bankMovementConflict(

      guideItem.movementType,

      parsed.operationType

    )

  ) {

    notes.push(
      'اتجاه العملية لا يطابق نوع الحركة في دليل البنود'
    );

  }


  if (
    notes.length >
    0
  ) {

    return (

      'يحتاج مراجعة — ' +

      notes.join(
        '، '
      )

    );

  }


  if (
    parsed.partyFromItem
  ) {

    return (
      'مسجل تلقائيًا — الطرف مأخوذ من البند'
    );

  }


  return 'مسجل تلقائيًا';

}


/**
 * مقارنة اتجاه العملية.
 */
function bankMovementConflict(
  guideMovementType,
  parsedOperationType
) {

  var guideType =
    appText(
      guideMovementType
    )
      .toLowerCase();


  var parsedType =
    appText(
      parsedOperationType
    )
      .toLowerCase();


  if (

    !guideType ||

    !parsedType ||

    parsedType ===
    'غير محدد'

  ) {

    return false;

  }


  var guideIsExpense =

    guideType.includes(
      'مصروف'
    )

    ||

    guideType.includes(
      'صادر'
    )

    ||

    guideType.includes(
      'سحب'
    );


  var guideIsIncome =

    guideType.includes(
      'دخل'
    )

    ||

    guideType.includes(
      'إيراد'
    )

    ||

    guideType.includes(
      'وارد'
    );


  var parsedIsExpense =

    parsedType.includes(
      'مصروف'
    )

    ||

    parsedType.includes(
      'تحويل صادر'
    )

    ||

    parsedType.includes(
      'سحب'
    );


  var parsedIsIncome =

    parsedType.includes(
      'دخل'
    )

    ||

    parsedType.includes(
      'تحويل وارد'
    )

    ||

    parsedType.includes(
      'استرداد'
    );


  return (

    (
      guideIsExpense &&
      parsedIsIncome
    )

    ||

    (
      guideIsIncome &&
      parsedIsExpense
    )

  );

}


/* ==========================================================
 * مزامنة Gmail Labels مع دليل البنود
 * ==========================================================
 */


/**
 * الدالة الرئيسية.
 */
function syncGmailLabelsToGuide() {

  return syncGmailLabelsToGuideDetailed();

}


/**
 * تنفيذ المزامنة التفصيلية.
 */
function syncGmailLabelsToGuideDetailed() {

  gmailLabelSyncEnsureService_();


  var lock =
    LockService
      .getScriptLock();


  if (
    !lock.tryLock(
      5000
    )
  ) {

    console.log(

      'تم تجاوز المزامنة لأن مزامنة أخرى ما زالت تعمل.'

    );


    return null;

  }


  try {

    var ss =
      appActiveSpreadsheet();


    var sheet =
      appSheet(

        ss,

        GMAIL_LABEL_SYNC_CONFIG
          .GUIDE_SHEET

      );


    /**
     * تجهيز الورقة.
     */
    gmailLabelSyncPrepareSheet_(
      sheet
    );


    /**
     * ======================================================
     * قراءة Gmail Labels مرة واحدة
     * ======================================================
     */

    var snapshot =
      gmailGetLabelsSnapshot_();


    var allGmailLabels =
      snapshot.labels

        .filter(
          function(label) {

            return (

              appKey(
                label.type
              )

              ===
              'user'

            );

          }
        )

        .map(
          function(label) {

            return {

              id:
                appText(
                  label.id
                ),

              name:
                appText(
                  label.name
                )

            };

          }
        )

        .filter(
          function(label) {

            return (

              label.id !==
              ''

              &&

              label.name !==
              ''

            );

          }
        );


    /**
     * Labels تحليلية وليست بنودًا مالية.
     */
    var reservedAnalyticLabels =
      gmailLabelSyncReservedLabels_();


    var gmailLabels =
      allGmailLabels

        .filter(
          function(label) {

            var normalized =
              gmailLabelSyncNormalize_(
                label.name
              );


            return (

              !reservedAnalyticLabels[
                normalized
              ]

            );

          }
        )

        .sort(
          function(
            first,
            second
          ) {

            return first.name.localeCompare(

              second.name,

              'ar'

            );

          }
        );


    /**
     * خرائط Gmail.
     */
    var gmailById =
      new Map();


    var gmailByName =
      new Map();


    gmailLabels.forEach(
      function(label) {

        gmailById.set(
          label.id,
          label
        );


        gmailByName.set(

          gmailLabelSyncNormalize_(
            label.name
          ),

          label

        );

      }
    );


    /**
     * ======================================================
     * قراءة دليل البنود مرة واحدة
     * ======================================================
     */

    var lastRow =
      sheet.getLastRow();


    var oldRowCount =
      Math.max(
        0,
        lastRow - 1
      );


    var existingRows =
      oldRowCount > 0

        ? sheet
            .getRange(

              2,

              1,

              oldRowCount,

              12

            )
            .getValues()

        : [];


    /**
     * نسخة قابلة للتعديل في الذاكرة.
     */
    var workingRows =
      existingRows.map(
        function(row) {

          return row.slice();

        }
      );


    var rowsById =
      new Map();


    var rowsByName =
      new Map();


    workingRows.forEach(
      function(
        row,
        index
      ) {

        var itemName =
          appText(
            row[0]
          );


        var labelId =
          appText(
            row[6]
          );


        var record = {

          index:
            index,

          itemName:
            itemName,

          labelId:
            labelId,

          row:
            row

        };


        if (
          labelId
        ) {

          rowsById.set(
            labelId,
            record
          );

        }


        if (
          itemName
        ) {

          rowsByName.set(

            gmailLabelSyncNormalize_(
              itemName
            ),

            record

          );

        }

      }
    );


    var now =
      new Date();


    var rowsToAdd =
      [];


    var addedCount =
      0;


    var renamedCount =
      0;


    var linkedCount =
      0;


    var refreshedCount =
      0;


    var deletedCount =
      0;


    /**
     * ======================================================
     * إضافة / تحديث / إعادة تسمية
     * ======================================================
     */

    gmailLabels.forEach(
      function(gmailLabel) {

        var gmailId =
          gmailLabel.id;


        var gmailName =
          gmailLabel.name;


        /**
         * 1. المطابقة بالـ Gmail ID.
         */
        var existingById =
          rowsById.get(
            gmailId
          );


        if (
          existingById
        ) {

          var row =
            existingById.row;


          var oldName =
            appText(
              row[0]
            );


          if (
            oldName !==
            gmailName
          ) {

            row[0] =
              gmailName;


            row[7] =
              'تم تحديث اسم البند من Gmail';


            renamedCount++;

          }


          else {

            row[7] =
              'متزامن';

          }


          /**
           * نحدث بيانات المزامنة فقط.
           */
          row[6] =
            gmailId;


          row[8] =
            now;


          refreshedCount++;


          return;

        }


        /**
         * 2. المطابقة بالاسم.
         */
        var normalizedName =
          gmailLabelSyncNormalize_(
            gmailName
          );


        var existingByName =
          rowsByName.get(
            normalizedName
          );


        if (
          existingByName
        ) {

          var linkedRow =
            existingByName.row;


          linkedRow[6] =
            gmailId;


          linkedRow[7] =
            'تم ربط البند بمعرف Gmail';


          linkedRow[8] =
            now;


          existingByName.labelId =
            gmailId;


          rowsById.set(
            gmailId,
            existingByName
          );


          linkedCount++;


          return;

        }


        /**
         * 3. Gmail Label جديد.
         */
        rowsToAdd.push([

          gmailName,

          GMAIL_LABEL_SYNC_CONFIG
            .NEW_LABEL_CLASSIFICATION,

          GMAIL_LABEL_SYNC_CONFIG
            .NEW_LABEL_SYSTEM,

          GMAIL_LABEL_SYNC_CONFIG
            .NEW_LABEL_MOVEMENT,

          GMAIL_LABEL_SYNC_CONFIG
            .NEW_LABEL_ACTION,

          GMAIL_LABEL_SYNC_CONFIG
            .NEW_LABEL_ACTIVE,

          gmailId,

          'تصنيف جديد من Gmail — يحتاج إعداد',

          now,

          '',

          '',

          ''

        ]);


        addedCount++;

      }
    );


    /**
     * ======================================================
     * حذف البنود غير الموجودة في Gmail
     * ======================================================
     *
     * يتم الآن في الذاكرة بدل deleteRow المتكرر.
     */

    var finalExistingRows =
      workingRows.filter(
        function(row) {

          var itemName =
            appText(
              row[0]
            );


          var labelId =
            appText(
              row[6]
            );


          /**
           * الصف الفارغ يبقى.
           */
          if (
            !itemName
          ) {

            return true;

          }


          var normalizedItem =
            gmailLabelSyncNormalize_(
              itemName
            );


          /**
           * إزالة Labels التحليلية القديمة.
           */
          if (
            reservedAnalyticLabels[
              normalizedItem
            ]
          ) {

            deletedCount++;

            return false;

          }


          /**
           * الصف اليدوي بدون Gmail ID
           * لا يحذف.
           */
          if (
            !labelId
          ) {

            return true;

          }


          /**
           * Gmail Label حذف من Gmail.
           */
          if (
            !gmailById.has(
              labelId
            )
          ) {

            deletedCount++;

            return false;

          }


          return true;

        }
      );


    /**
     * إضافة البنود الجديدة في نهاية الورقة.
     */
    var finalRows =
      finalExistingRows.concat(
        rowsToAdd
      );


    /**
     * ======================================================
     * الكتابة دفعة واحدة
     * ======================================================
     */

    var finalRowCount =
      finalRows.length;


    var requiredRows =
      finalRowCount + 1;


    if (
      sheet.getMaxRows() <
      requiredRows
    ) {

      sheet.insertRowsAfter(

        sheet.getMaxRows(),

        requiredRows -
        sheet.getMaxRows()

      );

    }


    var clearRowCount =
      Math.max(

        oldRowCount,

        finalRowCount

      );


    if (
      clearRowCount >
      0
    ) {

      sheet
        .getRange(

          2,

          1,

          clearRowCount,

          12

        )
        .clearContent();

    }


    if (
      finalRowCount >
      0
    ) {

      sheet
        .getRange(

          2,

          1,

          finalRowCount,

          12

        )
        .setValues(
          finalRows
        );

    }


    /**
     * التنسيق.
     */
    gmailLabelSyncFormatSheet_(
      sheet
    );


    SpreadsheetApp.flush();


    /**
     * النتيجة.
     */
    var result = {

      success:
        true,

      gmailLabels:
        gmailLabels.length,

      added:
        addedCount,

      renamed:
        renamedCount,

      linked:
        linkedCount,

      refreshed:
        refreshedCount,

      deleted:
        deletedCount,

      guideRows:
        finalRowCount,

      completedAt:
        Utilities.formatDate(

          new Date(),

          appTimeZone(
            ss
          ),

          'dd/MM/yyyy HH:mm:ss'

        )

    };


    appToast(

      'تصنيفات Gmail: ' +
        result.gmailLabels +

      ' | جديد: ' +
        result.added +

      ' | تغير الاسم: ' +
        result.renamed +

      ' | تم الربط: ' +
        result.linked +

      ' | حذف: ' +
        result.deleted,

      'مزامنة دليل البنود',

      10

    );


    console.log(

      JSON.stringify(
        result,
        null,
        2
      )

    );


    return result;


  } finally {

    lock.releaseLock();

  }

}


/* ==========================================================
 * تجهيز دليل البنود
 * ==========================================================
 */


/**
 * تجهيز الورقة.
 */
function gmailLabelSyncPrepareSheet_(
  sheet
) {

  if (
    sheet.getMaxColumns() <
    12
  ) {

    sheet.insertColumnsAfter(

      sheet.getMaxColumns(),

      12 -
      sheet.getMaxColumns()

    );

  }


  var headers = [

    'البند',

    'التصنيف',

    'النظام',

    'نوع الحركة',

    'الإجراء التلقائي',

    'نشط',

    'معرف تصنيف Gmail',

    'حالة المزامنة',

    'آخر مزامنة',

    'الفئة',

    'الفترة',

    'الصنف'

  ];


  var currentHeaders =
    sheet
      .getRange(
        1,
        1,
        1,
        12
      )
      .getValues()[0];


  var needsHeaderUpdate =
    headers.some(
      function(
        header,
        index
      ) {

        return (

          appText(
            currentHeaders[index]
          )

          !==

          header

        );

      }
    );


  if (
    needsHeaderUpdate
  ) {

    sheet
      .getRange(
        1,
        1,
        1,
        12
      )
      .setValues([
        headers
      ]);

  }


  sheet
    .getRange(
      1,
      1,
      1,
      12
    )
    .setFontWeight(
      'bold'
    )
    .setHorizontalAlignment(
      'center'
    );


  sheet.setFrozenRows(
    1
  );


  sheet.setRightToLeft(
    true
  );

}


/**
 * تنسيق دليل البنود.
 */
function gmailLabelSyncFormatSheet_(
  sheet
) {

  sheet.setColumnWidth(
    1,
    240
  );


  sheet.setColumnWidth(
    2,
    180
  );


  sheet.setColumnWidth(
    3,
    180
  );


  sheet.setColumnWidth(
    4,
    150
  );


  sheet.setColumnWidth(
    5,
    220
  );


  sheet.setColumnWidth(
    6,
    90
  );


  sheet.setColumnWidth(
    7,
    170
  );


  sheet.setColumnWidth(
    8,
    290
  );


  sheet.setColumnWidth(
    9,
    180
  );


  sheet.setColumnWidth(
    10,
    120
  );


  sheet.setColumnWidth(
    11,
    120
  );


  sheet.setColumnWidth(
    12,
    120
  );


  /**
   * إخفاء Gmail ID.
   */
  try {

    sheet.hideColumns(
      7
    );


  } catch (error) {

    console.log(
      'تعذر إخفاء عمود معرف Gmail.'
    );

  }


  var dataRows =
    sheet.getLastRow() - 1;


  if (
    dataRows <= 0
  ) {

    return;

  }


  /**
   * تنسيق التاريخ.
   */
  sheet
    .getRange(
      2,
      9,
      dataRows,
      1
    )
    .setNumberFormat(
      'dd/MM/yyyy HH:mm:ss'
    );


  /**
   * الفئة.
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


  sheet
    .getRange(
      2,
      10,
      dataRows,
      1
    )
    .setDataValidation(
      categoryRule
    );


  /**
   * الفترة.
   */
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


  sheet
    .getRange(
      2,
      11,
      dataRows,
      1
    )
    .setDataValidation(
      periodRule
    );


  /**
   * الصنف.
   */
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


  sheet
    .getRange(
      2,
      12,
      dataRows,
      1
    )
    .setDataValidation(
      scopeRule
    );

}


/**
 * Labels التحليلية المحجوزة.
 */
function gmailLabelSyncReservedLabels_() {

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
 * Triggers
 * ==========================================================
 */


/**
 * إنشاء المشغل التلقائي.
 */
function createGmailLabelSyncTrigger() {

  gmailLabelSyncDeleteTriggers_();


  ScriptApp
    .newTrigger(
      'syncGmailLabelsToGuide'
    )
    .timeBased()
    .everyHours(
      1
    )
    .create();


  appToast(

    'تم تفعيل مزامنة تصنيفات Gmail تلقائيًا كل ساعة.',

    'مزامنة دليل البنود',

    10

  );

}


/**
 * حذف مشغل مزامنة Gmail.
 */
function removeGmailLabelSyncTrigger() {

  var deletedCount =
    gmailLabelSyncDeleteTriggers_();


  appToast(

    'تم حذف ' +
      deletedCount +
      ' مشغل لمزامنة التصنيفات.',

    'مزامنة دليل البنود',

    8

  );


  return deletedCount;

}


/**
 * حذف المشغلات القديمة لتجنب التكرار.
 */
function gmailLabelSyncDeleteTriggers_() {

  var deletedCount =
    0;


  ScriptApp
    .getProjectTriggers()
    .forEach(
      function(trigger) {

        if (

          trigger
            .getHandlerFunction()

          ===

          'syncGmailLabelsToGuide'

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
 * توحيد الأسماء العربية
 * ==========================================================
 */


/**
 * توحيد الاسم.
 */
function gmailLabelSyncNormalize_(
  value
) {

  return String(
    value || ''
  )

    .trim()

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
    );

}


/* ==========================================================
 * Tests
 * ==========================================================
 */


/**
 * اختبار المزامنة الحية القديم.
 *
 * تم الحفاظ على نفس Function.
 */
function testGmailGuideLiveSync() {

  var result =
    syncGmailLabelsToGuideDetailed();


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
 * اختبار ملف Gmail الجديد بالكامل.
 */
function testGmailSystem() {

  /**
   * 1. اختبار Gmail API.
   */
  var snapshot =
    gmailGetLabelsSnapshot_();


  /**
   * 2. اختبار محلل البنك.
   */
  var parserTest =
    bankParseMessage(

      'Your account has been debited by OMR 10.500 on 07/08/2026 12:30 for TEST STORE',

      'اختبار',

      new Date(),

      'test@ahlibank.com',

      'Transaction Alert'

    );


  if (
    !Number.isFinite(
      parserTest.amount
    )
  ) {

    throw new Error(
      'فشل اختبار استخراج مبلغ العملية البنكية.'
    );

  }


  /**
   * 3. اختبار المزامنة الحية.
   */
  var syncResult =
    syncGmailLabelsToGuideDetailed();


  var result = {

    success:
      true,

    gmailLabels:
      snapshot.byId.size,

    parser: {

      amount:
        parserTest.amount,

      operationType:
        parserTest.operationType,

      party:
        parserTest.party,

      bank:
        parserTest.bank

    },

    sync:
      syncResult

  };


  console.log(

    JSON.stringify(
      result,
      null,
      2
    )

  );


  appToast(

    'نجح اختبار 10_Gmail.gs',

    'اختبار النظام',

    6

  );


  return result;

}
/* ==========================================================
 * BANK ACCOUNT DETECTION V2
 *
 * إضافة آمنة فوق المحلل الحالي.
 *
 * الوظائف الجديدة:
 * - تحديد الحساب من نص الرسالة.
 * - تحديد الموازنة / مصدر الصرف.
 * - استخراج آخر رصيد فعلي.
 * - تحسين قراءة رسائل ميثاق Card of a/c.
 * - دعم تاريخ مثل 19 NOV 2023.
 *
 * لا يحذف أو يغير:
 * - Gmail Labels
 * - دليل البنود
 * - العمليات
 * - وظائف المزامنة الحالية
 * ==========================================================
 */


/* ==========================================================
 * الاحتفاظ بالمحلل الحالي
 * ==========================================================
 */

var bankParseMessageBeforeAccountV2_ =
  bankParseMessage;


/* ==========================================================
 * المحلل المطور
 * ==========================================================
 */

bankParseMessage =
function(
  rawBody,
  itemName,
  emailDate,
  sender,
  subject
) {

  /*
   * أولًا:
   * تشغيل المحلل القديم كما هو.
   */
  var parsed =
    bankParseMessageBeforeAccountV2_(

      rawBody,
      itemName,
      emailDate,
      sender,
      subject

    ) || {};


  /*
   * نستخدم النص الأصلي هنا.
   *
   * مهم:
   * bankPrepareMessage القديم يحذف جزء الرصيد،
   * لذلك لا نستخدمه لاستخراج الحساب والرصيد.
   */
  var rawText =
    String(
      rawBody || ''
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


  /* ======================================================
     1. اكتشاف الحساب
     ====================================================== */

  var account =
    bankDetectAccountV2_(

      rawText,
      sender,
      subject

    );


  /* ======================================================
     2. استخراج الرصيد الفعلي
     ====================================================== */

  var availableBalance =
    bankExtractAvailableBalanceV2_(
      rawText
    );


  /* ======================================================
     3. اتجاه الحركة البنكية
     ====================================================== */

  var accountMovement =
    bankDetectAccountMovementV2_(
      rawText
    );


  /* ======================================================
     4. تاريخ العملية بصيغ إضافية
     ====================================================== */

  var exactDate =
    bankExtractExactDateV2_(
      rawText
    );


  if (
    exactDate
  ) {

    parsed.dateValue =
      exactDate;


    parsed.dateDisplay =
      Utilities.formatDate(

        exactDate,

        appTimeZone(),

        'dd/MM/yyyy HH:mm:ss'

      );

  }


  /* ======================================================
     5. تحسين رسالة ميثاق Card of a/c
     ====================================================== */

  var meethaqCardMerchant =
    bankExtractMeethaqMerchantV2_(
      rawText
    );


  if (
    accountMovement ===
      'debit' &&

    meethaqCardMerchant
  ) {

    parsed.operationType =
      'مصروف';


    parsed.party =
      meethaqCardMerchant;


    parsed.channel =
      'شراء بالبطاقة';


    parsed.partyFromItem =
      false;

  }


  /* ======================================================
     6. بيانات الحساب الجديدة
     ====================================================== */

  parsed.accountDetected =
    Boolean(
      account.matched
    );


  parsed.accountKey =
    account.accountKey;


  parsed.accountName =
    account.accountName;


  parsed.budgetKey =
    account.budgetKey;


  parsed.accountRole =
    account.accountRole;


  parsed.accountMask =
    account.accountMask;


  /*
   * إذا تم التعرف على الحساب،
   * نستخدم البنك المرتبط به.
   */
  if (
    account.matched
  ) {

    parsed.bank =
      account.bank;

  }


  parsed.accountMovement =
    accountMovement;


  parsed.availableBalance =

    Number.isFinite(
      availableBalance
    )

      ? availableBalance

      : null;


  parsed.balanceDetected =
    Number.isFinite(
      availableBalance
    );


  /*
   * تاريخ الرصيد هو نفس تاريخ العملية
   * لأن الرصيد الموجود بالرسالة هو
   * الرصيد بعد هذه العملية.
   */
  parsed.balanceDate =
    parsed.balanceDetected

      ? parsed.dateValue

      : null;


  /* ======================================================
     7. إعادة بناء الملخص بعد التحسين
     ====================================================== */

  var amountDisplay =

    Number.isFinite(
      parsed.amount
    )

      ? parsed.amount.toFixed(
          3
        ) +
        ' ر.ع'

      : '';


  parsed.summary = [

    parsed.operationType,

    amountDisplay,

    parsed.dateDisplay,

    parsed.party,

    parsed.channel,

    parsed.accountName,

    parsed.balanceDetected

      ? (
          'الرصيد ' +
          parsed.availableBalance.toFixed(
            3
          ) +
          ' ر.ع'
        )

      : ''

  ]

    .filter(
      function(value) {

        return (
          value !== '' &&
          value !== null &&
          value !== undefined
        );

      }
    )

    .join(
      ' | '
    );


  return parsed;

};


/* ==========================================================
 * اكتشاف الحساب
 * ==========================================================
 */

function bankDetectAccountV2_(
  rawText,
  sender,
  subject
) {

  var source = (

    String(
      rawText || ''
    )

    + ' ' +

    String(
      sender || ''
    )

    + ' ' +

    String(
      subject || ''
    )

  ).toUpperCase();


  /*
   * إزالة المسافات فقط لتسهيل مطابقة
   * أرقام الحسابات المقنعة.
   */
  var compact =
    source.replace(
      /\s+/g,
      ''
    );


  /* ======================================================
     الأهلي 001
     عائلي شهري
     ====================================================== */

  if (
    /0108[0-9#X*]{3,}001/.test(
      compact
    )
  ) {

    return {

      matched:
        true,

      accountKey:
        'AHLI_001',

      accountName:
        'الأهلي 001',

      budgetKey:
        'عائلي شهري',

      accountRole:
        'موازنة صرف',

      bank:
        'البنك الأهلي',

      accountMask:
        '0108…001'

    };

  }


  /* ======================================================
     الأهلي 002
     عائلي سنوي
     ====================================================== */

  if (
    /0108[0-9#X*]{3,}002/.test(
      compact
    )
  ) {

    return {

      matched:
        true,

      accountKey:
        'AHLI_002',

      accountName:
        'الأهلي 002',

      budgetKey:
        'عائلي سنوي',

      accountRole:
        'موازنة صرف',

      bank:
        'البنك الأهلي',

      accountMask:
        '0108…002'

    };

  }


  /* ======================================================
     صحار 70102...01
     شخصي شهري
     ====================================================== */

  if (
    /70102[0-9#X*]{3,}01/.test(
      compact
    )
  ) {

    return {

      matched:
        true,

      accountKey:
        'SOHAR_7010',

      accountName:
        'صحار 7010',

      budgetKey:
        'شخصي شهري',

      accountRole:
        'موازنة صرف',

      bank:
        'بنك صحار',

      accountMask:
        '70102…01'

    };

  }


  /* ======================================================
     صحار 72407...01
     شخصي سنوي
     ====================================================== */

  if (
    /72407[0-9#X*]{3,}01/.test(
      compact
    )
  ) {

    return {

      matched:
        true,

      accountKey:
        'SOHAR_7240',

      accountName:
        'صحار 7240',

      budgetKey:
        'شخصي سنوي',

      accountRole:
        'موازنة صرف',

      bank:
        'بنك صحار',

      accountMask:
        '72407…01'

    };

  }


  /* ======================================================
     ميثاق 21
     تأمين المصروف
     ====================================================== */

  if (
    /0611[0-9#X*]{3,}0021/.test(
      compact
    )
  ) {

    return {

      matched:
        true,

      accountKey:
        'MEETHAQ_21',

      accountName:
        'ميثاق 21',

      budgetKey:
        'تأمين المصروف',

      accountRole:
        'تأمين المصروف',

      bank:
        'ميثاق',

      accountMask:
        '0611…0021'

    };

  }


  /* ======================================================
     ميثاق 22
     تأمين الدخل
     ====================================================== */

  if (
    /0611[0-9#X*]{3,}0022/.test(
      compact
    )
  ) {

    return {

      matched:
        true,

      accountKey:
        'MEETHAQ_22',

      accountName:
        'ميثاق 22',

      budgetKey:
        'تأمين الدخل',

      accountRole:
        'تأمين الدخل',

      bank:
        'ميثاق',

      accountMask:
        '0611…0022'

    };

  }


  /*
   * بنك ظفار:
   * نتركه لاحقًا حتى تتوفر صيغة الرسالة.
   */
  return {

    matched:
      false,

    accountKey:
      '',

    accountName:
      '',

    budgetKey:
      '',

    accountRole:
      '',

    bank:
      bankDetectBank(
        sender,
        subject,
        rawText
      ),

    accountMask:
      ''

  };

}


/* ==========================================================
 * استخراج الرصيد الفعلي
 * ==========================================================
 */

function bankExtractAvailableBalanceV2_(
  rawText
) {

  var source =
    String(
      rawText || ''
    );


  var patterns = [

    /*
     * New Available Balance is OMR801.455
     */
    /New\s+Available\s+Balance\s*(?:is|:)?\s*OMR\s*([0-9,]+(?:\.[0-9]{1,3})?)/i,


    /*
     * Your available balance is OMR 2.660
     */
    /Your\s+available\s+balance\s*(?:is|:)?\s*OMR\s*([0-9,]+(?:\.[0-9]{1,3})?)/i,


    /*
     * Available Bal OMR 26.588
     */
    /Available\s+Bal(?:ance)?\s*(?:is|:)?\s*OMR\s*([0-9,]+(?:\.[0-9]{1,3})?)/i,


    /*
     * Avl Bal OMR 38.310
     */
    /Avl\s+Bal(?:ance)?\s*(?:is|:)?\s*OMR\s*([0-9,]+(?:\.[0-9]{1,3})?)/i

  ];


  for (
    var index = 0;
    index < patterns.length;
    index++
  ) {

    var match =
      source.match(
        patterns[index]
      );


    if (
      !match ||
      !match[1]
    ) {

      continue;

    }


    var amount =
      Number(

        match[1]
          .replace(
            /,/g,
            ''
          )

      );


    if (
      Number.isFinite(
        amount
      )
    ) {

      return amount;

    }

  }


  return NaN;

}


/* ==========================================================
 * اتجاه الحركة البنكية
 * ==========================================================
 */

function bankDetectAccountMovementV2_(
  rawText
) {

  var text =
    String(
      rawText || ''
    );


  /*
   * رسائل ميثاق:
   * Card of a/c ... used for OMR ...
   */
  if (
    /\bCard\s+of\s+a\/c\b.*\bused\s+for\s+OMR\b/i
      .test(
        text
      )
  ) {

    return 'debit';

  }


  if (
    /\bdebited\b/i.test(
      text
    )
  ) {

    return 'debit';

  }


  if (
    /\bcredited\b/i.test(
      text
    )
  ) {

    return 'credit';

  }


  return 'unknown';

}


/* ==========================================================
 * اسم التاجر في رسالة ميثاق
 * ==========================================================
 */

function bankExtractMeethaqMerchantV2_(
  rawText
) {

  var text =
    String(
      rawText || ''
    )

      .replace(
        /\s+/g,
        ' '
      )

      .trim();


  /*
   * مثال:
   *
   * used for OMR 5.000 at SHELL OMAN - AL WADI A
   * on 18/07/2026 19:45:48
   */
  var match =
    text.match(

      /\bused\s+for\s+OMR\s*[0-9,]+(?:\.[0-9]{1,3})?\s+at\s+(.+?)\s+on\s+(?:\d{1,2}\/\d{1,2}\/\d{4}|\d{1,2}\s+[A-Z]{3}\s+\d{4})/i

    );


  if (
    !match ||
    !match[1]
  ) {

    return '';

  }


  return appText(

    match[1]

      .replace(
        /^[\s.,;:|\\/-]+/,
        ''
      )

      .replace(
        /[\s.,;:|\\/-]+$/,
        ''
      )

      .replace(
        /\s+/g,
        ' '
      )

  ).substring(
    0,
    120
  );

}


/* ==========================================================
 * دعم التاريخ DD MON YYYY
 * ==========================================================
 */

function bankExtractExactDateV2_(
  rawText
) {

  var text =
    String(
      rawText || ''
    );


  /*
   * الشكل الحالي:
   * 18/07/2026 19:45:48
   */
  var numericMatch =
    text.match(

      /\b(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/i

    );


  if (
    numericMatch
  ) {

    var numericDate =
      new Date(

        Number(
          numericMatch[3]
        ),

        Number(
          numericMatch[2]
        ) - 1,

        Number(
          numericMatch[1]
        ),

        Number(
          numericMatch[4] || 0
        ),

        Number(
          numericMatch[5] || 0
        ),

        Number(
          numericMatch[6] || 0
        )

      );


    if (
      !isNaN(
        numericDate.getTime()
      )
    ) {

      return numericDate;

    }

  }


  /*
   * مثال ميثاق:
   * 19 NOV 2023 08:14
   */
  var textMatch =
    text.match(

      /\b(\d{1,2})\s+(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)\s+(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/i

    );


  if (
    !textMatch
  ) {

    return null;

  }


  var months = {

    JAN: 0,
    FEB: 1,
    MAR: 2,
    APR: 3,
    MAY: 4,
    JUN: 5,
    JUL: 6,
    AUG: 7,
    SEP: 8,
    OCT: 9,
    NOV: 10,
    DEC: 11

  };


  var month =
    months[
      String(
        textMatch[2]
      ).toUpperCase()
    ];


  if (
    month === undefined
  ) {

    return null;

  }


  var value =
    new Date(

      Number(
        textMatch[3]
      ),

      month,

      Number(
        textMatch[1]
      ),

      Number(
        textMatch[4] || 0
      ),

      Number(
        textMatch[5] || 0
      ),

      Number(
        textMatch[6] || 0
      )

    );


  return isNaN(
    value.getTime()
  )

    ? null

    : value;

}


/* ==========================================================
 * اختبار الحسابات بدون تعديل أي ورقة
 * ==========================================================
 */

function testBankAccountDetectionV2() {

  var samples = [

    {
      name:
        'صحار شخصي سنوي',

      expected:
        'شخصي سنوي',

      text:
        'Your Flexi Wakala Deposit 72407#######01 has been debited OMR 1.000 on 19/08/2026 19:50:53 for AL MASHRABIA UNITED ENT\\MUSCAT\\. Your available balance is OMR 2.660'
    },


    {
      name:
        'صحار شخصي شهري',

      expected:
        'شخصي شهري',

      text:
        'Your SAVING A/C 70102#######01 has been debited OMR 0.750 on 18/08/2026 22:35:32 for GROCERY FRUITS AND VEGE\\AL AMARAT\\. Your available balance is OMR 0.143'
    },


    {
      name:
        'الأهلي عائلي سنوي',

      expected:
        'عائلي سنوي',

      text:
        'Dear Customer, Your Debit Card No 419291######9262 for Acct 0108######002 has been debited for OMR5.000 on 20/08/2026 08:37:40 for STATION:10040614\\SA\\0512O. Available Bal OMR 26.588'
    },


    {
      name:
        'الأهلي عائلي شهري',

      expected:
        'عائلي شهري',

      text:
        'Your Debit Card No 419291######2755 for Acct 0108######001 has been debited for OMR0.100 on 09/08/2026 21:08:35 for TEAGUIDE\\ALAMARAT\\2OMN. Available Bal OMR 0.596'
    },


    {
      name:
        'ميثاق تأمين المصروف',

      expected:
        'تأمين المصروف',

      text:
        'Card of a/c 0611XXXXXXXX0021 used for OMR 5.000 at SHELL OMAN - AL WADI A on 18/07/2026 19:45:48. Avl Bal OMR 38.310.'
    },


    {
      name:
        'ميثاق تأمين الدخل - صرف',

      expected:
        'تأمين الدخل',

      text:
        'Card of a/c 0611XXXXXXXX0022 used for OMR 1.050 at TEA HOUSE AL KHUWAIR O on 19 NOV 2023 08:14. Avl Bal OMR 356.955.'
    },


    {
      name:
        'ميثاق تأمين الدخل - إيداع',

      expected:
        'تأمين الدخل',

      text:
        'Dear Customer, OMR177.000 has been credited to your account 0611########0022 through Acc To Acc Transfer on 23/06/2023. New Available Balance is OMR801.455'
    }

  ];


  var results =
    samples.map(
      function(sample) {

        var parsed =
          bankParseMessage(

            sample.text,

            'اختبار',

            new Date(),

            '',

            'Transaction Alert'

          );


        return {

          test:
            sample.name,

          expected:
            sample.expected,

          detected:
            parsed.budgetKey,

          success:
            parsed.budgetKey ===
            sample.expected,

          accountKey:
            parsed.accountKey,

          account:
            parsed.accountName,

          bank:
            parsed.bank,

          movement:
            parsed.accountMovement,

          operationType:
            parsed.operationType,

          merchant:
            parsed.party,

          amount:
            parsed.amount,

          availableBalance:
            parsed.availableBalance,

          date:
            parsed.dateDisplay

        };

      }
    );


  var success =
    results.every(
      function(row) {

        return row.success;

      }
    );


  var result = {

    success:
      success,

    version:
      'BANK_ACCOUNT_V2',

    tested:
      results.length,

    passed:
      results.filter(
        function(row) {

          return row.success;

        }
      ).length,

    results:
      results

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
 * MITHAQ LEGACY ACCOUNT FORMAT PATCH V3
 *
 * دعم صيغ ميثاق القديمة:
 *
 * - from your a/c xxxx0021
 * - Your account xxxx0022
 * - Account number : xxxx0021
 * - has been utilised as follows
 *
 * الحساب xxxx0001 يظل غير مصنف حتى نعرف استخدامه.
 * ==========================================================
 */


/* ==========================================================
 * الاحتفاظ باكتشاف الحساب V2
 * ==========================================================
 */

var bankDetectAccountBeforeMithaqLegacyV3_ =
  bankDetectAccountV2_;


/* ==========================================================
 * توسيع اكتشاف الحساب
 * ==========================================================
 */

bankDetectAccountV2_ =
function(
  rawText,
  sender,
  subject
) {

  /*
   * أولًا نجرب المحرك الحالي.
   */
  var current =
    bankDetectAccountBeforeMithaqLegacyV3_(

      rawText,
      sender,
      subject

    );


  if (
    current &&
    current.matched
  ) {

    return current;

  }


  var text =
    String(
      rawText || ''
    );


  /*
   * نركز فقط على النص الموجود
   * حول كلمات الحساب.
   *
   * حتى لا نخلط رقم البطاقة برقم الحساب.
   */
  var accountSegments = [];


  var patterns = [

    /*
     * from your a/c xxxx0021
     */
    /(?:from\s+your\s+)?a\/c\s*[:\-]?\s*([0-9Xx#*]{5,})/ig,


    /*
     * Your account xxxx0022
     */
    /(?:your\s+)?account\s*(?:number)?\s*[:\-]?\s*([0-9Xx#*]{5,})/ig,


    /*
     * Acct xxxx
     */
    /acct\s*(?:no\.?|number)?\s*[:\-]?\s*([0-9Xx#*]{5,})/ig

  ];


  patterns.forEach(
    function(pattern) {

      var match;


      while (
        (
          match =
            pattern.exec(
              text
            )
        ) !== null
      ) {

        if (
          match[1]
        ) {

          accountSegments.push(
            String(
              match[1]
            ).toUpperCase()
          );

        }

      }

    }
  );


  /*
   * ميثاق 21
   */
  var has0021 =
    accountSegments.some(
      function(value) {

        return /0021$/.test(
          value
        );

      }
    );


  if (
    has0021
  ) {

    return {

      matched:
        true,

      accountKey:
        'MEETHAQ_21',

      accountName:
        'ميثاق 21',

      budgetKey:
        'تأمين المصروف',

      accountRole:
        'تأمين المصروف',

      bank:
        'ميثاق',

      accountMask:
        '…0021'

    };

  }


  /*
   * ميثاق 22
   */
  var has0022 =
    accountSegments.some(
      function(value) {

        return /0022$/.test(
          value
        );

      }
    );


  if (
    has0022
  ) {

    return {

      matched:
        true,

      accountKey:
        'MEETHAQ_22',

      accountName:
        'ميثاق 22',

      budgetKey:
        'تأمين الدخل',

      accountRole:
        'تأمين الدخل',

      bank:
        'ميثاق',

      accountMask:
        '…0022'

    };

  }


  /*
   * مهم:
   *
   * xxxx0001 ظهر في الرسائل القديمة،
   * لكن لا نعرف حتى الآن لأي موازنة يعود.
   *
   * لذلك لا نخمن.
   */
  return current;

};


/* ==========================================================
 * توسيع اكتشاف اتجاه الحركة
 * ==========================================================
 */

var bankDetectMovementBeforeMithaqLegacyV3_ =
  bankDetectAccountMovementV2_;


bankDetectAccountMovementV2_ =
function(
  rawText
) {

  var current =
    bankDetectMovementBeforeMithaqLegacyV3_(
      rawText
    );


  if (
    current !== 'unknown'
  ) {

    return current;

  }


  var text =
    String(
      rawText || ''
    );


  /*
   * بطاقة ميثاق القديمة:
   *
   * has been utilised as follows
   */
  if (
    /\bhas\s+been\s+utilised\s+as\s+follows\b/i
      .test(
        text
      )
  ) {

    return 'debit';

  }


  /*
   * تحويل/دفع من الحساب:
   *
   * from your a/c
   */
  if (
    /\bfrom\s+your\s+a\/c\b/i
      .test(
        text
      )
  ) {

    return 'debit';

  }


  return current;

};


/* ==========================================================
 * اختبار الصيغ القديمة
 * ==========================================================
 */

function testMithaqLegacyAccountsV3() {

  var samples = [

    {
      name:
        'ميثاق 21 - Mobile Payment',

      expected:
        'MEETHAQ_21',

      text:
        'Payment to TEST from your a/c xxxxXXXXXXXX0021 with 0611 - Meethaq Ghubrah on 27 JUN 26 11:09 using Mobile Payment'
    },


    {
      name:
        'ميثاق 22 - Debit',

      expected:
        'MEETHAQ_22',

      text:
        'Dear customer, Your account xxxxXXXXXXXX0022 with 0611 - Meethaq Ghubrah has been debited by OMR 120'
    },


    {
      name:
        'ميثاق 21 - Utilised Card',

      expected:
        'MEETHAQ_21',

      text:
        'Your card has been utilised as follows: Account number : xxxxXXXXXXXX0021 Description : LULU MUSCAT HYPERMARKET Amount OMR 25.000'
    },


    {
      name:
        'ميثاق 0001 - غير معروف',

      expected:
        '',

      text:
        'Your card has been utilised as follows: Account number : xxxxXXXXXXXX0001 Description : LULU MUSCAT HYPERMARKET Amount OMR 25.000'
    }

  ];


  var results =
    samples.map(
      function(sample) {

        var parsed =
          bankParseMessage(

            sample.text,

            'اختبار',

            new Date(),

            'meethaq',

            'Transaction'

          );


        return {

          test:
            sample.name,

          expected:
            sample.expected,

          detected:
            parsed.accountKey || '',

          success:
            (
              parsed.accountKey || ''
            ) ===
            sample.expected,

          budget:
            parsed.budgetKey || '',

          movement:
            parsed.accountMovement || '',

          balance:
            parsed.availableBalance

        };

      }
    );


  var success =
    results.every(
      function(row) {

        return row.success;

      }
    );


  var result = {

    success:
      success,

    version:
      'MITHAQ_LEGACY_V3',

    tested:
      results.length,

    passed:
      results.filter(
        function(row) {

          return row.success;

        }
      ).length,

    results:
      results

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
