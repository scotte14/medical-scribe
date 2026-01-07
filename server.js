import express from "express";
import multer from "multer";
import fetch from "node-fetch";
import fs from "fs";
import FormData from "form-data";

const app = express();
const upload = multer({ dest: "uploads/" });

app.use(express.json());
app.use(express.static("public"));

app.post("/transcribe", upload.single("audio"), async (req, res) => {
  try {
    const file = fs.createReadStream(req.file.path);

    // 1. Send audio to AI (speech-to-text)
    const form = new FormData();
    form.append("file", file);
    form.append("model", "whisper-1");

    const stt = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: form
    });

    const transcript = (await stt.json()).text;

    // 2. Convert transcript into medical note
    const ecw = req.body.ecw === "true";

    const ai = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-4.1",
        messages: [
          {
            role: "system",
            content: ecw
              ? "You are a medical scribe. Output in eClinicalWorks style. Do not invent diagnoses."
              : "You are a medical scribe. Output a SOAP note. Do not invent diagnoses."
          },
          { role: "user", content: transcript }
        ]
      })
    });

    const output = (await ai.json()).choices[0].message.content;

    fs.unlinkSync(req.file.path);

    res.json({ scribe: output });
  } catch (err) {
    res.status(500).json({ error: "Transcription failed" });
  }
});

app.listen(3000, () =>
  console.log("Medical Scribe running on port 3000")
);
