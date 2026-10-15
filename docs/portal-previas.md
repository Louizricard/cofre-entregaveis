# Compartilhamento e portal de prévias

O criador publica a versão e abre **Compartilhar prévias**. Escolhe validade de 1, 7 ou 30 dias e cria o link. Copie e guarde: o segredo só aparece nessa resposta, não pode ser recuperado na listagem. O backend aceita expiração entre 5 minutos e 30 dias e até dez links ativos por projeto. Revogar um link não altera os outros.

Quem possui o link pode visualizar o projeto, saldo informado, versões publicadas e prévias; não precisa de conta de criador. Rascunhos, e-mail do cliente, dados do workspace, chaves de originais e detalhes de uploads não são retornados. Histórico SUPERSEDED é permitido para consulta. Listas têm paginação; arquivos são limitados aos cem registros da versão. Este guia descreve o recorte inicial de prévias. As entregas posteriores adicionaram identidade, comentários, aprovação e solicitação de originais condicionada à [quitação manual auditada](quitacao-manual.md); as prévias continuam sem fallback para original.

## Token e sessão

Cada link usa 32 bytes aleatórios (256 bits); somente SHA-256 é armazenado em ShareLink. O link local usa `/#/s/:token`, mantendo o segredo no fragmento, que não faz parte da requisição HTTP de navegação. A interface substitui a entrada do histórico por `/portal` antes do bootstrap, sem enviar token por query, extras de rota ou armazenamento local. O ticket existe somente em memória e é consumido uma vez. `Referrer-Policy: no-referrer` na API e meta referrer na página; logs da API registram somente método, estado e requestId.

O cliente encerra eventual sessão convidada anterior antes de abrir outro link. `POST /guest/bootstrap` exige origem/JSON/CSRF e troca o segredo por cookie opaco HttpOnly/SameSite=Lax, Secure e prefixo __Host- em produção. O cookie convidado é diferente do cookie do criador. Seu hash fica em GuestSession, ligado ao ShareLink; expira em até oito horas ou na expiração do link. Até mil sessões vigentes por link; bootstrap limitado a dez tentativas por minuto/IP. Abrir outro link rota o cookie e revoga a sessão convidada anterior desse navegador.

Recarregar `/portal` usa o cookie existente. **Encerrar acesso** revoga essa sessão e limpa o cookie; não revoga o link, que pode ser aberto novamente enquanto válido. Falha ao trocar um link não reutiliza a tela anterior como fallback; solicite/abra novamente um link válido. Nenhum token de login ou compartilhamento fica em localStorage/sessionStorage.

## Autorização e prévias

Toda consulta verifica sessão, expiração/revogação do link e projeto ativo. IDs de versão/arquivo devem pertencer ao projeto e workspace do link, com estado PUBLISHED/SUPERSEDED. O cookie convidado não passa pelo guard do criador. Publicar uma nova versão atualiza o portal; somente criar rascunho não altera o que o convidado vê.

URLs vêm do serviço de derivados privados; nunca há fallback para original. Análise CLEAN vigente continua obrigatória para arquivo e fonte de prévia manual, inclusive no histórico. Após assinatura, o acesso é conferido novamente antes de retornar a URL. Revogar invalida sessões relacionadas numa transação; projeto arquivado também bloqueia bootstrap/consultas. URLs já emitidas permanecem válidas por até 60 segundos, e arquivos já carregados podem permanecer na tela; não é possível recolher conteúdo já obtido.

A prévia de ZIP usa somente o derivado marcado da imagem/PDF vinculada. ZIP sem vínculo mostra ausência de prévia. O convidado pode renovar a URL ou consultar páginas, mas não reprocessar arquivos, alterar vínculos ou liberar originais. MP4/áudio continuam usando os derivados limitados e os controles nativos do visualizador.

## Executar e testar

Aplique `pnpm db:migrate` após gerar o Prisma, mantenha API/worker/R2 conforme os guias anteriores e execute Flutter com `--no-web-resources-cdn`, tanto em `run` quanto `build web`. Os recursos do Flutter ficam na mesma hospedagem; a página não adiciona scripts de terceiros. Em produção, hospede app/API com HTTPS na mesma origem, mantenha no-referrer e omita caminhos secretos de logs de acesso. Esta entrega não publica o sistema na internet.

Neste PC, copie o link em **Compartilhar prévias** e abra em uma guia anônima. Confirme que a barra termina em `/#/portal`, veja a prévia e tente revogar pelo painel do criador. Atualizar o portal deve negar acesso. Links localhost funcionam apenas no PC que executa a aplicação; hospedagem é uma etapa separada.

Testes PostgreSQL cobrem workspace/projeto distintos, rascunhos ocultos, ausência de chaves originais, CSRF, validade, rotação/expiração de sessão, revogação durante assinatura, arquivamento, rate limit e criação concorrente no limite de dez links. Flutter verifica criação/cópia/revogação, segredo exibido uma vez, troca da rota/histórico antes do bootstrap, visualizador sem retry privilegiado, histórico e encerramento em 360/768/1440 px. O responsável confirmou o funcionamento do portal e dos testes manuais orientados após a validação automatizada.

Identidade por código de e-mail é necessária antes de comentários/aprovação conforme o PRD. A etapa seguinte implementou esse fluxo, descrito em [identidade-cliente.md](identidade-cliente.md), mas ainda aguarda configuração e teste do remetente real. Possuir o link concede somente leitura de prévias; não afirma identidade do visitante.
