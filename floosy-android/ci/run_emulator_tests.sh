#!/usr/bin/env bash
set -euo pipefail
cd floosy-android

# Generate a standard Flutter Android host while restoring SMS-specific code.
mkdir -p "$RUNNER_TEMP/floosy-native"
cp android/app/src/main/AndroidManifest.xml "$RUNNER_TEMP/floosy-native/AndroidManifest.xml"
cp android/app/src/main/kotlin/com/floosy/mobile/MainActivity.kt "$RUNNER_TEMP/floosy-native/MainActivity.kt"
flutter create --platforms=android --org com.floosy --project-name floosy_mobile .
cp "$RUNNER_TEMP/floosy-native/AndroidManifest.xml" android/app/src/main/AndroidManifest.xml
mkdir -p android/app/src/main/kotlin/com/floosy/mobile
cp "$RUNNER_TEMP/floosy-native/MainActivity.kt" android/app/src/main/kotlin/com/floosy/mobile/MainActivity.kt
rm -f test/widget_test.dart
flutter pub get
flutter test test/finance_test.dart test/sms_parser_test.dart

# Flutter build and install before changing runtime permission state.
flutter build apk --debug
adb install -r build/app/outputs/flutter-apk/app-debug.apk
APP_ID=com.floosy.floosy_mobile

# Test that Android refuses SMS access when READ_SMS has not been granted.
adb shell pm revoke "$APP_ID" android.permission.READ_SMS || true
flutter test integration_test/sms_emulator_test.dart -d emulator-5554 --dart-define=SMS_TEST_PHASE=denied

# Only fabricated test messages on an isolated, freshly created emulator.
adb shell pm grant "$APP_ID" android.permission.READ_SMS
adb emu sms send +96890001111 "Your account XX1234 was debited OMR 12.350 at LULU. Available balance OMR 500.200"
adb emu sms send +96890001111 "Your account XX1234 was credited OMR 25.000 for salary."
adb emu sms send +96890001111 "Your verification OTP 456789 for purchase of OMR 7.000"
adb emu sms send +96890002222 "Your account XX9999 was debited OMR 99.000 at OTHER SHOP."
sleep 4
flutter test integration_test/sms_emulator_test.dart -d emulator-5554 --dart-define=SMS_TEST_PHASE=granted

echo 'FLOOSY_EMULATOR_ALL_CHECKS_PASSED'
