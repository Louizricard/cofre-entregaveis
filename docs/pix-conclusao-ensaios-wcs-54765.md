# Complemento consolidado proposto — ainda não enviado

Olá! Complementamos o WCS-54765 com cenários novos para eliminar cache da chave antiga e comparar perfis. Aplicação integradora 8629889424885817; vendedor esperado 3766420788, confirmado por GET autenticado como MLB/test_user. State/PKCE e permissões read/write confirmados nas sessões.

Cada cenário abaixo possui chave/referência nova e própria. Foram preservadas tentativas originais; retries dentro de cada cenário mantiveram corpo/chave. Transporte node:https.request.

| Cenário | Data/hora UTC em 15/10/2026 | HTTP | x-request-id |
| --- | --- | --- | --- |
| Orders mínimo, OAuth test_token false | 21:55:39.555 | 422 | 66b87028-13ee-44b2-8de3-730c18913553 |
| Orders processing_mode automatic, OAuth test_token false | 21:55:40.183 | 422 | 4de1724d-903e-4363-bf41-a9031820cf4d |
| Payments, OAuth test_token false | 21:55:44.288 | 500 | fc4ff221-aa3b-4599-b898-20cab1fe71d4 |
| Payments, OAuth test_token true | 22:03:56.575 | 500 | 10433625-70ed-472c-b258-04f8c558baad |

Corpo completo das duas respostas Orders:

```json
{"errors":[{"code":"unprocessable_content","message":"Unprocessable Entity"}]}
```

Corpo completo das duas respostas Payments:

```json
{"message":"fill and validate error list: user_allowed_only_in_test\n: 400","error":"internal_server_error","status":500,"cause":[]}
```

Pedidos Orders usaram type online, total_amount 50.00, external_reference própria, payer test@testuser.com/first_name APRO e uma transação 50.00 pix/bank_transfer. Apenas o segundo cenário acrescentou processing_mode automatic. Pedidos Payments usaram transaction_amount 50, description Cofre - ensaio sandbox Pix, payment_method_id pix, external_reference própria e o mesmo payer sintético. Nenhum application_fee.

Nenhum ID foi obtido. Não declaramos ausência de criação após 5xx. As respostas de token não foram persistidas; test_token true é o perfil solicitado, e nossa validação rejeita live_mode true nesse perfil. Não apresentamos prefixo do último token como evidência registrada. O controle anterior com credencial própria da aplicação de teste segue separado do OAuth e passou na criação/GET.

Poderiam correlacionar os quatro request-ids, identificar qual ator/regra provoca user_allowed_only_in_test e indicar o cenário suportado de integrador/vendedor/credencial para Pix via OAuth? A explicação anterior sobre somente alternar test_token não resolveu Payments. Também precisamos da regra específica dos 422 novos, que não reutilizam a chave antiga.

Obrigado.
