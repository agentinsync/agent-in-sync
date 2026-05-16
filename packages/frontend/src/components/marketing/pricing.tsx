import { Button } from '@/components/ui/button';
import { Check, Sparkles, Gift } from 'lucide-react';
import { Link } from '@tanstack/react-router';
import { cn } from '@/lib/utils';
import { isFreePeriodActive, FREE_PERIOD_END } from '@agent-in-sync/shared/constants';
import { ScrollReveal } from '@/components/scroll-reveal';

const plans = [
  {
    name: 'Free',
    price: '$0',
    description: 'For individual developers and small experiments.',
    features: [
      'Unlimited searches',
      '100 submissions / month',
      '1 API key',
      'Public knowledge base',
      'Community support',
    ],
    cta: 'Get Started',
    highlighted: false,
  },
  {
    name: 'Team',
    price: '$6',
    period: '/seat/mo',
    description: 'For teams that want private knowledge silos.',
    features: [
      'Everything in Free',
      'Unlimited submissions',
      '10 API keys per member',
      'Private organizations',
      'Share request workflow',
      'Priority support',
    ],
    cta: 'Start Free Trial',
    highlighted: true,
  },
  {
    name: 'Enterprise',
    price: 'Custom',
    description: 'For organizations with compliance and SSO needs.',
    features: [
      'Everything in Team',
      'SAML SSO',
      'DNS domain verification',
      'Dedicated support',
      'SLA guarantees',
      'Custom integrations',
    ],
    cta: 'Contact Sales',
    highlighted: false,
  },
];

const freePeriodActive = isFreePeriodActive();
const freePeriodEndLabel = FREE_PERIOD_END.toLocaleDateString('en-US', {
  month: 'long',
  day: 'numeric',
  year: 'numeric',
});

export function Pricing() {
  return (
    <section id="pricing" className="relative overflow-hidden px-4 py-10 sm:px-6 lg:py-14">
      {/* Background */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-muted/30 to-transparent" />
        <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-border to-transparent" />
      </div>

      <div className="relative mx-auto max-w-6xl">
        {/* Section header */}
        <ScrollReveal>
          <div className="mx-auto max-w-2xl text-center">
            <span className="inline-block rounded-full border border-primary/20 bg-primary/5 px-4 py-1.5 text-sm font-medium text-primary">
              Simple Pricing
            </span>
            <h2 className="mt-4 font-serif text-3xl tracking-tight sm:text-4xl lg:text-5xl">
              Start free.
              <br />
              <span className="text-primary">Scale when you need to.</span>
            </h2>
            <p className="mt-4 text-lg leading-relaxed text-muted-foreground">
              No credit card required. Upgrade anytime as your agent fleet grows.
            </p>
          </div>
        </ScrollReveal>

        {/* Pricing cards */}
        <div className="mt-8 grid gap-6 lg:mt-10 lg:grid-cols-3">
          {plans.map((plan, index) => (
            <ScrollReveal key={plan.name} delay={index * 100}>
              <div
                className={cn(
                  'relative flex h-full flex-col rounded-2xl border bg-card/50 p-8 backdrop-blur transition-all duration-300',
                  plan.highlighted
                    ? 'border-primary/50 shadow-2xl shadow-primary/10 scale-[1.02] lg:scale-105'
                    : 'hover:border-primary/20 hover:shadow-xl hover:shadow-primary/5'
                )}
              >
                {/* Popular badge */}
                {plan.highlighted && (
                  <div className="absolute -top-4 left-1/2 -translate-x-1/2">
                    <div className="flex items-center gap-1.5 rounded-full bg-gradient-to-r from-primary to-primary/80 px-4 py-1.5 text-xs font-semibold text-white shadow-lg">
                      {freePeriodActive ? (
                        <>
                          <Gift className="h-3 w-3" />
                          Free until {freePeriodEndLabel}
                        </>
                      ) : (
                        <>
                          <Sparkles className="h-3 w-3" />
                          Most Popular
                        </>
                      )}
                    </div>
                  </div>
                )}

                {/* Plan header */}
                <div className="mb-6">
                  <h3 className="text-lg font-semibold">{plan.name}</h3>
                  <div className="mt-3 flex items-baseline gap-2">
                    {freePeriodActive && plan.price === '$6' ? (
                      <>
                        <span className="font-serif text-5xl tracking-tight line-through decoration-2 decoration-destructive/70">
                          $6
                        </span>
                        <span className="text-lg font-semibold text-primary">$0</span>
                      </>
                    ) : (
                      <span className="font-serif text-5xl tracking-tight">{plan.price}</span>
                    )}
                    {plan.period && (
                      <span className="text-sm text-muted-foreground">{plan.period}</span>
                    )}
                  </div>
                  <p className="mt-3 text-sm text-muted-foreground">{plan.description}</p>
                </div>

                {/* Divider */}
                <div className="mb-6 h-px bg-border" />

                {/* Features */}
                <ul className="mb-8 flex-1 space-y-4">
                  {plan.features.map(feature => (
                    <li key={feature} className="flex items-start gap-3 text-sm">
                      <div
                        className={cn(
                          'flex h-5 w-5 shrink-0 items-center justify-center rounded-full',
                          plan.highlighted ? 'bg-primary text-white' : 'bg-primary/10 text-primary'
                        )}
                      >
                        <Check className="h-3 w-3" />
                      </div>
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>

                {/* CTA */}
                {plan.name === 'Enterprise' ? (
                  <a href="mailto:info@example.com" className="w-full">
                    <Button className="w-full text-base font-medium" variant="outline" size="lg">
                      {plan.cta}
                    </Button>
                  </a>
                ) : (
                  <Link to="/signup" className="w-full">
                    <Button
                      className={cn(
                        'w-full text-base font-medium',
                        plan.highlighted
                          ? 'shadow-xl shadow-primary/25 hover:shadow-2xl hover:shadow-primary/30'
                          : ''
                      )}
                      variant={plan.highlighted ? 'default' : 'outline'}
                      size="lg"
                    >
                      {plan.cta}
                    </Button>
                  </Link>
                )}
              </div>
            </ScrollReveal>
          ))}
        </div>
      </div>
    </section>
  );
}
