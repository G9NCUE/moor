import 'package:flutter/material.dart';
import 'package:path_provider/path_provider.dart';
import 'package:wdk_core_flutter/address_book.dart';
import 'package:wdk_core_flutter/wdk_core_flutter.dart';

const kMnemonic = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
const kMirror = 'a4z9rgfqbqcukuk33gd8z4cwcxijuoxm4eegc6po79rbxsiqpd1o';
// Stands in for the QR scan.
const kAllowPeer = String.fromEnvironment('ALLOW_PEER');
// host:port of phase0/dht-rig.mjs; empty means the public DHT.
const kBootstrap = String.fromEnvironment('BOOTSTRAP');

void main() => runApp(const MaterialApp(home: Home()));

class Home extends StatefulWidget {
  const Home({super.key});
  @override
  State<Home> createState() => _HomeState();
}

class _HomeState extends State<Home> {
  final wdk = WdkCore();
  late final book = AddressBook(wdk);
  final log = <String>[];
  final events = <ModuleEvent>[];
  List<Contact> contacts = [];
  String? identity;

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
          'networks': {'arbitrum': {'blockchain': 'arbitrum'}},
          'modules': {
            'addressBook': {'namespace': 'moor-wallet', 'mirrors': [kMirror], 'storagePath': '$docs/moor-addressbook'},
            'payRequests': kBootstrap.isEmpty
                ? {}
                : {'bootstrap': [{'host': kBootstrap.split(':')[0], 'port': int.parse(kBootstrap.split(':')[1])}]},
          },
        },
      );
      _log('initializeWDK  ${ms()}');

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
