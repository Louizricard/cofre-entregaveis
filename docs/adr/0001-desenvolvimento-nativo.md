# ADR 0001 — Desenvolvimento nativo, sem Docker

Data: 09/10/2026. Estado: aceito pelo responsável.

## Contexto

O computador principal usa Windows 10 IoT Enterprise LTSC 2021, 21H2/build 19044. O Docker Desktop atual recusa esse sistema. O responsável não pode atualizar o Windows e definiu que Docker/Compose não será usado neste desenvolvimento.

## Decisão

Adotar PostgreSQL 18.6 nativo e processos locais Node/Flutter. No Windows, usar o ZIP oficial EDB em .tools/postgresql/runtime e scripts/postgres-local.ps1 para iniciar, parar, consultar status e rodar integração.

Persistir desenvolvimento e testes em clusters distintos, portas 5432 e 5433. Exigir autenticação SCRAM e escuta apenas em localhost. Prisma continua responsável pelas migrations e pelo acesso ao banco.

Remover Compose das configurações ativas. No Linux futuro, usar PostgreSQL nativo 18.6 e credenciais locais equivalentes; essa operação e o segundo PC ainda não foram validados.

## Consequências

- O marco 1 não depende de virtualização, Docker, Redis, R2 ou serviços pagos.
- SDKs, runtime, bancos e senhas ficam fora do Git. Dados persistem localmente; .tools/postgresql/dev-data não é cache descartável.
- A aplicação mantém PostgreSQL/Prisma; não foi substituído por SQLite ou por mocks.
- O script não modifica a senha de um cluster existente ao editar .env. Mudanças de senha precisam ser feitas explicitamente no PostgreSQL e na configuração.
- Recursos de mídia futuros também não podem exigir containers no PC. Armazenamento de desenvolvimento e worker terão configuração própria conforme o PRD.
- A implantação de produção permanece uma decisão separada, sem publicação nesta etapa.
