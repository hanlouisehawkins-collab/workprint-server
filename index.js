const express = require("express");
const bodyParser = require("body-parser");
const fetch = require("node-fetch");
require("dotenv").config();

const app = express();
app.use(bodyParser.json());

// Health check
app.get("/", (req, res) => {
  res.send("✅ Workprint server is running");
});

// Chat endpoint
app.post("/chat", async (req, res) => {
  const { message } = req.body;

  try {
    // Create a new thread
    const threadResp = await fetch("https://api.openai.com/v1/threads", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
        "OpenAI-Beta": "assistants=v2"
      }
    });
    const thread = await threadResp.json();

    // Send user message
    await fetch(`https://api.openai.com/v1/threads/${thread.id}/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
        "OpenAI-Beta": "assistants=v2"
      },
      body: JSON.stringify({
        role: "user",
        content: message
      })
    });

    // Run the assistant
    const runResp = await fetch(`https://api.openai.com/v1/threads/${thread.id}/runs`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
        "OpenAI-Beta": "assistants=v2"
      },
      body: JSON.stringify({
        assistant_id: process.env.ASSISTANT_ID
      })
    });
    const run = await runResp.json();

    // Poll for completion
    let result;
    while (true) {
      const check = await fetch(`https://api.openai.com/v1/threads/${thread.id}/runs/${run.id}`, {
        headers: {
          "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
          "OpenAI-Beta": "assistants=v2"
        }
      });
      const status = await check.json();

      if (status.status === "completed") {
        const messagesResp = await fetch(`https://api.openai.com/v1/threads/${thread.id}/messages`, {
          headers: {
            "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
            "OpenAI-Beta": "assistants=v2"
          }
        });
        const messages = await messagesResp.json();
        result = messages.data[0].content[0].text.value;
        break;
      } else if (status.status === "failed") {
        result = "❌ Assistant run failed";
        break;
      }
      await new Promise(r => setTimeout(r, 1000));
    }

    res.json({ reply: result });
  } catch (err) {
    console.error("Error:", err);
    res.status(500).json({ error: "Something went wrong" });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
