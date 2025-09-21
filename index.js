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
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
        "OpenAI-Beta": "assistants=v2"          // 👈 added
      },
      body: JSON.stringify({
        model: "gpt-4.1-mini",                   // 👈 added (Responses API requires a model)
        assistant_id: process.env.ASSISTANT_ID,  // uses your Assistant
        input: message
      }),
    });

    const data = await resp.json();

    if (!resp.ok) {
      return res.status(resp.status).json({
        error: "Assistants request failed",
        detail: data,
      });
    }

    // Try to extract plain text; otherwise return full payload
    let text = null;
    if (Array.isArray(data.output) &&
        data.output[0]?.content?.[0]?.type === "output_text") {
      text = data.output[0].content[0].text;
    } else if (typeof data.output_text === "string") {
      text = data.output_text;
    }

    return res.json(text ? { text, raw: data } : data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error", detail: String(err) });
  }
});

// Start
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server running on ${PORT}`));
