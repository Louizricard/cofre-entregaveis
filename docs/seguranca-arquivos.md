# Análise de segurança dos arquivos

O worker verifica cada original READY com ClamAV antes de liberar download ou processamento de prévias. Isso inclui ZIP, fontes de prévia manual e arquivos anteriores à migration. O portal de leitura de prévias foi acrescentado na etapa seguinte; consulte [portal-previas.md](portal-previas.md).

## Preparar e executar no Windows

1. Aplique `pnpm db:migrate` e configure o bucket privado conforme [r2-desenvolvimento.md](r2-desenvolvimento.md).
2. Prepare Python 3.12 com as dependências de `apps/media_worker/requirements.txt` em uma pasta exclusiva de ferramentas. Configure `MEDIA_PYTHON`, `MEDIA_FFMPEG` e `MEDIA_FFPROBE` com caminhos absolutos. Não use o repositório ou perfil pessoal como raiz de runtime.
3. Instale o [ClamAV oficial](https://github.com/Cisco-Talos/clamav/releases) e defina `CLAMAV_SCAN` com o caminho absoluto de clamscan.exe e `CLAMAV_DATABASE` com a pasta exclusiva de assinaturas. Neste PC foi validado o LTS 1.4.6; ZIP SHA-256 `57b6fd1d60cd87bafe800f97407ecdef0576d36b3900b8b7abcfbbabe88295fd`. O 1.5.4 apresentou incompatibilidade de acesso à base no AppContainer deste ambiente; não foi usado como alternativa fora do isolamento.
4. Execute `pnpm security:update` para buscar assinaturas oficiais com FreshClam. O comando não envia arquivos de usuários; grava configuração e log locais em `.local`, ignorada pelo Git. Execute regularmente, inclusive antes de retomar o desenvolvimento. Não há agendamento automático nesta entrega.
5. Inicie API, Flutter e `pnpm media:worker`. O worker faz análise e geração de prévias em ciclos. Sem scanner, base válida ou suporte a AppContainer, os arquivos permanecem bloqueados.

O banco daily deve ter no máximo 72 horas; main e bytecode também são obrigatórios. Cada liberação CLEAN dura 24 horas. Após expirar, novas URLs ficam bloqueadas até nova análise; URLs já emitidas continuam válidas por até 60 segundos. A versão da base e o SHA-256 do conteúdo analisado ficam registrados. Antes de renderizar, o worker confere novamente o hash do original baixado.

## Estados e recuperação

- PENDING/RUNNING: aguardando análise ou análise em andamento. Original, prévia e associação manual ficam bloqueados.
- CLEAN: scanner terminou sem detecção ou erro e com relatório válido. Permite o fluxo autenticado do criador enquanto a análise estiver vigente.
- REJECTED: detecção, arquivo cifrado ou limite de inspeção atingido. Não há botão para ignorar a rejeição. O original permanece privado, ocupa cota e não é apagado automaticamente.
- ERROR: scanner indisponível, base vencida, timeout ou falha operacional. Até três tentativas automáticas, com intervalo mínimo de um minuto; depois, **Repetir análise de segurança** inicia novo ciclo. Nunca equivale a CLEAN.

A reivindicação usa transação e token de lease de oito minutos; uma execução abandonada pode ser recuperada. Prazo total da análise: quatro minutos. Pastas temporárias próprias são removidas ao terminar; pastas abandonadas com mais de uma hora são recuperadas em ciclos posteriores.

## Isolamento validado

Scanner e parsers rodam em AppContainers Windows descartáveis, sem capabilities de rede. Cada execução recebe leitura do original, script exato e runtimes dedicados, e escrita apenas na sua área temporária, além dos recursos padrão do Windows e do perfil próprio do AppContainer. O processo não recebe credenciais de banco/R2 nem handles do serviço; somente entrada NUL e log privado. As permissões concedidas usam um SID exclusivo e são removidas ao terminar. Um registro durável fora da área do filho permite recuperar permissões/perfis abandonados após uma hora.

Processos são criados suspensos e associados a Job Object antes de executar: renderização com 768 MiB agregados, até dois processos e limite externo de CPU de 120 s; scanner com 3 GiB, um processo e 120 s de CPU. O parser conserva seu limite interno de 90 s e timeout de 180 s. Fechar o Job encerra os descendentes. FFmpeg herda o isolamento; protocolos e demuxers continuam restritos.

O adaptador AppContainer foi validado somente no Windows. Outros sistemas falham sem executar parsers desprotegidos; precisam de implementação própria de isolamento antes de uso. Antivírus e isolamento reduzem risco, mas não comprovam ausência de malware. Sessão convidada limitada para leitura foi acrescentada posteriormente. Identidade confirmada, revisão e aprovação continuam pendentes. Publicação de versões foi acrescentada na etapa seguinte, conforme [publicacao-versoes.md](publicacao-versoes.md).

## Verificar

Com as variáveis das ferramentas disponíveis no ambiente, execute `python -m unittest discover -s apps/media_worker -p 'test_*.py'`. Os 18 testes incluem parsers reais, token AppContainer, negação de rede/leitura externa/escrita no runtime, timeout, base ausente/vencida e detecção de uma assinatura sintética inofensiva dentro de ZIP. Não desative o antivírus do Windows e não envie malware real para testar.

API/PostgreSQL cobrem bloqueio por estado, isolamento de workspace, concorrência, expiração, retries, lease abandonado e hash alterado. Flutter cobre estados pendente/rejeitado/erro e recuperação. O teste com R2 usa somente arquivos sintéticos benignos.

Referências: [AppContainer](https://learn.microsoft.com/en-us/windows/win32/secauthz/implementing-an-appcontainer), [isolamento Windows](https://learn.microsoft.com/en-us/windows/win32/secauthz/appcontainer-isolation), [ClamAV scanning](https://docs.clamav.net/manual/Usage/Scanning.html), [FreshClam](https://docs.clamav.net/manual/Usage/SignatureManagement.html).
