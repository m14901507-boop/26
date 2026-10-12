package com.floosy.mobile

import android.Manifest
import android.content.pm.PackageManager
import android.os.Build
import android.provider.Telephony
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel

/** Reads inbox SMS only after explicit user permission. All data stays on device. */
class MainActivity : FlutterActivity() {
    private val channelName = "floosy/sms"
    private val smsRequestCode = 8329
    private var permissionResult: MethodChannel.Result? = null

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, channelName).setMethodCallHandler { call, result ->
            when (call.method) {
                "hasPermission" -> result.success(hasSmsPermission())
                "requestPermission" -> {
                    if (hasSmsPermission()) {
                        result.success(true)
                    } else if (permissionResult != null) {
                        result.error("BUSY", "Permission dialog is already open", null)
                    } else {
                        permissionResult = result
                        requestPermissions(arrayOf(Manifest.permission.READ_SMS), smsRequestCode)
                    }
                }
                "readInbox" -> {
                    if (!hasSmsPermission()) {
                        result.error("PERMISSION_DENIED", "READ_SMS permission required", null)
                        return@setMethodCallHandler
                    }
                    val provided = call.argument<List<String>>("senders") ?: emptyList()
                    val allowed = provided.map { normalizeSender(it) }.filter { it.isNotEmpty() }.toSet()
                    val limit = (call.argument<Int>("limit") ?: 5000).coerceIn(1, 5000)
                    Thread {
                        try {
                            val found = readAllowedMessages(allowed, limit)
                            runOnUiThread { result.success(found) }
                        } catch (e: Exception) {
                            runOnUiThread {
                                result.error("SMS_READ_ERROR", e.message ?: "Failed to query SMS provider", null)
                            }
                        }
                    }.start()
                }
                else -> result.notImplemented()
            }
        }
    }

    private fun hasSmsPermission(): Boolean =
        checkSelfPermission(Manifest.permission.READ_SMS) == PackageManager.PERMISSION_GRANTED

    private fun normalizeSender(raw: String): String =
        raw.trim().lowercase(java.util.Locale.ROOT).replace(" ", "")

    /** Return *only* SMS from the bank sender IDs configured by the user. */
    private fun readAllowedMessages(allowed: Set<String>, limit: Int): List<Map<String, Any>> {
        if (allowed.isEmpty()) return emptyList()
        val output = ArrayList<Map<String, Any>>()
        val columns = arrayOf("_id", "address", "body", "date")
        contentResolver.query(
            Telephony.Sms.Inbox.CONTENT_URI, columns, null, null, "date DESC"
        )?.use { cursor ->
            val idIndex = cursor.getColumnIndexOrThrow("_id")
            val addressIndex = cursor.getColumnIndexOrThrow("address")
            val bodyIndex = cursor.getColumnIndexOrThrow("body")
            val dateIndex = cursor.getColumnIndexOrThrow("date")
            var examined = 0
            while (cursor.moveToNext() && examined < limit) {
                examined++
                val address = cursor.getString(addressIndex) ?: continue
                if (normalizeSender(address) !in allowed) continue
                val body = cursor.getString(bodyIndex) ?: continue
                output.add(mapOf(
                    "id" to cursor.getLong(idIndex),
                    "address" to address,
                    "body" to body,
                    "date" to cursor.getLong(dateIndex)
                ))
            }
        }
        return output
    }

    override fun onRequestPermissionsResult(requestCode: Int,
            permissions: Array<out String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode == smsRequestCode) {
            permissionResult?.success(grantResults.isNotEmpty() &&
                grantResults[0] == PackageManager.PERMISSION_GRANTED)
            permissionResult = null
        }
    }
}
