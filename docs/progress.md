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

Conferir manualmente a prévia de ZIP e os estados da análise de segurança no aplicativo. Depois, implementar o portal de revisão/aprovação com autorização própria e publicação de versões. Pagamentos continuam em marco posterior.

## Marco de prévias, parte 1 — imagens e PDF (13/10/2026)

- Fila/outbox MediaJob no PostgreSQL, criada na mesma transação de validação do upload; backfill de assets READY anteriores à migration. MediaRun conserva manifesto e reserva de cada tentativa; unicidade e fencing impedem dupla publicação/cota.
- Worker Node separado, parser Python sem credenciais de banco/R2 no ambiente, limites Windows Job Objects/Linux rlimits (768 MiB, 90 s CPU), timeout de 180 s para parser e deadline de 5 min para ciclo. Não é sandbox completa de filesystem/rede; malware ainda não é verificado.
- PNG/JPEG/WebP estáticos e PDF de até 100 páginas produzem JPEG de até 1600 × 1600, com marca d’água gravada e sem EXIF original. Reserva de 32 MiB por tentativa, substituída pelo tamanho real na conclusão; derivados entram na cota de 10 GiB.
- Chaves de derivados separadas e privadas, manifesto persistido antes das gravações, limpeza recuperável após lease de 10 min e retries de processamento limitados a 3. Falha definitiva pode ser reprocessada pelo criador após limpeza.
- Endpoints autenticados de estado, retry e URL de página, isolados por workspace; URLs duram 60 s e não retornam original. Projeto arquivado bloqueia emissão de novas URLs.
- Flutter: botão Ver prévia, estado de fila/falha, páginas, renovação de URL e reprocessamento. Sem suporte automático para ZIP, áudio/vídeo ou animações nesta parte. Nenhum endpoint convidado foi aberto.

Validação: lint, Prisma validate, build/typecheck e contratos passaram; 9 unitários API; 32 testes reportados de integração PostgreSQL (28 cenários + 4 pais, adapters de mídia simulados); 5 testes Python com parsers e limite de memória reais; 22 testes Flutter, analyze e build Web release passaram. Testes isolam um schema por suíte porque o worker consome toda a fila.

Teste real em workspace sintético separado: upload de PNG/PDF → processamento Python → derivado JPEG privado no R2 com CORS → original preservado por SHA-256, reserva zerada, projeto sintético arquivado e sessão encerrada. Marca d’água do JPEG sintético foi inspecionada visualmente. O responsável confirmou o visualizador no navegador em 13/10/2026, com captura mostrando PDF de uma página renderizado com marca d’água. Guia: docs/previas-desenvolvimento.md. F04 completo e acesso de convidados continuam pendentes.

## Marco de prévias, parte 2 — vídeo e áudio (13/10/2026)

- MP4, MP3 e WAV entram na mesma fila PostgreSQL. Jobs temporais usam perfil temporal-v1; registros anteriormente UNSUPPORTED desses formatos são reencaminhados em projetos ativos. JPEG/PDF existentes são preservados.
- FFprobe verifica duração/streams e FFmpeg gera derivado separado: MP4 H.264/AAC 1280 × 720 com marca nos pixels, ou M4A AAC estéreo 96 kbps. Fonte até 30 minutos; trecho inicial de até 60 segundos (alvo 59,9 s para acomodar arredondamento de codec). Vídeo sem faixa de áudio também funciona.
- Demuxers fixos por MIME, somente protocolo file e referências externas mov desativadas; nenhum shell construído com entrada do cliente. Windows Job Object abrange Python e um subprocesso, com 768 MiB agregados e 90 s de CPU no job. Timeout do parser e deadline/lease da fila permanecem. Isso não substitui sandbox de identidade/filesystem/rede ou antivírus.
- Migration incremental acrescenta tipo, MIME e duração aos derivados, com checks no banco. Cota, reserva, limpeza e retry seguem a primeira parte; cada conjunto continua limitado a 32 MiB.
- API emite URL privada curta com MIME do derivado, nunca do original. Flutter Web usa controles nativos de vídeo/áudio, sem autoplay; fechar/atualizar interrompe o player anterior. URL expirada pode ser renovada em Atualizar.
- FFmpeg 9.0.2 Essentials foi preparado em .tools (ignorado), com SHA-256 conferido no fornecedor indicado pelo site oficial. Caminhos locais MEDIA_FFMPEG/MEDIA_FFPROBE ficam somente no .env; o código não incorpora binários.

Validação: Prisma generate/validate, lint, build/typecheck e contratos passaram; 9 unitários API; 33 testes de integração reportados (29 cenários + 4 pais, PostgreSQL isolado por suíte); 10 testes Python reais, sem skips; 24 testes Flutter, analyze e build Web release passaram. Casos novos cobrem MP4 sem áudio, áudio longo limitado, MP3, fonte acima de 30 min, playlist disfarçada, tipos de derivados e isolamento A/B.

Teste real em workspace sintético separado: MP4 com áudio, MP3 e WAV → worker/FFmpeg → derivados privados no R2. Conferidos MIME/duração/CORS, Range 206, acesso sem assinatura negado e originais idênticos por SHA-256. Reserva zerada; projeto sintético arquivado e sessão encerrada. Um quadro baixado do vídeo foi inspecionado e confirmou a marca; FFprobe confirmou H.264/AAC 1280 × 720. O responsável confirmou a reprodução no navegador em 13/10/2026. Branch desta parte: codex/previas-video-audio, baseada em feat/clientes-projetos. O PR #2 anterior continua aberto; esta entrega depende dele.

## Marco de prévias, parte 3 — prévia manual de ZIP (13/10/2026)

- ZIP/editáveis empacotados podem usar uma imagem/PDF READY da mesma versão como fonte de prévia manual. O original ZIP não é extraído nem usado como fallback: o visualizador resolve somente os derivados processados da fonte.
- Vínculo persistido em ManualPreview, com FKs compostas por workspace/versão e check impedindo autorreferência. API valida tipo/estado da fonte, sessão, CSRF e projeto ativo; alterações serializam com arquivamento. Pode substituir ou remover o vínculo sem apagar originais/derivados nem duplicar cota.
- Estado/falha/retry da prévia são encaminhados à fonte. Após remover, o ZIP volta ao estado sem prévia automática. URLs já emitidas continuam válidas por até 60 s.
- Flutter: Escolher prévia manual no cartão do ZIP; seletor oferece somente imagens/PDF com envio concluído nesta versão. Se não houver fonte, orienta enviá-la antes por Enviar arquivo. A fonte continua como arquivo normal da versão, disponível ao criador.

Checks desta parte: Prisma generate/validate, lint, build/typecheck, contratos e diff check passaram; 9 unitários API; 36 testes de integração reportados (32 cenários + 4 pais), com PostgreSQL isolado; 27 testes Flutter, analyze e build Web release passaram. Parsers não foram alterados nesta parte (10 testes reais passaram na etapa anterior).

Validação real de vínculo/remoção no R2 em workspace sintético separado: ZIP original preservado, prévia aponta para o mesmo derivado marcado do PDF, bytes de uso não se duplicam e remover bloqueia emissão de nova URL. O projeto sintético foi arquivado, sessão encerrada e reserva zerada. A conferência manual no aplicativo pelo responsável ainda está pendente. Branch: codex/previa-manual-zip, baseada na entrega temporal do PR #3; inclui também o marco de segurança descrito abaixo.


## Marco de segurança de arquivos (13/10/2026)

- Migration incremental security_scans aplicada ao banco local e aos schemas de testes. Cada original READY, incluindo ZIP e arquivos anteriores, exige análise CLEAN vigente para download, renderização e prévia manual. Original rejeitado permanece privado e contabilizado; não há exclusão automática nem liberação por override.
- ClamAV LTS 1.4.6 oficial instalado em .tools, com assinaturas oficiais atualizadas e comando explícito pnpm security:update. Base diária até 72 h; análise válida por 24 h. Resultado exige relatório válido, sem erro; arquivos cifrados/limites de inspeção também são rejeitados. Falhas operacionais têm até três tentativas e retry manual; lease abandonado é recuperável.
- Scanner/Python/FFmpeg executados em AppContainer Windows por tentativa, sem capabilities de rede, com permissões restritas ao runtime dedicado, entrada e saída temporária, além dos recursos padrão Windows/perfil próprio. Job Object é associado antes de liberar o processo suspenso. Ambiente sem credenciais e handles explicitamente limitados. Registro durável permite remover permissões/perfis após crash.
- Original é vinculado à análise por SHA-256; mudança antes de renderizar invalida a liberação. Scanner limitado a 3 GiB/um processo; renderização a 768 MiB/dois processos, com CPU e timeouts. Linux/outros sistemas falham sem executar parsers desprotegidos; adaptador de isolamento continua pendente para essas plataformas.
- Flutter oculta download/prévia enquanto aguarda análise ou em bloqueio; erro oferece Repetir análise de segurança. Upload orienta aguardar e atualizar. Nenhum endpoint convidado foi aberto.

Checks: lint, typecheck, Prisma validate, contratos e build API passaram; 9 unitários API e 41 testes de integração PostgreSQL reportados (37 cenários + 4 pais), com schemas isolados; 18 testes Python reais sem skips (10 parsers, 5 AppContainer e 3 scanner); 30 testes Flutter, analyze e build Web release passaram. Detecção foi testada com assinatura sintética inofensiva dentro de ZIP, sem desativar o antivírus do Windows. Atualização oficial de assinaturas passou. API/worker/interface reiniciados; banco isolado de testes encerrado, desenvolvimento preservado.

Validação real HTTP/R2 em dois workspaces sintéticos: PNG, PDF, ZIP, MP4, MP3 e WAV ficaram bloqueados antes da análise e depois receberam CLEAN do ClamAV oficial. Python/FFmpeg produziram derivados no AppContainer; MIME/CORS, Range de áudio/vídeo e acesso sem assinatura negado passaram. Originais idênticos por SHA-256; ZIP compartilhou somente o derivado marcado do PDF sem duplicar cota, e remoção bloqueou nova URL. Reservas zeradas, projetos sintéticos arquivados e sessões de teste encerradas. Nenhuma credencial/cookie/URL assinada registrada.

Guia operacional e limites: [seguranca-arquivos.md](seguranca-arquivos.md). Conferência manual pelo responsável dos estados de segurança e da prévia manual de ZIP ainda pendente. Entrega de prévia manual e segurança na branch codex/previa-manual-zip, baseada em codex/previas-video-audio (PR #3). Envio ao GitHub autorizado pelo responsável; revisão/merge seguem o fluxo de PR.
