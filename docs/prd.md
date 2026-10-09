# Cofre de Entregáveis — PRD técnico e primeiro marco

Versão 1.3 · 9 de outubro de 2026 · Marco 1 concluído; marco 2A implementado

## 1. Objetivo e decisões

SaaS para freelancers e pequenos estúdios entregarem arquivos, organizarem revisões e liberarem originais após aprovação e pagamento. Clientes acessam um link no navegador; criadores pagam a assinatura da ferramenta. Público: designers, fotógrafos, editores de vídeo, produtores de áudio e outros criadores.

Flutter Web será a primeira interface entregue. A arquitetura deve admitir aplicativos desktop e mobile, mas esses builds terão validação própria em fases posteriores. NestJS, PostgreSQL e Prisma compõem o backend. R2 guarda objetos privados. Um worker como processo de servidor, com FFmpeg e ferramentas de imagem/PDF, produzirá prévias nos marcos posteriores. Containers não são requisito do ambiente de desenvolvimento. Esse worker é um processo de servidor; não pressupõe executar FFmpeg dentro de Cloudflare Workers.

O monorepo usa pnpm para os pacotes TypeScript e ferramentas Flutter para Dart. OpenAPI é o contrato compartilhado; tipos TypeScript não são importáveis diretamente pelo aplicativo Flutter.

O primeiro marco implementa somente cadastro, login, sessão, workspace e dashboard vazio. Está concluído neste PC, com testes automatizados e conferência manual confirmada pelo responsável em 09/10/2026. A primeira parte do marco 2 acrescenta clientes e projetos reais; consulte [o recorte 2A](marco-2a.md) para os critérios, endpoints e decisões implementados. Uploads e entrega de arquivos permanecem na parte 2B. O restante deste documento orienta os próximos marcos.

Decisão operacional: desenvolvimento sem Docker/Compose. PostgreSQL 18.6 nativo, API Node e Flutter executam localmente. O Windows principal não pode ser atualizado; não exigir troca de sistema ou versões antigas de Docker. A validação no segundo PC fica adiada até depois da organização no GitHub e de nova decisão do responsável. Ver [ADR 0001](adr/0001-desenvolvimento-nativo.md) e [progresso](progress.md).

## 2. Entregas e critérios de aceite

| ID | Entrega | Critérios observáveis |
|---|---|---|
| F01 | Conta e sessão | Cadastro cria usuário e workspace numa transação; e-mail normalizado e único; senha armazenada com Argon2id; login inválido tem erro genérico; logout invalida sessão; usuário A não acessa workspace B. |
| F02 | Clientes e projetos | Criador cadastra nome e e-mail do cliente, projeto, moeda BRL, saldo em centavos e revisões incluídas; valida saldo não negativo; lista paginada; arquivamento impede novas ações do cliente. |
| F03 | Upload privado | Upload direto assinado; tamanho e formato limitados; multipart; conclusão validada pelo servidor com metadados reais do objeto; objeto incompleto não aparece como pronto; reserva de cota liberada ao abortar. |
| F04 | Prévia | Imagem, vídeo, áudio e PDF têm derivado separado; original jamais é usado como fallback; processamento falho mostra erro e permite retry; ZIP/editável aparece com nome e tamanho e permite anexar prévia manual. |
| F05 | Compartilhamento | Token aleatório de alta entropia, hash no banco, expiração e revogação; token trocado por sessão de convidado; nenhuma chave de objeto original aparece na resposta do portal. |
| F06 | Comentários | Texto com limite; vídeo/áudio usa milissegundos; imagem usa coordenadas normalizadas; PDF usa página e posição; comentário sempre pertence a arquivo e versão; âncoras são validadas. |
| F07 | Versões e revisão | V1/V2/V3 imutáveis após publicação; nova versão precisa de nova aprovação; versões anteriores só para consulta; pedir ajustes registra uma rodada em transação, não uma rodada por comentário. |
| F08 | Aprovação | Cliente identificado confirma aprovação da versão publicada; registro inclui versão, sessão, identidade e horário; tentativa em versão desatualizada retorna conflito; clique repetido é idempotente. |
| F09 | Download | Backend exige versão aprovada, cobrança quitada ou dispensa explícita e projeto ativo; URL curta emitida somente após verificação; revogar bloqueia novas URLs; exceções ficam auditadas. |
| F10 | Pix | Criador conecta conta por OAuth; cobrança vinculada ao recebedor correto; webhook validado e estado consultado no provedor; valor, moeda, cobrança e recebedor conferidos; evento repetido não duplica quitação. |
| F11 | Operação beta | Cotas, retenção, recuperação, backups e alertas definidos; logs sem tokens ou URLs assinadas; falhas de worker e webhook podem ser reprocessadas. |

A marca d'água deve fazer parte do derivado de imagem/vídeo/PDF. Uma camada desenhada apenas no player pode ser removida por quem obtiver a mídia. A sobreposição com identidade do visitante é complementar. Para áudio, a prévia pode ser comprimida, limitada a um trecho ou conter vinheta conforme configuração. Nenhuma medida impede completamente a captura.

Limites propostos para o beta: 2 GiB por arquivo, 10 GiB por workspace, vídeo até 30 minutos, PDF até 100 páginas, 5 uploads simultâneos por workspace. São hipóteses operacionais configuráveis; não preços ou capacidade garantida. Prévia de vídeo até 720p; limites finais dependem de teste de CPU, memória e custo. Multipart básico entra no MVP; retomada após fechar o aplicativo fica para depois.

## 3. Regras de estado

Separar publicação, aprovação, cobrança e processamento. Não usar um único campo de status para tudo.

- Projeto: ACTIVE ou ARCHIVED.
- Versão: DRAFT, PUBLISHED ou SUPERSEDED; assets: UPLOADING, PROCESSING, READY ou FAILED.
- Revisão: OPEN ou RESOLVED; aprovação: registro da versão aprovada.
- Cobrança: OPEN, PAID, WAIVED ou REVERSED. Tentativas de pagamento têm estado próprio.
- Compartilhamento: válido quando não expirou nem foi revogado.

Regra de autorização proposta:

```text
canDownload = workspace ativo
  AND projeto ativo
  AND sessão convidada válida para esse projeto
  AND versão solicitada = versão publicada atual
  AND aprovação dessa versão existe
  AND (saldo = 0 OR cobrança = PAID OR cobrança = WAIVED)
  AND original validado e pronto
```

Publicar nova versão marca a anterior como SUPERSEDED e muda a versão atual numa transação. Não apaga pagamentos; invalida a elegibilidade dos novos arquivos até nova aprovação. Alterar saldo cria nova revisão de cobrança, auditada; uma tentativa paga de cobrança antiga não quita um novo saldo. Bloquear mudanças de saldo enquanto houver Pix pendente, ou cancelar a tentativa antes de substituir a cobrança.

Liberação manual significa registrar pagamento recebido externamente ou dispensar cobrança com motivo. Aprovação continua obrigatória; eventual override de aprovação deve ser uma operação separada, explícita e auditada.

Comentários podem ser vários dentro da mesma rodada. O botão “Pedir ajustes” encerra a coleta daquela rodada e registra a solicitação; clique repetido não consome outra rodada. Ultrapassar o contratado avisa criador e cliente; exige decisão do criador antes de abrir outra rodada.

Revogação não desfaz um download já realizado. URL R2 já assinada permanece utilizável até expirar: validade sugerida de 60 segundos; revogação imediata exigiria um gateway que revalide cada acesso.

## 4. Identidade, permissões e segurança

Criador autentica por sessão opaca, token aleatório com hash persistido. Na Web, cookie HttpOnly, Secure e SameSite, preferencialmente API e app sob a mesma origem. Mutations verificam origem e proteção CSRF. Para aplicativos nativos posteriores, o token será enviado em Authorization e guardado no armazenamento seguro do sistema. Não persistir token de login em localStorage.

Convidado abre /s/:token; o bootstrap troca o token por sessão limitada ao projeto e remove o segredo da barra de endereço. Referrer-Policy: no-referrer; sem scripts de terceiros nessa página; logs devem ocultar esse caminho. Quem possui o link pode iniciar acesso: para revisar ou aprovar, confirmar e-mail do cliente por código. Antes dessa confirmação, somente prévia conforme configuração do projeto. Aprovação com nome digitado não é tratada como assinatura eletrônica certificada.

Toda consulta autenticada filtra o workspace autorizado. Relações entre projeto, versão e arquivo são verificadas no servidor, incluindo IDs enviados pelo cliente. Usar 404 para recurso externo ao workspace. Login, envio de códigos e bootstrap têm rate limit. Códigos expiram e têm limite de tentativas; guardar hash, nunca código em claro.

Uploads são tratados como conteúdo não confiável: validar assinatura do formato, não só extensão; nomes de objeto gerados pelo servidor; parser isolado com CPU/memória/timeout; nenhum shell construído a partir de nomes enviados. Downloads usam Content-Disposition attachment. SVG/HTML não são renderizados diretamente; PDFs viram imagens de páginas para prévia. Arquivos entregáveis passam por verificação de malware antes da liberação, com estado e política de falha definidos.

## 5. Arquitetura e organização

```text
apps/flutter_app/         interface e testes Dart
apps/api/                 NestJS, guards, módulos e OpenAPI
apps/media_worker/        filas, FFmpeg e derivação de mídia
packages/database/        Prisma, migrations e cliente TS
packages/contracts/       OpenAPI e configuração de geração Dart
infra/                    decisões e configuração do ambiente nativo
docs/                     PRD, decisões e instruções operacionais
```

Módulos API: auth, workspaces, clients, projects, versions, uploads, sharing, comments, approvals, billing, downloads e audit. Flutter organizado por feature, com apresentação, aplicação e acesso a dados. Riverpod para estado, go_router para rotas e cliente HTTP configurado por ambiente; confirmar suporte Web dos plugins escolhidos.

Fluxo de mídia: API reserva cota e cria Asset → cliente envia partes ao bucket privado → API valida objeto e confirma upload → publica job → worker gera derivados → grava resultado → portal recebe estado READY. Jobs são idempotentes por asset e perfil de processamento. O marco inicial requer apenas PostgreSQL. Para o primeiro worker, priorizar fila persistente no PostgreSQL com bloqueio concorrente, retries limitados e registro de falhas; uma fila especializada poderá ser avaliada se medições justificarem. Não introduzir dependência de Redis local via Docker.

Persistência e fila não são uma transação única: ao introduzir jobs, usar outbox no PostgreSQL para entrega confiável e consumidor idempotente. Exclusão de objeto também passa por outbox para retry.

No marco de arquivos, usar um bucket R2 exclusivo de desenvolvimento/homologação para validar CORS, Range requests, assinatura e multipart. Testes unitários podem usar adapters locais sem dados reais, mas não comprovam compatibilidade com R2. Não exigir emulador S3 em container no PC; credenciais e custos do bucket serão preparados apenas ao iniciar esse marco. FFmpeg e ferramentas de mídia serão executados como processos nativos supervisionados, com limites e isolamento definidos antes de aceitar arquivos externos.

## 6. Contratos HTTP v1

Base: /api/v1. JSON usa camelCase, UUID string, datas ISO-8601 UTC, dinheiro inteiro em centavos e tamanhos em bytes como string decimal. Listas: {items, nextCursor}; limite máximo 100. Falhas: {error:{code,message,details?},requestId}. Nunca incluir stack em produção. 400 validação; 401 sessão inválida; 403 condição não atendida; 404 recurso não acessível; 409 estado concorrente; 413 limite; 429 excesso de tentativas.

| Método e caminho | Corpo ou resposta essencial |
|---|---|
| POST /auth/register | {name,email,password,workspaceName} → 201 {user,workspace}; cria cookie de sessão |
| POST /auth/login | {email,password} → 200 {user,workspace}; cookie |
| GET /auth/me | → {user:{id,name,email},workspace:{id,name}} |
| POST /auth/logout | → 204; revoga sessão e limpa cookie |
| GET /projects | ?cursor&limit&search → {items,nextCursor} |
| POST /clients | {name,email} → cliente |
| POST /projects | {clientId,title,balanceCents,includedRevisionRounds} → projeto |
| POST /projects/:id/versions | → versão rascunho com número sequencial |
| POST /versions/:id/uploads | {fileName,declaredMime,sizeBytes} → {assetId,uploadId,partSizeBytes} |
| POST /uploads/:id/parts | {partNumbers:[1,2]} → URLs assinadas e expiração |
| POST /uploads/:id/complete | {parts:[{partNumber,etag}]} → 202; valida metadados e agenda processamento |
| DELETE /uploads/:id | → 204; aborta multipart e libera reserva |
| POST /versions/:id/publish | {expectedProjectRevision} → versão publicada ou 409 |
| POST /projects/:id/shares | {expiresAt} → token exibido uma vez e link |
| DELETE /shares/:id | → 204; revoga link e sessões relacionadas |
| POST /guest/bootstrap | {token} → sessão limitada e resumo seguro |
| POST /guest/identity/request | {email} → 202 genérico |
| POST /guest/identity/verify | {code} → identidade confirmada |
| GET /guest/project | → versão atual, histórico permitido, previews e saldo; sem chaves originais |
| POST /guest/comments | {assetId,body,anchor} → comentário |
| POST /guest/revision-requests | {versionId,summary} + Idempotency-Key → rodada |
| POST /guest/approvals | {versionId,confirmed:true} + Idempotency-Key → aprovação |
| POST /guest/payments | {invoiceId} + Idempotency-Key → {paymentId,status,pixCopyPaste,qrCode,expiresAt} |
| GET /guest/payments/:id | → estado confirmado pelo backend |
| POST /guest/downloads | {assetId} → {url,expiresAt}; revalida todas as condições |
| POST /projects/:id/manual-settlement | {invoiceId,kind:"EXTERNAL_PAYMENT" ou "WAIVER",reason} → cobrança atualizada |
| POST /integrations/mercadopago/connect | → URL OAuth com state seguro |
| GET /integrations/mercadopago/callback | valida state e conecta conta |
| POST /webhooks/mercadopago | valida evento, persiste inbox e agenda reconciliação |

Idempotency-Key fica vinculada ao ator, operação e hash do payload. Reuso com payload diferente retorna 409. Não considerar ETag multipart como hash criptográfico do arquivo. A lista de partes é validada contra o upload criado pelo servidor.

Âncoras como união discriminada:

```json
{"kind":"TIME","timeMs":83000}
{"kind":"IMAGE_POINT","x":0.25,"y":0.60}
{"kind":"PDF_POINT","page":2,"x":0.25,"y":0.60}
{"kind":"GENERAL"}
```

TIME requer mídia temporal e 0 ≤ timeMs ≤ duração; x/y ficam entre 0 e 1; páginas entre 1 e total. Para aprovação, conferir identidade, versão atual, publicação e todos os assets válidos numa transação. Não emitir URL original no endpoint de prévia.

## 7. Schema Prisma do marco 1

Este schema cobre a fundação implementável agora. Não cria tabelas de pagamentos ou mídia vazias antes de as regras serem implementadas. A configuração de datasource/geração deve seguir a versão Prisma estável escolhida na implementação; a URL fica fora do código, via DATABASE_URL na configuração adequada à versão.

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
}

enum MemberRole {
  OWNER
  MEMBER
}

model User {
  id           String            @id @default(uuid()) @db.Uuid
  email        String            @unique @db.VarChar(254)
  name         String            @db.VarChar(120)
  passwordHash String
  createdAt    DateTime          @default(now()) @db.Timestamptz(3)
  updatedAt    DateTime          @updatedAt @db.Timestamptz(3)
  memberships WorkspaceMember[]
  sessions     Session[]
}

model Workspace {
  id        String            @id @default(uuid()) @db.Uuid
  name      String            @db.VarChar(120)
  createdAt DateTime          @default(now()) @db.Timestamptz(3)
  updatedAt DateTime          @updatedAt @db.Timestamptz(3)
  members   WorkspaceMember[]
  sessions  Session[]
}

model WorkspaceMember {
  workspaceId String     @db.Uuid
  userId      String     @db.Uuid
  role        MemberRole @default(MEMBER)
  createdAt   DateTime   @default(now()) @db.Timestamptz(3)
  workspace   Workspace  @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  user        User       @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@id([workspaceId, userId])
  @@index([userId])
}

model Session {
  id          String    @id @default(uuid()) @db.Uuid
  tokenHash   String    @unique @db.Char(64)
  userId      String    @db.Uuid
  workspaceId String    @db.Uuid
  expiresAt   DateTime  @db.Timestamptz(3)
  revokedAt   DateTime? @db.Timestamptz(3)
  createdAt   DateTime  @default(now()) @db.Timestamptz(3)
  user        User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  workspace   Workspace @relation(fields: [workspaceId], references: [id], onDelete: Cascade)

  @@index([userId, expiresAt])
  @@index([workspaceId])
}
```

Invariantes adicionais: normalizar email antes de gravar; sessão só é criada se houver membership; validar membership a cada uso; tratar unicidade concorrente como erro de cadastro; token aleatório com pelo menos 256 bits e hash SHA-256 no banco; expiração inicial de 7 dias, ajustável. O dashboard vazio retorna lista vazia sem inventar projetos persistidos.

### Evolução do banco por marco

| Marco | Entidades e restrições |
|---|---|
| 2 | Client(workspaceId), Project(workspaceId,clientId,currentVersionId,revision), ProjectVersion(projectId,number,state), Asset(versionId,objectKey,sizeBytes,kind,state), UploadSession e quota reservation. Unique(projectId,number), objectKey único. Relações cruzadas entre workspaces bloqueadas na API e, onde aplicável, FKs compostas. |
| 3 | ShareLink(tokenHash,expiresAt,revokedAt), GuestSession, IdentityChallenge, Comment(assetId,guestId,anchor), RevisionRound(versionId,number), Approval(versionId,guestId). Approval única por versão no fluxo de cliente único. WorkerJob/Outbox e AuditEvent. |
| 4 | Invoice(projectId,revision,amountCents,currency,state), PaymentAttempt(invoiceId,providerId,state), ProviderConnection(workspaceId,provider,encryptedCredentials), WebhookInbox(provider,eventId,payloadHash), DownloadGrant(assetId,guestId,expiresAt), IdempotencyRecord. Unique(provider,eventId) e Unique(provider,providerId); segredo OAuth cifrado com chave externa ao banco. |
| 5 | Subscription, UsageLedger, retenção, exclusão e recuperação. A assinatura SaaS não se confunde com o pagamento do cliente. |

CHECK constraints em migrations validam dinheiro não negativo, números de versão positivos e limites básicos de âncoras. Regras que dependem de outros registros são implementadas em transações e testes de concorrência. Este documento não equivale a uma migration já executada.

## 8. Pagamento: gate de viabilidade

Antes de implementar F10, fazer spike em sandbox: conectar vendedor por OAuth, criar Pix associado à conta dele, receber webhook, confirmar recebedor/valor e testar expiração, duplicação, cancelamento e estorno. Validar requisitos e disponibilidade de produção do provedor para esse modelo. Não assumir que basta cadastrar uma chave Pix.

Não armazenar dinheiro do serviço no banco como saldo sacável; registrar somente cobranças e conciliação. Comissão da plataforma sobre serviço fica fora do escopo inicial; assinatura é cobrada separadamente. A disponibilidade e as tarifas do provedor precisam ser confirmadas antes do lançamento. Stripe e cartão entram depois desse fluxo validado.

Webhook não libera download sozinho: evento é validado, persistido e reconciliado pela API do provedor. Conferir invoice, workspace, recebedor, moeda e valor exatos. Retorno do checkout não é evidência de pagamento. Estorno bloqueia novos grants; arquivos já baixados não podem ser recuperados.

## 9. Telas e comportamento responsivo

- Login/cadastro: erros junto ao campo, estado de envio, nenhuma senha em logs.
- Dashboard: nome do workspace, estado vazio, botão de novo projeto apenas quando funcionalidade existir; logout acessível.
- Projeto: cliente, saldo, versões, upload com progresso, falha e retry; publicar exige assets prontos.
- Portal: desktop com prévia e comentários lado a lado; celular com abas Prévia/Comentários/Versões; CTA de aprovação pede confirmação.
- Pagamento: Pix copia e cola e QR, expiração, atualização de status; CTA de download aparece após autorização real.

Validar 360, 768 e 1440 px; teclado e leitores de tela nos fluxos principais; estados loading/empty/error/success. Não exigir instalação para cliente. Interface pt-BR, dinheiro formatado em reais e horários apresentados no fuso local.

## 10. Roadmap por gates

| Marco | Saída verificável | Estimativa indicativa |
|---|---|---|
| 1 Fundação | Cadastro, login, me, logout, banco e dashboard vazio validados no PC principal; segundo PC adiado | 1–2 semanas |
| 2 Entrega privada | Projeto, upload multipart e download manual pelo criador; isolamento testado | 2 semanas |
| 3 Revisão | Derivados, portal convidado, identidade, comentários, versões e aprovação; beta manual | 3–4 semanas |
| 4 Pix | Spike aprovado, conta conectada e conciliação idempotente; testes de fraude de estado | 2–3 semanas |
| 5 Beta comercial | Cotas, backups, retenção, assinatura, observabilidade e pilotos | 2–3 semanas |

Faixa de 10–14 semanas é uma estimativa, não compromisso; desenvolvimento parcial e aprendizado podem ampliar o prazo. Avançar por critérios de saída. Se Pix direto não for viável, manter beta com quitação manual explicitamente identificada e revisar o plano comercial.

Fora do MVP: comparação visual de versões, edição colaborativa ao vivo, equipes com permissões avançadas, apps publicados nas lojas, assinatura eletrônica certificada, todos os codecs, Stripe e retomada persistente de uploads após fechar navegador.

## 11. Verificação e operação

Testes prioritários: isolamento A/B; sessão expirada/revogada; CSRF; cadastro concorrente; token revogado; nova versão invalida aprovação; comentário em asset alheio; download sem aprovação/pagamento; webhook duplicado ou com valor/recebedor divergente; retries de worker; cota concorrente e upload interrompido.

Marco 1: lint/typecheck/build API, testes unitários de auth, integração com PostgreSQL real, flutter analyze, flutter test e build web. Teste manual de cadastro → recarregar → me → logout → rota protegida. Não considerar mocks como validação de banco.

Produção: backups com restauração testada; secrets separados; logs estruturados/requestId; métricas de falhas de upload, tempo de processamento, backlog e webhooks pendentes. Política de retenção deve ser publicada antes do beta comercial; sugestão inicial: avisar antes de exclusão e oferecer janela de recuperação definida, medindo seu custo.

Não fixar preços agora: medir GB armazenados, minutos processados, operações, suporte e retenção. Original e derivados consomem armazenamento separado.

## 12. Trabalhar em casa e no serviço

Organizar e publicar o código em repositório privado na conta GitHub louizricard. A instalação e validação no segundo PC estão adiadas por decisão do responsável; quando retomadas, clonar a versão publicada. Versionar lockfiles, migrations, .env.example, versão Flutter e versão Node. Cada PC tem .env próprio com credenciais locais. Banco de desenvolvimento não é compartilhado; seeds reproduzem dados de teste. Nunca colocar arquivos reais de clientes ou dumps no Git.

Antes de começar: git status e git pull --ff-only. Ao terminar: conferir git diff, executar checks do marco, adicionar somente arquivos revisados, commit e push. Se houver mudança local antes de pull, resolver com commit ou stash consciente; não fazer reset destrutivo. Não trabalhar simultaneamente na mesma branch sem sincronizar. Usar branches curtas por tarefa e deixar um registro docs/progress.md com etapa concluída, comandos e pendências.

## 13. Primeiro prompt para o Codex

Copie o bloco abaixo no Codex dentro de uma pasta vazia ou do repositório privado escolhido. Este prompt implementa apenas o marco 1.

```text
Você vai implementar o marco 1 do Cofre de Entregáveis, um SaaS para criadores em geral. Use Flutter Web + NestJS/TypeScript + PostgreSQL/Prisma num monorepo. Leia primeiro AGENTS.md e inspecione os arquivos existentes. Preserve trabalho existente. Se já houver projeto, adapte; não sobrescreva nem faça reset destrutivo.

Objetivo desta entrega: cadastrar criador, criar workspace pessoal, autenticar, consultar /auth/me, encerrar sessão e exibir dashboard vazio protegido. Não implementar upload, processamento, portal cliente, pagamentos ou assinatura nesta etapa.

1. Antes das mudanças, apresente um plano curto. Verifique ferramentas disponíveis e as versões estáveis suportadas nas documentações oficiais. Fixe versões e lockfiles; não use dependências com versões arbitrárias. Se faltar Flutter ou PostgreSQL nativo, prepare o código e informe precisamente o que não pôde executar; não alegue validação. Docker/Compose não faz parte deste desenvolvimento.

2. Estruture apps/flutter_app, apps/api, packages/database, packages/contracts, infra e docs. pnpm workspace controla TypeScript; Flutter mantém pubspec e pubspec.lock. Configure Node e Flutter com versões documentadas. PostgreSQL 18.6 nativo com comandos de início/parada/status, dados persistentes locais e cluster separado para testes. No Windows, usar scripts/postgres-local.ps1; health/readiness devem continuar distintos. Não exigir R2, Mercado Pago ou Redis.

3. Crie schema Prisma com User(id UUID, email único normalizado, name, passwordHash, timestamps), Workspace(id UUID,name,timestamps), WorkspaceMember(workspaceId,userId,role OWNER/MEMBER, chave composta), Session(id UUID,tokenHash SHA256 único,userId,workspaceId,expiresAt,revokedAt,createdAt). Configure datasource conforme a versão Prisma escolhida. Gere migration real; não usar db push como substituto da migration. Cadastro cria user, workspace e membership OWNER atomicamente.

4. API /api/v1: POST /auth/register {name,email,password,workspaceName}; POST /auth/login {email,password}; GET /auth/me; POST /auth/logout; GET /projects retorna {items:[],nextCursor:null} nesta etapa sem dados fictícios. Registro retorna 201; login/me 200; logout 204. /me retorna user e workspace. Guard protege /me e /projects. Use Argon2id, DTOs e validação; senha entre 12 e 128 caracteres, email até 254, nomes até 120. Não retornar passwordHash/tokenHash. Tratar email duplicado, concorrência e login inválido. Rate limit em auth.

5. Sessão opaca aleatória de 256 bits, somente hash no banco, expira em 7 dias configuráveis. Na Web, cookie HttpOnly, Secure em produção, SameSite=Lax e política same-origin. Revogar sessão no logout, limpar cookie; validar expiração e membership no guard. Não usar localStorage para token. Adicionar proteção CSRF e validação de Origin nas mutations; documentar comportamento de desenvolvimento e produção. Configure proxy/same-origin no desenvolvimento ou CORS restrito e envio explícito de credentials. Não permitir origem wildcard com credentials.

6. Flutter pt-BR: cadastro, login, splash/verificação de sessão e dashboard vazio com nome do workspace e logout. Riverpod + go_router; serviços desacoplados da UI. Restaurar sessão pelo /me após recarregar; encaminhar 401 para login. Estados loading, erro e sucesso. Não mostrar botões funcionais de recursos ainda inexistentes. Layout em 360/768/1440 px, teclado e validação acessíveis. Não importar dart:io no código Web comum.

7. Publicar contrato OpenAPI dos endpoints e estratégia de geração de cliente Dart; evitar contratos TS duplicados à mão em Dart sem fonte de verdade. Erros {error:{code,message,details?},requestId}; sem stack em produção. Healthcheck distinto de readiness do banco. Logs não incluem senha, cookies ou tokens.

8. README com pré-requisitos e comandos exatos: instalação, banco, migration, API e Flutter Web. Um comando sobe API após preparo documentado; documentar banco e Flutter separadamente. .env.example sem segredos; .gitignore exclui .env, uploads, dumps e builds. Incluir instruções Windows/Linux para alternar PCs via Git e docs/progress.md com estado da entrega. Não criar repositório remoto nem publicar sem solicitação.

9. Testes: cadastro/login/me/logout; senha incorreta; email duplicado; sessão expirada/revogada; ausência de membership; proteção CSRF/origin; isolamento entre duas contas. Integração usa PostgreSQL de teste e migrations, sem destruir banco de desenvolvimento. Flutter testa formulários, sessão e navegação. Rode lint, typecheck, API build/test, flutter analyze/test/build web conforme ferramentas disponíveis. Liste resultados reais e limitações.

10. Ao concluir, resuma arquivos, funcionamento, comandos para rodar e checks. Não faça commit ou push automaticamente. Não implemente o restante do produto. Se uma decisão técnica estiver aberta, escolha uma opção simples, explique no README e prossiga; pergunte apenas por bloqueio real.
```

## 14. Fontes técnicas consultadas

Consultadas em 08/10/2026. As decisões de produto e os limites são propostas deste PRD; as fontes abaixo sustentam capacidades e requisitos dos fornecedores.

- Flutter Web: https://docs.flutter.dev/platform-integration/web
- Flutter Web FAQ: https://docs.flutter.dev/platform-integration/web/faq
- R2, URLs assinadas: https://developers.cloudflare.com/r2/api/s3/presigned-urls/
- R2, uploads: https://developers.cloudflare.com/r2/objects/upload-objects/
- Mercado Pago, requisitos Split 1:1: https://www.mercadopago.com.br/developers/pt/docs/split-payments/split-1-1/prerequisites
- Mercado Pago, configuração OAuth: https://www.mercadopago.com.br/developers/pt/docs/split-payments/split-1-1/integration-configuration/create-configuration
- Mercado Pago, integração: https://www.mercadopago.com.br/developers/pt/docs/split-payments/split-1-1/integration-configuration/integrate-marketplace

Prisma, NestJS e plugins Flutter terão versões e sintaxe verificadas na implementação. O schema aqui é uma base de desenho e ainda não foi validado com Prisma CLI.

## 15. Histórico de decisões

- 08/10/2026 — v1.1: PRD inicial e recorte do marco 1.
- 09/10/2026 — v1.2: validação manual do marco 1 confirmada; PostgreSQL nativo adotado como padrão; Docker/Compose retirado do desenvolvimento; teste no segundo PC adiado; organização e publicação privada no GitHub autorizadas.

- 09/10/2026 — v1.3: marco 2 dividido em 2A (clientes/projetos, edição, busca, paginação e arquivamento) e 2B (arquivos); 2A implementado com FK composta, saldo BRL em centavos e controle otimista de edição.
