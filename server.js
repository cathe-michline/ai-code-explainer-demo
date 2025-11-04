// server.js
const express = require("express");
const path = require("path");
const fetch = require("node-fetch"); // npm i node-fetch@2
const app = express();

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// ============================================================================
// Helper: mode instructions
// ============================================================================
function modeInstructions(mode) {
  if (mode === "beginner") {
    return `
You are a friendly tutor helping a beginner developer.
Use simple, kind explanations.
Add error handling if missing.
Explain safe practices and potential edge cases.
The refactor must be readable, well-commented, and defensive (handle invalid inputs, empty lists, etc.).
Do NOT use advanced constructs that a new coder wouldn’t understand.
`;
  }
  if (mode === "pro") {
    return `
You are talking to an experienced developer.
Refactor the code to be concise, clean, and Pythonic.
Simplify where possible. Avoid redundancy.
Keep behavior identical but remove unnecessary checks or verbose logic.
No comments, just clean, efficient code.
`;
  }
  return "";
}

// ============================================================================
// Utility: universal JSON flattener
// ============================================================================
function flattenAny(value, depth = 0) {
  if (value == null) return "Not specified";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean")
    return String(value);
  if (Array.isArray(value)) {
    if (depth > 1) return JSON.stringify(value);
    return value.map((v) => flattenAny(v, depth + 1)).join(", ");
  }
  if (typeof value === "object") {
    const parts = [];
    for (const [k, v] of Object.entries(value)) {
      parts.push(`${k}: ${flattenAny(v, depth + 1)}`);
    }
    return parts.join(", ");
  }
  return String(value);
}

// ============================================================================
// /api/analyze
// ============================================================================
app.post("/api/analyze", async (req, res) => {
  const { mode, code, question } = req.body;

  const prompt = `
You are an AI Code Explainer.

${modeInstructions(mode)}

Analyze the following user code and provide a structured JSON output.

Return ONLY valid JSON. No markdown, no backticks.

For BEGINNER mode:
Return JSON:
{
  "summary": "...",
  "time_complexity": "...",
  "improvements": ["...", "..."],
  "caution": "...",
  "inputs_outputs": {
    "inputs": "...",
    "outputs": "...",
    "side_effects": "..."
  },
  "steps": ["...", "..."]
}

For PRO mode:
Return JSON:
{
  "summary": "...",
  "time_complexity": "...",
  "improvements": ["...", "..."],
  "caution": "..."
}

User question: ${question || "Explain the code and how to improve it."}

User code:
${code}
`;

  try {
    console.log("➡ /api/analyze calling Ollama (phi:latest) ...");
    const ollamaRes = await fetch("http://localhost:11434/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "phi:latest",
        prompt,
        stream: false,
        format: "json"
      })
    });

    const data = await ollamaRes.json();
    let raw = data.response || "{}";

    // Clean up messy model output
    raw = raw.replace(/```json|```/gi, "").trim();
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start !== -1 && end !== -1) raw = raw.slice(start, end + 1);

    let parsed;
    try {
      parsed = JSON.parse(raw);
      console.log(parsed);
    } catch (e) {
      console.warn("⚠ JSON parse failed, fallback used.");
      parsed = null;
    }

    if (!parsed) {
      parsed = {
        summary: "Model returned something I could not fully parse.",
        time_complexity: "unknown",
        improvements: [],
        caution: "Parsing failed",
        steps: [],
        inputs_outputs: {
          inputs: "unknown",
          outputs: "unknown",
          side_effects: "unknown"
        }
      };
    }

    // Normalize fields
    parsed.improvements = Array.isArray(parsed.improvements)
      ? parsed.improvements.map((i) => (typeof i === "string" ? i : JSON.stringify(i)))
      : [];

    parsed.steps = Array.isArray(parsed.steps)
      ? parsed.steps.map((i) => (typeof i === "string" ? i : JSON.stringify(i)))
      : [];

    if (mode === "beginner") {
      const io = parsed.inputs_outputs || {};
      parsed.inputs_outputs = {
        inputs: flattenAny(io.inputs),
        outputs: flattenAny(io.outputs),
        side_effects: flattenAny(io.side_effects)
      };
    } else {
      delete parsed.inputs_outputs;
    }

    res.json(parsed);
  } catch (err) {
    console.error("❌ ERROR /api/analyze:", err);
    res.status(500).json({ error: "AI analyze failed" });
  }
});

// ============================================================================
// /api/refactor — DIFFERENT for beginner vs pro
// ============================================================================
app.post("/api/refactor", async (req, res) => {
  const { mode, code } = req.body;

  const prompt = `
${modeInstructions(mode)}

Refactor this code. Follow rules:

For BEGINNER mode:
- Keep logic same.
- Add basic error handling (e.g., empty input, wrong types).
- Use clear variable names.
- Add short comments to explain logic.
- Follow consistent indentation.

For PRO mode:
- Simplify and optimize.
- Remove redundant steps or unnecessary reassignments.
- Keep one-liners where possible.
- Do NOT include comments.
- Use Pythonic best practices.
- Keep it simple

Return ONLY valid JSON, no markdown.

Return JSON:
{
  "refactored_code": "...",
  "rationale": ["...", "..."]
}

Code:
${code}
`;

  try {
    console.log("➡ /api/refactor calling Ollama (phi:latest) ...");
    const ollamaRes = await fetch("http://localhost:11434/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "phi:latest",
        prompt,
        stream: false,
        format: "json"
      })
    });

    const data = await ollamaRes.json();
    let raw = data.response || "{}";
    raw = raw.replace(/```json|```/gi, "").trim();
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start !== -1 && end !== -1) raw = raw.slice(start, end + 1);

    let parsed;
    try {
      parsed = JSON.parse(raw);
      console.log(parsed);
    } catch (e) {
      console.warn("⚠ JSON parse failed for refactor, fallback used.");
      parsed = null;
    }

    if (!parsed || typeof parsed !== "object") {
      parsed = {
        refactored_code: "// Could not parse refactor output.",
        rationale: ["Parsing failed"]
      };
    }

    // Format code with spacing
    if (parsed.refactored_code) {
      parsed.refactored_code = parsed.refactored_code
        .replace(/\\n/g, "\n")
        .replace(/\\t/g, "  ")
        .trim();
    }

    parsed.rationale = Array.isArray(parsed.rationale)
      ? parsed.rationale.map((i) => (typeof i === "string" ? i : JSON.stringify(i)))
      : [];

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
  const { code, language } = req.body;

  const prompt = `
You are an AI test generator.
Generate unit testing for the given code in python using "import unittest"
Include:
- test_code: the unit test generated for the python code provided below
- notes : provide explanation for the unit testing provided
Return ONLY valid JSON.

Return JSON:
{
  "test_code": "...",
  "notes": ["...", "..."]
}

Code:
${code}
`;

  try {
    console.log("➡ /api/tests calling Ollama (phi:latest) ...");
    const ollamaRes = await fetch("http://localhost:11434/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "phi:latest",
        prompt,
        stream: false,
        format: "json"
      })
    });

    const data = await ollamaRes.json();
    let raw = data.response || "{}";
    raw = raw.replace(/```json|```/gi, "").trim();
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start !== -1 && end !== -1) raw = raw.slice(start, end + 1);

    let parsed;
    try {
      parsed = JSON.parse(raw);
      console.log(parsed)
    } catch {
      parsed = {
        test_code: "// Could not parse tests output.",
        notes: ["Parsing failed"]
      };
    }

    if (parsed.test_code)
      parsed.test_code = parsed.test_code.replace(/\\n/g, "\n").trim();

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
app.listen(PORT, () => console.log(`🚀 Server running on http://localhost:${PORT}`));
