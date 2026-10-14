# Comentários nos arquivos

O cliente abre **Comentários** no arquivo do portal e confirma o e-mail cadastrado antes de ler ou escrever comentários. O criador consulta o mesmo histórico em **Comentários**, no cartão do arquivo do projeto. Não há envio automático de mensagens ou e-mails sobre comentários nesta etapa.

Somente arquivos READY da versão PUBLISHED atual, com análise de segurança vigente no original e na fonte manual, aceitam comentários novos. Versões SUPERSEDED ficam para consulta. Rascunhos não são acessíveis pelo convidado. Projeto arquivado, sessão/link expirado ou revogado e e-mail do cliente alterado bloqueiam acesso convidado; o criador continua consultando seu histórico.

Texto de até quatro mil caracteres é exibido literalmente, sem interpretar HTML/Markdown. Comentários são persistidos com arquivo, versão, workspace, sessão convidada, e-mail confirmado e horário; e-mail/sessão/chaves não são expostos nas respostas. O registro não pode ser editado ou apagado pelo portal nesta etapa.

## Referência na prévia

- Geral: pode ser usado em qualquer arquivo liberado, inclusive ZIP sem prévia.
- Momento de áudio/vídeo: informe o segundo do trecho de prévia. O cliente converte para milissegundos; servidor exige intervalo de zero à duração do derivado disponível.
- Ponto na imagem: posições horizontal/vertical entre 0% e 100%, convertidas para coordenadas entre zero e um. Zero corresponde à borda esquerda/superior.
- Ponto no PDF: informe página existente e posições. ZIP com fonte manual PDF/imagem aceita as referências dessa fonte, sem extrair o original.

Referências específicas só aparecem quando a prévia correspondente está pronta. API valida combinação exata de campos, tipo, página, coordenadas e tempo, independentemente da interface. A posição é informada pelos campos do formulário; nesta parte não há seleção por clique sobre pixels nem captura automática do tempo do player.

## Concorrência, limites e histórico

Cada tentativa leva clientRequestId UUID gerado no aplicativo. Repetir o mesmo payload/ator com esse identificador retorna o comentário já gravado; mudar o payload mantendo o identificador retorna 409. O aplicativo conserva o identificador ao repetir um envio com resposta perdida e gera outro se o texto/referência mudar. Repetição de tentativa já concluída pode retornar o registro histórico, sem criar comentário novo em versão superada.

Escrita exige identidade atual e valida tudo em transação Serializable, serializada com publicação/arquivamento pelo projeto. Nova publicação concorrente ou projeto alterado podem exigir atualizar antes de continuar. Até duzentos comentários por arquivo e mil por versão, com paginação cronológica (horário e ID). API limita novas tentativas de envio a trinta por minuto/IP.

Comentários não consomem rodadas de revisão. **Pedir ajustes** e revisões incluídas foram implementados na etapa seguinte; consulte [rodadas-ajustes.md](rodadas-ajustes.md). Aprovação e pagamentos continuam posteriores. Nenhum original é liberado ao comentar e nenhuma nova URL de armazenamento é criada por esse fluxo.

## Verificar

PostgreSQL isolado cobre autenticação/identidade/CSRF, auditoria sem exposição de e-mail, repetição concorrente, âncoras válidas/inválidas, workspace e outro projeto publicado no mesmo workspace, rascunho oculto, cursor, segurança vencida, limite concorrente e publicação concorrente/histórico. Flutter cobre três larguras, texto literal, identidade ausente, leitura pelo criador/histórico, resposta perdida, conversão de página/posição/tempo e atualização de referências preservando o rascunho do comentário.

A migration incremental `20261014000200_asset_comments` acrescenta somente a tabela/relações/constraints de comentários. Não muda arquivos R2, códigos de e-mail ou estado de publicação de dados anteriores. Conferência manual dos comentários confirmada pelo responsável em 14/10/2026.
