const express = require("express");
const bodyParser = require("body-parser");
const fetch = require("node-fetch");

const app = express();
app.use(bodyParser.json());

// Health check
app.get("/", (_req, res) => res.send("✅ Workprint server is running!"));

// Chat -> calls your OpenAI Assistant via Responses API
app.post("/chat", async (req, res) => {
  try {
    const message = (req.body && req.body.message) || "";
    if (!message) return res.status(400).json({ error: "Message is required" });

    const resp = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        // IMPORTANT: we reference your Assistant, not a plain model
        assistant_id: process.env.ASSISTANT_ID,
        input: message
      }),
    });

    const data = await resp.json();
    if (!resp.ok) {
      return res.status(502).json({
        error: "Assistants request failed",
        detail: data,
      });
    }

    // Try to return a simple text string if available, else the raw payload
    const text =
      (data.output?.[0]?.content?.[0]?.text) ||
      (data.output_text) || null;

    return res.json(text ? { text, raw: data } : data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error", detail: String(err) });
  }
});

// Start
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server running on ${PORT}`));
