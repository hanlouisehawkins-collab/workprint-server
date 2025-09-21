const express = require("express");
const bodyParser = require("body-parser");
const fetch = require("node-fetch");

const app = express();
app.use(bodyParser.json());

// Health check
app.get("/", (_req, res) => res.send("✅ Workprint server is running!"));

// Chat -> calls your OpenAI Assistant via Assistants v2 (Threads & Runs)
app.post("/chat", async (req, res) => {
  const message = (req.body && req.body.message) || "";
  if (!message) return res.status(400).json({ error: "Message is required" });

  const headers = {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
    "OpenAI-Beta": "assistants=v2",
  };

  try {
    // 1) Create a fresh thread
    const tResp = await fetch("https://api.openai.com/v1/threads", {
      method: "POST",
      headers,
      body: JSON.stringify({}),
    });
    const thread = await tResp.json();
    if (!tResp.ok) return res.status(502).json({ error: "create_thread_failed", detail: thread });

    // 2) Add the user message
    const mResp = await fetch(`https://api.openai.com/v1/threads/${thread.id}/messages`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        role: "user",
        content: message,
      }),
    });
    const messageResp = await mResp.json();
    if (!mResp.ok) return res.status(502).json({ error: "add_message_failed", detail: messageResp });

    // 3) Create a run using your Assistant
    const rResp = await fetch(`https://api.openai.com/v1/threads/${thread.id}/runs`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        assistant_id: process.env.ASSISTANT_ID, // <-- uses your custom Assistant
      }),
    });
    const run = await rResp.json();
    if (!rResp.ok) return res.status(502).json({ error: "create_run_failed", detail: run });

    // 4) Poll until the run completes (simple loop)
    let runStatus = run;
    const started = Date.now();
    while (["queued", "in_progress", "cancelling"].includes(runStatus.status)) {
      if (Date.now() - started > 25000) { // ~25s safety timeout
        return res.status(504).json({ error: "run_timeout", detail: runStatus });
      }
      await new Promise(r => setTimeout(r, 1200));
      const sResp = await fetch(`https://api.openai.com/v1/threads/${thread.id}/runs/${run.id}`, {
        method: "GET",
        headers,
      });
      runStatus = await sResp.json();
      if (!sResp.ok) return res.status(502).json({ error: "poll_run_failed", detail: runStatus });
    }

    if (runStatus.status !== "completed") {
      return res.status(502).json({ error: "run_not_completed", detail: runStatus });
    }

    // 5) Get the latest messages and return the assistant's text
    const listResp = await fetch(`https://api.openai.com/v1/threads/${thread.id}/messages?order=desc&limit=5`, {
      method: "GET",
      headers,
    });
    const list = await listResp.json();
    if (!listResp.ok) return res.status(502).json({ error: "list_messages_failed", detail: list });

    const assistantMsg = (list.data || []).find(m => m.role === "assistant");
    // Pull plain text from message content parts
    let text = null;
    if (assistantMsg?.content?.length) {
      const textPart = assistantMsg.content.find(p => p.type === "text");
      text = textPart?.text?.value || null;
    }

    return res.json(text ? { text, raw: assistantMsg } : { raw: assistantMsg || list });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "server_error", detail: String(err) });
  }
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
