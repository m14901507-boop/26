import 'package:flutter/services.dart';

/// Android MethodChannel. No cloud service is involved.
class LocalSmsReader {
  static const _channel = MethodChannel('floosy/sms');
  static Future<bool> hasPermission() async =>
      await _channel.invokeMethod<bool>('hasPermission') ?? false;
  static Future<bool> requestPermission() async =>
      await _channel.invokeMethod<bool>('requestPermission') ?? false;

  /// Reads only messages whose sender matches a user-provided bank sender ID.
  /// Other messages are not returned to Dart or stored by FLOOSY.
  static Future<List<Map<String, dynamic>>> readBankMessages(List<String> allowedSenders) async {
    if (allowedSenders.isEmpty) return const [];
    final data = await _channel.invokeListMethod<dynamic>('readInbox', {
      'senders': allowedSenders, 'limit': 5000,
    });
    return (data ?? []).whereType<Map>().map((v) =>
        v.map((key, value) => MapEntry('$key', value))).toList();
  }
}
