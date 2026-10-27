// MediAção: diário de sintomas.
//
// PRIVACIDADE: este arquivo NUNCA faz chamadas de rede (sem fetch, sem envio a servidor ou à IA).
// Os registros ficam só no localStorage deste navegador, e só depois que a pessoa ativa o diário.
// Um teste automático confere que este arquivo não contém chamadas de rede.
//
// O diário não interpreta os registros nem sugere condutas: ele só guarda, mostra e exporta.

const DIARIO_CHAVE = "mediacao.diario.v1";
const DIARIO_MAX_REGISTROS = 365;
const DIARIO_TENDENCIAS = ["Melhor", "Igual", "Pior", "Sem piora", "Não sei"];
const DIARIO_AVISO_FIM = "Este diário é apenas informativo e não substitui a avaliação de um profissional de saúde.";
const DIARIO_PRIVACIDADE = [
  "Os registros ficam salvos só neste aparelho, dentro do navegador. Não são enviados a nenhum servidor nem à IA.",
  "Quem usar este aparelho e este navegador pode ver o diário. Em aparelho compartilhado, prefira não ativar ou apague depois.",
  "Se você limpar os dados do navegador, o diário também é apagado.",
  "Não escreva nome, documentos ou outros dados que identifiquem você.",
  "Você pode apagar um registro ou o diário inteiro quando quiser.",
];

// ---------- Armazenamento ----------

function diarioNovoId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return "r" + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

function diarioTexto1(v, max) {
  return typeof v === "string" ? v.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max) : "";
}

// Revalida cada registro lido do armazenamento: o que está salvo pode ter sido alterado de fora.
function diarioLimparRegistro(r) {
  if (!r || typeof r !== "object") return null;
  const quando = new Date(r.quando);
  const sintoma = diarioTexto1(r.sintoma, 80);
  if (isNaN(quando.getTime()) || !sintoma) return null;
  const intensidade = Number.isInteger(r.intensidade) && r.intensidade >= 0 && r.intensidade <= 10 ? r.intensidade : null;
  const temperatura = typeof r.temperatura === "number" && r.temperatura >= 30 && r.temperatura <= 45 ? Math.round(r.temperatura * 10) / 10 : null;
  return {
    id: typeof r.id === "string" && r.id ? r.id.slice(0, 64) : diarioNovoId(),
    quando: quando.toISOString(),
    sintoma,
    tendencia: DIARIO_TENDENCIAS.includes(r.tendencia) ? r.tendencia : null,
    intensidade,
    temperatura,
    obs: diarioTexto1(r.obs, 300),
    origem: r.origem === "resumo" ? "resumo" : "manual",
  };
}

// estado: "indisponivel" (navegador não deixa salvar) | "desativado" | "ilegivel" | "ativo"
function diarioLer() {
  let bruto;
  try {
    bruto = localStorage.getItem(DIARIO_CHAVE);
  } catch (e) {
    return { estado: "indisponivel" };
  }
  if (bruto === null || bruto === undefined) return { estado: "desativado" };
  try {
    const d = JSON.parse(bruto);
    if (d && d.v === 1 && Array.isArray(d.registros)) {
      return { estado: "ativo", dados: { ...d, registros: d.registros.map(diarioLimparRegistro).filter(Boolean) } };
    }
  } catch (e) {
    // cai em "ilegivel"; não apagamos nada sozinhos
  }
  return { estado: "ilegivel" };
}

function diarioGravar(dados) {
  try {
    localStorage.setItem(DIARIO_CHAVE, JSON.stringify(dados));
    return true;
  } catch (e) {
    return false;
  }
}

function diarioApagarDados() {
  try {
    localStorage.removeItem(DIARIO_CHAVE);
    return true;
  } catch (e) {
    return false;
  }
}

function diarioAtivarArmazenamento() {
  const agora = new Date().toISOString();
  return diarioGravar({ v: 1, criadoEm: agora, consentimentoEm: agora, registros: [] });
}

// ---------- Validação e operações ----------

function diarioValidar(c, agora = new Date()) {
  const falha = (campo, erro) => ({ ok: false, campo, erro });
  const sintoma = diarioTexto1(c.sintoma, 500);
  if (!sintoma) return falha("dSintoma", "Escreva o sintoma que você quer anotar.");
  if (sintoma.length > 80) return falha("dSintoma", "O sintoma deve ter até 80 caracteres.");

  const quando = new Date(c.quando);
  if (!c.quando || isNaN(quando.getTime())) return falha("dQuando", "Informe uma data e uma hora válidas.");
  if (quando.getTime() > agora.getTime() + 5 * 60 * 1000) return falha("dQuando", "A data e a hora não podem estar no futuro.");

  let tendencia = null;
  if (c.tendencia) {
    if (!DIARIO_TENDENCIAS.includes(c.tendencia)) return falha("dTendencia", "Escolha uma das opções de como você está.");
    tendencia = c.tendencia;
  }

  let intensidade = null;
  if (c.intensidade !== "" && c.intensidade !== null && c.intensidade !== undefined) {
    const n = Number(c.intensidade);
    if (!Number.isInteger(n) || n < 0 || n > 10) return falha("dIntensidade", "A intensidade vai de 0 a 10.");
    intensidade = n;
  }

  let temperatura = null;
  if (c.temperatura !== "" && c.temperatura !== null && c.temperatura !== undefined) {
    const n = parseFloat(String(c.temperatura).replace(",", "."));
    if (!isFinite(n) || n < 30 || n > 45) return falha("dTemperatura", "Informe a temperatura entre 30 e 45 °C ou deixe em branco.");
    temperatura = Math.round(n * 10) / 10;
  }

  const obs = diarioTexto1(c.obs, 1000);
  if (obs.length > 300) return falha("dObs", "As observações devem ter até 300 caracteres.");

  return {
    ok: true,
    registro: { id: diarioNovoId(), quando: quando.toISOString(), sintoma, tendencia, intensidade, temperatura, obs, origem: c.origem === "resumo" ? "resumo" : "manual" },
  };
}

function diarioAdicionar(registro) {
  const est = diarioLer();
  if (est.estado !== "ativo") return { ok: false, erro: "O diário não está ativo neste aparelho." };
  if (est.dados.registros.length >= DIARIO_MAX_REGISTROS) {
    return { ok: false, erro: `O diário chegou ao limite de ${DIARIO_MAX_REGISTROS} registros. Apague registros antigos para continuar.` };
  }
  const dados = { ...est.dados, registros: [...est.dados.registros, registro] };
  if (!diarioGravar(dados)) return { ok: false, erro: "Não foi possível salvar neste aparelho. O armazenamento do navegador pode estar cheio ou bloqueado." };
  return { ok: true };
}

function diarioExcluir(id) {
  const est = diarioLer();
  if (est.estado !== "ativo") return false;
  return diarioGravar({ ...est.dados, registros: est.dados.registros.filter((r) => r.id !== id) });
}

// ---------- Formatação e exportação ----------

function diarioFormatarData(iso) {
  return new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}
const diarioFormatarTemp = (t) => String(t).replace(".", ",") + " °C";
const diarioPorData = (a, b) => new Date(a.quando).getTime() - new Date(b.quando).getTime();

// Para a consulta: do mais antigo para o mais recente (é como o profissional costuma ler a evolução).
function diarioTexto(registros, agora = new Date()) {
  const asc = [...registros].sort(diarioPorData);
  const linhas = ["MediAção: diário de sintomas", `Gerado em ${agora.toLocaleDateString("pt-BR")}. Registros: ${asc.length}.`, ""];
  for (const r of asc) {
    const partes = [r.sintoma];
    if (r.tendencia) partes.push(`como está: ${r.tendencia}`);
    if (r.intensidade !== null) partes.push(`intensidade ${r.intensidade}/10`);
    if (r.temperatura !== null) partes.push(`temperatura ${diarioFormatarTemp(r.temperatura)}`);
    linhas.push(`${diarioFormatarData(r.quando)}: ${partes.join(" | ")}`);
    if (r.obs) linhas.push(`   Observações: ${r.obs}`);
  }
  linhas.push("", DIARIO_AVISO_FIM);
  return linhas.join("\n");
}

// Gráfico simples da intensidade (0 a 10) ao longo do tempo. Só mostra os números, sem interpretar.
function diarioGrafico(registros) {
  const pts = registros.filter((r) => r.intensidade !== null).sort(diarioPorData);
  if (pts.length < 2) return "";
  const W = 640, H = 200, ml = 36, mr = 16, mt = 16, mb = 34;
  const t0 = new Date(pts[0].quando).getTime(), t1 = new Date(pts[pts.length - 1].quando).getTime();
  const x = (r, i) => ml + (t1 === t0 ? (i / (pts.length - 1)) : (new Date(r.quando).getTime() - t0) / (t1 - t0)) * (W - ml - mr);
  const y = (v) => mt + (1 - v / 10) * (H - mt - mb);
  const coords = pts.map((r, i) => [x(r, i), y(r.intensidade)]);
  const curta = (iso) => new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
  const primeiro = pts[0], ultimo = pts[pts.length - 1];
  const resumo = `Intensidade de 0 a 10 ao longo do tempo: de ${primeiro.intensidade} em ${curta(primeiro.quando)} para ${ultimo.intensidade} em ${curta(ultimo.quando)}, em ${pts.length} registros.`;
  return (
    `<figure class="diary-chart"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${escapeHtml(resumo)}">` +
    `<line class="chart-axis" x1="${ml}" y1="${y(0)}" x2="${W - mr}" y2="${y(0)}"/>` +
    `<line class="chart-axis" x1="${ml}" y1="${y(10)}" x2="${W - mr}" y2="${y(10)}"/>` +
    `<text class="chart-text" x="${ml - 8}" y="${y(10) + 4}" text-anchor="end">10</text>` +
    `<text class="chart-text" x="${ml - 8}" y="${y(0) + 4}" text-anchor="end">0</text>` +
    `<polyline class="chart-line" fill="none" points="${coords.map((c) => c.map((n) => n.toFixed(1)).join(",")).join(" ")}"/>` +
    coords.map((c) => `<circle class="chart-dot" cx="${c[0].toFixed(1)}" cy="${c[1].toFixed(1)}" r="4"/>`).join("") +
    `<text class="chart-text" x="${ml}" y="${H - 10}" text-anchor="start">${curta(primeiro.quando)}</text>` +
    `<text class="chart-text" x="${W - mr}" y="${H - 10}" text-anchor="end">${curta(ultimo.quando)}</text>` +
    `</svg><figcaption>${escapeHtml(resumo)}</figcaption></figure>`
  );
}

// ---------- Tela ----------

const diarioEl = (id) => document.getElementById(id);

function diarioAgoraLocalInput() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

function diarioStatus(msg, erro = false) {
  const box = diarioEl("diaryStatus");
  box.className = "diary-status" + (erro ? " error" : "");
  box.innerHTML = "";
  if (!msg) return; // sem mensagem, o aviso some por inteiro
  const span = document.createElement("span");
  span.textContent = msg;
  box.appendChild(span);
}

function diarioErro(msg) {
  diarioEl("diaryError").textContent = msg;
}

// `pendente` só existe quando a pessoa clicou em "Salvar no diário" no resumo. Qualquer outra
// forma de abrir o diário descarta um pendente antigo, para nunca salvar algo sem querer.
function abrirDiario(pendente = null) {
  state.diarioPendente = pendente;
  state.diarioConfirmando = null;
  diarioEl("diaryWipeBox").hidden = true;
  diarioEl("diaryFallback").innerHTML = "";
  diarioStatus("");
  diarioErro("");
  diarioRender();
  show("diary");
}

function diarioRender() {
  const est = diarioLer();
  diarioEl("diaryOff").hidden = est.estado !== "desativado";
  diarioEl("diaryOn").hidden = est.estado !== "ativo";
  diarioEl("diaryUnavailable").hidden = est.estado !== "indisponivel";
  diarioEl("diaryBroken").hidden = est.estado !== "ilegivel";
  diarioEl("diaryPrivacyList").innerHTML = DIARIO_PRIVACIDADE.map((t) => `<li>${escapeHtml(t)}</li>`).join("");
  diarioEl("diaryAlert").textContent = SAMU_NOTE;
  diarioEl("diaryPrintDate").textContent = `Diário gerado em ${new Date().toLocaleDateString("pt-BR")}. Documento apenas informativo.`;
  diarioAtualizarBotaoAtivar();

  if (est.estado !== "ativo") {
    diarioEl("diaryList").innerHTML = "";
    diarioEl("diaryChart").innerHTML = "";
    return;
  }
  const regs = [...est.dados.registros].sort(diarioPorData).reverse(); // mais recente primeiro
  diarioEl("diaryCount").textContent = regs.length === 1 ? "1 registro" : `${regs.length} registros`;
  diarioEl("diaryCopy").disabled = regs.length === 0;
  diarioEl("diaryPrint").disabled = regs.length === 0;
  diarioEl("diaryChart").innerHTML = diarioGrafico(regs);
  diarioEl("diaryList").innerHTML = regs.length
    ? regs.map(diarioItemHtml).join("")
    : '<li class="diary-empty">Nenhum registro ainda. Anote o primeiro acima.</li>';
  if (!diarioEl("dQuando").value) diarioEl("dQuando").value = diarioAgoraLocalInput();
}

function diarioItemHtml(r) {
  const meta = [];
  if (r.tendencia) meta.push(["Como está", r.tendencia]);
  if (r.intensidade !== null) meta.push(["Intensidade", `${r.intensidade} de 10`]);
  if (r.temperatura !== null) meta.push(["Temperatura", diarioFormatarTemp(r.temperatura)]);
  const quando = diarioFormatarData(r.quando);
  const confirmando = state.diarioConfirmando === r.id;
  const acoes = confirmando
    ? `<span class="diary-confirm">Apagar este registro?</span>` +
      `<button type="button" class="diary-danger" data-diary-del-ok="${escapeHtml(r.id)}">Sim, apagar</button>` +
      `<button type="button" data-diary-del-no="${escapeHtml(r.id)}">Cancelar</button>`
    : `<button type="button" data-diary-del="${escapeHtml(r.id)}" aria-label="Apagar o registro de ${escapeHtml(r.sintoma)} em ${escapeHtml(quando)}">Apagar</button>`;
  return (
    `<li class="diary-entry"><div class="diary-entry-head"><time datetime="${escapeHtml(r.quando)}">${escapeHtml(quando)}</time>` +
    (r.origem === "resumo" ? '<span class="diary-tag">do resumo</span>' : "") +
    `</div><p class="diary-entry-title">${escapeHtml(r.sintoma)}</p>` +
    (meta.length ? `<dl class="diary-meta">${meta.map(([k, v]) => `<div><dt>${k}</dt><dd>${escapeHtml(v)}</dd></div>`).join("")}</dl>` : "") +
    (r.obs ? `<p class="diary-entry-obs">${escapeHtml(r.obs)}</p>` : "") +
    `<div class="diary-entry-actions">${acoes}</div></li>`
  );
}

function diarioAtualizarBotaoAtivar() {
  diarioEl("diaryEnable").disabled = !diarioEl("diaryConsent").checked;
}

// Ativar exige o consentimento marcado. Sem isso nada é gravado.
function diarioAtivar() {
  if (!diarioEl("diaryConsent").checked) return;
  if (diarioLer().estado !== "desativado") return;
  if (!diarioAtivarArmazenamento()) {
    diarioErro("Não foi possível ativar: o navegador não deixou salvar dados neste aparelho.");
    return;
  }
  diarioEl("diaryConsent").checked = false;
  diarioErro("");
  let aviso = "Diário ativado neste aparelho.";
  if (state.diarioPendente) {
    const r = diarioAdicionar(state.diarioPendente);
    state.diarioPendente = null;
    aviso = r.ok ? "Diário ativado e resumo salvo." : "Diário ativado, mas não foi possível salvar o resumo.";
    if (r.ok) state.diarioSalvoDoResumo = true;
  }
  diarioRender();
  diarioStatus(aviso, false);
  diarioEl("dSintoma").focus();
}

function diarioLerFormulario() {
  return {
    sintoma: diarioEl("dSintoma").value,
    quando: diarioEl("dQuando").value,
    tendencia: diarioEl("dTendencia").value,
    intensidade: diarioEl("dIntensidade").value,
    temperatura: diarioEl("dTemperatura").value,
    obs: diarioEl("dObs").value,
    origem: "manual",
  };
}

function diarioSalvarFormulario() {
  diarioErro("");
  const v = diarioValidar(diarioLerFormulario());
  if (!v.ok) {
    diarioErro(v.erro);
    diarioEl(v.campo).focus();
    return;
  }
  const r = diarioAdicionar(v.registro);
  if (!r.ok) {
    diarioErro(r.erro);
    return;
  }
  ["dSintoma", "dTemperatura", "dObs"].forEach((id) => (diarioEl(id).value = ""));
  diarioEl("dTendencia").value = "";
  diarioEl("dIntensidade").value = "";
  diarioEl("dQuando").value = diarioAgoraLocalInput();
  diarioRender();
  diarioStatus("Registro salvo neste aparelho.");
  diarioEl("dSintoma").focus();
}

// ---------- Exclusão (sempre em dois passos) ----------

function diarioPedirExclusao(id) {
  state.diarioConfirmando = id;
  diarioRender();
}

function diarioCancelarExclusao() {
  state.diarioConfirmando = null;
  diarioRender();
}

function diarioConfirmarExclusao(id) {
  state.diarioConfirmando = null;
  const ok = diarioExcluir(id);
  diarioRender();
  diarioStatus(ok ? "Registro apagado." : "Não foi possível apagar o registro.", !ok);
}

function diarioPedirApagarTudo() {
  diarioEl("diaryWipeBox").hidden = false;
  diarioEl("diaryWipeNo").focus();
}

function diarioCancelarApagarTudo() {
  diarioEl("diaryWipeBox").hidden = true;
}

function diarioApagarTudo() {
  const ok = diarioApagarDados();
  state.diarioConfirmando = null;
  state.diarioPendente = null;
  diarioEl("diaryWipeBox").hidden = true;
  diarioRender();
  diarioStatus(ok ? "Diário apagado e desativado neste aparelho." : "Não foi possível apagar os dados do diário.", !ok);
}

// ---------- Copiar para a consulta ----------

async function diarioCopiar() {
  const est = diarioLer();
  if (est.estado !== "ativo" || !est.dados.registros.length) return;
  const texto = diarioTexto(est.dados.registros);
  diarioEl("diaryFallback").innerHTML = "";
  if (await copyText(texto)) {
    diarioStatus("Diário copiado. Cole onde quiser levar à consulta.");
    return;
  }
  diarioStatus("Não foi possível copiar automaticamente. Selecione o texto abaixo e copie manualmente.", true);
  const ta = document.createElement("textarea");
  ta.value = texto;
  ta.readOnly = true;
  ta.setAttribute("aria-label", "Texto do diário para copiar manualmente");
  diarioEl("diaryFallback").appendChild(ta);
  ta.focus();
  ta.select();
}

// ---------- Salvar o resumo no diário ----------

function diarioValorResposta(id) {
  const r = state.answers.find((a) => a.id === id);
  return r ? r.value : undefined;
}

// Só fluxos de sintomas, e nunca quando há sinal de alerta.
function diarioRegistroDoResumo() {
  if (state.mode !== "sintomas" && state.mode !== "organizar") return null;
  if (state.answers.some((a) => a.redFlag)) return null;
  const sintoma = diarioTexto1(diarioValorResposta("motivo") || "", 80);
  if (!sintoma) return null;
  const tendencia = { Sim: "Pior", Não: "Sem piora", "Não sei": "Não sei" }[diarioValorResposta("evolucao")] || null;
  const partes = [];
  const inicio = diarioValorResposta("inicio");
  if (inicio) partes.push(`Início: ${inicio}.`);
  const obs = diarioValorResposta("observacoes");
  if (obs) partes.push(obs);
  const v = diarioValidar({ sintoma, quando: new Date().toISOString(), tendencia, intensidade: "", temperatura: "", obs: diarioTexto1(partes.join(" "), 300), origem: "resumo" }, new Date(Date.now() + 60000));
  return v.ok ? v.registro : null;
}

// Chamado quando o resumo é montado: mostra ou esconde o botão.
function atualizarBotaoDiario() {
  state.diarioSalvoDoResumo = false;
  state.diarioPendente = null;
  const btn = diarioEl("diarySaveBtn");
  btn.hidden = !(diarioRegistroDoResumo() && diarioLer().estado !== "indisponivel");
}

function salvarResumoNoDiario() {
  const registro = diarioRegistroDoResumo();
  if (!registro) return;
  const est = diarioLer();
  if (est.estado === "desativado") {
    abrirDiario(registro); // só é gravado se a pessoa ativar o diário
    return;
  }
  if (est.estado !== "ativo") return;
  if (state.diarioSalvoDoResumo) {
    setCopyStatus("Este resumo já foi salvo no diário.");
    return;
  }
  const r = diarioAdicionar(registro);
  if (r.ok) state.diarioSalvoDoResumo = true;
  setCopyStatus(r.ok ? "Salvo no diário deste aparelho. Abra o diário para ver os registros." : r.erro, !r.ok);
}

// ---------- Ligações ----------

function bindDiario() {
  document.querySelectorAll("[data-diary]").forEach((b) =>
    b.addEventListener("click", () => {
      if (b.dataset.diary === "open") abrirDiario(null);
      if (b.dataset.diary === "save") salvarResumoNoDiario();
    })
  );
  diarioEl("diaryConsent").onchange = diarioAtualizarBotaoAtivar;
  diarioEl("diaryEnable").onclick = diarioAtivar;
  diarioEl("diarySaveEntry").onclick = diarioSalvarFormulario;
  diarioEl("diaryCopy").onclick = diarioCopiar;
  diarioEl("diaryPrint").onclick = () => window.print();
  diarioEl("diaryWipe").onclick = diarioPedirApagarTudo;
  diarioEl("diaryWipeBroken").onclick = diarioPedirApagarTudo;
  diarioEl("diaryWipeYes").onclick = diarioApagarTudo;
  diarioEl("diaryWipeNo").onclick = diarioCancelarApagarTudo;
  diarioEl("diaryList").onclick = (e) => {
    const alvo = e.target && e.target.closest ? e.target.closest("button") : null;
    if (!alvo) return;
    if (alvo.dataset.diaryDel) diarioPedirExclusao(alvo.dataset.diaryDel);
    else if (alvo.dataset.diaryDelOk) diarioConfirmarExclusao(alvo.dataset.diaryDelOk);
    else if (alvo.dataset.diaryDelNo) diarioCancelarExclusao();
  };
}

bindDiario();
