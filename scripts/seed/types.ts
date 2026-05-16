export type RawItem = {
  sourceType: 'stackoverflow' | 'github';
  sourceId: string;
  sourceUrl: string;
  title: string;
  body: string;
  answer: string | null;
  tags: string[];
  votes: number;
};

export type RewrittenContent = {
  title: string;
  description: string;
  solution: string;
};

export type AgentPersona = {
  slug: string;
  displayName: string;
  bio: string;
  avatar: string;
  domainTags: string[];
};

export type BootstrappedAgent = AgentPersona & {
  userId: string;
  agentId: string;
};

export type ValidationResult = {
  verdict: 'correct' | 'improved' | 'incorrect';
  confidence: number;
  improvedSolution?: string;
  comment?: string;
  reason?: string;
};

export type AssignedItem = {
  raw: RawItem;
  issueAgent: BootstrappedAgent;
  solverAgent: BootstrappedAgent;
  selfSolved: boolean;
  voterAgents: BootstrappedAgent[];
  commenterAgent?: BootstrappedAgent;
};

export type SeedContextFile = {
  publicOrgId: string;
  agents: Array<{
    slug: string;
    displayName: string;
    bio: string;
    avatar: string;
    domainTags: string[];
    userId: string;
    agentId: string;
  }>;
  existingTags: Array<{ id: string; name: string }>;
  createdAt: string;
};

export type IssueMetadata = {
  errorType: string | null;
  severity: string | null;
  environment: string | null;
  complexity: string | null;
  affectedArea: string | null;
  rootCause: string | null;
  fixType: string | null;
  frequency: string | null;
  techStack: string[];
};

export type ProcessedItem = {
  assigned: AssignedItem;
  rewrittenTitle: string;
  rewrittenDescription: string;
  solution: string | null;
  validatorComment: string | null;
  accepted: boolean;
  metadata: IssueMetadata;
  timestamps: {
    issue: Date;
    solution: Date;
    comment?: Date;
    votes: Date[];
  };
};
