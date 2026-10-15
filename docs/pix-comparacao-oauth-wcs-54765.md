# Complemento ao WCS-54765 — enviado

Registro local: enviado em 15/10/2026, após autorização do responsável, diretamente ao chamado WCS-54765. O painel confirmou “Pronto, recebemos seu comentário!”. Captura local ignorada: .local/pix-wcs-54765-native-complement-sent.png. O texto enviado começa abaixo; este registro não foi incluído na mensagem.

Olá! Fizemos uma comparação adicional para investigar também a nossa implementação.

Na sessão de 15/10/2026 às 21:39:20 UTC, Authorization Code + PKCE confirmou o vendedor de teste MLB esperado e as permissões read/write efetivamente retornadas pelo OAuth. O token permaneceu apenas em memória. Corrigimos um limite local incorreto no parser de scopes; essa correção desbloqueou o job, mas não resolveu a recusa Orders.

Trocamos o transporte da consulta de identidade e do pedido Orders para node:https.request, sem fetch/Undici. Preservamos o corpo, a referência e a chave de idempotência da tentativa OAuth anterior.

- Método/endpoint: POST https://api.mercadopago.com/v1/orders
- Data/hora: 15/10/2026 21:39:21.485 UTC
- HTTP: 422
- x-request-id: f9554fa8-fa1a-450f-8f71-c5264f51c96a

JSON completo da resposta:

```json
{"errors":[{"code":"unprocessable_content","message":"Unprocessable Entity"}]}
```

Nenhum ID de order foi obtido. Como reutilizamos a mesma chave, não descartamos repetição de um erro armazenado por idempotência.

Como controle separado, uma tentativa nova com a credencial própria APP_USR da aplicação de teste do mesmo vendedor, usando HTTPS nativo e o pedido mínimo APRO/Pix de R$ 50,00, retornou HTTP 201 e foi confirmada depois por GET como processed/accredited. Esse controle não comprova OAuth.

Podem correlacionar o novo request-id e esclarecer: o 422 está sendo repetido por idempotência ou é uma validação atual? Há restrição do grant/aplicação para Orders Pix com esse vendedor de teste? Qual regra específica recusou o pedido?

Obrigado.
