import 'wdk_core_flutter.dart';

class Contact {
  Contact({required this.id, required this.name, this.username});
  final String id;
  final String name;
  final String? username;

  static Contact from(Map m) => Contact(id: m['id'] as String, name: m['name'] as String, username: m['username'] as String?);
}

class Address {
  Address({required this.id, required this.address, required this.type, required this.network});
  final String id;
  final String address;
  final String type;
  final String network;

  static Address from(Map m) =>
      Address(id: m['id'] as String, address: m['address'] as String, type: m['type'] as String, network: m['network'] as String);
}

/// `@tetherto/wdk-p2p-address-book` as a bundled module.
class AddressBook {
  AddressBook(this._wdk);
  final WdkCore _wdk;

  Future<dynamic> _call(String method, [List<dynamic> args = const []]) => _wdk.callModule('addressBook', method, args);

  Stream<void> get updates => _wdk.moduleEvents.where((e) => e.module == 'addressBook' && e.event == 'update').map((_) {});

  Future<bool> get writable async => ((await _call('getInfo')) as Map)['writable'] == true;

  /// Joins the book through the mirrors, or creates it. Mirrors the app's Root.tsx.
  Future<void> enrol(List<String> mirrors) async {
    if (await writable) {
      if (mirrors.isNotEmpty && (await _call('listMirrors') as List).isEmpty) await _call('addMirror', [mirrors]);
      return;
    }
    if (mirrors.isEmpty) return _call('create');
    try {
      await _call('addMirror', [mirrors]);
    } catch (_) {
      await _call('create');
      await _call('addMirror', [mirrors]);
    }
  }

  Future<List<Contact>> listContacts() async => (await _call('listContacts') as List).map((m) => Contact.from(m as Map)).toList();
  Future<List<Address>> listAddresses(String contactId) async =>
      (await _call('listAddresses', [contactId]) as List).map((m) => Address.from(m as Map)).toList();
  Future<Contact> addContact(String name, {String? username}) async =>
      Contact.from(await _call('addContact', [{'name': name, 'username': ?username}]) as Map);
  Future<void> addAddress(String contactId, String address, {String type = 'evm', String network = 'arbitrum'}) =>
      _call('addAddress', [contactId, {'address': address, 'type': type, 'network': network}]);
}
