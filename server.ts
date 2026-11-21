import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { GoogleGenAI, Type } from '@google/genai';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = 3000;

interface PhotoCandidate {
  id: string;
  label: string;
  category: string;
  imageBase64: string;
}

function parseDataUrl(dataUrl: string): { mimeType: string; data: string } | null {
  if (!dataUrl || typeof dataUrl !== 'string') return null;
  const match = dataUrl.match(/^data:(image\/[a-zA-Z0-9+.-]+);base64,(.+)$/);
  if (!match) return null;
  return { mimeType: match[1], data: match[2] };
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '12mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  app.post('/api/photo-match', async (req, res) => {
    try {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
        res.status(503).json({
          error: 'GEMINI_API_KEY is not configured in the environment secrets.',
        });
        return;
      }

      const { queryImageBase64, candidates } = req.body as {
        queryImageBase64?: string;
        candidates?: PhotoCandidate[];
      };

      const parsedQuery = parseDataUrl(queryImageBase64 || '');
      if (!parsedQuery) {
        res.status(400).json({ error: 'Valid query image (base64 data URL) is required.' });
        return;
      }

      const validCandidates = (Array.isArray(candidates) ? candidates : [])
        .map((c) => ({ ...c, parsed: parseDataUrl(c.imageBase64) }))
        .filter((c) => c.parsed !== null)
        .slice(0, 20);

      if (validCandidates.length === 0) {
        res.json({ matches: [] });
        return;
      }

      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          },
        },
      });

      const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [
        {
          text: 'You are assisting the Benishangul-Gumuz Regional Police Commission with visual photo comparison. Compare the QUERY PHOTO below against each CANDIDATE PHOTO. For each candidate, evaluate facial features, structure, and ID portrait similarity. Return a JSON list of matches with confidence (0-100), samePersonLikely (boolean), and a brief Amharic explanation (reasonAmharic).',
        },
        { text: 'QUERY PHOTO:' },
        { inlineData: parsedQuery },
      ];

      validCandidates.forEach((cand, idx) => {
        parts.push({
          text: `CANDIDATE #${idx + 1} | ID: ${cand.id} | Category: ${cand.category} | Label: ${cand.label}`,
        });
        if (cand.parsed) {
          parts.push({ inlineData: cand.parsed });
        }
      });

      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: { parts },
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              matches: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    id: { type: Type.STRING },
                    confidence: { type: Type.NUMBER },
                    samePersonLikely: { type: Type.BOOLEAN },
                    reasonAmharic: { type: Type.STRING },
                  },
                },
              },
            },
          },
        },
      });

      const rawText = (response.text ?? '{"matches":[]}').trim();
      const parsedJson = JSON.parse(rawText);
      res.json({ matches: Array.isArray(parsedJson.matches) ? parsedJson.matches : [] });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Photo matching failed';
      res.status(500).json({ error: message });
    }
  });

  if (process.env.NODE_ENV === 'production') {
    const distPath = path.resolve(__dirname, 'dist');
    if (fs.existsSync(distPath)) {
      app.use(express.static(distPath));
      app.get('/{*splat}', (_req, res) => {
        res.sendFile(path.join(distPath, 'index.html'));
      });
    }
  } else {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
