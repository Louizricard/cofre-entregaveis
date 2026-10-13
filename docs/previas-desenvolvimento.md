# Prévias privadas de imagem e PDF

Esta parte entrega prévias para conferência do criador autenticado. Não implementa portal convidado, publicação, aprovação, vídeo/áudio, prévia manual de ZIP ou verificação de malware. F04 do PRD ainda não está completo.

## Executar

1. Aplique as migrations com `pnpm db:migrate` e mantenha a configuração R2 privada descrita em [r2-desenvolvimento.md](r2-desenvolvimento.md).
2. Use Python 3.12+ com as versões de `apps/media_worker/requirements.txt`. Em um ambiente virtual dedicado: `python -m pip install -r apps/media_worker/requirements.txt`.
3. Defina `MEDIA_PYTHON` no `.env` com o caminho absoluto do executável desse ambiente. No segundo PC, o runtime Python já disponível foi configurado localmente; esse caminho não é versionado.
4. Inicie a API, o Flutter e, em outro terminal, `pnpm media:worker`. O worker é um processo Node separado. A API continua aceitando uploads quando ele está desligado; os jobs aguardam no banco.
5. No projeto ativo, envie PNG/JPEG/WebP ou PDF e clique em **Ver prévia**. A janela consulta o processamento, mostra páginas de derivados e permite atualizar URLs expiradas ou reprocessar uma falha definitiva. Não exibe o original como fallback.

O CLI também aceita `node apps/api/dist/src/media-main.js --once` após o build, para executar um ciclo. Interrupção normal aguarda o ciclo atual. O worker não deve ser iniciado várias vezes por engano; concorrência é suportada por transações, mas cada processo aumenta o uso de CPU/disco.

## Fila, cotas e recuperação

- Upload validado e job são persistidos na mesma transação PostgreSQL. A tabela MediaJob é a própria fila/outbox, sem broker externo; unicidade por asset evita entrega duplicada no perfil fixo `image-pdf-v1`. O worker também inclui arquivos READY anteriores à migration, em projetos ativos.
- Reivindicação em transação Serializable com retry. Cada tentativa tem um MediaRun próprio, chaves aleatórias separadas e lease de 10 minutos. Um ciclo tem deadline de 5 minutos, e o parser tem timeout de 180 segundos. A recuperação aguarda o lease expirar antes de remover objetos de uma tentativa abandonada.
- Reserva conservadora de 32 MiB por tentativa dentro dos mesmos 10 GiB do workspace. Na conclusão, a reserva é substituída pelos bytes reais dos derivados. A cota apresentada inclui originais e prévias; gerar prévias pode aumentar o uso após o envio.
- Manifesto de chaves é persistido antes de escrever no R2. Perda de resposta, crash ou erro de parser mantém a reserva até a limpeza confirmada. Falhas de limpeza aguardam ao menos 60 segundos antes de repetir; tentativas de processamento são limitadas a três. Após falha definitiva e limpeza, o criador pode reprocessar explicitamente.
- Não há exclusão automática de originais. Arquivamento bloqueia novas URLs de prévia, mas uma URL já emitida dura até 60 segundos. Processamento em andamento pode finalizar após o arquivamento; seus derivados continuam privados.
- Temporários ficam numa pasta dedicada `cofre-media` no diretório temporário do sistema. O ciclo remove sua pasta ao terminar; ciclos seguintes removem somente pastas `run-*` dessa área com mais de uma hora, para recuperação após crash.

## Renderização e limites

PNG/JPEG/WebP estáticos: até 40 milhões de pixels, máximo 1600 × 1600 na saída. Imagens animadas são recusadas. PDF: até 100 páginas, rasterizadas individualmente, sem servir o PDF original no visualizador. Todas as saídas são JPEG, com marca d’água gravada nos pixels, sem EXIF de origem, até 32 MiB por conjunto.

O parser recebe somente caminhos temporários e MIME permitido, sem nomes do usuário em comandos de shell. Seu ambiente não contém credenciais PostgreSQL/R2. Windows Job Objects aplicam 768 MiB, 90 segundos de CPU e um processo; Linux usa rlimits de memória/CPU/tamanho de arquivo. Ausência de suporte aos limites causa falha, sem executar o parser sem contenção. O processo pai aplica timeout e só prossegue após o subprocesso fechar.

Esses mecanismos contêm recursos; **não são sandbox completa de acesso a arquivos/rede**. Não há varredura antivírus nesta parte. Antes de aceitar arquivos externos ou abrir um portal de convidados, definir isolamento de identidade/filesystem/rede do worker e implementar análise de malware com política de falha fechada. Nenhuma saída desta parte deve ser tratada como aprovação de segurança do original.

Referências: [limites de Job Objects](https://learn.microsoft.com/en-us/windows/win32/api/winnt/ns-winnt-jobobject_basic_limit_information), [Job Objects](https://learn.microsoft.com/en-us/windows/win32/procthread/job-objects), [API do PDFium Python](https://pypdfium2.readthedocs.io/en/stable/python_api.html).

## Validação em 13/10/2026

- 9 testes unitários API; 32 testes de integração reportados (28 cenários e 4 pais), incluindo reivindicação concorrente, recuperação de lease, falha de gravação/limpeza, retries, cota e isolamento A/B. Cada suíte tem schema próprio para que um worker simulado não consuma objetos de outra suíte.
- 5 testes Python com parsers reais: redução/marca d’água/EXIF, PDF de duas páginas, PDF corrompido, limite de páginas e limite de memória imposto pelo sistema.
- 22 testes Flutter, análise e build Web release. Testes do visualizador cobrem fila/falha/retry, formato sem suporte e navegação de páginas; usam adapters simulados.
- Teste real por HTTP local + worker + R2, em workspace sintético separado: PNG e PDF enviados, derivados JPEG privados com CORS conferido, original preservado por SHA-256, reserva zerada. Projeto sintético arquivado e sessão encerrada; seus pequenos objetos permanecem privados no bucket de desenvolvimento.
- Conferência visual de um JPEG sintético baixado confirma a marca d’água gravada. O responsável também confirmou o novo visualizador no navegador em 13/10/2026, com captura mostrando PDF de uma página renderizado com marca d’água.
