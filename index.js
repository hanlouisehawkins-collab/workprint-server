import express from "express";
import fetch from "node-fetch";

const app = express();
const port = process.env.PORT || 5000;

app.use(express.json());

// Route for Softr or frontend to send chat messages
app.post("/chat", async (req, res) => {
  const { message } = req.body;

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: "gpt-4.1-mini",   // or whichever model your Custom Assistant uses
        input: message
      })
    });

    const data = await response.json();
    res.json({ reply: data.output[0].content[0].text });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Something went wrong" });
  }
});

app.listen(port, () => {
  console.log(`🚀 Server running on port ${port}`);
});
