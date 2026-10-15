# Revisão técnica do ensaio Pix — 15/10/2026

Motivo: o responsável questionou se a falha vinha da implementação e pediu outra abordagem. A revisão não parte da premissa de erro exclusivo do provedor.

## Falhas e limitações do método anterior

1. Orders foi inicialmente chamado com OAuth test_token true. O suporte confirmou posteriormente a incompatibilidade desse perfil TEST com Orders; o perfil Orders APP_USR já havia sido implementado. O 401 não demonstrava indisponibilidade geral do Pix.
2. A captura detalhada veio tarde. Preservar apenas HTTP/enums causou perda do corpo e x-request-id e exigiu nova autorização. Captura local limitada/mascarada já corrigida.
3. Alterar a API para Payments antes de concluir um controle com o mesmo cenário não isolou a causa. O 500 em Payments também permanece sem causa específica.
4. Os unitários usam respostas simuladas: verificam comportamento local e proteções, mas não comprovam contrato, permissões ou elegibilidade no provedor. Não apresentar contagem de testes como prova da integração real.
5. A identidade test_user/MLB não prova permissão de escrita. O callback não verificava scope retornado pelo OAuth antes de entregar token ao job de cobrança. Corrigido para exigir read e write quando há hook conectado e registrar somente booleanos de permissões, sem tokens. Os scopes das tentativas antigas não foram preservados; não atribuir o 422 retroativamente à falta de write.

## Comparação do pedido

O corpo usado contém type online, total_amount 50.00, payer sintético/APRO, transactions.payments com amount 50.00 e pix/bank_transfer. A referência dinâmica tem formato e comprimento compatíveis com o limite documentado. Corresponde ao [exemplo oficial de teste Pix Orders](https://www.mercadopago.com.br/developers/pt/docs/checkout-api-orders/integration-test/pix), exceto pela referência própria.

O [guia de integração Pix](https://www.mercadopago.com.br/developers/pt/docs/checkout-api-orders/payment-integration/websites/pix) marca processing_mode como obrigatório e mostra automatic; o exemplo de teste o omite. Nosso pedido também o omite. Isso foi identificado como diferença a investigar, mas o controle novo abaixo foi aceito sem esse campo: não há evidência de que essa omissão explique o 422 conectado. Não alterar corpo de uma tentativa existente mantendo sua chave.

A [referência OAuth](https://www.mercadopago.com.br/developers/pt/reference/authentication/oauth/_oauth_token/post) documenta scope na resposta e read/write/offline_access. O guard novo verifica concessão efetiva, além da seleção mostrada no painel.

## Controles independentes executados

Todos com credencial própria da aplicação de teste já salva, identidade esperada/MLB/test_user autenticados e servidor fixo do provedor. Sem conta real, sem QR pago, sem alterar o produto ou substituir a tentativa OAuth.

| Controle | Resultado observado | Limite da conclusão |
| --- | --- | --- |
| GET de identidade e da order inicial, 21:08:17 UTC | Conta e recurso validados; processed/accredited | Recurso antigo; não prova criação nova |
| HTTPS nativo node:https: replay da order/chave/corpo iniciais | HTTP 201, mesmo ID; POST em cache pendente, GET atual confirmado | Replay pode devolver snapshot inicial; não demonstra validação de pedido novo |
| Controle novo separado, 21:13:23 UTC, HTTPS nativo e pedido mínimo/APRO | HTTP 201, ID validado e persistido; GET action_required | Criação real de sandbox; ainda sem confirmação naquele instante |
| GET posterior do controle novo, 21:16:40 UTC | processed/accredited, confirmação sintética validada | Credencial própria da aplicação; não comprova OAuth conectado ou webhook |

Portanto, o pedido mínimo e o Pix desse vendedor funcionam no controle de credencial própria, inclusive com criação nova. Permanecem diferenças de token/permissões/aplicação e transporte a separar no cenário OAuth. Não concluir indisponibilidade geral nem elegibilidade de produção.

Scripts/evidências locais ignorados: `.local/pix-audit-baseline.mjs`, `.local/pix-audit-native-control.mjs`, `.local/pix-audit-fresh-control.mjs`, respectivas evidências e tentativa `pix-audit-fresh-control-attempt.json`. Controle novo possui chave/ref próprias porque é um cenário diagnóstico intencional, não recuperação da cobrança conectada. Não apagar/recriar a tentativa de controle após falha. A tentativa OAuth original permanece preservada.

## Próxima comparação útil

Na próxima sessão OAuth, registrar read/write efetivamente concedidos e testar o token do vendedor com o mesmo cliente HTTPS independente, sem o receptor/handler influenciar o pedido de criação. Comparar a tentativa original e, somente se deliberadamente planejado, um controle novo de sandbox separado para distinguir eventual cache de erro por chave. Manter corpo, conta, valor e família de API constantes; conservar IDs/chaves/evidências de cada cenário. Não iniciar outra autorização só para repetir o teste anterior sem esses controles preparados.

Nenhum OAuth novo ou envio adicional ao suporte foi feito nesta revisão. O chamado WCS-54765 já recebeu o diagnóstico anterior; estes novos resultados ainda não foram enviados.

## Comparação OAuth por HTTPS nativo preparada

`apps/api/src/pix-native-https.ts` usa `node:https.request`, sem fetch/Undici no job Orders. Ativado exclusivamente pelo campo local `MP_OAUTH_NATIVE_ORDERS=1`, junto de `MP_OAUTH_PIX_ENABLED=1`. O OAuth Authorization Code + PKCE permanece no cliente original; após conferir read/write e identidade de teste, o token fica apenas na memória e o job consulta identidade e Orders pelo transporte independente.

O experimento reutiliza a tentativa OAuth original (mesmo corpo, referência e chave). Não cria tentativa nova nem altera processing_mode. Limite: outro 422 ainda pode ser resposta idempotente; sozinho não distingue erro atual de erro em cache. A evidência do job identifica o transporte como node:https. Não confundir controle próprio já aprovado com sucesso OAuth.

O adaptador só aceita HTTPS nos caminhos fixos de identidade e Orders, recusa redirecionamentos, limita pedido a 32 KiB e resposta a 64 KiB, mantém validação TLS e sinal de cancelamento. Captura existente preserva resposta de erro e x-request-id sem registrar tokens ou QR. Verificação: build, lint, typecheck e 73 unitários passaram. Os três testes adicionais cobrem preservação do erro/cabeçalho e tamanho em bytes, bloqueio de destinos/redirecionamentos e limites/cancelamento antes da chamada.

Execução real pendente de salvar callback temporário, atualizar URL de webhook e autorizar o vendedor de teste. OAuth permanece desabilitado durante a preparação do painel; gerar novo link somente depois dessas configurações salvas. Nenhum novo resultado do provedor pode ser declarado antes dessa execução.

### Primeira execução do cliente OAuth preparado

Callback e webhook de teste foram confirmados salvos no novo endereço temporário; perfil Orders/PKCE preservados. Após autorização, o receptor registrou `PAYMENT_SCOPES_REQUIRED`: o bloqueio local ocorreu depois da troca do código, antes da consulta de identidade e de qualquer POST Orders. Evidência conectada permaneceu awaiting_oauth; não houve novo diagnóstico Orders/422. Isso não prova que o vendedor não concedeu write: o parser anterior não guardava a presença/tipo/formato do campo scope. A configuração da aplicação foi consultada e read/offline access/write estavam marcadas.

Corrigida essa lacuna: resultado de bloqueio agora inclui diagnóstico de etapa scope_validation, HTTP da troca e somente booleanos/enums de presença, tipo, limite, vírgula e read/write reconhecidos. Não persiste valor de scope, token ou refresh token e não relaxa o guard. 74 unitários, build, lint e typecheck passaram. Nova autorização necessária para observar a resposta: código anterior consumido e token descartado; não tentar reutilizar callback. Comparação real do transporte Orders continua pendente.

### Causa local comprovada do bloqueio de scopes

Na autorização de 21:37:21.347 UTC, a troca retornou HTTP 200, scopePresent true, scopeType string, scopeWithinLimit false, commaSeparated false. O parser introduzido na auditoria descartava toda a lista quando maior que 256 caracteres. Portanto read/write false nessa evidência não significa ausência de permissões; elas sequer foram procuradas na lista. Esse limite foi um erro local e explica o bloqueio novo, sem explicar retroativamente os HTTP 422 antigos.

Removido o limite arbitrário por tamanho da lista. O parser verifica nomes exatos separados por espaços no campo completo; nomes parciais não concedem read/write. Diagnóstico de eventual rejeição passa a registrar somente comprimento, tipo e booleanos, nunca a lista. Teste de regressão usa uma lista maior que 2 KiB com permissões adicionais e verifica tanto concessão exata quanto recusa de read_only/overwrite. A tentativa real parou antes de identidade/Orders, sem nova cobrança. Ainda é necessário obter outro código de uso único para executar a versão corrigida.

### Resultado real após correção, 21:39 UTC

- OAuth confirmado em 2026-10-15T21:39:20.413Z: state/PKCE e identidade MLB/test_user esperada validados; readScopeGranted e writeScopeGranted true, tokensPersisted false.
- Job Orders usou node:https e confirmou novamente a identidade antes do POST. Mesma chave, referência e corpo da tentativa OAuth original preservados.
- POST /v1/orders em 2026-10-15T21:39:21.485Z retornou HTTP 422; x-request-id `f9554fa8-fa1a-450f-8f71-c5264f51c96a`. JSON completo: `{"errors":[{"code":"unprocessable_content","message":"Unprocessable Entity"}]}`.
- Nenhum ID de order foi obtido; idempotência, confirmação e webhook conectado continuam não comprovados. Evidências locais: pix-oauth-evidence.json, pix-connected-evidence.json e pix-orders-error-1792100361485.json.

A falha local de scopes foi corrigida e a concessão efetiva foi comprovada nesta sessão. A mudança de transporte não resolveu a recusa Orders. Não concluir que o provedor é exclusivamente responsável: replay da mesma chave pode reproduzir erro armazenado, e compatibilidade do token/aplicação com o fluxo ainda exige esclarecimento. Controle próprio novo anteriormente aceito permanece uma evidência separada, sem OAuth.

Próxima comparação, se necessária: tentativa diagnóstica OAuth nova, explicitamente separada da original, com corpo/conta/valor constantes e mesma sessão comparando controles; planejar antes de gerar outro link. Não repetir autorizações apenas para reenviar a tentativa antiga. Resumo adicional preparado em pix-comparacao-oauth-wcs-54765.md, ainda não enviado ao suporte.

Alternativa de produto já prevista no PRD: beta com registro de pagamento externo/dispensa justificada e liberação condicionada à aprovação, enquanto a conexão automática é resolvida. Isso seria um fluxo explícito e auditado; não marcar Pix automático como concluído nem quitar projetos existentes por causa destes testes. Não implementado nesta revisão.

Verificação do guard de scopes: 70 unitários API, build, lint e typecheck passaram. Nova autorização real ainda não verificou os scopes do token; a correção não é apresentada como causa ou solução comprovada do 422.
