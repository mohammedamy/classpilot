export default {
  // Weekdays
  Sunday: 'الأحد',
  Monday: 'الإثنين',
  Tuesday: 'الثلاثاء',
  Wednesday: 'الأربعاء',
  Thursday: 'الخميس',
  Friday: 'الجمعة',
  Saturday: 'السبت',

  // Messages — page & tabs
  Messages: 'الرسائل',
  'Send personalized emails to students and parents from your Gmail. Each family gets their own child’s average, missing work and what’s coming up.':
    'أرسل رسائل بريد إلكتروني مخصّصة للطلاب وأولياء الأمور مباشرةً من حسابك في Gmail. تتلقى كل أسرة معدل ابنها والأعمال غير المسلّمة والمهام القادمة.',
  Compose: 'إنشاء رسالة',
  Automations: 'الأتمتة',
  Sent: 'تم الإرسال',

  // Messages — buildMessages fallbacks
  'nothing due': 'لا توجد مهام مستحقة',
  'not graded yet': 'لم يُصحَّح بعد',
  none: 'لا يوجد',
  None: 'لا يوجد',

  // Messages — prefilled assessment messages
  'Reminder: {title} is still missing': 'تذكير: لم يتم تسليم «{title}» بعد',
  'New in {cls}: {title}': 'جديد في {cls}: {title}',
  "I haven't received your {title} yet. Please complete it as soon as possible":
    'لم أستلم «{title}» الخاص بك بعد. يرجى إكماله في أقرب وقت ممكن',
  'Your {title} is now available': 'أصبح «{title}» متاحاً الآن',
  "Hi {student},\n\n{intro}. It's due {due}.\n\nOpen it here: {link}\n\nGood luck!\n{teacher}":
    "مرحباً {student}،\n\n{intro}. آخر موعد للتسليم: {due}.\n\nافتحه من هنا: {link}\n\nبالتوفيق!\n{teacher}",

  // Messages — Compose controls & AI draft
  'Draft with AI': 'صياغة بالذكاء الاصطناعي',
  'e.g. Remind parents about Thursday’s science fair and ask them to sign the permission slip':
    'مثال: ذكّر أولياء الأمور بمعرض العلوم يوم الخميس واطلب منهم توقيع نموذج الموافقة',
  Draft: 'صياغة',
  'Draft written by Gemini': 'تمت صياغة المسودة بواسطة Gemini',
  'Draft created (demo mode)': 'تم إنشاء المسودة (الوضع التجريبي)',
  'Send to': 'إرسال إلى',
  Parents: 'أولياء الأمور',
  Students: 'الطلاب',
  Both: 'كلاهما',
  parents: 'أولياء الأمور',
  students: 'الطلاب',
  both: 'الطلاب وأولياء الأمور',
  Template: 'القالب',
  'Load a template…': 'اختر قالباً…',
  'Weekly progress report (parents)': 'تقرير التقدم الأسبوعي (لأولياء الأمور)',
  'Due-soon reminder (students)': 'تذكير بقرب موعد التسليم (للطلاب)',
  'Missing work alert (parents)': 'تنبيه بالأعمال غير المسلّمة (لأولياء الأمور)',
  Classes: 'الفصول',
  'Only students with missing work': 'فقط الطلاب الذين لديهم أعمال غير مسلّمة',
  'Only students with missing work on “{title}”': 'فقط الطلاب الذين لديهم أعمال غير مسلّمة في «{title}»',
  Subject: 'الموضوع',
  Message: 'الرسالة',
  'Insert:': 'إدراج:',
  '1 personalized email': 'رسالة مخصّصة واحدة',
  '{n} personalized emails': '{n} رسائل مخصّصة',
  'Merge file': 'ملف دمج المراسلات',
  'Make it weekly': 'جدولة أسبوعية',
  'Send via Gmail': 'إرسال عبر Gmail',
  Gmail: 'Gmail',
  'Connect Gmail in Settings to send. You can download the merge file for now.':
    'اربط حساب Gmail من الإعدادات للإرسال، أو يمكنك تنزيل ملف دمج المراسلات حالياً.',
  'Sent 1 email': 'تم إرسال رسالة واحدة',
  'Sent {n} emails': 'تم إرسال {n} رسائل',
  'Sent {sent} email, {failed} failed': 'تم إرسال رسالة واحدة، وتعذّر إرسال {failed}',
  'Sent {sent} emails, {failed} failed': 'تم إرسال {sent} رسائل، وتعذّر إرسال {failed}',
  'Mail-merge file downloaded': 'تم تنزيل ملف دمج المراسلات',

  // Messages — Preview & Gmail banner
  Preview: 'معاينة',
  'To: {to}': 'إلى: {to}',
  'No recipients': 'لا يوجد مستلمون',
  'No matching recipients': 'لا يوجد مستلمون مطابقون',
  'Change classes or filters.': 'غيّر الفصول أو خيارات التصفية.',
  'Gmail connected. Emails go out from your account.': 'تم ربط Gmail. تُرسل الرسائل مباشرةً من حسابك.',
  'You’ll be asked to sign in to Google the first time you send.':
    'سيُطلب منك تسجيل الدخول إلى Google عند الإرسال لأول مرة.',
  'Gmail isn’t set up yet. Add a Google Client ID in Settings, or use the':
    'لم يتم إعداد Gmail بعد. أضف معرّف عميل Google في الإعدادات، أو استخدم',
  'with Gmail/Outlook mail merge.': 'مع أداة دمج المراسلات في Gmail أو Outlook.',
  'Weekly email': 'رسالة أسبوعية',

  // Messages — Automations & modal
  'Automations run on schedule while ClassPilot is open, and anything that comes due shows up here so you can send it with one click. To send even when your computer is off, deploy the small backend described in the README.':
    'تعمل مهام الأتمتة وفق الجدول المحدد أثناء فتح ClassPilot، وتظهر أي رسائل مستحقة هنا لإرسالها بنقرة واحدة. وللإرسال حتى عند إيقاف جهازك، انشر الخادم المصغّر الموضّح في ملف README.',
  'Scheduled emails': 'الرسائل المجدولة',
  'New automation': 'أتمتة جديدة',
  'Edit automation': 'تعديل الأتمتة',
  'No automations yet': 'لا توجد مهام أتمتة بعد',
  'Due now': 'مستحقة الآن',
  'Every {day} at {time} · to {audience}': '{day} من كل أسبوع الساعة {time} · إلى {audience}',
  'Next: {when}': 'القادم: {when}',
  Paused: 'متوقفة مؤقتاً',
  'Last run: {when}': 'آخر تشغيل: {when}',
  never: 'لم تُشغَّل بعد',
  On: 'مفعّلة',
  'Run now': 'تشغيل الآن',
  Edit: 'تعديل',
  Delete: 'حذف',
  '{name}: sent {n} emails': '{name}: تم إرسال {n} رسائل',
  '{name}: merge file downloaded (connect Gmail to send automatically)':
    '{name}: تم تنزيل ملف دمج المراسلات (اربط Gmail للإرسال التلقائي)',
  'Weekly progress report': 'تقرير التقدم الأسبوعي',
  'Sunday reminders': 'تذكيرات يوم الأحد',
  'Automation saved': 'تم حفظ الأتمتة',
  Cancel: 'إلغاء',
  Save: 'حفظ',
  Name: 'الاسم',
  Every: 'كل أسبوع في',
  At: 'الساعة',
  To: 'إلى',
  'Only send for students with missing work': 'الإرسال فقط للطلاب الذين لديهم أعمال غير مسلّمة',

  // Messages — Sent history
  'Nothing sent yet': 'لم يتم إرسال أي رسائل بعد',
  Audience: 'الفئة المستهدفة',
  Recipients: 'المستلمون',

  // Gradebook — main view
  Gradebook: 'سجل الدرجات',
  'Click any mark to edit it. Changed marks are highlighted until you sync them to Classera.':
    'انقر على أي درجة لتعديلها. تُميَّز الدرجات المعدّلة حتى تتم مزامنتها مع كلاسيرا.',
  'Open Classera': 'فتح كلاسيرا',
  'Sync to Classera': 'مزامنة مع كلاسيرا',
  'Find a student': 'ابحث عن طالب',
  'Changed, not synced': 'معدّلة غير مزامَنة',
  'Waiting for AI correction': 'بانتظار التصحيح بالذكاء الاصطناعي',
  Missing: 'مفقود',
  '{n} changed in {cls}': '{n} درجات معدّلة في {cls}',
  'No published assignments for this class': 'لا توجد تقييمات منشورة لهذا الفصل',
  Student: 'الطالب',
  Average: 'المعدل',
  'Classera ID {id}': 'معرّف كلاسيرا {id}',
  AI: 'آلي',
  miss: 'مفقود',
  'Changed. Not yet synced to Classera': 'تم التعديل. لم تتم مزامنتها مع كلاسيرا بعد',
  'Marked as synced with Classera': 'تم التحديد كمزامَن مع كلاسيرا',

  // Gradebook — SyncModal
  'Exported {n} changed marks': 'تم تصدير {n} درجات معدّلة',
  'Exported {n} class gradebooks': 'تم تصدير سجلات الدرجات لـ {n} فصول',
  'Sync marks to Classera': 'مزامنة الدرجات مع كلاسيرا',
  Close: 'إغلاق',
  'I’ve uploaded them, mark as synced': 'لقد رفعتها، حدّدها كمزامَنة',
  'Classera has no public API, so for now the sync works through Classera’s gradebook':
    'لا توفّر كلاسيرا واجهة برمجية عامة حالياً، لذا تتم المزامنة عبر سجل درجات كلاسيرا من خلال',
  'Import from Excel/CSV': 'الاستيراد من Excel/CSV',
  'If your school gets API access, this button can push marks directly.':
    'إذا حصلت مدرستك على صلاحية الوصول إلى الواجهة البرمجية، فسيتمكن هذا الزر من إرسال الدرجات مباشرةً.',
  'Only changed marks ({n})': 'الدرجات المعدّلة فقط ({n})',
  'Full gradebook per class': 'سجل الدرجات الكامل لكل فصل',
  'Everything is in sync': 'جميع الدرجات متزامنة',
  Assessment: 'التقييم',
  Mark: 'الدرجة',
  'Downloads one CSV per class with Classera student IDs and a column per assessment.':
    'يُنزّل ملف CSV واحداً لكل فصل يتضمن معرّفات الطلاب في كلاسيرا وعموداً لكل تقييم.',
  'Download the file below.': 'نزّل الملف أدناه.',
  'In Classera, open': 'في كلاسيرا، افتح',
  'Gradebook → Import marks': 'سجل الدرجات ← استيراد الدرجات',
  'for the class and upload it.': 'للفصل وارفع الملف.',
  'Come back and click': 'عُد إلى هنا واضغط على',
  'Mark as synced': 'تحديد كمزامَن',
  'Download CSV for Classera': 'تنزيل ملف CSV لكلاسيرا',
  'Last synced {when}': 'آخر مزامنة: {when}',
};
