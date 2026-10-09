import 'package:http/http.dart';

import 'client_stub.dart'
    if (dart.library.js_interop) 'client_web.dart'
    as platform;

Client createHttpClient() => platform.createHttpClient();
