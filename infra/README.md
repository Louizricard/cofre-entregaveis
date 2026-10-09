# Infraestrutura de desenvolvimento

Decisão de 09/10/2026: desenvolvimento sem Docker/Compose.

- PostgreSQL 18.6 nativo, com runtime em `.tools/postgresql/runtime`.
- Desenvolvimento: localhost:5432/cofre; cluster em `.tools/postgresql/dev-data`.
- Testes: localhost:5433/cofre_test; cluster e senha separados, schema por execução.
- API Node/Nest em localhost:3000; Flutter Web em localhost:8080.
- Os scripts não instalam serviço Windows nem exigem atualização do sistema.

Operação: [guia Windows](../docs/windows-sem-docker.md). Decisão e limites: [ADR 0001](../docs/adr/0001-desenvolvimento-nativo.md).

As configurações Compose iniciais foram retiradas por decisão do responsável. Deploy e infraestrutura de produção serão definidos em marcos posteriores.
