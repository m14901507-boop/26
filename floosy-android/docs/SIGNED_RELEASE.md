# FLOOSY Android SMS — signed release

This is an **isolated experimental release branch**. It does not change the website, cloud infrastructure, or existing Android pipeline.

## Security decisions
- Retain **READ_SMS** to enable explicit, user-initiated bank SMS import.
- Native code checks permission at runtime and returns only messages from selected sender IDs to Flutter; Android's inbox query still traverses up to 5,000 messages, so the app has sensitive access. It must not be represented as incapable of reading other messages.
- Do not add SEND_SMS, RECEIVE_SMS, INTERNET, or READ_CONTACTS permissions. Build fails if any are detected in the packaged APK.
- Disable cleartext traffic and Android backup. This does **not** constitute encryption at rest or a security audit.
- Do not turn off Google Play Protect. **A valid signature is not Play Protect approval.** Google Play SMS permission usage may require declaration and review: https://support.google.com/googleplay/android-developer/answer/10208820

## Provision signing secrets (repository > Settings > Secrets and variables > Actions)
Create a **private release keystore** using an offline trusted machine; keep a secure backup outside GitHub. Do not commit a keystore, password, alias, or local properties.
Create the following Actions secrets:
- `FLOOSY_KEYSTORE_BASE64`: Base64 representation of the **binary** keystore (single line)
- `FLOOSY_STORE_PASSWORD`: keystore password
- `FLOOSY_KEY_ALIAS`: alias of the signing key
- `FLOOSY_KEY_PASSWORD`: signing key password

Example keystore creation on your private computer:

```sh
keytool -genkeypair -v -keystore floosy-release.jks -storetype PKCS12 -alias floosy -keyalg RSA -keysize 3072 -validity 10000
```

Encode the keystore locally. For Linux: `base64 -w0 floosy-release.jks`; for macOS: `base64 < floosy-release.jks | tr -d '\n'`. Copy the output only into GitHub Actions secret (never an issue or commit).

**Keep the same signing key for future updates.** The Android package ID is `com.floosy.mobile`; if the previous installed APK used another key, uninstalling/reinstalling may be required and deletes its local financial data. Back up important data before changing builds. Existing FLOOSY does not offer a backup/export facility yet.

## Build and checks
Workflow: `.github/workflows/floosy-sms-signed-release.yml`.
On commits to `floosy-sms-release-hardening` (or a manually dispatched run), the workflow:
1. Refuses to build without all four secrets.
2. Generates Flutter Android scaffolding and restores the original manifest and Kotlin SMS bridge.
3. Replaces Flutter's default debug signing with a private production key; aligns `namespace` and `applicationId` with `com.floosy.mobile`.
4. Runs Flutter tests and builds a signed release APK.
5. Uses Android `apksigner` to verify the signature, `aapt` to check the final package ID and permissions, and SHA-256 for integrity.
6. Uploads an artifact named `FLOOSY-SMS-signed-release-APK`.

If required secrets are absent, a failed job is **expected**, and **no signed APK** will be produced. This setup does not guarantee Play Protect clearance. Test the installed APK on your own Android device, inspect its requested permissions, and follow Google Play SMS permission policy for publication.
