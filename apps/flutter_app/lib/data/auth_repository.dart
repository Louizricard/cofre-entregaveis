import 'dart:convert';

import 'package:http/http.dart' as http;

import '../generated/api.g.dart';

class ApiFailure implements Exception {
  final int status;
  final String message;
  const ApiFailure(this.status, this.message);
}

abstract interface class AuthRepository {
  Future<IdentityView> me();
  Future<IdentityView> login(LoginDto input);
  Future<IdentityView> register(RegisterDto input);
  Future<void> logout();
  Future<ProjectsView> projects();
}

class HttpAuthRepository implements AuthRepository {
  final http.Client httpClient;
  final Uri base;
  String? _csrf;
  void Function()? onUnauthorized;
  late final CofreClient api = CofreClient(_request);
  HttpAuthRepository(this.httpClient, this.base);

  Future<dynamic> _request(
    String method,
    String path,
    Map<String, dynamic>? body,
  ) async {
    try {
      if (method != 'GET' && _csrf == null) {
        _csrf = (await api.authcsrf()).csrfToken;
      }
      final request = http.Request(method, base.resolve(path));
      request.headers['Accept'] = 'application/json';
      if (method != 'GET') {
        request.headers['Content-Type'] = 'application/json';
        request.headers['X-CSRF-Token'] = _csrf!;
        request.body = jsonEncode(body ?? <String, dynamic>{});
      }
      final response = await http.Response.fromStream(
        await httpClient.send(request).timeout(const Duration(seconds: 15)),
      );
      final dynamic json = response.body.isEmpty
          ? null
          : jsonDecode(response.body);
      if (response.statusCode >= 400) {
        if (response.statusCode == 401) onUnauthorized?.call();
        if (response.statusCode == 403) _csrf = null;
        throw ApiFailure(
          response.statusCode,
          ErrorView.fromJson(json as Map<String, dynamic>).error.message,
        );
      }
      return json;
    } on ApiFailure {
      rethrow;
    } catch (_) {
      throw const ApiFailure(
        0,
        'Não foi possível conectar. Confira sua conexão e tente novamente.',
      );
    }
  }

  @override
  Future<IdentityView> me() => api.authme();
  @override
  Future<IdentityView> login(LoginDto input) => api.authlogin(input);
  @override
  Future<IdentityView> register(RegisterDto input) => api.authregister(input);
  @override
  Future<ProjectsView> projects() => api.projectslist();
  @override
  Future<void> logout() async {
    await api.authlogout();
    _csrf = null;
  }
}
