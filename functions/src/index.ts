import { onCall } from 'firebase-functions/v2/https';
import { setGlobalOptions } from 'firebase-functions/v2';
import * as logger from 'firebase-functions/logger';
import * as admin from 'firebase-admin';
import axios from 'axios';
import { defineJsonSecret } from 'firebase-functions/params';

// Prefer explicit project id from environment to avoid implicit project mismatch
const envProjectId =
  process.env.GOOGLE_CLOUD_PROJECT ||
  process.env.GCLOUD_PROJECT ||
  process.env.GCP_PROJECT ||
  process.env.GCLOUD_PROJECT_ID;

admin.initializeApp(envProjectId ? { projectId: envProjectId } : undefined);

// Final resolved project id (use admin SDK option if env var wasn't set)
// const resolvedProjectId = envProjectId || admin.app().options.projectId;

// // Limit instances to control cost
setGlobalOptions({
  maxInstances: 10,
});

interface PredictRequest {
  matchId: string;
  teamA: string;
  teamB: string;
  date?: string;
}

interface PredictionResponse {
  winner: string;
  confidence: string;
  reason: string;
}

const config = defineJsonSecret('FUNCTIONS_CONFIG_EXPORT');

export const predictMatch = onCall(
  { secrets: [config] },
  async (request): Promise<PredictionResponse> => {
    try {
      const body: any = request.data as PredictRequest;
      logger.info('Received prediction request', body);
      const {
        matchId,
        teamA,
        teamB,
        date,
        tournament,
        matchType,
        venue,
        status,
        matchEnded,
        scoreText,
      } = body;
      // const { matchId, teamA, teamB, date } = request.data as PredictRequest;

      const predictionDate = date || new Date().toISOString().slice(0, 10);

      const groqKey = config.value().groq.key;

      const prompt = `
      You are a professional cricket analyst AI.

      Match Details:
      Match ID: ${matchId}

      Date:
      ${predictionDate}

      Teams:
      ${teamA} vs ${teamB}

      Tournament:
      ${tournament}

      Format:
      ${matchType}

      Venue:
      ${venue}

      Pitch:
      Estimate pitch conditions based on venue knowledge.

      Match Status:
      ${status}

      Match Ended:
      ${matchEnded}

      Current Score:
      ${scoreText}

      Instructions:

      1. If Match Ended = true:

        - If status contains "won":
          Return actual winner from status.

        - If status contains "No result" or "abandoned":
          Return winner = "No Result".

      2. If match is live:

        Predict winner using:

        - Current score
        - Team strength
        - Match format
        - Tournament importance
        - Pitch conditions

      3. If match is upcoming:

        Predict winner using:

        - Team strength
        - Match format
        - Tournament importance
        - Pitch conditions

      4. Choose ONE winner only. If any data is missing or inconclusive, predict based on available data, history, but just only return JSON and no other explanations.

      5. If uncertain → confidence = Low.

      Return ONLY JSON (Should be able to easily parse it in frontend - no backticks or markdown):

      {
      "winner": "Team Name or No Result",
      "confidence": "Low | Medium | High | Actual",
      "reason": "Short explanation"
      }

      Example Response:
      {
      "winner": "India",
      "confidence": "High",
      "reason": "India is currently leading with a strong score and has a good track record in this tournament format."
      }
      
    `;
      const response = await axios.post(
        'https://api.groq.com/openai/v1/chat/completions',
        {
          model: 'llama-3.3-70b-versatile',
          messages: [
            {
              role: 'system',
              content: 'You are a cricket prediction AI.',
            },
            {
              role: 'user',
              content: prompt,
            },
          ],
          temperature: 0.7,
        },
        {
          headers: {
            Authorization: `Bearer ${groqKey}`,
            'Content-Type': 'application/json',
          },
        },
      );
      // console.log(
      //   'Prediction response:',
      //   response.data.choices[0].message.content,
      // );
      logger.info('Received prediction response', {
        response: response.data.choices[0].message.content,
      });

      const content = response.data.choices[0].message.content;

      const parsed: PredictionResponse = JSON.parse(content);

      // Validate required fields before writing
      // if (matchId && resolvedProjectId) {
      //   // Save prediction with defensive error logging so we can diagnose NOT_FOUND issues
      //   try {
      //     await admin.firestore().collection('predictions').doc(matchId).set({
      //       winner: parsed.winner,
      //       confidence: parsed.confidence,
      //       reason: parsed.reason,
      //       predictionDate: predictionDate,
      //       createdAt: admin.firestore.FieldValue.serverTimestamp(),
      //     });

      //     logger.info('Prediction saved', parsed);
      //   } catch (saveError) {
      //     logger.error('Failed to save prediction to Firestore', {
      //       error: saveError,
      //       matchId,
      //       projectId:
      //         resolvedProjectId ||
      //         process.env.GCLOUD_PROJECT ||
      //         process.env.GCP_PROJECT,
      //     });
      //     throw saveError;
      //   }
      // }

      return parsed;
    } catch (error) {
      logger.error('Prediction failed', error);

      throw new Error('Prediction failed');
    }
  },
);
logger.info('Hello logs!', { structuredData: true });
//   response.send("Hello from Firebase!");
// });
