# Windows sem Docker

O PC de desenvolvimento usa Windows 10 IoT Enterprise LTSC 2021, 21H2/build 19044. O instalador Docker Desktop atual exige build 19045 ou superior no Windows 10 e recusou essa instalação.

Padrão adotado para o desenvolvimento: PostgreSQL 18.6 nativo, extraído dentro de `.tools/postgresql/runtime`, sem serviço instalado no Windows. Docker/Compose foi retirado das configurações ativas por decisão do responsável. Não altera banco, schema ou arquitetura da aplicação.

Fontes: [requisitos Docker](https://docs.docker.com/desktop/setup/install/windows-install/), [PostgreSQL para Windows](https://www.postgresql.org/download/windows/), [binários EDB](https://www.enterprisedb.com/download-postgresql-binaries).

## Preparar uma instalação Windows

O segundo PC Windows foi preparado em 11/10/2026, com SDKs portáteis e banco independente. As instruções abaixo se aplicam a novas instalações.

Na raiz, baixe o ZIP **Windows x86-64 18.6** pelo link de binários EDB. Extraia para `.tools/postgresql/runtime`; deve existir `runtime/pgsql/bin/pg_ctl.exe`. O binário já foi preparado e validado neste PC. Não use instaladores antigos do Docker para contornar a checagem do Windows.

Prepare `.env` conforme o README. O script usa POSTGRES_PASSWORD na criação inicial; DATABASE_URL deve ter a mesma senha. Tudo em `.tools`, incluindo dados e arquivos de senha locais, é ignorado pelo Git.

## Rodar

Na raiz do projeto, PowerShell:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/postgres-local.ps1 start
pnpm.cmd db:migrate
pnpm.cmd dev:api
```

Em outro terminal:

```powershell
cd apps/flutter_app
..\..\.tools\flutter\bin\flutter.bat run --no-web-resources-cdn -d web-server --web-hostname localhost --web-port 8080 --dart-define=API_ORIGIN=http://localhost:3000
```

Abra http://localhost:8080. Depois de reiniciar o Windows, inicie banco, API e Flutter novamente. Os dados do banco ficam persistidos em `.tools/postgresql/dev-data`; não apague essa pasta. Não execute outra instância de PostgreSQL nas mesmas portas.

## Testes isolados

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/postgres-local.ps1 test
```

Cria/inicia outro cluster, em `.tools/postgresql/test-data`, porta 5433, banco cofre_test e senha aleatória própria. O runner aplica migrations em schema exclusivo por execução. Não usa/resetta o banco de desenvolvimento.

## Parar

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/postgres-local.ps1 stop
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/postgres-local.ps1 stop -TestDatabase
```

A parada preserva os dados. Para diagnóstico, use `status` (com `-TestDatabase` para testes) e os logs `.tools/postgresql/dev.log` e `test.log`. Não modifique POSTGRES_PASSWORD esperando que a senha de um cluster já criado mude automaticamente.
