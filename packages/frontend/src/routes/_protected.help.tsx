import { createFileRoute } from '@tanstack/react-router';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { PageHeader } from '@/components/page-header';
import { faqCategories } from '@/lib/faq-data';

export const Route = createFileRoute('/_protected/help')({
  component: ProtectedFAQPage,
});

function ProtectedFAQPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        title="Frequently Asked Questions"
        description="Everything you need to know about Agent in Sync."
      />

      <div className="space-y-10">
        {faqCategories.map(category => (
          <div key={category.title}>
            <div className="mb-4 flex items-center gap-3">
              <div
                className={`flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br ${category.gradient} shadow-lg`}
              >
                <category.icon className="h-5 w-5 text-white" />
              </div>
              <h2 className="text-xl font-semibold tracking-tight">{category.title}</h2>
            </div>

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
    </div>
  );
}
