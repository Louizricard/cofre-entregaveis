import { ArgumentsHost, Catch, type ExceptionFilter, HttpException } from '@nestjs/common';
import type { Response } from 'express';
import type { AuthRequest } from './security.js';
@Catch()
export class ErrorFilter implements ExceptionFilter {
 catch(exception: unknown, host: ArgumentsHost) {
  const res = host.switchToHttp().getResponse<Response>();
  const req = host.switchToHttp().getRequest<AuthRequest>();
  const status = exception instanceof HttpException ? exception.getStatus() : 500;
  const response = exception instanceof HttpException ? exception.getResponse() : null;
  const body = typeof response === 'object' && response !== null ? response as Record<string, unknown> : {};
  const messages: Record<number, string> = { 400: 'Dados inválidos.', 401: 'Sessão inválida ou expirada.', 403: 'Acesso não permitido.', 404: 'Recurso não encontrado.', 409: 'Conflito.', 413: 'Requisição muito grande.', 429: 'Muitas tentativas. Tente novamente em um minuto.', 500: 'Erro interno.', 503: 'Serviço indisponível.' };
  const codes: Record<number, string> = { 400: 'VALIDATION_ERROR', 401: 'UNAUTHORIZED', 403: 'FORBIDDEN', 404: 'NOT_FOUND', 409: 'CONFLICT', 413: 'PAYLOAD_TOO_LARGE', 429: 'RATE_LIMITED', 500: 'INTERNAL_ERROR', 503: 'UNAVAILABLE' };
  res.status(status).json({ error: { code: body.code ?? codes[status] ?? 'REQUEST_FAILED', message: body.code ? body.message : messages[status] ?? 'Falha na requisição.', ...(body.details ? { details: body.details } : {}) }, requestId: req.requestId });
 }
}
