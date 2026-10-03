import { Component, OnChanges, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { BusinessDatePipe } from '../../core/localization/business-format';
import { categoryLabel, retrospectiveBadge } from '../performance/performance-labels';
import { EvidenceStrengthBadge } from './evidence-strength';
import {
  IntelligenceApi,
  WorkPackageEvidence,
  intelligenceProblemMessage,
} from './intelligence.api';
import { rate } from './intelligence-labels';

export interface EvidenceCandidate {
  readonly subcontractorId: string;
  readonly code: string;
  readonly legalName: string;
}

/**
 * Next-project evidence while sourcing (Part 12, ADR-078): each candidate's own history in this work package's category — completed
 * projects, evidence strength, response reliability, similar projects — read in one request. It informs people; it never shortlists,
 * ranks or excludes anyone.
 */
@Component({
  selector: 'app-candidate-evidence',
  imports: [RouterLink, BusinessDatePipe, EvidenceStrengthBadge],
  templateUrl: './candidate-evidence.html',
  styleUrl: './candidate-evidence.scss',
})
export class CandidateEvidenceView implements OnChanges {
  private readonly api = inject(IntelligenceApi);
  readonly workPackageId = input.required<string>();
  readonly candidates = input.required<readonly EvidenceCandidate[]>();
  readonly evidence = signal<WorkPackageEvidence | null>(null);
  readonly loading = signal(false);
  readonly error = signal('');
  readonly rate = rate;
  readonly categoryLabel = categoryLabel;
  readonly retrospectiveBadge = retrospectiveBadge();
  readonly responsesDefinition = $localize`:@@intel.responsesDefinition:A valid invitation was issued, not withdrawn by the buyer or cancelled while bidding was open, and its bidding has closed. The rate counts submissions only, so a decline lowers it like no response.`;
  private requested = '';

  ngOnChanges(): void {
    const key = `${this.workPackageId()}|${this.candidates()
      .map((item) => item.subcontractorId)
      .join(',')}`;
    if (key === this.requested) return;
    this.requested = key;
    this.load();
  }

  load(): void {
    if (this.candidates().length === 0) {
      this.evidence.set(null);
      return;
    }
    this.loading.set(true);
    this.error.set('');
    this.api
      .candidates(
        this.workPackageId(),
        this.candidates().map((item) => item.subcontractorId),
      )
      .subscribe({
        next: (evidence) => {
          this.evidence.set(evidence);
          this.loading.set(false);
        },
        error: (error: unknown) => {
          this.error.set(intelligenceProblemMessage(error));
          this.loading.set(false);
        },
      });
  }

  of(subcontractorId: string) {
    return (
      this.evidence()?.candidates.find((item) => item.subcontractorId === subcontractorId) ?? null
    );
  }
}
