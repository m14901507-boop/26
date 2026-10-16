#!/usr/bin/env python3
"""Fail-closed patch for Flutter-generated Gradle Kotlin DSL. No secrets in files."""
from pathlib import Path
import re

root = Path(__file__).resolve().parents[1]
manifest = (root / "android/app/src/main/AndroidManifest.xml").read_text()
bridge = (root / "android/app/src/main/kotlin/com/floosy/mobile/MainActivity.kt").read_text()
if manifest.count('android.permission.READ_SMS') != 1:
    raise SystemExit("Expected exactly one READ_SMS manifest permission")
for forbidden in ("android.permission.SEND_SMS", "android.permission.RECEIVE_SMS", "android.permission.INTERNET", "android.permission.READ_CONTACTS"):
    if forbidden in manifest:
        raise SystemExit("Forbidden permission: " + forbidden)
if 'android:allowBackup="false"' not in manifest or 'android:usesCleartextTraffic="false"' not in manifest:
    raise SystemExit("Privacy manifest safeguards missing")
for expected in ('"floosy/sms"', 'Manifest.permission.READ_SMS', 'Telephony.Sms.Inbox.CONTENT_URI'):
    if expected not in bridge:
        raise SystemExit("SMS bridge behavior not found: " + expected)

build = root / "android/app/build.gradle.kts"
if not build.is_file():
    raise SystemExit("Expected Flutter-generated build.gradle.kts")
src = build.read_text()
if not re.search(r'applicationId\s*=\s*"com\.floosy\.mobile"', src):
    raise SystemExit("Unexpected Android applicationId")
if not re.search(r'namespace\s*=\s*"com\.floosy\.mobile"', src):
    raise SystemExit("Unexpected namespace")
needle = 'signingConfig = signingConfigs.getByName("debug")'
if src.count(needle) != 1:
    raise SystemExit("Flutter signing template changed; refusing unsafe build")

signing = '''    signingConfigs {
        create("floosyProduction") {
            storeFile = file(System.getenv("FLOOSY_KEYSTORE_PATH")
                ?: error("FLOOSY_KEYSTORE_PATH is required"))
            storePassword = providers.gradleProperty("FLOOSY_STORE_PASSWORD").get()
            keyAlias = providers.gradleProperty("FLOOSY_KEY_ALIAS").get()
            keyPassword = providers.gradleProperty("FLOOSY_KEY_PASSWORD").get()
        }
    }
'''
if src.count("    buildTypes {") != 1:
    raise SystemExit("Unexpected Gradle buildTypes structure")
src = src.replace("    buildTypes {", signing + "    buildTypes {", 1)
src = src.replace(needle, 'signingConfig = signingConfigs.getByName("floosyProduction")', 1)
build.write_text(src)
print("Signed release build configured. SMS permission retained; no keys committed.")
