/*******************************************************
 * 67_ItemDirectory.gs
 *
 * دليل البنود
 * Dashboard ⇄ Google Sheets ⇄ Gmail Labels
 *
 * إصلاح مهم:
 * جميع البيانات المرسلة إلى Dashboard أصبحت Web-Safe.
 * لا يتم إرجاع Date objects عبر google.script.run.
 *******************************************************/


const ITEM_DIRECTORY_CONFIG = {

  sheetName: 'دليل البنود',

  operationsSheetName: 'العمليات',

  columns: {
    item: 1,
    legacyClassification: 2,
    system: 3,
    movement: 4,
    action: 5,
    active: 6,
    gmailLabelId: 7,
    syncStatus: 8,
    lastSync: 9,
    category: 10,
    period: 11,
    scope: 12
  },

  categories: [
    'اساسي',
    'استثنائي',
    'ترفيهي'
  ],

  periods: [
    'شهري',
    'سنوي'
  ],

  scopes: [
    'عائلي',
    'شخصي'
  ],

  accounts: {

    family_monthly: {
      key: 'family_monthly',
      name: 'عائلي شهري',
      bank: 'الأهلي 001',
      scope: 'عائلي',
      period: 'شهري'
    },

    family_annual: {
      key: 'family_annual',
      name: 'عائلي سنوي',
      bank: 'الأهلي 002',
      scope: 'عائلي',
      period: 'سنوي'
    },

    personal_monthly: {
      key: 'personal_monthly',
      name: 'شخصي شهري',
      bank: 'صحار 1',
      scope: 'شخصي',
      period: 'شهري'
    },

    personal_annual: {
      key: 'personal_annual',
      name: 'شخصي سنوي',
      bank: 'صحار 2',
      scope: 'شخصي',
      period: 'سنوي'
    }
  }

};


/* =========================================================
   PUBLIC — READ
   ========================================================= */


function getItemDirectoryData(filters) {

  filters =
    filters || {};


  const sheet =
    itemDirectoryGetSheet_();


  const lastRow =
    sheet.getLastRow();


  if (
    lastRow < 2
  ) {

    return {
      generatedAt:
        itemDirectoryDateForWeb_(
          new Date()
        ),

      rows: [],

      summary:
        itemDirectoryEmptySummary_(),

      filters:
        itemDirectoryWebSafe_(
          filters
        ),

      options:
        itemDirectoryOptions_()
    };

  }


  /*
   * قراءة واحدة فقط من Google Sheets.
   */
  const values =
    sheet
      .getRange(
        2,
        1,
        lastRow - 1,
        12
      )
      .getValues();


  let rows =
    values.map(
      function(row, index) {

        return itemDirectoryBuildRow_(
          row,
          index + 2
        );

      }
    );


  rows =
    itemDirectoryApplyFilters_(
      rows,
      filters
    );


  const result = {

    generatedAt:
      itemDirectoryDateForWeb_(
        new Date()
      ),

    rows:
      rows,

    summary:
      itemDirectoryBuildSummary_(
        values
      ),

    options:
      itemDirectoryOptions_(),

    filters:
      filters
  };


  /*
   * الضمان النهائي:
   * لا يخرج Date أو undefined أو كائن غير صالح للويب.
   */
  return itemDirectoryWebSafe_(
    result
  );

}


/**
 * مزامنة أسماء Gmail أولاً ثم إرجاع دليل البنود.
 */
function getItemDirectoryDataSynced(filters) {

  syncItemDirectoryNamesFromGmail();

  return getItemDirectoryData(
    filters || {}
  );

}


/* =========================================================
   PUBLIC — SAVE FROM DASHBOARD
   ========================================================= */


function saveItemDirectoryChanges(payload) {

  payload =
    payload || {};


  const changes =
    Array.isArray(payload)
      ? payload
      : payload.changes;


  if (
    !Array.isArray(changes) ||
    !changes.length
  ) {

    return {
      success: true,
      changed: 0,
      renamed: 0,
      operationsUpdated: 0,
      results: []
    };

  }


  const lock =
    LockService.getScriptLock();


  lock.waitLock(
    30000
  );


  try {

    const sheet =
      itemDirectoryGetSheet_();


    const lastRow =
      sheet.getLastRow();


    if (
      lastRow < 2
    ) {

      throw new Error(
        'ورقة دليل البنود فارغة.'
      );

    }


    const range =
      sheet.getRange(
        2,
        1,
        lastRow - 1,
        12
      );


    const data =
      range.getValues();


    /*
     * فهرسة الصفوف بواسطة:
     * Gmail Label ID أولاً،
     * ثم رقم الصف.
     */
    const byLabelId =
      {};


    data.forEach(
      function(row, index) {

        const labelId =
          itemDirectoryText_(
            row[
              ITEM_DIRECTORY_CONFIG
                .columns.gmailLabelId - 1
            ]
          );


        if (
          labelId
        ) {

          byLabelId[
            labelId
          ] =
            index;

        }

      }
    );


    /*
     * معرفة هل توجد إعادة تسمية.
     */
    const hasRename =
      changes.some(
        function(change) {

          return (
            change.item !==
            undefined
          );

        }
      );


    const gmailSnapshot =
      hasRename
        ? itemDirectoryGetGmailSnapshot_()
        : null;


    /*
     * نحسب الأسماء النهائية قبل أي كتابة.
     */
    const finalNames =
      {};


    data.forEach(
      function(row, index) {

        finalNames[
          index
        ] =
          itemDirectoryText_(
            row[
              ITEM_DIRECTORY_CONFIG
                .columns.item - 1
            ]
          );

      }
    );


    changes.forEach(
      function(change) {

        const index =
          itemDirectoryResolveChangeIndex_(
            change,
            data,
            byLabelId
          );


        if (
          change.item !==
          undefined
        ) {

          const newItem =
            itemDirectoryText_(
              change.item
            );


          if (
            !newItem
          ) {

            throw new Error(
              'اسم البند لا يمكن أن يكون فارغًا.'
            );

          }


          finalNames[
            index
          ] =
            newItem;

        }

      }
    );


    /*
     * منع أسماء البنود المكررة.
     */
    const duplicateCheck =
      {};


    Object.keys(
      finalNames
    )
    .forEach(
      function(index) {

        const name =
          itemDirectoryText_(
            finalNames[
              index
            ]
          );


        if (
          !name
        ) {
          return;
        }


        const key =
          itemDirectoryNormalizeText_(
            name
          );


        if (
          duplicateCheck[
            key
          ] !==
          undefined
        ) {

          throw new Error(
            'يوجد اسم بند مكرر: ' +
            name
          );

        }


        duplicateCheck[
          key
        ] =
          Number(
            index
          );

      }
    );


    /*
     * التحقق من Gmail قبل تنفيذ أي Rename.
     */
    if (
      gmailSnapshot
    ) {

      changes.forEach(
        function(change) {

          if (
            change.item ===
            undefined
          ) {
            return;
          }


          const index =
            itemDirectoryResolveChangeIndex_(
              change,
              data,
              byLabelId
            );


          const row =
            data[
              index
            ];


          const c =
            ITEM_DIRECTORY_CONFIG.columns;


          const oldItem =
            itemDirectoryText_(
              row[
                c.item - 1
              ]
            );


          const newItem =
            itemDirectoryText_(
              change.item
            );


          const labelId =
            itemDirectoryText_(
              row[
                c.gmailLabelId - 1
              ]
            );


          if (
            !labelId ||
            itemDirectoryNormalizeText_(
              oldItem
            ) ===
            itemDirectoryNormalizeText_(
              newItem
            )
          ) {

            return;

          }


          const existing =
            gmailSnapshot.byName[
              itemDirectoryNormalizeText_(
                newItem
              )
            ];


          if (
            existing &&
            existing.id !==
            labelId
          ) {

            throw new Error(
              'يوجد Gmail Label آخر بنفس الاسم: ' +
              newItem
            );

          }

        }
      );

    }


    const renameMap =
      [];


    const performedGmailRenames =
      [];


    const results =
      [];


    try {

      changes.forEach(
        function(change) {

          const index =
            itemDirectoryResolveChangeIndex_(
              change,
              data,
              byLabelId
            );


          const row =
            data[
              index
            ];


          const rowNumber =
            index + 2;


          const result =
            itemDirectoryApplyDashboardChange_(
              row,
              rowNumber,
              change,
              gmailSnapshot,
              performedGmailRenames
            );


          data[
            index
          ] =
            result.row;


          if (
            result.rename
          ) {

            renameMap.push(
              result.rename
            );

          }


          results.push({
            rowNumber:
              rowNumber,

            item:
              itemDirectoryText_(
                result.row[0]
              ),

            success:
              true,

            renamed:
              !!result.rename
          });

        }
      );


      /*
       * كتابة واحدة فقط للشيت.
       */
      range.setValues(
        data
      );


      SpreadsheetApp.flush();

    }


    catch(error) {

      /*
       * إذا نجح Rename في Gmail ثم فشل الشيت،
       * نحاول إرجاع أسماء Gmail القديمة.
       */
      itemDirectoryRollbackGmailRenames_(
        performedGmailRenames
      );


      throw error;

    }


    /*
     * تحديث العمليات التاريخية بعد نجاح دليل البنود.
     */
    const operationsUpdated =
      itemDirectoryRenameOperationsBatch_(
        renameMap
      );


    return {

      success:
        true,

      changed:
        changes.length,

      renamed:
        renameMap.length,

      operationsUpdated:
        operationsUpdated,

      results:
        results
    };

  }


  finally {

    lock.releaseLock();

  }

}


/* =========================================================
   CHANGE INDEX
   ========================================================= */


function itemDirectoryResolveChangeIndex_(
  change,
  data,
  byLabelId
) {

  const labelId =
    itemDirectoryText_(
      change.gmailLabelId ||
      change.labelId
    );


  if (
    labelId &&
    byLabelId[
      labelId
    ] !==
    undefined
  ) {

    return byLabelId[
      labelId
    ];

  }


  const rowNumber =
    Number(
      change.rowNumber
    );


  if (
    rowNumber >= 2 &&
    rowNumber <=
      data.length + 1
  ) {

    return (
      rowNumber -
      2
    );

  }


  throw new Error(
    'تعذر تحديد صف البند المطلوب تعديله.'
  );

}


/* =========================================================
   APPLY DASHBOARD CHANGE
   ========================================================= */


function itemDirectoryApplyDashboardChange_(
  row,
  rowNumber,
  change,
  gmailSnapshot,
  performedGmailRenames
) {

  const c =
    ITEM_DIRECTORY_CONFIG.columns;


  const oldItem =
    itemDirectoryText_(
      row[
        c.item - 1
      ]
    );


  const labelId =
    itemDirectoryText_(
      row[
        c.gmailLabelId - 1
      ]
    );


  let rename =
    null;


  /* ---------- ITEM ---------- */


  if (
    change.item !==
    undefined
  ) {

    const newItem =
      itemDirectoryText_(
        change.item
      );


    if (
      !newItem
    ) {

      throw new Error(
        'اسم البند فارغ في الصف ' +
        rowNumber
      );

    }


    if (
      itemDirectoryNormalizeText_(
        oldItem
      ) !==
      itemDirectoryNormalizeText_(
        newItem
      )
    ) {

      if (
        labelId
      ) {

        itemDirectoryRenameGmailLabel_(
          labelId,
          newItem,
          gmailSnapshot
        );


        performedGmailRenames.push({
          labelId:
            labelId,

          oldName:
            oldItem,

          newName:
            newItem
        });


        row[
          c.syncStatus - 1
        ] =
          'متزامن';


        row[
          c.lastSync - 1
        ] =
          new Date();

      }


      row[
        c.item - 1
      ] =
        newItem;


      rename = {
        oldName:
          oldItem,

        newName:
          newItem,

        labelId:
          labelId
      };

    }

  }


  /* ---------- CATEGORY ---------- */


  if (
    change.category !==
    undefined
  ) {

    row[
      c.category - 1
    ] =
      itemDirectoryCanonicalCategory_(
        change.category,
        true
      );

  }


  /* ---------- PERIOD ---------- */


  if (
    change.period !==
    undefined
  ) {

    row[
      c.period - 1
    ] =
      itemDirectoryCanonicalPeriod_(
        change.period,
        true
      );

  }


  /* ---------- SCOPE ---------- */


  if (
    change.scope !==
    undefined
  ) {

    row[
      c.scope - 1
    ] =
      itemDirectoryCanonicalScope_(
        change.scope,
        true
      );

  }


  /* ---------- ACTIVE ---------- */


  if (
    change.active !==
    undefined
  ) {

    row[
      c.active - 1
    ] =
      itemDirectoryCanonicalActive_(
        change.active
      );

  }


  const scope =
    itemDirectoryCanonicalScope_(
      row[
        c.scope - 1
      ],
      true
    );


  const period =
    itemDirectoryCanonicalPeriod_(
      row[
        c.period - 1
      ],
      true
    );


  const category =
    itemDirectoryCanonicalCategory_(
      row[
        c.category - 1
      ],
      true
    );


  if (
    itemDirectoryIsExpenseRow_(
      row
    )
  ) {

    if (
      scope &&
      period
    ) {

      row[
        c.legacyClassification - 1
      ] =
        itemDirectoryLegacyClassification_(
          scope,
          period
        );

    }


    if (
      !scope ||
      !period ||
      !category
    ) {

      row[
        c.syncStatus - 1
      ] =
        'يحتاج مراجعة';

    }

  }


  return {
    row:
      row,

    rename:
      rename
  };

}


/* =========================================================
   GMAIL → SHEET
   ========================================================= */


function syncItemDirectoryNamesFromGmail() {

  const lock =
    LockService.getScriptLock();


  lock.waitLock(
    30000
  );


  try {

    const sheet =
      itemDirectoryGetSheet_();


    const lastRow =
      sheet.getLastRow();


    if (
      lastRow < 2
    ) {

      return {
        success: true,
        checked: 0,
        renamed: 0,
        operationsUpdated: 0
      };

    }


    const range =
      sheet.getRange(
        2,
        1,
        lastRow - 1,
        12
      );


    const data =
      range.getValues();


    const gmail =
      itemDirectoryGetGmailSnapshot_();


    const c =
      ITEM_DIRECTORY_CONFIG.columns;


    const renameMap =
      [];


    let checked =
      0;


    let renamed =
      0;


    data.forEach(
      function(row) {

        const labelId =
          itemDirectoryText_(
            row[
              c.gmailLabelId - 1
            ]
          );


        if (
          !labelId
        ) {
          return;
        }


        checked++;


        const gmailLabel =
          gmail.byId[
            labelId
          ];


        if (
          !gmailLabel
        ) {

          row[
            c.syncStatus - 1
          ] =
            'غير موجود في Gmail';


          return;

        }


        const sheetName =
          itemDirectoryText_(
            row[
              c.item - 1
            ]
          );


        const gmailName =
          itemDirectoryText_(
            gmailLabel.name
          );


        if (
          gmailName &&
          itemDirectoryNormalizeText_(
            gmailName
          ) !==
          itemDirectoryNormalizeText_(
            sheetName
          )
        ) {

          renameMap.push({
            oldName:
              sheetName,

            newName:
              gmailName,

            labelId:
              labelId
          });


          row[
            c.item - 1
          ] =
            gmailName;


          renamed++;

        }


        row[
          c.syncStatus - 1
        ] =
          'متزامن';


        row[
          c.lastSync - 1
        ] =
          new Date();

      }
    );


    range.setValues(
      data
    );


    const operationsUpdated =
      itemDirectoryRenameOperationsBatch_(
        renameMap
      );


    SpreadsheetApp.flush();


    return {

      success:
        true,

      checked:
        checked,

      renamed:
        renamed,

      operationsUpdated:
        operationsUpdated
    };

  }


  finally {

    lock.releaseLock();

  }

}


/* =========================================================
   INSTALLABLE ON EDIT
   ========================================================= */


function itemDirectoryOnEdit(e) {

  if (
    !e ||
    !e.range
  ) {

    return;

  }


  const range =
    e.range;


  const sheet =
    range.getSheet();


  if (
    sheet.getName() !==
    ITEM_DIRECTORY_CONFIG.sheetName
  ) {

    return;

  }


  const startRow =
    range.getRow();


  const endRow =
    range.getLastRow();


  const startColumn =
    range.getColumn();


  const endColumn =
    range.getLastColumn();


  if (
    endRow < 2
  ) {

    return;

  }


  const relevantColumns = [
    1,
    10,
    11,
    12
  ];


  const relevant =
    relevantColumns.some(
      function(column) {

        return (
          column >=
            startColumn &&
          column <=
            endColumn
        );

      }
    );


  if (
    !relevant
  ) {

    return;

  }


  const lock =
    LockService.getScriptLock();


  if (
    !lock.tryLock(
      30000
    )
  ) {

    return;

  }


  try {

    const gmailSnapshot =
      itemDirectoryGetGmailSnapshot_();


    const c =
      ITEM_DIRECTORY_CONFIG.columns;


    const renameMap =
      [];


    const firstRow =
      Math.max(
        2,
        startRow
      );


    const rowCount =
      endRow -
      firstRow +
      1;


    if (
      rowCount <= 0
    ) {

      return;

    }


    /*
     * قراءة دفعة واحدة.
     */
    const editRange =
      sheet.getRange(
        firstRow,
        1,
        rowCount,
        12
      );


    const rows =
      editRange.getValues();


    rows.forEach(
      function(row) {

        const item =
          itemDirectoryText_(
            row[
              c.item - 1
            ]
          );


        const labelId =
          itemDirectoryText_(
            row[
              c.gmailLabelId - 1
            ]
          );


        if (
          !item
        ) {

          row[
            c.syncStatus - 1
          ] =
            'يحتاج مراجعة';


          return;

        }


        /*
         * Sheet name → Gmail Label name.
         */
        if (
          labelId &&
          gmailSnapshot.byId[
            labelId
          ]
        ) {

          const gmailName =
            itemDirectoryText_(
              gmailSnapshot
                .byId[
                  labelId
                ]
                .name
            );


          if (
            gmailName &&
            itemDirectoryNormalizeText_(
              gmailName
            ) !==
            itemDirectoryNormalizeText_(
              item
            )
          ) {

            itemDirectoryRenameGmailLabel_(
              labelId,
              item,
              gmailSnapshot
            );


            renameMap.push({
              oldName:
                gmailName,

              newName:
                item,

              labelId:
                labelId
            });

          }


          row[
            c.syncStatus - 1
          ] =
            'متزامن';


          row[
            c.lastSync - 1
          ] =
            new Date();

        }


        const category =
          itemDirectoryCanonicalCategory_(
            row[
              c.category - 1
            ],
            true
          );


        const period =
          itemDirectoryCanonicalPeriod_(
            row[
              c.period - 1
            ],
            true
          );


        const scope =
          itemDirectoryCanonicalScope_(
            row[
              c.scope - 1
            ],
            true
          );


        row[
          c.category - 1
        ] =
          category;


        row[
          c.period - 1
        ] =
          period;


        row[
          c.scope - 1
        ] =
          scope;


        if (
          itemDirectoryIsExpenseRow_(
            row
          )
        ) {

          if (
            scope &&
            period
          ) {

            row[
              c.legacyClassification - 1
            ] =
              itemDirectoryLegacyClassification_(
                scope,
                period
              );

          }


          if (
            !category ||
            !period ||
            !scope
          ) {

            row[
              c.syncStatus - 1
            ] =
              'يحتاج مراجعة';

          }

        }

      }
    );


    editRange.setValues(
      rows
    );


    itemDirectoryRenameOperationsBatch_(
      renameMap
    );


    SpreadsheetApp.flush();

  }


  finally {

    lock.releaseLock();

  }

}


/* =========================================================
   TRIGGER
   ========================================================= */


function installItemDirectoryEditTrigger() {

  removeItemDirectoryEditTrigger();


  const ss =
    itemDirectorySpreadsheet_();


  const trigger =
    ScriptApp
      .newTrigger(
        'itemDirectoryOnEdit'
      )
      .forSpreadsheet(
        ss
      )
      .onEdit()
      .create();


  return {

    success:
      true,

    handler:
      'itemDirectoryOnEdit',

    triggerId:
      trigger.getUniqueId()
  };

}


function removeItemDirectoryEditTrigger() {

  const triggers =
    ScriptApp.getProjectTriggers();


  let removed =
    0;


  triggers.forEach(
    function(trigger) {

      if (
        trigger.getHandlerFunction() ===
        'itemDirectoryOnEdit'
      ) {

        ScriptApp.deleteTrigger(
          trigger
        );


        removed++;

      }

    }
  );


  return {

    success:
      true,

    removed:
      removed
  };

}


/* =========================================================
   GMAIL SNAPSHOT
   ========================================================= */


function itemDirectoryGetGmailSnapshot_() {

  if (
    typeof Gmail ===
    'undefined'
  ) {

    throw new Error(
      'خدمة Gmail المتقدمة غير مفعلة.'
    );

  }


  const response =
    Gmail.Users.Labels.list(
      'me'
    );


  const labels =
    response.labels ||
    [];


  const byId =
    {};


  const byName =
    {};


  labels.forEach(
    function(label) {

      if (
        !label ||
        !label.id
      ) {

        return;

      }


      byId[
        label.id
      ] =
        label;


      const key =
        itemDirectoryNormalizeText_(
          label.name
        );


      if (
        key
      ) {

        byName[
          key
        ] =
          label;

      }

    }
  );


  return {

    labels:
      labels,

    byId:
      byId,

    byName:
      byName
  };

}


/* =========================================================
   RENAME GMAIL LABEL
   ========================================================= */


function itemDirectoryRenameGmailLabel_(
  labelId,
  newName,
  snapshot
) {

  labelId =
    itemDirectoryText_(
      labelId
    );


  newName =
    itemDirectoryText_(
      newName
    );


  if (
    !labelId ||
    !newName
  ) {

    return null;

  }


  snapshot =
    snapshot ||
    itemDirectoryGetGmailSnapshot_();


  const current =
    snapshot.byId[
      labelId
    ];


  if (
    !current
  ) {

    throw new Error(
      'لم يتم العثور على Gmail Label ID: ' +
      labelId
    );

  }


  if (
    itemDirectoryNormalizeText_(
      current.type
    ) ===
    'system'
  ) {

    throw new Error(
      'لا يمكن إعادة تسمية System Gmail Label: ' +
      current.name
    );

  }


  const newKey =
    itemDirectoryNormalizeText_(
      newName
    );


  const existing =
    snapshot.byName[
      newKey
    ];


  if (
    existing &&
    existing.id !==
      labelId
  ) {

    throw new Error(
      'يوجد Gmail Label آخر بنفس الاسم: ' +
      newName
    );

  }


  const oldName =
    itemDirectoryText_(
      current.name
    );


  const oldKey =
    itemDirectoryNormalizeText_(
      oldName
    );


  if (
    oldKey ===
    newKey
  ) {

    return current;

  }


  /*
   * Gmail API patch يحافظ على Label ID.
   */
  const updated =
    Gmail.Users.Labels.patch(
      {
        name:
          newName
      },
      'me',
      labelId
    );


  delete snapshot.byName[
    oldKey
  ];


  snapshot.byId[
    labelId
  ] =
    updated;


  snapshot.byName[
    newKey
  ] =
    updated;


  return updated;

}


/* =========================================================
   GMAIL ROLLBACK
   ========================================================= */


function itemDirectoryRollbackGmailRenames_(
  renames
) {

  if (
    !Array.isArray(
      renames
    ) ||
    !renames.length
  ) {

    return;

  }


  for (
    let i =
      renames.length - 1;

    i >= 0;

    i--
  ) {

    const rename =
      renames[
        i
      ];


    try {

      Gmail.Users.Labels.patch(
        {
          name:
            rename.oldName
        },
        'me',
        rename.labelId
      );

    }


    catch(ignore) {

      console.log(
        'تعذر Rollback Gmail Label: ' +
        rename.labelId
      );

    }

  }

}


/* =========================================================
   OPERATIONS HISTORICAL RENAME
   ========================================================= */


function itemDirectoryRenameOperationsBatch_(
  renameMap
) {

  if (
    !Array.isArray(
      renameMap
    ) ||
    !renameMap.length
  ) {

    return 0;

  }


  const ss =
    itemDirectorySpreadsheet_();


  const sheet =
    ss.getSheetByName(
      ITEM_DIRECTORY_CONFIG
        .operationsSheetName
    );


  if (
    !sheet
  ) {

    return 0;

  }


  const lastRow =
    sheet.getLastRow();


  const lastColumn =
    sheet.getLastColumn();


  if (
    lastRow < 2 ||
    lastColumn < 1
  ) {

    return 0;

  }


  const headers =
    sheet
      .getRange(
        1,
        1,
        1,
        lastColumn
      )
      .getValues()[0];


  let itemColumn =
    itemDirectoryFindHeader_(
      headers,
      [
        'البند',
        'اسم البند'
      ]
    );


  /*
   * Schema الحالي للعمليات:
   * C = البند.
   */
  if (
    !itemColumn
  ) {

    itemColumn =
      3;

  }


  const range =
    sheet.getRange(
      2,
      itemColumn,
      lastRow - 1,
      1
    );


  const values =
    range.getValues();


  const map =
    {};


  renameMap.forEach(
    function(rename) {

      const oldName =
        itemDirectoryText_(
          rename.oldName
        );


      const newName =
        itemDirectoryText_(
          rename.newName
        );


      if (
        oldName &&
        newName &&
        itemDirectoryNormalizeText_(
          oldName
        ) !==
        itemDirectoryNormalizeText_(
          newName
        )
      ) {

        map[
          itemDirectoryNormalizeText_(
            oldName
          )
        ] =
          newName;

      }

    }
  );


  let changed =
    0;


  values.forEach(
    function(row) {

      const current =
        itemDirectoryText_(
          row[0]
        );


      const key =
        itemDirectoryNormalizeText_(
          current
        );


      if (
        key &&
        map[
          key
        ]
      ) {

        row[0] =
          map[
            key
          ];


        changed++;

      }

    }
  );


  if (
    changed
  ) {

    range.setValues(
      values
    );

  }


  return changed;

}


/* =========================================================
   BUILD ROW — WEB SAFE
   ========================================================= */


function itemDirectoryBuildRow_(
  row,
  rowNumber
) {

  const c =
    ITEM_DIRECTORY_CONFIG.columns;


  const item =
    itemDirectoryText_(
      row[
        c.item - 1
      ]
    );


  const category =
    itemDirectoryCanonicalCategory_(
      row[
        c.category - 1
      ],
      true
    );


  const period =
    itemDirectoryCanonicalPeriod_(
      row[
        c.period - 1
      ],
      true
    );


  const scope =
    itemDirectoryCanonicalScope_(
      row[
        c.scope - 1
      ],
      true
    );


  const isExpense =
    itemDirectoryIsExpenseRow_(
      row
    );


  const account =
    isExpense
      ? itemDirectoryResolveAccount_(
          scope,
          period
        )
      : {
          key: '',
          name: '',
          bank: ''
        };


  const needsReview =
    !!(
      isExpense &&
      (
        !category ||
        !period ||
        !scope
      )
    );


  return {

    rowNumber:
      Number(
        rowNumber
      ),

    item:
      item,

    system:
      itemDirectoryText_(
        row[
          c.system - 1
        ]
      ),

    movement:
      itemDirectoryText_(
        row[
          c.movement - 1
        ]
      ),

    action:
      itemDirectoryText_(
        row[
          c.action - 1
        ]
      ),

    active:
      itemDirectoryIsActive_(
        row[
          c.active - 1
        ]
      ),

    activeText:
      itemDirectoryText_(
        row[
          c.active - 1
        ]
      ),

    gmailLabelId:
      itemDirectoryText_(
        row[
          c.gmailLabelId - 1
        ]
      ),

    syncStatus:
      itemDirectoryText_(
        row[
          c.syncStatus - 1
        ]
      ),

    /*
     * مهم:
     * String وليس Date.
     */
    lastSync:
      itemDirectoryDateForWeb_(
        row[
          c.lastSync - 1
        ]
      ),

    category:
      category,

    period:
      period,

    scope:
      scope,

    account:
      account,

    legacyClassification:
      itemDirectoryText_(
        row[
          c.legacyClassification - 1
        ]
      ),

    isExpense:
      isExpense,

    needsReview:
      needsReview
  };

}


/* =========================================================
   SUMMARY
   ========================================================= */


function itemDirectoryBuildSummary_(
  values
) {

  let total =
    0;


  let active =
    0;


  let inactive =
    0;


  let expense =
    0;


  let complete =
    0;


  let needsReview =
    0;


  let basic =
    0;


  let exceptional =
    0;


  let leisure =
    0;


  values.forEach(
    function(row) {

      const record =
        itemDirectoryBuildRow_(
          row,
          0
        );


      if (
        !record.item
      ) {

        return;

      }


      total++;


      if (
        record.active
      ) {

        active++;

      }


      else {

        inactive++;

      }


      if (
        record.isExpense
      ) {

        expense++;


        if (
          record.needsReview
        ) {

          needsReview++;

        }


        else {

          complete++;

        }


        if (
          record.category ===
          'اساسي'
        ) {

          basic++;

        }


        if (
          record.category ===
          'استثنائي'
        ) {

          exceptional++;

        }


        if (
          record.category ===
          'ترفيهي'
        ) {

          leisure++;

        }

      }

    }
  );


  return {

    total:
      total,

    active:
      active,

    inactive:
      inactive,

    expenseItems:
      expense,

    completeExpenseItems:
      complete,

    needsReview:
      needsReview,

    categories: {

      basic:
        basic,

      exceptional:
        exceptional,

      leisure:
        leisure
    }
  };

}


function itemDirectoryEmptySummary_() {

  return {

    total: 0,

    active: 0,

    inactive: 0,

    expenseItems: 0,

    completeExpenseItems: 0,

    needsReview: 0,

    categories: {

      basic: 0,

      exceptional: 0,

      leisure: 0
    }
  };

}


/* =========================================================
   FILTERS
   ========================================================= */


function itemDirectoryApplyFilters_(
  rows,
  filters
) {

  filters =
    filters || {};


  const search =
    itemDirectoryNormalizeText_(
      filters.search ||
      filters.query
    );


  const category =
    filters.category &&
    filters.category !==
      'all'

      ? itemDirectoryCanonicalCategory_(
          filters.category,
          true
        )

      : '';


  const period =
    filters.period &&
    filters.period !==
      'all'

      ? itemDirectoryCanonicalPeriod_(
          filters.period,
          true
        )

      : '';


  const scope =
    filters.scope &&
    filters.scope !==
      'all'

      ? itemDirectoryCanonicalScope_(
          filters.scope,
          true
        )

      : '';


  const status =
    itemDirectoryNormalizeText_(
      filters.status
    );


  return rows.filter(
    function(row) {

      if (
        filters.activeOnly &&
        !row.active
      ) {

        return false;

      }


      if (
        search
      ) {

        const haystack =
          itemDirectoryNormalizeText_(
            [
              row.item,
              row.system,
              row.movement,
              row.category,
              row.period,
              row.scope,
              row.account.name,
              row.account.bank
            ].join(' ')
          );


        if (
          haystack.indexOf(
            search
          ) === -1
        ) {

          return false;

        }

      }


      if (
        category &&
        row.category !==
        category
      ) {

        return false;

      }


      if (
        period &&
        row.period !==
        period
      ) {

        return false;

      }


      if (
        scope &&
        row.scope !==
        scope
      ) {

        return false;

      }


      if (
        status ===
          itemDirectoryNormalizeText_(
            'يحتاج مراجعة'
          ) &&
        !row.needsReview
      ) {

        return false;

      }


      if (
        status ===
          itemDirectoryNormalizeText_(
            'مكتمل'
          ) &&
        (
          !row.isExpense ||
          row.needsReview
        )
      ) {

        return false;

      }


      return true;

    }
  );

}


/* =========================================================
   ACCOUNT
   ========================================================= */


function itemDirectoryResolveAccount_(
  scope,
  period
) {

  scope =
    itemDirectoryCanonicalScope_(
      scope,
      true
    );


  period =
    itemDirectoryCanonicalPeriod_(
      period,
      true
    );


  const accounts =
    ITEM_DIRECTORY_CONFIG.accounts;


  const keys =
    Object.keys(
      accounts
    );


  for (
    let i = 0;
    i < keys.length;
    i++
  ) {

    const account =
      accounts[
        keys[i]
      ];


    if (
      account.scope ===
        scope &&
      account.period ===
        period
    ) {

      return {

        key:
          account.key,

        name:
          account.name,

        bank:
          account.bank
      };

    }

  }


  return {

    key: '',

    name: '',

    bank: ''
  };

}


/* =========================================================
   OPTIONS
   ========================================================= */


function itemDirectoryOptions_() {

  return {

    categories:
      ITEM_DIRECTORY_CONFIG
        .categories
        .slice(),

    periods:
      ITEM_DIRECTORY_CONFIG
        .periods
        .slice(),

    scopes:
      ITEM_DIRECTORY_CONFIG
        .scopes
        .slice(),

    accounts:
      Object.keys(
        ITEM_DIRECTORY_CONFIG.accounts
      )
      .map(
        function(key) {

          const account =
            ITEM_DIRECTORY_CONFIG
              .accounts[
                key
              ];


          return {

            key:
              account.key,

            name:
              account.name,

            bank:
              account.bank,

            scope:
              account.scope,

            period:
              account.period
          };

        }
      )
  };

}


/* =========================================================
   CANONICAL
   ========================================================= */


function itemDirectoryCanonicalCategory_(
  value,
  allowBlank
) {

  const text =
    itemDirectoryNormalizeText_(
      value
    );


  if (
    !text &&
    allowBlank
  ) {

    return '';

  }


  if (
    text ===
    itemDirectoryNormalizeText_(
      'اساسي'
    )
  ) {

    return 'اساسي';

  }


  if (
    text ===
    itemDirectoryNormalizeText_(
      'استثنائي'
    )
  ) {

    return 'استثنائي';

  }


  if (
    text ===
    itemDirectoryNormalizeText_(
      'ترفيهي'
    )
  ) {

    return 'ترفيهي';

  }


  throw new Error(
    'تصنيف غير صالح: ' +
    value
  );

}


function itemDirectoryCanonicalPeriod_(
  value,
  allowBlank
) {

  const text =
    itemDirectoryNormalizeText_(
      value
    );


  if (
    !text &&
    allowBlank
  ) {

    return '';

  }


  if (
    text ===
    itemDirectoryNormalizeText_(
      'شهري'
    )
  ) {

    return 'شهري';

  }


  if (
    text ===
    itemDirectoryNormalizeText_(
      'سنوي'
    )
  ) {

    return 'سنوي';

  }


  throw new Error(
    'فترة غير صالحة: ' +
    value
  );

}


function itemDirectoryCanonicalScope_(
  value,
  allowBlank
) {

  const text =
    itemDirectoryNormalizeText_(
      value
    );


  if (
    !text &&
    allowBlank
  ) {

    return '';

  }


  if (
    text ===
    itemDirectoryNormalizeText_(
      'عائلي'
    )
  ) {

    return 'عائلي';

  }


  if (
    text ===
    itemDirectoryNormalizeText_(
      'شخصي'
    )
  ) {

    return 'شخصي';

  }


  throw new Error(
    'صنف غير صالح: ' +
    value
  );

}


function itemDirectoryCanonicalActive_(
  value
) {

  if (
    value === true ||
    value === 1
  ) {

    return 'نعم';

  }


  const text =
    itemDirectoryNormalizeText_(
      value
    );


  if (
    text === 'نعم' ||
    text === 'yes' ||
    text === 'true' ||
    text === 'فعال' ||
    text === 'نشط'
  ) {

    return 'نعم';

  }


  if (
    text === 'لا' ||
    text === 'no' ||
    text === 'false' ||
    text === 'غير فعال'
  ) {

    return 'لا';

  }


  return itemDirectoryText_(
    value
  );

}


/* =========================================================
   LEGACY
   ========================================================= */


function itemDirectoryLegacyClassification_(
  scope,
  period
) {

  if (
    scope ===
      'عائلي' &&
    period ===
      'شهري'
  ) {

    return 'العائلي الشهري';

  }


  if (
    scope ===
      'عائلي' &&
    period ===
      'سنوي'
  ) {

    return 'العائلي السنوي';

  }


  if (
    scope ===
      'شخصي' &&
    period ===
      'شهري'
  ) {

    return 'الشخصي الشهري';

  }


  if (
    scope ===
      'شخصي' &&
    period ===
      'سنوي'
  ) {

    return 'الشخصي السنوي';

  }


  return '';

}


/* =========================================================
   EXPENSE DETECTION
   ========================================================= */


function itemDirectoryIsExpenseRow_(
  row
) {

  const c =
    ITEM_DIRECTORY_CONFIG.columns;


  const movement =
    itemDirectoryNormalizeText_(
      row[
        c.movement - 1
      ]
    );


  const action =
    itemDirectoryNormalizeText_(
      row[
        c.action - 1
      ]
    );


  return (

    movement.indexOf(
      itemDirectoryNormalizeText_(
        'مصروف'
      )
    ) !== -1 ||

    action.indexOf(
      itemDirectoryNormalizeText_(
        'تسجيل المصروف'
      )
    ) !== -1

  );

}


/* =========================================================
   ACTIVE
   ========================================================= */


function itemDirectoryIsActive_(
  value
) {

  if (
    value === true ||
    value === 1
  ) {

    return true;

  }


  const text =
    itemDirectoryNormalizeText_(
      value
    );


  return (

    text === 'نعم' ||

    text === 'yes' ||

    text === 'true' ||

    text === 'فعال' ||

    text === 'نشط'

  );

}


/* =========================================================
   WEB SAFE — أهم إصلاح في هذه النسخة
   ========================================================= */


/**
 * تحويل Date إلى String ISO.
 */
function itemDirectoryDateForWeb_(
  value
) {

  if (
    value === null ||
    value === undefined ||
    value === ''
  ) {

    return '';

  }


  if (
    Object.prototype.toString.call(
      value
    ) ===
    '[object Date]'
  ) {

    if (
      isNaN(
        value.getTime()
      )
    ) {

      return '';

    }


    return value.toISOString();

  }


  return itemDirectoryText_(
    value
  );

}


/**
 * يحول أي Object إلى بيانات مسموحة عبر google.script.run.
 *
 * Date → String
 * undefined → null
 */
function itemDirectoryWebSafe_(
  value
) {

  if (
    value ===
    undefined
  ) {

    return null;

  }


  if (
    value ===
    null
  ) {

    return null;

  }


  if (
    Object.prototype.toString.call(
      value
    ) ===
    '[object Date]'
  ) {

    return itemDirectoryDateForWeb_(
      value
    );

  }


  if (
    Array.isArray(
      value
    )
  ) {

    return value.map(
      function(item) {

        return itemDirectoryWebSafe_(
          item
        );

      }
    );

  }


  if (
    typeof value ===
    'object'
  ) {

    const result =
      {};


    Object.keys(
      value
    )
    .forEach(
      function(key) {

        result[
          key
        ] =
          itemDirectoryWebSafe_(
            value[
              key
            ]
          );

      }
    );


    return result;

  }


  if (
    typeof value ===
      'string' ||
    typeof value ===
      'number' ||
    typeof value ===
      'boolean'
  ) {

    return value;

  }


  return String(
    value
  );

}


/**
 * فحص داخلي للتأكد أنه لا يوجد Date.
 */
function itemDirectoryContainsIllegalWebValue_(
  value
) {

  if (
    Object.prototype.toString.call(
      value
    ) ===
    '[object Date]'
  ) {

    return true;

  }


  if (
    typeof value ===
    'function' ||
    value ===
    undefined
  ) {

    return true;

  }


  if (
    Array.isArray(
      value
    )
  ) {

    return value.some(
      function(item) {

        return itemDirectoryContainsIllegalWebValue_(
          item
        );

      }
    );

  }


  if (
    value &&
    typeof value ===
    'object'
  ) {

    return Object.keys(
      value
    )
    .some(
      function(key) {

        return itemDirectoryContainsIllegalWebValue_(
          value[
            key
          ]
        );

      }
    );

  }


  return false;

}


/* =========================================================
   SPREADSHEET
   ========================================================= */


function itemDirectorySpreadsheet_() {

  if (
    typeof appActiveSpreadsheet ===
    'function'
  ) {

    const ss =
      appActiveSpreadsheet();


    if (
      ss
    ) {

      return ss;

    }

  }


  const active =
    SpreadsheetApp
      .getActiveSpreadsheet();


  if (
    !active
  ) {

    throw new Error(
      'تعذر الوصول إلى Google Sheets.'
    );

  }


  return active;

}


function itemDirectoryGetSheet_() {

  const ss =
    itemDirectorySpreadsheet_();


  const sheet =
    ss.getSheetByName(
      ITEM_DIRECTORY_CONFIG
        .sheetName
    );


  if (
    !sheet
  ) {

    throw new Error(
      'لم يتم العثور على ورقة: ' +
      ITEM_DIRECTORY_CONFIG
        .sheetName
    );

  }


  return sheet;

}


/* =========================================================
   HEADER
   ========================================================= */


function itemDirectoryFindHeader_(
  headers,
  names
) {

  const normalizedNames =
    names.map(
      function(name) {

        return itemDirectoryNormalizeText_(
          name
        );

      }
    );


  for (
    let i = 0;
    i < headers.length;
    i++
  ) {

    const header =
      itemDirectoryNormalizeText_(
        headers[
          i
        ]
      );


    if (
      normalizedNames.indexOf(
        header
      ) !== -1
    ) {

      return (
        i +
        1
      );

    }

  }


  return 0;

}


/* =========================================================
   TEXT
   ========================================================= */


function itemDirectoryText_(
  value
) {

  if (
    value === null ||
    value === undefined
  ) {

    return '';

  }


  return String(
    value
  ).trim();

}


function itemDirectoryNormalizeText_(
  value
) {

  return String(
    value || ''
  )
  .trim()
  .toLowerCase()
  .replace(
    /[\u064B-\u065F]/g,
    ''
  )
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
  );

}


/* =========================================================
   SAFE TEST
   ========================================================= */


/**
 * اختبار آمن:
 *
 * - لا يكتب في الشيت.
 * - لا يعيد تسمية Gmail.
 * - لا يرسل رسائل.
 * - لا ينشئ Trigger.
 *
 * ويختبر الآن أيضًا أن Payload صالح للـDashboard.
 */
function testItemDirectoryBackend() {

  const data =
    getItemDirectoryData({});


  const gmail =
    itemDirectoryGetGmailSnapshot_();


  let linkedToGmail =
    0;


  let missingInGmail =
    0;


  let nameDifference =
    0;


  data.rows.forEach(
    function(row) {

      if (
        !row.gmailLabelId
      ) {

        return;

      }


      const gmailLabel =
        gmail.byId[
          row.gmailLabelId
        ];


      if (
        !gmailLabel
      ) {

        missingInGmail++;


        return;

      }


      linkedToGmail++;


      if (
        itemDirectoryNormalizeText_(
          gmailLabel.name
        ) !==
        itemDirectoryNormalizeText_(
          row.item
        )
      ) {

        nameDifference++;

      }

    }
  );


  const accounts = {

    familyMonthly: 0,

    familyAnnual: 0,

    personalMonthly: 0,

    personalAnnual: 0
  };


  data.rows.forEach(
    function(row) {

      if (
        row.account.key ===
        'family_monthly'
      ) {

        accounts.familyMonthly++;

      }


      if (
        row.account.key ===
        'family_annual'
      ) {

        accounts.familyAnnual++;

      }


      if (
        row.account.key ===
        'personal_monthly'
      ) {

        accounts.personalMonthly++;

      }


      if (
        row.account.key ===
        'personal_annual'
      ) {

        accounts.personalAnnual++;

      }

    }
  );


  const illegalWebValue =
    itemDirectoryContainsIllegalWebValue_(
      data
    );


  if (
    illegalWebValue
  ) {

    throw new Error(
      'البيانات ما زالت تحتوي قيمة غير صالحة لـ google.script.run.'
    );

  }


  /*
   * اختبار إضافي:
   * يجب أن يمكن تحويل النتيجة إلى JSON كاملة.
   */
  const json =
    JSON.stringify(
      data
    );


  if (
    !json ||
    json.length <
      10
  ) {

    throw new Error(
      'فشل إنشاء Web Payload.'
    );

  }


  const response = {

    success:
      true,

    safeTest:
      true,

    webSerializable:
      true,

    payloadCharacters:
      json.length,

    totalItems:
      data.summary.total,

    activeItems:
      data.summary.active,

    expenseItems:
      data.summary.expenseItems,

    completeExpenseItems:
      data.summary.completeExpenseItems,

    needsReview:
      data.summary.needsReview,

    gmail: {

      totalLabels:
        gmail.labels.length,

      linked:
        linkedToGmail,

      missing:
        missingInGmail,

      nameDifference:
        nameDifference
    },

    classifications: {

      basic:
        data.summary.categories.basic,

      exceptional:
        data.summary.categories.exceptional,

      leisure:
        data.summary.categories.leisure
    },

    accounts:
      accounts
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
