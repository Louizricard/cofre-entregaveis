# Rodadas de ajustes

No portal, confirme o e-mail do cliente e selecione a versão atual. Escreva os comentários nos arquivos primeiro. Depois abra **Pedir ajustes / Ver rodadas**, preencha o resumo e clique em **Pedir ajustes**.

O pedido guarda o resumo e uma lista imutável dos comentários existentes naquela versão. Um comentário isolado não consome revisão. Enquanto houver pedido em andamento, novos comentários e pedidos ficam fechados; o histórico continua disponível.

Pedidos dentro das revisões incluídas entram em **Em ajustes**. Ao atingir o limite, o portal avisa e registra **Aguardando decisão**. No painel do criador, abra o projeto e **Rodadas de ajustes**: aceite a rodada extra ou recuse com uma justificativa. Aceitar registra usuário, horário e motivo e conta uma rodada; recusar mantém o registro sem consumir revisão e reabre a coleta. Uma nova solicitação após recusa exige outra decisão. Não há cobrança automática nesta etapa.

Publicar a próxima versão marca pedidos em ajustes como **Nova versão publicada**. Pedidos extras ainda pendentes ficam **Superado pela nova versão**, sem consumir revisão. A nova versão abre a coleta novamente, preservando os pedidos anteriores. Essa conclusão operacional da rodada não representa aprovação do cliente.

## Conferência local

1. No portal, envie um resumo pela versão atual e confira o estado **Em ajustes** (ou **Aguardando decisão** se as revisões incluídas acabaram).
2. No painel do criador, abra **Rodadas de ajustes** e confira o mesmo resumo e a contagem de comentários. Se for extra, aceite ou recuse com motivo.
3. Para conferir a sequência inteira, publique uma nova versão, atualize o portal e veja o pedido anterior no histórico e a nova coleta disponível.

## Contrato e limites

- `GET /guest/revisions`: identidade confirmada, projeto obtido somente da sessão convidada.
- `POST /guest/revision-requests`: `{versionId, summary}` e `Idempotency-Key` UUID obrigatório, com origem/CSRF. Mesma sessão/chave/payload recupera o pedido, inclusive após publicação. Payload diferente conflita. Nova chave não cria um segundo pedido ativo.
- `GET /projects/:id/revisions`: sessão do criador e isolamento de workspace, inclusive consulta de projetos arquivados.
- `POST /revisions/:id/decision`: sessão do criador, origem/CSRF, `{decision: ACCEPT|REJECT, reason}`. Repetir decisão igual pelo mesmo usuário não altera a contagem; decisões incompatíveis conflitam.
- Até cem pedidos por projeto, incluindo recusados/cancelados; dez tentativas de pedido por minuto/IP. Listagem limitada pelo total máximo de registros do projeto. Resumo até 4.000 caracteres; justificativa até 1.000, ambos texto literal.
- Transações Serializable e incremento de revisão do projeto serializam pedido, comentário, decisão e publicação. Índice parcial garante somente um pedido OPEN/PENDING por projeto.
- Auditoria interna inclui identidade confirmada, sessão, tentativa, hash do payload, IDs dos comentários e decisão. Respostas não expõem e-mail, sessão, hashes ou chaves R2.
- A chave de envio permanece na interface para retry com o mesmo texto; editar o resumo gera outra chave. O cliente Dart gerado suporta o cabeçalho via transporte opcional próprio; CSRF continua sob controle do transporte autenticado.

Originais, aprovação e pagamentos continuam condicionados às próximas etapas. Envio de e-mail e processamento de arquivos não foram alterados nesta entrega.
