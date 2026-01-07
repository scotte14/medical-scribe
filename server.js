import express from "express";
import multer from "multer";
import fetch from "node-fetch";
import fs from "fs";
import FormData from "form-data";

const app = express();
const upload = multer({ dest: "uploads/" });

app.use(express.static("public"));

app.post("/transcribe", upload.single("audio"), async (req, res) => {
  try {
    // ---------- SPEECH TO TEXT ----------
    const audioStream = fs.createReadStream(req.file.path);
    const form = new FormData();
    form.append("file", audioStream);
    form.append("model", "whisper-1");

    const sttResponse = await fetch(
      "https://api.openai.com/v1/audio/transcriptions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          ...form.getHeaders()
        },
        body: form
      }
    );

    const sttData = await sttResponse.json();

    if (!sttData.text) {
      throw new Error("Speech-to-text failed");
    }

    const transcript = sttData.text;
    const ecw = req.body.ecw === "true";

    // ---------- MEDICAL SCRIBE ----------
    const aiResponse = await fetch(
      "https://api.openai.com/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [
            {
              role: "system",
              content: ecw
                ? "You are a medical scribe. Output an eClinicalWorks-style encounter note. Do not invent diagnoses."
                : "You are a medical scribe. Output a SOAP note. Do not invent diagnoses."
            },
            { role: "user", content: transcript }
          ]
        })
      }
    );

    const aiData = await aiResponse.json();
    fs.unlinkSync(req.file.path);

    res.json({ scribe: aiData.choices[0].message.content });
  } catch (err) {
    console.error(err);
    res.json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () =>
  console.log(`Medical Scribe running on port ${PORT}`)
);
