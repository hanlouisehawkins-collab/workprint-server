// --- imports ---
const express = require("express");
const bodyParser = require("body-parser");
const fetch = require("node-fetch");
const cors = require("cors");

// 👇 NEW: bring in the scoring engine
const { newCounters, applyChoice, getProfile } = require("./workprint-engine");

// --- app setup ---
const app = express();
app.use(cors({ origin: "*" }));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// --- in-memory per-thread progress (resets on redeploy) ---
const progress = new Map(); // threadId -> { nextIdx: number }  (0..18, where 0=Q1 ... 18=Q19 sentinel)

// --- VERBATIM TEXT BLOCKS (edit these strings, not the code) ---
const WELCOME = `Welcome to Workprint
(Discover your unique Workprint Profile)

What’s this quiz?
This quick quiz helps you find your Workprint Profile — the way you work best, connect with others, and get results.

How long will it take?
About 5 minutes — no right or wrong answers. Just pick what feels most true.

What you’ll get at the end:
- Your Workprint Family & Profile
- A breakdown of your top traits
- Best pairings for collaboration
- A Grounding Quote for Growth chosen for you
- Option to download your result via SharePoint

When you’re ready, let’s go.`;

// Put your exact 18 questions here (A–D) verbatim.
// Q1 is index 0, Q18 is index 17.
const QUESTIONS = [
`Question 1 of 18
You’re starting your workday. What’s your first move?
A) Open the to-do list or calendar, I like structure early
B) Scan messages and jump into whatever feels urgent
C) Ease into it, I need time to warm up
D) Check in with the team or get a quick sense of what’s happening`,
`Question 2 of 18
How do you react to last-minute changes in plans?
A) No problem, I can roll with it
B) Frustrating, but I’ll adjust
C) I prefer sticking to the original plan
D) I quietly pivot and keep things moving`,
`Question 3 of 18
When giving feedback to a peer, what’s most true?
A) I’m direct and straight to the point
B) I soften things, I don’t want to hurt feelings
C) I try to read the room and adjust
D) I overthink it and sometimes delay saying anything`,
`Question 4 of 18
What do you do when a project slows down?
A) I take initiative and try to get it back on track
B) I focus on my part and wait for others to lead
C) I ask the team what’s going on and suggest a new approach
D) I keep doing what I can, even if others aren’t`,
`Question 5 of 18
How do you typically make progress on a task?
A) I plan out the steps before I begin
B) I take action quickly and adapt as I go
C) I prefer to check in with others first
D) I rely on deadlines to give me direction`,
`Question 6 of 18
A tense conversation is brewing. What’s your move?
A) I initiate it, best to deal with it early
B) I let things cool off before saying anything
C) I avoid it unless absolutely necessary
D) I try to mediate and keep the tone positive`,
`Question 7 of 18
How would your team describe your work pace?
A) Fast-moving and full of energy
B) Calm and consistent
C) Flexible depending on the day
D) Focused, methodical, and steady`,
`Question 8 of 18
A new idea pops up mid-project. What do you do?
A) If it’s good, I’ll shift things to include it
B) I stick to the plan, changes cause issues
C) I flag it, but assess how disruptive it’ll be
D) I immediately want to test or explore it`,
`Question 9 of 18
What’s your style when working in a team?
A) I like to keep people aligned and connected
B) I tend to lead or move things forward
C) I keep to myself unless someone needs me
D) I play a steady support role and hold things down`,
`Question 10 of 18
When deadlines stack up, what happens?
A) I get more focused, I don’t let things slide
B) I triage and communicate what I’ll hit
C) I do what I can and stay adaptable
D) I stress out but usually pull it together last-minute`,
`Question 11 of 18
If something upsets you at work, how do you handle it?
A) I take a pause, then respond constructively
B) I bottle it up and focus on the task
C) I might vent to someone I trust
D) I address it quickly so it doesn’t simmer`,
`Question 12 of 18
What gives you the most satisfaction at work?
A) Finishing something with no loose ends
B) Solving problems creatively
C) Feeling connected and part of something
D) Moving fast and seeing immediate results`,
`Question 13 of 18
When new projects land, what’s your mindset?
A) Let's map it out before we move
B) Energy, ideas, and momentum
C) I'll adapt to whatever’s needed
D) I'm calm and ready to support`,
`Question 14 of 18
What happens when things go off track?
A) I step in — someone's got to get it moving again
B) I steady the ship and try to reduce stress
C) I assess what needs to shift, then adjust
D) I push forward, but feel the tension build`,
`Question 15 of 18
What’s your approach to deadlines?
A) I manage them early so I don’t feel pressure later
B) They help me focus and get things done
C) I’m flexible — I respond to shifting timelines
D) I wait until it’s urgent, then act fast`,
`Question 16 of 18
What frustrates you most in others?
A) Unclear communication
B) Inflexibility or closed-mindedness
C) Lack of follow-through
D) Overthinking without action`,
`Question 17 of 18
What do you bring to a team that others rely on?
A) Steady delivery and commitment
B) Energy, ideas, and momentum
C) Calm, big-picture thinking
D) Openness, support, and connection`,
`Question 18 of 18
When you get feedback, what’s your response?
A) I reflect and try to improve
B) I appreciate honesty — even if it’s blunt
C) I take it personally at first, then process it later
D) I look for the emotion underneath the message`
];

// --- health check ---
app.get("/", (_req, res) => res.send("✅ Workprint server is running!"));

// --- helper: decide what verbatim block to show this turn (optional state machine) ---
function getDisplayBlockForThread(threadId) {
  const state = progress.get(threadId);
  if (!state) {
    // first time for this thread: show welcome, set nextIdx = 0 (Q1)
    progress.set(threadId, { nextIdx: 0 });
    return WELCOME;
  }
  const idx = state.nextIdx ?? 0;
  if (idx < QUESTIONS.length) {
    // show current question and advance pointer
    const block = QUESTIONS[idx];
    progress.set(threadId, { nextIdx: idx + 1 });
    return block;
  }
  // after Q18, return null -> assistant will produce results from its own logic (for now)
  return null;
}

// --- Chat -> Assistants v2 with optional server-enforced verbatim block ---
app.post("/chat", async (req, res) => {
  const { message, thread_id, display_block } = req.body || {};
  if (!message) return res.status(400).json({ error: "Message is required" });

  const headers = {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
    "OpenAI-Beta": "assistants=v2",
  };

  try {
    // 1) Use existing thread or create a new one
    let threadId = thread_id;
    if (!threadId) {
      const tResp = await fetch("https://api.openai.com/v1/threads", {
        method: "POST",
        headers,
        body: JSON.stringify({}),
      });
      const thread = await tResp.json();
      if (!tResp.ok) return res.status(502).json({ error: "create_thread_failed", detail: thread });
      threadId = thread.id;
    }

    // 2) Add user message
    const mResp = await fetch(`https://api.openai.com/v1/threads/${threadId}/messages`, {
      method: "POST",
      headers,
      body: JSON.stringify({ role: "user", content: message }),
    });
    const msgJson = await mResp.json();
    if (!mResp.ok) return res.status(502).json({ error: "add_message_failed", thread_id: threadId, detail: msgJson });

    // 3) Build run payload, optionally injecting verbatim display text
    const runPayload = { assistant_id: process.env.ASSISTANT_ID };

    // (A) If caller provided a display_block explicitly, use it
    let block = display_block;

    // (B) Otherwise, have the server decide (welcome -> Q1..Q18 -> results)
    if (!block) {
      block = getDisplayBlockForThread(threadId);
    }

    // If we have a block, force the model to echo it verbatim in code fences
    if (block && block.length > 0) {
      runPayload.instructions =
        "Reply with EXACTLY the following text inside a single triple-backtick code block, and nothing else:\n\n" +
        block;
    }
    // If no block (after Q18), we don't set instructions — the assistant will output the results per its own rules (we'll switch this to server logic later).

    // 4) Create the run
    const rResp = await fetch(`https://api.openai.com/v1/threads/${threadId}/runs`, {
      method: "POST",
      headers,
      body: JSON.stringify(runPayload),
    });
    const run = await rResp.json();
    if (!rResp.ok) return res.status(502).json({ error: "create_run_failed", thread_id: threadId, detail: run });

    // 5) Poll until completed
    let runStatus = run;
    const started = Date.now();
    while (["queued", "in_progress", "cancelling"].includes(runStatus.status)) {
      if (Date.now() - started > 25000) {
        return res.status(504).json({ error: "run_timeout", thread_id: threadId, detail: runStatus });
      }
      await new Promise(r => setTimeout(r, 1200));
      const sResp = await fetch(`https://api.openai.com/v1/threads/${threadId}/runs/${run.id}`, {
        method: "GET",
        headers,
      });
      runStatus = await sResp.json();
      if (!sResp.ok) {
        return res.status(502).json({ error: "poll_run_failed", thread_id: threadId, detail: runStatus });
      }
    }

    if (runStatus.status !== "completed") {
      return res.status(502).json({ error: "run_not_completed", thread_id: threadId, detail: runStatus });
    }

    // 6) Read latest assistant message
    const listResp = await fetch(`https://api.openai.com/v1/threads/${threadId}/messages?order=desc&limit=5`, {
      method: "GET",
      headers,
    });
    const list = await listResp.json();
    if (!listResp.ok) {
      return res.status(502).json({ error: "list_messages_failed", thread_id: threadId, detail: list });
    }

    const assistantMsg = (list.data || []).find(m => m.role === "assistant");
    let text = null;
    if (assistantMsg?.content?.length) {
      const textPart = assistantMsg.content.find(p => p.type === "text");
      text = textPart?.text?.value || null;
    }

    return res.json({ text, thread_id: threadId, raw: assistantMsg || list });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "server_error", detail: String(err) });
  }
});

// --- TEMP TEST ROUTES --------------------------------------------------

// Quick sample: adds Q1:A, Q2:D, Q3:B, returns scores + profile
app.get("/test", (_req, res) => {
  const s = newCounters();
  applyChoice(s, 1, "A"); // ES+1, FT+1
  applyChoice(s, 2, "D"); // Ad+1, ES+1
  applyChoice(s, 3, "B"); // EC+1
  const profile = getProfile(s); // likely "Architect" via fallback (ES highest)
  res.json({ scores: s, profile });
});

// Simulate a full run with a string of answers (A–D), e.g. ?answers=ACAB... (18 chars)
// You can also include commas or spaces; they’ll be ignored.
app.get("/simulate", (req, res) => {
  const raw = String(req.query.answers || "").toUpperCase();
  const letters = raw.replace(/[^ABCD]/g, ""); // keep only A/B/C/D
  if (!letters) return res.status(400).json({ error: "provide answers=A..D string" });

  const s = newCounters();
  // Apply up to 18 answers (Q1..Q18). Extra letters are ignored. Fewer than 18 is OK for testing.
  for (let i = 0; i < Math.min(18, letters.length); i++) {
    applyChoice(s, i + 1, letters[i]);
  }
  const profile = getProfile(s);
  res.json({ answers_used: letters.slice(0, 18), scores: s, profile });
});

// --- start server ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server running on ${PORT}`));
