import { backendUrl } from '../config/Backend';

// The app never calls CricAPI directly: the backend fetches on a shared,
// quota-paced schedule and serves one cached snapshot to every user.
export const CricketApiEndpoints = {
  MATCHES: () => backendUrl('/matches'),
  PREDICT: () => backendUrl('/predictMatch'),
};
