import { DOCUMENT } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { BusinessDatePipe } from '../../core/localization/business-format';
import {
  clarificationStatusLabel,
  clarificationVisibilityLabel,
  questionsClosedLabel,
} from '../../core/localization/labels';
import { LocaleService } from '../../core/localization/locale.service';
import { problemMessage } from '../../core/localization/product-problem';
import { TenderLocalTime, describeLocal, fileSize } from '../tendering/tendering.api';
import {
  BidderAddendum,
  BidderAddendumDocument,
  BidderApi,
  BidderClarification,
  BidderCommunications,
  BidderInvitation,
} from './bidder.api';
import { requestKey } from '../../shared/util/request-key';

/**
 * The tender's updates and clarifications on the bidder portal (Part 8). `part="addenda"`: every issued addendum with
 * its documents and, through the firm's own link, an explicit acknowledgement. `part="clarifications"`: the
 * clarifications published to all bidders (never who asked) and the firm's own questions, with a form to ask one while
 * questions are open. A view-only copy or the buyer's preview sees only what every invited firm may see. The page owns
 * the data (one request for both parts); every action returns the new state, which is handed back up.
 */
@Component({
  selector: 'app-bidder-updates',
  imports: [FormsModule, BusinessDatePipe],
  templateUrl: './bidder-updates.html',
  styleUrl: './tender-invitation.scss',
})
export class BidderUpdates {
  private readonly api = inject(BidderApi);
  private readonly document = inject(DOCUMENT);
  readonly locale = inject(LocaleService).locale;

  readonly token = input.required<string>();
  readonly invitation = input.required<BidderInvitation>();
  readonly part = input.required<'addenda' | 'clarifications'>();
  readonly view = input.required<BidderCommunications>();
  /** An action returned the new state (and, for an acknowledgement, the invitation page refreshes its counts). */
  readonly updated = output<BidderCommunications>();
  readonly download = output<BidderAddendumDocument>();

  readonly statusLabel = clarificationStatusLabel;
  readonly visibilityLabel = clarificationVisibilityLabel;
  readonly closedLabel = questionsClosedLabel;
  readonly size = (bytes: number) => fileSize(bytes, this.locale);

  readonly error = signal('');
  readonly notice = signal('');
  readonly asking = signal(false);
  readonly askError = signal('');
  readonly questionMissing = signal(false);
  readonly acknowledging = signal<string | null>(null);
  question = '';
  private clientKey = requestKey();

  readonly outstanding = computed(() =>
    this.view().addenda.filter(
      (addendum) => addendum.acknowledgementRequired && !addendum.acknowledgedAtUtc,
    ),
  );

  local(time: TenderLocalTime | null): string {
    return describeLocal(time, this.invitation().timeZoneId, this.locale);
  }

  /** The firm's own question wording differs from what the buyer published. */
  reworded(item: BidderClarification): boolean {
    return item.mine && !!item.publishedQuestion && item.publishedQuestion !== item.question;
  }

  ask(): void {
    if (this.asking()) return;
    const text = this.question.trim();
    if (!text) {
      this.questionMissing.set(true);
      this.focus('bid-question');
      return;
    }
    this.asking.set(true);
    this.askError.set('');
    this.notice.set('');
    this.api.ask(this.token(), text, this.clientKey).subscribe({
      next: (view) => {
        this.asking.set(false);
        this.updated.emit(view);
        this.question = '';
        this.clientKey = requestKey();
        const asked = view.myQuestions[view.myQuestions.length - 1];
        this.notice.set(
          $localize`:@@bidUpdates.asked:Your question was sent to the buyer as ${asked?.reference ?? ''}:reference:. You will be emailed when it is answered.`,
        );
        this.focus(this.noticeId());
      },
      error: (error: unknown) => {
        this.asking.set(false);
        this.askError.set(problemMessage(error));
        this.focus('bid-question-error');
        // Questions closed while the page was open: show the closed state instead of a form that cannot work.
        if (
          error instanceof HttpErrorResponse &&
          error.error?.code === 'clarification.questions_closed'
        )
          this.api.communications(this.token()).subscribe({
            next: (view) => this.updated.emit(view),
            error: () => undefined,
          });
      },
    });
  }

  acknowledge(addendum: BidderAddendum): void {
    if (this.acknowledging()) return;
    this.acknowledging.set(addendum.id);
    this.error.set('');
    this.notice.set('');
    this.api.acknowledge(this.token(), addendum.id).subscribe({
      next: (view) => {
        this.acknowledging.set(null);
        this.updated.emit(view);
        this.notice.set(
          $localize`:@@bidUpdates.acknowledged:Addendum ${addendum.number}:number: acknowledged. The buyer can see that you received and reviewed it.`,
        );
        // The pressed button is replaced by the acknowledgement: focus the confirmation.
        this.focus(this.noticeId());
      },
      error: (error: unknown) => {
        this.acknowledging.set(null);
        this.error.set(problemMessage(error));
      },
    });
  }

  noticeId(): string {
    return `bid-${this.part()}-notice`;
  }

  private focus(id: string): void {
    setTimeout(() => this.document.getElementById(id)?.focus());
  }
}
