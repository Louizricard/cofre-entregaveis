# Ensaio OAuth do vendedor

Preparado em 14/10/2026. Integração isolada de viabilidade; não pertence à API do produto nem habilita cobranças ou downloads. Fluxo Authorization Code com state aleatório de uso único, PKCE S256 e troca explícita `test_token: true`, conforme [OAuth oficial](https://www.mercadopago.com.br/developers/pt/docs/security/oauth/creation).

## Preparação realizada

Responsável ativou as credenciais da aplicação após revisar dados/termos e salvou Client Secret somente em `.local/pix-oauth.env`. Client ID preparado corresponde à aplicação integradora. Credenciais de teste anteriores permanecem separadas em `.local/pix-spike.env`; `.env` do produto preservado.

Vendedor esperado é a conta brasileira de teste criada automaticamente pela aplicação Orders, cujo ID já foi confirmado por GET no ensaio anterior. Não criar outra conta ou inferir ambiente por prefixo de token. A [documentação de contas de teste](https://www.mercadopago.com.br/developers/pt/docs/checkout-api-orders/resources/test-accounts) confirma a criação automática e a disponibilidade de usuário, senha e código de verificação no painel.

Callback HTTPS temporário preparado, PKCE marcado Sim e configuração salva pelo responsável. Usar exatamente a URL da sessão de túnel atual acrescida de `/oauth/callback`; não usar a página pública estática como callback. Publicação da página, ativação administrativa e gravação de callback não comprovam seller OAuth ou compatibilidade do Pix conectado.

## Execução assistida

1. Manter o painel do integrador na sessão principal e fazer login com usuário/senha do vendedor de teste em uma janela anônima. Se solicitado, usar o código de verificação da conta de teste mostrado no painel. Não compartilhar esses valores no chat.
2. Conferir o túnel atual, callback registrado e `.local/pix-oauth.env`: `MP_OAUTH_CLIENT_ID`, `MP_OAUTH_CLIENT_SECRET`, `MP_OAUTH_EXPECTED_TEST_SELLER_ID`, `MP_OAUTH_REDIRECT_URI`. Não alterar a credencial testada da aplicação para substituí-la pelo segredo OAuth.
3. Reiniciar somente o receptor isolado quando o vendedor estiver pronto. Ele consulta a configuração local, cria uma tentativa em memória e escreve a URL de autorização em `.local/pix-oauth-start.json`, ignorado pelo Git. State aparece somente nessa URL local; verifier não é persistido. Não imprimir/registrar a URL em logs ou abrir o callback no navegador de automação com códigos reais expostos.
4. Na mesma janela anônima do vendedor de teste, abrir a URL de autorização local e conferir aplicação, conta e permissões antes do consentimento manual. A tentativa dura dez minutos a partir da inicialização do receptor; reinício cria outra e invalida a anterior.
5. Callback valida state, prazo, unicidade, código e origem/caminho esperados. Consome a tentativa antes da chamada de rede; concorrência, repetição, consentimento negado e erro após troca não reutilizam a tentativa. Token é trocado somente no endpoint fixo HTTPS do provedor, sem redirects, com PKCE e test_token true.
6. Exigir user_id esperado na resposta, bearer válido e ausência de live_mode true. Em seguida, GET autenticado de identidade exige ID esperado, site MLB e tag test_user. Conta real, outro país ou recebedor divergente não confirmam conexão.
7. Somente após essas conferências, gravar `.local/pix-oauth-evidence.json` com horário e booleanos sanitizados. Não gravar código, state, verifier, access token, refresh token, segredo ou resposta completa. Tokens são descartados após a prova; o teste futuro de cobrança com token OAuth exigirá nova autorização e implementação própria. A API do Cofre não é alterada.

Callback responde 303 para uma rota fixa e limpa, sem refletir código/state. Página de conclusão é deliberadamente neutra: apenas o arquivo local de evidência confirma a conta testada, nunca pagamento. Rota pública `/oauth/start` não existe; terceiros não podem iniciar tentativas pelo túnel. Console emite somente códigos de resultado fixos. Falha de rede/troca/persistência não confirma prova; requer nova tentativa.

Antes de criar outra tentativa, encerrar ou revisar a anterior. Ao terminar a sessão, usar o script de encerramento do túnel; nenhum segredo ou evidência é enviado ao Git. Revise concessões de teste no provedor conforme necessidade. Essa implementação não substitui armazenamento cifrado, refresh/revogação e inbox transacional necessários ao produto.

## Verificação local

Build, lint, typecheck e contratos passaram; 44 unitários API no total. Oito testes novos verificam configuração restrita, PKCE/state e corpo da troca, identidade autenticada, state/código ambíguos, expiração/negação, concorrência/replay, conta real/divergente, falhas sem vazamento e callback HTTP com URL limpa. Chamadas dos testes unitários são simuladas.

## Prova real de sandbox

Em 14/10/2026, responsável entrou com o vendedor de teste em janela anônima, revisou e autorizou a conexão. Callback real concluído às 19:42:30 (America/Sao_Paulo); evidência local confirmou `status: verified`, `sandboxSellerVerified: true`, `stateVerified: true`, `pkceUsed: true`, `tokensPersisted: false`. Log sanitizado registrou somente `SANDBOX_SELLER_CONNECTED`.

A troca Authorization Code foi feita com test_token true e o GET autenticado de identidade confirmou recebedor esperado, site MLB e tag test_user. Nenhum token, código, verifier, resposta completa ou dado pessoal foi registrado na evidência. Não houve chamada de criação de cobrança nessa prova OAuth. Rota final removeu a query por 303; responsável confirmou redirecionamento.

Túnel e receptor encerrados após a prova. Tokens foram descartados conforme escopo desta ferramenta; o ensaio de Pix com o token do vendedor exigirá nova autorização e implementação específica. Criação/consulta Pix anterior usava a credencial de teste da aplicação, não deve ser apresentada como evidência de cobrança por OAuth. Notificação legítima da cobrança de sandbox, conciliação por evento, expiração/cancelamento/estorno e condições produtivas continuam pendentes; gate F10 aberto.
# Revisão de permissões (15/10/2026)

O hook de cobrança passou a exigir `read` e `write` na resposta OAuth antes de receber o token. Seleção de scopes no painel e identidade autenticada não substituem essa conferência. Evidência registra somente readScopeGranted/writeScopeGranted, além dos booleanos anteriores; access/refresh token continuam sem persistência. Prova OAuth apenas de identidade pode retornar sem hook, mas falta de scopes bloqueia cobrança conectada com PAYMENT_SCOPES_REQUIRED. Permissões das tentativas antigas não foram preservadas: não inferir que a falta delas causou o HTTP 422. Ver [auditoria técnica](pix-auditoria-tecnica.md).

