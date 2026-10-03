import { VerificationDetails } from '../../shared/ui/verification-details';
import { NgTemplateOutlet } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { BusinessDatePipe } from '../../core/localization/business-format';
import { LocaleService } from '../../core/localization/locale.service';
import { money, signedMoney } from '../evaluation/evaluation-format';
import { classificationLabel } from '../evaluation/evaluation-labels';
import {
  BidComparison,
  DecisionApi,
  FieldComparison,
  RevisionComparison,
  decisionProblemMessage,
  shortFingerprint,
} from './decision.api';
import {
  comparisonFieldLabel,
  comparisonValue,
  lineChangeLabel,
  revisionKindLabel,
} from './decision-labels';
import { TenderStageHeader } from '../tendering/tender-stage-header';

/**
 * Original vs revised vs final (Part 10): one bid at a time, every evidenced revision side by side. "Changed" is exact
 * evidence — the stored values differ — never a judgement about meaning, and is always written out, not only coloured.
 * A technical-only reader receives no amount, line, commercial term or commercial file, and the page shows none.
 */
@Component({
  selector: 'app-negotiation-comparison',
  imports: [
    VerificationDetails,
    TenderStageHeader,
    FormsModule,
    NgTemplateOutlet,
    RouterLink,
    BusinessDatePipe,
  ],
  templateUrl: './negotiation-comparison.html',
  styleUrl: './negotiation-comparison.scss',
})
export class NegotiationComparison implements OnInit {
  private readonly api = inject(DecisionApi);
  private readonly route = inject(ActivatedRoute);
  readonly locale = inject(LocaleService).locale;

  readonly fieldLabel = comparisonFieldLabel;
  readonly value = comparisonValue;
  readonly changeLabel = lineChangeLabel;
  readonly kindLabel = revisionKindLabel;
  readonly classificationLabel = (value: string) =>
    value === 'Technical' || value === 'Commercial' || value === 'Unclassified'
      ? classificationLabel(value)
      : value;
  readonly short = shortFingerprint;

  readonly tenderId = signal('');
  readonly comparison = signal<RevisionComparison | null>(null);
  readonly loading = signal(true);
  readonly error = signal('');
  selectedId = '';
  private readonly choice = signal('');

  readonly bid = computed<BidComparison | null>(() => {
    const bids = this.comparison()?.bids ?? [];
    return bids.find((bid) => bid.openingBidId === this.choice()) ?? bids[0] ?? null;
  });
  readonly technicalFields = computed(() =>
    (this.bid()?.fields ?? []).filter((field) => field.section === 'technical'),
  );
  readonly commercialFields = computed(() =>
    (this.bid()?.fields ?? []).filter((field) => field.section !== 'technical'),
  );

  ngOnInit(): void {
    this.tenderId.set(this.route.snapshot.paramMap.get('id') ?? '');
    this.load();
  }

  load(): void {
    this.loading.set(this.comparison() === null);
    this.error.set('');
    this.api.comparison(this.tenderId()).subscribe({
      next: (view) => {
        this.comparison.set(view);
        this.selectedId ||= view.bids[0]?.openingBidId ?? '';
        this.choice.set(this.selectedId);
        this.loading.set(false);
      },
      error: (error: unknown) => {
        this.error.set(decisionProblemMessage(error));
        this.loading.set(false);
      },
    });
  }

  pick(id: string): void {
    this.selectedId = id;
    this.choice.set(id);
  }

  money(amount: string | null): string {
    return money(amount, this.locale);
  }

  signed(amount: string | null): string {
    return signedMoney(amount, this.locale);
  }

  percent(value: string | null): string {
    if (!value) return '—';
    return value.startsWith('-') ? `−${value.slice(1)}` : value === '0.0' ? value : `+${value}`;
  }

  shown(field: FieldComparison, index: number): string {
    const raw = field.values[index] ?? null;
    return field.field === 'totalAmount' && raw !== null
      ? `${this.money(raw)} ${this.comparison()?.currency ?? ''}`.trim()
      : this.value(field.field, raw);
  }
}
