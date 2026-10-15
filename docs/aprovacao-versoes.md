# Aprovação da versão

No portal do cliente, selecione a versão atual e abra **Aprovar versão / Ver aprovação**. Confirme o e-mail neste acesso, revise os arquivos, marque **Revisei os arquivos e aprovo a versão** e clique em **Confirmar aprovação**. A tela mostra a confirmação e o horário registrado.

No painel do criador, abra o projeto, selecione a versão e clique em **Ver aprovação**. O criador consulta o registro; a confirmação é feita pelo cliente identificado no portal.

## Regras

- Aprovação pertence a uma versão específica. Publicar outra versão preserva a aprovação antiga no histórico e exige nova confirmação para a entrega atual.
- Aprovar fecha novos comentários e pedidos de ajustes daquela versão. Comentários existentes continuam para consulta. Para uma nova entrega ou novas alterações, publique outra versão.
- Pedido de ajustes OPEN ou PENDING impede aprovar. Uma nova publicação encerra a rodada OPEN ou supera PENDING. Recusar um pedido extra também remove esse bloqueio; aceitar mantém o trabalho em ajustes até a próxima versão.
- A versão precisa estar publicada e atual, em projeto ativo, com ao menos um arquivo pronto. Todos os arquivos da entrega precisam de análise CLEAN vigente e as prévias suportadas precisam estar prontas. Arquivos abortados/falhos não entram na entrega, conforme as regras de publicação.
- Identidade, expiração, revogação e vínculo do cliente são revalidados. Mudança do e-mail cadastrado exige confirmar novamente o acesso. Criador conserva consulta em projeto arquivado.
- O registro é imutável e guarda versão/workspace, sessão, e-mail confirmado e horário no servidor. A resposta expõe somente ID, versão, horário e autor genérico; não expõe e-mail, sessão, hashes ou chaves R2.
- Aprovação não registra pagamento nem libera originais. Cobrança e liberação da entrega continuam em etapas posteriores.

## Conferência manual

1. Se houver pedido de ajustes em andamento, publique a próxima versão antes de aprovar. Atualize o portal e selecione a versão atual.
2. Confirme o e-mail no portal, abra **Aprovar versão / Ver aprovação**, marque a confirmação e envie. Confira o estado aprovado.
3. No painel do criador, abra **Ver aprovação** e confira a mesma versão e o horário. Comentários e novos pedidos para essa versão ficam fechados.
4. Opcionalmente, publique uma nova versão: ela deve aparecer sem aprovação; a anterior conserva o registro no histórico.

## Contrato e concorrência

- `GET /guest/versions/:id/approval`: identidade confirmada e escopo do projeto da sessão. Rascunhos são ocultos; versões publicadas anteriores são consultáveis.
- `GET /versions/:id/approval`: sessão do criador e isolamento por workspace.
- `POST /guest/approvals`: `{versionId, confirmed: true}`, JSON, origem/CSRF e `Idempotency-Key` UUID obrigatório. Valores falsos, ausentes ou texto em `confirmed` são rejeitados.
- Uma aprovação por versão, garantida por índice único. Repetir a tentativa com a mesma sessão/chave/payload recupera o registro, inclusive após publicação de outra versão. Reutilizar a chave para outra versão dá conflito. Uma chave nova para uma versão anterior também dá conflito.
- Uma nova tentativa para a versão atual já aprovada recupera a aprovação existente, sem alterar autor ou horário. Tentativas são limitadas a cem por sessão e mil por versão; retries já registrados continuam disponíveis no limite. Endpoint limitado a dez tentativas/minuto/IP.
- Transações Serializable e revisão do projeto ordenam aprovação, publicação, comentários e pedidos de ajustes. Aprovação não altera o estado de publicação nem apaga registros anteriores.
- Migration incremental `20261014000400_version_approvals`. Nenhuma alteração em objetos R2, envio de códigos ou arquivos de clientes.
