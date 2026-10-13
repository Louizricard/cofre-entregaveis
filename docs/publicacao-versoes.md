# Publicação de versões

Publicar congela os arquivos e o vínculo da prévia manual. O compartilhamento de prévias é uma ação separada, implementada na etapa seguinte e descrita em [portal-previas.md](portal-previas.md). Publicação não cria aprovação, cobrança ou permissão de download para convidados.

No projeto ativo, escolha a versão e clique em **Publicar versão**. A confirmação explica a imutabilidade. O servidor exige ao menos um original READY, nenhum envio em andamento, análise CLEAN vigente em todos os originais e prévias automáticas prontas. ZIP pode ser publicado sem prévia manual, apresentando apenas nome/tamanho quando o portal estiver disponível. Registros ABORTED/FAILED não fazem parte da entrega, mas continuam visíveis ao criador.

Uma versão publicada recebe estado PUBLISHED, horário e autor. Ao publicar outra versão mais recente, a anterior vira SUPERSEDED e permanece no histórico. Criar um rascunho não substitui a versão publicada atual. A versão atual é a única PUBLISHED por projeto, garantida por índice parcial no PostgreSQL. Não é permitido publicar um rascunho com número anterior à versão atual.

Arquivos novos e alteração/remoção do vínculo manual são bloqueados em PUBLISHED/SUPERSEDED. Análise de segurança e regeneração de derivados continuam possíveis; não alteram os originais nem o vínculo. Expiração/rejeição posterior da análise continua bloqueando novas URLs, mesmo em uma versão publicada. Downloads autenticados do criador conservam suas regras anteriores.

O endpoint `POST /api/v1/versions/:id/publish` recebe `{expectedProjectRevision}`. A listagem de versões fornece a revisão atual do projeto. Mudanças concorrentes retornam 409 e exigem atualizar a lista; publicação e troca da versão atual ocorrem em transação Serializable, serializada com envios, vínculos e arquivamento. Dois cliques concorrentes não publicam duas vezes. Sessão, workspace, origem e CSRF são obrigatórios.

A migration incremental `20261013000500_version_publication` conserva todas as versões anteriores como DRAFT. Não há publicação automática de dados existentes.

Validação: suíte PostgreSQL de publicação cobre autorização/CSRF, estados de arquivo, segurança vencida/rejeitada, prévia incompleta, revisão antiga, concorrência, imutabilidade, histórico e arquivamento. Flutter cobre confirmação em 360/768/1440 px, cancelamento e falha preservando o rascunho. A conferência manual do botão pelo responsável é separada desses testes automatizados.
