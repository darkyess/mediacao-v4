# MediAção — V4

Projeto escolar: assistente de apoio ao atendimento em saúde. Não faz diagnóstico.

## Como executar
- **Sem IA:** abra `index.html` no navegador. Tudo funciona, exceto o passo opcional "descreva com suas palavras".
- **Com IA:** publique no Cloudflare Pages (veja `LEIA-ME-IA.md`).

## Estrutura
- `index.html`: telas e conteúdo.
- `style.css`: visual responsivo e estilo de impressão do resumo.
- `script.js`: fluxo do chatbot, regras de sinais de alerta e geração do resumo.
- `functions/api/organizar.js`: função do servidor que chama a IA (guarda a chave).
- `functions/api/config.js`: entrega ao navegador a configuração pública (chave pública do Turnstile, se houver).
- `_headers`: cabeçalhos de segurança (CSP etc.) usados pelo Cloudflare Pages.
- `favicon.svg`: ícone da aba.

## Privacidade
- Por padrão, os dados ficam somente no navegador e não são salvos.
- Se a pessoa escolher o passo com IA (e aceitar o aviso), **o texto que ela escreve é enviado ao Google (Gemini, plano gratuito)**, que pode usá-lo para melhorar seus produtos. Por isso o site pede para não escrever dados pessoais reais.
- Sinais de alerta são detectados por regras fixas; a IA só pode acrescentar cautela, nunca retirá-la.

## Novidades da V4
- Pergunta de sinais de alerta mais completa (dor no peito, AVC, convulsão, pensamentos de se machucar com CVV 188) e presente também em "Organizar meus sintomas".
- Detecção de alertas no texto livre ampliada.
- "Voltar uma pergunta" na confirmação da IA volta para a caixa de texto.
- Progresso mostra "Etapa opcional" no passo da IA e não salta.
- Avisos de emergência anunciados imediatamente por leitores de tela (`role="alert"`).
- Verificação anti-robô opcional (Cloudflare Turnstile) para proteger a cota da IA.
- Cabeçalhos de segurança (`_headers`) e remoção de `onclick` do HTML.
- Botão "Imprimir / salvar PDF" e estilo de impressão.
- Hierarquia de títulos corrigida, `<noscript>`, descrição, favicon e prévia para redes sociais.
- No celular, o aviso "não diagnostica" aparece antes dos botões.

## Próximas versões
- persistência local opcional;
- painel para profissionais;
- base de informações oficiais.

## Revisão por profissional de saúde

O conteúdo de saúde do site (sinais de alerta, mensagens de emergência, checklists, orientações por tipo de atendimento
e instruções dadas à IA) pode ser exportado em um único documento para um profissional revisar:

```
node tools/exportar-revisao.mjs
```

Isso gera `docs/REVISAO-CLINICA.md`, sempre a partir do código atual. O documento também testa a rede de segurança do
texto livre com frases de exemplo e **mostra as lacunas**. Depois da revisão, atualize o status na seção
"Fontes e revisão" (tela Sobre, `id="reviewStatus"` no `index.html`) com nome, profissão e data, **somente com o consentimento do revisor**.

## Perguntas para o profissional e serviços por perto

No resumo, abaixo das orientações, o site mostra:

- **Perguntas para fazer ao profissional**: lista fixa (sem IA), conforme o tipo de consulta e o motivo informado, com caixinhas
  para marcar. Entra no texto copiado e na impressão. Não dá diagnóstico nem indica remédio.
- **Serviços perto de você**: botões que abrem o Google Maps em outra aba (UBS, UPA 24h, pronto-socorro, CEO, farmácia,
  laboratório, conforme a situação). O link leva **só o tipo de serviço** (e a cidade, se a pessoa digitar). Nenhum sintoma,
  resposta ou texto do resumo vai para o mapa.

Quando a pessoa marca um sinal de alerta, **nenhum dos dois blocos aparece**: o foco é ligar para o SAMU (192) ou o CVV (188).
As perguntas e os serviços também são exportados para o documento de revisão (`node tools/exportar-revisao.mjs`).

## Diário de sintomas

Função **opcional** (`diario.js`): a pessoa anota como está ao longo dos dias (sintoma, data e hora, como está, intensidade de 0 a 10,
temperatura e observações) e leva o histórico para a consulta, copiando o texto ou imprimindo.

- **Privacidade:** os registros ficam só no `localStorage` do navegador e **só depois que a pessoa ativa o diário** marcando um
  consentimento. Nada é enviado a servidor nem à IA; o arquivo `diario.js` não tem nenhuma chamada de rede (há teste automático para isso).
- **Controle:** apagar um registro ou o diário inteiro sempre pede confirmação. Dados ilegíveis nunca são apagados sozinhos.
- **Sem interpretação:** o diário só guarda, mostra e exporta. Não calcula tendência nem sugere condutas.
- **A partir do resumo:** o botão "Salvar no diário" aparece só nos fluxos de sintomas e **nunca** quando há sinal de alerta.
- Os campos e os textos do diário também vão para o documento de revisão (`node tools/exportar-revisao.mjs`, Anexo C).
