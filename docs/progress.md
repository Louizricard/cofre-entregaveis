# Estado do projeto

Atualizado em 13/10/2026.

## Marco 1 — concluído neste PC

Cadastro, workspace pessoal OWNER, login, me, logout e dashboard protegido implementados. O responsável confirmou a conferência manual em 09/10/2026: cadastro/acesso, recarregamento mantendo sessão, logout e novo login funcionaram.

A implementação contém sessão opaca com hash SHA256, Argon2id, validação, CSRF/Origin, rate limit, OpenAPI e cliente Dart gerado. O dashboard vazio fazia parte do recorte original; agora oferece clientes e projetos.

## Ambiente adotado

- Windows 10 IoT Enterprise LTSC 2021, 21H2/build 19044, sem possibilidade de atualização neste desenvolvimento.
- PostgreSQL 18.6 nativo, sem serviço global, runtime em .tools/postgresql.
- Desenvolvimento em localhost:5432/cofre; testes em cluster separado, localhost:5433/cofre_test.
- API em localhost:3000 e Flutter Web em localhost:8080.
- Docker/Compose retirado das configurações e instruções ativas por decisão do responsável.
- Segundo PC Windows preparado em 11/10/2026: Node 24.21.0, pnpm 11.25.0, Flutter 3.47.6/Dart 3.13.5, PostgreSQL 18.6; banco próprio e SDKs portáteis ignorados pelo Git.

Veja [ADR 0001](adr/0001-desenvolvimento-nativo.md) e [operação Windows](windows-sem-docker.md). Não exclua .tools/postgresql/dev-data: contém o banco persistente local e não é cache descartável.

## Evidências da fundação (09/10/2026)

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

Não há suíte automatizada end-to-end em navegador. A conferência manual foi feita pelo responsável; os testes Flutter usam fakes/MockClient. A fundação foi revalidada no segundo PC em 11/10/2026. Linux, produção e runtime Wasm separado não foram validados.

## Organização e versionamento

Autorizados pelo responsável em 09/10/2026: iniciar Git local, criar repositório privado na conta louizricard e enviar esta fundação. Preparação local inclui .gitignore, .gitattributes, .editorconfig, guia de contribuição e templates GitHub.

O PRD original foi atualizado para v1.2 e organizado em [docs/prd.md](prd.md). Senhas, dados PostgreSQL, SDKs, builds, uploads e dumps ficam fora do Git. Repositório criado como privado: [Louizricard/cofre-entregaveis](https://github.com/Louizricard/cofre-entregaveis), branch principal main. Primeiro commit local: 13cd87d. A publicação do código usa o remoto origin com autenticação GitHub CLI da conta confirmada.

Não há deploy ou publicação do aplicativo. Recursos de upload, processamento, portal cliente, pagamentos e assinatura não foram implementados.

## Marco 2, parte 1 — clientes e projetos (11/10/2026)

Implementado localmente na branch `feat/clientes-projetos`, ainda sem commit/push:

- Cliente com nome e e-mail normalizado, único por workspace; duplicidade concorrente retorna 409.
- Projeto vinculado a cliente do mesmo workspace, título, moeda fixa BRL, saldo em centavos e revisões incluídas.
- Listas paginadas com busca; projetos ativos/arquivados, detalhes e arquivamento idempotente com confirmação na interface.
- Todas as consultas usam o workspace da sessão. IDs externos retornam 404 e FK composta impede vínculo entre workspaces no banco.
- Nova migration incremental; checks de saldo não negativo, BRL e revisões de 0 a 1000. Limite do saldo: 2147483647 centavos.
- OpenAPI e Dart gerados juntos, incluindo parâmetros de rota/query. Campos extras, sessão inválida e mutations sem CSRF/Origin são recusados.
- Flutter com estados de carregamento, vazio, erro/retry e sucesso. Formulários preservam os campos em erros e formatam valores em reais.

Validação desta parte no segundo PC:

| Check | Resultado |
|---|---|
| Prisma generate/validate | Passou |
| Migração incremental | Aplicada em schema de teste e banco de desenvolvimento |
| ESLint, typecheck e build API | Passaram |
| Testes API sem banco | 7 passaram |
| Integração PostgreSQL | 15 reportados: 13 cenários e 2 testes pais, todos passaram |
| contracts:check | Passou |
| Flutter analyze | Sem problemas |
| Flutter test | 14 passaram, incluindo fluxo cliente/projeto/arquivamento em 360/768/1440 px |
| Flutter build web --release | Passou |

Os testes de integração cobrem paginação, busca, validação, concorrência de e-mail, CSRF, acesso por outra conta, FK composta e arquivamento repetido. Os testes Flutter usam fakes/MockClient; não constituem uma suíte end-to-end em navegador. Conferência do agente no navegador em 11–12/10/2026: cadastro de conta em workspace fictício separado, cadastro de cliente, criação de projeto com R$ 1.500,50/2 revisões, restauração da sessão e dos dados após reinício, consulta de detalhes e arquivamento com confirmação e filtro de arquivados passaram. Evidência local ignorada pelo Git: .local/clientes-projetos.png. A conferência manual do responsável desta parte ainda está pendente.

## Marco 2, parte 2 — arquivos privados (12/10/2026)

Implementação local e integração R2 validadas em 13/10/2026: teste direto automatizado e conferência manual pelo responsável de upload, download e cancelamento:

- Versões DRAFT numeradas em transação; relações compostas por workspace.
- Asset representa arquivo e sessão multipart. Chaves geradas pelo servidor; credenciais e IDs internos do R2 não são expostos.
- Reserva/uso de cota em PostgreSQL Serializable com retry, limites de 2 GiB/arquivo, 10 GiB/workspace e 5 uploads ativos. Checks adicionais no banco.
- Partes de 8 MiB, URLs de 5 minutos com Content-Length assinado, conclusão por partes reais/ETags, HEAD e assinatura inicial do formato. Original só fica READY após validação.
- Perda da resposta de conclusão recuperável por HEAD; repetição não duplica cota. Não trata ETag como hash criptográfico do arquivo.
- Cancelamento/expiração e limpeza durável em estado ABORTING, leases, backoff e reprocessamento a cada minuto. Reserva só é liberada após abort/delete confirmados.
- Download manual do criador por URL attachment de 60 segundos. Projeto arquivado bloqueia novas versões, upload e download; arquivamento recusa uploads pendentes.
- Flutter: versões, seletor de arquivo Web, progresso por partes, retry em memória, cancelamento e download. R2 sem configuração mantém envio desabilitado com mensagem explícita.
- Guia de bucket/CORS/lifecycle, variáveis de exemplo e `pnpm storage:check` para teste real descartável.

Checks executados nesta parte:

| Check | Resultado |
|---|---|
| Prisma generate/validate | Passaram |
| Nova migration | Aplicada no banco isolado de testes e no banco local de desenvolvimento |
| Build API, lint e contratos | Passaram |
| Testes unitários API | 9 passaram, incluindo assinatura de URLs sem acesso externo |
| Integração PostgreSQL | 24 testes reportados: 21 cenários e 3 testes pais, todos passaram; adapter R2 simulado |
| Flutter analyze | Sem problemas |
| Flutter test | 19 passaram; upload/retry/cancelamento em fakes e layouts 360/768/1440 |
| Flutter build web --release | Passou |
| UI no navegador | Seção de versões/arquivos, cota e aviso de configuração pendente conferidos |
| R2 real (storage:check) | Passou em 13/10/2026: multipart, tamanho assinado, ETags/CORS HTTP, HEAD, Range, attachment, acesso público negado e limpeza do objeto temporário |
| Upload e download pela interface | Confirmados pelo responsável em 13/10/2026: PDF de 30,6 KiB ficou Original disponível, reserva zerou e o download abriu corretamente; comparação visual, sem comparação criptográfica |
| Cancelamento real pela interface | Confirmado por captura do responsável em 13/10/2026: ZIP de 2,6 MiB com Envio cancelado, reserva 0 B e PDF anterior preservado |

Em 12/10/2026, o responsável ativou o R2. O agente criou o bucket Standard privado cofre-entregaveis-dev (jurisdição padrão), manteve domínio público/r2.dev desativados, aplicou infra/r2-cors.json e ajustou o abort de multipart incompleto para 1 dia. Em 13/10/2026, o responsável salvou as credenciais S3 no .env local. Os quatro campos foram conferidos somente por presença; nenhum segredo foi registrado. storage:check passou no bucket real e removeu seu objeto temporário. A API foi iniciada com a configuração R2. O gate desta parte passou: storage:check real e fluxo manual pela interface de upload, validação, download e cancelamento com liberação da reserva. Antivírus e portal convidado continuam pendentes; as prévias de imagem/PDF para criador foram acrescentadas na parte seguinte. Assinatura inicial do formato não comprova que o arquivo é seguro. Versões desta parte são rascunhos, sem publicação.

## Próximo trabalho de produto

Completar vídeo/áudio e prévias manuais, isolamento de identidade/filesystem/rede e verificação de malware antes de abrir o portal de revisão/aprovação. Pagamentos continuam em marco posterior.

## Marco de prévias, parte 1 — imagens e PDF (13/10/2026)

- Fila/outbox MediaJob no PostgreSQL, criada na mesma transação de validação do upload; backfill de assets READY anteriores à migration. MediaRun conserva manifesto e reserva de cada tentativa; unicidade e fencing impedem dupla publicação/cota.
- Worker Node separado, parser Python sem credenciais de banco/R2 no ambiente, limites Windows Job Objects/Linux rlimits (768 MiB, 90 s CPU), timeout de 180 s para parser e deadline de 5 min para ciclo. Não é sandbox completa de filesystem/rede; malware ainda não é verificado.
- PNG/JPEG/WebP estáticos e PDF de até 100 páginas produzem JPEG de até 1600 × 1600, com marca d’água gravada e sem EXIF original. Reserva de 32 MiB por tentativa, substituída pelo tamanho real na conclusão; derivados entram na cota de 10 GiB.
- Chaves de derivados separadas e privadas, manifesto persistido antes das gravações, limpeza recuperável após lease de 10 min e retries de processamento limitados a 3. Falha definitiva pode ser reprocessada pelo criador após limpeza.
- Endpoints autenticados de estado, retry e URL de página, isolados por workspace; URLs duram 60 s e não retornam original. Projeto arquivado bloqueia emissão de novas URLs.
- Flutter: botão Ver prévia, estado de fila/falha, páginas, renovação de URL e reprocessamento. Sem suporte automático para ZIP, áudio/vídeo ou animações nesta parte. Nenhum endpoint convidado foi aberto.

Validação: lint, Prisma validate, build/typecheck e contratos passaram; 9 unitários API; 32 testes reportados de integração PostgreSQL (28 cenários + 4 pais, adapters de mídia simulados); 5 testes Python com parsers e limite de memória reais; 22 testes Flutter, analyze e build Web release passaram. Testes isolam um schema por suíte porque o worker consome toda a fila.

Teste real em workspace sintético separado: upload de PNG/PDF → processamento Python → derivado JPEG privado no R2 com CORS → original preservado por SHA-256, reserva zerada, projeto sintético arquivado e sessão encerrada. Marca d’água do JPEG sintético foi inspecionada visualmente. O responsável confirmou o visualizador no navegador em 13/10/2026, com captura mostrando PDF de uma página renderizado com marca d’água. Guia: docs/previas-desenvolvimento.md. F04 completo e acesso de convidados continuam pendentes.
