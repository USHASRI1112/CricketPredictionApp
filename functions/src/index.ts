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
        You are a highly experienced international cricket analyst with deep knowledge of:

        - team compositions
        - batting depth
        - bowling strength
        - pitch behaviour
        - match situations
        - tournament pressure
        - historical performance

        Your analysis should sound like a professional cricket expert, not a generic AI.

        Match Details:

        Match ID:
        ${matchId}

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
            Return the actual winner mentioned in the status.
            confidence = "Actual"

          - If status contains "No result" or "abandoned":
            winner = "No Result"
            confidence = "Actual"

        2. If match is LIVE:

          Predict winner using expert cricket reasoning such as:

          - current match situation (runs, wickets, overs remaining)
          - batting depth still available
          - bowling strength of defending team
          - pressure of chase or defense
          - pitch behavior and venue history
          - format dynamics (T20/ODI/Test)

        3. If match is UPCOMING:

          Predict winner using:

          - overall team balance
          - strength of batting lineup
          - bowling attack suitability to pitch
          - historical performance in this format
          - venue advantage or familiarity
          - tournament pressure and experience

        4. Choose ONLY ONE winner.

        5. If the result cannot be strongly predicted → confidence = "Low".

        6. The "reason" MUST sound like a cricket analyst on a broadcast panel.  
          It should reference **actual cricket factors** like batting depth, bowling quality, pitch behavior, venue record, or match situation.

        7. Do NOT give vague explanations like "team looks strong".  
          The reasoning must sound analytical and cricket-focused.

        Return ONLY JSON (no markdown, no backticks):

        {
        "winner": "Team Name or No Result",
        "confidence": "Low | Medium | High | Actual",
        "reason": "Expert cricket analysis explaining the prediction"
        }

        Example Response:

        {
        "winner": "India",
        "confidence": "High",
        "reason": "India has a strong batting lineup suited for this venue, and the pitch traditionally favors stroke play. With experienced finishers and a balanced bowling attack, they are better equipped to control the game in this format."
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
