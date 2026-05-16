type UserData = {
  id: string;
  email: string;
  emailVerified: boolean;
  name: string | null;
  image: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type OrganizationData = {
  id: string;
  name: string;
  slug: string;
  isPublic: boolean;
  createdAt: Date;
  updatedAt: Date;
};

type IssueData = {
  id: string;
  organizationId: string;
  authorId: string;
  title: string;
  description: string;
  solutionCount: number;
  acceptedSolutionId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type SolutionData = {
  id: string;
  issueId: string;
  authorId: string;
  content: string;
  voteCount: number;
  commentCount: number;
  isAccepted: boolean;
  createdAt: Date;
  updatedAt: Date;
};

type VoteData = {
  id: string;
  solutionId: string;
  userId: string;
  direction: 'up' | 'down';
  createdAt: Date;
};

type CommentData = {
  id: string;
  solutionId: string;
  authorId: string;
  content: string;
  createdAt: Date;
  updatedAt: Date;
};

type TagData = {
  id: string;
  name: string;
  description: string | null;
  usageCount: number;
  createdAt: Date;
};

type ShareRequestData = {
  id: string;
  issueId: string;
  requestedById: string;
  reviewedById: string | null;
  status: 'pending' | 'approved' | 'rejected';
  rejectionReason: string | null;
  createdAt: Date;
  reviewedAt: Date | null;
};

type OrganizationMemberData = {
  id: string;
  organizationId: string;
  userId: string;
  role: 'member' | 'admin' | 'reviewer';
  createdAt: Date;
};

type DomainData = {
  id: string;
  name: string;
  status: 'pending' | 'verified';
  verificationMethod: 'social_proof' | 'dns_txt' | 'sso' | null;
  verificationToken: string | null;
  verifiedAt: Date | null;
  ssoEnabled: boolean;
  ssoConfig: Record<string, unknown> | null;
  domainAdminId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type DomainMemberData = {
  id: string;
  domainId: string;
  userId: string;
  joinedAt: Date;
};

class UserBuilder {
  private data: UserData = {
    id: crypto.randomUUID(),
    email: 'test@example.com',
    emailVerified: true,
    name: 'Test User',
    image: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  withId(id: string): this {
    this.data.id = id;
    return this;
  }

  withEmail(email: string): this {
    this.data.email = email;
    return this;
  }

  withName(name: string | null): this {
    this.data.name = name;
    return this;
  }

  build(): UserData {
    return { ...this.data };
  }
}

class OrganizationBuilder {
  private data: OrganizationData = {
    id: crypto.randomUUID(),
    name: 'Test Organization',
    slug: 'test-org',
    isPublic: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  withId(id: string): this {
    this.data.id = id;
    return this;
  }

  withName(name: string): this {
    this.data.name = name;
    return this;
  }

  withSlug(slug: string): this {
    this.data.slug = slug;
    return this;
  }

  asPublic(): this {
    this.data.isPublic = true;
    return this;
  }

  build(): OrganizationData {
    return { ...this.data };
  }
}

class IssueBuilder {
  private data: IssueData = {
    id: crypto.randomUUID(),
    organizationId: crypto.randomUUID(),
    authorId: crypto.randomUUID(),
    title: 'Test Issue',
    description: 'Test issue description',
    solutionCount: 0,
    acceptedSolutionId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  withId(id: string): this {
    this.data.id = id;
    return this;
  }

  withOrganizationId(organizationId: string): this {
    this.data.organizationId = organizationId;
    return this;
  }

  withAuthorId(authorId: string): this {
    this.data.authorId = authorId;
    return this;
  }

  withTitle(title: string): this {
    this.data.title = title;
    return this;
  }

  withDescription(description: string): this {
    this.data.description = description;
    return this;
  }

  withSolutionCount(count: number): this {
    this.data.solutionCount = count;
    return this;
  }

  build(): IssueData {
    return { ...this.data };
  }
}

class SolutionBuilder {
  private data: SolutionData = {
    id: crypto.randomUUID(),
    issueId: crypto.randomUUID(),
    authorId: crypto.randomUUID(),
    content: 'Test solution content',
    voteCount: 0,
    commentCount: 0,
    isAccepted: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  withId(id: string): this {
    this.data.id = id;
    return this;
  }

  withIssueId(issueId: string): this {
    this.data.issueId = issueId;
    return this;
  }

  withAuthorId(authorId: string): this {
    this.data.authorId = authorId;
    return this;
  }

  withContent(content: string): this {
    this.data.content = content;
    return this;
  }

  withVoteCount(count: number): this {
    this.data.voteCount = count;
    return this;
  }

  withCommentCount(count: number): this {
    this.data.commentCount = count;
    return this;
  }

  asAccepted(): this {
    this.data.isAccepted = true;
    return this;
  }

  build(): SolutionData {
    return { ...this.data };
  }
}

class VoteBuilder {
  private data: VoteData = {
    id: crypto.randomUUID(),
    solutionId: crypto.randomUUID(),
    userId: crypto.randomUUID(),
    direction: 'up',
    createdAt: new Date(),
  };

  withId(id: string): this {
    this.data.id = id;
    return this;
  }

  withSolutionId(solutionId: string): this {
    this.data.solutionId = solutionId;
    return this;
  }

  withUserId(userId: string): this {
    this.data.userId = userId;
    return this;
  }

  withDirection(direction: 'up' | 'down'): this {
    this.data.direction = direction;
    return this;
  }

  build(): VoteData {
    return { ...this.data };
  }
}

class CommentBuilder {
  private data: CommentData = {
    id: crypto.randomUUID(),
    solutionId: crypto.randomUUID(),
    authorId: crypto.randomUUID(),
    content: 'Test comment content',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  withId(id: string): this {
    this.data.id = id;
    return this;
  }

  withSolutionId(solutionId: string): this {
    this.data.solutionId = solutionId;
    return this;
  }

  withAuthorId(authorId: string): this {
    this.data.authorId = authorId;
    return this;
  }

  withContent(content: string): this {
    this.data.content = content;
    return this;
  }

  build(): CommentData {
    return { ...this.data };
  }
}

class TagBuilder {
  private data: TagData = {
    id: crypto.randomUUID(),
    name: 'test-tag',
    description: null,
    usageCount: 0,
    createdAt: new Date(),
  };

  withId(id: string): this {
    this.data.id = id;
    return this;
  }

  withName(name: string): this {
    this.data.name = name;
    return this;
  }

  withUsageCount(count: number): this {
    this.data.usageCount = count;
    return this;
  }

  build(): TagData {
    return { ...this.data };
  }
}

class ShareRequestBuilder {
  private data: ShareRequestData = {
    id: crypto.randomUUID(),
    issueId: crypto.randomUUID(),
    requestedById: crypto.randomUUID(),
    reviewedById: null,
    status: 'pending',
    rejectionReason: null,
    createdAt: new Date(),
    reviewedAt: null,
  };

  withId(id: string): this {
    this.data.id = id;
    return this;
  }

  withIssueId(issueId: string): this {
    this.data.issueId = issueId;
    return this;
  }

  withRequestedById(requestedById: string): this {
    this.data.requestedById = requestedById;
    return this;
  }

  withReviewedById(reviewedById: string | null): this {
    this.data.reviewedById = reviewedById;
    return this;
  }

  withStatus(status: 'pending' | 'approved' | 'rejected'): this {
    this.data.status = status;
    return this;
  }

  withRejectionReason(reason: string | null): this {
    this.data.rejectionReason = reason;
    return this;
  }

  build(): ShareRequestData {
    return { ...this.data };
  }
}

class OrganizationMemberBuilder {
  private data: OrganizationMemberData = {
    id: crypto.randomUUID(),
    organizationId: crypto.randomUUID(),
    userId: crypto.randomUUID(),
    role: 'member',
    createdAt: new Date(),
  };

  withId(id: string): this {
    this.data.id = id;
    return this;
  }

  withOrganizationId(organizationId: string): this {
    this.data.organizationId = organizationId;
    return this;
  }

  withUserId(userId: string): this {
    this.data.userId = userId;
    return this;
  }

  withRole(role: 'member' | 'admin' | 'reviewer'): this {
    this.data.role = role;
    return this;
  }

  build(): OrganizationMemberData {
    return { ...this.data };
  }
}

class DomainBuilder {
  private data: DomainData = {
    id: crypto.randomUUID(),
    name: 'example.com',
    status: 'pending',
    verificationMethod: null,
    verificationToken: null,
    verifiedAt: null,
    ssoEnabled: false,
    ssoConfig: null,
    domainAdminId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  withId(id: string): this {
    this.data.id = id;
    return this;
  }

  withName(name: string): this {
    this.data.name = name;
    return this;
  }

  withStatus(status: 'pending' | 'verified'): this {
    this.data.status = status;
    return this;
  }

  withVerificationMethod(method: 'social_proof' | 'dns_txt' | 'sso' | null): this {
    this.data.verificationMethod = method;
    return this;
  }

  withVerificationToken(token: string | null): this {
    this.data.verificationToken = token;
    return this;
  }

  asVerified(): this {
    this.data.status = 'verified';
    this.data.verifiedAt = new Date();
    return this;
  }

  withDomainAdminId(adminId: string): this {
    this.data.domainAdminId = adminId;
    return this;
  }

  withSsoEnabled(enabled: boolean): this {
    this.data.ssoEnabled = enabled;
    return this;
  }

  withSsoConfig(config: Record<string, unknown> | null): this {
    this.data.ssoConfig = config;
    return this;
  }

  build(): DomainData {
    return { ...this.data };
  }
}

class DomainMemberBuilder {
  private data: DomainMemberData = {
    id: crypto.randomUUID(),
    domainId: crypto.randomUUID(),
    userId: crypto.randomUUID(),
    joinedAt: new Date(),
  };

  withId(id: string): this {
    this.data.id = id;
    return this;
  }

  withDomainId(domainId: string): this {
    this.data.domainId = domainId;
    return this;
  }

  withUserId(userId: string): this {
    this.data.userId = userId;
    return this;
  }

  build(): DomainMemberData {
    return { ...this.data };
  }
}

export function aUser(): UserBuilder {
  return new UserBuilder();
}

export function anOrganization(): OrganizationBuilder {
  return new OrganizationBuilder();
}

export function anIssue(): IssueBuilder {
  return new IssueBuilder();
}

export function aSolution(): SolutionBuilder {
  return new SolutionBuilder();
}

export function aVote(): VoteBuilder {
  return new VoteBuilder();
}

export function aComment(): CommentBuilder {
  return new CommentBuilder();
}

export function aTag(): TagBuilder {
  return new TagBuilder();
}

export function aShareRequest(): ShareRequestBuilder {
  return new ShareRequestBuilder();
}

export function anOrganizationMember(): OrganizationMemberBuilder {
  return new OrganizationMemberBuilder();
}

export function aDomain(): DomainBuilder {
  return new DomainBuilder();
}

export function aDomainMember(): DomainMemberBuilder {
  return new DomainMemberBuilder();
}

type RawSourceData = {
  id: string;
  organizationId: string;
  authorId: string;
  authorAgentId: string | null;
  title: string;
  content: string;
  sourceType: string;
  sourceUrl: string | null;
  contentHash: string | null;
  project: string | null;
  createdAt: Date;
};

class RawSourceBuilder {
  private data: RawSourceData = {
    id: crypto.randomUUID(),
    organizationId: crypto.randomUUID(),
    authorId: crypto.randomUUID(),
    authorAgentId: null,
    title: 'Test Source Document',
    content:
      'This is a test source document with enough content to pass validation requirements for the system.',
    sourceType: 'documentation',
    sourceUrl: null,
    contentHash: null,
    project: null,
    createdAt: new Date(),
  };

  withId(id: string): this {
    this.data.id = id;
    return this;
  }
  withOrganizationId(id: string): this {
    this.data.organizationId = id;
    return this;
  }
  withAuthorId(id: string): this {
    this.data.authorId = id;
    return this;
  }
  withTitle(title: string): this {
    this.data.title = title;
    return this;
  }
  withSourceType(type: string): this {
    this.data.sourceType = type;
    return this;
  }
  withSourceUrl(url: string): this {
    this.data.sourceUrl = url;
    return this;
  }
  withContentHash(hash: string): this {
    this.data.contentHash = hash;
    return this;
  }
  build(): RawSourceData {
    return { ...this.data };
  }
}

type WikiPageData = {
  id: string;
  organizationId: string;
  createdByUserId: string;
  createdByAgentId: string | null;
  lastEditedByAgentId: string | null;
  slug: string;
  title: string;
  summary: string | null;
  body: string;
  version: number;
  voteCount: number;
  editCount: number;
  viewCount: number;
  status: string;
  visibility: 'private' | 'domain' | 'public';
  project: string | null;
  techStack: string[] | null;
  createdAt: Date;
  updatedAt: Date;
};

class WikiPageBuilder {
  private data: WikiPageData = {
    id: crypto.randomUUID(),
    organizationId: crypto.randomUUID(),
    createdByUserId: crypto.randomUUID(),
    createdByAgentId: null,
    lastEditedByAgentId: null,
    slug: 'test-wiki-page',
    title: 'Test Wiki Page',
    summary: 'A test wiki page summary for search indexing.',
    body: '# Test Wiki Page\n\nThis is a test wiki page body with enough content to pass validation checks.',
    version: 1,
    voteCount: 0,
    editCount: 0,
    viewCount: 0,
    status: 'approved',
    visibility: 'domain',
    project: null,
    techStack: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  withId(id: string): this {
    this.data.id = id;
    return this;
  }
  withOrganizationId(id: string): this {
    this.data.organizationId = id;
    return this;
  }
  withCreatedByUserId(id: string): this {
    this.data.createdByUserId = id;
    return this;
  }
  withSlug(slug: string): this {
    this.data.slug = slug;
    return this;
  }
  withTitle(title: string): this {
    this.data.title = title;
    return this;
  }
  withSummary(summary: string): this {
    this.data.summary = summary;
    return this;
  }
  withBody(body: string): this {
    this.data.body = body;
    return this;
  }
  withVersion(v: number): this {
    this.data.version = v;
    return this;
  }
  withVoteCount(n: number): this {
    this.data.voteCount = n;
    return this;
  }
  withEditCount(n: number): this {
    this.data.editCount = n;
    return this;
  }
  withProject(p: string): this {
    this.data.project = p;
    return this;
  }
  withVisibility(v: 'private' | 'domain' | 'public'): this {
    this.data.visibility = v;
    return this;
  }
  build(): WikiPageData {
    return { ...this.data };
  }
}

export function aRawSource(): RawSourceBuilder {
  return new RawSourceBuilder();
}

export function aWikiPage(): WikiPageBuilder {
  return new WikiPageBuilder();
}
