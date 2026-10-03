import { DOCUMENT } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { EntitlementsService } from '../../core/auth/entitlements.service';
import { SessionService } from '../../core/auth/session.service';
import { BusinessDatePipe } from '../../core/localization/business-format';
import { attemptStatusLabel } from '../../core/localization/labels';
import { LocaleService } from '../../core/localization/locale.service';
import { ConfirmDialog } from '../../shared/ui/confirm-dialog';
import { describeLocal, isStale } from '../tendering/tendering.api';
import {
  DECISION_PERMISSIONS,
  DecisionApi,
  INSTRUCTIONS_MAX,
  NEGOTIATION_NOTE_MAX,
  NegotiationParticipant,
  NegotiationRound,
  NegotiationRoundType,
  NegotiationScope,
  NegotiationWorkspace,
  PURPOSE_MAX,
  PURPOSE_MIN,
  ROUND_SCOPES,
  ROUND_TYPES,
  decisionProblemMessage,
} from './decision.api';
import {
  candidateBlockerLabel,
  issueBlockerLabel,
  participantStatusLabel,
  roundScopeLabel,
  roundStatusLabel,
  roundTypeLabel,
} from './decision-labels';
import { RequestKeys } from './request-keys';
import { TenderStageHeader } from '../tendering/tender-stage-header';

type NegotiationDialog = 'issue' | 'close' | 'cancel' | 'withdraw' | 'replace';

interface IssueForm {
  type: NegotiationRoundType;
  scope: NegotiationScope;
  purpose: string;
  instructions: string;
  deadline: string;
  selected: Record<string, boolean>;
  confirmed: boolean;
}

/**
 * Negotiation / BAFO rounds of one opened tender (Part 10). A round is issued in one confirmed act to an explicit subset of the
 * opened firms, with instructions sent to them, an internal purpose that is never sent, and a response deadline in the
 * tender's time zone. Only one round is open at a time; closing it freezes who answered with which revision, and only then do
 * the responses become evaluation evidence. The page never ranks or selects a firm, and the server decides every action.
 */
@Component({
  selector: 'app-negotiation-page',
  imports: [TenderStageHeader, FormsModule, RouterLink, BusinessDatePipe, ConfirmDialog],
  templateUrl: './negotiation-page.html',
  styleUrl: './negotiation-page.scss',
  providers: [RequestKeys],
})
export class NegotiationPage implements OnInit {
  private readonly api = inject(DecisionApi);
  private readonly keys = inject(RequestKeys);
  private readonly route = inject(ActivatedRoute);
  private readonly document = inject(DOCUMENT);
  private readonly session = inject(SessionService);
  private readonly entitlements = inject(EntitlementsService);
  readonly locale = inject(LocaleService).locale;

  readonly types = ROUND_TYPES;
  readonly scopes = ROUND_SCOPES;
  readonly typeLabel = roundTypeLabel;
  readonly scopeLabel = roundScopeLabel;
  readonly statusLabel = roundStatusLabel;
  readonly participantLabel = participantStatusLabel;
  readonly emailLabel = attemptStatusLabel;
  readonly candidateBlocker = candidateBlockerLabel;
  readonly purposeMax = PURPOSE_MAX;
  readonly instructionsMax = INSTRUCTIONS_MAX;
  readonly noteMax = NEGOTIATION_NOTE_MAX;

  readonly tenderId = signal('');
  readonly workspace = signal<NegotiationWorkspace | null>(null);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly notice = signal('');
  readonly busy = signal(false);
  readonly dialog = signal<NegotiationDialog | null>(null);
  readonly dialogError = signal('');
  readonly target = signal<{
    round: NegotiationRound;
    participant?: NegotiationParticipant;
  } | null>(null);
  form: IssueForm = this.blankForm();
  reason = '';
  closeConfirmed = false;
  /** The field the last refusal on this device was about (marked invalid and described by the error). */
  readonly errorField = signal<'purpose' | 'instructions' | 'deadline' | 'reason' | null>(null);

  noteText = '';
  noteRound = '';
  noteBid = '';
  readonly noteError = signal('');

  readonly access = computed(() => this.workspace()?.access ?? null);
  readonly openRound = computed(
    () => this.workspace()?.rounds.find((round) => round.status === 'Open') ?? null,
  );
  readonly invitable = computed(() =>
    (this.workspace()?.candidates ?? []).filter((c) => c.invitable),
  );
  readonly blocker = computed(() => {
    const view = this.workspace();
    return view ? issueBlockerLabel(view.issueBlocker, view.issueBlockerReason) : '';
  });
  readonly readOnly = computed(
    () => !!this.workspace()?.tenderCancelled || !!this.workspace()?.tenderAwarded,
  );
  readonly decisionAvailable = computed(
    () => this.entitlements.has('award') && this.session.hasPermission(DECISION_PERMISSIONS.view),
  );
  readonly selectedCount = computed(() => {
    this.revision();
    return Object.values(this.form.selected).filter(Boolean).length;
  });
  private readonly revision = signal(0);

  ngOnInit(): void {
    this.tenderId.set(this.route.snapshot.paramMap.get('id') ?? '');
    this.load();
  }

  load(afterNotice = ''): void {
    this.loading.set(this.workspace() === null);
    this.error.set('');
    this.api.negotiation(this.tenderId()).subscribe({
      next: (view) => {
        this.workspace.set(view);
        this.loading.set(false);
        if (afterNotice) this.announce(afterNotice);
      },
      error: (error: unknown) => {
        this.error.set(decisionProblemMessage(error));
        this.loading.set(false);
      },
    });
  }

  deadlineShown(round: NegotiationRound): string {
    return describeLocal(
      round.responseDeadline,
      this.workspace()?.timeZoneId ?? 'UTC',
      this.locale,
    );
  }

  firmName(openingBidId: string | null): string {
    const candidate = this.workspace()?.candidates.find((c) => c.openingBidId === openingBidId);
    return candidate ? `${candidate.subcontractorCode} ${candidate.subcontractorName}` : '';
  }

  roundNumber(roundId: string | null): number | null {
    return this.workspace()?.rounds.find((round) => round.id === roundId)?.number ?? null;
  }

  /** Only a firm that has not answered yet may be removed; a replaced link only helps a firm still in the round. */
  canWithdraw(round: NegotiationRound, participant: NegotiationParticipant): boolean {
    return (
      !!this.access()?.manage &&
      round.status === 'Open' &&
      !this.readOnly() &&
      ['Invited', 'Started', 'Declined'].includes(participant.status)
    );
  }

  canReplace(round: NegotiationRound, participant: NegotiationParticipant): boolean {
    return (
      !!this.access()?.manage &&
      round.status === 'Open' &&
      !round.deadlinePassed &&
      !this.readOnly() &&
      participant.status !== 'Withdrawn' &&
      participant.status !== 'Submitted'
    );
  }

  // ---------------------------------------------------------------- issuing a round

  startIssue(): void {
    this.form = this.blankForm();
    for (const candidate of this.invitable()) this.form.selected[candidate.openingBidId] = true;
    this.revision.update((value) => value + 1);
    this.clearError();
    this.dialog.set('issue');
  }

  toggleCandidate(id: string, checked: boolean): void {
    this.form.selected[id] = checked;
    this.revision.update((value) => value + 1);
    this.dialogError.set('');
  }

  confirmIssue(): void {
    if (this.busy()) return;
    const problem = this.issueProblem();
    if (problem) {
      this.dialogError.set(problem.text);
      this.errorField.set(problem.field);
      return;
    }
    this.busy.set(true);
    // One key per round about to be issued, kept with the page: reopening the dialog to retry repeats the same request.
    const scope = `issue:${this.tenderId()}:round-${(this.workspace()?.rounds.length ?? 0) + 1}`;
    const ids = this.invitable()
      .map((candidate) => candidate.openingBidId)
      .filter((id) => this.form.selected[id]);
    this.api
      .issueRound(
        this.tenderId(),
        {
          type: this.form.type,
          scope: this.form.scope,
          purpose: this.form.purpose.trim(),
          instructions: this.form.instructions.trim(),
          responseDeadlineLocal: this.form.deadline,
          openingBidIds: ids,
        },
        this.keys.for(scope),
      )
      .subscribe({
        next: (view) => {
          this.keys.done(scope);
          this.done(view, this.issuedText(view));
        },
        error: (error: unknown) => this.failed(error),
      });
  }

  private issueProblem(): {
    text: string;
    field: 'purpose' | 'instructions' | 'deadline' | null;
  } | null {
    const purpose = this.form.purpose.trim();
    if (purpose.length < PURPOSE_MIN || purpose.length > PURPOSE_MAX)
      return {
        text: $localize`:@@negotiation.purposeRequired:State the internal purpose of the round (${PURPOSE_MIN}:min: to ${PURPOSE_MAX}:max: characters).`,
        field: 'purpose',
      };
    if (!this.form.instructions.trim())
      return {
        text: $localize`:@@negotiation.instructionsRequired:Write the instructions the firms receive.`,
        field: 'instructions',
      };
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(this.form.deadline))
      return {
        text: $localize`:@@negotiation.deadlineRequired:Choose the response deadline (date and time in the tender's time zone).`,
        field: 'deadline',
      };
    if (this.selectedCount() === 0)
      return {
        text: $localize`:@@negotiation.participantsRequired:Select at least one firm for the round.`,
        field: null,
      };
    if (!this.form.confirmed)
      return {
        text: $localize`:@@negotiation.confirmRequired:Tick the confirmation to issue the round.`,
        field: null,
      };
    return null;
  }

  /** Editing clears the refusal it answered. */
  clearError(): void {
    this.dialogError.set('');
    this.errorField.set(null);
  }

  private issuedText(view: NegotiationWorkspace): string {
    const round = view.rounds.at(-1);
    return $localize`:@@negotiation.issued:Round ${round?.number ?? ''}:number: was issued. Each selected firm is emailed its own round link.`;
  }

  // ---------------------------------------------------------------- round and participant actions

  startClose(round: NegotiationRound): void {
    this.open('close', { round });
  }

  startCancel(round: NegotiationRound): void {
    this.open('cancel', { round });
  }

  startWithdraw(round: NegotiationRound, participant: NegotiationParticipant): void {
    this.open('withdraw', { round, participant });
  }

  startReplace(round: NegotiationRound, participant: NegotiationParticipant): void {
    this.open('replace', { round, participant });
  }

  private open(
    dialog: NegotiationDialog,
    target: { round: NegotiationRound; participant?: NegotiationParticipant },
  ): void {
    this.reason = '';
    this.closeConfirmed = false;
    this.clearError();
    this.target.set(target);
    this.dialog.set(dialog);
  }

  confirmAction(): void {
    const target = this.target();
    const dialog = this.dialog();
    if (this.busy() || !target || !dialog) return;
    const early = dialog === 'close' && !target.round.deadlinePassed;
    const needsReason = dialog === 'cancel' || dialog === 'withdraw' || early;
    const reason = this.reason.trim();
    if (needsReason && (reason.length < PURPOSE_MIN || reason.length > PURPOSE_MAX)) {
      this.dialogError.set(
        $localize`:@@control.reasonTooShort:Explain the reason (at least ${PURPOSE_MIN}:min: characters).`,
      );
      this.errorField.set('reason');
      return;
    }
    if (early && !this.closeConfirmed) {
      this.dialogError.set(
        $localize`:@@negotiation.closeConfirmRequired:Tick the confirmation to close the round before its deadline.`,
      );
      return;
    }
    this.busy.set(true);
    const id = this.tenderId();
    const round = target.round;
    const participant = target.participant;
    const request =
      dialog === 'close'
        ? this.api.closeRound(id, round.id, early ? reason : null, round.version)
        : dialog === 'cancel'
          ? this.api.cancelRound(id, round.id, reason, round.version)
          : dialog === 'withdraw'
            ? this.api.withdrawParticipant(
                id,
                round.id,
                participant!.id,
                reason,
                participant!.version,
              )
            : this.api.replaceParticipantLink(id, round.id, participant!.id, participant!.version);
    const message =
      dialog === 'close'
        ? $localize`:@@negotiation.closed:Round ${round.number}:number: was closed. Its responses can now be taken into the evaluation.`
        : dialog === 'cancel'
          ? $localize`:@@negotiation.cancelled:Round ${round.number}:number: was cancelled. Nothing submitted in it will be evaluated.`
          : dialog === 'withdraw'
            ? $localize`:@@negotiation.withdrawn:The firm was removed from the round. Its link no longer works.`
            : $localize`:@@negotiation.replaced:A new round link was emailed to the firm. The earlier link no longer works.`;
    request.subscribe({
      next: (view) => this.done(view, message),
      error: (error: unknown) => this.failed(error),
    });
  }

  closeDialog(): void {
    if (this.busy()) return;
    this.dialog.set(null);
    this.target.set(null);
  }

  private done(view: NegotiationWorkspace, message: string): void {
    this.busy.set(false);
    this.dialog.set(null);
    this.target.set(null);
    this.workspace.set(view);
    this.announce(message);
  }

  private failed(error: unknown): void {
    this.busy.set(false);
    if (isStale(error)) {
      this.dialog.set(null);
      this.load(this.staleText());
    } else this.dialogError.set(decisionProblemMessage(error));
  }

  // ---------------------------------------------------------------- notes

  addNote(): void {
    const text = this.noteText.trim();
    if (this.busy()) return;
    if (!text) {
      this.noteError.set($localize`:@@negotiation.noteRequired:Write the note first.`);
      return;
    }
    this.busy.set(true);
    this.noteError.set('');
    this.api
      .addNegotiationNote(this.tenderId(), this.noteRound || null, this.noteBid || null, text)
      .subscribe({
        next: (note) => {
          this.busy.set(false);
          this.noteText = '';
          const view = this.workspace();
          if (view) this.workspace.set({ ...view, notes: [...view.notes, note] });
          this.announce(
            $localize`:@@negotiation.noteAdded:Note added with your name and the time.`,
          );
        },
        error: (error: unknown) => {
          this.busy.set(false);
          this.noteError.set(decisionProblemMessage(error));
        },
      });
  }

  /**
   * States an outcome in the polite status region. Focus moves to it only when the control that acted is gone (a dialog
   * closed, a row re-rendered) and no modal dialog is open; otherwise focus stays where the user is working.
   */
  announce(message: string): void {
    this.notice.set(message);
    if (!message) return;
    setTimeout(() => {
      const current = this.document.activeElement;
      const lost = !current || current === this.document.body || !current.isConnected;
      if (lost && !this.document.querySelector('[aria-modal="true"]'))
        this.document.getElementById('negotiation-notice')?.focus();
    });
  }

  staleText(): string {
    return $localize`:@@negotiation.stale:Someone else changed this negotiation. The latest state is shown; check it and try again.`;
  }

  private blankForm(): IssueForm {
    return {
      type: 'Revision',
      scope: 'Commercial',
      purpose: '',
      instructions: '',
      deadline: '',
      selected: {},
      confirmed: false,
    };
  }
}
