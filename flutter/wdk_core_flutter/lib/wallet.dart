import 'dart:convert';

import 'wdk_core_flutter.dart';

/// One WDK account on one network, through `callMethod`. Mirrors wdk-core-kotlin.
class Wallet {
  Wallet(this._wdk, {required this.network, this.accountIndex = 0});
  final WdkCore _wdk;
  final String network;
  final int accountIndex;

  Future<dynamic> call(String method, [List<dynamic> args = const []]) async {
    final r = await _wdk.call('callMethod', {
      'methodName': method,
      'network': network,
      'accountIndex': accountIndex,
      if (args.isNotEmpty) 'args': jsonEncode(args),
    });
    return r['result'];
  }

  Future<String> get address async => await call('getAddress') as String;

  /// Base units, as a string: they exceed what a double holds.
  Future<BigInt> tokenBalance(String token) async => BigInt.parse((await call('getTokenBalance', [token])).toString());

  /// The fee, in the token, charged on top of the amount. Fails with AA20 on an account
  /// that has never transacted (finding 16).
  Future<BigInt> quoteTransfer({required String token, required String to, required BigInt amount}) async =>
      BigInt.parse(((await call('quoteTransfer', [{'token': token, 'recipient': to, 'amount': amount.toString()}])) as Map)['fee'].toString());

  Future<({String hash, BigInt fee})> transfer({required String token, required String to, required BigInt amount}) async {
    final r = await call('transfer', [{'token': token, 'recipient': to, 'amount': amount.toString()}]) as Map;
    return (hash: r['hash'] as String, fee: BigInt.parse(r['fee'].toString()));
  }
}

/// Null for anything but a plain positive decimal within six places; never rounds.
BigInt? parseUsdt(String text) {
  final m = RegExp(r'^(\d+)(?:\.(\d{1,6}))?$').firstMatch(text.trim());
  if (m == null) return null;
  return BigInt.parse(m.group(1)! + (m.group(2) ?? '').padRight(6, '0'));
}

/// USD₮0 on Arbitrum One.
const usdt0Arbitrum = '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9';

String formatUsdt(BigInt baseUnits) {
  final s = baseUnits.toString().padLeft(7, '0');
  return '${s.substring(0, s.length - 6)}.${s.substring(s.length - 6, s.length - 4)}';
}
