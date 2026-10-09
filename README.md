# Cofre de Entregáveis — marco 1

Monorepo com Flutter Web, NestJS/TypeScript e PostgreSQL/Prisma. Cadastro cria conta, workspace pessoal, membership OWNER e sessão na mesma transação. Login restaura a sessão por cookie; o dashboard protegido exibe o workspace e a lista vazia real. Marco 1 validado com testes automatizados e conferência manual do responsável.

[PRD](docs/prd.md) · [Progresso](docs/progress.md) · [Ambiente Windows](docs/windows-sem-docker.md) · [Contribuição](CONTRIBUTING.md)

Não há upload, processamento, portal de cliente, pagamentos nem assinatura. Não é necessário configurar Redis, R2 ou Mercado Pago.

## Pré-requisitos e versões

| Ferramenta | Versão fixada |
|---|---|
| Node.js LTS | 24.21.0 (`.node-version`, `.nvmrc`; linha compatível >=24.19 <25) |
| pnpm | 11.25.0 (`packageManager`) |
| Flutter stable | 3.47.6 (`.fvmrc`) |
| Dart incluído no Flutter | 3.13.5 |
| NestJS | 12.1.2 |
| TypeScript | 5.9.3 |
| Prisma ORM / adapter-pg | 7.10.0 |
| PostgreSQL nativo | 18.6 |

Dependências diretas usam versões exatas. `pnpm-lock.yaml` e `apps/flutter_app/pubspec.lock` registram as transitivas. Prisma 7 continua suportado; não foi adotado Prisma 8 RC. TypeScript 5.9 atende Prisma 7 e compilou com Nest 12. As fontes e os resultados efetivos estão em [docs/versions.md](docs/versions.md) e [docs/progress.md](docs/progress.md).

Instale Node, Flutter, PostgreSQL nativo nas versões acima e Git. Docker/Compose não é utilizado neste desenvolvimento. Ative pnpm 11.25.0, por exemplo com `npm install --global pnpm@11.25.0`. Verifique `node --version`, `pnpm --version`, `flutter --version` e `postgres --version` (ou o caminho do executável portátil).

Neste computador foi preparado um SDK portátil ignorado pelo Git em `.tools/flutter`. No PowerShell, pode usar `.\.tools\flutter\bin\flutter.bat` a partir da raiz em lugar de `flutter`; não copie esse SDK pelo Git.

## Ambiente de desenvolvimento

O padrão é [PostgreSQL nativo no Windows](docs/windows-sem-docker.md), iniciado por scripts locais e sem serviço global. Essa escolha foi validada neste PC e registrada na [ADR 0001](docs/adr/0001-desenvolvimento-nativo.md). O segundo PC será preparado somente quando o responsável retomar essa etapa.

## Preparação

Repositório privado: [Louizricard/cofre-entregaveis](https://github.com/Louizricard/cofre-entregaveis). Para uma instalação nova, autentique seu GitHub e clone:

```sh
git clone https://github.com/Louizricard/cofre-entregaveis.git
cd cofre-entregaveis
```

Na raiz do projeto:

```sh
pnpm install --frozen-lockfile
```

Copie o exemplo (escolha o comando do seu sistema):

```powershell
Copy-Item .env.example .env
```

```sh
cp .env.example .env
```

Edite `.env`: escolha uma senha local e preencha `POSTGRES_PASSWORD` e a mesma senha em `DATABASE_URL`. Escape caracteres reservados da senha na URL (percent-encoding). O exemplo não contém credenciais utilizáveis. Mantenha `APP_ORIGIN=http://localhost:8080`, `PORT=3000` e `NODE_ENV=development`.

### Banco local, separado da API

```sh
pnpm db:start
pnpm db:generate
pnpm db:validate
pnpm db:migrate
```

O comando `db:start` usa PowerShell no Windows. Prepare primeiro o runtime PostgreSQL conforme o guia. O banco fica em localhost:5432, com dados persistentes em `.tools/postgresql/dev-data`. Consulte `pnpm db:status` e pare com `pnpm db:stop`; esses comandos não apagam dados. Não exclua a pasta de dados.

`db:migrate` usa **prisma migrate deploy** e a migration SQL versionada; não usa `db push`. Em um Linux futuro, prepare PostgreSQL nativo equivalente e use os mesmos comandos Prisma; esse ambiente ainda não foi validado.

A migration inicial foi gerada por Prisma CLI com:

```sh
pnpm --filter @cofre/database exec prisma migrate diff --from-empty --to-schema prisma/schema.prisma --script --output prisma/migrations/20261008000100_initial/migration.sql
```

Esse comando explica a origem do arquivo; não o execute para sobrescrever migrations já aplicadas. Para futuras mudanças, crie uma nova migration com `pnpm --filter @cofre/database exec prisma migrate dev --name nome_da_mudanca` no ambiente de desenvolvimento.

### API — um comando após o preparo

```sh
pnpm dev:api
```

Compila os pacotes e inicia em http://localhost:3000/api/v1, ouvindo apenas loopback. Configuração é carregada da `.env` da raiz independentemente do diretório corrente. Para encerrar, Ctrl+C.

- `GET /api/v1/health`: processo vivo, sem depender do banco.
- `GET /api/v1/ready`: consulta o banco; retorna 503 se indisponível.
- `GET /api/v1/openapi.json`: contrato completo em JSON.

### Flutter Web — outro terminal

```sh
cd apps/flutter_app
flutter pub get --enforce-lockfile
flutter run -d chrome --web-hostname localhost --web-port 8080 --dart-define=API_ORIGIN=http://localhost:3000
```

Use **localhost** em ambos os serviços, sem misturar 127.0.0.1. A API permite CORS somente para `APP_ORIGIN`, com credentials explícitas no BrowserClient. A interface é pt-BR e contém cadastro, login, splash com recuperação de erro e dashboard vazio. Ao recarregar, chama `/auth/me`; 401 volta ao login.

## Segurança e decisões

- Senhas de 12–128 caracteres; nomes não vazios de até 120; e-mail normalizado com trim + lowercase e até 254. A senha não é aparada. API valida DTOs, rejeita campos inesperados e nunca serializa hashes.
- Argon2id: 64 MiB, 3 iterações, paralelismo 1. Login inexistente também verifica um hash para reduzir diferenças de tempo.
- Token opaco: 32 bytes criptograficamente aleatórios, base64url. Apenas SHA-256 é persistido. Expiração absoluta de 7 dias, ajustável por `SESSION_DAYS` (1–30); não há renovação deslizante.
- Guard verifica expiração, revogação e membership em cada requisição. O workspace vem da sessão, nunca de um parâmetro do navegador. Cadastro concorrente de e-mail gera 409 e rollback completo.
- Login escolhe a primeira membership por data/ID. O marco cria apenas um workspace pessoal; seleção e criação de outros workspaces ficam fora do escopo.
- Cookies sem Domain, Path=/, HttpOnly e SameSite=Lax. Produção usa Secure e prefixo `__Host-`. Não há token de sessão no corpo da resposta, no Dart, em localStorage ou em Authorization.
- CSRF usa double-submit aleatório de 256 bits: `GET /auth/csrf` define cookie HttpOnly e retorna `csrfToken`; o cliente o mantém somente em memória e envia `X-CSRF-Token`. Todas as mutations exigem cookie/header iguais, JSON e **Origin exata**, incluindo cadastro/login/logout. Origin ausente, null ou externa retorna 403. O prefixo `__Host-` impede cookies de domínio em produção. O browser envia Origin; clientes CLI de teste precisam enviá-la explicitamente.
- Logout revoga no banco, limpa cookies e retorna 204. É idempotente mesmo para sessão expirada/ausente, mas ainda exige CSRF/Origin. Se houver falha de rede/banco, a UI não finge ter encerrado a sessão.
- Throttler: 10/minuto/IP por rota de login/cadastro; demais rotas auth 60/minuto. Estado em memória, adequado a **uma instância**. Sem Redis neste marco. Não confia em X-Forwarded-For. Atrás de proxy, o limite é agregado pelo IP do proxy; antes de escalar, configure limite no ingress e proxies confiáveis explicitamente.
- Logs contêm apenas requestId gerado, método e status. Não registram corpos, headers, cookies, senhas ou tokens. Erros seguem `{error:{code,message,details?},requestId}`, sem stack; validação retorna nomes de campos, sem valores.
- Não há limpeza automática de sessões antigas neste marco. A expiração sempre é validada, mesmo enquanto os registros permanecem no banco.

### Produção: mesma origem

Defina `NODE_ENV=production`, `APP_ORIGIN=https://seu-dominio` e credenciais reais por ambiente seguro. Sirva o Flutter e encaminhe `/api/v1/` à API por reverse proxy **na mesma origem HTTPS**. O proxy deve preservar Origin e repassar Set-Cookie. Não há CORS habilitado em produção. Gere o Flutter sem API_ORIGIN (URLs relativas):

```sh
cd apps/flutter_app
flutter build web --release
```

O servidor estático deve servir `index.html` nas rotas do app. O roteador usa a estratégia hash padrão, sem exigir URLs limpas. Configure TLS e headers de segurança no ingress. A API ouve loopback; o exemplo presume proxy no mesmo host. Não foram feitos deploy, configuração de domínio ou publicação.

## Contrato e geração Dart

Fonte: DTOs e decorators Nest. `packages/contracts/openapi.json` é o contrato publicado no repositório e servido na API. Não existem interfaces TypeScript copiadas manualmente para modelos Dart.

```sh
pnpm contracts:generate
pnpm contracts:check
```

O primeiro comando exporta OpenAPI sem conectar ao banco e gera `lib/generated/api.g.dart` com modelos, limites dos campos, paths e métodos. O segundo compara o contrato e o cliente com suas fontes e falha se houver drift, sem alterá-los. O gerador local suporta o subconjunto OpenAPI usado neste marco e falha em schemas desconhecidos; sua ampliação ou substituição por OpenAPI Generator deve acompanhar contratos futuros. Transporte HTTP, cookies, CSRF e tratamento de falhas ficam em `data/auth_repository.dart`.

## Checks

```sh
pnpm db:generate
pnpm db:validate
pnpm lint
pnpm typecheck
pnpm build
pnpm test
pnpm contracts:check
```

```sh
cd apps/flutter_app
flutter analyze
flutter test
flutter build web --release
```

Os testes de API sem banco exercitam tokens, cookies, CSRF/Origin, Argon2id, DTOs, health e rejeição de acesso anônimo. Eles **não substituem** os testes de persistência.

### Integração em PostgreSQL isolado

No Windows, com o runtime portátil preparado:

```powershell
pnpm.cmd test:integration:local
```

O script cria/inicia um cluster separado na porta 5433, define as credenciais somente para o processo de teste e chama `pnpm test:integration`. Para parar esse cluster:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/postgres-local.ps1 stop -TestDatabase
```

O runner recusa hosts externos, porta diferente de 5433 ou banco diferente de cofre_test; cria um schema UUID exclusivo, aplica migrations e só então roda a suíte. Não executa reset, drop ou truncate. Schemas são preservados no cluster de teste para diagnóstico; não usa o banco de desenvolvimento. Para outro ambiente nativo, configure explicitamente `TEST_DATABASE_URL` para localhost:5433/cofre_test antes de executar `pnpm test:integration`.

A suíte cobre cadastro/login/me/logout, e-mail duplicado e concorrente, senha incorreta, sessão expirada/revogada, membership ausente, CSRF/Origin, duas contas isoladas e rate limit. Os testes Flutter usam serviço fake para formulários/navegação e MockClient para transporte; não comprovam o fluxo browser + PostgreSQL ponta a ponta. Consulte o estado executado em [docs/progress.md](docs/progress.md).

## Alternar PCs via Git (Windows/Linux)

A validação no segundo PC está **adiada**. Quando retomada:

1. Clone o repositório privado do GitHub autenticado como colaborador.
2. Instale as versões fixadas e execute `pnpm install --frozen-lockfile`.
3. Crie sua própria `.env`, prepare PostgreSQL nativo local, gere o cliente Prisma e aplique migrations. Em Flutter, use `flutter pub get --enforce-lockfile`.
4. Antes de começar trabalho, confira `git status` e use `git pull --ff-only` com a árvore limpa. Preserve alterações com commit ou stash consciente; não use reset destrutivo.
5. Git transporta código, migrations, contratos e lockfiles. Senhas, bancos, SDKs, builds e arquivos reais de clientes não são enviados. Dados exigem backup/restauração explícitos fora do repositório.

Consulte [CONTRIBUTING.md](CONTRIBUTING.md) para branches, revisão e checks.

## Pastas

```text
apps/api/          API Nest, DTOs, guards, serviços e testes
apps/flutter_app/  UI pt-BR, serviços, estado, rotas e testes
packages/database/ schema Prisma, migration e cliente TS
packages/contracts/OpenAPI versionado
infra/             documentação da infraestrutura nativa
scripts/           geração Dart e runner de integração
docs/              decisões, fontes e estado dos checks
```
