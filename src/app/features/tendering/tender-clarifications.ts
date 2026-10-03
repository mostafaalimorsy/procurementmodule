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
import {
  clarificationStatusLabel,
  clarificationVisibilityLabel,
} from '../../core/localization/labels';
import { AutofocusDirective } from '../../shared/ui/autofocus.directive';
import { FocusTrapDirective } from '../../shared/ui/focus-trap.directive';
import {
  ANSWER_MAX,
  Clarification,
  ClarificationVisibility,
  QUESTION_MAX,
  TENDER_PERMISSIONS,
  TenderClarifications as ClarificationLog,
  TenderDetail,
  TenderingApi,
  isStale,
  tenderProblemMessage,
} from './tendering.api';

type Filter = 'all' | 'open' | 'private' | 'published';

/**
 * The tender's numbered clarification log (Part 8): every question an invited firm asked through its own link, who
 * asked (internal only), and the buyer's answer. Answering is explicit about who reads it — this firm only, or every
 * invited bidder with the question worded as the buyer chooses — and a private answer can later be published. It is
 * procurement-controlled communication, not a chat: one question, one final answer.
 */
@Component({
  selector: 'app-tender-clarifications',
  imports: [FormsModule, BusinessDatePipe, AutofocusDirective, FocusTrapDirective],
  templateUrl: './tender-clarifications.html',
  styleUrl: './tendering.scss',
})
export class TenderClarifications {
  private readonly api = inject(TenderingApi);
  private readonly session = inject(SessionService);
  private readonly document = inject(DOCUMENT);

  readonly tender = input.required<TenderDetail>();
  readonly announce = output<string>();

  readonly statusLabel = clarificationStatusLabel;
  readonly visibilityLabel = clarificationVisibilityLabel;
  readonly answerMax = ANSWER_MAX;
  readonly questionMax = QUESTION_MAX;

  readonly log = signal<ClarificationLog | null>(null);
  readonly error = signal('');
  readonly filter = signal<Filter>('all');
  readonly canManage = computed(() =>
    this.session.hasPermission(TENDER_PERMISSIONS.clarifications),
  );
  readonly items = computed(() => {
    const items = this.log()?.items ?? [];
    switch (this.filter()) {
      case 'open':
        return items.filter((item) => item.status === 'Open');
      case 'private':
        return items.filter((item) => item.visibility === 'Private');
      case 'published':
        return items.filter((item) => item.visibility === 'AllBidders');
      default:
        return items;
    }
  });

  /** The question open in the answer or publish dialog. */
  readonly selected = signal<Clarification | null>(null);
  readonly mode = signal<'answer' | 'publish'>('answer');
  readonly busy = signal(false);
  readonly dialogError = signal('');
  readonly answerMissing = signal(false);
  readonly visibilityMissing = signal(false);
  readonly publishedMissing = signal(false);
  readonly refreshing = signal(false);
  /** A quiet result of "Check for new questions" (the button stays where it is, so focus does too). */
  readonly refreshStatus = signal('');
  answerText = '';
  visibility: ClarificationVisibility | '' = '';
  publishedQuestion = '';
  private opener: HTMLElement | null = null;
  private loadedFor = '';

  constructor() {
    effect(() => {
      const tender = this.tender();
      if (tender.status === 'Draft' || tender.id === this.loadedFor) return;
      this.loadedFor = tender.id;
      untracked(() => this.load());
    });
  }

  load(announce = false): void {
    this.refreshing.set(true);
    this.api.clarifications(this.tender().id).subscribe({
      next: (log) => {
        this.refreshing.set(false);
        this.log.set(log);
        this.error.set('');
        if (announce)
          this.refreshStatus.set(
            $localize`:@@clar.refreshed:Up to date. Questions: ${log.total}:total:; awaiting an answer: ${log.open}:open:.`,
          );
      },
      error: (error: unknown) => {
        this.refreshing.set(false);
        this.error.set(tenderProblemMessage(error));
      },
    });
  }

  setFilter(value: string): void {
    this.filter.set(value as Filter);
  }

  startAnswer(item: Clarification): void {
    this.open(item, 'answer');
    this.answerText = '';
    this.visibility = '';
    this.publishedQuestion = item.question;
  }

  startPublish(item: Clarification): void {
    this.open(item, 'publish');
    this.publishedQuestion = item.question;
  }

  /** The published wording differs from what the firm wrote: the log says so. */
  reworded(item: Clarification): boolean {
    return !!item.publishedQuestion && item.publishedQuestion !== item.question;
  }

  publishing(): boolean {
    return this.mode() === 'publish' || this.visibility === 'AllBidders';
  }

  submit(): void {
    const item = this.selected();
    if (!item || this.busy()) return;
    const answering = this.mode() === 'answer';
    this.answerMissing.set(answering && !this.answerText.trim());
    this.visibilityMissing.set(answering && !this.visibility);
    // The published wording is what every bidder reads: it is never left blank (blank would publish the original).
    this.publishedMissing.set(this.publishing() && !this.publishedQuestion.trim());
    if (this.answerMissing() || this.visibilityMissing() || this.publishedMissing()) {
      this.focus(
        this.answerMissing()
          ? 'clar-answer'
          : this.visibilityMissing()
            ? 'clar-visibility-private'
            : 'clar-published',
      );
      return;
    }
    const published = this.publishing() ? this.publishedQuestion.trim() : null;
    this.busy.set(true);
    this.dialogError.set('');
    const request = answering
      ? this.api.answer(
          this.tender().id,
          item.id,
          this.answerText.trim(),
          this.visibility as ClarificationVisibility,
          published,
          item.version,
        )
      : this.api.publishClarification(this.tender().id, item.id, published, item.version);
    const notice = !answering
      ? $localize`:@@clar.publishedNotice:${item.reference}:reference: is published to all invited bidders. They are being emailed.`
      : this.visibility === 'AllBidders'
        ? $localize`:@@clar.answeredPublishedNotice:${item.reference}:reference: is answered and published to all invited bidders. They are being emailed.`
        : $localize`:@@clar.answeredPrivateNotice:${item.reference}:reference: is answered privately. The firm that asked is being emailed.`;
    request.subscribe({
      next: (log) => {
        this.busy.set(false);
        this.log.set(log);
        this.close(false);
        this.announce.emit(notice);
      },
      error: (error: unknown) => {
        this.busy.set(false);
        if (isStale(error)) {
          this.close(true);
          this.load();
          this.announce.emit(
            $localize`:@@clar.stale:Someone else changed this question. The latest version is shown; check it and try again.`,
          );
        } else {
          this.dialogError.set(tenderProblemMessage(error));
          this.focus('clar-dialog-error');
        }
      },
    });
  }

  close(restoreFocus = true): void {
    if (this.busy()) return;
    this.selected.set(null);
    const opener = this.opener;
    this.opener = null;
    if (restoreFocus && opener?.isConnected) setTimeout(() => opener.focus());
  }

  /**
   * Closes on a click on the backdrop itself. It returns nothing on purpose: an Angular listener that returns false
   * cancels the event, which would stop checkboxes, radio buttons and submit buttons inside the dialog from working.
   */
  backdrop(event: MouseEvent): void {
    if (event.target === event.currentTarget) this.close();
  }

  private open(item: Clarification, mode: 'answer' | 'publish'): void {
    this.opener = this.document.activeElement as HTMLElement | null;
    this.mode.set(mode);
    this.dialogError.set('');
    this.answerMissing.set(false);
    this.visibilityMissing.set(false);
    this.publishedMissing.set(false);
    this.selected.set(item);
  }

  private focus(id: string): void {
    setTimeout(() => this.document.getElementById(id)?.focus());
  }
}
