const express = require("express");
const bodyParser = require("body-parser");
const fetch = require("node-fetch");
const cors = require("cors"); // NEW

const app = express();

// Allow calls from Softr (you can loosen/tighten this list)
app.use(cors({
  origin: [
    /\.softr\.app$/,
    /\.softr\.io$/
  ],
  methods: ["POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));

app.use(bodyParser.json());

// Health check
app.get("/", (req, res) => {
  res.send("✅ Workprint server is running!");
});

// Chat endpoint (POST only)
app.post("/chat", async (req, res) => {
  const { message } = req.body;

  if (!message) {
    return res.status(400).json({ error: "Message is required" });
  }

  try {
    // Prefer your Assistant if ASSISTANT_ID is present, otherwise use a model
    const useAssistant = !!process.env.ASSISTANT_ID;

    const body = useAssistant
      ? {
          assistant_id: process.env.ASSISTANT_ID,
          input: message,
          temperature: 0.7
        }
      : {
          model: "gpt-4.1-mini",
          input: message,
          temperature: 0.7
        };

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("OpenAI error:", response.status, errText);
      return res.status(502).json({ error: "OpenAI request failed", detail: errText });
    }

    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error("Error talking to OpenAI:", error);
    res.status(500).json({ error: "Something went wrong" });
  }
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
