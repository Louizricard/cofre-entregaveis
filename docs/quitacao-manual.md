# Beta com quitação manual e originais condicionados

Implementado a pedido do responsável em 15/10/2026 para avançar o produto enquanto a prova Pix via OAuth permanece pendente. Nenhum webhook ou retorno do ensaio quita cobranças do produto.

## Uso

1. Abra um projeto no dashboard e clique em **Cobrança / Quitação manual**.
2. Escolha registrar o valor integral recebido fora do Cofre ou dispensar a cobrança. Informe motivo/referência e marque a confirmação correspondente. Somente OWNER do workspace pode alterar a cobrança.
3. Confira o histórico com operação, motivo, responsável e horário. **Desfazer quitação** reabre a condição financeira e restaura o saldo; é um ajuste do registro, sem reembolso bancário.
4. No portal, o cliente confirma o e-mail, aprova a versão publicada atual e solicita **Baixar original**. O backend exige cobrança PAID ou WAIVED, projeto/acesso ativos, arquivo READY e análise CLEAN vigente. Uma nova publicação exige aprovação própria.

Cobrança zero também começa OPEN e exige dispensa explícita. Projetos existentes foram migrados para cobranças OPEN com seus saldos preservados; nenhum pagamento/dispensa foi inventado. Ainda não existe edição do valor de uma cobrança nem Pix automático no produto.

## Dados e transações

Invoice guarda valor original em centavos, BRL, número da cobrança, estado e revisão. ManualSettlement é histórico sem endpoint de alteração/exclusão, com ator, motivo, valor, revisão, hash do payload e chave idempotente. Unique por workspace/chave e invoice/revisão. Limite de 200 registros por cobrança; histórico retorna todos esses registros.

Mudanças usam transação Serializable, revisão esperada e cobrança atual do projeto. Repetir a mesma tentativa retorna o estado atual e não reaplica um pagamento antigo após reversão. Chave com payload/ator/cobrança divergente é recusada. A interface congela o payload e conserva a chave depois de resposta perdida; Atualizar recarrega o estado antes de uma operação nova.

POST /guest/assets/:id/download verifica sessão/identidade e relações workspace/projeto/versão/arquivo no servidor. Originais de versões superadas não são liberados. Registra OriginalGrant com sessão/e-mail, arquivo/versão, cobrança/revisão e expiração. URL assinada não é persistida. Há limite de 1000 grants por sessão e rate limit HTTP. Falha ao assinar não registra grant nem expõe URL.

URLs R2 expiram em até aproximadamente 60 segundos. Revogar link/sessão, desfazer quitação, arquivar projeto ou publicar nova versão bloqueia novas URLs. Uma URL já emitida pode funcionar até expirar; arquivo já baixado não é recuperável. Nenhum bypass de aprovação foi implementado.

## Verificação

- 115 testes de integração API passaram em PostgreSQL exclusivo de teste, com schema novo por suíte. Incluem quitação concorrente, replay após reversão, isolamento A/B, OWNER, CSRF, validação, dispensa zero, identidade/revogação, segurança vencida, nova versão e falha de assinatura.
- 80 unitários API, lint, typecheck e contratos OpenAPI/Dart passaram.
- 79 testes Flutter, analyze e build web passaram. Novos testes cobrem confirmação/motivo, resposta perdida com mesma chave/payload e download recusado sem abrir URL. Testes antigos de portal atualizados para a permissão condicionada de originais.
- Migração 20261015000100_manual_settlement aplicada no banco local após backup privado ignorado. Requer confirmação manual do fluxo na interface. Testes de assinatura usam adapter local; compatibilidade R2 real do caminho de convidado ainda deve ser conferida pelo responsável com um projeto de teste.

API local atualizada em localhost:3000; painel em localhost:8080. Nada publicado ou enviado ao GitHub nesta etapa.
