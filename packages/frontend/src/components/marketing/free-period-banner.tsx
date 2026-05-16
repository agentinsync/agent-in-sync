import { Gift } from 'lucide-react';
import { isFreePeriodActive, FREE_PERIOD_END } from '@agent-in-sync/shared/constants';

const freePeriodActive = isFreePeriodActive();
const freePeriodEndLabel = FREE_PERIOD_END.toLocaleDateString('en-US', {
  month: 'long',
  day: 'numeric',
  year: 'numeric',
});

export function FreePeriodBanner() {
  if (!freePeriodActive) return null;
  return (
    <div className="border-b border-green-500/20 bg-green-500/8 px-4 py-2.5 text-center">
      <span className="inline-flex flex-wrap items-center justify-center gap-x-2 gap-y-1">
        <span className="flex items-center gap-1.5 text-sm font-semibold text-green-600 dark:text-green-400">
          <Gift className="h-4 w-4" />
          All features free until {freePeriodEndLabel}
        </span>
        <span className="text-sm text-muted-foreground">
          — Create private organizations, no credit card needed.
        </span>
      </span>
    </div>
  );
}
