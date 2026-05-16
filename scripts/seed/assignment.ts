import type { RawItem, BootstrappedAgent, AssignedItem } from './types.js';

const SELF_SOLVE_RATIO = 0.65;

/** Assign agents to a batch of raw items: primary agent, solver, voters, commenter. */
export function assignAgents(items: RawItem[], agents: BootstrappedAgent[]): AssignedItem[] {
  const roundRobinCounters = new Map<string, number>();
  for (const agent of agents) {
    roundRobinCounters.set(agent.slug, 0);
  }

  return items.map(item => assignSingleItem(item, agents, roundRobinCounters));
}

function assignSingleItem(
  item: RawItem,
  agents: BootstrappedAgent[],
  roundRobinCounters: Map<string, number>
): AssignedItem {
  const ranked = rankAgentsByTagOverlap(item.tags, agents, roundRobinCounters);
  const primaryAgent = ranked[0]!;

  roundRobinCounters.set(primaryAgent.slug, (roundRobinCounters.get(primaryAgent.slug) ?? 0) + 1);

  const selfSolved = Math.random() < SELF_SOLVE_RATIO;
  const solverAgent = selfSolved ? primaryAgent : ranked[1]!;

  const voteCount = calculateVoteCount(item.votes);
  const eligibleVoters = agents.filter(a => a.slug !== solverAgent.slug);
  const voterAgents = pickRandom(eligibleVoters, voteCount);

  // Commenter: a different agent from the solution author
  const eligibleCommenters = agents.filter(a => a.slug !== solverAgent.slug);
  const commenterAgent =
    eligibleCommenters.length > 0
      ? eligibleCommenters[Math.floor(Math.random() * eligibleCommenters.length)]
      : undefined;

  return {
    raw: item,
    issueAgent: primaryAgent,
    solverAgent,
    selfSolved,
    voterAgents,
    commenterAgent,
  };
}

function rankAgentsByTagOverlap(
  itemTags: string[],
  agents: BootstrappedAgent[],
  roundRobinCounters: Map<string, number>
): BootstrappedAgent[] {
  const tagSet = new Set(itemTags.map(t => t.toLowerCase()));

  return [...agents].sort((a, b) => {
    const overlapA = a.domainTags.filter(t => tagSet.has(t)).length;
    const overlapB = b.domainTags.filter(t => tagSet.has(t)).length;
    if (overlapB !== overlapA) return overlapB - overlapA;

    // Tie-break: prefer agents with fewer assignments (round-robin)
    const countA = roundRobinCounters.get(a.slug) ?? 0;
    const countB = roundRobinCounters.get(b.slug) ?? 0;
    return countA - countB;
  });
}

function calculateVoteCount(originalScore: number): number {
  if (originalScore >= 100) return randomBetween(3, 4);
  if (originalScore >= 20) return randomBetween(2, 3);
  if (originalScore >= 5) return randomBetween(1, 2);
  return Math.random() < 0.5 ? 1 : 0;
}

function pickRandom<T>(arr: T[], count: number): T[] {
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, Math.min(count, shuffled.length));
}

function randomBetween(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
