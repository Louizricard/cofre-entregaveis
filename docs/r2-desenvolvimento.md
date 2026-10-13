# Cloudflare R2 — desenvolvimento privado

1. No painel Cloudflare, abra **Storage & databases → R2 → Overview**. Se a conta pedir ativação com faturamento/termos, o titular deve concluir essa etapa.
2. Crie um bucket Standard exclusivo de desenvolvimento, por exemplo `cofre-entregaveis-dev`. Mantenha **Public Development URL (r2.dev)** e domínio público desativados. Use a jurisdição padrão (endpoint global) nesta implementação.
3. Nas configurações do bucket, aplique o JSON de `infra/r2-cors.json` em CORS. Ele permite somente a origem local usada pelo app e expõe ETag para as partes multipart.
4. Em **R2 → Overview → API Tokens → Manage**, crie credenciais S3 com **Object Read & Write**, limitadas somente a esse bucket. Salve **Account ID**, **Access Key ID** e **Secret Access Key** diretamente no `.env` local; não envie os segredos no chat, Git ou Flutter. Esse token não precisa administrar a conta ou criar buckets.
5. Acrescente ao `.env` as quatro variáveis vazias do `.env.example`: `R2_ACCOUNT_ID`, `R2_BUCKET`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`. O endpoint é construído pela API: `https://<ACCOUNT_ID>.r2.cloudflarestorage.com`, região `auto`.
6. Mantenha uma regra de lifecycle para abortar uploads multipart incompletos após 1 dia. O R2 já fornece uma regra padrão de 7 dias; reduza para 1 dia neste bucket. Não configure exclusão automática dos originais concluídos nesta etapa.
7. Reinicie a API após alterar o `.env`. Nunca reutilize o bucket de produção para os testes.

Fontes oficiais: [S3 e credenciais](https://developers.cloudflare.com/r2/get-started/s3/), [CORS](https://developers.cloudflare.com/r2/buckets/cors/), [lifecycle](https://developers.cloudflare.com/r2/buckets/object-lifecycles/), [SDK JavaScript v3](https://developers.cloudflare.com/r2/examples/aws/aws-sdk-js-v3/).

## Regras desta entrega

- Limites iniciais: 2 GiB por arquivo, 10 GiB por workspace, 5 uploads ativos. Partes de 8 MiB; última parte pode ser menor. Sessões de envio expiram em 24 horas.
- Formatos: PNG, JPEG, WebP, PDF, MP4, MP3, WAV e ZIP. Editáveis devem ser empacotados em ZIP. Nome/extensão, MIME, metadados do objeto, tamanho real, lista de partes/ETags e assinatura inicial do formato são verificados; isso não equivale a análise completa do conteúdo nem antivírus.
- Versões nesta parte são rascunhos numerados. Publicação, prévias, portal convidado e liberação condicionada a aprovação/pagamento pertencem aos próximos marcos. Download aqui é exclusivo do criador autenticado, no próprio workspace; original nunca é publicado como prévia.
- URLs de partes duram 5 minutos; download dura 60 segundos, com attachment e application/octet-stream. Trate URLs como segredos; não registre em logs. Uma URL emitida antes de arquivar continua válida até expirar.
- Cota é reservada em transação Serializable com retry. Somente após validação o arquivo fica READY e a reserva vira uso. Uma falha de limpeza mantém a reserva até a remoção ser confirmada, evitando reutilizar espaço enquanto ainda há objetos pendentes.
- O estado ABORTING no banco é a fila durável de limpeza por arquivo. A API retoma a cada minuto, usa lease por operação, aborta multipart/exclui objetos e libera a reserva em transação. Falhas têm retry com backoff. Com a API desligada, a limpeza aguarda o próximo início e o lifecycle do R2 funciona como proteção adicional para multipart órfão.
- Projetos arquivados permitem consulta; novas versões, envios e downloads são bloqueados. Arquivamento é recusado enquanto houver envio ou limpeza pendente.
- Antes de liberar arquivos para convidados, implementar análise de malware, derivados isolados e as regras completas de autorização do PRD.

## Verificação do bucket real

Após preencher o .env, na raiz:

```powershell
. ./.local/ambiente.ps1  # apenas neste PC com runtimes portáteis
pnpm.cmd storage:check
```

O check cria um objeto próprio em `cofre-smoke/<UUID>`, envia duas partes (aproximadamente 8 MiB no total), confere CORS/ETag, assinatura do tamanho, HEAD, Range, attachment e acesso sem assinatura bloqueado. A remoção desse objeto faz parte do teste. Se a conexão cair durante a limpeza, mantenha `.local/r2-smoke-state.json`: o próximo check retoma somente essa limpeza. Esse tráfego é real no bucket de desenvolvimento.

Depois reinicie a API e confira pelo navegador: novo projeto → nova versão → upload de um PDF/PNG de teste → original disponível → baixar e comparar com o arquivo local. Confira também cancelar um envio e a liberação da reserva. A conclusão dessa etapa exige esse teste real; testes locais com adapter simulado não o substituem.
