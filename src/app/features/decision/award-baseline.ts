import { VerificationDetails } from '../../shared/ui/verification-details';
import { NgTemplateOutlet } from '@angular/common';
import { Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { EntitlementsService } from '../../core/auth/entitlements.service';
import { SessionService } from '../../core/auth/session.service';
import { BusinessDatePipe, ZonedInstantPipe } from '../../core/localization/business-format';
import { LocaleService } from '../../core/localization/locale.service';
import { money } from '../evaluation/evaluation-format';
import { PERFORMANCE_FEATURES, PERFORMANCE_PERMISSIONS } from '../performance/performance.api';
import { Award } from './decision.api';
import {
  comparisonValue,
  competitionJustificationLabel,
  dispositionLabel,
  revisionKindLabel,
  validityBasisLabel,
  validityChannelLabel,
} from './decision-labels';
import { CriteriaFlag } from './criteria-flag';
import { ShortlistBasisNote } from './shortlist-basis';

/**
 * The immutable award baseline (Part 10): exactly what was awarded — the firm's bid revision, value, lines, exclusions and
 * deviations, and the decision behind it — as frozen at award, with its fingerprint checked on every read. It is the promise
 * later execution is compared with; nothing on this screen can change it. Beside it (never inside the fingerprint) the governance
 * context of the decision it issued from (red-team B4): approved without independent approval, limited competition, over budget, the
 * bid's validity in the tender's zone and any recorded extension, and a fast-path shortlist (G073).
 */
@Component({
  selector: 'app-award-baseline',
  imports: [
    VerificationDetails,
    NgTemplateOutlet,
    BusinessDatePipe,
    ZonedInstantPipe,
    RouterLink,
    CriteriaFlag,
    ShortlistBasisNote,
  ],
  styleUrl: './award-baseline.scss',
  templateUrl: './award-baseline.html',
})
export class AwardBaselineView {
  readonly locale = inject(LocaleService).locale;
  readonly award = input.required<Award>();
  /** Red-team G050: the tender's time zone, in which the bid's valid-until is shown (UTC when unknown). */
  readonly timeZoneId = input<string | null | undefined>(null);
  readonly kindLabel = revisionKindLabel;
  readonly value = comparisonValue;
  readonly dispositionLabel = dispositionLabel;
  readonly justificationLabel = competitionJustificationLabel;
  readonly basisLabel = validityBasisLabel;
  readonly channelLabel = validityChannelLabel;
  private readonly session = inject(SessionService);
  private readonly entitlements = inject(EntitlementsService);
  /** Part 11: the award's performance closeout, where the actual outcome is compared with this baseline. */
  readonly showCloseout = computed(
    () =>
      this.session.hasPermission(PERFORMANCE_PERMISSIONS.view) &&
      PERFORMANCE_FEATURES.every((feature) => this.entitlements.has(feature)),
  );

  money(amount: string | null | undefined): string {
    return money(amount, this.locale);
  }
}
