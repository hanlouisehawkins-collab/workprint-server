// --- Core deps ---
const express = require("express");
const bodyParser = require("body-parser");
const fetch = require("node-fetch");
const cors = require("cors");

// --- App setup ---
const app = express();
app.use(bodyParser.json());

// CORS: while testing you can allow all, then later lock to your Softr domain
// const allowed = ["https://YOUR-SOFTR-DOMAIN.softr.app"];
// app.use(cors({ origin: allowed }));
app.use(cors());

// Health check
app.get("/", (req, res) => {
  res.send("✅ Workprint server is running (Assistants mode)!");
});

// Helper: OpenAI fetch with auth
async function oi(path, opts = {}) {
  const resp = await fetch(`https://api.openai.com/v1${path}`, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
      ...(opts.headers || {})
    }
  });
  if (!resp.ok) {
    const txt = await resp.text().catch(() => "");
    throw new Error(`OpenAI ${resp.status}: ${txt || resp.statusText}`);
  }
  return resp.json();
}

// POST /chat  ->  uses Assistants (Threads & Runs)
// Body: { message: "text", thread_id?: "thread_..." }
app.post("/chat", async (req, res) => {
  const { message, thread_id } = req.body || {};
  if (!message || typeof message !== "string") {
    return res.status(400).json({ error: "Missing 'message' (string)." });
  }
  if (!process.env.ASSISTANT_ID || !process.env.OPENAI_API_KEY) {
    return res.status(500).json({ error: "Server missing ASSISTANT_ID / OPENAI_API_KEY env vars." });
  }

  try {
    // 1) Ensure a thread
    let threadId = thread_id;
    if (!threadId) {
      const created = await oi(`/threads`, { method: "POST", body: JSON.stringify({}) });
      threadId = created.id;
    }

    // 2) Add user message to thread
    await oi(`/threads/${threadId}/messages`, {
      method: "POST",
      body: JSON.stringify({
        role: "user",
        content: message
      })
    });

    // 3) Start a run with your Assistant
    const run = await oi(`/threads/${threadId}/runs`, {
      method: "POST",
      body: JSON.stringify({
        assistant_id: process.env.ASSISTANT_ID
      })
    });

    // 4) Poll run until completed
    let runStatus = run.status;
    let runId = run.id;
    const started = Date.now();
    while (!["completed", "failed", "cancelled", "expired"].includes(runStatus)) {
      // simple backoff
      await new Promise(r => setTimeout(r, 800));
      const latest = await oi(`/threads/${threadId}/runs/${runId}`, { method: "GET" });
      runStatus = latest.status;

      // basic safety stop
      if (Date.now() - started > 120000) {
        throw new Error("Run polling timeout.");
      }
    }

    if (runStatus !== "completed") {
      return res.status(502).json({ error: `Run ended with status: ${runStatus}` });
    }

    // 5) Fetch the latest assistant message
    const msgs = await oi(`/threads/${threadId}/messages?limit=1`, { method: "GET" });

    let text = "(no response)";
    if (msgs?.data?.[0]?.content?.length) {
      // Find first text item
      for (const part of msgs.data[0].content) {
        if (part.type === "text" && part.text?.value) {
          text = part.text.value;
          break;
        }
      }
    }

    return res.json({
      thread_id: threadId,
      output_text: text
    });

  } catch (err) {
    console.error("Assistants error:", err);
    return res.status(502).json({ error: "Assistants request failed", detail: `${err}` });
  }
});

// Start
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Workprint Assistants server on ${PORT}`);
});
