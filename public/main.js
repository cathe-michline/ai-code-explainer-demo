// DOM refs
const modeSelect = document.getElementById("modeSelect");
const langSelect = document.getElementById("langSelect");

const codeInput = document.getElementById("codeInput");
const questionInput = document.getElementById("questionInput");

const analyzeBtn = document.getElementById("analyzeBtn");
const refactorBtn = document.getElementById("refactorBtn");
const testsBtn = document.getElementById("testsBtn");
const clearBtn = document.getElementById("clearBtn");
const copyRefactorBtn = document.getElementById("copyRefactorBtn");

const loadingEl = document.getElementById("loading");

// Explanation panel outputs
const respSummary = document.getElementById("respSummary");
const respInputsOutputs = document.getElementById("respInputsOutputs");
const respSteps = document.getElementById("respSteps");
const respComplexity = document.getElementById("respComplexity");
const respImprovements = document.getElementById("respImprovements");
const respCaution = document.getElementById("respCaution");
const inputsOutputsSection = document.getElementById("inputsOutputsSection");

// Refactor panel outputs
const refactorOutputBox = document.getElementById("refactorOutputBox");
const refactorWhy = document.getElementById("refactorWhy");

// Tests panel outputs
const testOutputBox = document.getElementById("testOutputBox");
const testNotes = document.getElementById("testNotes");

// Mode indicator text
const currentModeText = document.getElementById("currentModeText");
const currentModeDesc = document.getElementById("currentModeDesc");

// Tabs
const tabExplainBtn = document.getElementById("tabExplainBtn");
const tabRefactorBtn = document.getElementById("tabRefactorBtn");
const tabTestsBtn = document.getElementById("tabTestsBtn");

const tabExplain = document.getElementById("tab-explain");
const tabRefactor = document.getElementById("tab-refactor");
const tabTests = document.getElementById("tab-tests");

// --- helpers: tab switching, loading state, mode visuals ---

function showTab(which) {
  [tabExplainBtn, tabRefactorBtn, tabTestsBtn].forEach(btn => {
    btn.classList.toggle("active", btn.dataset.tab === which);
  });

  tabExplain.classList.toggle("hidden", which !== "tab-explain");
  tabRefactor.classList.toggle("hidden", which !== "tab-refactor");
  tabTests.classList.toggle("hidden", which !== "tab-tests");
}

function setBusy(isBusy, label = "") {
  if (isBusy) {
    analyzeBtn.disabled = true;
    refactorBtn.disabled = true;
    testsBtn.disabled = true;
    clearBtn.disabled = true;

    analyzeBtn.classList.add("loading-btn");
    refactorBtn.classList.add("loading-btn");
    testsBtn.classList.add("loading-btn");

    analyzeBtn.dataset.originalText = analyzeBtn.dataset.originalText || analyzeBtn.textContent;
    refactorBtn.dataset.originalText = refactorBtn.dataset.originalText || refactorBtn.textContent;
    testsBtn.dataset.originalText = testsBtn.dataset.originalText || testsBtn.textContent;

    if (label === "analyze") analyzeBtn.textContent = "Analyzing…";
    if (label === "refactor") refactorBtn.textContent = "Refactoring…";
    if (label === "tests") testsBtn.textContent = "Generating…";

    loadingEl.classList.remove("hidden");
    loadingEl.textContent = "Thinking...";
  } else {
    analyzeBtn.disabled = false;
    refactorBtn.disabled = false;
    testsBtn.disabled = false;
    clearBtn.disabled = false;

    analyzeBtn.classList.remove("loading-btn");
    refactorBtn.classList.remove("loading-btn");
    testsBtn.classList.remove("loading-btn");

    if (analyzeBtn.dataset.originalText) {
      analyzeBtn.textContent = analyzeBtn.dataset.originalText;
    }
    if (refactorBtn.dataset.originalText) {
      refactorBtn.textContent = refactorBtn.dataset.originalText;
    }
    if (testsBtn.dataset.originalText) {
      testsBtn.textContent = testsBtn.dataset.originalText;
    }

    loadingEl.classList.add("hidden");
  }
}

function refreshModeVisual() {
  const mode = modeSelect.value;
  const body = document.body;

  body.classList.remove("beginner", "pro", "reviewer");
  body.classList.add(mode);

  if (mode === "beginner") {
    currentModeText.textContent = "Beginner 👶";
    currentModeDesc.textContent =
      "Explanations will be slow, friendly and include inputs/outputs.";
  } else if (mode === "pro") {
    currentModeText.textContent = "Pro 🚀";
    currentModeDesc.textContent =
      "Explanations will be concise and focused on readability and performance.";
  } else {
    currentModeText.textContent = "Reviewer 🧠";
    currentModeDesc.textContent =
      "Explanations will act like a strict code review and point out risks.";
  }
}

// --- rendering functions ---

function renderAnalyzeResult(data) {
  respSummary.textContent = data.summary || "";

  // inputs/outputs is only for beginner
  if (modeSelect.value === "beginner" && data.inputs_outputs) {
    inputsOutputsSection.style.display = "block";
    const io = data.inputs_outputs;
    const parts = [];
    if (io.inputs) parts.push("Input: " + io.inputs);
    if (io.outputs) parts.push("Output: " + io.outputs);
    if (io.side_effects) parts.push("Side-effects: " + io.side_effects);
    respInputsOutputs.textContent = parts.join("\n");
  } else {
    inputsOutputsSection.style.display = "none";
    respInputsOutputs.textContent = "";
  }

  // steps array
  if (Array.isArray(data.steps)) {
    respSteps.textContent = data.steps.map((s, i) => `${i + 1}. ${s}`).join("\n");
  } else {
    respSteps.textContent = "";
  }

  // time complexity
  respComplexity.textContent = data.time_complexity || "";

  // improvements list
  if (Array.isArray(data.improvements)) {
    respImprovements.textContent = data.improvements
      .map(s => `• ${s}`)
      .join("\n");
  } else {
    respImprovements.textContent = "";
  }

  // caution
  respCaution.textContent = data.caution || "";
}

function renderRefactorResult(data) {
  refactorOutputBox.value = data.refactored_code || "";
  if (Array.isArray(data.rationale)) {
    refactorWhy.textContent = data.rationale.map(r => `• ${r}`).join("\n");
  } else {
    refactorWhy.textContent = "";
  }
}

function renderTestsResult(data) {
  testOutputBox.value = data.test_code || "";
  if (Array.isArray(data.notes)) {
    testNotes.textContent = data.notes.map(n => `• ${n}`).join("\n");
  } else {
    testNotes.textContent = "";
  }
}

// --- server calls ---

async function callAnalyze() {
  setBusy(true, "analyze");
  try {
    const payload = {
      mode: modeSelect.value,
      code: codeInput.value,
      question: questionInput.value
    };

    const res = await fetch("/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    renderAnalyzeResult(data);
    showTab("tab-explain");
  } catch (err) {
    console.error(err);
    respSummary.textContent = "Error analyzing code.";
  } finally {
    setBusy(false);
  }
}

async function callRefactor() {
  setBusy(true, "refactor");
  try {
    const payload = {
      mode: modeSelect.value,
      code: codeInput.value
    };

    const res = await fetch("/api/refactor", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    renderRefactorResult(data);
    showTab("tab-refactor");
  } catch (err) {
    console.error(err);
    refactorOutputBox.value = "// Error generating refactor.";
    refactorWhy.textContent = "";
  } finally {
    setBusy(false);
  }
}

async function callTests() {
  setBusy(true, "tests");
  try {
    const payload = {
      mode: modeSelect.value,
      code: codeInput.value,
      language: langSelect.value
    };

    const res = await fetch("/api/tests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    renderTestsResult(data);
    showTab("tab-tests");
  } catch (err) {
    console.error(err);
    testOutputBox.value = "// Error generating tests.";
    testNotes.textContent = "";
  } finally {
    setBusy(false);
  }
}

// --- event bindings ---

analyzeBtn.addEventListener("click", callAnalyze);
refactorBtn.addEventListener("click", callRefactor);
testsBtn.addEventListener("click", callTests);

clearBtn.addEventListener("click", () => {
  codeInput.value = "";
  questionInput.value = "";
  respSummary.textContent = "";
  respInputsOutputs.textContent = "";
  respSteps.textContent = "";
  respComplexity.textContent = "";
  respImprovements.textContent = "";
  respCaution.textContent = "";
  refactorOutputBox.value = "";
  refactorWhy.textContent = "";
  testOutputBox.value = "";
  testNotes.textContent = "";
});

copyRefactorBtn.addEventListener("click", () => {
  navigator.clipboard.writeText(refactorOutputBox.value || "");
});

// manual tab switching
tabExplainBtn.addEventListener("click", () => showTab("tab-explain"));
tabRefactorBtn.addEventListener("click", () => showTab("tab-refactor"));
tabTestsBtn.addEventListener("click", () => showTab("tab-tests"));

// update visuals when mode changes
modeSelect.addEventListener("change", refreshModeVisual);

// init
refreshModeVisual();
showTab("tab-explain");
loadingEl.classList.add("hidden");