// MediAção — V4
// Cada pergunta tem um `id` e um `label` próprios. O resumo e o alerta de
// emergência dependem desses campos (e do marcador `redFlag` nas opções),
// nunca da posição da pergunta dentro do fluxo.

const state = { mode: "", step: 0, answers: [], aiItem: null, aiBusy: false, aiToken: 0, aiUnavailable: false, batch: 0, confirming: false };

const chatBox = () => document.getElementById("chatBox");
const optionsBox = () => document.getElementById("options");

// ---------- Definição dos fluxos ----------
const info = (text) => ({ type: "info", text });
const ask = (id, label, text, options) => ({ type: "question", id, label, text, options });
// cvv: true quando a opção deve mostrar também o CVV (apoio emocional)
const opt = (text, redFlag = false, cvv = false) => ({ text, redFlag, cvv });
const opts = (...texts) => texts.map((t) => opt(t));
// Passo opcional em que a pessoa descreve o que sente e a IA organiza. `covers` = perguntas que ele substitui.
const freeText = (text, covers) => ({ type: "freeText", text, covers });

// Número do SAMU (emergência médica no Brasil)
const SAMU = "192";
const CVV = "188"; // Centro de Valorização da Vida: apoio emocional, 24 h, gratuito
const PHONE_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v3a2 2 0 0 1-2 2A15 15 0 0 1 3 6a2 2 0 0 1 2-2z"/></svg>';
const EMERGENCY_CHAT_TEXT =
  `Você marcou um possível sinal de alerta. Isso pode ser uma emergência. Ligue agora para o SAMU (${SAMU}) ou peça ajuda a alguém por perto. Não espere para preencher o resumo.`;
const EMERGENCY_RESULT_TEXT =
  `você informou um possível sinal de alerta. Ligue para o SAMU (${SAMU}) ou procure atendimento de emergência imediatamente.`;

const ALERT_RELATO_TEXT =
  `Seu relato menciona algo que pode ser um sinal de alerta. Se for uma emergência, ligue agora para o SAMU (${SAMU}). Se você está pensando em se machucar ou em tirar a própria vida, ligue para o CVV (${CVV}), 24 horas e gratuito. Você não precisa passar por isso sozinho(a).`;
const EMERGENCY_CVV_TEXT =
  `Obrigado por contar. Você não precisa passar por isso sozinho(a). Ligue agora para o CVV (${CVV}), 24 horas e gratuito, ou fale com alguém de confiança por perto. Se você já se machucou ou corre perigo agora, ligue para o SAMU (${SAMU}).`;
const AI_FAIL_TEXT = "Não consegui organizar seu relato agora. Sem problema: vamos pelas perguntas.";
const AI_ENDPOINT = "/api/organizar";
const AI_MAX_CHARS = 800;
const AI_TIMEOUT_MS = 15000;

// Orientações exibidas no resumo, conforme a resposta escolhida.
// kind: "checklist" (itens marcáveis) ou "list" (lista simples).
const guide = (title, intro, items, kind = "list", note = "") => ({ title, intro, items, kind, note });
const optg = (text, g) => ({ text, redFlag: false, guide: g });

const DOC_ITEM = "Documento com foto e Cartão SUS (se o atendimento for pelo SUS) ou carteirinha do plano de saúde";
const MEDS_ITEM = "Lista dos medicamentos que você usa (nome, dose e horário) e das alergias conhecidas";
const SAMU_NOTE = `Se surgir dificuldade para respirar, dor no peito, desmaio, sinais de AVC, sangramento intenso ou dor muito forte ou súbita, não espere: ligue para o SAMU (${SAMU}).`;

// Pergunta de sinais de alerta, usada em todos os fluxos que tratam de sintomas.
const alertaQuestion = () =>
  ask("alerta", "Sinal de alerta", "Primeiro, uma pergunta importante: você está com algum destes sinais de alerta agora?", [
    opt("Dificuldade para respirar", true),
    opt("Dor ou aperto no peito", true),
    opt("Desmaio, convulsão ou confusão importante", true),
    opt("Rosto torto, fala enrolada ou fraqueza de um lado do corpo", true),
    opt("Sangramento intenso", true),
    opt("Dor muito forte ou súbita", true),
    opt("Pensamentos de se machucar ou de tirar a própria vida", true, true),
    opt("Nenhum desses"),
  ]);

const flows = {
  sintomas: [
    info("Olá! Vou ajudar você a organizar algumas informações. Não vou diagnosticar doenças."),
    // O alerta vem primeiro: quem está em emergência não deve responder várias perguntas antes de ser avisado.
    alertaQuestion(),
    freeText("Se preferir, descreva com suas palavras o que você está sentindo e eu organizo para você. É opcional.", ["motivo", "inicio", "evolucao"]),
    ask("motivo", "Motivo principal", "Qual é o principal problema que você está sentindo?",
      opts("Dor", "Febre", "Tosse ou dificuldade respiratória", "Náusea/vômito", "Outro")),
    ask("inicio", "Tempo de início", "Há quanto tempo isso começou?",
      opts("Hoje", "Há 2–3 dias", "Há mais de uma semana", "Não sei")),
    ask("evolucao", "Piorando", "O sintoma está piorando?",
      opts("Sim", "Não", "Não sei")),
  ],
  consulta: [
    info("Antes de uma consulta, é útil separar documentos, medicamentos em uso, alergias conhecidas e exames anteriores."),
    ask("objetivo", "Objetivo", "Qual é seu objetivo?", [
      optg("Consulta de rotina", guide(
        "Checklist: consulta de rotina",
        "Separe estes itens antes de sair de casa:",
        [
          DOC_ITEM,
          MEDS_ITEM,
          "Exames e receitas anteriores",
          "Caderneta de vacinação",
          "Histórico de doenças na família, se você souber",
          "Suas dúvidas anotadas, para não esquecer na hora",
        ],
        "checklist",
        "Chegue com um pouco de antecedência e, se possível, confirme horário e local antes de sair."
      )),
      optg("Investigar um sintoma", guide(
        "Checklist: consulta para investigar um sintoma",
        "Quanto mais claro for o relato, mais fácil é a avaliação. Anote:",
        [
          "Quando começou e se está piorando, melhorando ou igual",
          "Com que frequência acontece e quanto tempo dura cada episódio",
          "O que piora e o que alivia",
          "Outros sintomas que apareceram junto, mesmo que pareçam sem relação",
          "O que você já tomou ou fez para melhorar (remédios, chás, pomadas)",
          "Se mediu febre, as temperaturas e os horários",
          "Fotos, se for algo visível que muda ao longo do dia (manchas, inchaço)",
          MEDS_ITEM,
          DOC_ITEM,
        ],
        "checklist",
        SAMU_NOTE
      )),
      optg("Acompanhar tratamento", guide(
        "Checklist: acompanhamento de tratamento",
        "Para o profissional avaliar como o tratamento está indo, leve:",
        [
          "Receitas e as embalagens dos medicamentos em uso (ou uma lista com nome, dose e horário)",
          "Como você tem tomado: horários, doses esquecidas ou dificuldades",
          "Efeitos que você notou desde o início do tratamento ou da última consulta",
          "Medições feitas em casa (pressão, glicemia etc.), com as datas",
          "Exames de controle recentes",
          "Dúvidas sobre o tratamento",
          DOC_ITEM,
        ],
        "checklist",
        "Não pare nem mude a dose de nenhum medicamento por conta própria: converse com o profissional que acompanha você."
      )),
      optg("Levar resultado de exame", guide(
        "Checklist: levar resultado de exame",
        "Para a consulta render mais, leve:",
        [
          "O laudo completo, com data e nome do laboratório ou serviço",
          "As imagens do exame (raio-x, ultrassom, tomografia), quando o serviço fornecer",
          "Exames anteriores do mesmo tipo, para comparação",
          "O pedido médico que originou o exame, se você tiver",
          MEDS_ITEM,
          DOC_ITEM,
          "Suas dúvidas anotadas",
        ],
        "checklist",
        "O resultado deve ser interpretado por um profissional, junto com a sua história e o exame físico. Evite tirar conclusões só pelos números ou pelo texto do laudo."
      )),
    ]),
  ],
  atendimento: [
    info("Vou explicar de forma geral alguns tipos de atendimento. A decisão real depende da situação e das orientações locais."),
    ask("motivo", "Motivo principal", "O motivo principal é:", [
      optg("Problema sem sinais de emergência", guide(
        "Por onde começar",
        "Para um problema que não é emergência, o caminho mais comum é:",
        [
          "Pelo SUS: procure a UBS (posto de saúde) mais próxima de casa. Ela é a porta de entrada do sistema, resolve a maioria dos problemas e encaminha para especialistas quando necessário.",
          "Muitas UBS fazem acolhimento no mesmo dia. Vale perguntar na recepção como funciona na sua unidade.",
          "Com plano de saúde ou atendimento particular: marque consulta pela rede do plano, de preferência começando por um clínico geral ou médico de família.",
          "Leve documento com foto, Cartão SUS ou carteirinha do plano e a lista dos medicamentos que você usa.",
        ],
        "list",
        `Se o quadro piorar ou surgir algum sinal de alerta, procure atendimento de urgência. Em risco de vida, ligue para o SAMU (${SAMU}).`
      )),
      optg("Sintoma que parece urgente", guide(
        "Atendimento de urgência",
        "Se o problema não pode esperar uma consulta marcada:",
        [
          `Risco de vida (dificuldade para respirar, dor no peito, desmaio, convulsão, sinais de AVC, sangramento intenso, dor muito forte ou súbita): ligue agora para o SAMU (${SAMU}).`,
          "Sem risco imediato, mas precisando de avaliação rápida: procure uma UPA 24h ou o pronto atendimento/pronto-socorro mais próximo.",
          "Nesses serviços, a equipe faz uma triagem (classificação de risco) e atende pela gravidade, não pela ordem de chegada.",
          "Se puder, leve documento com foto, Cartão SUS e a lista dos medicamentos em uso, e vá acompanhado(a).",
        ],
        "list",
        `Na dúvida sobre a gravidade, trate como urgência e peça orientação ao SAMU (${SAMU}).`
      )),
      optg("Preciso de atendimento odontológico", guide(
        "Atendimento odontológico",
        "Dependendo do caso, os caminhos são:",
        [
          "Rotina, dor leve ou tratamento: pelo SUS, procure a UBS que tenha equipe de saúde bucal. Casos mais complexos podem ser encaminhados a um CEO (Centro de Especialidades Odontológicas). Plano odontológico ou consultório particular também são opções.",
          "Urgência odontológica (dor forte que não passa, dente quebrado ou que caiu por trauma, sangramento que não para): procure um pronto atendimento odontológico ou uma UPA/hospital que atenda urgências, o quanto antes.",
          "Inchaço no rosto, principalmente com febre: precisa de avaliação rápida. Não espere melhorar sozinho(a).",
        ],
        "list",
        `Se o inchaço dificultar a respiração ou a deglutição, ligue para o SAMU (${SAMU}).`
      )),
      optg("Dúvida administrativa/UBS", guide(
        "Dúvidas administrativas e UBS",
        "Para questões que não são sintomas, comece por aqui:",
        [
          "A UBS da sua região é o lugar para cadastro, agendamento de consultas e exames, vacinas, receitas de uso contínuo e encaminhamentos.",
          "Leve documento com foto, CPF ou Cartão SUS. Para o cadastro, também pode ser pedido comprovante de residência.",
          "Para dúvidas gerais, sugestões e reclamações sobre o SUS, a Ouvidoria do SUS atende pelo Disque Saúde 136.",
          "O Meu SUS Digital, do Ministério da Saúde, reúne serviços digitais do SUS no aplicativo e no site.",
        ],
        "list",
        "Regras de agendamento mudam de cidade para cidade. Confirme na sua UBS ou na Secretaria de Saúde do seu município."
      )),
    ]),
  ],
  organizar: [
    info("Vamos montar um resumo simples para você levar à consulta."),
    alertaQuestion(),
    ask("motivo", "Motivo principal", "Qual é o principal sintoma ou motivo da consulta?",
      opts("Dor", "Febre", "Tosse", "Outro")),
    ask("inicio", "Tempo de início", "Quando começou?",
      opts("Hoje", "Há 2–3 dias", "Há mais de uma semana", "Não sei")),
  ],
};

// ---------- Navegação ----------
// Mostra uma tela e move o foco para ela (título, ou o elemento indicado).
// focusTarget === false mantém o foco como está.
function show(id, focusTarget) {
  document.querySelectorAll(".screen").forEach((s) => s.classList.remove("active"));
  const screen = document.getElementById(id);
  screen.classList.add("active");
  if (focusTarget === false) return;
  const target = focusTarget || screen.querySelector("h1, h2, h3");
  if (target) {
    target.setAttribute("tabindex", "-1");
    target.focus();
  }
}

function goHome() {
  show("home");
}

// ---------- Chat ----------
function addMsg(text, who = "bot") {
  const d = document.createElement("div");
  d.className = "msg " + who;
  d.textContent = text;
  // avisos de emergência interrompem o leitor de tela na hora
  if (who.includes("emergency")) d.setAttribute("role", "alert");
  chatBox().appendChild(d);
  chatBox().scrollTop = chatBox().scrollHeight;
}

function openChat(mode) {
  state.mode = mode;
  state.step = 0;
  state.answers = [];
  state.confirming = false;
  cancelAi();
  show("chat", false); // o foco vai para a primeira opção, em nextStep()
  chatBox().innerHTML = "";
  optionsBox().innerHTML = "";
  nextStep();
}

function nextStep() {
  document.getElementById("journeySteps").hidden = false;
  document.getElementById("progressTrack").hidden = false;
  renderLiveSummary();
  const item = flows[state.mode][state.step];
  if (!item) {
    finish();
    return;
  }
  // Sem servidor (ex.: arquivo aberto direto do disco) ou com a IA indisponível, o passo é pulado.
  if (item.type === "freeText" && !aiEnabled()) {
    state.step++;
    nextStep();
    return;
  }
  const mark = chatBox().children.length; // quantas mensagens havia antes desta (usado pelo "voltar")
  addMsg(item.text, "bot");
  if (item.type === "info") {
    state.step++;
    nextStep();
    return;
  }
  state.mark = mark;
  if (item.type === "freeText") {
    showAiBox(item);
    return;
  }
  optionsBox().innerHTML = "";
  optionsBox().setAttribute("aria-label", item.text); // leitor de tela lê a pergunta junto com a opção
  item.options.forEach((option) => {
    const b = document.createElement("button");
    b.textContent = option.text;
    b.onclick = () => choose(item, option);
    optionsBox().appendChild(b);
  });
  focusFirstOption();
  updateBackButton();
  updateProgress();
}

// "Pergunta 2 de 5" e a barra fina no topo do chat.
// Conta perguntas já passadas no fluxo (pela posição), e não respostas: a IA pode responder várias de uma vez.
function updateProgress(optional = false) {
  const flow = flows[state.mode];
  const total = flow.filter((i) => i.type === "question").length;
  const done = flow.slice(0, state.step).filter((i) => i.type === "question").length;
  const current = flow[state.step];
  const isOptional = optional || (current && current.type === "freeText");
  document.getElementById("progressLabel").textContent = isOptional
    ? "Etapa opcional · Relato livre"
    : `Pergunta ${Math.min(done + 1, total)} de ${total}`;
  document.getElementById("progressBar").style.width = `${Math.min(done / total, 1) * 100}%`;
  renderJourneySteps(isOptional);
}

const ICONES_RESPOSTA = {
  alerta: "⚠",
  alerta_relato: "⚠",
  motivo: "✚",
  inicio: "◷",
  evolucao: "↗",
  observacoes: "▤",
  objetivo: "◎",
};

function iconeDoCampo(id, alerta = false) {
  return alerta ? "⚠" : ICONES_RESPOSTA[id] || "•";
}

function renderJourneySteps(isOptional = false, completed = false) {
  const lista = document.getElementById("journeySteps");
  const flow = flows[state.mode] || [];
  const steps = flow
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => item.type === "question" || item.type === "freeText");
  lista.innerHTML = steps.map(({ item, index }) => {
    const done = completed || index < state.step;
    const current = !completed && index === state.step;
    const label = item.type === "freeText" ? "Relato livre (opcional)" : item.label;
    const icon = item.type === "freeText" ? "✎" : iconeDoCampo(item.id);
    const className = `journey-step${done ? " is-complete" : ""}`;
    const currentAttr = current ? ' aria-current="step"' : "";
    const shownIcon = done ? "✓" : icon;
    return `<li class="${className}"${currentAttr}><span class="journey-step-icon" aria-hidden="true">${shownIcon}</span><span class="journey-step-label">${escapeHtml(label)}</span></li>`;
  }).join("");
  if (isOptional) {
    document.getElementById("progressLabel").textContent = "Etapa opcional · Relato livre";
  }
}

function renderLiveSummary() {
  const box = document.getElementById("liveSummary");
  const list = document.getElementById("liveSummaryItems");
  const answers = state.answers;
  box.hidden = answers.length === 0;
  list.innerHTML = answers.map((answer) =>
    `<li><span class="live-summary-icon" aria-hidden="true">${iconeDoCampo(answer.id, answer.redFlag)}</span><span><span class="live-summary-label">${escapeHtml(answer.label)}</span><span class="live-summary-value">${escapeHtml(answer.value)}</span></span></li>`
  ).join("");
}

function focusFirstOption() {
  const first = optionsBox().firstElementChild;
  if (first) first.focus();
}

function updateBackButton() {
  document.getElementById("backBtn").disabled = state.answers.length === 0 && !state.confirming;
}

function choose(question, option) {
  optionsBox().innerHTML = ""; // evita registrar a mesma resposta duas vezes (duplo clique)
  addMsg(option.text, "user");
  state.answers.push({
    id: question.id,
    label: question.label,
    value: option.text,
    redFlag: option.redFlag,
    guide: option.guide,
    step: state.step,
    mark: state.mark,
  });
  state.step++;
  if (option.redFlag) {
    if (option.cvv) showEmergency(EMERGENCY_CVV_TEXT, true, true);
    else showEmergency();
    return;
  }
  nextStep();
}

// Interrompe a conversa: mostra o aviso e deixa a pessoa decidir se quer continuar.
// cvvFirst: no caso de pensamentos de se machucar, o CVV vem como botão principal.
function showEmergency(text = EMERGENCY_CHAT_TEXT, withCvv = false, cvvFirst = false) {
  document.getElementById("journeySteps").hidden = true;
  document.getElementById("progressTrack").hidden = true;
  document.getElementById("liveSummary").hidden = true;
  addMsg(text, "bot emergency");

  const makeCall = (number, name, secondary) => {
    const a = document.createElement("a");
    a.className = secondary ? "call secondary-call" : "call";
    a.href = "tel:" + number;
    a.innerHTML = `${PHONE_ICON} Ligar para o ${name} (${number})`;
    return a;
  };
  let call = makeCall(SAMU, "SAMU", false);
  let cvv = withCvv ? makeCall(CVV, "CVV", true) : null;
  if (cvvFirst) {
    call = makeCall(CVV, "CVV", false);
    cvv = makeCall(SAMU, "SAMU", true);
  }

  const hasMore = flows[state.mode].slice(state.step).some((item) => item.type === "question");
  const next = document.createElement("button");
  next.textContent = hasMore ? "Continuar mesmo assim" : "Ver resumo";
  next.onclick = () => {
    optionsBox().innerHTML = "";
    nextStep();
  };

  optionsBox().innerHTML = "";
  optionsBox().setAttribute("aria-label", text);
  optionsBox().appendChild(call);
  if (cvv) optionsBox().appendChild(cvv);
  optionsBox().appendChild(next);
  call.focus();
  updateBackButton();
}

// Volta uma pergunta: apaga a última resposta e as mensagens que vieram depois dela.
function goBack() {
  // Na tela "Confira se está correto", voltar reabre a caixa de texto (o relato ainda não virou resposta).
  if (state.confirming) {
    state.confirming = false;
    cancelAi();
    while (chatBox().children.length > state.mark) chatBox().removeChild(chatBox().lastChild);
    optionsBox().innerHTML = "";
    nextStep();
    return;
  }
  const last = state.answers.pop();
  if (!last) return;
  // respostas vindas da IA entram em lote: voltar desfaz o lote inteiro
  if (last.batch) {
    while (state.answers.length && state.answers[state.answers.length - 1].batch === last.batch) state.answers.pop();
  }
  cancelAi();
  while (chatBox().children.length > last.mark) chatBox().removeChild(chatBox().lastChild);
  optionsBox().innerHTML = "";
  state.step = last.step;
  nextStep();
}

// Da tela de resumo: volta ao chat na última pergunta para corrigir a resposta.
function reviewAnswers() {
  show("chat", false);
  goBack();
}

function restartChat() {
  openChat(state.mode || "sintomas");
}

// ---------- Resumo ----------
function finish() {
  optionsBox().innerHTML = "";
  updateProgressDone();

  const html = state.answers
    .map((a) => `<div class="summary-row"><span class="summary-icon" aria-hidden="true">${iconeDoCampo(a.id, a.redFlag)}</span><strong>${escapeHtml(a.label)}</strong><span class="summary-value">${escapeHtml(a.value)}</span></div>`)
    .join("");
  const aiLabels = state.answers.filter((a) => a.ai).map((a) => a.label);
  const aiNote = aiLabels.length
    ? `<p class="ai-note">Organizado por IA a partir do seu relato e confirmado por você: ${escapeHtml(aiLabels.join(", "))}.</p>`
    : "";
  document.getElementById("summary").innerHTML = (html + aiNote) || "<p>Nenhuma informação registrada.</p>";

  document.getElementById("guide").innerHTML = renderGuide(currentGuide());
  resetCopyFeedback();
  document.getElementById("fichaDate").textContent = new Date().toLocaleDateString("pt-BR");

  const emergency = state.answers.some((a) => a.redFlag);
  document.getElementById("urgency").innerHTML = emergency
    ? '<div class="urgency emergency"><strong>Atenção:</strong> ' + EMERGENCY_RESULT_TEXT + '</div>'
    : '<div class="urgency"><strong>Orientação:</strong> este resumo não determina diagnóstico. Se os sintomas preocuparem você, procure avaliação de um profissional de saúde.</div>';

  document.getElementById("questions").innerHTML = renderGuide(emergency ? null : perguntasGuide());
  if (typeof atualizarBotaoDiario === "function") atualizarBotaoDiario();
  renderNearby(emergency ? [] : servicosPara(state.mode, state.answers));

  // Em emergência, o foco vai direto para o aviso; senão, para o título do resumo.
  const banner = emergency ? document.querySelector("#urgency .emergency") : null;
  show("result", banner || undefined);
}

function updateProgressDone() {
  document.getElementById("progressLabel").textContent = "Concluído";
  document.getElementById("progressBar").style.width = "100%";
  renderJourneySteps(false, true);
}

function renderGuide(g) {
  if (!g) return "";
  const items = g.items
    .map((t) =>
      g.kind === "checklist"
        ? `<li><label><input type="checkbox"><span>${escapeHtml(t)}</span></label></li>`
        : `<li>${escapeHtml(t)}</li>`
    )
    .join("");
  const note = g.note ? `<p class="guide-note">${escapeHtml(g.note)}</p>` : "";
  return `<div class="guide"><h3>${escapeHtml(g.title)}</h3><p>${escapeHtml(g.intro)}</p><ul class="${g.kind}">${items}</ul>${note}</div>`;
}

// ---------- Perguntas para levar ao profissional e serviços por perto ----------
// Tudo aqui é fixo e revisável (sem IA). As perguntas são para a pessoa FAZER ao profissional:
// o site não responde a elas, não sugere remédios e não faz diagnóstico.

const PERGUNTAS_SINTOMA = [
  "O que pode estar causando isso?",
  "Preciso fazer algum exame? Qual e para quê?",
  "Quais sinais indicam que devo voltar ou procurar urgência antes da próxima consulta?",
  "Posso continuar usando os medicamentos que já uso? Algum deve ser evitado agora?",
  "Em quanto tempo devo melhorar e quando devo voltar para reavaliação?",
];
const PERGUNTAS_TEMA = {
  dor: ["Como posso aliviar a dor com segurança, sem piorar o problema?"],
  febre: ["A partir de qual temperatura, ou depois de quantos dias, devo procurar atendimento de novo?"],
  respiracao: ["Preciso de algum exame, como raio-x, para avaliar a respiração?", "Quais sinais de falta de ar pedem atendimento imediato?"],
  digestivo: ["O que posso comer e beber enquanto estiver assim?", "Quais sinais de desidratação devo observar?"],
};
const PERGUNTAS_PIORANDO = ["O que devo fazer se os sintomas continuarem piorando?"];
const PERGUNTAS_CONSULTA = {
  "Consulta de rotina": [
    "Quais exames de rotina fazem sentido para a minha idade e o meu histórico?",
    "Preciso atualizar alguma vacina?",
    "Há algo no meu dia a dia (alimentação, sono, atividade física) que eu deva ajustar?",
    "Quando devo voltar para o próximo acompanhamento?",
  ],
  "Acompanhar tratamento": [
    "O tratamento está funcionando como esperado? Quando será reavaliado?",
    "Quais efeitos colaterais são esperados e quais exigem que eu avise?",
    "Posso tomar outros remédios, chás ou suplementos junto com o tratamento?",
    "O que devo fazer se esquecer uma dose?",
    "Preciso de exames de controle? Com que frequência?",
  ],
  "Levar resultado de exame": [
    "O que o resultado significa no meu caso?",
    "Algum valor está fora do esperado? Isso preocupa?",
    "Preciso repetir o exame ou fazer outros?",
    "O resultado muda algo no meu tratamento ou nos meus cuidados?",
  ],
};

function temaDoMotivo(valor) {
  const t = sem(valor || "");
  if (/febre|temperatura|calafrio/.test(t)) return "febre";
  if (/tosse|respir|falta de ar|catarro|chiado/.test(t)) return "respiracao";
  if (/nausea|vomit|enjoo|diarreia|barriga|estomago|gastr/.test(t)) return "digestivo";
  if (/dor|cabeca|dente|garganta|costas/.test(t)) return "dor";
  return null;
}

// Em emergência não mostramos perguntas de consulta: o foco é ligar para o SAMU.
function perguntasPara(modo, respostas) {
  if (respostas.some((r) => r.redFlag)) return [];
  const valor = (id) => (respostas.find((r) => r.id === id) || {}).value;
  let lista = [];
  if (modo === "sintomas" || modo === "organizar") {
    lista = [
      ...(PERGUNTAS_TEMA[temaDoMotivo(valor("motivo"))] || []),
      ...(valor("evolucao") === "Sim" ? PERGUNTAS_PIORANDO : []),
      ...PERGUNTAS_SINTOMA,
    ];
  } else if (modo === "consulta") {
    const objetivo = valor("objetivo");
    lista = objetivo === "Investigar um sintoma" ? PERGUNTAS_SINTOMA : PERGUNTAS_CONSULTA[objetivo] || [];
  }
  return [...new Set(lista)].slice(0, 7);
}

function perguntasGuide() {
  const itens = perguntasPara(state.mode, state.answers);
  if (!itens.length) return null;
  return {
    title: "Perguntas para fazer ao profissional",
    intro: "Leve estas perguntas anotadas e marque as que já foram respondidas:",
    items: itens,
    kind: "checklist",
    note: "São sugestões gerais para conversar com o profissional. Elas não indicam diagnóstico nem substituem a avaliação.",
  };
}

// O termo de busca enviado ao mapa é só o TIPO de serviço (e a cidade, se a pessoa digitar). Nada do resumo vai junto.
const SERVICOS = {
  ubs: { label: "UBS (posto de saúde)", busca: "UBS Unidade Básica de Saúde" },
  upa: { label: "UPA 24h", busca: "UPA 24 horas" },
  pronto: { label: "Pronto-socorro ou hospital", busca: "pronto socorro hospital" },
  ceo: { label: "CEO (dentista no SUS)", busca: "CEO Centro de Especialidades Odontológicas" },
  odonto: { label: "Pronto atendimento odontológico", busca: "pronto atendimento odontológico" },
  farmacia: { label: "Farmácia", busca: "farmácia" },
  laboratorio: { label: "Laboratório de análises clínicas", busca: "laboratório de análises clínicas" },
};
const SERVICOS_PADRAO = { sintomas: ["ubs", "upa", "pronto"], organizar: ["ubs", "upa", "pronto"], consulta: ["ubs"], atendimento: ["ubs"] };
const SERVICOS_POR_OPCAO = {
  "Consulta de rotina": ["ubs"],
  "Investigar um sintoma": ["ubs", "upa"],
  "Acompanhar tratamento": ["ubs", "farmacia"],
  "Levar resultado de exame": ["laboratorio", "ubs"],
  "Problema sem sinais de emergência": ["ubs"],
  "Sintoma que parece urgente": ["upa", "pronto"],
  "Preciso de atendimento odontológico": ["ubs", "ceo", "odonto"],
  "Dúvida administrativa/UBS": ["ubs"],
};

function servicosPara(modo, respostas) {
  if (respostas.some((r) => r.redFlag)) return [];
  let chaves = SERVICOS_PADRAO[modo] || ["ubs"];
  if (modo === "consulta" || modo === "atendimento") {
    const r = respostas.find((x) => SERVICOS_POR_OPCAO[x.value]);
    if (r) chaves = SERVICOS_POR_OPCAO[r.value];
  }
  return chaves.map((k) => ({ chave: k, ...SERVICOS[k] }));
}

function limparLocal(v) {
  return String(v || "").replace(/[\u0000-\u001f\u007f<>]/g, " ").replace(/\s+/g, " ").trim().slice(0, 60);
}

// Documentação: https://developers.google.com/maps/documentation/urls (api=1 é obrigatório)
function mapsUrl(busca, local) {
  const alvo = local ? `${busca} ${local}` : `${busca} perto de mim`;
  return "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(alvo);
}

function linksServicos(lista, local) {
  return lista
    .map(
      (s) =>
        `<a href="${escapeHtml(mapsUrl(s.busca, local))}" target="_blank" rel="noopener noreferrer">${escapeHtml(s.label)} <span aria-hidden="true">↗</span><span class="sr-only">(abre em outra aba)</span></a>`
    )
    .join("");
}

function renderNearby(lista) {
  const box = document.getElementById("nearby");
  state.nearby = lista;
  if (!lista.length) {
    box.innerHTML = "";
    return;
  }
  box.innerHTML =
    `<div class="nearby"><h3>Serviços perto de você</h3>` +
    `<p>Abre o mapa em outra aba. O MediAção não vê a sua localização e não envia o seu resumo ao mapa.</p>` +
    `<div id="nearbyLinks" class="nearby-links">${linksServicos(lista, "")}</div>` +
    `<label class="nearby-label" for="nearCity">Cidade ou bairro (opcional)</label>` +
    `<input id="nearCity" class="nearby-input" type="text" maxlength="60" autocomplete="off" placeholder="Ex.: bairro ou cidade">` +
    `<p class="nearby-note">Se o mapa não mostrar resultados perto de você, digite sua cidade ou bairro. Confirme o horário e se o serviço atende pelo SUS antes de ir. Em urgência, ligue para o SAMU (${SAMU}).</p></div>`;
  const campo = document.getElementById("nearCity");
  if (campo) {
    campo.oninput = () => {
      document.getElementById("nearbyLinks").innerHTML = linksServicos(state.nearby, limparLocal(campo.value));
    };
  }
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[m]));
}

// ---------- Passo opcional: descrever com palavras + IA ----------
// Regra de ouro: a IA só ORGANIZA o texto. Quem detecta emergência são regras fixas (abaixo),
// e a IA só pode ACRESCENTAR cautela (possivel_sinal_de_alerta), nunca retirá-la.

function aiEnabled() {
  const http = typeof location !== "undefined" && /^https?:$/.test(location.protocol);
  return http && !state.aiUnavailable;
}

const sem = (t) => t.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
const SINAIS_DE_ALERTA = [
  /nao consigo respirar|sem conseguir respirar|falta de ar|dificuldade (para|pra|de) respirar|dificuldade respiratoria|sufoc|asfixi|engasg/,
  /desmai|perdi a consciencia|perdeu a consciencia|apagou|nao acorda|nao reage|muito confus|confusao mental/,
  /hemorragia|sangramento (intenso|forte|que nao para)|sangrando muito|vomit\w* sangue|tossindo sangue|tossi sangue/,
  /dor (forte |intensa )?no peito|aperto no peito|pressao no peito|dor no coracao|peito apertado/,
  // "dor forte" e também "dor de cabeça muito forte", "dor na barriga insuportável", "dor súbita" etc.
  /dor (forte|intensa)|dor\b(\s+\S+){0,3}\s+(muito|extremamente|super) (forte|intensa)|dor\b(\s+\S+){0,3}\s+(insuportavel|subita|repentina)|pior dor(\s+\S+){0,3}\s+(da|na) (minha )?vida/,
  /convuls|rosto torto|boca torta|fala enrolada|fraqueza (de um lado|no lado|em um lado)|formigamento (de um lado|no lado|em um lado)|nao consigo falar|perdi a visao|parei de enxergar/,
  /overdose|envenen|intoxica|tomei (muitos|varios) (remedios|comprimidos)|tomei uma cartela/,
  /me matar|suicid|quero morrer|nao quero mais viver|tirar (a )?minha (propria )?vida|acabar com (tudo|a minha vida)|me machucar|me ferir|me cortar|automutil|sumir de vez/,
];
// Rede de segurança local e imperfeita: pega frases comuns, mas não substitui bom senso nem ligar para o SAMU.
function detectaSinalDeAlerta(texto) {
  const t = sem(texto);
  return SINAIS_DE_ALERTA.some((re) => re.test(t));
}

// Revalida a resposta do servidor: o navegador também não confia cegamente.
function validarDadosIA(d) {
  if (!d || typeof d !== "object") return null;
  const txt = (v, max) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : null);
  const motivo = txt(d.motivo, 80);
  const inicio = txt(d.inicio, 40);
  const observacoes = txt(d.observacoes == null ? "" : d.observacoes, 200);
  if (!motivo || !inicio || observacoes === null) return null;
  if (!["Sim", "Não", "Não sei"].includes(d.piorando)) return null;
  return { motivo, inicio, piorando: d.piorando, observacoes, possivel_sinal_de_alerta: d.possivel_sinal_de_alerta === true };
}

async function organizarRelato(texto) {
  const controle = new AbortController();
  const timer = setTimeout(() => controle.abort(), AI_TIMEOUT_MS);
  try {
    const resp = await fetch(AI_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ texto, captcha: captcha.token || undefined }),
      signal: controle.signal,
    });
    if (resp.status === 404 || resp.status === 405) state.aiUnavailable = true; // site sem a função: não oferece de novo
    if (!resp.ok) return null;
    const json = await resp.json();
    return validarDadosIA(json && json.dados);
  } catch (e) {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

const $ = (id) => document.getElementById(id);

function showAiBox(item) {
  state.aiItem = item;
  state.aiBusy = false;
  optionsBox().innerHTML = "";
  optionsBox().hidden = true;
  $("aiBox").hidden = false;
  $("aiText").value = "";
  $("aiText").disabled = false;
  $("aiConsent").checked = false;
  $("aiCount").textContent = `0/${AI_MAX_CHARS}`;
  setAiStatus("");
  updateAiSendState();
  updateBackButton();
  updateProgress(true);
  scrollChatToEnd();
  prepareCaptcha();
  $("aiText").focus();
}

// A caixa de texto muda a altura da conversa; rola de novo para a última mensagem ficar à vista.
function scrollChatToEnd() {
  chatBox().scrollTop = chatBox().scrollHeight;
}

function hideAiBox() {
  $("aiBox").hidden = true;
  optionsBox().hidden = false;
  $("aiText").value = ""; // não guardamos o relato depois de usar
  $("aiConsent").checked = false;
  setAiStatus("");
  scrollChatToEnd();
}

// Cancela qualquer envio em andamento (a resposta, se chegar, é ignorada).
function cancelAi() {
  state.aiToken++;
  state.aiBusy = false;
  state.aiItem = null;
  hideAiBox();
  resetCaptcha();
}

function setAiStatus(msg) {
  $("aiStatus").textContent = msg;
}

function updateAiSendState() {
  const captchaOk = !captcha.siteKey || Boolean(captcha.token);
  const ok = $("aiConsent").checked && $("aiText").value.trim().length >= 3 && !state.aiBusy && captchaOk;
  $("aiSend").disabled = !ok;
}

function bindAiBox() {
  $("aiText").oninput = () => {
    $("aiCount").textContent = `${$("aiText").value.length}/${AI_MAX_CHARS}`;
    updateAiSendState();
  };
  $("aiConsent").onchange = updateAiSendState;
  $("aiSend").onclick = submitAi;
  $("aiSkip").onclick = skipAi;
}

function skipAi() {
  cancelAi();
  addMsg("Prefiro responder por perguntas", "user");
  state.step++;
  nextStep();
}

async function submitAi() {
  const item = state.aiItem;
  const texto = $("aiText").value.trim();
  if (!item || state.aiBusy || !$("aiConsent").checked || texto.length < 3) return;

  // 1) rede de segurança local: se achar sinal grave, não chama a IA
  if (detectaSinalDeAlerta(texto)) {
    cancelAi();
    addMsg(texto, "user");
    alertaNoRelato();
    return;
  }

  // 2) chamada à IA, com carregando e proteção contra o usuário navegar enquanto espera
  const token = ++state.aiToken;
  state.aiBusy = true;
  $("aiText").disabled = true;
  updateAiSendState();
  setAiStatus("Organizando seu relato…");
  const dados = await organizarRelato(texto);
  if (token !== state.aiToken) return; // a pessoa voltou, pulou ou reiniciou enquanto esperava

  state.aiBusy = false;
  hideAiBox();
  addMsg(texto, "user");
  if (!dados) {
    addMsg(AI_FAIL_TEXT, "bot");
    state.step++;
    nextStep();
    return;
  }
  // a IA só pode acrescentar cautela
  if (dados.possivel_sinal_de_alerta) {
    alertaNoRelato();
    return;
  }
  mostrarConfirmacao(item, dados);
}

function alertaNoRelato() {
  state.answers.push({
    id: "alerta_relato",
    label: "Alerta no relato",
    value: "Mencionado no relato",
    redFlag: true,
    step: state.step,
    mark: state.mark,
  });
  state.step++;
  showEmergency(ALERT_RELATO_TEXT, true);
}

// A pessoa confere o que a IA entendeu antes de virar resumo.
function mostrarConfirmacao(item, d) {
  const linhas = [`Motivo: ${d.motivo}`, `Início: ${d.inicio}`, `Piorando: ${d.piorando}`];
  if (d.observacoes) linhas.push(`Observações: ${d.observacoes}`);
  addMsg("Entendi assim. Confira se está correto:\n" + linhas.join("\n"), "bot");

  const ok = document.createElement("button");
  ok.textContent = "Está correto";
  ok.onclick = () => confirmarAi(item, d);
  const corrigir = document.createElement("button");
  corrigir.textContent = "Corrigir pelas perguntas";
  corrigir.onclick = () => {
    state.confirming = false;
    optionsBox().innerHTML = "";
    addMsg("Corrigir pelas perguntas", "user");
    state.step++;
    nextStep();
  };

  optionsBox().innerHTML = "";
  optionsBox().setAttribute("aria-label", "Confirmar o que foi entendido do seu relato");
  state.confirming = true;
  optionsBox().appendChild(ok);
  optionsBox().appendChild(corrigir);
  focusFirstOption();
  updateBackButton();
}

function confirmarAi(item, d) {
  state.confirming = false;
  optionsBox().innerHTML = "";
  addMsg("Está correto", "user");
  const lote = ++state.batch;
  const base = { ai: true, batch: lote, step: state.step, mark: state.mark };
  state.answers.push({ id: "motivo", label: "Motivo principal", value: d.motivo, ...base });
  state.answers.push({ id: "inicio", label: "Tempo de início", value: d.inicio, ...base });
  state.answers.push({ id: "evolucao", label: "Piorando", value: d.piorando, ...base });
  if (d.observacoes) state.answers.push({ id: "observacoes", label: "Observações", value: d.observacoes, ...base });

  // pula as perguntas que o relato já respondeu
  const flow = flows[state.mode];
  let i = state.step + 1;
  while (flow[i] && flow[i].type === "question" && item.covers.includes(flow[i].id)) i++;
  state.step = i;
  nextStep();
}

// ---------- Copiar resumo ----------
function currentGuide() {
  return [...state.answers].reverse().find((a) => a.guide)?.guide;
}

// O texto copiado é montado a partir do estado (não da tela), para incluir tudo que o resumo mostra.
function buildSummaryText() {
  const lines = ["MediAção — resumo para atendimento", "Data: " + new Date().toLocaleDateString("pt-BR"), ""];
  state.answers.forEach((a) => lines.push(`${a.label}: ${a.value}`));

  if (state.answers.some((a) => a.redFlag)) {
    lines.push("", "ATENÇÃO: " + EMERGENCY_RESULT_TEXT);
  }

  const aiLabels = state.answers.filter((a) => a.ai).map((a) => a.label);
  if (aiLabels.length) lines.push("", `Organizado por IA a partir do relato da pessoa e confirmado por ela: ${aiLabels.join(", ")}.`);

  const g = currentGuide();
  if (g) {
    lines.push("", g.title, g.intro);
    g.items.forEach((item) => lines.push((g.kind === "checklist" ? "[ ] " : "- ") + item));
    if (g.note) lines.push("", g.note);
  }

  const q = perguntasGuide();
  if (q) {
    lines.push("", q.title);
    q.items.forEach((item) => lines.push("[ ] " + item));
  }

  lines.push("", "Este resumo é apenas informativo e não substitui a avaliação de um profissional de saúde.");
  return lines.join("\n");
}

// Tenta a API moderna do navegador e, se não der, o método antigo. Devolve true só se copiou de fato.
async function copyText(text) {
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch (e) {
    // segue para o método alternativo
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return Boolean(ok);
  } catch (e) {
    return false;
  }
}

// Cada aviso entra como um elemento novo, para o leitor de tela anunciar também cliques repetidos.
function setCopyStatus(message, isError = false) {
  const box = document.getElementById("copyStatus");
  box.className = "copy-status" + (isError ? " error" : "");
  box.innerHTML = "";
  const span = document.createElement("span");
  span.textContent = message;
  box.appendChild(span);
}

function resetCopyFeedback() {
  document.getElementById("copyStatus").innerHTML = "";
  document.getElementById("copyFallback").innerHTML = "";
}

// Último recurso: mostra o texto selecionado para a pessoa copiar manualmente.
function showManualCopy(text) {
  const box = document.getElementById("copyFallback");
  box.innerHTML = "";
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.readOnly = true;
  ta.setAttribute("aria-label", "Texto do resumo para copiar manualmente");
  box.appendChild(ta);
  ta.focus();
  ta.select();
}

async function copySummary() {
  const text = buildSummaryText();
  document.getElementById("copyFallback").innerHTML = "";
  if (await copyText(text)) {
    setCopyStatus("Resumo copiado.");
  } else {
    setCopyStatus("Não foi possível copiar automaticamente. Selecione o texto abaixo e copie manualmente.", true);
    showManualCopy(text);
  }
}

// ---------- Verificação anti-robô opcional (Cloudflare Turnstile) ----------
// Só aparece se o servidor tiver a chave TURNSTILE_SITE_KEY configurada (veja LEIA-ME-IA.md).
const captcha = { siteKey: null, loaded: false, widget: null, token: null, checked: false };

async function loadCaptchaConfig() {
  if (captcha.checked || !aiEnabled()) return;
  captcha.checked = true;
  try {
    const r = await fetch("/api/config", { headers: { Accept: "application/json" } });
    if (!r.ok) return;
    const j = await r.json();
    if (j && typeof j.turnstileSiteKey === "string" && j.turnstileSiteKey) captcha.siteKey = j.turnstileSiteKey;
  } catch (e) {
    // sem configuração: segue sem verificação
  }
}

function loadTurnstileScript() {
  return new Promise((resolve, reject) => {
    if (window.turnstile) return resolve();
    const s = document.createElement("script");
    s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    s.async = true;
    s.onload = () => resolve();
    s.onerror = reject;
    document.head.appendChild(s);
  });
}

async function prepareCaptcha() {
  await loadCaptchaConfig();
  if (!captcha.siteKey || !state.aiItem) return;
  const box = $("aiCaptcha");
  box.hidden = false;
  try {
    await loadTurnstileScript();
    if (captcha.widget !== null) {
      window.turnstile.reset(captcha.widget);
    } else {
      captcha.widget = window.turnstile.render(box, {
        sitekey: captcha.siteKey,
        language: "pt-BR",
        callback: (t) => { captcha.token = t; updateAiSendState(); },
        "expired-callback": () => { captcha.token = null; updateAiSendState(); },
        "error-callback": () => { captcha.token = null; updateAiSendState(); },
      });
    }
  } catch (e) {
    box.hidden = true;
  }
  updateAiSendState();
}

function resetCaptcha() {
  captcha.token = null;
  if (captcha.widget !== null && window.turnstile) window.turnstile.reset(captcha.widget);
}

// ---------- Botões da página (sem onclick no HTML, para permitir uma CSP rígida) ----------
function bindPage() {
  document.querySelectorAll("[data-chat]").forEach((b) => b.addEventListener("click", () => openChat(b.dataset.chat)));
  const actions = {
    home: goHome,
    about: () => show("about"),
    back: goBack,
    restart: restartChat,
    copy: copySummary,
    review: reviewAnswers,
    print: () => window.print(),
  };
  document.querySelectorAll("[data-action]").forEach((b) => {
    const fn = actions[b.dataset.action];
    if (fn) b.addEventListener("click", fn);
  });
}

bindPage();
bindAiBox();
