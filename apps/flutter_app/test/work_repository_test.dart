import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:cofre_app/data/auth_repository.dart';
import 'package:cofre_app/data/work_repository.dart';
import 'package:cofre_app/generated/api.g.dart';

void main() {
  test(
    'contrato gera query, PATCH com revisão e CSRF, e encaminha 401',
    () async {
      final requests = <http.Request>[];
      final client = MockClient((r) async {
        requests.add(r);
        if (r.url.path.endsWith('/csrf'))
          return http.Response(jsonEncode({'csrfToken': 'protection'}), 200);
        if (r.method == 'GET')
          return http.Response(
            jsonEncode({'items': [], 'nextCursor': null}),
            200,
          );
        return http.Response(
          jsonEncode({
            'error': {'code': 'UNAUTHORIZED', 'message': 'Sessão expirada.'},
            'requestId': 'test',
          }),
          401,
        );
      });
      final auth = HttpAuthRepository(
        client,
        Uri.parse('http://localhost:3000'),
      );
      final repo = HttpWorkRepository(auth.api);
      var unauthorized = false;
      auth.onUnauthorized = () => unauthorized = true;
      await repo.projects(
        search: 'Ana & José',
        cursor: 'cursor-id',
        status: 'ARCHIVED',
      );
      expect(requests.single.url.queryParameters, {
        'search': 'Ana & José',
        'cursor': 'cursor-id',
        'status': 'ARCHIVED',
      });
      await expectLater(
        repo.saveClient(
          const ClientDto(name: 'Ana', email: 'ana@example.com'),
          existing: const ClientView(
            id: 'client-a',
            name: 'Antigo',
            email: 'old@example.com',
            revision: 4,
          ),
        ),
        throwsA(isA<ApiFailure>()),
      );
      expect(requests.last.method, 'PATCH');
      expect(requests.last.url.path, '/api/v1/clients/client-a');
      expect(requests.last.headers['X-CSRF-Token'], 'protection');
      expect(jsonDecode(requests.last.body)['revision'], 4);
      expect(unauthorized, isTrue);
      client.close();
    },
  );
}
