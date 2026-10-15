# Novo diagnóstico para WCS-54765 — enviado ao atendimento

Texto preparado a partir da captura local de 15/10/2026. Nenhuma credencial, token, link assinado, QR ou dado pessoal. Responsável autorizou especificamente o envio; texto enviado ao mesmo atendimento em 15/10/2026 às 12:35 (America/Sao_Paulo), identificando WCS-54765. Histórico confirmou envio; aguardando confirmação de associação ao chamado/análise técnica.

O assistente informou que a conversa não adicionava automaticamente dados ao WCS e indicou a página do chamado. O mesmo texto autorizado foi publicado diretamente em `/developers/pt/support/center/tickets/detail/WCS-54765`; a página confirmou **“Pronto, recebemos seu comentário!”**. Captura local `.local/mp-wcs-54765-diagnostic-published.png`. Aguardando análise técnica; não confundir o envio inicial ao chat com esta publicação efetiva no ticket.

## Texto para envio

Olá! Complementando o chamado WCS-54765, repetimos o ensaio Orders com token OAuth APP_USR do mesmo vendedor de teste MLB. Authorization Code + PKCE e GET autenticado de identidade confirmaram novamente a conta de teste esperada. Preservamos o corpo, a chave de idempotência e a referência da tentativa anterior.

Esta é uma nova chamada, não a recuperação dos headers da tentativa antiga:

- Data/hora: 15/10/2026 15:32:09 UTC (12:32:09 em America/Sao_Paulo)
- Método/endpoint: POST https://api.mercadopago.com/v1/orders
- HTTP: 422
- x-request-id: f143fef1-0bd4-4603-9313-00e5f8022b9f

Corpo JSON completo da resposta desta chamada, sem truncamento ou mascaramento:

```json
{"errors":[{"code":"unprocessable_content","message":"Unprocessable Entity"}]}
```

Nenhum ID de order foi obtido. O erro não trouxe cause ou identificação de campo. Poderiam correlacionar esse x-request-id e informar a regra específica que está recusando o Pix deste vendedor de teste via OAuth?

Obrigado.

## Evidência local

Captura original: `.local/pix-orders-error-1792078329160.json`, flags complete true/redacted false. Este documento contém apenas os dados revisados para o suporte; não anexar arquivos .env ou a tentativa inteira. A solicitação de correlação refere-se exclusivamente ao request novo acima.
