import { GoogleGenAI } from "@google/genai";

// The key lives only here, on the server, read from a Vercel environment
// variable. It is never sent to or embedded in the browser.
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const SYSTEM_PROMPT = `You are an expert at reading Indian state transport bus timetables from photographs: destination boards, printed sheets, and scanned PDFs. These images are often imperfect — glare, faded ink, handwriting, low resolution — and text is frequently a mix of Malayalam and English.

Extract every route and stop time you can find. For anything you cannot read with confidence, still provide your best guess, but mark its confidence honestly. Never invent a stop or a route that is not visually present in the image.

Return ONLY valid JSON — no markdown fences, no commentary before or after — matching exactly this shape:

{
  "routes": [
    {
      "route_id": "short slug, e.g. R1",
      "route_name": "e.g. Kochi - Munnar via Kothamangalam",
      "stops": [
        {
          "stop_name_en": "English name of the stop",
          "stop_name_ml": "Malayalam name if visible on the board, else an empty string",
          "arrival_time": "HH:MM in 24-hour format, or empty string if not shown",
          "departure_time": "HH:MM in 24-hour format, or empty string if not shown",
          "confidence": "high, medium, or low"
        }
      ]
    }
  ]
}

Rules:
- Keep stops in the order they appear on the board — that order is the direction of travel.
- If the input is a multi-page PDF, read every page in order and combine everything into the same "routes" array — do not stop after the first page.
- If a value is genuinely illegible, set it to an empty string and confidence to "low".
- If the board lists more than one route, return each as a separate object in "routes".`;

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }
  
  if (!process.env.GEMINI_API_KEY) {
    res.status(500).json({ error: "Server is missing GEMINI_API_KEY. Set it in your Vercel project's Environment Variables." });
    return;
  }
  
  const { imageBase64, mimeType } = req.body || {};
  if (!imageBase64 || !mimeType) {
    res.status(400).json({ error: "imageBase64 and mimeType are both required." });
    return;
  }
  
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3.6-flash",
      contents: [
        { inlineData: { mimeType, data: imageBase64 } },
        { text: SYSTEM_PROMPT },
      ],
    });
    
    let text = (response.text || "").trim();
    // Defensive cleanup in case the model wraps the JSON in a code fence anyway.
    text = text.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```$/i, "").trim();
    
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch (parseErr) {
      res.status(502).json({ error: "The model did not return valid JSON. Try again, or use a clearer photo.", raw: text });
      return;
    }
    
    if (!parsed || !Array.isArray(parsed.routes)) {
      res.status(502).json({ error: "The model's response was missing a 'routes' array.", raw: parsed });
      return;
    }
    
    res.status(200).json(parsed);
  } catch (err) {
    console.error("Gemini extraction failed:", err);
    res.status(500).json({ error: err.message || "Extraction failed." });
  }
}
