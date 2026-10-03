import { NgTemplateOutlet } from '@angular/common';
import { Component, computed, inject, input } from '@angular/core';
import { BusinessDatePipe } from '../../core/localization/business-format';
import { LocaleService } from '../../core/localization/locale.service';
import { money } from '../evaluation/evaluation-format';
import { CloseoutWorkspace } from './performance.api';
import {
  mobilizationLabel,
  outcomeEffectLabel,
  outcomeTypeLabel,
  ratingLabel,
  rehireLabel,
  variationCauseLabel,
} from './performance-labels';

export type ReadonlyCloseoutStep = 'schedule' | 'commercial' | 'quality' | 'issues' | 'feedback';

/**
 * CF-101 (B-101-1): a closeout section the reader cannot edit — closed, or owned by the other team — reads as recorded values, not
 * as a disabled form. Values are the server's (never a draft); each term reuses the form's own label, so the two read the same.
 * A commercial value the server withholds from this reader is left out (the page says why), never shown as "Not recorded".
 */
@Component({
  selector: 'app-closeout-readonly',
  imports: [BusinessDatePipe, NgTemplateOutlet],
  // Two columns, one below 40rem; logical properties so Arabic mirrors.
  styles: `
    .pf-readonly {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 0.75rem 1.5rem;
      margin: 0 0 1.25rem;
    }

    .pf-readonly > div {
      min-inline-size: 0;
    }

    .pf-readonly-wide {
      grid-column: 1 / -1;
    }

    .pf-readonly dt {
      color: var(--color-muted);
      font-size: 0.85rem;
    }

    .pf-readonly dd {
      margin: 0.15rem 0 0;
      margin-inline-start: 0;
      overflow-wrap: anywhere;
    }

    .pf-readonly dd small {
      display: block;
    }

    .pf-readonly-text {
      white-space: pre-line;
    }

    .pf-readonly-none {
      color: var(--color-muted);
      font-style: italic;
    }

    @media (max-width: 40rem) {
      .pf-readonly {
        grid-template-columns: minmax(0, 1fr);
      }
    }
  `,
  templateUrl: './closeout-readonly.html',
})
export class CloseoutReadonly {
  readonly view = input.required<CloseoutWorkspace>();
  readonly step = input.required<ReadonlyCloseoutStep>();
  private readonly locale = inject(LocaleService).locale;

  protected readonly outcomeLabel = outcomeTypeLabel;
  protected readonly outcomeEffect = outcomeEffectLabel;
  protected readonly mobilizationLabel = mobilizationLabel;
  protected readonly ratingLabel = ratingLabel;
  protected readonly rehireLabel = rehireLabel;
  protected readonly causeLabel = variationCauseLabel;

  /** Only a recorded outcome other than Completed has a share completed and an effective (not actual) end. */
  protected readonly notCompleted = computed(() => {
    const outcome = this.view().execution.outcomeType;
    return !!outcome && outcome !== 'Completed';
  });

  /** CF-082: the recorded dates start or finish before the award day (UTC), as the form decides. */
  protected readonly beforeAward = computed(() => {
    const view = this.view();
    const awardDay = view.baseline.awardedAtUtc.slice(0, 10);
    return [view.execution.actualStartDate, view.execution.actualCompletionDate].some(
      (date) => !!date && date < awardDay,
    );
  });

  /** A commercial value withheld from this reader (CF-073) is omitted; a visible one that is empty reads "Not recorded". */
  protected shows(value: unknown): boolean {
    return this.view().commercialVisible || (value !== null && value !== undefined);
  }

  protected money(amount: string | null | undefined): string {
    return money(amount, this.locale);
  }
}
