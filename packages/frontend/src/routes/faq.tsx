import { createFileRoute, Link } from '@tanstack/react-router';
import { MarketingNavbar } from '@/components/marketing/navbar';
import { Footer } from '@/components/marketing/footer';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Button } from '@/components/ui/button';
import { ArrowRight, HelpCircle } from 'lucide-react';
import { faqCategories } from '@/lib/faq-data';

export const Route = createFileRoute('/faq')({
  component: FAQPage,
});

function FAQPage() {
  return (
    <div className="min-h-screen bg-background">
      <MarketingNavbar />

      {/* Hero section */}
      <section className="relative overflow-hidden px-4 pt-16 pb-12 sm:px-6 sm:pt-24 sm:pb-16">
        {/* Background */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -left-1/4 -top-1/4 h-[600px] w-[600px] rounded-full bg-gradient-to-br from-primary/15 via-primary/5 to-transparent blur-3xl" />
          <div className="absolute -right-1/4 bottom-0 h-[400px] w-[400px] rounded-full bg-gradient-to-bl from-accent/15 via-accent/5 to-transparent blur-3xl" />
        </div>

        <div className="relative mx-auto max-w-4xl text-center">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-4 py-1.5 text-sm font-medium text-primary">
            <HelpCircle className="h-4 w-4" />
            <span>Help Center</span>
          </div>
          <h1 className="font-serif text-4xl tracking-tight sm:text-5xl lg:text-6xl">
            Frequently Asked
            <br />
            <span className="text-primary">Questions</span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground">
            Everything you need to know about Agent in Sync. Can&apos;t find what you&apos;re
            looking for? Feel free to reach out to our support team.
          </p>
        </div>
      </section>

      {/* FAQ sections */}
      <section className="px-4 pb-24 sm:px-6">
        <div className="mx-auto max-w-4xl space-y-12">
          {faqCategories.map(category => (
            <div key={category.title}>
              {/* Category header */}
              <div className="mb-6 flex items-center gap-3">
                <div
                  className={`flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br ${category.gradient} shadow-lg`}
                >
                  <category.icon className="h-5 w-5 text-white" />
                </div>
                <h2 className="text-xl font-semibold tracking-tight">{category.title}</h2>
              </div>

              {/* Accordion */}
              <Accordion type="single" collapsible className="space-y-3">
                {category.faqs.map((faq, index) => (
                  <AccordionItem
                    key={index}
                    value={`${category.title}-${index}`}
                    className="rounded-xl border bg-card/50 px-6 backdrop-blur transition-all duration-200 hover:bg-card data-[state=open]:bg-card data-[state=open]:shadow-lg"
                  >
                    <AccordionTrigger className="py-5 text-left font-medium hover:no-underline [&[data-state=open]>svg]:rotate-180">
                      {faq.question}
                    </AccordionTrigger>
                    <AccordionContent className="pb-5 text-muted-foreground leading-relaxed">
                      {faq.answer}
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </div>
          ))}
        </div>
      </section>

      {/* CTA section */}
      <section className="border-t px-4 py-16 sm:px-6 sm:py-20">
        <div className="mx-auto max-w-4xl text-center">
          <h2 className="font-serif text-3xl tracking-tight sm:text-4xl">Still have questions?</h2>
          <p className="mt-4 text-lg text-muted-foreground">
            Our team is here to help. Reach out and we&apos;ll get back to you within 24 hours.
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
            <a href="mailto:info@example.com">
              <Button variant="outline" size="lg">
                Contact Support
              </Button>
            </a>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
