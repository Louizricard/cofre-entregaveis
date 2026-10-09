# Marco 2A — clientes e projetos

Esta entrega organiza o trabalho do criador antes da entrega de arquivos. Mantém as versões e lockfiles do marco 1 e usa PostgreSQL nativo.

## Fluxo da interface

1. Entre no workspace e abra **Clientes → Novo cliente**. Nome e e-mail são obrigatórios.
2. Abra **Projetos → Novo projeto**, informe título, selecione um cliente cadastrado, saldo em reais e revisões incluídas.
3. Edite um projeto ativo ou os dados de um cliente clicando no registro.
4. Confirme **Arquivar** para manter o projeto na consulta **Arquivados**, somente para leitura.
5. Use a busca e **Carregar mais**. O seletor de clientes também permite busca e paginação.

O saldo é um valor cadastrado pelo criador; não representa cobrança, pagamento recebido nem integração financeira. A moeda desta etapa é BRL. Não há exclusão nem restauração de projetos arquivados. Clientes podem ser editados, mas não são arquivados nesta etapa.

## API e decisões

Todos os endpoints abaixo exigem sessão e membership. Mutações exigem a mesma proteção CSRF/Origin da autenticação.

| Método e caminho após /api/v1 | Resultado |
|---|---|
| GET /clients | Lista paginada de clientes |
| POST /clients | Cria cliente, 201 |
| PATCH /clients/{id} | Atualiza nome e e-mail, 200 |
| GET /projects | Lista paginada de projetos |
| GET /projects/{id} | Consulta projeto, 200 |
| POST /projects | Cria projeto ativo, 201 |
| PATCH /projects/{id} | Atualiza campos de projeto ativo, 200 |
| POST /projects/{id}/archive | Arquiva projeto ativo, 200 |

PATCH recebe todos os campos editáveis e a **revision** recebida na leitura. Arquivamento recebe somente revision. Atualizações incrementam revision atomicamente; versões antigas retornam 409 STALE_REVISION. Após conflito, feche o formulário, atualize a lista e reabra a edição. Recursos de outro workspace retornam 404. O workspace vem exclusivamente da sessão; informar workspaceId no corpo/query é inválido.

E-mail de cliente é normalizado e único **por workspace**, inclusive sob concorrência. Uma conta pode ter um cliente com o mesmo e-mail de um cliente de outra conta. Projetos referenciam clientes com FK composta (clientId, workspaceId), impedindo associação entre workspaces no próprio banco.

Campos de projeto: title (1–120), clientId UUID, balanceCents (inteiro 0–2147483647), includedRevisionRounds (inteiro 0–1000), currency BRL, status ACTIVE/ARCHIVED e revision. CHECKs SQL reforçam limites, moeda e revisão positiva. Não há ponto flutuante para converter valores no Flutter: 123,45 vira 12345 centavos; separador de milhar não é aceito.

Clientes são entidades compartilhadas dentro do workspace: editar nome/e-mail atualiza a identificação exibida nos projetos vinculados, inclusive arquivados. Arquivamento bloqueia mudanças nos campos do projeto. Não é um snapshot histórico de cliente.

Listas recebem cursor UUID, limit (padrão 20, máximo 50), search (até 120). Projetos também recebem status, padrão ACTIVE. A busca de projeto procura título/nome do cliente; a de cliente procura nome/e-mail. A ordem é id ascendente, com cursor exclusivo; não promete ordem cronológica. Novos registros anteriores ao cursor aparecem ao atualizar a lista. Nenhum filtro remove o escopo do workspace.

A migration **20261009120000_clients_projects** é incremental, gerada com Prisma migrate diff entre o schema anterior e o atual; CHECKs de domínio complementam o SQL gerado. Não altera a migration inicial nem apaga dados de autenticação.

## Contrato e segurança

Nest DTOs/decoradores → packages/contracts/openapi.json → cliente Dart gerado. O gerador agora suporta parâmetros de path/query, codifica URLs e exporta limites numéricos. Execute pnpm contracts:generate após alterar contratos e pnpm contracts:check para verificar divergências. Nenhuma dependência foi adicionada.

A interface usa WorkRepository separado da UI e compartilha o transporte HTTP autenticado existente. Cookie continua HttpOnly; CSRF fica em memória, credentials são enviados pelo BrowserClient e 401 aciona o fluxo de login.

## Validar manualmente

Crie um cliente e projeto reais, recarregue, edite e arquive. Teste uma segunda conta: nenhuma lista deve mostrar registros da primeira. Em duas abas, abra a edição do mesmo projeto; salve a primeira e confirme que a segunda mostra conflito sem descartar seu formulário.

Upload, versões de arquivo, download, portal de cliente, processamento e pagamentos continuam fora desta entrega. O próximo recorte é o armazenamento/entrega privada de arquivos (marco 2B), com decisão própria de infraestrutura.
