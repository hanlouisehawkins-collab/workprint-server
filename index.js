const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const fetch = require("node-fetch");

const app = express();
app.use(cors());              // allow Softr
app.use(bodyParser.json());

// Health check
app.get("/", (req, res) => {
  res.send("✅ Workprint server is running (Assistants mode)!");
});

// Chat -> OpenAI Assistants (Responses API, v2)
app.post("/chat", async (req, res) => {
  try {
    const { message, thread_id } = req.body || {};
    if (!message) {
      return res.status(400).json({ error: "Message is required" });
    }
    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({ error: "OPENAI_API_KEY is not set" });
    }
    if (!process.env.ASSISTANT_ID) {
      return res.status(500).json({ error: "ASSISTANT_ID is not set" });
    }

    const payload = {
      assistant_id: process.env.ASSISTANT_ID,
      input: message,
    };

    // If you have a thread already, pass it along
    if (thread_id) {
      payload.thread = { id: thread_id };
    }

    const r = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
        "OpenAI-Beta": "assistants=v2",      // <<< REQUIRED
      },
      body: JSON.stringify(payload),
    });

    const data = await r.json();

    if (!r.ok) {
      // bubble up OpenAI error details so we can see what’s wrong
      return res.status(502).json({
        error: "Assistants request failed",
        status: r.status,
        detail: data,
      });
    }

    // Extract assistant text
    let outputText = "";
    try {
      const msg = (data.output || []).find(o => o.type === "message");
      if (msg && Array.isArray(msg.content)) {
        // Look for the textual part
        const t = msg.content.find(c => c.type === "output_text");
        if (t && t.text) outputText = t.text;
      }
    } catch (_) {}

    return res.json({
      thread_id: data.thread_id || null,
      output_text: outputText || null,
      raw: data, // keep raw for debugging during setup; remove later if you want
    });
  } catch (err) {
    console.error("Server error:", err);
    return res.status(500).json({ error: "Server error", detail: String(err) });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
