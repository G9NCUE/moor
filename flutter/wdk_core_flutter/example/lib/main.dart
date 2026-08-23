import 'package:flutter/material.dart';
import 'package:path_provider/path_provider.dart';
import 'package:wdk_core_flutter/address_book.dart';
import 'package:wdk_core_flutter/seed_store.dart';
import 'package:wdk_core_flutter/wallet.dart';
import 'package:wdk_core_flutter/wdk_core_flutter.dart';

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

final wdk = WdkCore();

void main() => runApp(const MaterialApp(home: Root()));

/// Keystore decides: a stored seed opens the wallet, none opens onboarding.
class Root extends StatefulWidget {
  const Root({super.key});
  @override
  State<Root> createState() => _RootState();
}

class _RootState extends State<Root> {
  EncryptedSeed? seed;
  bool checked = false;

  @override
  void initState() {
    super.initState();
    wdk.start().then((_) => wdk.workletStart()).then((_) => SeedStore.read()).then((s) => setState(() {
          seed = s;
          checked = true;
        }));
  }

  @override
  Widget build(BuildContext context) => !checked
      ? const Scaffold(body: Center(child: CircularProgressIndicator()))
      : seed == null
          ? Onboarding(onDone: (s) => setState(() => seed = s))
          : Home(seed: seed!, onReset: () => setState(() => seed = null));
}

class Onboarding extends StatefulWidget {
  const Onboarding({super.key, required this.onDone});
  final void Function(EncryptedSeed) onDone;
  @override
  State<Onboarding> createState() => _OnboardingState();
}

class _OnboardingState extends State<Onboarding> {
  final input = TextEditingController();
  EncryptedSeed? pending;
  String? phrase;
  String? error;

  Future<void> _create() async {
    final s = await wdk.generate();
    final m = await wdk.mnemonic(s);
    setState(() { pending = s; phrase = m; });
  }

  Future<void> _commit(EncryptedSeed s) async {
    await SeedStore.write(s);
    widget.onDone(s);
  }

  Future<void> _import() async {
    try {
      await _commit(await wdk.seedFromMnemonic(input.text.trim().toLowerCase().replaceAll(RegExp(r'\s+'), ' ')));
    } on WdkRpcException catch (e) {
      setState(() => error = e.message);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('wdk_core_flutter')),
        body: Padding(
          padding: const EdgeInsets.all(16),
          child: phrase != null
              ? Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  const Text('Write these down. They are the wallet.'),
                  const SizedBox(height: 12),
                  SelectableText(phrase!, style: const TextStyle(fontFamily: 'monospace', fontSize: 16)),
                  const SizedBox(height: 24),
                  FilledButton(onPressed: () => _commit(pending!), child: const Text('I have written them down')),
                ])
              : Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                  FilledButton(onPressed: _create, child: const Text('Create a wallet')),
                  const SizedBox(height: 32),
                  TextField(controller: input, maxLines: 3, decoration: const InputDecoration(labelText: 'Recovery phrase', errorText: null)),
                  if (error != null) Text(error!, style: const TextStyle(color: Colors.red)),
                  const SizedBox(height: 8),
                  OutlinedButton(onPressed: _import, child: const Text('Import')),
                ]),
        ),
      );
}

class Home extends StatefulWidget {
  const Home({super.key, required this.seed, required this.onReset});
  final EncryptedSeed seed;
  final VoidCallback onReset;
  @override
  State<Home> createState() => _HomeState();
}

class _HomeState extends State<Home> {
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
      final docs = (await getApplicationDocumentsDirectory()).path;
      await wdk.initializeWdk(widget.seed, {
        'networks': {'arbitrum': {'blockchain': 'arbitrum', 'config': kArbitrum}},
        'modules': {
          'addressBook': {'namespace': 'moor-wallet', 'mirrors': [kMirror], 'storagePath': '$docs/moor-addressbook'},
          'payRequests': kBootstrap.isEmpty
              ? {}
              : {'bootstrap': [{'host': kBootstrap.split(':')[0], 'port': int.parse(kBootstrap.split(':')[1])}]},
        },
      });
      _log('initializeWDK  ${ms()}');

      final a = await wallet.address;
      setState(() => address = a);
      final b = await wallet.tokenBalance(usdt0Arbitrum);
      setState(() => balance = b);
      _log('balance  ${ms()}');

      await book.enrol([kMirror]);
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
        appBar: AppBar(title: const Text('wdk_core_flutter'), actions: [
          IconButton(icon: const Icon(Icons.logout), onPressed: () async { await SeedStore.clear(); widget.onReset(); }),
        ]),
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
