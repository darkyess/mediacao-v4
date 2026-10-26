// Gera docs/REVISAO-CLINICA.md: todo o conteúdo de saúde do MediAção em um documento
// para um profissional de saúde revisar. Lê direto do código, então nunca fica desatualizado.
//
// Uso (na pasta do projeto):  node tools/exportar-revisao.mjs
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// ---- carrega script.js num ambiente simulado (sem navegador) ----
const el = () => new Proxy(function () {}, { get: (_, k) => (k === "children" ? [] : el()), set: () => true, apply: () => el() });
const ctx = { document: { getElementById: el, querySelectorAll: () => [], createElement: el, querySelector: () => null }, navigator: {}, window: {} };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(raiz, "script.js"), "utf8"), ctx);
const get = (expr) => vm.runInContext(expr, ctx);

const flows = get("flows");
const detecta = (t) => get(`detectaSinalDeAlerta(${JSON.stringify(t)})`);
const SAMU = get("SAMU"), CVV = get("CVV");

// ---- instruções da IA (arquivo ESM da função do servidor) ----
const src = fs.readFileSync(path.join(raiz, "functions/api/organizar.js"), "utf8");
const org = await import("data:text/javascript;base64," + Buffer.from(src).toString("base64"));

const esc = (s) => String(s).replace(/\|/g, "\\|").replace(/\n/g, " ");
const CAIXAS = "☐ Aprovado   ☐ Ajustar   ☐ Remover";
const out = [];
const p = (...l) => out.push(...l);

p("# MediAção: ficha de revisão do conteúdo de saúde", "");
p("> Documento gerado automaticamente a partir do código do projeto (`node tools/exportar-revisao.mjs`).", "");

p("## 1. O que é o projeto e o que se pede ao revisor", "",
  "O MediAção é um projeto escolar: um assistente que ajuda uma pessoa a **organizar o que está sentindo antes de procurar atendimento** e a levar um resumo para o profissional. **Ele não faz diagnóstico, não indica medicamentos ou doses e não substitui avaliação profissional.**", "",
  "Pedimos que você avalie se o conteúdo abaixo é **seguro, correto e adequado para o público geral**. Para cada item, marque **Aprovado**, **Ajustar** (com sugestão) ou **Remover**. Ao final, indique o que **falta** e as **fontes** que sustentam as orientações.", "",
  "Pontos de atenção que o projeto já adota: (a) os sinais de alerta seguem **regras fixas**, e a IA, quando usada, só pode **acrescentar** cautela, nunca retirá-la; (b) em caso de dúvida a orientação é buscar atendimento; (c) tudo o que a IA devolve passa por **conferência da própria pessoa**.", "");

// ---- 2. sinais de alerta ----
const alerta = flows.sintomas.find((i) => i.id === "alerta");
p("## 2. Pergunta de sinais de alerta", "",
  `Aparece **primeiro** nos fluxos "Estou com sintomas" e "Organizar meus sintomas". Texto da pergunta: *${alerta.text}*`, "",
  "| Opção exibida | O que o site faz ao marcar | Revisão | Comentário |", "|---|---|---|---|");
for (const o of alerta.options) {
  const acao = !o.redFlag ? "Segue para as perguntas normais"
    : o.cvv ? `Interrompe e mostra o CVV (${CVV}) em destaque e o SAMU (${SAMU})`
    : `Interrompe e mostra o SAMU (${SAMU})`;
  p(`| ${esc(o.text)} | ${acao} | ${CAIXAS} | |`);
}
p("", "**Perguntas ao revisor:** a lista está adequada e suficiente? Falta algum sinal (ex.: febre em bebê pequeno, gestante com sangramento ou dor, sinais de meningite, reação alérgica grave, trauma importante)? Algum item deve ser reescrito em linguagem mais simples?", "");

// ---- 3. textos de emergência ----
const T = (n) => get(n);
p("## 3. Mensagens de emergência exibidas", "", "| Situação | Texto exibido | Revisão | Comentário |", "|---|---|---|---|",
  `| Sinal de alerta marcado na pergunta | ${esc(T("EMERGENCY_CHAT_TEXT"))} | ${CAIXAS} | |`,
  `| Pensamentos de se machucar (pergunta) | ${esc(T("EMERGENCY_CVV_TEXT"))} | ${CAIXAS} | |`,
  `| Sinal de alerta no texto livre | ${esc(T("ALERT_RELATO_TEXT"))} | ${CAIXAS} | |`,
  `| Banner no resumo final | Atenção: ${esc(T("EMERGENCY_RESULT_TEXT"))} | ${CAIXAS} | |`, "",
  `Números usados: **SAMU ${SAMU}** e **CVV ${CVV}**. **Perguntas:** o tom é adequado para quem está em crise? A orientação de "ligar agora" é a melhor para cada caso?`, "");

// ---- 4. orientações por fluxo ----
function guias(modo, titulo) {
  p(`## ${titulo}`, "");
  const q = flows[modo].find((i) => i.type === "question");
  p(`Pergunta: *${q.text}*`, "");
  for (const o of q.options) {
    const g = o.guide;
    if (!g) continue;
    p(`### Opção: ${o.text}`, "", `**${g.title}.** ${g.intro}`, "");
    g.items.forEach((it) => p(`- ${it}`));
    if (g.note) p("", `**Observação final:** ${g.note}`);
    p("", `Revisão: ${CAIXAS}   Comentário: ____________________________`, "");
  }
}
guias("consulta", "4. Fluxo \"Vou ao médico\": checklists");
guias("atendimento", "5. Fluxo \"Qual atendimento procurar?\": orientações");
p("**Perguntas ao revisor:** as indicações de UBS, UPA, SAMU, CEO e pronto atendimento estão corretas e claras? Há algo que o público costuma confundir? Os documentos e itens listados estão completos?", "");

// ---- 6. rede de segurança ----
p("## 6. Rede de segurança no texto livre", "",
  "Quando a pessoa escolhe descrever o que sente com as próprias palavras, o site procura, **no próprio aparelho e antes de enviar qualquer coisa**, expressões que sugerem situação grave. Se achar, mostra SAMU/CVV e **não** chama a IA. É uma rede **simples e imperfeita**: reconhece frases comuns, não entende contexto.", "",
  "A tabela mostra como ela reage a frases de teste. A coluna *Expectativa* é a opinião de quem desenvolveu e **precisa ser validada pelo revisor**.", "",
  "| Frase de teste | Expectativa | Resultado do site | Situação | Revisão |", "|---|---|---|---|---|");
const testes = [
  ["estou sem conseguir respirar direito", "alertar"], ["senti uma dor forte no peito", "alertar"], ["meu pai desmaiou agora", "alertar"],
  ["ele teve uma convulsão", "alertar"], ["estou vomitando sangue", "alertar"], ["meu rosto está torto e a fala enrolada", "alertar"],
  ["tomei uma cartela de remédio", "alertar"], ["não quero mais viver", "alertar"], ["quero me matar", "alertar"],
  ["a pior dor de cabeça da minha vida", "alertar"], ["dor de barriga insuportável", "alertar"], ["peito apertado e suor frio", "alertar"],
  ["bebê de 2 meses com febre", "alertar"], ["gestante com sangramento e dor", "alertar"], ["febre alta e pescoço rígido", "alertar"],
  ["minha garganta está fechando depois que comi", "alertar"], ["caí da escada e bati a cabeça, estou tonto", "alertar"],
  ["dor de cabeça leve desde ontem", "não alertar"], ["tosse e coriza há três dias", "não alertar"], ["dor de garganta ao engolir", "não alertar"],
  ["febre baixa à noite", "não alertar"], ["dor nas costas há uma semana", "não alertar"], ["enjoo depois de comer", "não alertar"],
  ["me sinto muito ansioso nos últimos dias", "discutir"],
];
let lacunas = 0;
for (const [frase, esp] of testes) {
  const r = detecta(frase);
  const res = r ? "alerta" : "sem alerta";
  const ok = esp === "discutir" ? "a discutir" : (esp === "alertar") === r ? "ok" : (lacunas++, esp === "alertar" ? "LACUNA (deveria alertar)" : "alerta a mais");
  p(`| ${esc(frase)} | ${esp} | ${res} | ${ok} | ${CAIXAS} |`);
}
p("", `**Resultado:** ${lacunas} de ${testes.length} frases com divergência em relação à expectativa do desenvolvedor.`, "",
  "**Perguntas ao revisor:** quais expressões comuns (inclusive regionais e informais) faltam? Quais casos NUNCA devem ficar sem alerta? Há termos que geram alarme à toa?", "");

// ---- 7. instruções da IA ----
p("## 7. Instruções dadas à IA", "",
  "A IA (modelo de linguagem) recebe as instruções abaixo e devolve apenas campos organizados (motivo, início, se está piorando, observações e se há possível sinal de alerta). O resultado é **mostrado à pessoa para conferência** antes de entrar no resumo.", "", "```text", org.INSTRUCOES, "```", "",
  `Revisão: ${CAIXAS}   Comentário: ____________________________`, "",
  "**Perguntas ao revisor:** a lista de sinais que a IA deve apontar como possível alerta está adequada? Há algo que a IA não deveria registrar em \"observações\"?", "");

// ---- 8. outros textos ----
p("## 8. Outros textos que o site exibe", "",
  "- Aviso sempre presente: *O MediAção não diagnostica doenças nem substitui profissionais de saúde.*",
  "- Aviso no resumo: *este resumo não determina diagnóstico. Se os sintomas preocuparem você, procure avaliação de um profissional de saúde.*",
  "- Falha da IA: *" + T("AI_FAIL_TEXT") + "*", "",
  `Revisão: ${CAIXAS}   Comentário: ____________________________`, "");

// ---- 9. perguntas gerais ----
p("## 9. Perguntas gerais ao revisor", "",
  "1. O que **falta** para o conteúdo ser seguro para o público geral?",
  "2. Algo no tom ou na linguagem pode **assustar ou confundir**?",
  "3. O projeto deveria tratar de forma diferente **crianças, gestantes e idosos**?",
  "4. Que **fontes oficiais** (Ministério da Saúde, sociedades médicas, protocolos) sustentam cada orientação? Liste abaixo.",
  "5. Você recomenda **retirar** alguma função?", "",
  "Fontes e links indicados pelo revisor: ______________________________________________", "");

// ---- 10. fontes do projeto ----
p("## 10. Fontes que o projeto já cita (ponto de partida)", "",
  "- Ministério da Saúde, Saúde de A a Z: https://www.gov.br/saude/pt-br/assuntos/saude-de-a-a-z",
  "- Atenção Especializada à Saúde (urgência e emergência / SAMU 192): https://www.gov.br/saude/pt-br/composicao/saes",
  "- Atenção Primária à Saúde (UBS): https://www.gov.br/saude/pt-br/composicao/saps",
  "- Ouvidoria-Geral do SUS, Disque Saúde 136: https://www.gov.br/saude/pt-br/canais-de-atendimento/ouvsus",
  "- Meu SUS Digital: https://www.gov.br/saude/pt-br/composicao/seidigi/meususdigital",
  "- CVV (188): https://cvv.org.br/", "",
  "Observação do desenvolvedor: são páginas-guia oficiais, **não** foram usadas como protocolo clínico. A página específica do SAMU 192 no portal do Ministério (indicada como `gov.br/saude/pt-br/composicao/saes/samu-192` em fontes secundárias) **não pôde ser aberta** durante o desenvolvimento e precisa ser conferida.", "");

// ---- 11. identificação ----
p("## 11. Identificação do revisor", "",
  "| Campo | Preenchimento |", "|---|---|", "| Nome | |", "| Profissão e registro (ex.: CRM, COREN, CRF, CRO, CRP) | |", "| Data da revisão | |",
  "| Parecer geral | ☐ Aprovado   ☐ Aprovado com ajustes   ☐ Não recomendo o uso |", "",
  "Com a aprovação, o projeto poderá indicar no site: *\"Conteúdo revisado por [nome], [profissão/registro], em [data]\"*. Só será publicado com o seu consentimento.", "");

// ---- anexos: perguntas sugeridas e serviços por perto ----
const lista = (arr) => arr.map((x) => `- ${x}`);
const perguntas = (modo, respostas) => get(`perguntasPara(${JSON.stringify(modo)}, ${JSON.stringify(respostas)})`);
const baseSint = get("PERGUNTAS_SINTOMA"), tema = get("PERGUNTAS_TEMA"), piorando = get("PERGUNTAS_PIORANDO"), porObjetivo = get("PERGUNTAS_CONSULTA");
const nomeTema = { dor: "Dor (inclui cabeça, dente, garganta, costas)", febre: "Febre", respiracao: "Tosse ou dificuldade respiratória", digestivo: "Náusea, vômito, diarreia, barriga ou estômago" };

p("---", "", "## Anexo A. Perguntas sugeridas para a pessoa levar ao profissional", "",
  "*(Preencha a identificação da seção 11 depois de revisar os anexos.)*", "",
  "Aparecem no resumo, abaixo das orientações, como lista com caixinhas; também entram no texto copiado e na impressão. São **fixas** (não geradas por IA) e são perguntas para a pessoa **fazer ao profissional**: o site não responde a elas, não sugere remédios e não faz diagnóstico. Quando há sinal de alerta, elas **não aparecem**. No máximo 7 perguntas por resumo.", "",
  "### A.1 Fluxos \"Estou com sintomas\" e \"Organizar meus sintomas\"", "",
  "**Perguntas-base (sempre):**", "", ...lista(baseSint), "",
  "**Perguntas específicas por tema** (entram antes das perguntas-base, conforme as palavras do motivo informado):", "",
  "| Tema | Perguntas acrescentadas | Revisão |", "|---|---|---|",
  ...Object.entries(tema).map(([k, v]) => `| ${esc(nomeTema[k])} | ${esc(v.join(" / "))} | ${CAIXAS} |`), "",
  "**Se a pessoa disser que está piorando**, acrescenta:", "", ...lista(piorando), "",
  `Revisão das perguntas-base e da pergunta de piora: ${CAIXAS}   Comentário: ____________________________`, "",
  "### A.2 Fluxo \"Vou ao médico\", por objetivo", "");
const objetivos = flows.consulta.find((i) => i.type === "question").options.map((o) => o.text);
for (const o of objetivos) {
  p(`**${o}**`, "", ...lista(perguntas("consulta", [{ id: "objetivo", value: o }])), "", `Revisão: ${CAIXAS}   Comentário: ____________________________`, "");
}
p("O fluxo \"Qual atendimento procurar?\" não mostra perguntas de consulta.", "",
  "**Perguntas ao revisor:** as perguntas são adequadas e compreensíveis? Alguma deveria ser retirada ou reescrita? Falta alguma pergunta importante para algum tema? O limite de 7 é adequado?", "");

const SERV = get("SERVICOS"), POR_OPCAO = get("SERVICOS_POR_OPCAO"), PADRAO = get("SERVICOS_PADRAO");
const linhaServ = (chaves) => `${esc(chaves.map((k) => SERV[k].label).join("; "))} | ${esc(chaves.map((k) => SERV[k].busca).join("; "))}`;
p("## Anexo B. Serviços sugeridos (botões que abrem o mapa)", "",
  "No resumo, o bloco \"Serviços perto de você\" mostra botões que **abrem o Google Maps em outra aba**. O termo de busca enviado ao mapa é **só o tipo de serviço** (mais \"perto de mim\", ou a cidade/bairro se a própria pessoa digitar). **Nenhum sintoma, resposta ou texto do resumo vai para o mapa.** Quando há sinal de alerta, o bloco **não aparece**.", "",
  "| Situação | Serviços sugeridos | Termos de busca | Revisão |", "|---|---|---|---|",
  `| Estou com sintomas / Organizar meus sintomas | ${linhaServ(PADRAO.sintomas)} | ${CAIXAS} |`,
  ...Object.entries(POR_OPCAO).map(([opcao, chaves]) => `| ${esc(opcao)} | ${linhaServ(chaves)} | ${CAIXAS} |`), "",
  "**Perguntas ao revisor:** os serviços sugeridos fazem sentido para cada situação? Sugerir UPA/pronto-socorro a quem não marcou sinal de alerta é adequado? A farmácia deve aparecer em \"Acompanhar tratamento\"? Falta algum serviço (ex.: CAPS, maternidade, pronto atendimento infantil)?", "");

fs.mkdirSync(path.join(raiz, "docs"), { recursive: true });
fs.writeFileSync(path.join(raiz, "docs/REVISAO-CLINICA.md"), out.join("\n"), "utf8");
console.log(`docs/REVISAO-CLINICA.md gerado (${out.length} linhas; ${lacunas} divergência(s) na rede de segurança).`);
