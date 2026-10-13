import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:cofre_app/data/auth_repository.dart';
import 'package:cofre_app/generated/api.g.dart';

void main() {
  test(
    'cliente gerado codifica busca, cursor, IDs e corpo de projeto',
    () async {
      final requests = <http.Request>[];
      final project = {
        'id': 'project-a',
        'title': 'Vídeo',
        'currency': 'BRL',
        'balanceCents': 12345,
        'includedRevisionRounds': 2,
        'status': 'ACTIVE',
        'createdAt': '2026-10-11T12:00:00Z',
        'updatedAt': '2026-10-11T12:00:00Z',
        'client': {
          'id': 'client-a',
          'name': 'Ana',
          'email': 'ana@example.com',
          'createdAt': '2026-10-11T12:00:00Z',
        },
      };
      final client = MockClient((request) async {
        requests.add(request);
        if (request.url.path.endsWith('/csrf'))
          return http.Response(jsonEncode({'csrfToken': 'token'}), 200);
        if (request.method == 'GET' && request.url.path.endsWith('/projects')) {
          return http.Response(
            jsonEncode({
              'items': [project],
              'nextCursor': 'next',
            }),
            200,
          );
        }
        if (request.url.path.endsWith('/clients'))
          return http.Response(
            jsonEncode({
              'items': [project['client']],
              'nextCursor': null,
            }),
            200,
          );
        return http.Response(
          jsonEncode({
            ...project,
            if (request.url.path.endsWith('/archive')) 'status': 'ARCHIVED',
          }),
          200,
        );
      });
      final repo = HttpAuthRepository(
        client,
        Uri.parse('http://localhost:3000'),
      );
      final page = await repo.projects(
        cursor: 'cursor-a',
        search: 'Vídeo & foto?',
        status: 'ACTIVE',
      );
      expect(page.items.single.balanceCents, 12345);
      expect(page.nextCursor, 'next');
      expect(requests.last.url.queryParameters, {
        'cursor': 'cursor-a',
        'search': 'Vídeo & foto?',
        'status': 'ACTIVE',
      });
      expect(
        (await repo.clients(search: 'ana+studio@example.com'))
            .items
            .single
            .name,
        'Ana',
      );
      expect(
        requests.last.url.queryParameters['search'],
        'ana+studio@example.com',
      );
      await repo.createProject(
        const CreateProjectDto(
          clientId: 'client-a',
          title: 'Vídeo',
          balanceCents: 12345,
          includedRevisionRounds: 2,
        ),
      );
      expect(jsonDecode(requests.last.body)['balanceCents'], 12345);
      expect(requests.last.headers['X-CSRF-Token'], 'token');
      final archived = await repo.archiveProject('project-a');
      expect(archived.status, 'ARCHIVED');
      expect(requests.last.url.path, '/api/v1/projects/project-a/archive');
      expect(jsonDecode(requests.last.body), isEmpty);
      await repo.project('id/with space');
      expect(requests.last.url.toString(), contains('id%2Fwith%20space'));
      client.close();
    },
  );
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
