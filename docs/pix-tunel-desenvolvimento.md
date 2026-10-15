# HTTPS temporário para o ensaio Pix

O receptor do ensaio usa `127.0.0.1:3101`. É um processo separado, sem imports da API do produto, banco, R2 ou arquivos de clientes. Atende `GET /health`; callback OAuth permanece em 503. Sem assinatura configurada, webhook também retorna 503. Com configuração explícita, lê somente a credencial/tentativa do ensaio, consulta a order de teste conhecida e grava evidência sanitizada local. Não captura código de autorização.

O Cloudflare Quick Tunnel fornece um hostname temporário `trycloudflare.com`, sem exigir domínio próprio. Qualquer pessoa com o endereço pode acessar as rotas desse receptor. Encerrar o processo encerra o acesso; o hostname muda na próxima sessão. Login por e-mail não é usado neste ensaio porque notificações automáticas precisam chegar sem uma sessão interativa. Esse endereço é de desenvolvimento, não um site comercial ou endpoint de produção. [Documentação oficial](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/).

## Cliente fixado

Cloudflared Windows amd64 **2026.10.0**, baixado do repositório oficial. SHA-256 conferido no download e em cada inicialização: `86aee4017b26625cee8484c113558f48effa4cd47f7aa05fcf425604e5d2b23c`. Binário somente em `.tools/cloudflared/2026.10.0/cloudflared.exe`, ignorado pelo Git. [Release oficial](https://github.com/cloudflare/cloudflared/releases/tag/2026.10.0).

## Iniciar

Com os comandos nativos do projeto disponíveis, em dois processos separados:

```powershell
pnpm.cmd pix:receiver
pnpm.cmd pix:tunnel
```

`node scripts/pix-tunnel.mjs --check` verifica o binário e o marcador do receptor sem abrir túnel. O launcher recusa outro processo registrado ainda ativo. O destino é fixo na porta 3101; não aceita parâmetro para apontar ao painel 8080 ou à API 3000.

O launcher usa configuração vazia exclusiva, desabilita auto-update, remove overrides Cloudflare/TUNNEL do ambiente do filho, mantém métricas no loopback e desabilita diagnósticos de gestão. Saída bruta do cliente é descartada: somente o hostname temporário é extraído e salvo em `.local/pix-tunnel.json`, com PIDs, versão, porta e estado. Queries, headers e payloads não são persistidos pelo receptor/launcher. A sessão encerra automaticamente em sessenta minutos.

## Encerrar

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/pix-tunnel-stop.ps1
```

O script confere executável, comando, PID pai e destino antes de encerrar o túnel registrado. Confere também o comando do receptor antes de pará-lo. Não encerra a API, o painel, worker, PostgreSQL ou outros túneis. Se o registro não corresponder ao processo esperado, interrompe a operação para inspeção.

## Conferência realizada

Em 14/10/2026, receptor local e túnel iniciados. Consulta externa HTTPS a `/health` retornou 200 com o marcador isolado; `/.env` e `/api/v1/auth/me` retornaram 404. Callback com código sintético retornou 503, sem refletir o código. Quatro testes novos cobrem isolamento/headers, callback fechado, webhook fechado e caminhos de arquivos/produto.

OAuth e recebimento autêntico de webhook ainda precisam de prova real. O handler de webhook foi implementado e testado localmente conforme o guia abaixo; não cadastrar o callback OAuth como pronto.

## Webhook de teste

No painel da aplicação, Webhooks > Configurar notificações oferece **Modo de teste**, URL para teste e **Order (Mercado Pago)**. Usar somente essa aba e o hostname da sessão atual acrescido de `/webhooks/mercadopago`. O responsável salva no painel e copia a **Assinatura secreta** para `MP_SPIKE_WEBHOOK_SECRET=` em `.local/pix-spike.env`, sem enviar a chave no chat. Essa configuração já foi realizada na sessão inicial. Reiniciar somente o receptor após alterar a assinatura; túnel ainda ativo pode ser mantido. Health deve indicar `sandbox-webhook` e `webhookReady: true` após pré-validação da conta e da order por GET.

O handler exige HMAC-SHA256 v1, comparação em tempo constante, `data.id` único da order conhecida, `x-request-id` único e timestamp com tolerância de cinco minutos (segundos ou milissegundos). Manifest usa o ID da query literalmente, conforme `buildManifest` do [SDK oficial Node](https://github.com/mercadopago/sdk-nodejs/blob/master/src/utils/webhook/index.ts). JSON limitado a 16 KiB; exige `type: order`, `live_mode: false`, ID do corpo igual ao assinado e identidade consistente quando informada. Não aceitar eventos produtivos nem relaxar validações para fazer o simulador passar.

Consulta exclusivamente GET `/v1/orders/{id}` no domínio fixo do provedor, sem redirects. Confere recebedor, aplicação da credencial de teste, referência, país, valor exato, Pix e estados da order/transação. Dados financeiros do corpo não confirmam pagamento. Evidência em `.local/pix-webhook-inbox.json` contém hashes de entrega/corpo, estado e confirmação simulada; nenhum token, assinatura, payload completo ou QR. Atualização temporária, fsync e rename antes de HTTP 200; erro de consulta/gravação retorna 503 para retry.

Orders pode omitir ID de evento no corpo. Neste ensaio a deduplicação usa hash de recurso + `x-request-id` assinado: repetição igual retorna 200, corpo divergente para a mesma entrega 409; outro ID de entrega consulta novamente. Até cem entregas, um processamento por vez; concorrente retorna 503. Essa inbox é evidência isolada, não a futura inbox transacional do produto. Reinício mantém deduplicação. Nenhuma cobrança local ou liberação de original é alterada.

Nove testes novos cobrem assinatura/timestamp/query, ambiente/identidade, conciliação divergente, retry, persistência, replay após reinício, conflito, concorrência e tamanho/formato.

Em 14/10/2026, responsável salvou a configuração e a assinatura local. Receptor iniciou após consultar conta e order reais de teste; health via loopback/HTTPS confirmou sandbox-webhook. Simulação Order enviada pelo painel à URL para teste passou pela verificação de assinatura, mas foi corretamente rejeitada com 400: corpo fictício informava live_mode true, Visa/Point, valor e referência divergentes. Nada persistido como confirmação. Não usar o sucesso de assinatura dessa simulação como prova de notificação real da order de sandbox, conexão OAuth ou condições de produção. Túnel/receptor encerrados após o ensaio; próxima sessão requer nova URL temporária no painel.
