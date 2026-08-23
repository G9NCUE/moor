import 'package:flutter/material.dart';
import 'package:wdk_core_flutter/wdk_core_flutter.dart';

const kMnemonic = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
// Stands in for the QR scan.
const kAllowPeer = String.fromEnvironment('ALLOW_PEER');
// host:port of phase0/dht-rig.mjs; empty means the public DHT.
const kBootstrap = String.fromEnvironment('BOOTSTRAP');

void main() => runApp(const MaterialApp(home: Phase1()));

class Phase1 extends StatefulWidget {
  const Phase1({super.key});
  @override
  State<Phase1> createState() => _Phase1State();
}

class _Phase1State extends State<Phase1> {
  final wdk = WdkCore();
  final log = <String>[];
  final events = <ModuleEvent>[];
  String? identity;

  void _log(String s) => setState(() => log.add(s));

  @override
  void initState() {
    super.initState();
    wdk.moduleEvents.listen((e) => setState(() => events.add(e)), onError: (e) => _log('event stream error: $e'));
    _run();
  }

  Future<void> _run() async {
    final t0 = DateTime.now();
    String ms() => '${DateTime.now().difference(t0).inMilliseconds}ms';
    try {
      await wdk.start();
      _log('start  ipc open  ${ms()}');

      final s = await wdk.workletStart();
      _log('workletStart  ${s['status']}  ${ms()}');

      final seed = await wdk.seedFromMnemonic(kMnemonic);
      _log('seed derived + encrypted in the worklet  ${ms()}');

      final init = await wdk.initializeWdk(
        encryptionKey: seed.encryptionKey,
        encryptedSeed: seed.encryptedSeed,
        config: {
          // A network without `config` satisfies initializeWDK without building a wallet.
          'networks': {'arbitrum': {'blockchain': 'arbitrum'}},
          'modules': {
            'payRequests': kBootstrap.isEmpty
                ? {}
                : {'bootstrap': [{'host': kBootstrap.split(':')[0], 'port': int.parse(kBootstrap.split(':')[1])}]},
          },
        },
      );
      _log('initializeWDK  ${init['status']}  (module constructed)  ${ms()}');

      final id = await wdk.callModule('payRequests', 'getIdentity');
      setState(() => identity = (id as Map)['publicKey'] as String);
      _log('getIdentity  ${ms()}');

      if (kAllowPeer.isNotEmpty) {
        await wdk.callModule('payRequests', 'setPeers', [[kAllowPeer]]);
        _log('setPeers  allowed ${kAllowPeer.substring(0, 8)}…  ${ms()}');
      }

      try {
        await wdk.callModule('payRequests', 'close');
        _log('FAIL close() was allowed');
      } on WdkRpcException catch (e) {
        _log('close() refused: ${e.message}');
      }
      _log('ready — listening for moduleEvents');
    } catch (e) {
      _log('ERROR $e');
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('wdk_core_flutter — phase 1')),
        body: ListView(padding: const EdgeInsets.all(12), children: [
          if (identity != null) SelectableText('peer key\n$identity', style: const TextStyle(fontFamily: 'monospace')),
          const Divider(),
          for (final l in log) Text(l, style: const TextStyle(fontFamily: 'monospace', fontSize: 12)),
          const Divider(),
          Text('moduleEvents: ${events.length}'),
          for (final e in events) Text('$e', style: const TextStyle(fontFamily: 'monospace', fontSize: 12)),
        ]),
      );
}
