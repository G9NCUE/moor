import 'package:flutter/material.dart';
import 'package:path_provider/path_provider.dart';
import 'package:wdk_core_flutter/address_book.dart';
import 'package:wdk_core_flutter/wallet.dart';
import 'package:wdk_core_flutter/wdk_core_flutter.dart';

const kMnemonic = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
const kMirror = 'a4z9rgfqbqcukuk33gd8z4cwcxijuoxm4eegc6po79rbxsiqpd1o';
// Stands in for the QR scan.
const kAllowPeer = String.fromEnvironment('ALLOW_PEER');
// host:port of phase0/dht-rig.mjs; empty means the public DHT.
const kBootstrap = String.fromEnvironment('BOOTSTRAP');

// Same values as app/src/wdk/config.ts.
const kArbitrum = {
  'provider': ['https://arb1.arbitrum.io/rpc', 'https://arbitrum-one-rpc.publicnode.com', 'https://arbitrum.drpc.org'],
  'delegationAddress': '0xe6Cae83BdE06E4c305530e199D7217f42808555B',
  'bundlerUrl': 'https://public.pimlico.io/v2/42161/rpc',
  'paymasterUrl': 'https://api.candide.dev/public/v3/42161',
  'paymasterToken': {'address': usdt0Arbitrum},
};

void main() => runApp(const MaterialApp(home: Home()));

class Home extends StatefulWidget {
  const Home({super.key});
  @override
  State<Home> createState() => _HomeState();
}

class _HomeState extends State<Home> {
  final wdk = WdkCore();
  late final book = AddressBook(wdk);
  late final wallet = Wallet(wdk, network: 'arbitrum');
  final log = <String>[];
  final events = <ModuleEvent>[];
  List<Contact> contacts = [];
  String? identity;
  String? address;
  BigInt? balance;

  void _log(String s) => setState(() => log.add(s));

  @override
  void initState() {
    super.initState();
    wdk.moduleEvents.where((e) => e.module == 'payRequests').listen((e) => setState(() => events.add(e)));
    book.updates.listen((_) => _refresh());
    _boot();
  }

  Future<void> _refresh() async {
    final list = await book.listContacts();
    setState(() => contacts = list);
  }

  Future<void> _boot() async {
    final t0 = DateTime.now();
    String ms() => '${DateTime.now().difference(t0).inMilliseconds}ms';
    try {
      await wdk.start();
      await wdk.workletStart();
      final seed = await wdk.seedFromMnemonic(kMnemonic);
      final docs = (await getApplicationDocumentsDirectory()).path;
      await wdk.initializeWdk(
        encryptionKey: seed.encryptionKey,
        encryptedSeed: seed.encryptedSeed,
        config: {
          'networks': {'arbitrum': {'blockchain': 'arbitrum', 'config': kArbitrum}},
          'modules': {
            'addressBook': {'namespace': 'moor-wallet', 'mirrors': [kMirror], 'storagePath': '$docs/moor-addressbook'},
            'payRequests': kBootstrap.isEmpty
                ? {}
                : {'bootstrap': [{'host': kBootstrap.split(':')[0], 'port': int.parse(kBootstrap.split(':')[1])}]},
          },
        },
      );
      _log('initializeWDK  ${ms()}');

      final a = await wallet.address;
      setState(() => address = a);
      _log('address  ${ms()}');
      final b = await wallet.tokenBalance(usdt0Arbitrum);
      setState(() => balance = b);
      _log('balance  ${ms()}');

      await book.enrol([kMirror]);
      _log('address book enrolled, writable=${await book.writable}  ${ms()}');
      await _refresh();
      _log('${contacts.length} contacts  ${ms()}');

      final id = await wdk.callModule('payRequests', 'getIdentity');
      setState(() => identity = (id as Map)['publicKey'] as String);
      _log('announced  ${ms()}');
      if (kAllowPeer.isNotEmpty) await wdk.callModule('payRequests', 'setPeers', [[kAllowPeer]]);
    } catch (e) {
      _log('ERROR $e');
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('wdk_core_flutter')),
        body: ListView(padding: const EdgeInsets.all(12), children: [
          if (balance != null) Text('${formatUsdt(balance!)} USD₮', style: Theme.of(context).textTheme.headlineMedium),
          if (address != null) SelectableText(address!, style: const TextStyle(fontFamily: 'monospace', fontSize: 12)),
          if (identity != null) SelectableText('peer key\n$identity', style: const TextStyle(fontFamily: 'monospace', fontSize: 12)),
          const Divider(),
          Text('contacts: ${contacts.length}', style: Theme.of(context).textTheme.titleMedium),
          for (final c in contacts) Text('${c.name}  ${c.username ?? ''}', style: const TextStyle(fontFamily: 'monospace', fontSize: 12)),
          const Divider(),
          Text('requests: ${events.length}', style: Theme.of(context).textTheme.titleMedium),
          for (final e in events) Text('$e', style: const TextStyle(fontFamily: 'monospace', fontSize: 12)),
          const Divider(),
          for (final l in log) Text(l, style: const TextStyle(fontFamily: 'monospace', fontSize: 11)),
        ]),
      );
}
