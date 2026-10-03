import { Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { BusinessDatePipe } from '../../core/localization/business-format';
import {
  CommercialWorkspace,
  EvaluationApi,
  EvaluationFlag,
  EvaluationNote,
  EvaluationOverview,
  TechnicalWorkspace,
  evaluationProblemMessage,
} from './evaluation.api';
import { flagLabel, gapLabel } from './evaluation-labels';

interface BidFindings {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly flags: readonly EvaluationFlag[];
  readonly concerns: readonly EvaluationNote[];
}

/**
 * Deviations and gaps (Part 9): every deterministic flag and every manual concern, per bid, gathered from the sections the user
 * may read — technical findings only for technical readers, commercial findings only for commercial readers. Each flag says
 * which rule found it and the numbers behind it; none is a verdict on a firm.
 */
@Component({
  selector: 'app-evaluation-gaps',
  imports: [BusinessDatePipe],
  styleUrl: './evaluation-gaps.scss',
  template: `
    @if (error()) {
      <p class="prj-note prj-note--error" role="alert">{{ error() }}</p>
    }
    @if (overview(); as view) {
      @if (view.completionGaps.length && view.stage !== 'Completed') {
        <section class="prj-section" aria-labelledby="gaps-needed-title">
          <h2 id="gaps-needed-title" i18n="@@evaluation.stillNeeded">
            Still needed before completion
          </h2>
          <ul role="list">
            @for (gap of view.completionGaps; track $index) {
              <li>
                {{ gapLabel(gap.key) }}
                @if (bidCode(gap.subjectId); as code) {
                  — <bdi dir="ltr" class="tnd-code">{{ code }}</bdi>
                }
              </li>
            }
          </ul>
        </section>
      }
      <section class="prj-section" aria-labelledby="findings-title">
        <h2 id="findings-title" i18n="@@evaluation.findingsTitle">Flags and concerns by bid</h2>
        <p class="prj-hint" i18n="@@evaluation.findingsHint">
          Flags are found by fixed rules and explain themselves. They never change a score and never
          decide anything about a firm. Concerns are notes evaluators marked by hand.
        </p>
        @for (bid of findings(); track bid.id) {
          <article class="ev-findings">
            <h3>
              <bdi dir="ltr" class="tnd-code">{{ bid.code }}</bdi
              >{{ ' ' }}
              <bdi>{{ bid.name }}</bdi>
            </h3>
            @if (bid.flags.length || bid.concerns.length) {
              <ul role="list">
                @for (flag of bid.flags; track flag.section + flag.key) {
                  <li class="ev-flag ev-flag--{{ flag.severity }}">
                    <span class="ev-flag__mark" aria-hidden="true">{{
                      flag.severity === 'warning' ? '!' : 'i'
                    }}</span>
                    {{ flagLabel(flag) }}
                  </li>
                }
                @for (note of bid.concerns; track note.id) {
                  <li class="ev-note ev-note--concern">
                    <strong i18n="@@evaluation.concern">Concern</strong>:
                    <bdi>{{ note.text }}</bdi>
                    <small class="prj-hint tnd-block"
                      ><bdi>{{ note.authorName }}</bdi> ·
                      {{ note.writtenAtUtc | businessDate: 'instant' }}</small
                    >
                  </li>
                }
              </ul>
            } @else {
              <p class="prj-hint" i18n="@@evaluation.noFindings">No flags or concerns.</p>
            }
          </article>
        }
      </section>
    }
  `,
})
export class EvaluationGaps {
  private readonly api = inject(EvaluationApi);
  readonly tenderId = input.required<string>();
  readonly overview = input<EvaluationOverview | null>(null);
  readonly flagLabel = flagLabel;
  readonly gapLabel = gapLabel;
  readonly technical = signal<TechnicalWorkspace | null>(null);
  readonly commercial = signal<CommercialWorkspace | null>(null);
  readonly error = signal('');

  readonly findings = computed<readonly BidFindings[]>(() =>
    (this.overview()?.bids ?? []).map((bid) => {
      const technical = this.technical()?.bids.find(
        (item) => item.openingBidId === bid.openingBidId,
      );
      const commercial = this.commercial()?.bids.find(
        (item) => item.openingBidId === bid.openingBidId,
      );
      const flags = [
        ...bid.flags,
        ...(technical?.flags.filter((flag) => flag.section === 'technical') ?? []),
        ...(commercial?.flags ?? []),
      ];
      return {
        id: bid.openingBidId,
        code: bid.subcontractorCode,
        name: bid.subcontractorName,
        flags,
        concerns: [...(technical?.notes ?? []), ...(commercial?.notes ?? [])].filter(
          (note) => note.kind === 'Concern',
        ),
      };
    }),
  );

  constructor() {
    effect(() => {
      const access = this.overview()?.access;
      const id = this.tenderId();
      untracked(() => {
        if (access?.viewTechnical)
          this.api.technical(id).subscribe({
            next: (value) => this.technical.set(value),
            error: (error: unknown) => this.error.set(evaluationProblemMessage(error)),
          });
        if (access?.viewCommercial)
          this.api.commercial(id).subscribe({
            next: (value) => this.commercial.set(value),
            error: (error: unknown) => this.error.set(evaluationProblemMessage(error)),
          });
      });
    });
  }

  bidCode(id: string | null): string | null {
    return this.overview()?.bids.find((bid) => bid.openingBidId === id)?.subcontractorCode ?? null;
  }
}
