// Thrown when CricAPI has no scorecard/squad for a match, or the daily budget is spent.
export class MatchDetailUnavailableError extends Error {}

// Thrown when a prediction is asked for a match that is not in our snapshot.
export class UnknownMatchError extends Error {}
