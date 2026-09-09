/**
 * مزامنة Gmail الكاملة مع ورقة العمليات.
 *
 * الخصائص الأساسية:
 * - تعمل على دفعات قصيرة لتفادي حد وقت Apps Script.
 * - تحفظ تقدمها في Script Properties وتستأنف تلقائيًا.
 * - لا تمسح ورقة العمليات.
 * - تمنع التكرار بواسطة معرف رسالة Gmail في العمود A.
 * - تتوقف عند الرسائل ذات أكثر من تصنيف مالي بدل تخمين البند.
 */

var OPERATIONS_COMPLETE_SYNC = Object.freeze({
  STATE_PROPERTY: 'OPERATIONS_COMPLETE_SYNC_STATE_V1',
  TRIGGER_HANDLER: 'operationsCompleteSyncTick',
  PAGE_SIZE: 25,
  MAX_FAILURES_PER_PAGE: 3
});


/**
 * يبدأ فحص جميع التصنيفات المالية من أولها.
 * لا يحذف البيانات الموجودة، ويمكن تشغيله بأمان من زر في لوحة العرض.
 */
function operationsFullSyncStart() {
  gmailLabelSyncEnsureService_();

  var activeState = operationsCompleteReadState_();

  if (activeState && activeState.status === 'running') {
    return operationsCompletePublicResult_(activeState);
  }

  var ss = appActiveSpreadsheet();
  var guideSheet = appSheet(ss, APP_CONFIG.GUIDE_SHEET);
  var operationsSheet = appSheet(ss, APP_CONFIG.OPERATIONS_SHEET);

  operationsEnsureHeaders(operationsSheet);

  var guideItems = operationsCompleteEligibleGuideItems_(guideSheet);

  if (guideItems.length === 0) {
    throw new Error('لا توجد تصنيفات مالية نشطة مرتبطة بـ Gmail.');
  }

  var state = {
    version: 1,
    status: 'running',
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    labelIndex: 0,
    pageToken: '',
    pageFailures: 0,
    labelsTotal: guideItems.length,
    labelsCompleted: 0,
    pagesCompleted: 0,
    scanned: 0,
    added: 0,
    updated: 0,
    existing: 0,
    ignored: 0,
    ambiguous: 0,
    failed: 0,
    lastError: ''
  };

  operationsCompleteSaveState_(state);
  operationsCompleteInstallTrigger_();

  return operationsCompleteSyncBatch_();
}


/**
 * تستأنف مزامنة متوقفة بسبب خطأ مؤقت.
 */
function operationsFullSyncResume() {
  var state = operationsCompleteReadState_();

  if (!state) {
    return operationsFullSyncStart();
  }

  state.status = 'running';
  state.pageFailures = 0;
  state.lastError = '';
  state.updatedAt = new Date().toISOString();

  operationsCompleteSaveState_(state);
  operationsCompleteInstallTrigger_();

  return operationsCompleteSyncBatch_();
}


/**
 * مشغل الدقيقة. عند عدم وجود مزامنة كاملة يشغل المزامنة السريعة فقط.
 */
function operationsCompleteSyncTick() {
  var state = operationsCompleteReadState_();

  if (state && state.status === 'running') {
    return operationsCompleteSyncBatch_();
  }

  if (typeof operationsRegisterFastDetailed === 'function') {
    return operationsRegisterFastDetailed();
  }

  return { success: true, idle: true };
}


/**
 * يعيد حالة المزامنة للوحة العرض.
 */
function operationsGetFullSyncStatus() {
  var state = operationsCompleteReadState_();

  if (!state) {
    return {
      success: true,
      active: false,
      status: 'idle',
      message: 'لا توجد مزامنة كاملة قيد التشغيل.'
    };
  }

  return operationsCompletePublicResult_(state);
}


/**
 * يلغي الاستمرار التلقائي فقط، ولا يحذف أي صف.
 */
function operationsFullSyncCancel() {
  PropertiesService.getScriptProperties().deleteProperty(
    OPERATIONS_COMPLETE_SYNC.STATE_PROPERTY
  );

  operationsCompleteDeleteTriggers_();

  return {
    success: true,
    cancelled: true,
    message: 'تم إيقاف المزامنة الكاملة دون حذف البيانات.'
  };
}


function operationsCompleteSyncBatch_() {
  var lock = LockService.getScriptLock();

  if (!lock.tryLock(5000)) {
    return {
      success: false,
      busy: true,
      message: 'هناك مزامنة أخرى تعمل حاليًا.'
    };
  }

  try {
    var state = operationsCompleteReadState_();

    if (!state) {
      return {
        success: true,
        active: false,
        status: 'idle',
        message: 'لا توجد مزامنة كاملة قيد التشغيل.'
      };
    }

    if (state.status !== 'running') {
      return operationsCompletePublicResult_(state);
    }

    gmailLabelSyncEnsureService_();

    var ss = appActiveSpreadsheet();
    var guideSheet = appSheet(ss, APP_CONFIG.GUIDE_SHEET);
    var operationsSheet = appSheet(ss, APP_CONFIG.OPERATIONS_SHEET);
    var guideItems = operationsCompleteEligibleGuideItems_(guideSheet);

    if (state.labelIndex >= guideItems.length) {
      return operationsCompleteFinish_(state, ss);
    }

    var guideByLabelId = operationsFastBuildGuideMap_(guideItems);
    var currentItem = guideItems[state.labelIndex];
    var labelId = appText(currentItem.gmailLabelId);
    var requestToken = appText(state.pageToken);
    var options = {
      labelIds: [labelId],
      maxResults: OPERATIONS_COMPLETE_SYNC.PAGE_SIZE,
      includeSpamTrash: false
    };

    if (requestToken) {
      options.pageToken = requestToken;
    }

    var response;

    try {
      response = Gmail.Users.Messages.list('me', options) || {};
    } catch (error) {
      return operationsCompleteRecordFailure_(state, error);
    }

    var existingRows = operationsReadExistingRows(operationsSheet);
    var references = response.messages || [];
    var newRecords = [];
    var updatedRecords = [];
    var pageFailed = false;

    for (var index = 0; index < references.length; index++) {
      var messageId = appText(references[index] && references[index].id);

      if (!messageId) {
        continue;
      }

      state.scanned++;

      var apiMessage;

      try {
        apiMessage = Gmail.Users.Messages.get('me', messageId, {
          format: 'minimal'
        });
      } catch (error) {
        state.failed++;
        pageFailed = true;
        state.lastError = operationsErrorMessage_(error);
        continue;
      }

      var labelIds = Array.isArray(apiMessage && apiMessage.labelIds)
        ? apiMessage.labelIds
        : [];

      if (labelIds.indexOf('TRASH') !== -1 || labelIds.indexOf('SPAM') !== -1) {
        state.ignored++;
        continue;
      }

      var matchingItems = [];

      labelIds.forEach(function(currentLabelId) {
        var match = guideByLabelId[appText(currentLabelId)];
        if (match) {
          matchingItems.push(match);
        }
      });

      matchingItems = operationsNormalizeMatchingItems_(matchingItems);

      if (matchingItems.length === 0) {
        state.ignored++;
        continue;
      }

      if (matchingItems.length > 1) {
        state.ambiguous++;
        continue;
      }

      var message;

      try {
        message = gmailGetMessage(messageId);
      } catch (error) {
        message = null;
      }

      if (!message) {
        state.failed++;
        pageFailed = true;
        state.lastError = 'تعذر قراءة الرسالة ' + messageId;
        continue;
      }

      var parsed;

      try {
        parsed = bankParseMessage(
          gmailPlainBody(message),
          matchingItems[0].item,
          message.getDate(),
          message.getFrom(),
          message.getSubject()
        );
      } catch (error) {
        state.failed++;
        pageFailed = true;
        state.lastError = operationsErrorMessage_(error);
        continue;
      }

      var existingInfo = existingRows.has(messageId)
        ? existingRows.get(messageId)
        : null;

      var row = operationsBuildRow_(
        messageId,
        parsed,
        matchingItems[0],
        matchingItems,
        existingInfo ? existingInfo.values : null
      );

      if (existingInfo) {
        if (operationsCompleteRowsDiffer_(existingInfo.values, row)) {
          updatedRecords.push({
            rowNumber: existingInfo.rowNumber,
            row: row
          });
          state.updated++;
        } else {
          state.existing++;
        }
      } else {
        newRecords.push({
          date: operationsValidDate_(row[1]) ? row[1] : message.getDate(),
          row: row
        });
        existingRows.set(messageId, {
          messageId: messageId,
          rowNumber: operationsSheet.getLastRow() + newRecords.length,
          values: row
        });
        state.added++;
      }
    }

    operationsCompleteWriteUpdatedRows_(operationsSheet, updatedRecords);
    operationsWriteNewRows_(operationsSheet, newRecords);

    if (newRecords.length > 0) {
      var firstNewRow = operationsSheet.getLastRow() - newRecords.length + 1;
      operationsColorStatus(operationsSheet, firstNewRow, newRecords.length, 11);
    }

    SpreadsheetApp.flush();

    if (pageFailed) {
      state.pageFailures = Number(state.pageFailures || 0) + 1;

      if (state.pageFailures >= OPERATIONS_COMPLETE_SYNC.MAX_FAILURES_PER_PAGE) {
        state.status = 'attention';
        operationsCompleteDeleteTriggers_();
      }
    } else {
      state.pageFailures = 0;
      state.lastError = '';
      state.pagesCompleted++;

      if (response.nextPageToken) {
        state.pageToken = response.nextPageToken;
      } else {
        state.labelIndex++;
        state.labelsCompleted = state.labelIndex;
        state.pageToken = '';
      }
    }

    state.updatedAt = new Date().toISOString();
    operationsCompleteSaveState_(state);

    if (state.labelIndex >= guideItems.length) {
      return operationsCompleteFinish_(state, ss);
    }

    return operationsCompletePublicResult_(state);
  } finally {
    lock.releaseLock();
  }
}


function operationsCompleteEligibleGuideItems_(guideSheet) {
  return operationsReadGuideItems(guideSheet, true)
    .filter(operationsIsFinancialGuideItemV4_)
    .filter(function(item) {
      return Boolean(appText(item.gmailLabelId));
    })
    .sort(function(first, second) {
      return Number(first.rowNumber || 0) - Number(second.rowNumber || 0);
    });
}


function operationsCompleteRowsDiffer_(existingValues, newRow) {
  var oldValues = Array.isArray(existingValues) ? existingValues : [];

  return JSON.stringify(oldValues.slice(1, 15)) !==
    JSON.stringify(newRow.slice(1, 15));
}


/**
 * يكتب B:O حتى تتحول التواريخ النصية القديمة إلى قيمة تاريخ موحدة.
 * لا يغير معرف الرسالة A ولا أعمدة الحساب الإضافية P:T.
 */
function operationsCompleteWriteUpdatedRows_(operationsSheet, records) {
  (records || []).forEach(function(record) {
    operationsSheet
      .getRange(record.rowNumber, 2, 1, 14)
      .setValues([record.row.slice(1, 15)]);

    operationsApplyFormats_(operationsSheet, record.rowNumber, 1);
  });
}


function operationsCompleteRecordFailure_(state, error) {
  state.failed++;
  state.pageFailures = Number(state.pageFailures || 0) + 1;
  state.lastError = operationsErrorMessage_(error);
  state.updatedAt = new Date().toISOString();

  if (state.pageFailures >= OPERATIONS_COMPLETE_SYNC.MAX_FAILURES_PER_PAGE) {
    state.status = 'attention';
    operationsCompleteDeleteTriggers_();
  }

  operationsCompleteSaveState_(state);
  return operationsCompletePublicResult_(state);
}


function operationsCompleteFinish_(state, ss) {
  state.status = 'complete';
  state.labelsCompleted = state.labelsTotal;
  state.completedAt = new Date().toISOString();
  state.updatedAt = state.completedAt;

  try {
    var historyId = operationsFastGetCurrentHistoryId_();
    if (historyId) {
      PropertiesService.getScriptProperties().setProperty(
        OPERATIONS_FAST_CONFIG.HISTORY_PROPERTY,
        String(historyId)
      );
    }
  } catch (error) {
    state.lastError = operationsErrorMessage_(error);
  }

  operationsCompleteSaveState_(state);

  var result = operationsCompletePublicResult_(state);
  operationsSaveLastResult_(result);

  appToast(
    'اكتملت المزامنة: تمت إضافة ' + state.added +
      ' وتحديث ' + state.updated + ' عملية.',
    'المزامنة الكاملة',
    10
  );

  return result;
}


function operationsCompletePublicResult_(state) {
  var active = state.status === 'running';
  var message;

  if (state.status === 'complete') {
    message = 'اكتملت مزامنة جميع التصنيفات: إضافة ' + state.added +
      '، تحديث ' + state.updated + '، موجود ' + state.existing +
      '، يحتاج مراجعة ' + state.ambiguous + '.';
  } else if (state.status === 'attention') {
    message = 'توقفت المزامنة مؤقتًا بعد تكرار الخطأ. استخدم استئناف المزامنة.';
  } else {
    message = 'المزامنة مستمرة في الخلفية: اكتمل ' + state.labelsCompleted +
      ' من ' + state.labelsTotal + ' تصنيف.';
  }

  return {
    success: state.status !== 'attention',
    active: active,
    status: state.status,
    message: message,
    labelsTotal: state.labelsTotal,
    labelsCompleted: state.labelsCompleted,
    pagesCompleted: state.pagesCompleted,
    scanned: state.scanned,
    added: state.added,
    updated: state.updated,
    existing: state.existing,
    ignored: state.ignored,
    ambiguous: state.ambiguous,
    failed: state.failed,
    lastError: state.lastError,
    startedAt: state.startedAt,
    updatedAt: state.updatedAt,
    completedAt: state.completedAt || ''
  };
}


function operationsCompleteReadState_() {
  var value = PropertiesService.getScriptProperties().getProperty(
    OPERATIONS_COMPLETE_SYNC.STATE_PROPERTY
  );

  if (!value) {
    return null;
  }

  try {
    return JSON.parse(value);
  } catch (error) {
    return null;
  }
}


function operationsCompleteSaveState_(state) {
  PropertiesService.getScriptProperties().setProperty(
    OPERATIONS_COMPLETE_SYNC.STATE_PROPERTY,
    JSON.stringify(state)
  );
}


function operationsCompleteInstallTrigger_() {
  var exists = ScriptApp.getProjectTriggers().some(function(trigger) {
    return trigger.getHandlerFunction() === OPERATIONS_COMPLETE_SYNC.TRIGGER_HANDLER;
  });

  if (!exists) {
    ScriptApp.newTrigger(OPERATIONS_COMPLETE_SYNC.TRIGGER_HANDLER)
      .timeBased()
      .everyMinutes(1)
      .create();
  }
}


function operationsCompleteDeleteTriggers_() {
  ScriptApp.getProjectTriggers().forEach(function(trigger) {
    if (trigger.getHandlerFunction() === OPERATIONS_COMPLETE_SYNC.TRIGGER_HANDLER) {
      ScriptApp.deleteTrigger(trigger);
    }
  });
}


/**
 * يثبت مشغل المزامنة المستمرة: يكمل المزامنة الكاملة أو يفحص الجديد.
 */
function installOperationsAutomaticSync() {
  operationsCompleteInstallTrigger_();

  return {
    success: true,
    message: 'تم تشغيل مزامنة العمليات التلقائية كل دقيقة.'
  };
}

