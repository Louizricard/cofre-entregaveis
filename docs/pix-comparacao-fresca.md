# Comparação OAuth com tentativas diagnósticas separadas

Objetivo: separar cache de erro por chave, diferença de processing_mode e família de API, sem apagar/recriar a tentativa original ou usar dinheiro real. Preparado após solicitação do responsável de resolver o bloqueio e avançar o projeto. Não comprova integração de produção.

Ativação local: MP_OAUTH_COMPARE=1, MP_OAUTH_PIX_ENABLED=1 e MP_OAUTH_NATIVE_ORDERS=1; Payments exclusivo desabilitado. OAuth usa Authorization Code/PKCE com APP_USR, read/write e identidade esperada/MLB/test_user validados. O token é entregue somente em memória aos cenários da mesma sessão; não se usa credencial real do integrador para criar cobranças.

| Cenário | Diferença deliberada | Arquivos locais |
| --- | --- | --- |
| orders_minimal_fresh | Nova chave/ref, mesmo pedido mínimo APRO/Pix de 50.00 | pix-comparison-orders_minimal_fresh-* |
| orders_automatic_fresh | Outra chave/ref e processing_mode automatic explícito | pix-comparison-orders_automatic_fresh-* |
| payments_app_usr_fresh | Outra chave/ref, POST /v1/payments com mesmo OAuth APP_USR de vendedor comprovadamente de teste | pix-comparison-payments_app_usr_fresh-* |

Os casos são sequenciais. Só se avança depois de HTTP 400/401/403/422 sem ID fixado. Sucesso, recurso obtido, erro de rede, 5xx ou falha de validação/persistência interrompem a comparação; não criar outro caso para contornar resultado incerto. Cada POST repetido conserva seu próprio corpo/chave. Reiniciar recupera os mesmos arquivos de cada cenário, sem gerar outras chaves. A tentativa original pix-connected-order.json permanece fora desse fluxo.

Orders exige recebedor/aplicação/referência/valor/método corretos e rejeita recurso live. Payments exige explicitamente live_mode false, recebedor/BRL/50/Pix/referência e aplicação quando informada. Prefixo APP_USR não comprova ambiente; a identidade autenticada e as validações do recurso são obrigatórias. Cenário Payments investiga uma alternativa; a orientação anterior do suporte para Payments foi TEST, e essa diferença será registrada sem declarar o caminho validado antes do teste real.

Webhook roteado pelo ID conhecido para o handler específico, mantendo assinatura e validação do recurso. GET confirmado não é contado como webhook. Diagnóstico de erro limitado/sanitizado inclui x-request-id e corpo completo quando dentro do limite; QR/token nunca gravados. Nenhum endpoint permite iniciar novos cenários publicamente. O receptor não importa serviços nem banco do produto.

Referências oficiais revisadas em 15/10/2026:

- [Marketplace via Payments/OAuth](https://www.mercadopago.com.br/developers/pt/docs/split-payments/split-1-1/integration-configuration/integrate-marketplace).
- [Limitações de paridade Marketplace na migração para Orders](https://www.mercadopago.com.br/developers/pt/docs/checkout-api-orders/resources/migrate-payments-to-orders). Isso não prova que todo Orders com OAuth é incompatível; Cofre não retém application_fee no MVP.
- [Exemplo mínimo de teste Orders/Pix](https://www.mercadopago.com.br/developers/pt/docs/checkout-api-orders/integration-test/pix) e [processing_mode no guia de integração](https://www.mercadopago.com.br/developers/pt/docs/checkout-api-orders/payment-integration/websites/pix).
- [Pix via Payments](https://www.mercadopago.com.br/developers/pt/docs/checkout-api-payments/integration-configuration/integrate-pix).

Execução real pendente da configuração do callback/webhook temporários e consentimento do vendedor. Não enviar novos resultados automaticamente ao atendimento.

## Resultado observado — 15/10/2026, 21:55 UTC

OAuth confirmou identidade MLB/test_user esperada, read/write e PKCE às 21:55:38.560 UTC. Os três cenários foram executados por HTTPS nativo, com chaves/referências próprias. Original permaneceu preservada.

| Cenário | Resultado | x-request-id |
| --- | --- | --- |
| Orders mínimo, chave nova | 422, unprocessable_content/Unprocessable Entity | 66b87028-13ee-44b2-8de3-730c18913553 |
| Orders automatic, outra chave nova | 422, mesmo corpo de erro | 4de1724d-903e-4363-bf41-a9031820cf4d |
| Payments OAuth APP_USR, chave nova | 500, internal_server_error, mensagem user_allowed_only_in_test | fc4ff221-aa3b-4599-b898-20cab1fe71d4 |

Corpo completo do erro Payments:

```json
{"message":"fill and validate error list: user_allowed_only_in_test\n: 400","error":"internal_server_error","status":500,"cause":[]}
```

Nenhum ID foi obtido e nenhum webhook/confirmacão foi comprovado. Em Payments, 5xx pode esconder criação; conservar essa tentativa sem substituir chave ou afirmar inexistência de recurso. Evidências locais completas e sanitizadas em pix-comparison-*-error-*.json.

Isso afasta reutilização da chave antiga e omissão de processing_mode como explicações suficientes do 422. Não identifica a regra específica Orders. O erro Payments agora dá uma pista concreta sobre perfil de teste; não é só um 500 sem diagnóstico. O suporte já orientou usar TEST em Payments.

Próxima prova preparada: Payments com OAuth sandbox_token/test_token true, tentativa separada pix-payment-sandbox-fresh-*, cliente HTTPS nativo e diagnóstico completo. Não reutiliza a tentativa Payments APP_USR com resultado incerto nem a tentativa TEST antiga sem captura. Mesmos valor/método/payer sintéticos; somente perfil de credencial e chave/referência do cenário separado mudam. Callback/webhook já salvos permanecem iguais. Depende de novo código OAuth de uso único; não alterar produto selecionado no painel durante a comparação do perfil. Ainda não executada.

Na autorização seguinte, o navegador do vendedor mostrou “O aplicativo não está pronto para se conectar a Mercado Pago” no próprio provedor, antes de callback. Receptor permanece pending, sem troca de token ou POST Payments desse cenário. Conferidos callback salvo/PKCE, integridade do link local e health HTTPS público. State mostrado na imagem corresponde à tentativa atual; não atribuir a erro de perfil TEST, que só é solicitado na troca de token após o retorno. Preparado link local alternativo usando auth.mercadopago.com.br, host do exemplo oficial de configuração Marketplace, com todos os parâmetros idênticos e sem reiniciar a tentativa. Essa alternativa de rota não é solução comprovada nem identifica a causa da recusa; aguarda verificação no navegador do vendedor.

## Payments com perfil de sandbox solicitado — resultado 22:03 UTC

O link pelo host brasileiro retornou com sucesso na mesma tentativa, sem novo state/PKCE. Não é prova de que a mudança de host tenha sido a causa: a recusa anterior também pode ter sido transitória.

Às 22:03:51.784 UTC, a troca com test_token true passou pelas verificações de token/usuário, read/write e identidade autenticada MLB/test_user. O guard sandbox rejeita live_mode true; a evidência não registrou o prefixo/família exata do token retornado, portanto descrever como perfil de sandbox solicitado, sem apresentar TEST como prefixo observado desta sessão.

POST /v1/payments com chave/ref novas do cenário sandbox-fresh retornou HTTP 500, após retries limitados com corpo/chave constantes. Diagnóstico completo em pix-payment-sandbox-fresh-error-1792101836575.json:

- Horário: 2026-10-15T22:03:56.575Z
- x-request-id: 10433625-70ed-472c-b258-04f8c558baad
- Corpo: `{"message":"fill and validate error list: user_allowed_only_in_test\n: 400","error":"internal_server_error","status":500,"cause":[]}`

Não houve ID retornado, confirmação, idempotência validada ou webhook legítimo. Conservar a tentativa porque 5xx pode ocultar criação. O mesmo erro com test_token false e true não permite atribuir a causa exclusivamente à escolha desse parâmetro, nem identificar qual ator/regra está divergente. Repetir outra autorização sem informação nova não é o próximo teste útil. Para o provedor, correlacionar os request-ids e fornecer corpo/chave dos cenários sintéticos, sem tokens. Para o produto, PRD admite beta com quitação manual auditada; escolha apresentada ao responsável antes de iniciar esse fluxo.
