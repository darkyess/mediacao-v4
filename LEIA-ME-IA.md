# Como ligar a IA no MediAção (gratuito)

O passo "descreva com suas palavras" usa uma IA para organizar o texto da pessoa em campos do resumo.
A IA **só organiza**: ela não diagnostica e não decide emergência (isso é feito por regras fixas no site).
Sem a configuração abaixo, o site continua funcionando normalmente, só sem esse passo.

> Os nomes de menus dos sites abaixo podem mudar com o tempo. Se algo não bater, procure pelo nome parecido.

## 1. Criar a chave da IA (Google AI Studio)

1. Acesse https://aistudio.google.com/apikey e entre com uma conta Google.
2. Clique em **Create API key** e copie a chave.
3. **Não cole a chave em chat, e-mail, código ou GitHub.** Ela só vai em um lugar: o painel do Cloudflare (passo 3).

## 2. (Opcional) Testar no seu computador

Precisa do Node.js instalado.

1. Copie `.dev.vars.example` para `.dev.vars` e troque `cole_sua_chave_aqui` pela sua chave.
2. Na pasta do projeto, rode: `npx wrangler pages dev .`
3. Abra o endereço que aparecer (algo como `http://localhost:8788`).

Abrir o `index.html` com duplo clique **não** ativa a IA (não há servidor); o passo é pulado de propósito.

## 3. Publicar no Cloudflare Pages (gratuito)

**Opção A, com GitHub (mais fácil):**
1. Suba o projeto para um repositório no GitHub (o `.gitignore` já impede o envio do `.dev.vars`).
2. No Cloudflare: **Workers & Pages → Create → Pages → Connect to Git** e escolha o repositório.
3. Em *Build settings*: deixe o **comando de build vazio** e a **pasta de saída** como a raiz (`/`).
4. Depois de criado: **Settings → Variables and Secrets → Add**, tipo **Secret**, nome `GEMINI_API_KEY`, valor = sua chave. Faça isso para *Production* (e *Preview*, se for usar).
5. Faça um novo deploy para a variável valer.

**Opção B, pelo terminal:**
1. `npx wrangler pages deploy .` (na primeira vez, ele pede para criar o projeto).
2. `npx wrangler pages secret put GEMINI_API_KEY --project-name NOME_DO_PROJETO` e cole a chave.

## 4. Conferir se funcionou

Abra o site publicado → **Estou com sintomas** → **Nenhum desses**. Deve aparecer a caixa
"Descreva com suas palavras" com o aviso de privacidade.

| O que você vê | Provável causa |
|---|---|
| A caixa não aparece | Está abrindo o arquivo direto do disco, ou a função não foi publicada (a pasta `functions/` precisa ir junto). |
| "Não consegui organizar seu relato" sempre | Chave ausente ou errada (confira o secret `GEMINI_API_KEY` e refaça o deploy). |
| Funciona e depois para | Limite diário do plano gratuito. O MediAção segue pelas perguntas normais. |
| Erro de "origem" | Acessando por um endereço diferente do site publicado (a função só aceita o próprio site). |

Se o Google mudar o nome do modelo, troque sem mexer no código: crie a variável `GEMINI_MODEL`
(ex.: `gemini-3.1-flash-lite`). O padrão é `gemini-3.5-flash-lite`.

## 5. (Recomendado) Proteger a cota com o Turnstile

A função só aceita pedidos do próprio site, mas um script pode falsificar isso e gastar o limite diário da sua chave.
O Cloudflare Turnstile (gratuito) é uma verificação anti-robô que bloqueia esse abuso. É opcional: sem ele, tudo funciona igual.

1. No Cloudflare: **Turnstile → Add widget**. Em *Hostname*, coloque o endereço do site (ex.: `mediacao.pages.dev`). Modo: **Managed**.
2. Copie a **Site Key** (pública) e a **Secret Key** (secreta).
3. No projeto do Pages: **Settings → Variables and Secrets**:
   - `TURNSTILE_SITE_KEY` = Site Key (pode ser tipo *Text*);
   - `TURNSTILE_SECRET_KEY` = Secret Key (tipo **Secret**).
4. Faça um novo deploy. A caixa "Descreva com suas palavras" passa a mostrar a verificação antes do botão "Organizar com IA".

Para testar no computador, use as chaves de teste do Cloudflare já indicadas em `.dev.vars.example`.

| O que você vê | Provável causa |
|---|---|
| Verificação não aparece | `TURNSTILE_SITE_KEY` ausente, ou falta refazer o deploy. |
| "Não consegui organizar seu relato" sempre, com Turnstile | `TURNSTILE_SECRET_KEY` errada ou hostname do widget diferente do site. |

## 6. Privacidade e segurança (importante)

- No plano **gratuito** do Google, o conteúdo enviado **pode ser usado para melhorar os produtos deles**.
  Por isso o site mostra um aviso e pede consentimento antes de enviar, e orienta a **não escrever dados pessoais reais**.
- Use só frases inventadas nos testes. Se um dia o projeto for usado por pessoas reais, passe para um plano pago
  ou outro provedor com política de não treinamento, e reveja o aviso de privacidade.
- Os dados saem do Brasil (servidores do provedor). Isso já consta no texto do aviso/"Sobre".
- A função não grava nem registra o texto da pessoa.
- Se a chave vazar, apague-a em https://aistudio.google.com/apikey e crie outra.

## 7. Desligar a IA

Apague o secret `GEMINI_API_KEY` ou a pasta `functions/`. O passo some sozinho e o resto continua igual.
