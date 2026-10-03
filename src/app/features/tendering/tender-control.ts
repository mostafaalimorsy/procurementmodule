import { VerificationDetails } from '../../shared/ui/verification-details';
import { HttpErrorResponse } from '@angular/common/http';
import {
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { EntitlementsService } from '../../core/auth/entitlements.service';
import { NotInPlan } from '../../shared/ui/not-in-plan';
import { SessionService } from '../../core/auth/session.service';
import { BusinessDatePipe } from '../../core/localization/business-format';
import {
  declineReasonLabel,
  deliveryStatusLabel,
  invitationStatusLabel,
  mailFailureLabel,
  reminderSkipLabel,
  reminderStatusLabel,
  subcontractorStatusLabel,
  tenderTypeLabel,
} from '../../core/localization/labels';
import { LocaleService } from '../../core/localization/locale.service';
import { ConfirmDialog } from '../../shared/ui/confirm-dialog';
import { requestKey } from '../../shared/util/request-key';
import { InvitationDialog } from './invitation-dialog';
import { TenderAddenda } from './tender-addenda';
import { TenderClarifications } from './tender-clarifications';
import { OutsideBidsPanel } from './outside-bids';
import {
  REASON_MAX,
  REASON_MIN,
  ShortlistMember,
  TENDER_PERMISSIONS,
  TenderBids,
  TenderClosureCounts,
  TenderDetail,
  TenderInvitation,
  TenderingApi,
  describeLocal,
  fileSize,
  isStale,
  tenderProblemMessage,
} from './tendering.api';

/** While emails are queued the screen refreshes itself this often, and for at most this many times. */
const POLL_MS = 4000;
const POLL_LIMIT = 30;

/**
 * The Tender Control Center: what the tender is, where its deadline stands, and for every invited firm who it
 * was addressed to, what the mail server did with the emails, whether the link was opened and what the firm
 * answered. Dense data lives in a table; every invitation opens a dialog with its history and actions.
 */
@Component({
  selector: 'app-tender-control',
  imports: [
    VerificationDetails,
    FormsModule,
    RouterLink,
    BusinessDatePipe,
    ConfirmDialog,
    InvitationDialog,
    TenderAddenda,
    TenderClarifications,
    OutsideBidsPanel,
    NotInPlan,
  ],
  templateUrl: './tender-control.html',
  styleUrl: './tendering.scss',
})
export class TenderControl {
  private readonly api = inject(TenderingApi);
  private readonly session = inject(SessionService);
  private readonly entitlements = inject(EntitlementsService);
  readonly locale = inject(LocaleService).locale;

  readonly tender = input.required<TenderDetail>();
  readonly changed = output<TenderDetail>();
  readonly announce = output<string>();
  readonly reloadRequested = output<string>();

  readonly statusLabel = invitationStatusLabel;
  readonly deliveryLabel = deliveryStatusLabel;
  readonly failureLabel = mailFailureLabel;
  readonly declineLabel = declineReasonLabel;
  readonly standingLabel = subcontractorStatusLabel;
  readonly reminderLabel = reminderStatusLabel;
  readonly skipLabel = reminderSkipLabel;
  readonly typeLabel = tenderTypeLabel;
  readonly reasonMin = REASON_MIN;
  readonly reasonMax = REASON_MAX;
  readonly size = (bytes: number) => fileSize(bytes, this.locale);

  /** Received bids as receipts, loaded for a published or cancelled tender and refreshed with it. */
  readonly bids = signal<TenderBids | null>(null);
  readonly bidsError = signal('');
  private bidsFor = '';

  /** The invitation open in the dialog, always the current row (polls and actions refresh it). */
  readonly selectedId = signal<string | null>(null);
  readonly selected = computed(
    () =>
      this.tender().invitations.find((invitation) => invitation.id === this.selectedId()) ?? null,
  );
  readonly cancelling = signal(false);
  readonly busy = signal(false);
  readonly dialogError = signal('');
  readonly error = signal('');
  cancelReason = '';
  /** Part 9: the early-close dialog, open with the counts the buyer is confirming. */
  readonly closingEarly = signal<TenderClosureCounts | null>(null);
  readonly closeError = signal<'' | 'reason' | 'confirm'>('');
  closeReason = '';
  closeAcknowledged = false;
  private closeKey = '';
  inviteMember = '';
  inviteContact = '';
  /** Automatic refreshing gave up (limit reached or an error): the screen says so and offers a manual check. */
  readonly pollStopped = signal(false);
  private polls = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;

  readonly open = computed(
    () => this.tender().status === 'Published' && this.tender().deadlineState !== 'Closed',
  );
  readonly canManage = computed(() => this.session.hasPermission(TENDER_PERMISSIONS.invitations));
  readonly canCancel = computed(
    () =>
      this.session.hasPermission(TENDER_PERMISSIONS.cancel) &&
      this.tender().status === 'Published' &&
      !this.tender().awardedAtUtc,
  );
  /** CF-060 (ADR-137): on a plan without award, an opened tender ends here once its evaluation is complete (the server checks that). */
  readonly canCloseWithoutAward = computed(
    () =>
      this.canCancel() &&
      !!this.tender().closure?.bidsOpenedAtUtc &&
      this.entitlements.features() !== null &&
      !this.entitlements.has('award'),
  );
  readonly closingWithoutAward = signal(false);
  noAwardReason = '';

  startCloseWithoutAward(): void {
    this.noAwardReason = '';
    this.dialogError.set('');
    this.closingWithoutAward.set(true);
  }

  confirmCloseWithoutAward(): void {
    if (this.busy()) return;
    if (this.noAwardReason.trim().length < REASON_MIN) {
      this.dialogError.set(
        $localize`:@@control.reasonTooShort:Explain the reason (at least ${REASON_MIN}:min: characters).`,
      );
      return;
    }
    this.busy.set(true);
    this.api
      .closeWithoutAward(this.tender().id, this.noAwardReason.trim(), this.tender().version)
      .subscribe({
        next: (tender) => {
          this.busy.set(false);
          this.closingWithoutAward.set(false);
          this.changed.emit(tender);
          this.announce.emit(
            $localize`:@@control.closedWithoutAward:Tender closed without an award. Its tender slot is free again; no bidder was emailed.`,
          );
        },
        error: (error: unknown) => {
          this.busy.set(false);
          if (isStale(error)) {
            this.closingWithoutAward.set(false);
            this.reloadRequested.emit(this.stale());
          } else this.dialogError.set(tenderProblemMessage(error));
        },
      });
  }

  /** Part 9: an open published tender may be closed before its deadline by procurement leadership. */
  private readonly mayCloseEarly = computed(
    () =>
      this.session.hasPermission(TENDER_PERMISSIONS.closeEarly) &&
      this.tender().status === 'Published' &&
      !this.tender().closure &&
      this.tender().deadlineState !== 'Closed',
  );
  /** Closing early proceeds with the bids already submitted, so it needs at least one (the server refuses otherwise). */
  readonly canCloseEarly = computed(
    () => this.mayCloseEarly() && (this.tender().closureCounts?.submitted ?? 0) > 0,
  );
  readonly closeEarlyNeedsBid = computed(() => this.mayCloseEarly() && !this.canCloseEarly());
  /** The evaluation workspace is offered when the plan includes it and the user may follow evaluations. */
  readonly evaluationAvailable = computed(
    () => this.entitlements.has('evaluation') && this.session.hasPermission('Evaluation.View'),
  );
  /** Part 10: negotiation rounds and the decision, once the bids are opened and the plan includes awards. */
  readonly awardAvailable = computed(
    () =>
      this.entitlements.has('award') &&
      this.entitlements.has('evaluation') &&
      (this.negotiationAvailable() || this.decisionAvailable()) &&
      (!!this.tender().closure?.bidsOpenedAtUtc || !!this.tender().awardedAtUtc),
  );
  readonly negotiationAvailable = computed(() => this.session.hasPermission('Evaluation.View'));
  readonly decisionAvailable = computed(() => this.session.hasPermission('Decision.View'));
  /** CF-009: the closeout of the award in force, on a plan with performance, for its readers. */
  readonly closeoutAvailable = computed(
    () => this.entitlements.has('performance') && this.session.hasPermission('Performance.View'),
  );
  /** CF-105: the next stage this reader could use but the plan does not include — named where its section would be. */
  readonly evaluationNotInPlan = computed(
    () =>
      this.tender().status !== 'Draft' &&
      this.session.hasPermission('Evaluation.View') &&
      this.entitlements.missing(['evaluation']) !== null,
  );
  readonly awardNotInPlan = computed(
    () =>
      !!this.tender().closure?.bidsOpenedAtUtc &&
      (this.negotiationAvailable() || this.decisionAvailable()) &&
      this.entitlements.missing(['evaluation']) === null &&
      this.entitlements.missing(['award']) !== null,
  );
  readonly closeoutNotInPlan = computed(
    () =>
      !!this.tender().awardId &&
      this.session.hasPermission('Performance.View') &&
      this.entitlements.missing(['performance']) !== null,
  );
  /** Firms on the approved shortlist in force that are not invited yet, and could be invited now. */
  readonly invitable = computed<readonly ShortlistMember[]>(() =>
    (this.tender().approvedShortlist?.members ?? []).filter(
      (member) =>
        !member.alreadyInvited &&
        member.currentStanding === 'Active' &&
        member.contacts.some((contact) => !!contact.email),
    ),
  );
  /** What needs a person now, stated plainly. */
  readonly attention = computed(() => {
    const tender = this.tender();
    const items: string[] = [];
    if (tender.counts.failed > 0)
      items.push(
        $localize`:@@control.attentionFailed:Failed emails: ${tender.counts.failed}:count:. Open each invitation to see why, then resend.`,
      );
    if (tender.counts.queued > 0)
      items.push(
        this.pollStopped()
          ? $localize`:@@control.attentionQueuedStopped:Emails waiting to be sent: ${tender.counts.queued}:count:. Check again to see the latest status.`
          : $localize`:@@control.attentionQueued:Emails waiting to be sent: ${tender.counts.queued}:count:. This page refreshes on its own.`,
      );
    if (tender.deadlineState === 'ClosingSoon' && tender.counts.noResponse > 0)
      items.push(
        $localize`:@@control.attentionNoResponse:Invitees without an answer: ${tender.counts.noResponse}:count:, and the deadline is close. Consider a reminder.`,
      );
    return items;
  });

  constructor() {
    // Emails go out in the background; while some are still queued, look again shortly.
    effect(() => {
      const queued = this.tender().counts.queued;
      untracked(() => this.schedulePoll(queued));
    });
    inject(DestroyRef).onDestroy(() => this.clearPoll());
    // Receipts follow the tender: reload whenever the tender the screen shows has changed.
    effect(() => {
      const tender = this.tender();
      // Receipts change when a bid is started or submitted, the tender changes status, or an addendum revises it.
      const key = `${tender.id}:${tender.status}:${tender.counts.bidSubmitted ?? 0}:${tender.counts.bidStarted ?? 0}:${tender.currentRevision}`;
      if (tender.status === 'Draft' || key === this.bidsFor) return;
      this.bidsFor = key;
      untracked(() => this.loadBids(tender.id));
    });
  }

  loadBids(id: string): void {
    this.api.bids(id).subscribe({
      next: (bids) => {
        this.bids.set(bids);
        this.bidsError.set('');
      },
      error: (error: unknown) => this.bidsError.set(tenderProblemMessage(error)),
    });
  }

  deadlineShown(): string {
    return describeLocal(this.tender().submissionDeadline, this.tender().timeZoneId, this.locale);
  }

  questionsShown(): string {
    return describeLocal(this.tender().questionsDeadline, this.tender().timeZoneId, this.locale);
  }

  documentUrl(documentId: string): string {
    return this.api.documentUrl(this.tender().id, documentId);
  }

  inviteContacts() {
    return (
      this.invitable()
        .find((member) => member.subcontractorId === this.inviteMember)
        ?.contacts.filter((contact) => !!contact.email) ?? []
    );
  }

  pickMember(subcontractorId: string): void {
    this.inviteMember = subcontractorId;
    this.inviteContact = this.inviteContacts()[0]?.contactId ?? '';
  }

  inviteAnother(): void {
    if (!this.inviteMember || !this.inviteContact || this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    this.api
      .invite(this.tender().id, this.inviteMember, this.inviteContact, this.tender().version)
      .subscribe({
        next: (tender) => {
          this.busy.set(false);
          this.inviteMember = '';
          this.inviteContact = '';
          this.changed.emit(tender);
          this.announce.emit(
            $localize`:@@control.invited:Invitation issued. The email is being sent.`,
          );
        },
        error: (error: unknown) => {
          this.busy.set(false);
          if (isStale(error)) this.reloadRequested.emit(this.stale());
          else this.error.set(tenderProblemMessage(error));
        },
      });
  }

  select(invitation: TenderInvitation): void {
    this.selectedId.set(invitation.id);
  }

  /** The dialog changed an invitation: take the refreshed tender; the dialog follows the same firm. */
  updated(tender: TenderDetail): void {
    this.changed.emit(tender);
  }

  startCancel(): void {
    this.cancelReason = '';
    this.dialogError.set('');
    this.cancelling.set(true);
  }

  confirmCancel(): void {
    if (this.busy()) return;
    if (this.cancelReason.trim().length < REASON_MIN) {
      this.dialogError.set(
        $localize`:@@control.reasonTooShort:Explain the reason (at least ${REASON_MIN}:min: characters).`,
      );
      return;
    }
    this.busy.set(true);
    this.api.cancel(this.tender().id, this.cancelReason.trim(), this.tender().version).subscribe({
      next: (tender) => {
        this.busy.set(false);
        this.cancelling.set(false);
        this.changed.emit(tender);
        this.announce.emit(
          $localize`:@@control.cancelled:Tender cancelled. Reminders stopped and queued emails were withdrawn.`,
        );
      },
      error: (error: unknown) => {
        this.busy.set(false);
        if (isStale(error)) {
          this.cancelling.set(false);
          this.reloadRequested.emit(this.stale());
        } else this.dialogError.set(tenderProblemMessage(error));
      },
    });
  }

  closedAtShown(): string {
    return describeLocal(
      this.tender().closure?.closedAt ?? null,
      this.tender().timeZoneId,
      this.locale,
    );
  }

  scheduledShown(): string {
    return describeLocal(
      this.tender().closure?.scheduledDeadline ?? null,
      this.tender().timeZoneId,
      this.locale,
    );
  }

  startCloseEarly(): void {
    const counts = this.tender().closureCounts;
    if (!counts) return;
    this.closeReason = '';
    this.closeAcknowledged = false;
    this.closeKey = requestKey();
    this.closeError.set('');
    this.dialogError.set('');
    this.closingEarly.set(counts);
  }

  clearCloseError(): void {
    this.closeError.set('');
    this.dialogError.set('');
  }

  confirmCloseEarly(): void {
    const counts = this.closingEarly();
    if (this.busy() || !counts) return;
    if (this.closeReason.trim().length < REASON_MIN) {
      this.closeError.set('reason');
      this.dialogError.set(
        $localize`:@@control.reasonTooShort:Explain the reason (at least ${REASON_MIN}:min: characters).`,
      );
      return;
    }
    if (!this.closeAcknowledged) {
      this.closeError.set('confirm');
      this.dialogError.set(
        $localize`:@@control.closeEarlyConfirmRequired:Tick the box to confirm that firms can no longer submit.`,
      );
      return;
    }
    this.busy.set(true);
    this.api
      .closeEarly(
        this.tender().id,
        this.closeReason.trim(),
        counts.notSubmitted,
        this.closeKey,
        this.tender().version,
      )
      .subscribe({
        next: (tender) => {
          this.busy.set(false);
          this.closingEarly.set(null);
          this.changed.emit(tender);
          this.announce.emit(
            $localize`:@@control.closedEarly:Tender closed. Firms can no longer submit, and each invited firm is being told.`,
          );
        },
        error: (error: unknown) => {
          this.busy.set(false);
          const code =
            error instanceof HttpErrorResponse && typeof error.error === 'object'
              ? error.error?.code
              : null;
          if (code === 'tender.close_counts_changed') {
            // The warning the buyer read is no longer true: show the fresh numbers and ask again.
            this.api.get(this.tender().id).subscribe({
              next: (tender) => {
                this.changed.emit(tender);
                if (tender.closureCounts && !tender.closure)
                  this.closingEarly.set(tender.closureCounts);
                else {
                  // Closed meanwhile (by a colleague or the deadline): the dialog goes and the page says what happened.
                  this.closingEarly.set(null);
                  this.reloadRequested.emit(this.stale());
                }
              },
              // The fresh numbers could not be read: the dialog stays, and confirming again is refused until they match.
              error: (refresh: unknown) => this.dialogError.set(tenderProblemMessage(refresh)),
            });
            this.closeAcknowledged = false;
            this.dialogError.set(tenderProblemMessage(error));
          } else if (isStale(error)) {
            this.closingEarly.set(null);
            this.reloadRequested.emit(this.stale());
          } else this.dialogError.set(tenderProblemMessage(error));
        },
      });
  }

  /** A label for the email column that says what is actually known. */
  emailState(invitation: TenderInvitation): string {
    if (invitation.status === 'Prepared') return this.statusLabel('Prepared');
    return this.deliveryLabel(invitation.deliveryStatus);
  }

  responseState(invitation: TenderInvitation): string {
    const closure = this.tender().closure;
    // Part 9: a closed tender states each firm's final position; nobody is shown as submitted who did not submit.
    if (invitation.expired)
      return closure?.kind === 'Early'
        ? $localize`:@@control.noResponseClosedEarly:No response (tender closed early)`
        : $localize`:@@control.noResponseExpired:No response (deadline passed)`;
    if (closure && invitation.status === 'BidStarted')
      return $localize`:@@control.draftNotSubmitted:Started, not submitted (tender closed)`;
    return this.statusLabel(invitation.status);
  }

  /** A manual refresh after automatic refreshing stopped; it also restarts the automatic checks. */
  checkAgain(): void {
    this.polls = 0;
    this.pollStopped.set(false);
    this.api.get(this.tender().id).subscribe({
      next: (tender) => this.changed.emit(tender),
      error: () => this.pollStopped.set(true),
    });
  }

  private schedulePoll(queued: number): void {
    this.clearPoll();
    if (queued === 0) {
      this.polls = 0;
      this.pollStopped.set(false);
      return;
    }
    if (this.polls >= POLL_LIMIT) {
      this.pollStopped.set(true);
      return;
    }
    this.timer = setTimeout(() => {
      this.polls++;
      this.api.get(this.tender().id).subscribe({
        next: (tender) => this.changed.emit(tender),
        error: () => this.pollStopped.set(true),
      });
    }, POLL_MS);
  }

  private clearPoll(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  private stale(): string {
    return $localize`:@@tenderBuilder.stale:Someone else changed this tender. The latest version is shown; check it and try again.`;
  }
}
