// api/webhook.js
import OpenAI from "openai";
import twilio from "twilio";
import dotenv from "dotenv";

dotenv.config();

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const MessagingResponse = twilio.twiml.MessagingResponse;

const SYSTEM_PROMPT = process.env.BOT_SYSTEM_PROMPT || `
You are CyberGuard — a friendly cybersecurity awareness assistant.
Keep replies short, clear, non-technical, and actionable.
Do NOT give hacking or exploit instructions.
`;

function escapeXml(unsafe) {
  return unsafe
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

export default async function handler(req, res) {
  const twiml = new MessagingResponse();

  if (req.method !== "POST") {
    res.status(200).send("OK");
    return;
  }

  const raw = await req.text(); // Twilio posts x-www-form-urlencoded
  const params = new URLSearchParams(raw);
  const userMessage = params.get("Body") || "";
  const from = params.get("From") || "unknown";

  // Simple rate-limit (per phone, 15s)
  if (!global._rateLimit) global._rateLimit = new Map();
  const last = global._rateLimit.get(from) || 0;
  if (Date.now() - last < 15000) {
    twiml.message("Slow down — give me a sec 😅");
    res.writeHead(200, { "Content-Type": "text/xml" });
    res.end(twiml.toString());
    return;
  }
  global._rateLimit.set(from, Date.now());

  // Build chat messages
  const messages = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: userMessage }
  ];

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages,
      max_tokens: 300,
      temperature: 0.2
    });

    const aiText = response.choices?.[0]?.message?.content?.trim() || "Sorry, couldn't process that.";
    twiml.message(escapeXml(aiText));

    // OPTIONAL: simple logging to console (replace with proper logger in prod)
    console.log({
      from,
      userMessage,
      aiText,
      ts: new Date().toISOString()
    });

  } catch (err) {
    console.error("OpenAI error:", err);
    twiml.message("Sorry — something went wrong. Try again later.");
  }

  res.writeHead(200, { "Content-Type": "text/xml" });
  res.end(twiml.toString());
}
