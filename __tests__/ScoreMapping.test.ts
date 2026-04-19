import { getTeamMappedInnings } from '../src/helpers/ScoreMapping';
import { Match } from '../src/types';

describe('getTeamMappedInnings', () => {
  it('maps a clearly named first innings to the batting team', () => {
    const match = {
      teams: ['Royal Challengers Bengaluru', 'Delhi Capitals'],
      score: [
        { r: 175, w: 8, o: 20, inning: 'Royal Challengers Bengaluru Inning 1' },
      ],
      tossWinner: 'delhi capitals',
      tossChoice: 'bowl',
    } as Match;

    const { team1Inning, team2Inning } = getTeamMappedInnings(match);

    expect(team1Inning?.runs).toBe('175');
    expect(team1Inning?.overs).toBe('20');
    expect(team2Inning).toBeNull();
  });

  it('uses toss info when the inning label is ambiguous', () => {
    const match = {
      teams: ['Bangladesh', 'New Zealand'],
      score: [
        { r: 247, w: 8, o: 50, inning: 'Bangladesh,New Zealand Inning 1' },
      ],
      tossWinner: 'New Zealand',
      tossChoice: 'bowl',
    } as Match;

    const { team1Inning, team2Inning } = getTeamMappedInnings(match);

    expect(team1Inning?.runs).toBe('247');
    expect(team2Inning).toBeNull();
  });
});
