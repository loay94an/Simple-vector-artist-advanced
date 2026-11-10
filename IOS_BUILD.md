# إعداد iOS لتطبيق رسام الخط العربي

تمت إضافة منصة Capacitor iOS باستخدام `@capacitor/ios` من الإصدار المتوافق مع Capacitor 8.

## متطلبات البناء

- macOS مع Xcode 26 أو أحدث متوافق مع Capacitor 8.
- Node.js 22.
- تشغيل `npm ci` ثم `npm run build`.
- تشغيل `npx cap add ios` لأول مرة ثم `npx cap sync ios`.
- فتح `ios/App/App.xcworkspace` بواسطة Xcode عند الحاجة.

## البناء السحابي

سير العمل `.github/workflows/ios-ipa.yml` يعمل على GitHub macOS runner، ويختبر المشروع ثم ينشئ مشروع iOS ويؤرشف التطبيق دون توقيع، ويرفع أرشيف البناء وحزمة IPA غير الموقعة كـ workflow artifact.

## تنبيه مهم حول IPA

الحزمة غير الموقعة الناتجة عن هذا المسار **ليست قابلة للتثبيت مباشرة على iPhone**. تشغيل تطبيق iOS على جهاز يتطلب توقيعاً وملف provisioning صالحاً. يمكن استخدام Apple Account مجاني مع Xcode وPersonal Team للاختبار على جهاز شخصي، لكن ملفات التوقيع الشخصية مؤقتة وتتطلب إعادة التوقيع دورياً. أما توزيع IPA على أجهزة أخرى أو عبر TestFlight / App Store فيتطلب عضوية Apple Developer Program وإعداد شهادات وملفات provisioning المناسبة.

لا تضع كلمات مرور Apple أو مفاتيح التوقيع أو ملفات الشهادات داخل المستودع. إذا تقرر لاحقاً إعداد توقيع CI، استخدم GitHub Actions Secrets فقط وبعد تجهيز حساب Apple والمواد الرسمية الخاصة بالتوقيع.


## التثبيت بحساب Apple مجاني

راجع الدليل العملي [IOS_SIDELOAD_GUIDE.md](IOS_SIDELOAD_GUIDE.md) لتنزيل IPA من GitHub Actions وتوقيعه وتثبيته عبر AltStore أو SideStore، مع شرح القيود والتجديد كل 7 أيام.
