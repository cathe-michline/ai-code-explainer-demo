const express = require("express");
const path = require("path");
const fetch = require("node-fetch"); // node-fetch@2
const app = express();

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// ============================================================================
// Helper: tone / persona instructions per mode
// ============================================================================
function modeInstructions(mode) {
  if (mode === "beginner") {
    return `
You are a friendly tutor.
Use simple language.
Be supportive.
Include the "inputs_outputs" field.
Explain like to a first-year student.
Do NOT assume they already know terms like 'time complexity' - briefly define it.
`;
  }
  if (mode === "pro") {
    return `
You are talking to an experienced developer.
Be concise.
Do NOT include 'inputs_outputs'.
Focus on correctness, complexity, maintainability, readability.
Avoid fluff.
`;
  }
  if (mode === "reviewer") {
    return `
You are doing a code review as a senior engineer.
Be direct and honest.
Call out risks, edge cases, missing validation, naming issues.
Do NOT include 'inputs_outputs'.
Use a professional tone.
`;
  }
  return "";
}

// ============================================================================
// /api/analyze
// ============================================================================
// ============================================================================
// /api/analyze (hardened JSON enforcement + sanitizer)
// ============================================================================
app.post("/api/analyze", async (req, res) => {
  const { mode, code, question } = req.body;

  const prompt = `
You are an AI Code Explainer.

${modeInstructions(mode)}

Task:
Analyze the user's code and answer the user's question if provided.

Return ONLY valid JSON. No backticks. No markdown. No comments.
Do not include any prose outside JSON.

For BEGINNER mode:
Return JSON with keys:
"summary", "inputs_outputs", "steps", "time_complexity", "improvements", "caution"

For PRO or REVIEWER mode:
Return JSON with keys:
"summary", "steps", "time_complexity", "improvements", "caution"

Rules:
- "steps" MUST be an array of STRINGS (not objects).
- "improvements" MUST be an array of STRINGS.
- If unknown, include a short string like "Not specified".
- Do NOT add explanations outside the JSON.
- Do NOT include trailing commas.
- Do NOT include parentheses commentary outside of string values.

User question (may be empty):
${question || "Explain the code and how to improve it."}

User code:
${code}
`;

  // --- helpers: cleaning & normalization ---
  const stripFences = (s) =>
    s.replace(/```json/gi, "").replace(/```/g, "").trim();

  const normalizeQuotes = (s) =>
    s.replace(/[“”]/g, '"').replace(/[‘’]/g, "'");

  const stripComments = (s) =>
    s
      // remove /* ... */ blocks
      .replace(/\/\*[\s\S]*?\*\//g, "")
      // remove // line comments
      .replace(/(^|\s)\/\/.*$/gm, "");

  const removeTrailingCommas = (s) =>
    s
      .replace(/,\s*([}\]])/g, "$1"); // trailing commas before } or ]

  // The exact problem you saw: JSON line like
  // "time_complexity": "O(n)" (extra explanation...)
  // We remove any parenthetical outside the string after closing quote.
  const removeParenAfterStringValue = (s) =>
    s.replace(
      /(":\s*"(?:[^"\\]|\\.)*")\s*\([^)]*\)/g,
      "$1"
    );

  const extractInnermostJson = (s) => {
    // Try to grab the first '{' to last '}' slice if garbage surrounds it
    const start = s.indexOf("{");
    const end = s.lastIndexOf("}");
    if (start !== -1 && end !== -1 && end > start) {
      return s.slice(start, end + 1);
    }
    return s;
  };

  const coerceToStrings = (arr) =>
    Array.isArray(arr)
      ? arr.map((item) => {
          if (typeof item === "string") return item;
          if (item && typeof item === "object") {
            // Prefer common keys like "action", "step", "text"
            const v = item.action || item.step || item.text;
            return typeof v === "string" ? v : JSON.stringify(item);
          }
          return String(item);
        })
      : [];

  try {
    console.log("➡ /api/analyze calling Ollama (phi:latest) ...");

    const ollamaRes = await fetch("http://localhost:11434/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "phi:latest",
        prompt,
        stream: false,
        // ✨ Ask Ollama to format the response as pure JSON
        format: "json"
      })
    });

    console.log("➡ /api/analyze ollamaRes status:", ollamaRes.status);
    const data = await ollamaRes.json();
    console.log("🔥 RAW FROM OLLAMA:", data); 

    let raw = data.response || "{}";

    // 1) Clean common issues
    raw = stripFences(raw);
    raw = normalizeQuotes(raw);
    raw = stripComments(raw);
    raw = removeParenAfterStringValue(raw);
    raw = removeTrailingCommas(raw);
    raw = extractInnermostJson(raw);

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (e1) {
      // One more attempt: remove any leftover junk after the last closing brace
      raw = extractInnermostJson(raw);
      try {
        parsed = JSON.parse(raw);
      } catch (e2) {
        console.warn("⚠ JSON parse failed after cleaning. Returning fallback.\nCLEANED:", raw);
        parsed = null;
      }
    }

    // 2) Normalize shape for UI
    if (!parsed || typeof parsed !== "object") {
      // fallback
      const fallback = {
        summary: "Model returned something I could not fully parse.",
        steps: [data.response || "No response"],
        time_complexity: "unknown",
        improvements: [],
        caution: "Parsing failed"
      };
      if (mode === "beginner") {
        fallback.inputs_outputs = {
          inputs: "unknown",
          outputs: "unknown",
          side_effects: "unknown"
        };
      }
      return res.json(fallback);
    }

    // Ensure required fields exist
    parsed.summary = parsed.summary || "No summary provided.";
    parsed.time_complexity = parsed.time_complexity || "Not provided.";
    parsed.caution = parsed.caution || "No caution provided.";

    // steps -> strings[]
    parsed.steps = coerceToStrings(parsed.steps);

    // improvements -> strings[]
    parsed.improvements = coerceToStrings(parsed.improvements);

    // Beginner: guarantee inputs_outputs
    if (mode === "beginner") {
      parsed.inputs_outputs = parsed.inputs_outputs || {};
      parsed.inputs_outputs.inputs =
        parsed.inputs_outputs.inputs || "Not specified";
      parsed.inputs_outputs.outputs =
        parsed.inputs_outputs.outputs || "Not specified";
      parsed.inputs_outputs.side_effects =
        parsed.inputs_outputs.side_effects || "Not specified";
    } else {
      delete parsed.inputs_outputs;
    }

    return res.json(parsed);
  } catch (err) {
    console.error("❌ ERROR /api/analyze:", err);
    res.status(500).json({ error: "AI analyze failed" });
  }
});


// ============================================================================
// /api/refactor
// ============================================================================
app.post("/api/refactor", async (req, res) => {
  const { mode, code } = req.body;

  const prompt = `
You are an AI code refactoring assistant.

Audience mode: ${mode}.
Rules:
- Produce cleaner, safer, more readable code.
- Keep the same behavior.
- Add basic error handling or type checks if missing.
- Use better naming if needed.
- DO NOT explain first. Return JSON only.

Return ONLY valid JSON.
Do not include backticks, code fences, or markdown.
Return JSON with keys:
"refactored_code": the improved full code as a string,
"rationale": an array of short bullet points telling why it's better.

User code:
${code}
`;

  try {
      const ollamaRes = await fetch("http://localhost:11434/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "phi:latest",
        prompt: prompt,
        stream: false
      })
    });
    const data = await ollamaRes.json();
    let rawText = data.response || "{}";

    // Strip fences if model ignored us
    rawText = rawText
      .replace(/```json/gi, "")
      .replace(/```/g, "")
      .trim();

    let parsed;
    try {
      parsed = JSON.parse(rawText);

      // normalize rationale: ensure array of strings
      if (Array.isArray(parsed.rationale)) {
        parsed.rationale = parsed.rationale.map(item => {
          if (typeof item === "string") return item;
          if (typeof item === "object" && item !== null) {
            return JSON.stringify(item);
          }
          return String(item);
        });
      } else if (parsed.rationale) {
        parsed.rationale = [String(parsed.rationale)];
      } else {
        parsed.rationale = [];
      }

      parsed.refactored_code =
        parsed.refactored_code || "// No refactored code provided.";

    } catch (e) {
      console.warn("⚠ parse fail in /api/refactor, using fallback. Cleaned was:", rawText);

      parsed = {
        refactored_code:
          "// failed to parse refactor output\n" +
          "// raw model output was:\n" +
          (data.response || ""),
        rationale: ["Parsing failed"]
      };
    }

    res.json(parsed);
  } catch (err) {
    console.error("❌ ERROR /api/refactor:", err);
    res.status(500).json({ error: "AI refactor failed" });
  }
});

// ============================================================================
// /api/tests
// ============================================================================
app.post("/api/tests", async (req, res) => {
  const { mode, code, language } = req.body;

  const prompt = `
You are an AI test generator.

Language is ${language || "python"}.
Generate unit tests for the user's code.

Rules:
- Focus on correctness, edge cases, bad input.
- Include at least: normal case, edge case, error/invalid case.
- Use a common/simple test style (unittest for Python, Jest for JS).
- DO NOT explain first.

You MUST return ONLY valid JSON.
Do not include backticks, code fences, or markdown.

Return JSON with keys:
"test_code": string of the full test file,
"notes": array of bullets explaining what each test covers.

User code:
${code}
`;

  try {
    const ollamaRes = await fetch("http://localhost:11434/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "phi:latest",
        prompt: prompt,
        stream: false
      })
    });

    const data = await ollamaRes.json();
    let rawText = data.response || "{}";

    // Strip fences if needed
    rawText = rawText
      .replace(/```json/gi, "")
      .replace(/```/g, "")
      .trim();

    let parsed;
    try {
      parsed = JSON.parse(rawText);

      // normalize notes: ensure array of strings
      if (Array.isArray(parsed.notes)) {
        parsed.notes = parsed.notes.map(item => {
          if (typeof item === "string") return item;
          if (typeof item === "object" && item !== null) {
            return JSON.stringify(item);
          }
          return String(item);
        });
      } else if (parsed.notes) {
        parsed.notes = [String(parsed.notes)];
      } else {
        parsed.notes = [];
      }

      parsed.test_code =
        parsed.test_code || "// No test code provided.";

    } catch (e) {

      parsed = {
        test_code:
          "// failed to parse test output\n" +
          "// raw model output was:\n" +
          (data.response || ""),
        notes: ["Parsing failed"]
      };
    }

    res.json(parsed);
  } catch (err) {
    console.error("❌ ERROR /api/tests:", err);
    res.status(500).json({ error: "AI tests failed" });
  }
});

// ============================================================================
// Start server
// ============================================================================
const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
