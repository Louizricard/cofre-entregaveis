# Estado do projeto

Atualizado em 09/10/2026.

## Marco 1 — concluído neste PC

Cadastro, workspace pessoal OWNER, login, me, logout e dashboard protegido implementados. O responsável confirmou a conferência manual em 09/10/2026: cadastro/acesso, recarregamento mantendo sessão, logout e novo login funcionaram.

A implementação contém sessão opaca com hash SHA256, Argon2id, validação, CSRF/Origin, rate limit, OpenAPI e cliente Dart gerado. O dashboard vazio fazia parte do marco 1; o marco 2A acrescenta dados reais de clientes e projetos.

## Ambiente adotado

- Windows 10 IoT Enterprise LTSC 2021, 21H2/build 19044, sem possibilidade de atualização neste desenvolvimento.
- PostgreSQL 18.6 nativo, sem serviço global, runtime em .tools/postgresql.
- Desenvolvimento em localhost:5432/cofre; testes em cluster separado, localhost:5433/cofre_test.
- API em localhost:3000 e Flutter Web em localhost:8080.
- Docker/Compose retirado das configurações e instruções ativas por decisão do responsável.
- Segundo PC: **adiado**, a retomar após organização no GitHub e nova decisão do responsável. Não bloqueia o encerramento do marco 1 neste PC.

Veja [ADR 0001](adr/0001-desenvolvimento-nativo.md) e [operação Windows](windows-sem-docker.md). Não exclua .tools/postgresql/dev-data: contém o banco persistente local e não é cache descartável.

## Evidências do marco 1

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

O PRD original foi atualizado para v1.2 e organizado em [docs/prd.md](prd.md). Senhas, dados PostgreSQL, SDKs, builds, uploads e dumps ficam fora do Git. Repositório criado como privado: [Louizricard/cofre-entregaveis](https://github.com/Louizricard/cofre-entregaveis), branch principal main. Primeiro commit local: 13cd87d. A publicação do código usa o remoto origin com autenticação GitHub CLI da conta confirmada.

Não há deploy ou publicação do aplicativo. Recursos de upload, processamento, portal cliente, pagamentos e assinatura não foram implementados.


## Marco 2A — implementação local em 09/10/2026

Clientes: cadastro, edição, e-mail único por workspace, busca e paginação. Projetos: cadastro, edição, saldo BRL em centavos, revisões incluídas, busca, paginação e arquivamento com consulta separada. Formulários em pt-BR com estados de espera, erro e confirmação, seleção paginada de clientes e layout verificado nos testes em 360/768/1440 px.

API e banco reforçam isolamento por workspace, FK composta cliente/projeto, validação de dados, CSRF/Origin e revisão otimista para edições concorrentes. OpenAPI e gerador Dart foram ampliados sem novas dependências; lockfiles preservados. Ver [decisões e uso](marco-2a.md).

### Resultados executados nesta entrega

- Prisma generate/validate: passaram.
- Lint, typecheck e build de database/API: passaram.
- API unitária: 7 testes passaram.
- Integração PostgreSQL nativo: 15 testes reportados (13 cenários e 2 pais), 0 falhas, 0 skipped. Schema isolado cofre_test_449e6cd55881412e9cb1367e4ef01a71, sem destruir dados de desenvolvimento.
- Flutter analyze: sem issues.
- Flutter test: 14 testes passaram, incluindo fluxo criar/editar/arquivar nos três tamanhos de tela, validação de valores e conflito.
- OpenAPI/Dart: contracts:check passou.
- Migration incremental aplicada no banco local: hash dos dados de User, Workspace e WorkspaceMember idêntico antes/depois; uma conta, um workspace e um vínculo preservados. Nenhum cliente/projeto fictício inserido no banco local.
- API local na porta 3001: health/ready 200 e OpenAPI versão 1.1.0. Porta 3000 ocupada por outro programa, preservado. Flutter servido em localhost:8080 com HTTP 200 e bootstrap presente, conectado à API 3001.
- Flutter build web --release: passou; Wasm dry run também passou. O runtime Wasm separado não foi testado.
- git diff --check: passou.

A primeira tentativa de integração encontrou um erro de tipagem no teste de paginação; corrigido, a suíte completa passou. A análise Flutter inicialmente foi iniciada na raiz por engano, interrompida e refeita corretamente em apps/flutter_app. O controle automatizado de navegador ficou indisponível por falha de inicialização do sandbox; não houve conferência visual/e2e em navegador nesta entrega. A aprovação manual anterior se refere somente ao marco 1. A nova interface aguarda conferência manual do responsável.

Trabalho na branch codex/clientes-projetos. Commit e push desta entrega autorizados pelo responsável em 09/10/2026; sem deploy. PRD atualizado para v1.3. A branch main mantém o marco 1 até revisão e merge desta mudança.

## Próximo trabalho de produto

Conferir manualmente o marco 2A e revisar/versionar esta mudança quando autorizado. Depois, planejar o marco 2B: armazenamento e entrega privada de arquivos. Upload, download, processamento, portal, pagamentos e assinatura ainda não foram implementados. O teste no segundo PC segue adiado.
