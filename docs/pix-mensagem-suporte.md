# Mensagem para o suporte técnico do Mercado Pago

Texto preparado em 15/10/2026 e enviado após autorização explícita do responsável ao atendimento técnico acessado pela Central de Suporte do Mercado Pago Developers. A interface informou que o atendimento inicial usa inteligência artificial; não confundir com parecer de especialista ou chamado humano.

## Texto para envio

Olá! Estou validando uma integração brasileira de Pix em nome de vendedores via OAuth Authorization Code com PKCE, sem comissão de plataforma. Aplicação: Cofre Entregaveis - Desenvolvimento (ID 8629889424885817).

Uso exclusivamente um vendedor de teste. O OAuth passa; antes do POST, `/users/me` autenticado confirma o ID esperado, `site_id: MLB` e tag `test_user`.

Em 15/10/2026 às 14:27:05 UTC, POST `/v1/payments` com token OAuth obtido usando `test_token: true` retornou HTTP 500. Corpo: `transaction_amount: 50`, `payment_method_id: pix`, payer sintético de teste e external_reference única. Enviei X-Idempotency-Key, sem application_fee. Nenhum payment ID foi retornado/persistido; não considerei a criação nem a aprovação comprovadas. Não capturei x-request-id ou código específico do erro.

A aplicação está salva como API Pagamentos, PKCE Sim, callback HTTPS e evento Pagamentos no Modo de teste. Na tentativa anterior por Orders, OAuth com `test_token: false`/APP_USR do vendedor de teste passou pela identidade, mas POST `/v1/orders` retornou HTTP 422 em 14/10/2026 às 23:14:30 UTC.

Qual é o fluxo suportado para Pix via OAuth de vendedor brasileiro de teste? Devemos usar `test_token: true` ou credenciais APP_USR obtidas via OAuth da conta de teste? Há requisito adicional de elegibilidade ou chave Pix na conta de teste? Como validar aprovação, expiração, cancelamento, reembolso e webhook assinado de Pix sem pagar QR em banco real?

Obrigado.

## Observações locais

- Nenhuma credencial, token, código OAuth, assinatura, verifier, QR ou documento pessoal integra este texto.
- O diagnóstico completo está em [pix-diagnostico-provedor.md](pix-diagnostico-provedor.md).
- Hipótese encontrada após a falha: o [guia Pix via Payments/Bricks](https://www.mercadopago.com.br/developers/pt/docs/checkout-bricks/payment-brick/payment-submission/pix) descreve uso de credenciais de produção de usuário de teste. Isso não prova que `test_token: true` causou o HTTP 500 nem confirma que todo esse cenário funciona com token OAuth. Não mudar a credencial e repetir a autorização sem validar essa distinção.
