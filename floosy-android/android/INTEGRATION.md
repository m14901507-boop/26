# Android integration

The package carries its Kotlin SMS bridge and Android manifest, but does **not**
carry generated Gradle wrapper binaries or standard Flutter Android scaffolding.

For first-time setup with Flutter SDK on Windows/macOS/Linux:

1. Copy/unzip this source into an ordinary project directory.
2. Back up the two custom files under `android/app/src/main/`:
   - `AndroidManifest.xml`
   - `kotlin/com/floosy/mobile/MainActivity.kt`
3. Run `flutter create --platforms android --project-name floosy_mobile --org com.floosy .`
4. Confirm that the two custom files remain intact; restore them if the Flutter
   generator replaced them.
5. Check application `namespace` and `applicationId` in
   `android/app/build.gradle` or `.kts`: use `com.floosy.mobile`, and ensure the
   Kotlin file remains in `com/floosy/mobile`.
6. Run `flutter pub get`, then `flutter run` with an Android phone connected.
7. For an APK: `flutter build apk --release` after configuring signing.

The native bridge exposes `hasPermission`, `requestPermission`, and `readInbox`
on the `floosy/sms` method channel. It queries the SMS inbox only, restricts the
returned messages to the sender IDs manually approved by the user, and never
uses any network APIs.
