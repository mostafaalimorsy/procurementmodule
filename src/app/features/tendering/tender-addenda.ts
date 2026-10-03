import { DOCUMENT } from '@angular/common';
import {
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SessionService } from '../../core/auth/session.service';
import { BusinessDatePipe } from '../../core/localization/business-format';
import { invitationStatusLabel, tenderFieldList } from '../../core/localization/labels';
import { LocaleService } from '../../core/localization/locale.service';
import { AutofocusDirective } from '../../shared/ui/autofocus.directive';
import { ConfirmDialog } from '../../shared/ui/confirm-dialog';
import { FocusTrapDirective } from '../../shared/ui/focus-trap.directive';
import {
  ADDENDUM_SUMMARY_MAX,
  ADDENDUM_TITLE_MAX,
  Addendum,
  AddendumInput,
  DOCUMENT_ACCEPT,
  MAX_DOCUMENT_BYTES,
  REASON_MAX,
  REASON_MIN,
  ScheduleItemInput,
  TENDER_PERMISSIONS,
  TenderAddenda as AddendaView,
  TenderDetail,
  TenderLocalTime,
  TenderingApi,
  describeLocal,
  fileSize,
  isStale,
  scheduleInput,
  scheduleRequest,
  tenderProblemMessage,
} from './tendering.api';
import { ScheduleEditor } from './schedule-editor';
import { requestKey } from '../../shared/util/request-key';

/**
 * Addenda and the deadline of a published tender (Part 8). One addendum is prepared at a time — the buyer's
 * explanation, whether every firm must acknowledge it, an optional later deadline, new or replacement documents and
 * documents to withdraw — and issued in one confirmed step that creates the next tender revision and emails every
 * invited firm. Issued addenda are listed with who acknowledged them. The deadline can also be extended on its own,
 * only ever later and with a reason. Nothing issued is edited afterwards.
 */
@Component({
  selector: 'app-tender-addenda',
  imports: [
    FormsModule,
    BusinessDatePipe,
    ConfirmDialog,
    AutofocusDirective,
    FocusTrapDirective,
    ScheduleEditor,
  ],
  templateUrl: './tender-addenda.html',
  styleUrl: './tendering.scss',
})
export class TenderAddenda {
  private readonly api = inject(TenderingApi);
  private readonly session = inject(SessionService);
  private readonly document = inject(DOCUMENT);
  readonly locale = inject(LocaleService).locale;

  readonly tender = input.required<TenderDetail>();
  readonly changed = output<TenderDetail>();
  readonly announce = output<string>();
  /** The whole tender must be reloaded (it changed elsewhere); the page shows the message after reloading. */
  readonly reloadRequested = output<string>();

  readonly titleMax = ADDENDUM_TITLE_MAX;
  readonly summaryMax = ADDENDUM_SUMMARY_MAX;
  readonly reasonMax = REASON_MAX;
  readonly accept = DOCUMENT_ACCEPT;
  readonly statusLabel = invitationStatusLabel;
  readonly size = (bytes: number) => fileSize(bytes, this.locale);

  readonly view = signal<AddendaView | null>(null);
  readonly error = signal('');
  readonly busy = signal(false);
  readonly uploading = signal(false);
  readonly formError = signal('');
  readonly dirty = signal(false);
  readonly confirmingIssue = signal(false);
  readonly confirmingDiscard = signal(false);
  readonly issueError = signal('');

  readonly mayDraft = computed(() => this.session.hasPermission(TENDER_PERMISSIONS.draftAddenda));
  readonly mayIssue = computed(() => this.session.hasPermission(TENDER_PERMISSIONS.issueAddenda));
  readonly mayExtend = computed(() =>
    this.session.hasPermission(TENDER_PERMISSIONS.extendDeadline),
  );
  readonly draft = computed(() => this.view()?.draft ?? null);
  /** Current documents already replaced by a document of the draft cannot also be ticked for withdrawal. */
  readonly replaced = computed(
    () =>
      new Set(
        (this.draft()?.documents ?? [])
          .map((document) => document.replacesDocumentId)
          .filter((id): id is string => !!id),
      ),
  );

  // The draft form, kept apart from the server copy until it is saved.
  title = '';
  summary = '';
  acknowledgementRequired = false;
  newDeadline = '';
  newQuestionsDeadline = '';
  withdrawn = new Set<string>();
  replaces = '';
  /** CF-004: whether this addendum replaces the price schedule, and the replacement being edited. */
  replaceSchedule = false;
  schedule: ScheduleItemInput[] = [];
  private formFor = '';

  // The stand-alone deadline extension.
  readonly extending = signal(false);
  readonly extendError = signal('');
  /** Which extension field the error belongs to, so only that field is marked invalid. */
  readonly extendErrorField = signal<'deadline' | 'reason' | null>(null);
  /** A quiet confirmation inside the draft form (the pressed control is still there, so focus stays put). */
  readonly formStatus = signal('');
  extendDeadline = '';
  extendQuestions = '';
  extendReason = '';
  private extendKey = requestKey();
  private opener: HTMLElement | null = null;
  private loadedFor = '';

  constructor() {
    // The tender's version guards issuing: reload whenever the tender the page shows has changed.
    effect(() => {
      const tender = this.tender();
      const key = `${tender.id}:${tender.version}`;
      if (tender.status === 'Draft' || key === this.loadedFor) return;
      this.loadedFor = key;
      untracked(() => this.load());
    });
  }

  load(): void {
    this.api.addenda(this.tender().id).subscribe({
      next: (view) => this.take(view),
      error: (error: unknown) => this.error.set(tenderProblemMessage(error)),
    });
  }

  local(time: TenderLocalTime | null): string {
    return describeLocal(time, this.tender().timeZoneId, this.locale);
  }

  missing(addendum: Addendum): string {
    return tenderFieldList(addendum.missingForIssue.join(','), this.locale);
  }

  startDraft(): void {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    this.api
      .createAddendum(this.tender().id, {
        title: null,
        summary: null,
        acknowledgementRequired: true,
        newSubmissionDeadlineLocal: null,
        newQuestionsDeadlineLocal: null,
        withdrawnDocumentIds: [],
      })
      .subscribe({
        next: (view) => {
          this.busy.set(false);
          this.take(view, true);
          this.focus('addendum-title');
        },
        error: (error: unknown) => this.fail(error),
      });
  }

  edited(): void {
    this.dirty.set(true);
    this.formError.set('');
  }

  toggleSchedule(checked: boolean): void {
    this.replaceSchedule = checked;
    // The replacement starts from the schedule in force, so a quantity change is one edit.
    if (checked && !this.schedule.length)
      this.schedule = (this.tender().schedule ?? []).map(scheduleInput);
    this.edited();
  }

  toggleWithdraw(id: string, checked: boolean): void {
    if (checked) this.withdrawn.add(id);
    else this.withdrawn.delete(id);
    this.edited();
  }

  save(then?: () => void): void {
    const draft = this.draft();
    if (!draft || this.busy() || this.uploading()) return;
    this.busy.set(true);
    this.formError.set('');
    this.formStatus.set('');
    this.api.updateAddendum(this.tender().id, draft.id, this.input(), draft.version).subscribe({
      next: (view) => {
        this.busy.set(false);
        this.take(view, true);
        if (then) then();
        else
          this.formStatus.set(
            $localize`:@@addendum.saved:Addendum draft saved. Bidders see nothing until it is issued.`,
          );
      },
      error: (error: unknown) => this.fail(error, true),
    });
  }

  upload(input: HTMLInputElement): void {
    const file = input.files?.[0];
    input.value = '';
    const draft = this.draft();
    if (!file || !draft || this.uploading() || this.busy()) return;
    if (file.size > MAX_DOCUMENT_BYTES) {
      this.formError.set(
        $localize`:@@addendum.fileTooLarge:${file.name}:name: is larger than 25 MB and was not added.`,
      );
      return;
    }
    this.uploading.set(true);
    this.formError.set('');
    this.formStatus.set('');
    this.api
      .uploadAddendumDocument(
        this.tender().id,
        draft.id,
        file,
        this.replaces || null,
        draft.version,
      )
      .subscribe({
        next: (view) => {
          this.uploading.set(false);
          this.replaces = '';
          // Unsaved edits of the text fields stay on screen; only the document list comes from the server.
          this.take(view, !this.dirty());
          this.formStatus.set(
            $localize`:@@addendum.documentAdded:Document added to the addendum draft.`,
          );
        },
        error: (error: unknown) => {
          this.uploading.set(false);
          this.fail(error, true);
        },
      });
  }

  removeDocument(documentId: string): void {
    const draft = this.draft();
    if (!draft || this.busy() || this.uploading()) return;
    this.busy.set(true);
    this.api
      .removeAddendumDocument(this.tender().id, draft.id, documentId, draft.version)
      .subscribe({
        next: (view) => {
          this.busy.set(false);
          this.take(view, !this.dirty());
          this.focus('addendum-documents');
        },
        error: (error: unknown) => this.fail(error, true),
      });
  }

  confirmDiscard(): void {
    const draft = this.draft();
    if (!draft || this.busy()) return;
    this.busy.set(true);
    this.api.discardAddendum(this.tender().id, draft.id, draft.version).subscribe({
      next: (view) => {
        this.busy.set(false);
        this.confirmingDiscard.set(false);
        this.take(view, true);
        this.announce.emit(
          $localize`:@@addendum.discarded:Addendum draft discarded. It is kept in the history and was never sent.`,
        );
      },
      error: (error: unknown) => {
        this.confirmingDiscard.set(false);
        this.fail(error);
      },
    });
  }

  startIssue(): void {
    this.issueError.set('');
    this.confirmingIssue.set(true);
  }

  confirmIssue(): void {
    const draft = this.draft();
    const view = this.view();
    if (!draft || !view || this.busy()) return;
    this.busy.set(true);
    this.issueError.set('');
    this.api
      .issueAddendum(this.tender().id, draft.id, draft.version, view.tenderVersion)
      .subscribe({
        next: (issued) => {
          this.take(issued, true);
          // The tender itself changed (revision, documents, perhaps the deadline): refresh the whole page.
          const notice = $localize`:@@addendum.issued:Addendum ${issued.issued[0]?.number ?? ''}:number: issued as revision ${issued.currentRevision}:revision:. Every invited firm is being emailed.`;
          this.api.get(this.tender().id).subscribe({
            next: (tender) => {
              this.busy.set(false);
              this.confirmingIssue.set(false);
              this.changed.emit(tender);
              this.announce.emit(notice);
            },
            // The addendum is issued either way: say so, and let the page reload the tender.
            error: () => {
              this.busy.set(false);
              this.confirmingIssue.set(false);
              this.reloadRequested.emit(notice);
            },
          });
        },
        error: (error: unknown) => {
          this.busy.set(false);
          if (isStale(error)) {
            this.confirmingIssue.set(false);
            this.reloadRequested.emit(this.stale());
          } else {
            this.issueError.set(tenderProblemMessage(error));
            // The pressed button was disabled while the request ran: bring focus back into the dialog, on the error.
            this.focus('addendum-issue-error');
          }
        },
      });
  }

  startExtend(): void {
    this.opener = this.document.activeElement as HTMLElement | null;
    this.extendDeadline = this.tender().submissionDeadline?.local ?? '';
    this.extendQuestions = '';
    this.extendReason = '';
    this.extendError.set('');
    this.extendErrorField.set(null);
    this.extendKey = requestKey();
    this.extending.set(true);
  }

  closeExtend(): void {
    if (this.busy()) return;
    this.extending.set(false);
    const opener = this.opener;
    this.opener = null;
    if (opener?.isConnected) setTimeout(() => opener.focus());
  }

  /**
   * Closes on a click on the backdrop itself. It returns nothing on purpose: an Angular listener that returns false
   * cancels the event, which would stop checkboxes, radio buttons and submit buttons inside the dialog from working.
   */
  backdrop(event: MouseEvent): void {
    if (event.target === event.currentTarget) this.closeExtend();
  }

  confirmExtend(): void {
    if (this.busy()) return;
    if (!this.extendDeadline) {
      this.extendError.set($localize`:@@extend.deadlineMissing:Choose the new deadline.`);
      this.extendErrorField.set('deadline');
      this.focus('extend-deadline');
      return;
    }
    if (this.extendReason.trim().length < REASON_MIN) {
      this.extendError.set(
        $localize`:@@control.reasonTooShort:Explain the reason (at least ${REASON_MIN}:min: characters).`,
      );
      this.extendErrorField.set('reason');
      this.focus('extend-reason');
      return;
    }
    this.busy.set(true);
    this.extendError.set('');
    this.extendErrorField.set(null);
    this.api
      .extendDeadline(
        this.tender().id,
        {
          newDeadlineLocal: this.extendDeadline,
          newQuestionsDeadlineLocal: this.extendQuestions || null,
          reason: this.extendReason.trim(),
        },
        this.extendKey,
        this.tender().version,
      )
      .subscribe({
        next: (tender) => {
          this.busy.set(false);
          this.extending.set(false);
          this.changed.emit(tender);
          this.announce.emit(
            $localize`:@@extend.done:Deadline extended to ${describeLocal(tender.submissionDeadline, tender.timeZoneId, this.locale)}:deadline:. Every invited firm is being emailed; kept drafts can be edited again.`,
          );
        },
        error: (error: unknown) => {
          this.busy.set(false);
          if (isStale(error)) {
            // The tender changed elsewhere: reload it, or every retry would send the same old version.
            this.extending.set(false);
            this.reloadRequested.emit(this.stale());
          } else {
            this.extendError.set(tenderProblemMessage(error));
            // Server refusals concern the dates (reason length is checked above).
            this.extendErrorField.set('deadline');
            this.focus('extend-error');
          }
        },
      });
  }

  /** Takes the server's view; the form is reset from the draft when asked to or when a different draft appears. */
  private take(view: AddendaView, resetForm = false): void {
    this.view.set(view);
    this.error.set('');
    const draft = view.draft;
    const key = draft?.id ?? '';
    if (resetForm || key !== this.formFor) {
      this.formFor = key;
      this.title = draft?.title ?? '';
      this.summary = draft?.summary ?? '';
      this.acknowledgementRequired = draft?.acknowledgementRequired ?? false;
      this.newDeadline = draft?.newSubmissionDeadline?.local ?? '';
      this.newQuestionsDeadline = draft?.newQuestionsDeadline?.local ?? '';
      this.withdrawn = new Set(draft?.withdrawnDocumentIds ?? []);
      this.schedule = (draft?.schedule ?? []).map(scheduleInput);
      this.replaceSchedule = this.schedule.length > 0;
      this.dirty.set(false);
    }
  }

  private input(): AddendumInput {
    return {
      title: this.title.trim() || null,
      summary: this.summary.trim() || null,
      acknowledgementRequired: this.acknowledgementRequired,
      newSubmissionDeadlineLocal: this.newDeadline || null,
      newQuestionsDeadlineLocal: this.newQuestionsDeadline || null,
      withdrawnDocumentIds: [...this.withdrawn].filter((id) => !this.replaced().has(id)),
      schedule:
        this.replaceSchedule && this.schedule.length ? scheduleRequest(this.schedule) : null,
    };
  }

  private fail(error: unknown, inForm = false): void {
    this.busy.set(false);
    if (isStale(error)) {
      this.load();
      this.announce.emit(this.stale());
      return;
    }
    const message = tenderProblemMessage(error);
    if (inForm) {
      this.formError.set(message);
      this.focus('addendum-error');
    } else this.error.set(message);
  }

  private stale(): string {
    return $localize`:@@addendum.stale:Someone else changed this tender or its addendum. The latest version is shown; check it and try again.`;
  }

  private focus(id: string): void {
    setTimeout(() => this.document.getElementById(id)?.focus());
  }
}
