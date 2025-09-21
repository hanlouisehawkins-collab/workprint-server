const express = require("express");
const bodyParser = require("body-parser");
const fetch = require("node-fetch");

const app = express();
app.use(bodyParser.json());

// Health
app.get("/", (_, res) => res.send("✅ Workprint server is running!"));

// Chat (Assistant-first with model fallback)
app.post("/chat", async (req, res) => {
  try {
    const { message, thread_id } = req.body || {};
    if (!message) return res.status(400).json({ error: "Message is required" });

    const apiKey = process.env.OPENAI_API_KEY;
    const asstId = process.env.ASSISTANT_ID;
    if (!apiKey) return res.status(500).json({ error: "OPENAI_API_KEY is not set" });

    const payload = {
      assistant_id: asstId || undefined,   // your custom Assistant
      model: "gpt-4.1-mini",               // fallback so we never get “missing model”
      input: message
    };
    if (thread_id) payload.thread = { id: thread_id };

    const r = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
        "OpenAI-Beta": "assistants=v2"   // required for Assistants v2
      },
      body: JSON.stringify(payload)
    });

    const data = await r.json();
    if (!r.ok) {
      return res.status(502).json({
        error: "Assistants request failed",
        status: r.status,
        hint: { has_assistant_id: Boolean(asstId), model_sent: "gpt-4.1-mini" },
        detail: data
      });
    }

    // Pull plain text back
    let outputText = null;
    try {
      const msg = (data.output || []).find(o => o.type === "message");
      const textObj = msg?.content?.find(c => c.type === "output_text");
      outputText = textObj?.text || null;
    } catch {}

    res.json({ thread_id: data.thread_id || null, output_text: outputText, raw: data });
  } catch (err) {
    res.status(500).json({ error: "Server error", detail: String(err) });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server on ${PORT}`));
