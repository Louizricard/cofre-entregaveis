# Confirmação de e-mail do cliente

O portal continua permitindo prévias a quem possui um link válido. Confirmar o e-mail vincula a sessão convidada ao endereço já cadastrado no cliente do projeto. Não concede aprovação, pagamento ou download de originais nesta etapa.

## Fluxo

1. No portal, informe o e-mail cadastrado no projeto e solicite o código. O endereço cadastrado não é exibido como dica.
2. A API responde 202 genérico para endereço correspondente, diferente ou pedido em cooldown/cota; não informa se o endereço existe. Somente o endereço correspondente agenda envio. Sem provedor configurado, retorna indisponibilidade e a interface mantém apenas as prévias.
3. Informe os seis dígitos, incluindo zeros iniciais. O código vale por até dez minutos, limitado também à validade da sessão e do link, com cinco tentativas persistidas. Reenvio invalida o desafio anterior e escolhe dígitos diferentes do código anterior.
4. Sucesso grava horário e e-mail confirmado na sessão. O código é de uso único. A identidade dura somente nessa sessão e deixa de ser válida se o endereço do cliente mudar, o link/sessão expirar ou for revogado, ou o projeto for arquivado. Outra sessão exige outro código.

Solicitações têm cooldown de um minuto por sessão e limite de dez por hora/projeto, inclusive endereços que não correspondem ao cadastro. IP também é limitado (três solicitações e dez verificações por minuto). Resposta de erro na verificação não desfaz a contagem de tentativas. Os limites são validados no backend, independentemente do contador visual.

## Fila e segredos

IdentityChallenge funciona como fila persistente no PostgreSQL. Código para comparação usa HMAC-SHA256 com segredo externo ao banco, vinculado ao desafio/sessão. Para recuperação do envio, guarda-se temporariamente uma cifra AES-256-GCM autenticada pelo ID do desafio; a chave de cifra é derivada com contexto separado. Não há código em texto aberto nas tabelas, respostas, arquivos locais ou logs da aplicação.

A API configurada consome a fila em ciclos de dois segundos, uma entrega por processo, com lease de três minutos e token de execução. Antes de enviar, verifica sessão/link/projeto e e-mail atual. Timeout HTTP de quinze segundos; até três tentativas com espera de trinta/sessenta segundos, sem ultrapassar a expiração do código. Mesma tentativa lógica usa o mesmo código e chave de idempotência. Cifra é descartada ao enviar, consumir, cancelar, expirar ou esgotar tentativas. Uma requisição antiga já em trânsito pode chegar após reenvio/revogação, mas não confirma o desafio novo nem restaura acesso revogado.

IdentityRequest conserva somente sessão/horário para limites entre sessões e links; não grava o e-mail digitado. Retenção desses registros faz parte da operação beta futura. Falhas do provedor não são devolvidas ou impressas com payload/credenciais. O provedor necessariamente processa destinatário e conteúdo do e-mail; não recebe nome de projeto, arquivo ou link de acesso.

## Configuração real

O adapter implementado usa a [API de envio do Resend](https://resend.com/docs/api-reference/emails/send-email), com [idempotência](https://resend.com/docs/dashboard/emails/idempotency-keys). A conta foi criada pelo responsável. Após a implementação, o responsável confirmou recebimento real no próprio endereço da conta Resend e uso do código no portal em 14/10/2026. Chave e segredo permanecem somente no .env local.

1. Crie uma conta no Resend. Para o primeiro teste sem domínio, o remetente `onboarding@resend.dev` só pode enviar ao endereço associado à própria conta, conforme a [restrição oficial de testes](https://resend.com/docs/knowledge-base/403-error-resend-dev-domain). Não use endereços reais de clientes nesse teste.
2. Crie uma chave com permissão de envio e salve somente em `RESEND_API_KEY` no `.env` local. Não envie a chave na conversa, no Git ou em capturas.
3. Defina `EMAIL_FROM=onboarding@resend.dev` para esse teste. Gere um segredo aleatório hexadecimal de 32 bytes e salve em `IDENTITY_SECRET`, também somente no `.env`. Exemplo de comando local para gerar: `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`; execute no seu terminal privado, sem compartilhar a saída.
4. Os três campos são obrigatórios juntos. Não existe modo de imprimir código em console nem confirmação simulada na aplicação. Em produção, a configuração recusa `@resend.dev`; use domínio próprio verificado e remetente correspondente.
5. Gere Prisma, aplique migrations, compile e reinicie a API. Em um projeto sintético, cadastre como cliente o próprio endereço da conta Resend, publique uma versão e crie um link. Abra o portal em janela anônima e solicite o código. O usuário realiza esse envio explicitamente pela interface e digita o código recebido, sem compartilhá-lo na conversa.

Os campos do `.env.example` ficam vazios. Sem conta/remetente/credenciais, o aplicativo mostra a confirmação como indisponível; o recebimento real permanece pendente e não pode ser comprovado pelos testes simulados. Alterar/remover o segredo invalida desafios pendentes; não faça essa mudança durante um teste de recebimento.

## Validação

Suíte PostgreSQL separada cobre normalização, resposta genérica, cooldown/cota concorrente, sessão diferente, uso único, expiração/reenvio, cinco erros, retries/lease e cancelamento por revogação/arquivamento. O remetente de teste existe somente em memória e é injetado pelo teste; não há rota ou variável para habilitá-lo no aplicativo. Testes unitários exercitam cifra autenticada, HMAC e contrato HTTP/idempotência do adapter sem acesso externo. Flutter verifica indisponibilidade, zero inicial, erro, reenvio e confirmação em 360/768/1440 px.

Esta confirmação prova acesso ao e-mail cadastrado nessa sessão; não é assinatura eletrônica certificada. Comentários, revisão e aprovação serão implementados depois de validar o recebimento real.
