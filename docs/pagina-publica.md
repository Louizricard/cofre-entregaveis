# Página pública do Cofre

Página de apresentação criada em 14/10/2026 com o plugin Sites, a pedido do responsável. Fonte em `apps/public_site`, independente da API, Flutter, banco, R2 e ensaios de pagamento. Contato público autorizado: perfil GitHub `Louizricard`; nenhum e-mail pessoal publicado.

Publicada em **https://cofre-entregaveis.yummyscout32.chatgpt.site**, com audiência pública. Versão 1, fonte `a8835aeb9bc6367be4417cf051b8084aa33808b0`, deployment `appgdep_6acfff72a41481918fde08385091e492` confirmado `succeeded`. Consulta HTTPS sem cookies/autenticação retornou 200 com conteúdo da página, sem formulário de login; página publicada também aberta e conferida no navegador. A URL pode ser apresentada ao Mercado Pago como site do projeto, sujeita aos critérios do provedor.

## Conteúdo e funcionamento

- Apresentação para freelancers e pequenos estúdios, fluxo de arquivos/versões, comentários/ajustes e aprovação.
- Demonstração ilustrativa com abas de versões, feedback e aprovação; cliques e teclado (setas, Home, End), sem arquivo real ou operações do produto.
- Estado de desenvolvimento explícito. Pix em validação, sem contratação, cadastro público, cobrança ou promessa de liberação já disponível.
- Navegação por âncoras, página de privacidade e link externo de contato com `noopener noreferrer`.
- HTML/CSS/JS estáticos, SVG próprio, fontes do sistema; sem dependências, formulários, cookies, armazenamento local, rastreamento ou chamadas à API no código da página. Hospedagem pode processar dados técnicos conforme aviso de privacidade.

## Construir

Com Node 24 disponível, na raiz do monorepo:

```powershell
node apps/public_site/build.mjs
node --check apps/public_site/site.js
```

O build copia somente cinco arquivos públicos para `apps/public_site/dist`, ignorado pelo Git. A fonte e `.openai/hosting.json` podem ser versionadas com o projeto; não incluir um `.git` dentro de `apps/public_site`.

## Publicação no Sites

Site registrado uma única vez: `appgprj_6acffce3bf888191bd6a07f5d2bcbe6c`. Manifesto preservado em `apps/public_site/.openai/hosting.json`, com `static.directory: dist`. Audiência pública escolhida porque o responsável solicitou uma página pública.

O checkout exclusivo de publicação fica em `.local/public-site-publish`, ignorado pelo monorepo, com histórico separado. Somente a fonte da página é copiada para ele. O helper oficial do Sites faz commit/push desse checkout e empacota a mesma fonte; isso não envia mudanças do monorepo ao GitHub. Nunca copiar `.env`, `.local`, banco, arquivos de cliente ou código do backend para o checkout público.

Na próxima edição, reutilizar o mesmo Site, renovar a credencial de escrita pela ferramenta Sites e mantê-la apenas em memória/stdin. Atualizar a fonte no checkout de publicação, seguir o helper oficial `site-workflow.mjs` e salvar/deployar a versão retornada, sem recriar o Site. Arquivo de publicação local: `.local/cofre-public-site.tar.gz`.

Compatibilidade Windows observada: o helper requer Bash disponível em `C:/Program Files/Git/bin`, além de Node no PATH. GNU tar requer `TAR_OPTIONS=--force-local` para não interpretar `C:` como destino remoto. Diferença de proprietário entre sandbox e usuário foi tratada com `safe.directory` restrito ao checkout exclusivo, apenas no ambiente do processo (`GIT_CONFIG_COUNT/KEY_0/VALUE_0`), sem mudar a configuração global ou confiar em todas as pastas.

## Verificação

Build estático e sintaxe JS passaram. Prévia local retornou HTTP 200. Navegação das abas por clique/setas/Home e página de privacidade conferidas. Larguras de viewport 360, 768 e 1440 conferidas sem overflow horizontal (largura útil desconta scrollbar). Captura de desktop revisada; aviso de demonstração reposicionado para não ser coberto pela nota visual. Uma interrupção do navegador durante reload foi recuperada restaurando o viewport; verificações restantes concluídas.

A publicação da página não comprova aprovação comercial ou habilitação de OAuth/Pix pelo Mercado Pago. Essa confirmação continua pertencendo ao gate do provedor.
