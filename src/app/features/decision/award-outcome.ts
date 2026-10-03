import { VerificationDetails } from '../../shared/ui/verification-details';
import { Component, computed, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { BusinessDatePipe } from '../../core/localization/business-format';
import { attemptStatusLabel, deliveryKindLabel } from '../../core/localization/labels';
import { requestKey } from '../../shared/util/request-key';
import { REASON_MIN, isStale } from '../tendering/tendering.api';
import {
  AWARD_DECLINE_REASONS,
  AWARD_WITHDRAWAL_REASONS,
  AwardDeclineReason,
  AwardWithdrawal,
  AwardWithdrawalReason,
  DecisionApi,
  DecisionWorkspace,
  decisionProblemMessage,
} from './decision.api';
import { awardStateLabel, declineReasonLabel, withdrawalReasonLabel } from './decision-labels';

type Form =
  'accept' | 'decline' | 'withdraw' | 'reject' | 'retender' | 'notices' | 'reserves' | null;

/**
 * CF-046 (ADR-110, OD-18): what follows an issued award — the subcontractor's answer recorded with its evidence, a withdrawal that someone else
 * approves, and, once the award is no longer in force, a fresh governed decision for another bid or closing the tender to re-tender.
 * CF-047 / CF-131 (ADR-111): each firm's outcome notice and where it stands; held "not selected" notices released early and reserves told.
 */
@Component({
  selector: 'app-award-outcome',
  imports: [VerificationDetails, FormsModule, BusinessDatePipe],
  templateUrl: './award-outcome.html',
})
export class AwardOutcome {
  private readonly api = inject(DecisionApi);
  readonly tenderId = input.required<string>();
  readonly workspace = input.required<DecisionWorkspace>();
  readonly updated = output<DecisionWorkspace>();
  readonly announce = output<string>();
  readonly reload = output<string>();

  readonly award = computed(() => this.workspace().award!);
  readonly pending = computed(
    () => (this.award().withdrawals ?? []).find((item) => item.status === 'Pending') ?? null,
  );
  readonly stateLabel = awardStateLabel;
  readonly declineLabel = declineReasonLabel;
  readonly withdrawalLabel = withdrawalReasonLabel;
  readonly kindLabel = deliveryKindLabel;
  readonly noticeStatusLabel = attemptStatusLabel;
  readonly declineReasons = AWARD_DECLINE_REASONS;
  readonly withdrawalReasons = AWARD_WITHDRAWAL_REASONS;
  readonly busy = signal(false);
  readonly error = signal('');
  readonly form = signal<Form>(null);

  respondedOn = new Date().toISOString().slice(0, 10);
  evidence = '';
  declineReason: AwardDeclineReason | '' = '';
  withdrawalReason: AwardWithdrawalReason | '' = '';
  text = '';
  private key: string | null = null;

  open(form: Form): void {
    this.form.set(form);
    this.text = '';
    this.evidence = '';
    this.error.set('');
    this.key = requestKey();
  }

  submit(): void {
    if (this.busy()) return;
    const form = this.form();
    const reasonNeeded =
      form === 'decline' || form === 'withdraw' || form === 'reject' || form === 'retender';
    if (reasonNeeded && this.text.trim().length < REASON_MIN) {
      this.error.set(
        $localize`:@@control.reasonTooShort:Explain the reason (at least ${REASON_MIN}:min: characters).`,
      );
      return;
    }
    if ((form === 'accept' || form === 'decline') && !this.evidence.trim()) {
      this.error.set(
        $localize`:@@awardOutcome.evidenceRequired:Enter the reference of the answer's evidence (the countersigned letter, the email).`,
      );
      return;
    }
    if (form === 'decline' && !this.declineReason) {
      this.error.set(
        $localize`:@@awardOutcome.declineReasonRequired:Choose why the subcontractor declined.`,
      );
      return;
    }
    if (form === 'withdraw' && !this.withdrawalReason) {
      this.error.set(
        $localize`:@@awardOutcome.withdrawalReasonRequired:Choose why the award is withdrawn.`,
      );
      return;
    }
    this.busy.set(true);
    this.error.set('');
    const tenderId = this.tenderId();
    const key = this.key ?? requestKey();
    const pending = this.pending();
    const done = (message: string) => (view: DecisionWorkspace) => {
      this.busy.set(false);
      this.form.set(null);
      this.key = null;
      this.updated.emit(view);
      this.announce.emit(message);
    };
    const failed = (error: unknown) => {
      this.busy.set(false);
      if (isStale(error)) this.reload.emit('');
      else this.error.set(decisionProblemMessage(error));
    };
    switch (form) {
      case 'accept':
      case 'decline':
        this.api
          .recordAwardResponse(
            tenderId,
            {
              outcome: form === 'accept' ? 'Accepted' : 'Declined',
              respondedOn: this.respondedOn,
              evidenceReference: this.evidence.trim(),
              reasonCategory:
                form === 'decline' ? (this.declineReason as AwardDeclineReason) : null,
              reason: form === 'decline' ? this.text.trim() : null,
            },
            key,
          )
          .subscribe({
            next: done(
              form === 'accept'
                ? $localize`:@@awardOutcome.accepted:Recorded: the subcontractor accepted the award.`
                : $localize`:@@awardOutcome.declined:Recorded: the subcontractor declined. Prepare a new decision for another bid, or close the tender to re-tender.`,
            ),
            error: failed,
          });
        break;
      case 'withdraw':
        this.api
          .requestAwardWithdrawal(
            tenderId,
            this.withdrawalReason as AwardWithdrawalReason,
            this.text.trim(),
            key,
          )
          .subscribe({
            next: done(
              $localize`:@@awardOutcome.withdrawalRequested:Withdrawal requested. It takes effect once another approver approves it.`,
            ),
            error: failed,
          });
        break;
      case 'reject':
        if (pending) this.decide(pending, false, done, failed);
        break;
      case 'notices':
        this.api.releaseAwardNotices(tenderId).subscribe({
          next: done(
            $localize`:@@awardOutcome.noticesReleased:The held "not selected" notices are being sent.`,
          ),
          error: failed,
        });
        break;
      case 'reserves':
        this.api.releaseAwardReserves(tenderId).subscribe({
          next: done(
            $localize`:@@awardOutcome.reservesReleased:The reserve bids are being told they were not selected.`,
          ),
          error: failed,
        });
        break;
      case 'retender':
        this.api.closeForRetender(tenderId, this.text.trim()).subscribe({
          next: () => {
            this.busy.set(false);
            this.form.set(null);
            this.reload.emit(
              $localize`:@@awardOutcome.closed:The tender is closed. Its work package can be tendered again.`,
            );
          },
          error: failed,
        });
        break;
    }
  }

  approve(): void {
    const pending = this.pending();
    if (this.busy() || !pending) return;
    this.busy.set(true);
    this.decide(
      pending,
      true,
      (message) => (view) => {
        this.busy.set(false);
        this.updated.emit(view);
        this.announce.emit(message);
      },
      (error) => {
        this.busy.set(false);
        this.error.set(decisionProblemMessage(error));
      },
    );
  }

  private decide(
    withdrawal: AwardWithdrawal,
    approve: boolean,
    done: (message: string) => (view: DecisionWorkspace) => void,
    failed: (error: unknown) => void,
  ): void {
    this.api
      .decideAwardWithdrawal(
        this.tenderId(),
        withdrawal.id,
        approve,
        approve ? null : this.text.trim(),
        withdrawal.version,
      )
      .subscribe({
        next: done(
          approve
            ? $localize`:@@awardOutcome.withdrawn:Award withdrawn. Prepare a new decision for another bid, or close the tender to re-tender.`
            : $localize`:@@awardOutcome.withdrawalRejected:Withdrawal rejected. The award stays in force.`,
        ),
        error: failed,
      });
  }
}
