# Estado do projeto

Atualizado em 09/10/2026.

## Marco 1 — concluído neste PC

Cadastro, workspace pessoal OWNER, login, me, logout e dashboard protegido implementados. O responsável confirmou a conferência manual em 09/10/2026: cadastro/acesso, recarregamento mantendo sessão, logout e novo login funcionaram.

A implementação contém sessão opaca com hash SHA256, Argon2id, validação, CSRF/Origin, rate limit, OpenAPI e cliente Dart gerado. O dashboard vazio é intencional.

## Ambiente adotado

- Windows 10 IoT Enterprise LTSC 2021, 21H2/build 19044, sem possibilidade de atualização neste desenvolvimento.
- PostgreSQL 18.6 nativo, sem serviço global, runtime em .tools/postgresql.
- Desenvolvimento em localhost:5432/cofre; testes em cluster separado, localhost:5433/cofre_test.
- API em localhost:3000 e Flutter Web em localhost:8080.
- Docker/Compose retirado das configurações e instruções ativas por decisão do responsável.
- Segundo PC: **adiado**, a retomar após organização no GitHub e nova decisão do responsável. Não bloqueia o encerramento do marco 1 neste PC.

Veja [ADR 0001](adr/0001-desenvolvimento-nativo.md) e [operação Windows](windows-sem-docker.md). Não exclua .tools/postgresql/dev-data: contém o banco persistente local e não é cache descartável.

## Evidências de validação

| Check | Resultado observado |
|---|---|
| pnpm install --frozen-lockfile | Passou |
| Prisma generate e validate | Passaram com Prisma 7.10.0 |
| Migration inicial | Gerada pelo Prisma e aplicada em desenvolvimento e teste |
| Build database/API, lint e typecheck | Passaram |
| Testes API sem banco | 7 passaram, 0 falhas |
| Integração PostgreSQL real | 9 testes reportados (8 cenários e teste pai), 0 falhas, 0 skipped |
| OpenAPI e cliente Dart | contracts:check passou |
| Flutter pub get --enforce-lockfile | Passou |
| Flutter analyze | Sem issues |
| Flutter test | 8 passaram |
| Flutter build web --release | Passou, incluindo correção das fontes |
| Health/readiness | Health 200 sem banco, ready 503 sem banco; ready 200 com PostgreSQL |
| OpenAPI HTTP | /api/v1/openapi.json retornou 200 |
| Conferência manual do responsável | Aprovada em 09/10/2026 |

Integração real cobriu cadastro/login/me/logout, e-mail duplicado concorrente, isolamento entre contas, sessão expirada/revogada, ausência de membership, CSRF/Origin e rate limit. O runner recusa banco fora de localhost:5433/cofre_test, aplica migrations em schema exclusivo e não usa reset/drop/truncate.

Não há suíte automatizada end-to-end em navegador. A conferência manual foi feita pelo responsável; os testes Flutter usam fakes/MockClient. Não foram validados segundo PC, Linux, Docker, produção ou runtime Wasm separado.

## Organização e versionamento

Autorizados pelo responsável em 09/10/2026: iniciar Git local, criar repositório privado na conta louizricard e enviar esta fundação. Preparação local inclui .gitignore, .gitattributes, .editorconfig, guia de contribuição e templates GitHub.

O PRD original foi atualizado para v1.2 e organizado em [docs/prd.md](prd.md). Senhas, dados PostgreSQL, SDKs, builds, uploads e dumps ficam fora do Git. A publicação depende de autenticação válida do GitHub CLI; seu estado remoto deve ser confirmado ao final da operação.

Não há deploy ou publicação do aplicativo. Recursos de upload, processamento, portal cliente, pagamentos e assinatura não foram implementados.

## Próximo trabalho de produto

Marco 2, primeira parte proposta: clientes e projetos reais, com isolamento por workspace. Upload e download privado vêm na segunda parte desse marco, com preparo de armazenamento próprio. Nenhum desses recursos foi iniciado nesta organização.
