import { vatTreatmentLabel } from '../evaluation/evaluation-labels';
import { DOCUMENT } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Title } from '@angular/platform-browser';
import { BusinessDatePipe } from '../../core/localization/business-format';
import {
  declineReasonLabel,
  invitationStatusLabel,
  tenderTypeLabel,
} from '../../core/localization/labels';
import { LanguageSelector } from '../../core/localization/language-selector';
import { LocaleService } from '../../core/localization/locale.service';
import { currencyName } from '../../core/localization/money';
import { knownProductProblem, problemMessage } from '../../core/localization/product-problem';
import { takeTokenFromFragment } from '../identity/tenant-identity.api';
import {
  DECLINE_COMMENT_MAX,
  DECLINE_REASONS,
  DeclineReason,
  describeLocal,
  fileSize,
} from '../tendering/tendering.api';
import { blobToDataUrl } from '../company/company.api';
import {
  Bid,
  BidderAddendumDocument,
  BidderApi,
  BidderCommunications,
  BidderDocument,
  BidderInvitation,
} from './bidder.api';
import { criterionKindLabel } from '../decision/decision-labels';
import { BidWorkspace } from './bid-workspace';
import { BidderUpdates } from './bidder-updates';

/**
 * The no-account bidder portal a firm reaches from its email. The secure link arrives in the URL fragment, is
 * removed from the address bar at once and is held in memory only. The page carries the same identity as the
 * email — the buyer (and its logo), the tender, and the system delivering it — shows the published tender and
 * documents, lets the firm say whether it intends to bid, and hosts its bid workspace (Part 7). It never shows
 * anything about any other invitee.
 */
@Component({
  selector: 'app-tender-invitation',
  imports: [FormsModule, BusinessDatePipe, LanguageSelector, BidWorkspace, BidderUpdates],
  templateUrl: './tender-invitation.html',
  styleUrl: './tender-invitation.scss',
})
export class TenderInvitationPage implements OnInit {
  readonly vatLabel = vatTreatmentLabel;
  /** CF-040: a recommendation criterion's kind, as the buyer's screens name it. */
  readonly kindLabel = criterionKindLabel;
  private readonly api = inject(BidderApi);
  private readonly document = inject(DOCUMENT);
  readonly locale = inject(LocaleService).locale;
  readonly token = takeTokenFromFragment();

  readonly reasons = DECLINE_REASONS;
  readonly commentMax = DECLINE_COMMENT_MAX;
  readonly reasonLabel = declineReasonLabel;
  readonly statusLabel = invitationStatusLabel;
  readonly typeLabel = tenderTypeLabel;
  readonly size = (bytes: number) => fileSize(bytes, this.locale);
  readonly currencyName = (code: string) => currencyName(code, this.locale);

  readonly invitation = signal<BidderInvitation | null>(null);
  /** Clarifications and addenda (Part 8), loaded with the invitation and shared by both page sections. */
  readonly communications = signal<BidderCommunications | null>(null);
  readonly communicationsError = signal('');
  /** The product delivering the invitation, named exactly as in the email. */
  readonly systemName = $localize`:@@title.product:Subcontractor Intelligence`;
  readonly logo = signal<string | null>(null);
  readonly bid = signal<Bid | null>(null);
  readonly mode = signal<'overview' | 'bid'>('overview');
  readonly opening = signal(false);
  readonly loading = signal(true);
  readonly invalid = signal('');
  readonly error = signal('');
  readonly notice = signal('');
  readonly busy = signal(false);
  readonly declining = signal(false);
  readonly reasonMissing = signal(false);
  reason: DeclineReason | '' = '';
  readonly noAnswer = $localize`:@@bidder.noAnswer:No answer yet`;
  readonly reasonHint = knownProductProblem({ code: 'bidder.decline_reason_required' }) ?? '';
  comment = '';

  readonly deadline = computed(() => {
    const current = this.invitation();
    return current
      ? describeLocal(current.submissionDeadline, current.timeZoneId, this.locale)
      : '';
  });
  /** The deadline first published, shown when the buyer has since extended it. */
  readonly originalDeadline = computed(() => {
    const current = this.invitation();
    return current?.deadlineExtended && current.originalSubmissionDeadline
      ? describeLocal(current.originalSubmissionDeadline, current.timeZoneId, this.locale)
      : '';
  });
  /** Part 9: when the buyer closed the tender early, shown in the tender's zone. */
  readonly closedEarly = computed(() => {
    const current = this.invitation();
    return current?.closedEarlyAt
      ? describeLocal(current.closedEarlyAt, current.timeZoneId, this.locale)
      : '';
  });
  readonly questions = computed(() => {
    const current = this.invitation();
    return current?.questionsDeadline
      ? describeLocal(current.questionsDeadline, current.timeZoneId, this.locale)
      : '';
  });
  /** The current time, ticking every minute so the countdown stays true while the page is open. */
  private readonly now = signal(Date.now());
  /** Server clock minus this device's clock: the countdown follows the server (Part 8), not the device. */
  private readonly clockOffset = signal(0);
  /** A plain countdown near the answer buttons: whole days and hours left, or "less than an hour". */
  readonly remaining = computed(() => {
    const current = this.invitation();
    if (!current || current.state !== 'Open') return null;
    const hours = Math.max(
      0,
      Math.floor(
        (Date.parse(current.submissionDeadline.utc) - (this.now() + this.clockOffset())) /
          3_600_000,
      ),
    );
    return { days: Math.floor(hours / 24), hours: hours % 24 };
  });

  constructor() {
    const destroy = inject(DestroyRef);
    const ticker = setInterval(() => this.now.set(Date.now()), 60_000);
    destroy.onDestroy(() => clearInterval(ticker));
    destroy.onDestroy(inject(LocaleService).preserveLinkForSwitch(this.token));
    inject(Title).setTitle($localize`:@@title.tenderInvitation:Tender invitation`);
  }

  ngOnInit(): void {
    if (!this.token) {
      this.loading.set(false);
      this.invalid.set(this.linkInvalid());
      return;
    }
    this.api.open(this.token).subscribe({
      next: (invitation) => {
        this.take(invitation);
        this.loading.set(false);
        if (invitation.hasBuyerLogo) this.loadLogo();
        this.loadCommunications();
      },
      error: (error: unknown) => {
        this.loading.set(false);
        this.invalid.set(this.linkInvalid(error));
      },
    });
  }

  intend(): void {
    if (this.busy()) return;
    this.respond(
      'IntendsToBid',
      null,
      null,
      $localize`:@@bidder.intendedNotice:Thank you. The buyer can see that you intend to bid.`,
    );
  }

  /** Starts the firm's bid (or resumes one it declined) and opens the workspace. */
  startBid(): void {
    if (this.opening()) return;
    this.opening.set(true);
    this.error.set('');
    this.api.startBid(this.token).subscribe({
      next: (bid) => this.enterWorkspace(bid),
      error: (error: unknown) => {
        this.opening.set(false);
        this.error.set(problemMessage(error));
      },
    });
  }

  /** Opens the saved draft, or the submitted bid, exactly as the server holds it. */
  openBid(): void {
    if (this.opening()) return;
    this.opening.set(true);
    this.error.set('');
    this.api.bid(this.token).subscribe({
      next: (bid) => this.enterWorkspace(bid),
      error: (error: unknown) => {
        this.opening.set(false);
        this.error.set(problemMessage(error));
      },
    });
  }

  submitted(): void {
    this.refresh();
    this.focus('bid-receipt');
  }

  backToOverview(): void {
    this.mode.set('overview');
    this.bid.set(null);
    this.refresh();
    // The workspace may have acknowledged an addendum.
    this.loadCommunications();
    this.focus('bid-title');
  }

  private enterWorkspace(bid: Bid): void {
    this.opening.set(false);
    this.bid.set(bid);
    this.mode.set('bid');
    this.notice.set('');
    this.focus('bw-title');
  }

  private refresh(): void {
    this.api.open(this.token).subscribe({
      next: (invitation) => {
        const revised = invitation.revision !== this.invitation()?.revision;
        this.take(invitation);
        if (revised) this.loadCommunications();
      },
      error: () => undefined,
    });
  }

  /** An addendum or clarification action returned the new state; an acknowledgement also changes the page's counts. */
  communicationsUpdated(view: BidderCommunications): void {
    const acknowledged =
      view.outstandingAcknowledgements !== this.communications()?.outstandingAcknowledgements;
    this.communications.set(view);
    if (acknowledged) this.refresh();
  }

  downloadUpdate(document: BidderAddendumDocument): void {
    this.download({
      id: document.id,
      fileName: document.fileName,
      contentType: '',
      sizeBytes: document.sizeBytes,
    });
  }

  private loadCommunications(): void {
    this.api.communications(this.token).subscribe({
      next: (view) => {
        this.communications.set(view);
        this.communicationsError.set('');
      },
      error: (error: unknown) => this.communicationsError.set(problemMessage(error)),
    });
  }

  private take(invitation: BidderInvitation): void {
    this.invitation.set(invitation);
    if (invitation.serverTimeUtc)
      this.clockOffset.set(Date.parse(invitation.serverTimeUtc) - Date.now());
  }

  private loadLogo(): void {
    this.api.logo(this.token).subscribe({
      next: (blob) =>
        void blobToDataUrl(blob)
          .then((url) => this.logo.set(url))
          .catch(() => this.logo.set(null)),
      // A missing logo only means the buyer is shown by name.
      error: () => this.logo.set(null),
    });
  }

  startDecline(): void {
    this.reason = '';
    this.comment = '';
    this.reasonMissing.set(false);
    this.declining.set(true);
    // The pressed button is replaced by the form: move focus to the form's heading.
    this.focus('bid-decline-title');
  }

  decline(): void {
    if (this.busy()) return;
    if (!this.reason || (this.reason === 'Other' && !this.comment.trim())) {
      this.reasonMissing.set(true);
      return;
    }
    this.respond(
      'Decline',
      this.reason,
      this.comment.trim() || null,
      $localize`:@@bidder.declinedNotice:Thank you for letting the buyer know. You can change your answer until the deadline.`,
    );
  }

  download(document: BidderDocument): void {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    this.api.document(this.token, document.id).subscribe({
      next: (blob) => {
        this.busy.set(false);
        this.notice.set('');
        const url = URL.createObjectURL(blob);
        const anchor = this.document.createElement('a');
        anchor.href = url;
        anchor.download = document.fileName;
        anchor.rel = 'noopener';
        this.document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      },
      error: (error: unknown) => {
        this.busy.set(false);
        void this.downloadProblem(error).then((message) => this.error.set(message));
      },
    });
  }

  /** A download fails with a Blob body: read the problem inside it so the right, localized message is shown. */
  private async downloadProblem(error: unknown): Promise<string> {
    if (error instanceof HttpErrorResponse && error.error instanceof Blob) {
      if (error.status === 404) return this.linkInvalid();
      try {
        const body: unknown = JSON.parse(await error.error.text());
        return problemMessage(
          new HttpErrorResponse({
            error: body,
            status: error.status,
            statusText: error.statusText,
          }),
        );
      } catch {
        return problemMessage(
          new HttpErrorResponse({ status: error.status, statusText: error.statusText }),
        );
      }
    }
    return problemMessage(error);
  }

  private focus(id: string): void {
    setTimeout(() => this.document.getElementById(id)?.focus());
  }

  private respond(
    response: 'IntendsToBid' | 'Decline',
    reason: DeclineReason | null,
    comment: string | null,
    notice: string,
  ): void {
    this.busy.set(true);
    this.error.set('');
    this.notice.set('');
    this.api.respond(this.token, response, reason, comment).subscribe({
      next: (invitation) => {
        this.busy.set(false);
        this.declining.set(false);
        this.take(invitation);
        this.notice.set(notice);
        // The pressed button may be gone now: focus the confirmation.
        this.focus('bid-notice');
      },
      error: (error: unknown) => {
        this.busy.set(false);
        this.error.set(problemMessage(error));
      },
    });
  }

  /** An unusable link gets one explanation; anything else (the network, too many attempts) gets its own. */
  private linkInvalid(error?: unknown): string {
    if (error instanceof HttpErrorResponse && error.status !== 404) return problemMessage(error);
    return knownProductProblem({ code: 'bidder.link_invalid' }) ?? '';
  }
}
