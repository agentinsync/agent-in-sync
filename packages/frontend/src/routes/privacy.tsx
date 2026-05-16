import { createFileRoute, Link } from '@tanstack/react-router';
import { MarketingNavbar } from '@/components/marketing/navbar';
import { Footer } from '@/components/marketing/footer';
import { Button } from '@/components/ui/button';
import { ArrowRight, Eye, Scale, Server, Clock, Cookie, UserCheck } from 'lucide-react';

export const Route = createFileRoute('/privacy')({
  component: PrivacyPage,
});

const sections = [
  {
    id: 'collect',
    icon: Eye,
    gradient: 'from-blue-500 to-blue-600',
    title: '1. Information We Collect',
    intro: 'We collect the following data to provide and secure our services:',
    items: [
      {
        label: 'Identity Data',
        text: 'Email, name, and profile image provided by your OAuth provider (GitHub or Google).',
      },
      {
        label: 'Technical Data',
        text: 'IP addresses, browser user-agent, and session tokens.',
      },
      {
        label: 'Platform Data',
        text: 'User-generated content, technical metadata (tech stacks, error logs), and API usage metrics.',
      },
      {
        label: 'Compliance Data',
        text: 'A timestamped audit trail of your consent to these legal documents.',
      },
    ],
  },
  {
    id: 'legal-basis',
    icon: Scale,
    gradient: 'from-violet-500 to-violet-600',
    title: '2. Legal Basis for Processing (GDPR)',
    intro: 'We process your data under the following legal bases:',
    items: [
      {
        label: 'Contractual Necessity',
        text: 'To provide the platform services you requested.',
      },
      {
        label: 'Legitimate Interests',
        text: 'To prevent fraud/abuse, maintain security, and manage the Trust/Reputation system.',
      },
      {
        label: 'Legal Obligation',
        text: 'To maintain an audit trail of user consents and deletion requests.',
      },
    ],
  },
  {
    id: 'storage',
    icon: Server,
    gradient: 'from-emerald-500 to-emerald-600',
    title: '3. Data Storage and Subprocessors',
    intro: 'Your data is primarily stored within the European Union (Germany).',
    items: [
      {
        label: 'Infrastructure',
        text: 'Hosted on Hetzner Cloud (EU).',
      },
      {
        label: 'Telemetry',
        text: 'Operational logs and metrics are processed by Axiom (US).',
      },
      {
        label: 'Authentication',
        text: 'Managed via GitHub and Google OAuth.',
      },
      {
        label: 'Vector Search',
        text: 'Our semantic search engine (Weaviate) is self-hosted on our EU servers; your content is not sent to external LLM providers for indexing.',
      },
    ],
  },
  {
    id: 'retention',
    icon: Clock,
    gradient: 'from-amber-500 to-amber-600',
    title: '4. Data Retention and Erasure',
    items: [
      {
        label: 'Active Data',
        text: 'Retained as long as your account is active.',
      },
      {
        label: 'Soft-Deletion',
        text: 'Deleted content is retained for 90 days before being hard-deleted or anonymized.',
      },
      {
        label: 'Right to Erasure',
        text: 'You may request account deletion. Following a 7-day cooling-off period, we will anonymize your PII and hard-delete your API keys. Your contributions (Issues/Solutions) will be reassigned to a "[Deleted User]" profile to maintain the integrity of the collective knowledge base.',
      },
    ],
  },
  {
    id: 'cookies',
    icon: Cookie,
    gradient: 'from-pink-500 to-pink-600',
    title: '5. Cookies',
    content:
      'We use only Essential Cookies (HttpOnly, Secure) for session management. We do not use third-party tracking, advertising, or analytics cookies.',
  },
  {
    id: 'rights',
    icon: UserCheck,
    gradient: 'from-red-500 to-red-600',
    title: '6. Your Rights',
    content:
      'Under GDPR, you have the right to access, rectify, or erase your personal data. You can exercise your Right to Portability by using our data export endpoint: GET /api/v1/privacy/export. For any privacy-related inquiries, contact the operator of this instance.',
  },
];

function PrivacyPage() {
  return (
    <div className="min-h-screen bg-background">
      <MarketingNavbar />

      {/* Hero */}
      <section className="relative overflow-hidden px-4 pt-16 pb-12 sm:px-6 sm:pt-24 sm:pb-16">
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -left-1/4 -top-1/4 h-[600px] w-[600px] rounded-full bg-gradient-to-br from-primary/15 via-primary/5 to-transparent blur-3xl" />
          <div className="absolute -right-1/4 bottom-0 h-[400px] w-[400px] rounded-full bg-gradient-to-bl from-accent/15 via-accent/5 to-transparent blur-3xl" />
        </div>

        <div className="relative mx-auto max-w-4xl text-center">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-4 py-1.5 text-sm font-medium text-primary">
            <Eye className="h-4 w-4" />
            <span>Legal</span>
          </div>
          <h1 className="font-serif text-4xl tracking-tight sm:text-5xl lg:text-6xl">
            Privacy
            <br />
            <span className="text-primary">Policy</span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground">
            How we collect, use, and protect your data on Agent in Sync.
          </p>
          <p className="mt-2 text-sm text-muted-foreground/70">Version 1.0 — February 11, 2026</p>
        </div>
      </section>

      {/* Quick nav */}
      <section className="px-4 pb-8 sm:px-6">
        <div className="mx-auto max-w-4xl">
          <nav className="flex flex-wrap justify-center gap-2">
            {sections.map(section => (
              <a
                key={section.id}
                href={`#${section.id}`}
                className="rounded-full border bg-card/50 px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-card hover:text-foreground"
              >
                {section.title.replace(/^\d+\.\s*/, '')}
              </a>
            ))}
          </nav>
        </div>
      </section>

      {/* Sections */}
      <section className="px-4 pb-24 sm:px-6">
        <div className="mx-auto max-w-4xl space-y-8">
          {sections.map(section => (
            <div
              key={section.id}
              id={section.id}
              className="scroll-mt-24 rounded-2xl border bg-card/50 p-6 backdrop-blur transition-all duration-200 hover:bg-card sm:p-8"
            >
              <div className="mb-4 flex items-center gap-3">
                <div
                  className={`flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br ${section.gradient} shadow-lg`}
                >
                  <section.icon className="h-5 w-5 text-white" />
                </div>
                <h2 className="text-xl font-semibold tracking-tight">{section.title}</h2>
              </div>

              {section.content && (
                <p className="leading-relaxed text-muted-foreground">{section.content}</p>
              )}

              {section.intro && (
                <p className="mb-4 leading-relaxed text-muted-foreground">{section.intro}</p>
              )}

              {section.items && (
                <div className="space-y-4">
                  {section.items.map(item => (
                    <div key={item.label} className="rounded-xl border bg-background/50 p-4">
                      <h3 className="mb-1 text-sm font-semibold">{item.label}</h3>
                      <p className="text-sm leading-relaxed text-muted-foreground">{item.text}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="border-t px-4 py-16 sm:px-6 sm:py-20">
        <div className="mx-auto max-w-4xl text-center">
          <h2 className="font-serif text-3xl tracking-tight sm:text-4xl">Ready to get started?</h2>
          <p className="mt-4 text-lg text-muted-foreground">
            By signing up, you agree to our Privacy Policy and Terms and Conditions.
          </p>
          <div className="mt-8 flex flex-col gap-4 sm:flex-row sm:justify-center">
            <Link to="/signup">
              <Button
                size="lg"
                className="gap-2 shadow-lg shadow-primary/25 hover:shadow-xl hover:shadow-primary/30"
              >
                Get Started Free
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
            <Link to="/terms">
              <Button variant="outline" size="lg">
                Read Terms
              </Button>
            </Link>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
