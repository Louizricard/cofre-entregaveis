# Diagnóstico para validação com Mercado Pago

Preparado em 15/10/2026. Rascunho para revisão pelo responsável; nenhuma mensagem enviada ao provedor. Sem credenciais, tokens, código OAuth, assinatura, verifier, payload de resposta, QR ou documentos pessoais.

## Cenário

Aplicação Cofre Entregaveis - Desenvolvimento. Integração brasileira para cobrar Pix em nome do vendedor via Authorization Code com PKCE S256. Não há comissão de plataforma neste ensaio. Somente vendedor de teste: antes de qualquer POST, consulta autenticada confirmou ID esperado, site MLB e tag test_user. Produto/banco financeiro/downloads não participam da prova.

## Resultados observados (UTC)

| API / credencial | Horário do POST | Resultado observado |
| --- | --- | --- |
| Orders, OAuth test_token true | 14/10/2026 23:06:24 | HTTP 401; sem código específico registrado |
| Orders, OAuth test_token false, APP_USR de usuário de teste | 14/10/2026 23:14:30 | HTTP 422; sem enum reconhecido registrado |
| Payments, OAuth test_token true | 15/10/2026 14:27:05 | HTTP 500; sem enum reconhecido registrado |

OAuth/state/PKCE e identidade passaram nos três cenários. Um ensaio anterior com credencial de teste própria da aplicação criou/consultou Orders Pix sintético, mas não demonstra compatibilidade do token OAuth do vendedor. Cada API tem tentativa e referência próprias; chaves de idempotência preservadas. Não trocar chave depois de uma falha, pois o resultado do POST pode ser ambíguo.

No ensaio Payments, POST `/v1/payments`: transaction_amount 50, payment_method_id pix, payer sintético de teste, external_reference única e X-Idempotency-Key. Aplicação salva como API Pagamentos; callback/PKCE e evento Pagamentos no Modo de teste conferidos após gravação. Sem application_fee, sponsor ou token da aplicação como fallback. O HTTP 500 observado teve apenas um envio; retentativas adicionadas depois ainda não foram exercitadas no provedor.

Nenhum ID Payments foi obtido/persistido; criação no provedor é desconhecida após o 500, não comprovadamente ausente. Nenhuma aprovação, idempotência ou notificação legítima Payments foi confirmada. x-request-id não foi capturado; não inventar um identificador de correlação. Nenhum QR foi exibido/pago em banco real.

## Perguntas para o provedor

1. Qual família de credencial e fluxo de testes são suportados para Pix via OAuth de vendedor MLB test_user em Payments? Existe restrição específica ao test_token true neste cenário?
2. O Pix sandbox desse vendedor exige alguma configuração adicional de aplicação/conta de teste? Como verificar a elegibilidade sem conectar ou cobrar conta real?
3. Orders admite esse mesmo cenário de token OAuth de usuário de teste, sem retenção de comissão? Qual a orientação para o HTTP 422 observado?
4. Como simular aprovação, expiração, cancelamento e reembolso e receber webhook assinado de teste para Pix nessa API? Não queremos pagar QR com instituição real nem tratar simulador live_mode true como prova de sandbox.
5. Quais condições/tarifas/requisitos de conta precisam ser atendidos em produção para cobrar em nome de vendedores sem comissão de plataforma?

Se o suporte pedir identificadores, informar somente application ID/test seller ID pertinentes por canal oficial. Nunca compartilhar Access Token, Client Secret, refresh token, assinatura, URL OAuth/callback com query ou arquivos .env. Este documento não afirma que Orders não suporta OAuth nem que Payments é incompatível: a causa dos erros permanece sem diagnóstico específico.

Referências consultadas: [OAuth](https://www.mercadopago.com.br/developers/pt/docs/security/oauth/creation), [Pix Payments](https://www.mercadopago.com.br/developers/pt/docs/checkout-api-payments/integration-configuration/integrate-pix), [marketplace Payments](https://www.mercadopago.com.br/developers/pt/docs/checkout-api-payments/how-tos/integrate-marketplace), [migração Orders](https://www.mercadopago.com.br/developers/pt/docs/checkout-api-orders/resources/migrate-payments-to-orders).

Investigação adicional em 15/10/2026: [Pix via Payments no Payment Brick](https://www.mercadopago.com.br/developers/pt/docs/checkout-bricks/payment-brick/payment-submission/pix) cita credenciais de produção de usuário de teste para `/v1/payments`. O artigo oficial de [cobranças rejeitadas nos testes](https://www.mercadopago.com.br/developers/pt/support/38230), lido no painel autenticado, recomenda conferir requisitos e credenciais, mas não diagnostica o HTTP 500 nem resolve a diferença entre os perfis OAuth. A família de credencial continua sendo hipótese de investigação; não declarar incompatibilidade ou mudar para conta real.

Canal oficial de atendimento técnico localizado pela Central de Suporte: `/developers/pt/support/center/tickets`, com assistente de atendimento. Nenhuma mensagem digitada ou enviada. Rascunho concreto para revisão: [pix-mensagem-suporte.md](pix-mensagem-suporte.md). Sem novo OAuth, túnel ou pagamento nesta investigação.

Após autorização explícita, texto inicial enviado em 15/10/2026. O assistente de IA recomendou Orders com OAuth test_token true, repetiu guias de Pix/state/PKCE/webhooks e pediu corpo completo do 422 para diagnosticar. Isso não conciliou o 401 observado com test_token true nem a orientação da referência Orders sobre APP_USR de usuários de teste. Corpo completo e x-request-id não foram preservados, portanto não podem ser fornecidos retroativamente. A sugestão de cadastrar chave Pix em conta de teste não foi validada nem executada. Nenhum chamado humano ou protocolo confirmado.

Esclarecimento preparado solicitando análise dessa divergência e eventual atendimento humano. A revisão automática rejeitou o novo envio porque a autorização cobria somente o texto inicial. Nenhuma segunda mensagem enviada. Texto exato preservado em [pix-esclarecimento-suporte.md](pix-esclarecimento-suporte.md), aguardando nova autorização do responsável; não contornar a revisão.

Após autorização específica do responsável, esclarecimento enviado ao mesmo atendimento em 15/10/2026 às 12:03 (America/Sao_Paulo). Envio confirmado no histórico; aguardando resposta. Nenhum dado adicional além do texto aprovado foi enviado.

Resposta ao esclarecimento: o assistente informou não encontrar chamado parecido e ofereceu abrir chamado humano para Checkout API, com resumo dos erros 401/422/500 e da dúvida sobre perfis OAuth no vendedor de teste MLB. Pediu confirmação antes de criar. Resumo não acrescenta credenciais nem diagnóstico conclusivo. Aguardando responsável autorizar abertura; ainda sem chamado/protocolo humano confirmado.

Responsável autorizou explicitamente a abertura. Confirmação enviada em 15/10/2026 às 12:06 (America/Sao_Paulo). O atendimento respondeu que abriu o chamado e que a confirmação chegará por e-mail com número no formato WCS-XXXXX. Esse é somente o formato anunciado, não um protocolo efetivamente fornecido. Nenhum número específico apareceu na conversa e o e-mail não foi acessado. Captura local da confirmação: `.local/mp-support-ticket-created.png`. Aguardando análise humana; resposta automatizada anterior não resolve o gate F10.

## Resposta recebida pelo responsável — WCS-54765

Responsável forneceu o texto do e-mail e o número **WCS-54765** em 15/10/2026. O link de acesso assinado do e-mail não foi copiado para o repositório nem aberto.

A resposta orienta separar perfis por endpoint: Orders com token OAuth APP_USR do usuário de teste; Payments com perfil sandbox TEST obtido com test_token true. Mantém Authorization Code/PKCE. Atribui o 401 à incompatibilidade de perfil e trata o 422 como validação/regra a diagnosticar; não fecha a causa do 500. Solicita corpo completo do 422 e x-request-id da tentativa antiga.

Esses dois dados **não foram preservados** na tentativa antiga. O token foi mantido somente em memória e descartado ao encerrar o receptor; portanto a sugestão do e-mail de obter os dados sem nova autorização não se aplica ao estado atual. Não extrair token da memória, inventar correlação, reutilizar código OAuth consumido ou afirmar recuperar a mesma resposta HTTP. Uma nova requisição poderá ter outra resposta e outro x-request-id, embora preserve chave/corpo/referência de idempotência.

Preparada captura local opcional no fluxo Orders conectado: `.local/pix-orders-error-<timestamp>.json`, com método/rota, HTTP, x-request-id quando válido, JSON do erro, horário e ticket WCS-54765. Limite de 32 KiB, flags complete/redacted, remoção de tokens conhecidos, campos de segredo/payer/card/QR e credenciais refletidas. Não gravar respostas de sucesso, token OAuth ou corpo do pedido. JSON inválido/excessivo fica sem corpo e complete false. O Error/console continua sem payload. Arquivo ignorado pelo Git; revisar a captura antes de compartilhar com suporte, identificando claramente qualquer mascaramento/limitação.

Próximo ensaio: retomar o perfil Orders test_user já implementado (test_token false, APP_USR + identidade autenticada esperada MLB/test_user), preservar a tentativa original e confirmar callback/tópico Orders após renovar HTTPS. Nova sessão OAuth será necessária porque o token anterior foi descartado; não iniciada nesta preparação. Nenhum novo envio ao suporte autorizado ou realizado a partir deste e-mail.

## Nova chamada Orders com correlação — 15/10/2026

Responsável autorizou novo OAuth e confirmou redirecionamento. Evidência confirmou identidade/state/PKCE às 15:32:08 UTC. POST Orders repetiu HTTP 422 às 15:32:09 UTC, mantendo tentativa/corpo/chave/ref anteriores. Captura completa sem mascaramento: errors contém code unprocessable_content e message Unprocessable Entity; nenhum cause/campo específico. x-request-id `f143fef1-0bd4-4603-9313-00e5f8022b9f`. Nenhum orderId persistido; idempotência/confirmação/webhook não comprovados.

Arquivo local ignorado: `.local/pix-orders-error-1792078329160.json`, complete true/redacted false. Identificador/corpo pertencem a esta nova chamada; não são recuperação retroativa do erro de 14/10. Resultado revisado e mensagem para o ticket em [pix-retorno-wcs-54765.md](pix-retorno-wcs-54765.md); envio ainda não autorizado/executado. Sessão isolada encerrada após coleta para descartar token; produto preservado.

Responsável autorizou o envio do diagnóstico. Enviado primeiro ao assistente, que orientou responder diretamente no WCS para a equipe correlacionar o request ID. Página real WCS-54765 aberta pelo link “acompanhar chamado”; o mesmo texto aprovado foi publicado como comentário. Confirmação explícita da página: “Pronto, recebemos seu comentário!”. Sem novo chamado, sem envio de request body completo/chave de idempotência ou qualquer credencial. O assistente sugeriu esses dados adicionais, mas não estão no texto autorizado e não foram enviados. Aguardando resposta técnica ao diagnóstico publicado.
