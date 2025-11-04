// main.js

// ====== ELEMENTS ======
const tabExplainBtn = document.getElementById("tabExplainBtn");
const tabRefactorBtn = document.getElementById("tabRefactorBtn");
const tabTestsBtn = document.getElementById("tabTestsBtn");

const tabExplain = document.getElementById("tab-explain");
const tabRefactor = document.getElementById("tab-refactor");
const tabTests = document.getElementById("tab-tests");

const analyzeBtn = document.getElementById("analyzeBtn");
const refactorBtn = document.getElementById("refactorBtn");
const testsBtn = document.getElementById("testsBtn");
const clearBtn = document.getElementById("clearBtn");

const modeSelect = document.getElementById("modeSelect");
const langSelect = document.getElementById("langSelect");

const currentModeText = document.getElementById("currentModeText");
const currentModeDesc = document.getElementById("currentModeDesc");
const inputsOutputsSection = document.getElementById("inputsOutputsSection");

const loadingEl = document.getElementById("loading");

// output fields
const respSummary = document.getElementById("respSummary");
const respInputsOutputs = document.getElementById("respInputsOutputs");
const respSteps = document.getElementById("respSteps");
const respComplexity = document.getElementById("respComplexity");
const respImprovements = document.getElementById("respImprovements");
const respCaution = document.getElementById("respCaution");

const refactorOutputBox = document.getElementById("refactorOutputBox");
const refactorWhy = document.getElementById("refactorWhy");
const copyRefactorBtn = document.getElementById("copyRefactorBtn");

const testOutputBox = document.getElementById("testOutputBox");
const testNotes = document.getElementById("testNotes");

// ====== TAB HANDLER ======
function showTab(tabId) {
  const allTabs = document.querySelectorAll(".tab-panel");
  const allButtons = document.querySelectorAll(".tab-btn");

  allTabs.forEach((p) => p.classList.add("hidden"));
  allButtons.forEach((b) => b.classList.remove("active"));

  document.getElementById(tabId).classList.remove("hidden");
  document
    .querySelector(`.tab-btn[data-tab="${tabId}"]`)
    .classList.add("active");
}

// tab button clicks
tabExplainBtn.addEventListener("click", () => showTab("tab-explain"));
tabRefactorBtn.addEventListener("click", () => showTab("tab-refactor"));
tabTestsBtn.addEventListener("click", () => showTab("tab-tests"));

// ====== MODE SWITCH ======
modeSelect.addEventListener("change", () => {
  const mode = modeSelect.value;
  if (mode === "beginner") {
    document.body.classList.add("beginner");
    currentModeText.textContent = "Beginner 👶";
    currentModeDesc.textContent =
      "Explanations will be slow, friendly and include inputs/outputs.";
    inputsOutputsSection.style.display = "block";
  } else {
    document.body.classList.remove("beginner");
    currentModeText.textContent = "Pro 🚀";
    currentModeDesc.textContent =
      "Explanations will be concise and focus on complexity and improvements.";
    inputsOutputsSection.style.display = "none";
  }
});

// ====== LOADING ======
function setLoading(isLoading) {
  if (isLoading) {
    loadingEl.classList.remove("hidden");
    analyzeBtn.disabled = true;
    refactorBtn.disabled = true;
    testsBtn.disabled = true;
  } else {
    loadingEl.classList.add("hidden");
    analyzeBtn.disabled = false;
    refactorBtn.disabled = false;
    testsBtn.disabled = false;
  }
}

// ====== FORMATTERS ======
function formatImprovements(improvements) {
  if (!improvements || !Array.isArray(improvements) || improvements.length === 0)
    return "No improvements suggested.";

  return improvements
    .map((item) => {
      // string → use directly
      if (typeof item === "string") {
        return `• ${item}`;
      }
      // object → try {name, note}
      if (item && typeof item === "object") {
        const name = item.name || item.title || "Suggestion";
        const note = item.note || item.desc || item.description || "";
        if (note) {
          return `• ${name}: ${note}`;
        }
        return `• ${name}`;
      }
      // fallback
      return `• ${JSON.stringify(item)}`;
    })
    .join("\n");
}

function setCodeLanguage(el, lang) {
  // remove any existing language-* classes but keep others
  el.classList.forEach((cls) => {
    if (cls.startsWith("language-")) {
      el.classList.remove(cls);
    }
  });

  // append the correct language class
  if (lang === "python") {
    el.classList.add("language-python");
  } else if (lang === "javascript") {
    el.classList.add("language-javascript");
  } else if (lang === "java") {
    el.classList.add("language-java");
  } else {
    el.classList.add("language-python");
  }
}

// ====== ANALYZE ======
analyzeBtn.addEventListener("click", async () => {
  const mode = modeSelect.value;
  const code = document.getElementById("codeInput").value;
  const question = document.getElementById("questionInput").value;

  setLoading(true);

  try {
    const res = await fetch("/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode, code, question })
    });
    const data = await res.json();

    respSummary.textContent = data.summary || "";
    respComplexity.textContent = data.time_complexity || "";
    respCaution.textContent = data.caution || "";

    // steps
    if (Array.isArray(data.steps)) {
      respSteps.textContent = data.steps
        .map((s, i) => `${i + 1}. ${s}`)
        .join("\n");
    } else {
      respSteps.textContent = "";
    }

    // improvements as objects → pretty
    respImprovements.textContent = formatImprovements(data.improvements);

    // beginner-only
    if (mode === "beginner" && data.inputs_outputs) {
      inputsOutputsSection.style.display = "block";
      respInputsOutputs.textContent =
        `Inputs: ${data.inputs_outputs.inputs}\n` +
        `Outputs: ${data.inputs_outputs.outputs}\n` +
        `Side effects: ${data.inputs_outputs.side_effects}`;
    } else {
      inputsOutputsSection.style.display = "none";
    }

    // show explanation tab
    showTab("tab-explain");
  } catch (err) {
    console.error(err);
  } finally {
    setLoading(false);
  }
});

// ====== REFACTOR ======
refactorBtn.addEventListener("click", async () => {
  const mode = modeSelect.value;
  const code = document.getElementById("codeInput").value;
  const lang = langSelect.value;

  setLoading(true);

  try {
    const res = await fetch("/api/refactor", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode, code })
    });
    const data = await res.json();

    // set code + language
    setCodeLanguage(refactorOutputBox, lang);
    refactorOutputBox.textContent = data.refactored_code || "";
    refactorWhy.textContent = Array.isArray(data.rationale)
      ? data.rationale.map((r) => `• ${r}`).join("\n")
      : "";

    // re-highlight
    if (window.Prism) {
      Prism.highlightAll();
    }

    // show only refactor tab
    showTab("tab-refactor");
  } catch (err) {
    console.error(err);
  } finally {
    setLoading(false);
  }
});

// copy button
copyRefactorBtn.addEventListener("click", async () => {
  const text = refactorOutputBox.textContent;
  try {
    await navigator.clipboard.writeText(text);
    alert("Refactored code copied!");
  } catch (e) {
    console.error(e);
  }
});

// ====== TESTS ======
testsBtn.addEventListener("click", async () => {
  const mode = modeSelect.value;
  const code = document.getElementById("codeInput").value;
  const language = langSelect.value;

  setLoading(true);

  try {
    const res = await fetch("/api/tests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode, code, language })
    });
    const data = await res.json();

    // set code lang on tests
    setCodeLanguage(testOutputBox, language);
    testOutputBox.textContent = data.test_code || "";
    testNotes.textContent = Array.isArray(data.notes)
      ? data.notes.map((n) => `• ${n}`).join("\n")
      : "";

    if (window.Prism) {
      Prism.highlightAll();
    }

    // show only tests tab
    showTab("tab-tests");
  } catch (err) {
    console.error(err);
  } finally {
    setLoading(false);
  }
});

// ====== CLEAR ======
clearBtn.addEventListener("click", () => {
  document.getElementById("codeInput").value = "";
  document.getElementById("questionInput").value = "";
});

// default tab
showTab("tab-explain");
