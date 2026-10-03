import { VerificationDetails } from '../../shared/ui/verification-details';
import { DOCUMENT } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Title } from '@angular/platform-browser';
import { BusinessDatePipe } from '../../core/localization/business-format';
import { LanguageSelector } from '../../core/localization/language-selector';
import { LocaleService } from '../../core/localization/locale.service';
import { currencyName, formatAmount } from '../../core/localization/money';
import { knownProductProblem, problemMessage } from '../../core/localization/product-problem';
import { blobToDataUrl } from '../company/company.api';
import { roundScopeLabel, roundTypeLabel } from '../decision/decision-labels';
import { takeTokenFromFragment } from '../identity/tenant-identity.api';
import { describeLocal, fileSize } from '../tendering/tendering.api';
import { BID_WORKSPACE_BACKEND, Bid, BidAttachment } from './bidder.api';
import {
  BidderNegotiation,
  BidderNegotiationApi,
  DECLINE_ROUND_COMMENT_MAX,
  NegotiationBidBackend,
  negotiationAsBid,
  negotiationAsInvitation,
} from './bidder-negotiation.api';
import { BidWorkspace } from './bid-workspace';

/**
 * A selected firm's negotiation round page (Part 10), reached from its own round email. Like the invitation page it stands
 * outside both product shells: the round link arrives in the URL fragment, is removed from the address bar at once and is
 * held in memory only. It shows the buyer and the system delivering the request, the round's instructions and exact
 * deadline (by the server's clock), the firm's own response in force, and — while the round is open — lets the firm prepare,
 * review and submit a revised response with the same bid form, or decline to revise. It never shows anything about any
 * other firm, price, score, ranking or decision.
 */
@Component({
  selector: 'app-tender-negotiation',
  imports: [VerificationDetails, FormsModule, BusinessDatePipe, LanguageSelector, BidWorkspace],
  templateUrl: './tender-negotiation.html',
  styleUrl: './tender-negotiation.scss',
  providers: [
    NegotiationBidBackend,
    { provide: BID_WORKSPACE_BACKEND, useExisting: NegotiationBidBackend },
  ],
})
export class TenderNegotiationPage implements OnInit {
  private readonly api = inject(BidderNegotiationApi);
  private readonly backend = inject(NegotiationBidBackend);
  private readonly document = inject(DOCUMENT);
  readonly locale = inject(LocaleService).locale;
  readonly token = takeTokenFromFragment();
  readonly systemName = $localize`:@@title.product:Subcontractor Intelligence`;
  readonly typeLabel = roundTypeLabel;
  readonly scopeLabel = roundScopeLabel;
  readonly commentMax = DECLINE_ROUND_COMMENT_MAX;
  readonly size = (bytes: number) => fileSize(bytes, this.locale);

  readonly view = signal<BidderNegotiation | null>(null);
  readonly logo = signal<string | null>(null);
  readonly loading = signal(true);
  readonly invalid = signal('');
  readonly error = signal('');
  readonly notice = signal('');
  readonly busy = signal(false);
  readonly mode = signal<'overview' | 'respond'>('overview');
  readonly declining = signal(false);
  comment = '';

  readonly bid = computed<Bid | null>(() => {
    const view = this.view();
    return view ? negotiationAsBid(view) : null;
  });
  readonly invitation = computed(() => {
    const view = this.view();
    return view ? negotiationAsInvitation(view) : null;
  });
  readonly deadline = computed(() => {
    const view = this.view();
    return view ? describeLocal(view.responseDeadline, view.timeZoneId, this.locale) : '';
  });
  readonly open = computed(() => this.view()?.state === 'open');
  readonly submitted = computed(
    () => this.view()?.status === 'Submitted' && !!this.view()?.receipt,
  );
  /** The firm may start (or continue, or resume after declining) its revised response. */
  readonly canRespond = computed(() => this.open() && !this.submitted());
  readonly hasDraft = computed(() => !!this.view()?.draftVersion);
  readonly currency = computed(() => this.view()?.currency ?? '');
  readonly currencyTitle = computed(() => currencyName(this.currency(), this.locale));

  /** The current time, ticking every half minute so the countdown stays true while the page is open. */
  private readonly now = signal(Date.now());
  /** Server clock minus this device's clock: the countdown follows the server, not the device. */
  private readonly clockOffset = signal(0);
  readonly remaining = computed(() => {
    const view = this.view();
    if (!view || view.state !== 'open') return null;
    const left = Date.parse(view.responseDeadline.utc) - (this.now() + this.clockOffset());
    if (left <= 0) return null;
    const minutes = Math.floor(left / 60_000);
    return {
      days: Math.floor(minutes / 1440),
      hours: Math.floor((minutes % 1440) / 60),
      minutes: minutes % 60,
    };
  });

  constructor() {
    const destroy = inject(DestroyRef);
    const ticker = setInterval(() => this.now.set(Date.now()), 30_000);
    destroy.onDestroy(() => clearInterval(ticker));
    destroy.onDestroy(inject(LocaleService).preserveLinkForSwitch(this.token));
    inject(Title).setTitle($localize`:@@title.tenderNegotiation:Negotiation round`);
  }

  ngOnInit(): void {
    if (!this.token) {
      this.loading.set(false);
      this.invalid.set(this.linkInvalid());
      return;
    }
    this.api.open(this.token).subscribe({
      next: (view) => {
        this.take(view);
        this.loading.set(false);
        if (view.hasLogo) this.loadLogo();
      },
      error: (error: unknown) => {
        this.loading.set(false);
        this.invalid.set(this.linkInvalid(error));
      },
    });
  }

  /** Starts (or continues, or resumes) the revised response and opens the bid form on it. */
  respond(): void {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    this.api.start(this.token).subscribe({
      next: (view) => {
        this.busy.set(false);
        this.take(view);
        if (view.receipt) {
          this.focus('round-receipt');
          return;
        }
        this.mode.set('respond');
        this.notice.set('');
        this.focus('bw-title');
      },
      error: (error: unknown) => {
        this.busy.set(false);
        this.error.set(problemMessage(error));
      },
    });
  }

  /** The workspace submitted: its latest view carries the receipt. */
  workspaceSubmitted(): void {
    const latest = this.backend.latest();
    if (latest) this.take(latest);
    this.mode.set('overview');
    this.notice.set(
      $localize`:@@round.submittedNotice:Your revised response was received. It is now your offer in force.`,
    );
    this.focus('round-receipt');
  }

  backToOverview(): void {
    this.mode.set('overview');
    this.refresh();
    this.focus('round-title');
  }

  startDecline(): void {
    this.comment = '';
    this.declining.set(true);
    this.focus('round-decline-title');
  }

  decline(): void {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    this.api.decline(this.token, this.comment.trim() || null).subscribe({
      next: (view) => {
        this.busy.set(false);
        this.declining.set(false);
        this.take(view);
        this.notice.set(
          $localize`:@@round.declinedNotice:Thank you for letting the buyer know. Your earlier offer stays in force. You can still respond until the deadline.`,
        );
        this.focus('round-notice');
      },
      error: (error: unknown) => {
        this.busy.set(false);
        this.error.set(problemMessage(error));
      },
    });
  }

  download(file: BidAttachment): void {
    this.api.attachment(this.token, file.id).subscribe({
      next: (blob) => {
        const url = URL.createObjectURL(blob);
        const anchor = this.document.createElement('a');
        anchor.href = url;
        anchor.download = file.fileName;
        anchor.rel = 'noopener';
        this.document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      },
      error: (error: unknown) => void this.blobProblem(error).then((m) => this.error.set(m)),
    });
  }

  amount(value: string | null | undefined): string {
    return formatAmount(value, this.view()?.currencyMinorUnits ?? 2, this.locale);
  }

  private refresh(): void {
    this.api.open(this.token).subscribe({
      next: (view) => this.take(view),
      error: () => undefined,
    });
  }

  private take(view: BidderNegotiation): void {
    this.view.set(view);
    this.backend.latest.set(view);
    this.clockOffset.set(Date.parse(view.serverNowUtc) - Date.now());
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

  private async blobProblem(error: unknown): Promise<string> {
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

  /** An unusable link gets one explanation; anything else (the network, too many attempts) gets its own. */
  private linkInvalid(error?: unknown): string {
    if (error instanceof HttpErrorResponse && error.status !== 404) return problemMessage(error);
    return knownProductProblem({ code: 'bidder.link_invalid' }) ?? '';
  }
}
