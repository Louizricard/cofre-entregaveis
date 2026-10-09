# Versões e fontes

Consulta em 08/10/2026. Foram consultadas as documentações oficiais e os manifests dos registros; não se deduziu uma versão apenas pelo calendário.

- Node 24 é a linha LTS adotada; local `node --version`: 24.21.0. O wrapper pnpm do ambiente usa Node 24.19.0; ambos são da linha suportada. [Ciclo oficial](https://nodejs.org/en/about/previous-releases).
- pnpm 11.25.0 já disponível no ambiente, fixado em packageManager. [Instalação](https://pnpm.io/installation), [configuração](https://pnpm.io/settings). `allowBuilds` autoriza somente Prisma/engines e Argon2; telemetria de Scarf e postinstall do Nest não são executados.
- Nest 12.1.2 confirmado no registro npm; [guia Nest 12](https://docs.nestjs.com/migration-guide) descreve ESM e requisitos Node. Projeto usa ESM e decorators compilados pelo tsc, com TypeScript 5.9.3 (release publicada confirmada no registro).
- Prisma 7.10.0 confirmado no registro. [Status](https://www.prisma.io/docs/orm/release-status), [requisitos v7](https://www.prisma.io/docs/orm/v7/reference/system-requirements), [migração v7](https://www.prisma.io/docs/orm/v6/more/upgrades/to-v7). Datasource URL em prisma.config.ts; driver adapter PostgreSQL; geração prisma-client com imports .js para build ESM.
- PostgreSQL 18.6, minor corrente da linha 18 segundo a [política oficial](https://www.postgresql.org/support/versioning/), suportada até 2030. Binários Windows EDB 18.6 executados nativamente e validados com migrations e integração em 09/10/2026. Docker/Compose foi retirado do desenvolvimento.
- Flutter 3.47.6 stable e Dart 3.13.5 confirmados no [manifest oficial Windows](https://storage.googleapis.com/flutter_infra_release/releases/releases_windows.json) e no [arquivo de versões](https://docs.flutter.dev/install/archive). Ref do Flutter: 5fc346839b5d0eef006ed8404392afb4dfae428d. SDK portátil foi clonado nesse tag, sem alteração global.
- Pacotes Dart confirmados pelo pub.dev: [flutter_riverpod 3.4.3](https://pub.dev/packages/flutter_riverpod/versions/3.4.3), [go_router 18.0.2](https://pub.dev/packages/go_router/versions/18.0.2), [http 1.6.0](https://pub.dev/packages/http/versions/1.6.0).
- Demais dependências npm foram consultadas via registry.npmjs.org/npm view e fixadas em package.json. As transitivas têm integridade registrada no pnpm-lock.yaml; Dart usa pubspec.lock gerado pelo SDK.

Atualizações posteriores devem ser deliberadas, regenerar lockfiles e repetir os checks. O comando install não usa tags latest para as dependências da aplicação.

- Fonte adicional: [cupertino_icons 2.0.0](https://pub.dev/packages/cupertino_icons/versions/2.0.0), confirmada no pub.dev e incluída após diagnóstico do compilador.
