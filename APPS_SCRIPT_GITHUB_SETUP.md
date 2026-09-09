# نشر Apps Script من GitHub

المصدر الكامل لمشروع Apps Script موجود في مجلد `apps-script`.

يلزم إضافة سرّين مرة واحدة من صفحة المستودع:

1. `APPS_SCRIPT_ID`: معرّف مشروع Apps Script من **Project Settings > Script ID**.
2. `CLASPRC_JSON`: المحتوى الكامل لملف اعتماد `clasp` بعد تسجيل الدخول إلى حساب Google المالك للمشروع.

بعد إضافتهما، افتح **Actions > Deploy Apps Script > Run workflow**. وبعد ذلك، كل تعديل في مجلد `apps-script` على فرع `main` يُنشر تلقائيًا إلى مشروع Apps Script نفسه.

ملفات الاعتماد محظورة بواسطة `.gitignore` ولا تُرفع إلى المستودع.

