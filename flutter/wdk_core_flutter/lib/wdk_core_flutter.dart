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

  Future<({String encryptionKey, String encryptedSeed})> seedFromMnemonic(String mnemonic) async {
    final r = await call('getSeedAndEntropyFromMnemonic', {'mnemonic': mnemonic});
    return (encryptionKey: r['encryptionKey'] as String, encryptedSeed: r['encryptedSeedBuffer'] as String);
  }

  /// Modules are constructed here, with the seed, before WDK takes the buffer.
  Future<Map<String, dynamic>> initializeWdk({
    required String encryptionKey,
    required String encryptedSeed,
    required Map<String, dynamic> config,
  }) =>
      call('initializeWDK', {
        'encryptionKey': encryptionKey,
        'encryptedSeed': encryptedSeed,
        'config': jsonEncode(config),
      });
}
