import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:cofre_app/data/auth_repository.dart';
import 'package:cofre_app/generated/api.g.dart';

void main() {
  test('busca CSRF antes de mutation e encaminha 401', () async {
    final requests = <http.Request>[];
    final client = MockClient((request) async {
      requests.add(request);
      if (request.url.path.endsWith('/csrf')) {
        return http.Response(jsonEncode({'csrfToken': 'csrf-test'}), 200);
      }
      return http.Response(
        jsonEncode({
          'error': {
            'code': 'INVALID_CREDENTIALS',
            'message': 'E-mail ou senha inválidos.',
          },
          'requestId': 'request-test',
        }),
        401,
      );
    });
    final repo = HttpAuthRepository(client, Uri.parse('http://localhost:3000'));
    var unauthorized = false;
    repo.onUnauthorized = () {
      unauthorized = true;
    };
    await expectLater(
      repo.login(
        const LoginDto(email: 'ana@example.com', password: 'senha-segura-123'),
      ),
      throwsA(isA<ApiFailure>()),
    );
    expect(requests.map((r) => r.url.path), [
      '/api/v1/auth/csrf',
      '/api/v1/auth/login',
    ]);
    expect(requests.last.headers['X-CSRF-Token'], 'csrf-test');
    expect(requests.last.headers['Content-Type'], contains('application/json'));
    expect(unauthorized, isTrue);
    client.close();
  });
}
