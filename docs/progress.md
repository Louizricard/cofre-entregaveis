# Estado do projeto

Atualizado em 15/10/2026. Última entrega: beta com quitação manual auditada e liberação condicionada de originais implementado/testado, aguardando conferência manual da interface. Pix automático permanece pendente. Guia: [quitação manual](quitacao-manual.md).

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

Publicação, portal e identidade foram confirmados manualmente pelo responsável. Comentários identificados estão implementados localmente e aguardam conferência manual. Próxima parte: pedidos de ajustes por rodada e revisões incluídas, depois aprovação. Envio de e-mail a clientes externos depende de domínio verificado; pagamentos seguem em marco posterior.

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


## Marco do portal, parte 1 — publicação de versões (13/10/2026)

- Publicação autenticada com expectedProjectRevision, isolamento por workspace, origem/CSRF e transação Serializable. Versão precisa de ao menos um original READY, nenhum envio ativo, análises CLEAN vigentes e prévias automáticas prontas. ZIP pode ficar sem prévia manual; registros cancelados/falhos não integram a entrega.
- Versão recebe PUBLISHED, autor e horário. Publicação mais recente marca a anterior SUPERSEDED sem apagar arquivos; criar rascunho não altera a versão atual. Índice parcial garante uma única PUBLISHED por projeto; rascunho anterior à atual não pode ser publicado.
- Publicada/histórica recusa upload e alteração/remoção do vínculo manual. Reanálise de segurança e regeneração de derivados continuam possíveis; originais e vínculo são preservados. Expiração/rejeição de segurança continua bloqueando URLs.
- Flutter oferece Publicar versão com confirmação, estados Publicada/Histórico e orientação para nova versão. Projeto desatualizado exige atualizar antes de publicar. Nenhum link convidado, aprovação ou download de cliente foi habilitado nesta parte.
- Migration incremental version_publication aplicada em schemas isolados e no desenvolvimento; versões anteriores conservadas como DRAFT. Branch local codex/publicacao-versoes, baseada na main após merges #4/#3/#2. Entrega incluída junto ao compartilhamento nesta branch.

Checks: lint, typecheck, Prisma generate/validate, build API e contratos passaram; 9 unitários API; 49 testes de integração reportados (44 cenários + 5 pais), com schemas separados; 35 testes Flutter, analyze e build Web release passaram. Casos novos cobrem autorização/CSRF, estados de arquivo/análise/prévia, revisão antiga, publicação concorrente, imutabilidade, histórico/retrocesso e arquivamento. Flutter verifica confirmação em 360/768/1440 px, cancelamento e falha preservando rascunho. Parsers não foram alterados; os 18 testes reais da etapa anterior permanecem como evidência dessa parte.

Teste real HTTP/R2 em workspace sintético: PNG/PDF/ZIP enviados, analisados e com prévias privadas verificadas; publicação retornou PUBLISHED, novo upload na versão retornou 409 e criar outro DRAFT manteve a versão atual publicada. Originais preservados, reserva zerada, projeto sintético arquivado e sessão encerrada. API, worker e interface atualizados em execução local.

Guia: [publicacao-versoes.md](publicacao-versoes.md). Publicação confirmada manualmente pelo responsável. O portal convidado foi acrescentado na parte seguinte, com sessão limitada e sem liberação de originais antes dos marcos de aprovação/pagamento.


## Marco do portal, parte 2 — compartilhamento e leitura de prévias (13/10/2026)

- ShareLink com token de 256 bits exibido uma vez, somente SHA-256 persistido, validade entre 5 minutos e 30 dias e até dez links ativos por projeto. UI oferece 1/7/30 dias, cópia e revogação; listagem paginada nunca recupera o segredo. Criação requer projeto ativo com versão publicada.
- GuestSession com cookie HttpOnly próprio, separado do criador; oito horas ou vencimento do link, rotação/encerramento e hashes persistidos. Bootstrap tem origem/CSRF/JSON e rate limit dez/minuto; mil sessões vigentes por link. Consultas revalidam vínculo, expiração, revogação e projeto ativo. Revogação invalida sessões relacionadas; assinatura de prévia tem conferência posterior antes da resposta.
- Portal Flutter acessível sem conta de criador, com saldo informado, versão atual/histórico publicado paginado e prévias de derivados; nenhum rascunho, chave original, e-mail privado ou download original exposto. Cookie convidado não autoriza endpoints do criador. Publicar atualiza o portal; rascunho não muda a entrega atual.
- Link usa fragmento /#/s/:token; Router.neglect troca rota/histórico por /portal antes do bootstrap, com ticket em memória consumido uma vez e nenhum extra/storage com segredo. Referrer no-referrer na página/API; logs sem caminhos ou corpos. Recursos Flutter locais via --no-web-resources-cdn em execução/build. Sessão convidada anterior é encerrada ao abrir outro link.
- Migration incremental guest_preview_portal aplicada nos schemas de testes e no desenvolvimento. Compartilhamento não afirma identidade e não habilita comentários, aprovação, pagamentos ou originais. Publicação da parte anterior foi confirmada pelo responsável antes desta etapa.

Checks: lint, typecheck, Prisma generate/validate, build API e contratos passaram; 9 unitários API e 64 testes de integração reportados (58 cenários + 6 pais), com schemas isolados. Casos incluem projeto distinto no mesmo workspace, rascunhos, rotação/expiração de sessão, revogação durante assinatura, limite concorrente de links, arquivamento e rate limit. Flutter: 44 testes, analyze e build Web release sem CDN passaram; casos novos conferem link exibido uma vez, clipboard, revogação, rota/histórico sem segredo antes do bootstrap, prévia sem privilégio de reprocessar e histórico/encerramento em 360/768/1440 px. Parsers não foram alterados nesta parte.

Teste real HTTP/R2 em workspace sintético: PNG/PDF/ZIP enviados e analisados; ZIP recebeu vínculo manual de PDF antes da publicação. Sessão convidada recebeu somente metadados seguros e JPEGs privados dos três arquivos. Rascunho novo retornou 404, tentativa de download original retornou 401, R2 sem assinatura negou acesso e revogação bloqueou consulta/bootstrap. Sessão do criador preservada, reserva zerada, projeto sintético arquivado e sessão encerrada. API/worker/Flutter atualizados em execução; banco isolado de testes encerrado.

Guia: [portal-previas.md](portal-previas.md). O responsável confirmou que o portal e os testes manuais orientados funcionaram corretamente. Branch local codex/publicacao-versoes inclui publicação e compartilhamento, com envio ao GitHub autorizado pelo responsável. Próximo trabalho: identidade por código de e-mail antes da colaboração; preparar envio transacional de e-mail sem registrar códigos em claro.


## Marco do portal, parte 3 — confirmação de e-mail (14/10/2026)

- Endpoints de estado, solicitação e verificação exigem sessão convidada válida, origem/CSRF nas mutations e rate limit. Somente o e-mail normalizado cadastrado no cliente gera desafio; resposta 202 é genérica para correspondência, cooldown e cota. Sem configuração de remetente, envio é desabilitado e não há confirmação falsa.
- Código aleatório de seis dígitos, válido por até dez minutos/sessão/link, uso único e cinco tentativas persistidas. HMAC vincula código ao desafio/sessão, com chave externa ao banco. Reenvio invalida desafio e evita repetir os dígitos anteriores. Verificação registra horário/e-mail na sessão; mudança de e-mail, revogação, expiração e arquivamento invalidam uso dessa identidade.
- IdentityChallenge também é fila persistente de envio; código pendente cifrado AES-256-GCM, sem texto aberto no banco/respostas/logs. API consome em ciclos de dois segundos, lease de três minutos e até três tentativas; idempotência por desafio, timeout HTTP de quinze segundos, limpeza de cifra em sucesso/falha definitiva/cancelamento. IdentityRequest mantém sessão/horário para cooldown de um minuto e dez pedidos/hora/projeto, incluindo e-mails diferentes.
- Adapter Resend com endpoint fixo, credencial apenas no ambiente do servidor e erros genéricos. Configuração exige RESEND_API_KEY, EMAIL_FROM simples e IDENTITY_SECRET aleatório hexadecimal de 32 bytes juntos; produção recusa remetente resend.dev. Não há modo de logar códigos ou adapter simulado habilitável na aplicação.
- Flutter: formulário, resposta genérica, código com zero inicial, cooldown, erros e estado confirmado. Sem serviço, explica indisponibilidade e mantém as prévias. Comentários, aprovação e download convidado continuam protegidos/ausentes.
- Migration incremental guest_identity aplicada em schemas isolados e no banco local. Branch codex/identidade-cliente baseada na main após PR #5. Envio ao GitHub autorizado pelo responsável. Conta Resend criada pelo responsável e teste real confirmado posteriormente, conforme registro abaixo.

Checks: lint, typecheck, Prisma generate/validate, build API e contratos passaram; 11 unitários API e 75 testes de integração reportados (68 cenários + 7 pais), com PostgreSQL isolado por suíte. Remetente simulado somente em memória; casos incluem cinco erros persistidos, uso único/sessão, expiração/reenvio, retries/lease, cota concorrente, e-mail alterado/revogação/arquivamento e modo desabilitado. Flutter: 50 testes, analyze e build Web release sem CDN passaram, incluindo formulário em 360/768/1440 px. Parsers/R2 não foram alterados. Os testes automatizados não contatam o provedor; a entrega real foi confirmada posteriormente pelo responsável.

O responsável criou a conta Resend, salvou a chave somente no .env local e configurou remetente de teste. Em 14/10/2026, criou cliente/projeto sintéticos, publicou uma versão e confirmou recebimento e uso do código no portal: “E-mail confirmado neste acesso”. O teste real foi no próprio endereço da conta, sem domínio próprio. Guia: [identidade-cliente.md](identidade-cliente.md). O gate de recebimento real desta etapa foi confirmado pelo responsável. Envio para clientes externos ainda exige domínio próprio verificado.


## Marco do portal, parte 4 — comentários identificados (14/10/2026)

- Comment vinculado ao workspace/versão/arquivo e à sessão convidada, com e-mail confirmado e horário para auditoria. Corpo até quatro mil caracteres, exibido como texto literal. Consultas paginadas retornam somente autor genérico, texto, horário e referência; não expõem e-mail, sessão, chaves ou payloadHash.
- Cliente precisa de identidade confirmada ainda correspondente ao cadastro para consultar/escrever. Novos comentários somente na versão PUBLISHED atual, com segurança vigente no original e fonte manual. Histórico SUPERSEDED fica para consulta. Criador consulta comentários no próprio workspace, inclusive em projeto arquivado; não há resposta/edição/exclusão nesta parte.
- Âncoras GENERAL, IMAGE_POINT, PDF_POINT e TIME validadas no backend: formato, campos aplicáveis, coordenadas normalizadas, página existente e duração do trecho derivado. ZIP resolve somente a fonte manual imutável. Interface oferece formulário com posições em percentual e segundos, sem seleção por clique/captura automática do player nesta parte.
- Tentativa clientRequestId por sessão/payload impede duplicação em retry/resposta perdida; payload diferente retorna conflito. Transação Serializable e revisão do projeto serializam comentários com publicação/arquivamento. Até duzentos comentários/arquivo e mil/versão; envio limitado a trinta tentativas/minuto/IP. Comentários não consomem rodadas de ajustes nem liberam originais.
- Flutter: Comentários no portal e no painel do criador, consulta/histórico, formulário e erros de identidade/estado, campos por referência, retry preservando tentativa e texto. Atualizar referências não mantém uma seleção indisponível nem perde o texto digitado.
- Migration incremental asset_comments aplicada em schemas isolados e no banco local, preservando uploads/versões/identidades. Branch codex/comentarios-arquivos baseada na main após PR #6; sem commit/push desta etapa.

Checks: lint, typecheck, Prisma generate/validate, build API e contratos passaram; 11 unitários API e 86 testes de integração reportados (78 cenários + 8 pais), com schemas isolados. Casos novos incluem identidade/CSRF, metadados seguros, âncoras, projeto publicado distinto no mesmo workspace, rascunhos, paginação, expiração da segurança, limite concorrente e publicação concorrente/histórico. Flutter: 60 cenários distintos passaram (suíte de 59 + caso adicional e reexecução dos dez casos de comentários), analyze e build Web release sem CDN passaram. Parsers, R2 e envio de e-mail não foram alterados nem reprocessados para provar esta etapa.

O responsável confirmou os comentários funcionando em 14/10/2026: “deu certo, pode seguir”. Guia: [comentarios-arquivos.md](comentarios-arquivos.md). Rodadas de revisão foram autorizadas em seguida; aprovação/pagamentos seguem depois.

## Marco do portal, parte 5 — pedidos e rodadas de ajustes (14/10/2026)

- Cliente identificado envia resumo na versão publicada atual. O pedido registra snapshot dos IDs dos comentários existentes e fecha a coleta. Comentários individuais não consomem revisões. Uma única rodada OPEN/PENDING por projeto, garantida também por índice parcial.
- Contagem de revisões aceitas/encerradas compara com includedRevisionRounds. Pedido incluído entra OPEN; extra entra PENDING até o criador aceitar ou recusar com justificativa. Aceite conta uma rodada e audita autor/horário/motivo; recusa não conta e permite recolher comentários e reenviar um pedido sujeito a decisão.
- Publicação resolve OPEN e cancela PENDING na mesma transação, preservando histórico e abrindo coleta na nova versão. RESOLVED significa nova entrega publicada, sem representar aprovação do cliente. Projeto arquivado bloqueia ações; criador conserva consulta.
- Idempotency-Key UUID por sessão/payload recupera tentativas, inclusive após publicação. Chave reutilizada com payload diferente e pedidos simultâneos incompatíveis conflitam. Decisão igual pelo mesmo usuário também é idempotente. Serializable e revisão do projeto ordenam comentário, pedido, decisão e publicação.
- Flutter oferece formulário/resumo, avisos de limite e histórico no portal e decisões no painel do criador; texto literal e retry com chave estável. Contrato e cliente Dart suportam o cabeçalho sem alterar responsabilidade do transporte sobre CSRF. Até cem pedidos/projeto e dez tentativas/minuto/IP.

Checks: lint, typecheck, Prisma generate/validate, build API e contratos passaram; 11 testes unitários API. As oito suítes anteriores passaram com a nova migration (86 testes reportados); após correções nos fixtures do teste novo, a suíte de rodadas passou com 9 testes reportados (8 cenários + pai), totalizando 95 testes reportados em schemas isolados. Incluem snapshot/fechamento concorrente com comentário, publicação concorrente, identidade/CSRF/chave, isolamento/rascunho, contagem/decisão e histórico. Flutter: 68 testes, analyze e build Web release sem CDN passaram, incluindo larguras 360/768/1440, retry após resposta perdida, histórico, identidade e decisão justificada. Parsers, R2 e envio de e-mail não foram alterados ou revalidados em serviços reais nesta etapa.

Guia: [rodadas-ajustes.md](rodadas-ajustes.md). O responsável confirmou as rodadas funcionando em 14/10/2026 e autorizou o envio ao GitHub. Entrega na branch codex/comentarios-arquivos, junto aos comentários já confirmados pelo responsável. Próxima implementação: aprovação explícita da versão pelo cliente identificado, antes de pagamentos e liberação de originais.

## Marco do portal, parte 6 — aprovação explícita da versão (14/10/2026)

- Approval imutável por versão, com workspace, sessão, e-mail confirmado e horário do servidor. Consulta do criador e do cliente identificado retorna somente metadados seguros. Nova publicação preserva o registro anterior, sem transferir aprovação para a nova versão.
- Confirmed precisa ser booleano true. Idempotency-Key UUID por sessão/payload recupera tentativas, inclusive após publicação; chave reaproveitada para outra versão conflita. Uma chave nova em versão histórica não cria aprovação. Uma única aprovação por versão, com trilha separada de tentativas e limites de cem/sessão e mil/versão.
- Identidade, escopo, publicação atual, projeto ativo, arquivos prontos, análise CLEAN vigente e prévias suportadas prontas são conferidos em transação. Rodada OPEN/PENDING bloqueia aprovação. Aprovação fecha novos comentários/pedidos de ajustes, sem remover histórico. Originais continuam protegidos.
- Serializable e incremento da revisão do projeto ordenam aprovação com publicação, comentário e rodada. Publicação concorrente nunca aprova implicitamente a nova versão; aprovação e pedido de ajustes concorrentes têm um único vencedor.
- Flutter oferece checkbox e confirmação explícita no portal, consulta pelo criador, histórico, erros e retry com chave estável. Falha de identidade na atualização limpa a consulta anterior. OpenAPI e cliente Dart atualizados; gerador preserva nullable em modelos referenciados por allOf.
- Migration incremental version_approvals aplicada em schemas de teste e no banco local; acrescenta duas tabelas e relações sem mudar uploads, arquivos R2 ou códigos de e-mail. Branch local codex/aprovacao-versoes baseada na main após merge do PR #7. Sem commit/push desta etapa.

Checks: lint, typecheck, Prisma generate/validate, build API e contratos passaram; 11 unitários API. As nove suítes anteriores passaram com a nova migration (95 testes reportados); após corrigir dois fixtures da suíte nova, os 12 testes reportados de aprovação passaram (11 cenários + pai), totalizando 107 testes reportados em schemas isolados. Casos incluem confirmação/identidade/CSRF/chave, outro projeto no mesmo workspace, rascunho, segurança/prévia, auditoria, estado das rodadas, histórico, três tipos de concorrência e limite atômico de tentativas. Flutter: 77 testes da suíte completa e reexecução dos nove casos de aprovação passaram; analyze e build Web release sem CDN passaram. Parsers, R2 e envio de e-mail não foram alterados nem revalidados em serviços reais nesta etapa.

Guia: [aprovacao-versoes.md](aprovacao-versoes.md). Aprovação confirmada manualmente pelo responsável em 14/10/2026: “deu certo, pode seguir”. Próximo trabalho após essa validação: cobrança e pagamento, com liberação de originais condicionada à aprovação, quitação ou dispensa explícita e segurança vigente.

## Marco Pix, parte 1 — pré-validação e ensaio Orders (14/10/2026)

- Aprovação confirmada manualmente. Iniciado o gate da seção 8 do PRD; documentação oficial, matriz e limitações em [pix-viabilidade.md](pix-viabilidade.md).
- Responsável criou a aplicação Cofre Entregaveis - Desenvolvimento, Checkout Transparente via Orders, após login/validação e aceite dos termos. Aplicação anterior preservada. Credencial de teste salva pelo responsável somente em .local/pix-spike.env, ignorado pelo Git e separado do .env do produto.
- Comando pix:preflight isolado consulta identidade por GET e exige User ID esperado, site brasileiro e marcador test_user. Não usa prefixo do token como prova de ambiente. Teste real confirmou conta de teste esperada.
- Comando pix:spike isolado cria/recupera a mesma order sintética APRO de 50.00 somente após essa conferência. Repete corpo/chave, confere IDs, aplicação, recebedor, referência, país, valor e Pix e consulta o recurso. Tentativa persistida antes do POST e atualizada por arquivo temporário/rename, sem token/QR/resposta completa no estado.
- Ensaio real de sandbox passou: criação, repetição idempotente e consulta. Estado inicial action_required, depois processed/accredited na order e transação; confirmação simulada conciliada, sem movimentar dinheiro real. Nenhum estado financeiro no Cofre foi alterado e nenhum download foi liberado.
- Configuração avançada inspecionada: retorno OAuth, PKCE e scopes disponíveis. Sem mudanças salvas. Endereço HTTPS de desenvolvimento ainda precisa ser preparado; nenhum túnel/endpoint público criado.

Checks: build, lint e typecheck passaram; 23 unitários API, incluindo 12 novos casos do ensaio isolado para configuração, conta real/divergente, destino fixo/redirects, divergências na order, states, recuperação e falha de rede sem vazamento. Pré-validação e ensaio sandbox reais passaram. API do produto, contratos e Flutter não foram alterados para os comandos do spike; validações da aprovação permanecem as registradas acima. OAuth de vendedor, webhook autêntico, expiração/cancelamento, estorno e condições de produção continuam pendentes. Gate F10 não concluído. Sem commit/push das alterações locais.
## Marco Pix, parte 2 — transporte HTTPS isolado (14/10/2026)

- Responsável informou ainda não usar serviço de túnel. Cloudflare Quick Tunnel preparado com cliente oficial 2026.10.0 e SHA-256 fixado/conferido.
- Receptor separado em loopback:3101, sem acesso a banco, credenciais, R2 ou arquivos. Somente health ativo; callback OAuth e webhook ainda em 503, sem capturar/confirmar conteúdo. API/painel/worker preservados.
- Launcher valida hash e marcador do serviço, fixa destino 3101, usa configuração exclusiva e remove overrides de ambiente do cliente. Descarta saída bruta; extrai somente hostname e registra estado/PIDs em arquivo local ignorado. Limite de sessenta minutos; script de encerramento verifica executável/comando/vínculo antes de parar processos do ensaio.
- Túnel iniciado e conferido externamente: HTTPS health 200, arquivos e endpoint de autenticação do produto 404, callback sintético 503 sem reflexão. Endereço em .local/pix-tunnel.json. Guia: [pix-tunel-desenvolvimento.md](pix-tunel-desenvolvimento.md).
- Área de credenciais de produção consultada sem ativação: pede categoria/site do negócio. Nenhum dado comercial inventado, credencial produtiva ativada ou configuração OAuth salva. Ao procurar os dados OAuth da aplicação, o provedor pediu nova validação da conta; aguardando conclusão pelo responsável.

Checks: build, lint, typecheck e contratos passaram; 27 unitários API, incluindo os quatro casos novos do receptor. Check local do launcher e probes HTTPS externos passaram. Script PowerShell de encerramento conferido pelo parser, ainda não executado nesta sessão. Sem novas alterações no Flutter ou na API do produto. Transporte preparado não equivale a OAuth/webhook validado; gate F10 permanece aberto. Sem commit/push desta etapa.

## Marco Pix, parte 3 — receptor de webhook de sandbox (14/10/2026)

- Responsável validou novamente a conta e informou não ter site público. Client Secret não apareceu nas telas consultadas; ativação produtiva permanece pendente, sem cadastrar informações fictícias.
- Painel oferece Modo de teste para notificações. URL temporária e evento Order preparados sem salvar. Assinatura secreta ainda precisa ser salva pelo responsável no arquivo local ignorado. Callback OAuth continua fechado.
- Handler isolado valida assinatura HMAC, freshness, query/corpo, ambiente e identidade; reconcilia somente a order conhecida por GET autenticado. Evidência sanitizada durável, deduplicação por entrega assinada, limite/concorrência/retry. Nenhum estado do produto ou download é alterado. Detalhes e limitações em [pix-tunel-desenvolvimento.md](pix-tunel-desenvolvimento.md).

Checks: build, lint, typecheck e contratos passaram; 36 unitários API, nove novos casos de webhook. HTTPS temporário ainda respondeu health isolado; notificação autêntica e seller OAuth continuam pendentes. Sem commit/push. Gate F10 não concluído.

Responsável salvou assinatura/configuração. Receptor ativado após pré-validação e consulta da order de teste, health local/externo confirmou modo sandbox-webhook. Simulador do painel entregou requisição com HMAC válido, mas corpo live_mode true, Visa/Point e valores/referência fictícios: rejeitado com 400. Não houve confirmação persistida nem liberação. Ensaio real de notificação da order de sandbox permanece pendente; controles preservados. Túnel e receptor encerrados após o ensaio. Script de encerramento atualizado para reconhecer o receptor também por caminho absoluto, mantendo a conferência de executável/comando.

## Página pública de apresentação (14/10/2026)

- Responsável autorizou preparar a página pública e escolheu contato somente pelo GitHub. Criada fonte estática independente em apps/public_site, mantendo a identidade verde/creme do produto.
- Apresentação do fluxo, público criativo, abas ilustrativas de versões/feedback/aprovação, estado real de desenvolvimento e aviso de Pix em testes/sem cadastro ou contratação pública. Privacidade separada, sem formulário, tracker, scripts externos ou dados reais no código.
- Publicada pelo plugin Sites com audiência pública em https://cofre-entregaveis.yummyscout32.chatgpt.site, versão 1, deployment succeeded. Commit/push do helper somente no repositório exclusivo do Sites; monorepo não enviado ao GitHub nesta etapa. Guia de fonte/publicação em [pagina-publica.md](pagina-publica.md).
- Build e sintaxe JS passaram; HTTP 200 local e público sem login, abas por clique/teclado e privacidade conferidas no navegador. Viewports 360/768/1440 sem overflow horizontal. Prévia local encerrada ao concluir; painel do Cofre preservado. Ajustes de compatibilidade do helper Windows documentados.

Próximo passo: usar o site público para continuar a conferência de habilitação/credenciais OAuth no painel do Mercado Pago. A publicação não implica aprovação pelo provedor; gate F10 permanece aberto.

## Marco Pix, parte 4 — preparação Authorization Code (14/10/2026)

- Responsável ativou credenciais após revisar termos e salvou Client Secret em arquivo local ignorado separado. Vendedor esperado fixado na conta brasileira de teste já conferida; painel sandbox confirmou disponibilidade desse ID, usuário/senha/código, sem emissão dos valores.
- Novo HTTPS isolado preparado; callback e PKCE Sim preenchidos e salvos pelo responsável após reCAPTCHA. Login do vendedor solicitado em janela anônima, mantendo a sessão integradora separada. Tentativa OAuth será iniciada após o login para preservar seu prazo.
- Implementado módulo isolado com state de uso único, PKCE S256, expiração, troca test_token true e identificação positiva de conta de teste por GET. Tokens descartados; somente evidência sanitizada é persistida. Callback limpa URL via 303; nenhuma rota pública inicia tentativa, nenhuma alteração financeira ou liberação ocorre.
- Build, lint, typecheck e contratos passaram; 44 unitários API, oito casos novos de OAuth. Troca/consentimento reais, notificação legítima de sandbox e Pix usando token do vendedor conectado continuam pendentes. Sem commit/push ao GitHub. Guia: [pix-oauth-desenvolvimento.md](pix-oauth-desenvolvimento.md).

Prova OAuth real concluída em 14/10/2026 às 19:42:30 (America/Sao_Paulo): responsável autorizou na janela anônima do vendedor de teste e confirmou redirecionamento. Troca test_token true e consulta autenticada confirmaram conta esperada, Brasil e tag test_user; state de uso único/PKCE S256 validados. Evidência sanitizada status verified, sem tokens persistidos; nenhuma order criada nessa etapa. Túnel/receptor encerrados após a prova, painel preservado. Próximo ensaio: Pix com token obtido pelo OAuth do vendedor e notificação legítima conciliada. Tokens descartados, nova autorização será necessária. Sem novo commit/push ao GitHub; gate F10 ainda aberto.

## Marco Pix, parte 5 — preparação da cobrança conectada (14/10/2026)

- Responsável autorizou o ensaio Pix com token OAuth e notificação. Hook isolado entrega somente access token após identificação positiva de sandbox; refresh token descartado. Job em segundo plano com APRO 50.00, tentativa própria persistida antes de POST, repetição idempotente e recuperação sem gerar chave nova.
- Handler dinâmico exige order conhecida/persistida, assinatura e GET com o mesmo token OAuth. Inbox/evidência separadas, sem token em disco; marcadores de consulta, idempotência e notificação independentes. Vida em memória limitada e encerramento aborta chamadas. Sem fallback para token da aplicação e sem estado financeiro no produto.
- Novo túnel preparado, URL de webhook no Modo de teste atualizada e persistência conferida. Responsável revalidou a conta e salvou callback novo/PKCE. Nova tentativa OAuth pronta, aguardando consentimento do vendedor de teste. Não considerar criação ou webhook conectados comprovados ainda.
- Build, lint, typecheck e contratos passaram; 52 unitários API, oito novos casos do fluxo conectado. Guia e limitações: [pix-conectado-desenvolvimento.md](pix-conectado-desenvolvimento.md). Sem commit/push ao GitHub; gate F10 permanece aberto.

Primeira autorização do ensaio conectado voltou ao receptor, mas a troca de código foi recusada pelo provedor; nenhuma order foi criada. Repetição do callback bloqueada. Callback salvo/PKCE reconferidos. Acrescentado diagnóstico sanitizado somente com HTTP/enum OAuth conhecido, nunca descrição/payload/segredo; motivo da primeira recusa ainda desconhecido. Build/lint/typecheck e 53 unitários passaram. Nova tentativa preparada no mesmo HTTPS/chave de Pix, aguardando autorização manual; gate F10 permanece aberto.

Segunda autorização conectada: OAuth e identidade passaram às 23:06:23 UTC de 14/10/2026; POST Orders recusado HTTP 401, sem ID conhecido ou comprovação de cobrança/notificação. Código específico não foi observado. A documentação Orders exige credencial APP_USR de usuário de teste, diferente da orientação OAuth sandbox genérica. Perfil conectado agora troca `test_token: false`, exige APP_USR e confirma ID/MLB/test_user autenticados antes do hook; perfil OAuth isolado mantém comportamento anterior. Conta real permanece bloqueada; guards da order/webhook e chave/referência preservados. Diagnóstico Orders ampliado com enum allowlist, sem payload/descrição. Build/lint/typecheck e 55 unitários passaram. Novo OAuth ainda necessário para validar a compatibilidade; gate F10 aberto, sem commit/push.

Perfil Orders autorizado pelo vendedor em 14/10/2026: OAuth/identidade confirmados às 23:14:29 UTC; POST Orders recusado HTTP 422 às 23:14:30 UTC, sem enum reconhecido ou ID conhecido. Sem prova de idempotência ou notificação. Não repetir autorização idêntica sem diagnóstico. Próxima decisão: suporte ao OAuth/sandbox Orders versus rota Payments API documentada para vendedor conectado; não inferir causa do 422 nem equivalência dos produtos. Evidências e tentativa preservadas; sessão temporária encerrada para descartar token. Gate F10 permanece aberto, sem alterações financeiras no Cofre ou novo push.

## Marco Pix, parte 6 — alternativa documentada Payments (14/10/2026)

Responsável autorizou verificar compatibilidade e preparar alternativa. Documentação oficial confirma token OAuth do vendedor na Payments API; migração Orders alerta para não presumir paridade marketplace/split. Isso não prova causa do 422 nem proibição absoluta de OAuth Orders. Preparado ensaio Payments independente, sem application_fee: api/tentativa/referência/ID/inbox/evidência próprios, OAuth sandbox e identidade autenticada antes de POST, idempotência e GET, collector/valor/BRL/Pix/live_mode false obrigatórios. Transporte HMAC/inbox compartilhado sem misturar validação financeira de Orders/Payments; replay antigo não restaura aprovação após estorno. Nenhum estado financeiro do produto alterado.

Build/lint/typecheck e 64 unitários passaram (nove Payments). Também corrigida leitura de BOM no estado do túnel gravado por Windows PowerShell; novo HTTPS isolado confirmou OAuth desativado. Campos API Pagamentos e callback novo preparados no painel, PKCE Sim preservado; aguardando responsável concluir reCAPTCHA e salvar. Após isso, configurar evento Pagamentos no Modo de teste antes de gerar outro OAuth. Nenhuma chamada real Payments ainda. Guia/limites: [pix-payments-desenvolvimento.md](pix-payments-desenvolvimento.md). Sem novo commit/push, gate F10 aberto.

Retomada em 15/10/2026: a leitura do painel não pôde ser feita após a confirmação anterior de salvamento porque a revisão automática de ferramentas falhou por limite de uso; nenhuma ação daquela chamada foi executada. Na retomada, o painel mostrou API Orders e callback antigo, portanto a mudança Payments permanece não confirmada. Túnel anterior expirado; renovado apenas para o receptor isolado, com OAuth ainda desativado. Mercado Pago exigiu nova verificação de conta ao abrir Webhooks; aguardando responsável. Não gerar autorização antes de confirmar URLs/evento/API salvos.

Responsável concluiu a nova verificação. URL atual de webhook e evento Pagamentos salvos no Modo de teste; persistência confirmada após recarregar/reabrir a configuração. Assinatura preservada, sem configuração produtiva. API Pagamentos/callback atual preparados novamente, PKCE Sim mantido; aguardando responsável concluir reCAPTCHA e salvar com confirmação de sucesso. OAuth permanece desativado e nenhum Pix Payments criado.

Salvamento confirmado pelo responsável; detalhes mostraram API Pagamentos, reabrir formulário confirmou API/callback atual/PKCE Sim persistidos. Receptor isolado Payments ativado, nova tentativa OAuth preparada, aguardando autorização do vendedor de teste. Chave/referência Payments preservadas; nenhuma chamada real de pagamento ou notificação comprovada até este ponto.

Ensaio Payments de 15/10/2026: OAuth/state/PKCE/identidade confirmados às 14:27:05 UTC, POST `/v1/payments` respondeu HTTP 500 sem enum reconhecido. Sem ID conhecido; criação no provedor desconhecida, sem prova de idempotência/GET confirmado/webhook. Não atribuir causa nem marcar sucesso. Evidência e tentativa preservadas; receptor/túnel encerrados para descartar token. Após a falha, acrescentadas retentativas limitadas (até três envios para 500/502/503/504, pausas 1/2 s, mesma chave/corpo), com diagnóstico enum sanitizado ampliado. Não exercitadas no provedor nesta sessão; 66 unitários/build/lint/typecheck passaram. Rascunho [pix-diagnostico-provedor.md](pix-diagnostico-provedor.md) preparado, sem mensagem enviada ao suporte. F10 segue aberto, sem quitação/liberação no produto ou novo push.

Investigação adicional autorizada: guia oficial Pix/Bricks descreve APP_USR de usuário de teste para Payments, enquanto o ensaio usou OAuth test_token true. Diferença registrada como hipótese, sem atribuir causa ao HTTP 500. Artigo de testes autenticado não trouxe diagnóstico específico. Canal de atendimento técnico oficial localizado pela Central de Suporte; [mensagem revisável](pix-mensagem-suporte.md) preparada, sem envio. Sem novo OAuth/cobrança/túnel nesta investigação; aguardando autorização explícita para comunicar o diagnóstico ao suporte.

Responsável autorizou explicitamente o envio do texto preparado. Mensagem enviada ao atendimento técnico pela Central de Suporte em 15/10/2026 às 11:51 (America/Sao_Paulo); envio apareceu no histórico da conversa. Interface informa que o atendimento inicial é por IA. Ainda sem protocolo humano ou diagnóstico validado; nenhum segredo enviado, nenhuma mudança de credencial/cobrança nessa comunicação.

Resposta automática recomendou Orders/OAuth test_token true e pediu corpo completo do 422; não resolveu a divergência entre 401 observado e regra de credenciais Orders. Corpo completo não disponível, não inventado. Esclarecimento/análise humana preparado, porém segundo envio rejeitado pela revisão automática por exceder a autorização específica do texto inicial. Nova mensagem não enviada; draft revisável em [pix-esclarecimento-suporte.md](pix-esclarecimento-suporte.md), aguardando autorização. Nenhuma configuração/ensaio adicional executado a partir da resposta automática.

Responsável autorizou especificamente o esclarecimento. Texto conferido e enviado ao mesmo atendimento em 15/10/2026 às 12:03 (America/Sao_Paulo); histórico confirmou envio. Rejeição anterior resolvida por autorização específica, sem contorno. Aguardando resposta à divergência Orders/OAuth e ao pedido de análise humana; nenhum novo OAuth, credencial ou cobrança executados.

Atendimento respondeu oferecendo criar chamado humano Checkout API com resumo dos erros e pediu confirmação. Responsável recebeu resumo/solicitação de autorização para essa abertura. Chamado ainda não criado, nenhum protocolo confirmado. Configuração e ensaios locais permanecem preservados.

Responsável autorizou abertura, confirmação enviada às 12:06 (America/Sao_Paulo) de 15/10/2026. Atendimento confirmou que abriu o chamado e enviará número específico por e-mail (formato WCS-XXXXX). Número ainda não exibido, e-mail não acessado; não usar placeholder como protocolo. Evidência visual local `.local/mp-support-ticket-created.png`. Aguardando orientação técnica humana; nenhum novo OAuth/Pix/chave ou liberação executados. Gate F10 aberto.

Responsável forneceu resposta do e-mail e ticket WCS-54765. Suporte orienta perfis separados (Orders OAuth APP_USR de test_user; Payments sandbox TEST) e pede corpo do 422/x-request-id. Esses dados antigos não foram preservados; token em memória já descartado, logo nova sessão OAuth/request será necessária. Adicionada captura local Orders de JSON de erro limitado a 32 KiB e request ID, com mascaramento de credenciais/QR/payer/card e flags complete/redacted; arquivo ignorado pelo Git, sem payload em console/Error. Mesma chave/ref/corpo preservados. Build/lint/typecheck e 69 unitários passaram, três testes novos de diagnóstico. Nenhum novo OAuth/Pix/envio ao suporte nesta preparação; link assinado do e-mail não persistido/aberto. Próxima prova retoma Orders com captura, não tenta recuperar retroativamente a resposta antiga.

Responsável autorizou prosseguir com nova tentativa Orders. Perfil local Orders selecionado (Payments desativado), receptor iniciado com OAuth desativado e tentativa original preservada. HTTPS novo isolado preparado e callback local atualizado. Mercado Pago exigiu nova verificação de conta ao abrir Webhooks; aguardando responsável antes de atualizar URL/evento/API no painel. Nenhum novo OAuth ou POST de pagamento executado ainda.

Responsável concluiu verificação. Novo webhook salvo no Modo de teste; URL persistida confirmada após reload, evento Order marcado. Formulário preparado com API Orders/callback atual/PKCE Sim, aguardando reCAPTCHA e salvamento manual. OAuth ainda desativado; captura do próximo erro será local e vinculada ao ticket WCS-54765.

Responsável confirmou sucesso no salvamento; reabrir edição confirmou API Orders/callback atual/PKCE Sim persistidos. OAuth Orders ativado (perfil APP_USR de usuário de teste), link novo gerado e health HTTPS confirmado. Tentativa original preservada; aguardando autorização manual do vendedor de teste. Nenhum POST novo ainda. Diagnóstico de erro será capturado somente localmente, sem envio automático ao suporte.

Responsável autorizou e confirmou retorno. OAuth/identidade/state/PKCE passaram em 15/10/2026 às 15:32:08 UTC; POST Orders repetiu HTTP 422. Captura completa sem mascaramento guardou JSON errors[0] code unprocessable_content/message Unprocessable Entity e x-request-id f143fef1-0bd4-4603-9313-00e5f8022b9f, horário 15:32:09 UTC. Sem campo/causa específica ou orderId conhecido; gate F10 aberto. Mensagem revisável [pix-retorno-wcs-54765.md](pix-retorno-wcs-54765.md) preparada para correlação no chamado, sem envio automático. Receptor/túnel encerrados após coleta; tentativa/produto preservados.

Responsável autorizou especificamente o novo diagnóstico. Texto enviado ao mesmo atendimento Mercado Pago às 12:35 (America/Sao_Paulo) de 15/10/2026, identificando WCS-54765 e fornecendo horário/x-request-id/JSON completos da nova chamada. Histórico confirmou envio; aguardando confirmação de associação ao chamado e análise. Sem chaves/tokens enviados, sem novo OAuth ou pagamento.

Assistente esclareceu que era necessário responder na página WCS, sem correlação interna pelo chat. Aberta página real WCS-54765 pelo link do atendimento; mesmo texto autorizado publicado diretamente no campo de comentário. Página confirmou “Pronto, recebemos seu comentário!”, captura `.local/mp-wcs-54765-diagnostic-published.png`. Aguardando equipe técnica. Sugestão do assistente de incluir request body/chave de idempotência não executada, pois não estava no texto aprovado. Nenhum novo chamado/ensaio/configuração criado nesta etapa.

Responsável pediu revisão crítica e abordagem diferente. [Auditoria técnica](pix-auditoria-tecnica.md) registra falhas de método, limites dos testes simulados e controle independente HTTPS. Consulta inicial e replay conhecidos validados; controle novo separado com credencial própria de teste e corpo mínimo oficial recebeu HTTP 201 em 15/10/2026 21:13:23 UTC, GET posterior às 21:16:40 confirmou processed/accredited. Sem OAuth novo/QR real/produto financeiro. processing_mode ausente não impediu esse controle, portanto não atribuir a ele o 422. Corrigida lacuna no hook OAuth: exigir read/write concedidos no token antes do job de cobrança e registrar booleanos. Scopes antigos desconhecidos, causa do 422 ainda aberta. 70 unitários/build/lint/typecheck passaram. Novas evidências não enviadas ao suporte e não houve push.
# 15/10/2026 — comparação independente de transporte OAuth preparada

## Beta manual implementado após escolha explícita do responsável

- Invoice/ManualSettlement/OriginalGrant adicionados. Cobranças OPEN inclusive saldo zero; recebimento externo/dispensa/desfazimento com motivo, ator, confirmação e idempotência. Somente OWNER altera; Serializable e revisão esperada evitam quitação concorrente ou de saldo divergente. Replay antigo não reaplica PAID depois de reversão.
- Portal solicita URL curta de original somente com identidade confirmada, versão atual aprovada, cobrança PAID/WAIVED coerente com saldo zero, projeto/acesso ativos e arquivo READY/CLEAN vigente. Grants auditados; URLs não persistidas, até cerca de 60 s. Histórico e novas URLs permanecem protegidos após reversão/revogação/nova publicação.
- API: 115 testes de integração PostgreSQL, 80 unitários, lint/typecheck e contratos passaram. Revalidação financeira final (8 testes) incluiu saldo divergente da cobrança paga. Flutter: 79 testes, analyze e build web passaram; teste de resposta perdida conserva chave/payload e download recusado não abre URL.
- Backup privado cofre-before-manual-settlement-20261015-192219.dump criado antes de aplicar 20261015000100_manual_settlement no banco local. Verificação por contagens: 11 projetos, todos com invoice OPEN/saldos preservados, zero eventos manuais e zero grants. Nenhum projeto foi quitado pela implementação.
- API e servidor web locais reiniciados. Inspeção visual automatizada bloqueada pela política de URL do navegador integrado; validação manual de interface/R2 convidado pendente do responsável. Pix continua não comprovado; nenhum novo resultado enviado ao suporte ou trabalho enviado ao GitHub. Guia: docs/quitacao-manual.md.

Atualização 22:03 UTC: autorização pelo host brasileiro concluiu na mesma tentativa após recusa transitória/não diagnosticada na rota inicial. Payments com test_token true também retornou 500/user_allowed_only_in_test, request-id 10433625-70ed-472c-b258-04f8c558baad. Sem ID/confirmação/webhook; tentativa preservada. Prefixo exato do token não foi registrado, portanto não declarar TEST observado. Complemento consolidado preparado em pix-conclusao-ensaios-wcs-54765.md, não enviado. Responsável consultado sobre beta com quitação manual auditada versus investigação exclusiva de Pix; nenhuma mudança financeira no produto iniciada.

Comparação fresca executada em 21:55 UTC: OAuth/identidade/read/write confirmados; Orders mínimo e automatic receberam 422 com chaves novas. Payments APP_USR recebeu 500 agora diagnosticado como user_allowed_only_in_test; request-ids e limites registrados em pix-comparacao-fresca.md. Sem IDs ou confirmação. Preparado ensaio Payments sandbox_token em tentativa nova separada, mantendo callback/webhook atuais e sem mudar o produto do painel. Nenhum novo resultado enviado ao suporte. Build/lint passaram após a ligação desse cenário ao receptor.

Nova comparação preparada a pedido do responsável: tentativas diagnósticas separadas Orders mínimo, Orders automatic e Payments APP_USR, sequenciais na mesma sessão; original preservada. Só avança depois de 400/401/403/422 sem recurso fixado; rede/5xx/persistência/validação/sucesso interrompem. Diagnóstico Payments agora também captura corpo e request-id sanitizados. 80 unitários/build/lint/typecheck passaram. Receptor/túnel isolados preparados com OAuth desabilitado. Painel voltou a exigir verificação da conta ao abrir Webhooks; responsável orientado a concluir manualmente. Ainda não houve execução real desses três cenários. Guia: pix-comparacao-fresca.md.

Complemento da comparação nativa enviado ao chamado WCS-54765 após autorização “faz” do responsável. O painel confirmou recebimento do comentário. Sem novo OAuth, cobrança ou envio de credenciais. Aguarda análise técnica do request-id f9554fa8-fa1a-450f-8f71-c5264f51c96a e esclarecimento sobre idempotência/validação do fluxo.

Atualização 21:39 UTC: corrigido limite local de 256 caracteres no parser de scope após diagnóstico real; 75 unitários/build/lint/typecheck passaram. Nova autorização confirmou read/write e identidade esperada. Cliente node:https executou Orders e recebeu novamente 422, request-id f9554fa8-fa1a-450f-8f71-c5264f51c96a. Mesma tentativa original preservada; possível cache de erro por chave não descartado. Nenhuma order OAuth/confirmacão/webhook comprovados. Complemento ao suporte preparado em pix-comparacao-oauth-wcs-54765.md e não enviado.

- Adaptador `node:https` isolado para identidade/Orders, ativação local `MP_OAUTH_NATIVE_ORDERS=1`; token OAuth somente em memória após read/write e identidade conferidos.
- Mantidos corpo, chave e referência da tentativa conectada. Evidências identificam o transporte; erros preservam diagnóstico já sanitizado.
- Build, lint, typecheck e 73 unitários passaram. Resultado real ainda pendente: callback/reCAPTCHA, webhook temporário e nova autorização do vendedor de teste. OAuth desabilitado na preparação. Não enviado novo conteúdo ao suporte.
