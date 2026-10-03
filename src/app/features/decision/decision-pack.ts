import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { BusinessDatePipe } from '../../core/localization/business-format';
import { LocaleService } from '../../core/localization/locale.service';
import { money } from '../evaluation/evaluation-format';
import { CriteriaFlag } from './criteria-flag';
import { ShortlistBasisNote } from './shortlist-basis';
import { DecisionApi, DecisionPack, PackState, decisionProblemMessage } from './decision.api';
import {
  approvalActionLabel,
  approverRoleLabel,
  candidateFlagLabel,
  dispositionLabel,
  outcomeLabel,
} from './decision-labels';

/**
 * CF-003 (ADR-109): the decision / award pack — the tender file of record, printed from the browser. It shows only what the reader may see
 * (the server builds it from the same field-class-aware workspace), names who generated it and the evidence fingerprints, and carries a
 * watermark until the decision is approved.
 */
@Component({
  selector: 'app-decision-pack',
  imports: [RouterLink, BusinessDatePipe, CriteriaFlag, ShortlistBasisNote],
  templateUrl: './decision-pack.html',
  styleUrl: './decision-pack.scss',
})
export class DecisionPackPage implements OnInit {
  private readonly api = inject(DecisionApi);
  private readonly route = inject(ActivatedRoute);
  readonly locale = inject(LocaleService).locale;
  readonly tenderId = this.route.snapshot.paramMap.get('id') ?? '';
  readonly pack = signal<DecisionPack | null>(null);
  readonly error = signal('');
  readonly roleLabel = approverRoleLabel;
  readonly actionLabel = approvalActionLabel;
  readonly flagLabel = candidateFlagLabel;
  readonly dispositionLabel = dispositionLabel;
  readonly outcomeLabel = outcomeLabel;

  ngOnInit(): void {
    this.api.pack(this.tenderId).subscribe({
      next: (pack) => this.pack.set(pack),
      error: (error: unknown) => this.error.set(decisionProblemMessage(error)),
    });
  }

  money(amount: string | null | undefined, currency: string): string {
    return amount ? `${money(amount, this.locale)} ${currency}` : '—';
  }

  watermark(state: PackState): string | null {
    switch (state) {
      case 'Approved':
      case 'Awarded':
        return null;
      case 'PendingApproval':
        return $localize`:@@pack.watermarkPending:Pending approval — not approved`;
      case 'Returned':
        return $localize`:@@pack.watermarkReturned:Returned for changes — not approved`;
      case 'Draft':
        return $localize`:@@pack.watermarkDraft:Draft — not approved`;
      default:
        return $localize`:@@pack.watermarkNoDecision:No decision yet — not approved`;
    }
  }

  stateLabel(state: PackState): string {
    switch (state) {
      case 'Awarded':
        return $localize`:@@pack.stateAwarded:Awarded`;
      case 'Approved':
        return $localize`:@@pack.stateApproved:Approved, not yet awarded`;
      default:
        return this.watermark(state) ?? '';
    }
  }

  print(): void {
    window.print();
  }
}
