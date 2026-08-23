/// WDK from Flutter, over the JSON-RPC transport. See docs/flutter-poc.md.
library;

import 'dart:async';
import 'dart:convert';

import 'package:flutter/services.dart';

class ModuleEvent {
  ModuleEvent({required this.module, required this.event, required this.payload});

  final String module;
  final String event;
  final dynamic payload;

  @override
  String toString() => 'ModuleEvent($module.$event ${jsonEncode(payload)})';
}

class WdkRpcException implements Exception {
  WdkRpcException(this.code, this.message, [this.data]);
  final String code;
  final String message;
  final dynamic data;
  @override
  String toString() => 'WdkRpcException($code: $message)';
}

class WdkCore {
  static const _methods = MethodChannel('to.moor/wdk');
  static const _events = EventChannel('to.moor/wdk/events');

  Stream<Map<String, dynamic>>? _notifications;

  /// Every id-less frame the worklet writes, decoded.
  Stream<Map<String, dynamic>> get notifications => _notifications ??= _events
      .receiveBroadcastStream()
      .map((raw) => jsonDecode(raw as String) as Map<String, dynamic>)
      .asBroadcastStream();

  Stream<ModuleEvent> get moduleEvents => notifications
      .where((m) => m['method'] == 'moduleEvent')
      .map((m) {
        final p = (m['params'] as Map?)?.cast<String, dynamic>() ?? const {};
        return ModuleEvent(module: p['module'] as String? ?? '', event: p['event'] as String? ?? '', payload: p['payload']);
      });

  Future<void> start() async {
    await _methods.invokeMethod<String>('start');
  }

  Future<Map<String, dynamic>> call(String method, [Map<String, dynamic> params = const {}]) async {
    try {
      final raw = await _methods.invokeMethod<String>('call', {'method': method, 'params': jsonEncode(params)});
      return raw == null ? const {} : (jsonDecode(raw) as Map).cast<String, dynamic>();
    } on PlatformException catch (e) {
      throw WdkRpcException(e.code, e.message ?? '', e.details == null ? null : jsonDecode(e.details as String));
    }
  }

  /// `args` travels as a JSON string of an array; that is the worklet's contract.
  Future<dynamic> callModule(String module, String method, [List<dynamic> args = const []]) async {
    final r = await call('callModule', {'module': module, 'method': method, 'args': jsonEncode(args)});
    return r['result'];
  }

  Future<void> close() => _methods.invokeMethod<void>('close');

  // The sequence that brings a module alive, docs/flutter-poc.md §4.

  Future<Map<String, dynamic>> workletStart() => call('workletStart');

  /// A new wallet. The phrase never leaves the worklet unencrypted unless asked for.
  Future<EncryptedSeed> generate({int words = 12}) async =>
      EncryptedSeed.from(await call('generateEntropyAndEncrypt', {'wordCount': words}));

  Future<EncryptedSeed> seedFromMnemonic(String mnemonic) async =>
      EncryptedSeed.from(await call('getSeedAndEntropyFromMnemonic', {'mnemonic': mnemonic}));

  Future<String> mnemonic(EncryptedSeed s) async =>
      (await call('getMnemonicFromEntropy', {'encryptedEntropy': s.encryptedEntropy, 'encryptionKey': s.encryptionKey}))['mnemonic'] as String;

  /// Modules are constructed here, with the seed, before WDK takes the buffer.
  Future<Map<String, dynamic>> initializeWdk(EncryptedSeed seed, Map<String, dynamic> config) =>
      call('initializeWDK', {'encryptionKey': seed.encryptionKey, 'encryptedSeed': seed.encryptedSeed, 'config': jsonEncode(config)});
}

/// What the worklet hands back for a seed: ciphertext plus the key, never the phrase.
class EncryptedSeed {
  EncryptedSeed({required this.encryptionKey, required this.encryptedSeed, this.encryptedEntropy});
  final String encryptionKey;
  final String encryptedSeed;
  final String? encryptedEntropy;

  static EncryptedSeed from(Map m) => EncryptedSeed(
        encryptionKey: m['encryptionKey'] as String,
        encryptedSeed: m['encryptedSeedBuffer'] as String,
        encryptedEntropy: m['encryptedEntropyBuffer'] as String?,
      );
  Map<String, String?> toJson() => {'encryptionKey': encryptionKey, 'encryptedSeed': encryptedSeed, 'encryptedEntropy': encryptedEntropy};
  static EncryptedSeed fromJson(Map m) =>
      EncryptedSeed(encryptionKey: m['encryptionKey'], encryptedSeed: m['encryptedSeed'], encryptedEntropy: m['encryptedEntropy']);
}
