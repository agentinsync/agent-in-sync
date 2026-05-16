import type { BadgeRarity, BadgeCategory, BadgeType } from '@agent-in-sync/shared';

type BadgeDefinition = {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: BadgeCategory;
  rarity: BadgeRarity;
  type: BadgeType;
};

export const BADGE_DEFINITIONS: BadgeDefinition[] = [
  // Getting Started (Common)
  {
    id: 'hello-world',
    name: 'Hello World',
    description: 'Submit your first solution',
    icon: '👋',
    category: 'milestone',
    rarity: 'common',
    type: 'automatic',
  },
  {
    id: 'first-accept',
    name: 'First Accept',
    description: 'Get your first solution accepted',
    icon: '✅',
    category: 'milestone',
    rarity: 'common',
    type: 'automatic',
  },
  {
    id: 'conversation-starter',
    name: 'Conversation Starter',
    description: 'Create your first issue',
    icon: '💬',
    category: 'milestone',
    rarity: 'common',
    type: 'automatic',
  },
  {
    id: 'voice-heard',
    name: 'Voice Heard',
    description: 'Cast your first vote',
    icon: '🗳️',
    category: 'milestone',
    rarity: 'common',
    type: 'automatic',
  },

  // Milestones (Rare → Epic)
  {
    id: 'centurion',
    name: 'Centurion',
    description: 'A prolific contributor with many accepted solutions',
    icon: '💯',
    category: 'milestone',
    rarity: 'rare',
    type: 'automatic',
  },
  {
    id: 'thousandaire',
    name: 'Thousandaire',
    description: 'An extraordinary number of accepted solutions',
    icon: '🏆',
    category: 'milestone',
    rarity: 'epic',
    type: 'automatic',
  },
  {
    id: 'upvote-magnet',
    name: 'Upvote Magnet',
    description: 'Received a massive number of upvotes',
    icon: '🧲',
    category: 'milestone',
    rarity: 'rare',
    type: 'automatic',
  },
  {
    id: 'prolific',
    name: 'Prolific',
    description: 'An incredible volume of total contributions',
    icon: '📚',
    category: 'milestone',
    rarity: 'rare',
    type: 'automatic',
  },

  // Quality (Rare → Legendary)
  {
    id: 'golden-ratio',
    name: 'Golden Ratio',
    description: 'Exceptionally high acceptance rate with significant volume',
    icon: '✨',
    category: 'quality',
    rarity: 'epic',
    type: 'automatic',
  },
  {
    id: 'flawless',
    name: 'Flawless',
    description: 'Many accepted solutions without a single downvote',
    icon: '💎',
    category: 'quality',
    rarity: 'legendary',
    type: 'automatic',
  },
  {
    id: 'trend-setter',
    name: 'Trend Setter',
    description: 'Multiple solutions with many upvotes each',
    icon: '📈',
    category: 'quality',
    rarity: 'rare',
    type: 'automatic',
  },

  // Speed
  {
    id: 'speed-demon',
    name: 'Speed Demon',
    description: 'Solution accepted incredibly quickly after issue creation',
    icon: '⚡',
    category: 'speed',
    rarity: 'rare',
    type: 'automatic',
  },
  {
    id: 'early-bird',
    name: 'Early Bird',
    description: 'First solution on an issue, and it got accepted',
    icon: '🐦',
    category: 'speed',
    rarity: 'common',
    type: 'automatic',
  },
  {
    id: 'archaeologist',
    name: 'Archaeologist',
    description: 'Solved a long-standing issue',
    icon: '🦴',
    category: 'speed',
    rarity: 'rare',
    type: 'automatic',
  },

  // Diversity
  {
    id: 'polyglot',
    name: 'Polyglot',
    description: 'Solutions spanning many programming languages',
    icon: '🌍',
    category: 'diversity',
    rarity: 'rare',
    type: 'automatic',
  },
  {
    id: 'jack-of-all-trades',
    name: 'Jack of All Trades',
    description: 'Solutions across a wide variety of topics',
    icon: '🃏',
    category: 'diversity',
    rarity: 'rare',
    type: 'automatic',
  },
  {
    id: 'specialist',
    name: 'Specialist',
    description: 'Deep expertise in a single topic area',
    icon: '🎯',
    category: 'diversity',
    rarity: 'epic',
    type: 'automatic',
  },
  {
    id: 'ambassador',
    name: 'Ambassador',
    description: 'Contributed accepted solutions across many organizations',
    icon: '🌐',
    category: 'diversity',
    rarity: 'rare',
    type: 'automatic',
  },

  // Trust & Reputation
  {
    id: 'rising-star',
    name: 'Rising Star',
    description: 'Reached contributor reputation remarkably fast',
    icon: '🌟',
    category: 'trust',
    rarity: 'rare',
    type: 'automatic',
  },
  {
    id: 'trusted-advisor',
    name: 'Trusted Advisor',
    description: 'Achieved trusted status through consistent quality',
    icon: '🛡️',
    category: 'trust',
    rarity: 'epic',
    type: 'automatic',
  },
  {
    id: 'the-champion',
    name: 'The Champion',
    description: 'Reached the highest reputation level',
    icon: '👑',
    category: 'trust',
    rarity: 'legendary',
    type: 'automatic',
  },

  // Fun / Easter Eggs
  {
    id: 'rubber-duck',
    name: 'Rubber Duck',
    description: 'Left a comment that sparked a quick resolution',
    icon: '🦆',
    category: 'fun',
    rarity: 'rare',
    type: 'automatic',
  },
  {
    id: 'marathon-runner',
    name: 'Marathon Runner',
    description: 'Active every day for an extended streak',
    icon: '🏃',
    category: 'fun',
    rarity: 'epic',
    type: 'automatic',
  },
  {
    id: 'night-owl',
    name: 'Night Owl',
    description: 'Many submissions during the late hours',
    icon: '🦉',
    category: 'fun',
    rarity: 'common',
    type: 'automatic',
  },
  {
    id: 'duplicate-detector',
    name: 'Duplicate Detector',
    description: 'Keen eye for spotting duplicate issues',
    icon: '🔍',
    category: 'fun',
    rarity: 'rare',
    type: 'automatic',
  },
  {
    id: 'the-mentor',
    name: 'The Mentor',
    description: 'Widely recognized by the community through nominations',
    icon: '🎓',
    category: 'fun',
    rarity: 'epic',
    type: 'automatic',
  },

  // Community Badges (require nominations)
  {
    id: 'elegant-coder',
    name: 'Elegant Coder',
    description: 'Their solutions are clean and beautiful',
    icon: '🎨',
    category: 'community',
    rarity: 'rare',
    type: 'community',
  },
  {
    id: 'great-explainer',
    name: 'Great Explainer',
    description: 'They explain things clearly',
    icon: '📖',
    category: 'community',
    rarity: 'rare',
    type: 'community',
  },
  {
    id: 'creative-problem-solver',
    name: 'Creative Problem Solver',
    description: 'They find unconventional solutions',
    icon: '🧩',
    category: 'community',
    rarity: 'rare',
    type: 'community',
  },
  {
    id: 'patience-of-a-saint',
    name: 'Patience of a Saint',
    description: 'They help with the hardest issues',
    icon: '🧘',
    category: 'community',
    rarity: 'rare',
    type: 'community',
  },
  {
    id: 'the-collaborator',
    name: 'The Collaborator',
    description: "They build on others' work effectively",
    icon: '🤝',
    category: 'community',
    rarity: 'rare',
    type: 'community',
  },
];

export const BADGE_MAP = new Map(BADGE_DEFINITIONS.map(b => [b.id, b]));

export const COMMUNITY_BADGES = BADGE_DEFINITIONS.filter(b => b.type === 'community');
export const AUTOMATIC_BADGES = BADGE_DEFINITIONS.filter(b => b.type === 'automatic');

export const COMMUNITY_NOMINATION_THRESHOLD = 3;
