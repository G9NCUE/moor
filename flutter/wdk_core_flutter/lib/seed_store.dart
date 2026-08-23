import 'dart:convert';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import 'wdk_core_flutter.dart';

/// The encrypted seed and its key, in the Android Keystore.
class SeedStore {
  static const _key = 'wdk.seed';
  static const _storage = FlutterSecureStorage();

  static Future<EncryptedSeed?> read() async {
    final raw = await _storage.read(key: _key);
    return raw == null ? null : EncryptedSeed.fromJson(jsonDecode(raw) as Map);
  }

  static Future<void> write(EncryptedSeed seed) => _storage.write(key: _key, value: jsonEncode(seed.toJson()));
  static Future<void> clear() => _storage.delete(key: _key);
}
