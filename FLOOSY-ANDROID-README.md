# FLOOSY Android — independent branch

This branch **does not alter main** or the existing FLOOSY web/Cloudflare deployment.

## Build

1. Place the contents of `FLOOSY-GitHub-Actions-Android.zip/FLOOSY-GitHub-Actions/floosy-android/` into the matching `floosy-android/` directory in this branch.
2. Commit those source files to `floosy-android-app` (not to `main`).
3. Open GitHub **Actions → FLOOSY Android APK (offline SMS) → Run workflow**.
4. After tests and build pass, download the APK from **Artifacts**.

The workflow refuses to publish an APK when source files are missing or tests fail.

The Android SMS reading function requires consent and an approved sender allowlist. No live production Cloudflare secrets should be copied to the app. Android's SMS permission is restricted for Google Play publication.

**Source upload status:** Pending source-file upload. The workflow alone cannot build an APK.
