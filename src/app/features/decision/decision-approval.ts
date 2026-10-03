import { RouterLink } from '@angular/router';
import { Component, computed, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SessionService } from '../../core/auth/session.service';
import { BusinessDatePipe, ZonedInstantPipe } from '../../core/localization/business-format';
import { LocaleService } from '../../core/localization/locale.service';
import { ConfirmDialog } from '../../shared/ui/confirm-dialog';
import { money } from '../evaluation/evaluation-format';
import { isStale } from '../tendering/tendering.api';
import {
  DECISION_COMMENT_MAX,
  DECISION_REASON_MAX,
  DECISION_REASON_MIN,
  DecisionApi,
  DecisionSubmission,
  DecisionWorkspace,
  OutcomeNoticeTiming,
  VALIDITY_CHANNELS,
  VALIDITY_REFERENCE_MAX,
  ValidityConfirmationChannel,
  decisionProblemMessage,
  readsApprovalRoutes,
} from './decision.api';
import {
  approvalActionLabel,
  approvalBlockerLabel,
  approverRoleLabel,
  competitionJustificationLabel,
  dispositionLabel,
  outcomeLabel,
  validityChannelLabel,
} from './decision-labels';
import { RequestKeys } from './request-keys';
import { ShortlistBasisNote } from './shortlist-basis';
import { CriteriaFlag } from './criteria-flag';

type ApprovalDialog = 'Approve' | 'Return' | 'Reject' | 'withdraw' | 'award';

/**
 * Approval and award (Part 10). The version awaiting approval, exactly as submitted: the recommendation it relies on and
 * the proposed firm (with any override and its reason), the value, the other bids' outcomes and the route with who has
 * approved each step. Approvers approve, return it for changes or reject the proposal — each with its own wording, never
 * confused with a bid "not selected". Only a fully approved decision can be awarded, in a separate confirmed act whose
 * request key is kept for retries so a lost answer never awards twice. A proposed bid whose validity lapsed is awarded
 * only with the bidder's recorded extension (CF-039): until when, how it was confirmed and its reference.
 */
@Component({
  selector: 'app-decision-approval',
  imports: [
    FormsModule,
    BusinessDatePipe,
    ZonedInstantPipe,
    ConfirmDialog,
    RouterLink,
    CriteriaFlag,
    ShortlistBasisNote,
  ],
  templateUrl: './decision-approval.html',
  styleUrl: './decision-approval.scss',
})
export class DecisionApproval {
  private readonly api = inject(DecisionApi);
  /** Request keys live with the decision page, so a retry after a tab switch repeats the same request. */
  private readonly keys = inject(RequestKeys);
  readonly locale = inject(LocaleService).locale;
  /** CF-136: the approval routes page is open to approvers and submitters (the route guard decides again). */
  readonly readsRules = readsApprovalRoutes(inject(SessionService));
  readonly tenderId = input.required<string>();
  readonly workspace = input.required<DecisionWorkspace>();
  readonly updated = output<DecisionWorkspace>();
  readonly announce = output<string>();
  readonly reload = output<string>();

  readonly actionLabel = approvalActionLabel;
  readonly blockerLabel = approvalBlockerLabel;
  readonly roleLabel = approverRoleLabel;
  readonly dispositionLabel = dispositionLabel;
  readonly outcomeLabel = outcomeLabel;
  readonly commentMax = DECISION_COMMENT_MAX;
  readonly reasonMax = DECISION_REASON_MAX;
  readonly justificationLabel = competitionJustificationLabel;
  readonly channelLabel = validityChannelLabel;
  readonly channels = VALIDITY_CHANNELS;
  readonly referenceMax = VALIDITY_REFERENCE_MAX;

  readonly dialog = signal<ApprovalDialog | null>(null);
  readonly busy = signal(false);
  readonly dialogError = signal('');
  /** Which field the last refusal on this device was about, so it can be marked invalid. */
  readonly commentInvalid = signal(false);
  comment = '';
  awardConfirmed = false;
  extension: { until: string; channel: ValidityConfirmationChannel | ''; reference: string } = {
    until: '',
    channel: '',
    reference: '',
  };
  /** CF-047 / CF-131 (ADR-111): '' keeps the company's notice timing; the reserves told now that they are held in reserve. */
  noticeTiming: OutcomeNoticeTiming | '' = '';
  readonly notifyReserves = signal<ReadonlySet<string>>(new Set());

  readonly submission = computed(() => this.workspace().currentSubmission);
  readonly earlier = computed(() =>
    this.workspace().submissions.filter((item) => item.id !== this.submission()?.id),
  );
  readonly pending = computed(() => this.workspace().status === 'PendingApproval');
  readonly fresh = computed(() => {
    const state = this.workspace().recommendation?.liveState;
    return state === 'Ready' || state === 'InsufficientHistory';
  });
  /** Approving needs every server condition: no blocker at all (stale recommendation, role, self-approval). */
  readonly canApprove = computed(
    () => this.workspace().access.approve && this.pending() && !this.workspace().approvalBlocker,
  );
  /**
   * Returning or rejecting needs only a pending version and a comment: a stale recommendation or a missing role blocks
   * approving, not sending the decision back. Only the submitter's own version (without self-approval) cannot be acted on.
   */
  readonly canSendBack = computed(
    () =>
      this.workspace().access.approve &&
      this.pending() &&
      this.workspace().approvalBlocker !== 'self_approval',
  );
  readonly canWithdraw = computed(
    () =>
      this.workspace().access.withdraw &&
      (this.workspace().status === 'PendingApproval' || this.workspace().status === 'Approved'),
  );
  readonly approved = computed(() => this.workspace().status === 'Approved');
  /** CF-039: the proposed bid's derived validity now, as the server judged it. */
  readonly proposedValidity = computed(() => {
    const id = this.submission()?.proposedOpeningBidId;
    return this.workspace().controls?.candidates.find((row) => row.openingBidId === id) ?? null;
  });
  readonly lapsed = computed(() => this.proposedValidity()?.validityState === 'Lapsed');
  readonly reserves = computed(() =>
    (this.submission()?.dispositions ?? [])
      .filter((item) => item.disposition === 'Reserve')
      .sort((a, b) => (a.reserveRank ?? 0) - (b.reserveRank ?? 0)),
  );
  /** An approved decision on a recommendation that is no longer current cannot be awarded: it must be withdrawn. */
  readonly canAward = computed(
    () => this.workspace().access.issue && this.approved() && this.fresh(),
  );

  money(amount: string | null | undefined): string {
    return money(amount, this.locale);
  }

  start(dialog: ApprovalDialog): void {
    this.comment = '';
    this.awardConfirmed = false;
    this.extension = { until: '', channel: '', reference: '' };
    this.noticeTiming = '';
    this.notifyReserves.set(new Set());
    this.dialogError.set('');
    this.commentInvalid.set(false);
    this.dialog.set(dialog);
  }

  close(): void {
    if (this.busy()) return;
    this.dialog.set(null);
  }

  confirm(): void {
    const dialog = this.dialog();
    const version = this.workspace().decisionVersion;
    if (!dialog || !version || this.busy()) return;
    const comment = this.comment.trim();
    const scope = `${dialog}:${version}`;
    const key = this.keys.for(scope);
    if (
      (dialog === 'Return' || dialog === 'Reject' || dialog === 'withdraw') &&
      comment.length < DECISION_REASON_MIN
    ) {
      this.dialogError.set(
        $localize`:@@approval.commentRequired:Write a comment for the record (at least ${DECISION_REASON_MIN}:min: characters).`,
      );
      this.commentInvalid.set(true);
      return;
    }
    if (dialog === 'award' && this.lapsed()) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(this.extension.until) || !this.extension.channel) {
        this.dialogError.set(
          $localize`:@@award.extensionRequired:Record until when the bidder extended the validity and how they confirmed it.`,
        );
        return;
      }
    }
    if (dialog === 'award' && !this.awardConfirmed) {
      this.dialogError.set(
        $localize`:@@award.confirmRequired:Tick the confirmation to issue the award.`,
      );
      return;
    }
    this.busy.set(true);
    const id = this.tenderId();
    const request =
      dialog === 'award'
        ? this.api.issueAward(
            id,
            version,
            key,
            this.lapsed() && this.extension.channel
              ? {
                  extendedUntil: this.extension.until,
                  channel: this.extension.channel,
                  reference: this.extension.reference.trim() || null,
                }
              : null,
            {
              noticeTiming: this.noticeTiming || null,
              notifyReserves: [...this.notifyReserves()],
            },
          )
        : dialog === 'withdraw'
          ? this.api.withdrawDecision(id, comment, version, key)
          : this.api.act(id, dialog, comment || null, version, key);
    request.subscribe({
      next: (view) => {
        this.busy.set(false);
        this.dialog.set(null);
        this.keys.done(scope);
        this.updated.emit(view);
        this.announce.emit(this.doneText(dialog, view));
      },
      error: (error: unknown) => {
        this.busy.set(false);
        if (isStale(error)) {
          this.dialog.set(null);
          this.reload.emit(
            $localize`:@@decision.stale:Someone else changed this decision. The latest version is shown; check it and try again.`,
          );
        } else this.dialogError.set(decisionProblemMessage(error));
      },
    });
  }

  toggleReserve(openingBidId: string, on: boolean): void {
    const next = new Set(this.notifyReserves());
    if (on) next.add(openingBidId);
    else next.delete(openingBidId);
    this.notifyReserves.set(next);
  }

  approvedSteps(submission: DecisionSubmission): number {
    return submission.route.steps.filter((step) => step.approval).length;
  }

  private doneText(dialog: ApprovalDialog, view: DecisionWorkspace): string {
    switch (dialog) {
      case 'Approve':
        return view.status === 'Approved'
          ? $localize`:@@approval.approvedFinal:Approved. Every step of the route is approved; the award can now be issued.`
          : $localize`:@@approval.approvedStep:Your approval is recorded. The next step of the route follows.`;
      case 'Return':
        return $localize`:@@approval.returned:Returned for changes. The decision is a draft again.`;
      case 'Reject':
        return $localize`:@@approval.rejected:The proposal was rejected. The decision is a draft again.`;
      case 'withdraw':
        return $localize`:@@approval.withdrawn:The submission was withdrawn. The decision is a draft again.`;
      default:
        return $localize`:@@award.issued:The award was issued. Its baseline is frozen and can no longer change.`;
    }
  }
}
