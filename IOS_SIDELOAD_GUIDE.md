# تثبيت رسام الخط العربي على iPhone بدون اشتراك Apple Developer

هذا الدليل يشرح طريقة تثبيت ملف IPA الناتج من GitHub Actions باستخدام حساب Apple مجاني. لا يحتاج المشروع إلى Jailbreak، لكن iOS يشترط توقيع التطبيق قبل تشغيله.

## 1. تنزيل ملف IPA

1. افتح تشغيل البناء الناجح: https://github.com/loay94an/Simple-vector-artist-advanced/actions/runs/42875512539
2. من قسم Artifacts نزّل `Rasem-iOS-Unsigned`.
3. فك ضغط ZIP وابحث عن `Rasem-Unsigned.ipa`.

ملاحظة: ملف IPA الناتج غير موقّع؛ لا تحاول فتحه مباشرة على iPhone. يجب أن يمر عبر أداة توقيع مثل AltStore أو SideStore. يحتفظ GitHub بالـ artifact لمدة 14 يوماً فقط لهذا التشغيل.

## 2. الطريقة الأسهل غالباً: AltStore

المتطلبات:
- iPhone أو iPad.
- حاسوب Windows أو Mac.
- Apple Account عادي (مجاني).
- كابل USB، واتصال إنترنت.

الخطوات:
1. نزّل AltServer من الموقع الرسمي: https://altstore.io/ وتابع تعليمات نظامك.
2. على Windows، اتبع تعليمات AltStore الرسمية لتثبيت مكونات Apple المطلوبة؛ استخدم إصدارات Apple الرسمية، لا نسخاً معدّلة.
3. صِل iPhone بالحاسوب، وافتح قفل الجهاز، واختر الوثوق بالحاسوب.
4. ثبّت AltStore على iPhone من خلال AltServer وسجّل الدخول بحساب Apple على جهازك.
5. على iPhone افتح Settings > General > VPN & Device Management، ثم وثّق ملف المطوّر إذا ظهر.
6. إذا طلب iOS تفعيل Developer Mode، افتح Settings > Privacy & Security > Developer Mode وفعّله، ثم أعد تشغيل الجهاز.
7. انقل `Rasem-Unsigned.ipa` إلى iPhone (مثلاً عبر iCloud Drive أو AirDrop).
8. افتح AltStore > My Apps، اضغط +، واختر ملف IPA. ستقوم AltStore بتوقيعه وتثبيته بحسابك.

دليل AltStore الرسمي: https://faq.altstore.io/ و https://altstore.io/

## 3. بديل: SideStore

SideStore خيار آخر للتثبيت الجانبي، ويحتاج إعداداً أولياً على الحاسوب باستخدام أداة iloader، ثم إعداد LocalDevVPN على iPhone. اتبع دليل التثبيت الرسمي حسب إصدار iOS:
https://docs.sidestore.io/docs/installation/install

بعد اكتمال إعداد SideStore:
1. افتح SideStore على iPhone.
2. انتقل إلى My Apps واضغط +.
3. اختر `Rasem-Unsigned.ipa`.
4. اترك SideStore يوقّع التطبيق ويثبّته.

الأسئلة الشائعة والقيود: https://docs.sidestore.io/docs/faq

## 4. قيود الحساب المجاني

- توقيع التطبيقات المجاني صالح عادةً لمدة 7 أيام، لذلك يجب تجديده قبل انتهاء المدة.
- حساب Apple المجاني محدود بعدد التطبيقات الموقّعة التي يمكن تثبيتها وبمعرّفات التطبيقات الأسبوعية؛ راجع قيود الأداة المستخدمة.
- هذا المسار مناسب للاستخدام والتجربة الشخصية، وليس بديلاً عن التوزيع الرسمي عبر App Store أو TestFlight.
- لا ترسل كلمة مرور Apple أو رموز التحقق لأي شخص، ولا تضع بيانات حسابك أو شهادات التوقيع في المستودع أو GitHub Actions.

## 5. ملاحظة عن البناء

نجاح GitHub Actions يعني أن مشروع iOS تم توليده وأرشفة التطبيق وتعبئته كـ IPA غير موقّع. لا يعني ذلك أن التطبيق اختُبر على iPhone فعلي. يلزم إجراء التوقيع والتثبيت ثم اختبار فتح التطبيق والحفظ والتصدير والمشاركة على الجهاز.
