# Pix — validação de viabilidade

Pesquisa e ensaio inicial em 14/10/2026. Aplicação Cofre Entregaveis - Desenvolvimento criada pelo responsável com Checkout Transparente via Orders, após login, validação adicional e aceite dos termos. Aplicação anterior de outro projeto preservada. Credencial de teste salva somente em arquivo local ignorado; pré-validação autenticada confirmou usuário brasileiro de teste. Uma order Pix sintética foi criada, repetida com a mesma chave e consultada com sucesso. Estados observados: action_required na criação e processed/accredited na consulta posterior; confirmação simulada conciliada com sucesso. OAuth de vendedor e webhook não foram executados. Pix com vendedor conectado permanece não comprovado.

Esta etapa cumpre o início do gate da seção 8 do PRD. Aprovação da versão já foi confirmada manualmente. A implementação de cobrança Pix no produto depende da prova do fluxo de ponta a ponta no provedor, com dinheiro destinado ao criador conectado. Assinatura do Cofre continua separada.

## O que foi conferido nas fontes oficiais

- O modelo marketplace documentado usa token de cada vendedor obtido por OAuth. É candidato ao modelo do Cofre, ainda sem prova da combinação específica Pix/conta conectada. [Integração marketplace](https://www.mercadopago.com.br/developers/pt/docs/split-payments/split-1-1/integration-configuration/integrate-marketplace).
- Authorization Code oferece consentimento do vendedor, state e PKCE. A documentação prevê `test_token: true` para gerar credenciais de sandbox na troca do código. [OAuth](https://www.mercadopago.com.br/developers/pt/docs/security/oauth/creation).
- O teste atual de Pix na Orders API usa requisição predefinida, credencial de teste e consulta da order. O cenário APRO documentado começa pendente e muda automaticamente para aprovado. A documentação informa prefixo APP_USR também para essas credenciais de teste: o prefixo sozinho não comprova o ambiente. [Teste Pix](https://www.mercadopago.com.br/developers/pt/docs/checkout-api-orders/integration-test/pix).
- As famílias de API precisam ser escolhidas e verificadas juntas: o exemplo marketplace consultado usa Payments API, enquanto o teste Pix acima usa Orders API. Não combinar endpoints, formatos de estados ou eventos por suposição.
- Mercado Pago documenta contas de teste e validação de origem de notificações. O Cofre também exigirá persistência/deduplicação e reconciliação por consulta autenticada ao provedor, conforme o PRD. [Contas de teste](https://www.mercadopago.com.br/developers/pt/docs/checkout-api-orders/resources/test-accounts), [Webhooks](https://www.mercadopago.com.br/developers/pt/docs/split-payments/additional-content/your-integrations/notifications/webhooks?scope=prod).

Essas páginas orientam a prova. Não demonstram, por si, habilitação da conta, condições comerciais ou disponibilidade em produção para o Cofre.

## Sequência assistida

1. Entrar no Mercado Pago Developers com a conta existente, sem compartilhar login ou verificação.
2. Em Suas integrações, criar ou selecionar uma aplicação exclusiva para desenvolvimento do Cofre. Antes de escolher a solução, conferir no painel o suporte à conexão de vendedores e ao Pix. Não habilitar cobrança de produção como substituto de um teste.
3. Preparar os atores de teste necessários: integrador, vendedor e comprador. Guardar credenciais somente em arquivo local ignorado, separado do ambiente do produto; nenhum segredo no Flutter, Git, chat ou capturas.
4. Definir a família de API e os ambientes suportados pelo provedor. Confirmar callback OAuth e notificações HTTPS, incluindo correspondência exata de redirect URI. O endereço localhost não recebe webhooks externos. Qualquer endpoint público/túnel deve servir somente o ensaio isolado.
5. Conectar vendedor de teste por OAuth, com state de uso único e PKCE. Conferir conta recebedora e ambiente da credencial retornada. Não registrar código, tokens ou URL de callback em logs.
6. Criar uma cobrança sintética em sandbox, com referência única e idempotência. Consultar o registro autenticado no provedor e comparar recebedor, valor e moeda. Nenhum QR deve ser pago com conta bancária real.
7. Receber e validar notificações e executar a matriz abaixo. Se algum cenário não estiver disponível no sandbox escolhido, registrar a limitação e o caminho de homologação; não marcar o gate como concluído.

## Matriz de evidências

Pré-validação da credencial, criação, repetição idempotente e consulta da order passaram no ensaio inicial com a credencial de teste da aplicação. Consulta posterior confirmou processed/accredited tanto na order quanto na transação. Demais casos abaixo não executados; o gate de Pix com vendedor conectado continua aberto. Registrar somente evidências sanitizadas em Git; credenciais e payloads completos ficam fora do repositório.

| Caso | Evidência necessária |
|---|---|
| Compatibilidade | Família de API, produto habilitado e suporte a Pix com vendedor conectado confirmados. |
| OAuth | Consentimento de vendedor de teste, retorno para tentativa correta, conta/ambiente conferidos; state incorreto ou repetido rejeitado. |
| Criação | Cobrança sintética vinculada à referência do ensaio e ao vendedor esperado, em BRL e valor exato. |
| Idempotência | Repetir a criação após resposta perdida recupera a mesma cobrança; outra referência não reutiliza a tentativa. |
| Notificação | Evento autêntico recebido; assinatura inválida, identificador divergente e replay tratados. |
| Conciliação | Consulta ao provedor confirma cobrança, valor, moeda, recebedor e estado; retorno do navegador não quita cobrança. |
| Duplicação | Notificação repetida ou concorrente não duplica a quitação. |
| Divergências | Valor, recebedor, moeda ou referência diferentes impedem quitação. |
| Expiração/cancelamento | Estados terminais observados e nova tentativa não recupera indevidamente cobrança antiga. |
| Estorno | Reversão observada e bloqueio de novas liberações definido. |
| Produção | Requisitos de habilitação e condições do provedor confirmados para o modelo; não inferidos do sandbox. |

## Critério de saída

Somente após a prova e o registro das limitações, iniciar F10: conexão persistente cifrada por workspace, cobranças revisadas, tentativas idempotentes, inbox de webhooks e conciliação. F09 continua exigindo aprovação da versão atual, condição financeira válida, projeto/acesso ativos e original pronto com análise de segurança vigente. Nenhuma liberação é habilitada nesta preparação.

## Ferramentas do ensaio inicial

`pnpm pix:preflight` faz somente GET autenticado ao endpoint oficial de identidade. Confere User ID esperado, site brasileiro e marcador de usuário de teste. Falha sem criar cobrança em caso de divergência ou resposta desconhecida. Consulta documentada em [Credenciais](https://www.mercadopago.com.br/developers/pt/docs/checkout-api-orders/resources/credentials?scope=prod).

`pnpm pix:spike` começa pela mesma conferência. Usa o cenário APRO sintético de 50.00 descrito na documentação Pix Orders, sem QR pago por banco real. Cria/recupera uma order, repete corpo/chave, confere ID e consulta o recurso. Valida conta recebedora, aplicação de teste, referência, país, valor e meio Pix; concilia estados da order e da transação. Estado pendente é relatado como pendente, sem simular quitação local.

Ambos leem exclusivamente `.local/pix-spike.env`, separado do `.env` do produto. Campos: `MP_SPIKE_ACCESS_TOKEN`, `MP_SPIKE_USER_ID` e `MP_SPIKE_APPLICATION_ID`. Os IDs são os da credencial de teste exibida no painel, que podem diferir do número principal da aplicação. Nunca usar prefixo de token como prova de sandbox.

Tentativa persistida em `.local/pix-spike-state.json` antes do POST, com chave, referência, IDs esperados e ID da order; sem token, QR, senha ou resposta completa. Atualização usa arquivo temporário e rename para preservar a chave em falhas. Reexecutar recupera a mesma tentativa. Não apagar ou editar esse arquivo para repetir um ensaio pendente. Ferramentas não são importadas pela API/worker e não acessam o banco do Cofre.


Configuração avançada da aplicação inspecionada sem salvar mudanças: campo de retorno OAuth HTTPS, opção PKCE e scopes read/offline access/write disponíveis. Responsável concluiu nova verificação da conta; detalhes e credenciais de teste consultados não exibiram Client Secret. Área de produção pede categoria e site do negócio; responsável informou não ter site público. Ativação permanece pendente, sem inventar informações ou usar túnel como site comercial. Isso registra a limitação observada no painel, não prova que OAuth universalmente exige ativação produtiva.

Webhooks oferece Modo de teste no painel. Responsável salvou URL/evento e assinatura somente no arquivo local. Receptor ativado após pré-validação da conta e GET da order; health local/HTTPS confirmou sandbox-webhook. Envio pelo simulador do painel chegou e passou pela validação HMAC, mas retornou 400: mesmo selecionando URL para teste, o exemplo enviado tinha live_mode true, aplicação/usuário principais, cartão Visa, tipo Point, valor e referência fictícios divergentes do Pix APRO. Rejeição preservada; não relaxar o handler para aceitar esse exemplo produtivo. Recebimento e conciliação de uma notificação legítima da order de sandbox continuam pendentes. Callback OAuth permanece fechado; gate F10 aberto. Túnel temporário encerrado após o ensaio.


HTTPS temporário: [guia de execução e encerramento](pix-tunel-desenvolvimento.md). O endereço público fica somente em .local/pix-tunnel.json. API, painel e arquivos do Cofre não são encaminhados por esse túnel.

Após publicar a página pública e nova verificação manual da conta, formulário de credenciais de produção preenchido com Serviços de TI e https://cofre-entregaveis.yummyscout32.chatgpt.site. Painel pede autorização de uso de dados, aceite dos termos e reCAPTCHA antes da ativação. Responsável orientado a revisar e concluir pessoalmente se concordar; ativação e obtenção de Client Secret ainda não confirmadas. Arquivo isolado `.local/pix-oauth.env` preparado, ignorado pelo Git, sem segredo preenchido. Não substituir credenciais de teste do ensaio nem habilitar pagamentos reais no produto.

Responsável confirmou a ativação em 14/10/2026. Consulta limitada aos nomes dos campos confirmou Client ID e Client Secret disponíveis, além de Public Key/Access Token; nenhum valor foi emitido. Client ID do integrador preparado no arquivo isolado `.local/pix-oauth.env`; responsável orientado a salvar somente o Client Secret nesse arquivo. A ativação administrativa não executou pagamentos, não conectou vendedor e não alterou o `.env` do produto. Próxima prova continua sendo Authorization Code com state/PKCE e troca `test_token: true`, seguida de identificação positiva de conta de teste antes de qualquer order.

Client Secret salvo pelo responsável; presença conferida sem exibição. Módulo Authorization Code isolado implementado e testado localmente, com callback/PKCE salvos no painel pelo responsável. Em 14/10/2026 às 19:42:30 (America/Sao_Paulo), consentimento real do vendedor de teste em janela anônima e troca OAuth de sandbox passaram: state/PKCE conferidos, user_id esperado, GET autenticado confirmou MLB/test_user. Evidência somente com booleanos e horário, tokens descartados. Túnel e receptor encerrados após a prova. Próximo ensaio precisa criar/conciliar Pix com token do vendedor conectado; teste anterior com credencial da aplicação não comprova esse vínculo. Guia e evidências em [pix-oauth-desenvolvimento.md](pix-oauth-desenvolvimento.md). Gate F10 permanece aberto.
