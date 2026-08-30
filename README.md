# BenchBoard — dati consolidati

Questo repository contiene il file `data.json` che l'app BenchBoard scarica una volta al giorno.
Viene aggiornato automaticamente da GitHub Actions **alle 12:00 (ora italiana)** raccogliendo,
con un'unica pipeline gratuita e senza chiavi: OpenRouter (indici/prezzi/contesto), LMArena
(immagini/video/vision), TTS Arena V2, Open ASR Leaderboard e Hugging Face.

`fetch.mjs` è lo script della pipeline; `data.json` il risultato consolidato.
