import { Component, OnChanges, OnDestroy, inject, input, signal } from '@angular/core';
import { Subscription } from 'rxjs';
import { categoryLabel } from '../performance/performance-labels';
import { CandidateEvidence, IntelligenceApi } from '../intelligence/intelligence.api';
import { strengthLabel } from '../intelligence/intelligence-labels';
import { PrequalificationEvidence } from './sourcing.api';

/**
 * CF-033 (ADR-129): the firm's delivery evidence in the package's category, beside the Past performance criterion while it is assessed — the
 * same candidate evidence intelligence gives (one request). Delivery counts reach only readers with performance access (the server leaves
 * them out otherwise, ADR-079); everyone else sees the closeout count and who can see the details. No history is never shown as zero.
 */
@Component({
  selector: 'app-prequalification-evidence-live',
  template: `
    @if (evidence(); as item) {
      <p class="prj-hint" data-testid="prequal-evidence">
        @if (categoryMissing()) {
          <span i18n="@@prequalEvidence.noCategory"
            >This work package has no category: no delivery history applies.</span
          >
        } @else if (item.completedProjects === 0) {
          <span i18n="@@prequalEvidence.none"
            >No evidence: no finalized closeout of this firm in
            <bdi>{{ categoryName() }}</bdi> yet.</span
          >
        } @else {
          <span i18n="@@prequalEvidence.closeouts">{item.completedProjects, plural,
            =1 {1 finalized closeout}
            other {{{ item.completedProjects }} finalized closeouts}
          }</span
          >&ngsp;<span i18n="@@prequalEvidence.inCategory"
            >in <bdi>{{ categoryName() }}</bdi> · {{ strength(item.strength) }}</span
          >
          @if (item.onTime !== null) {
            <span class="tnd-block" i18n="@@prequalEvidence.delivery"
              >on time <bdi dir="ltr">{{ item.onTime }}</bdi> · late
              <bdi dir="ltr">{{ item.late }}</bdi> · would work again yes
              <bdi dir="ltr">{{ item.wouldWorkAgainYes }}</bdi> · conditional
              <bdi dir="ltr">{{ item.wouldWorkAgainConditional }}</bdi> · no
              <bdi dir="ltr">{{ item.wouldWorkAgainNo }}</bdi></span
            >
          } @else {
            <span class="tnd-block" i18n="@@prequalEvidence.restricted"
              >Delivery details are visible to roles with performance access.</span
            >
          }
        }
      </p>
    } @else if (failed()) {
      <p class="prj-hint" i18n="@@prequalEvidence.unavailable">
        Delivery evidence could not be loaded. The assessment can still be saved.
      </p>
    }
  `,
})
export class PrequalificationEvidenceLive implements OnChanges, OnDestroy {
  private readonly api = inject(IntelligenceApi);
  readonly workPackageId = input.required<string>();
  readonly subcontractorId = input.required<string>();
  readonly evidence = signal<CandidateEvidence | null>(null);
  readonly categoryName = signal('');
  readonly categoryMissing = signal(false);
  readonly failed = signal(false);
  readonly strength = strengthLabel;
  private request?: Subscription;

  ngOnChanges(): void {
    this.request?.unsubscribe();
    this.evidence.set(null);
    this.failed.set(false);
    this.request = this.api.candidates(this.workPackageId(), [this.subcontractorId()]).subscribe({
      next: (result) => {
        this.categoryName.set(categoryLabel(result.category));
        this.categoryMissing.set(result.categoryMissing);
        this.evidence.set(
          result.candidates.find((item) => item.subcontractorId === this.subcontractorId()) ?? null,
        );
      },
      error: () => this.failed.set(true),
    });
  }

  ngOnDestroy(): void {
    this.request?.unsubscribe();
  }
}

/** CF-033 (ADR-129): the evidence an assessment or an approval snapshot was recorded with — a count and its strength, never a value. */
@Component({
  selector: 'app-prequalification-evidence',
  template: `
    <span class="prj-hint tnd-block" data-testid="prequal-evidence-recorded">
      @if (evidence(); as item) {
        @if (item.completedProjects === 0) {
          <span i18n="@@prequalEvidence.recordedNone"
            >Evidence at assessment: no finalized closeout in this category</span
          >
        } @else {
          <span i18n="@@prequalEvidence.recordedLabel">Evidence at assessment:</span>&ngsp;<span
            i18n="@@prequalEvidence.closeouts"
            >{item.completedProjects, plural,
              =1 {1 finalized closeout}
              other {{{ item.completedProjects }} finalized closeouts}
            }</span
          >&ngsp;<span i18n="@@prequalEvidence.inThisCategory"
            >in this category · {{ strength(item.strength) }}</span
          >
        }
        @if (!item.deliveryShown) {
          <span i18n="@@prequalEvidence.recordedCountOnly"> · the assessor saw the count only</span>
        }
      } @else {
        <span i18n="@@prequalEvidence.notRecorded">Evidence at assessment: not recorded</span>
      }
    </span>
  `,
})
export class PrequalificationEvidenceRecord {
  readonly evidence = input<PrequalificationEvidence | null | undefined>(null);
  readonly strength = strengthLabel;
}
