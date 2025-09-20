import express from "express";
import fetch from "node-fetch";

const app = express();
app.use(express.json());

// Health check (homepage)
app.get("/", (req, res) => {
  res.send("✅ Workprint server is running!");
});

// Chat route
app.post("/chat", async (req, res) => {
  const { message } = req.body;

  try {
    const threadResp = await fetch("https://api.openai.com/v1/threads", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`
      }
    });

    const thread = await threadResp.json();
    res.json({ reply: "Server received: " + message, thread });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Something went wrong." });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
