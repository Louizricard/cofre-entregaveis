# Fluxo de desenvolvimento

O ambiente principal é Windows com PostgreSQL 18.6 nativo. Docker/Compose não faz parte do desenvolvimento. Consulte o [README](README.md), o [guia Windows](docs/windows-sem-docker.md) e o [PRD](docs/prd.md).

## Antes de alterar

1. Confira `git status`. Preserve alterações locais; nunca use reset destrutivo para resolver conflitos.
2. Com a árvore limpa, sincronize `main` com `git pull --ff-only`.
3. Crie uma branch curta por mudança, por exemplo `feat/clientes-projetos` ou `fix/sessao`.
4. Consulte o [progresso](docs/progress.md) e mantenha o trabalho dentro do marco autorizado.

## Verificar uma entrega

Na raiz:

```powershell
pnpm.cmd install --frozen-lockfile
pnpm.cmd db:generate
pnpm.cmd db:validate
pnpm.cmd lint
pnpm.cmd typecheck
pnpm.cmd test
pnpm.cmd contracts:check
pnpm.cmd test:integration:local
```

Para mudanças Flutter, execute analyze, test e build web com o SDK fixado em .fvmrc. Se os DTOs mudarem, use `pnpm contracts:generate` e versione OpenAPI e o cliente Dart gerado juntos.

Migrations são incrementais. Não altere migrations aplicadas, não use db push e não teste com o banco de desenvolvimento. Não reformate o cliente Dart gerado manualmente.

## Commit e revisão

- Use commits descritivos: `feat:`, `fix:`, `docs:`, `chore:` ou `test:`.
- Revise `git diff --cached` e `git status --short` antes de enviar.
- Inclua código, migrations, contratos, lockfiles e documentação afetada.
- Nunca inclua .env, credenciais, dados PostgreSQL, dumps, SDKs, node_modules, builds ou arquivos de clientes.
- Abra PR para mudanças posteriores à fundação. Descreva o comportamento entregue e os checks realmente executados.
- Não faça force-push em main. Não presuma autorização para deploy, publicar repositório, commit ou push em tarefas futuras.

## Outro PC

O teste no segundo PC foi adiado pelo responsável. Quando retomado, clone do GitHub, instale as versões fixadas, crie uma .env própria e inicialize um PostgreSQL local separado. Git sincroniza código, não dados nem credenciais.
