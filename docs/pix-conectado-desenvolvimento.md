# Pix pelo OAuth do vendedor — ensaio de viabilidade

Preparação em 14/10/2026, autorizada pelo responsável após a prova OAuth. Fluxo isolado, sem import da API/banco do Cofre, sem alteração financeira local ou liberação de original. Não misturar este resultado com o ensaio anterior, que usou a credencial de teste da aplicação.

## Fluxo

1. Reutilizar a aplicação, Client ID/Secret e vendedor brasileiro de teste já verificados. Novo túnel serve somente o receptor 3101. Atualizar URL de **Modo de teste** para `/webhooks/mercadopago`, evento Order, sem redefinir a assinatura; conferir persistência no painel. Atualizar callback `/oauth/callback`, mantendo PKCE Sim, com gravação/reCAPTCHA manual pelo responsável.
2. `.local/pix-oauth.env` usa `MP_OAUTH_PIX_ENABLED=1` para o ensaio conectado. Durante configuração do túnel, `MP_OAUTH_ENABLED=0` mantém a tentativa fechada. Depois de salvar o callback, mudar para 1 e reiniciar somente o receptor. Gerar link local somente quando o vendedor estiver pronto em janela anônima.
3. Autorização com state único e PKCE S256. O ensaio conectado seleciona explicitamente `orders_test_user`: troca com `test_token: false`, exige família APP_USR e, antes de entregar o token, consulta `/users/me` para confirmar ID esperado, MLB e tag test_user. `live_mode` do token não prova o ambiente da transação: credenciais dessa família também pertencem a usuários de teste. Conta normal, ID/país divergente e falha de identidade continuam bloqueados. OAuth isolado mantém perfil anterior `sandbox_token`, com test_token true. Só o hook posterior à prova positiva entrega o access token ao ensaio; refresh token não é entregue. Não usar a credencial própria da aplicação como fallback.
4. Tentativa separada em `.local/pix-connected-order.json`, criada exclusivamente e sincronizada antes de qualquer POST: chave, referência, vendedor, aplicação esperada e ID da order. Arquivo inválido/divergente falha sem gerar outra tentativa. Falha de rede conserva a chave; recuperação usa o mesmo corpo/chave. ID conhecido é consultado antes do POST idempotente.
5. Job em segundo plano cria/recupera APRO Pix sintético de 50.00, confere aplicação, recebedor, referência, país, valor, moeda quando informada, meio Pix e estados. Repete POST com mesma chave e consulta o recurso. Não exibir nem pagar QR com banco real. Callback OAuth retorna sem esperar todos os requests da order.
6. Após persistir ID validado, habilitar handler para essa order. Antes disso responder 503 para o provedor repetir. Assinatura, freshness, ambiente, IDs e JSON limitado permanecem obrigatórios. GET autenticado usa somente o token recebido do vendedor por OAuth; consulta jamais cria cobrança.
7. Inbox `.local/pix-connected-inbox.json` separada, durável e sanitizada. HTTP 200 somente após validação/reconciliação e gravação de evidência. Duplicata da mesma entrega não consulta/cria outra order; volta a persistir o marcador de prova se necessário. Outra entrega consulta novamente.

## Evidência

`.local/pix-connected-evidence.json` contém fase, booleanos, horário e códigos de falha controlados. Flags independentes: oauthSellerVerified, idempotencyVerified, orderConfirmed, webhookReconciled, webhookConfirmed e duplicateSeen. Consulta com estado confirmado não marca webhook como recebido. Um webhook de criação ainda pendente não confirma pagamento. Marcadores de confirmação são evidência histórica do cenário APRO, não estado financeiro autoritativo do produto.

Provider HTTP recusado registra status e, quando reconhecido, enum de erro de uma lista fechada; aplicação divergente registra somente um ID numérico observado, nunca payload ou token. Não aceitar automaticamente outra aplicação para fazer o ensaio passar: conferir o vínculo no painel/documentação e preservar chave/referência. Nenhuma resposta financeira completa, access/refresh token, código OAuth, verifier, assinatura ou QR é gravado.

Token permanece somente em memória, limitado a 45 minutos, com encerramento/cancelamento bloqueando chamadas futuras e apagando a referência do token. Túnel tem limite próprio de sessenta minutos. Sessões anteriores de evidência são preservadas em arquivos locais `.previous.*` antes de iniciar outra sessão. Encerrar receptor/túnel descarta o token; nova sessão exige novo OAuth e recupera a tentativa existente.

Arquivos e flags são somente locais/ignorados. Produto, `.env`, banco, R2 e tentativa anterior de Pix não são alterados. Só concluir a prova conectada quando os marcadores necessários e a notificação legítima forem observados; não usar o simulador com live_mode true como substituto.

## Estado e verificações

52 unitários API passaram; oito testes novos do ensaio conectado cobrem isolamento do token, sequência OAuth/POST, distinção GET/webhook, entrega repetida, perda de resposta/recuperação, referência/chave duráveis, conta real, HTTP/aplicação divergente, persistência e encerramento. Build, lint, typecheck e contratos passaram. Moeda divergente também adicionada ao teste da order.

Novo HTTPS e URL de webhook de teste conferidos; responsável salvou o novo callback OAuth. Tentativa real iniciada, aguardando nova autorização manual do vendedor. Criação e notificação reais deste ensaio conectado ainda não foram comprovadas; gate F10 permanece aberto.

Na primeira autorização deste ensaio conectado, o responsável confirmou redirecionamento, mas o provedor recusou a troca OAuth (`TOKEN_EXCHANGE_FAILED`). Outra chegada do callback foi bloqueada como `ATTEMPT_ALREADY_USED`; não inferir quem a repetiu. Hook conectado não foi executado, nenhuma order foi criada e a chave/referência ficaram preservadas. Callback salvo e PKCE Sim reconferidos no painel.

Diagnóstico ampliado para gravar somente HTTP e enums OAuth conhecidos em `.local/pix-oauth-failure.json`, sem corpo, descrição, código ou segredo. O motivo específico da primeira recusa não foi guardado e permanece desconhecido. Teste novo comprova filtragem de descrições/valores inesperados; 53 unitários passaram, além de build/lint/typecheck. Nova tentativa preparada no mesmo HTTPS, aguardando autorização manual. Não repetir código consumido nem atribuir a falha a expiração, credencial ou PKCE sem evidência.

Na tentativa seguinte, OAuth e identidade passaram às 23:06:23 UTC de 14/10/2026. O POST da order foi recusado com HTTP 401. Sem ID de order e sem prova de idempotência, confirmação ou webhook conectado. O corpo dessa recusa não foi registrado; `invalid_credentials` é hipótese, não código observado.

Revisão da documentação oficial mostrou uma diferença entre a orientação OAuth genérica (`test_token: true`) e Orders: a [referência de erros Orders](https://www.mercadopago.com.br/developers/pt/docs/checkout-api-orders/payment-management/integration-errors/api) exige credenciais de produção **de usuários de teste** no sandbox; o [guia de teste Pix](https://www.mercadopago.com.br/developers/pt/docs/checkout-api-orders/integration-test/pix) identifica a família APP_USR. Por isso o perfil conectado foi separado acima. Isso não autoriza cobrança de conta real nem afrouxa a rejeição de `live_mode: true` na order/webhook. A compatibilidade efetiva do token OAuth dessa família com Orders permanece por comprovar na nova tentativa.

Dois testes adicionais cobrem o perfil Orders (incluindo credencial APP_USR com live_mode true, conta normal, ID/país errado, falha de GET e credencial TEST bloqueada) e sanitização de erros Orders. A tentativa durável mantém chave e referência originais.

## Resultado do perfil Orders (14/10/2026)

Responsável chegou a `/oauth/complete`. Evidência local confirma OAuth às 23:14:29 UTC, com state/PKCE e vendedor brasileiro test_user esperado. POST da order respondeu **HTTP 422** às 23:14:30 UTC; nenhum enum reconhecido pela lista fechada foi registrado. Não atribuir causa específica a esse status: corpo/descrição não foram persistidos. ID continua ausente, idempotência/GET confirmado/webhook continuam falsos. A troca de família da credencial não concluiu a compatibilidade OAuth + Orders.

Não preparar outra autorização idêntica sem diagnóstico adicional. Preservar tentativa e evidências; encerrar receptor/túnel para descartar token em memória. Próxima decisão técnica: verificar o suporte ao cenário OAuth/sandbox Orders com o provedor e comparar a rota documentada Payments API para vendedor conectado, antes de implementar F10. O [guia oficial de migração](https://www.mercadopago.com.br/developers/pt/docs/checkout-api-orders/resources/migrate-payments-to-orders) descreve marketplace com OAuth na Payments API e alerta para não presumir paridade em Orders. Isso não prova que o 422 seja causado por marketplace, nem exige cobrança de comissão pelo Cofre. Qualquer ensaio Payments deve ter tentativa/inbox/validações próprias, sem reutilizar IDs, corpos ou conclusões de Orders.

## Diagnóstico solicitado no ticket WCS-54765

Em 15/10/2026, responsável forneceu resposta do suporte orientando continuar Orders com OAuth APP_USR do usuário de teste e obter corpo do 422/x-request-id. Dados antigos não preservados e token temporário descartado: necessário novo request/OAuth, não recuperação retroativa da resposta. Captura local do erro foi adicionada ao ensaio conectado, antes de propagar falha: `.local/pix-orders-error-<timestamp>.json`, somente JSON de erro limitado a 32 KiB e request ID validado, com flags complete/redacted. Remove credenciais, payer/card/QR; não expõe payload em Error/console/Git. Resposta inválida/excessiva fica com complete false. Chave/ref/corpo do POST permanecem iguais; não mudar payload antes de observar a validação. Ver [diagnóstico atualizado](pix-diagnostico-provedor.md).
