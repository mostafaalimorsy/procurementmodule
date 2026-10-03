import { DOCUMENT } from '@angular/common';
import {
  Component,
  OnDestroy,
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
  attemptStatusLabel,
  declineReasonLabel,
  deliveryKindLabel,
  deliveryStatusLabel,
  invitationEventLabel,
  invitationStatusLabel,
  mailFailureLabel,
} from '../../core/localization/labels';
import { AutofocusDirective } from '../../shared/ui/autofocus.directive';
import {
  InvitationActivity,
  InvitationLink,
  REASON_MAX,
  REASON_MIN,
  RecipientOption,
  TENDER_PERMISSIONS,
  TenderDetail,
  TenderInvitation,
  TenderingApi,
  isStale,
  tenderProblemMessage,
} from './tendering.api';

type Pending =
  'resend' | 'remind' | 'regenerate' | 'revoke' | 'recipient' | 'second' | 'removeSecond' | null;
let nextId = 0;

/**
 * One invitation in full: who it was addressed to, what happened to each email, the activity timeline, and the
 * actions the person may take now. Revealing the view-only link is a deliberate, recorded action; the link is
 * shown only after it, never in lists. The firm's own link is never shown to a user.
 */
@Component({
  selector: 'app-invitation-dialog',
  imports: [FormsModule, BusinessDatePipe, AutofocusDirective],
  templateUrl: './invitation-dialog.html',
  styleUrl: './tendering.scss',
  host: { '(document:keydown.escape)': 'close()' },
})
export class InvitationDialog implements OnDestroy {
  private readonly api = inject(TenderingApi);
  private readonly session = inject(SessionService);
  private readonly document = inject(DOCUMENT);
  private readonly opener = this.document.activeElement as HTMLElement | null;

  readonly tender = input.required<TenderDetail>();
  readonly invitation = input.required<TenderInvitation>();
  readonly changed = output<TenderDetail>();
  readonly reloadRequested = output<string>();
  readonly closed = output<void>();

  readonly statusLabel = invitationStatusLabel;
  readonly deliveryLabel = deliveryStatusLabel;
  readonly attemptLabel = attemptStatusLabel;
  readonly kindLabel = deliveryKindLabel;
  readonly eventLabel = invitationEventLabel;
  readonly failureLabel = mailFailureLabel;
  readonly declineLabel = declineReasonLabel;
  readonly reasonMin = REASON_MIN;
  readonly reasonMax = REASON_MAX;
  readonly titleId = `invitation-title-${++nextId}`;

  readonly activity = signal<InvitationActivity | null>(null);
  readonly activityError = signal('');
  readonly busy = signal(false);
  readonly error = signal('');
  readonly pending = signal<Pending>(null);
  readonly link = signal<InvitationLink | null>(null);
  readonly copied = signal(false);
  readonly copyFailed = signal(false);
  /** The outcome of the last action, shown and focused inside the dialog (the page behind it is inert). */
  readonly notice = signal('');
  readonly noticeId = `${this.titleId}-notice`;
  readonly pendingId = `${this.titleId}-pending`;
  readonly actionsId = `${this.titleId}-actions`;
  readonly errorId = `${this.titleId}-error`;
  reason = '';
  emailNewLink = true;
  contactId = '';

  readonly canManage = computed(() => this.session.hasPermission(TENDER_PERMISSIONS.invitations));
  /** CF-058 part 2: the firm's other contacts that could be a second recipient (an email, not the first recipient). */
  readonly secondOptions = computed<readonly RecipientOption[]>(() =>
    this.contacts().filter(
      (contact) =>
        contact.contactId !== this.invitation().contactId &&
        contact.email?.toLowerCase() !== this.invitation().recipientEmail.toLowerCase(),
    ),
  );

  readonly contacts = computed<readonly RecipientOption[]>(
    () =>
      this.tender()
        .approvedShortlist?.members.find(
          (member) => member.subcontractorId === this.invitation().subcontractorId,
        )
        ?.contacts.filter((contact) => !!contact.email) ?? [],
  );

  constructor() {
    effect(() => {
      const invitation = this.invitation();
      untracked(() => this.load(invitation));
    });
  }

  ngOnDestroy(): void {
    if (this.opener?.isConnected) this.opener.focus();
  }

  /**
   * Closes on a click on the backdrop itself. It returns nothing on purpose: an Angular listener that returns false
   * cancels the event, which stopped the "email the new link" checkbox inside the dialog from toggling.
   */
  backdrop(event: MouseEvent): void {
    if (event.target === event.currentTarget) this.close();
  }

  close(): void {
    if (!this.busy()) this.closed.emit();
  }

  load(invitation: TenderInvitation): void {
    this.activityError.set('');
    this.api.activity(this.tender().id, invitation.id).subscribe({
      next: (activity) => this.activity.set(activity),
      error: (error: unknown) => this.activityError.set(tenderProblemMessage(error)),
    });
  }

  ask(action: Pending): void {
    this.error.set('');
    this.notice.set('');
    this.reason = '';
    this.emailNewLink = true;
    this.contactId =
      (action === 'second' ? this.secondOptions()[0]?.contactId : undefined) ??
      this.contacts().find((contact) => contact.contactId !== this.invitation().contactId)
        ?.contactId ??
      '';
    this.pending.set(action);
    // The pressed button is replaced by the confirmation: keep focus inside the dialog, on its question.
    this.focus(this.pendingId);
  }

  /** Leaves a confirmation without acting and returns focus to the actions. */
  back(): void {
    this.pending.set(null);
    this.focus(this.actionsId);
  }

  revealLink(): void {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    this.api.copyLink(this.tender().id, this.invitation().id).subscribe({
      next: (link) => {
        this.busy.set(false);
        this.link.set(link);
        this.load(this.invitation());
      },
      error: (error: unknown) => this.fail(error),
    });
  }

  async copy(): Promise<void> {
    const link = this.link();
    if (!link) return;
    this.copyFailed.set(false);
    try {
      await navigator.clipboard.writeText(link.url);
      this.copied.set(true);
    } catch {
      // No clipboard (plain HTTP on another host) or permission refused: say so and select the link instead.
      this.copied.set(false);
      this.copyFailed.set(true);
      const input = this.document.getElementById('invitation-link') as HTMLInputElement | null;
      input?.focus();
      input?.select();
    }
  }

  run(): void {
    const action = this.pending();
    if (!action || this.busy()) return;
    const tender = this.tender();
    const invitation = this.invitation();
    if (action === 'revoke' && this.reason.trim().length < REASON_MIN) {
      this.error.set(
        $localize`:@@control.reasonTooShort:Explain the reason (at least ${REASON_MIN}:min: characters).`,
      );
      return;
    }
    if ((action === 'recipient' || action === 'second') && !this.contactId) return;
    this.busy.set(true);
    this.error.set('');
    const done = (updated: TenderDetail, message: string) => {
      this.busy.set(false);
      this.pending.set(null);
      this.changed.emit(updated);
      this.notice.set(message);
      this.focus(this.noticeId);
    };
    const failed = (error: unknown) => this.fail(error);
    switch (action) {
      case 'resend':
        this.api.resend(tender.id, invitation.id, invitation.version).subscribe({
          next: (updated) =>
            done(
              updated,
              $localize`:@@tenderInvitation.resent:The invitation email is queued again.`,
            ),
          error: failed,
        });
        break;
      case 'remind':
        this.api.remind(tender.id, invitation.id, invitation.version).subscribe({
          next: (updated) =>
            done(updated, $localize`:@@tenderInvitation.reminded:A reminder is queued.`),
          error: failed,
        });
        break;
      case 'revoke':
        this.api
          .revoke(tender.id, invitation.id, this.reason.trim(), invitation.version)
          .subscribe({
            next: (updated) => {
              // The link just stopped working: never leave it on screen with a Copy button.
              this.link.set(null);
              done(
                updated,
                $localize`:@@tenderInvitation.revokedNotice:Invitation revoked. Its link no longer works.`,
              );
            },
            error: failed,
          });
        break;
      case 'recipient':
        this.api
          .changeRecipient(tender.id, invitation.id, this.contactId, invitation.version)
          .subscribe({
            next: (updated) =>
              done(
                updated,
                $localize`:@@tenderInvitation.recipientChanged:Recipient changed. Resend the invitation to reach them.`,
              ),
            error: failed,
          });
        break;
      case 'second':
        this.api
          .setSecondRecipient(tender.id, invitation.id, this.contactId, invitation.version)
          .subscribe({
            next: (updated) =>
              done(
                updated,
                $localize`:@@tenderInvitation.secondSet:Second recipient saved. Their own personal link is emailed to them.`,
              ),
            error: failed,
          });
        break;
      case 'removeSecond':
        this.api.removeSecondRecipient(tender.id, invitation.id, invitation.version).subscribe({
          next: (updated) =>
            done(
              updated,
              $localize`:@@tenderInvitation.secondRemoved:Second recipient removed. Their link no longer works.`,
            ),
          error: failed,
        });
        break;
      case 'regenerate':
        this.api
          .regenerate(tender.id, invitation.id, invitation.version, this.emailNewLink)
          .subscribe({
            next: (result) => {
              this.link.set(result.link);
              this.copied.set(false);
              done(
                result.tender,
                this.emailNewLink
                  ? $localize`:@@tenderInvitation.replacedSent:The links were replaced and the firm's new personal link is being emailed. Below is the new view-only link.`
                  : $localize`:@@tenderInvitation.replacedNotSent:The links were replaced. The firm can only answer and bid after you resend the invitation, which emails its new personal link. Below is the new view-only link.`,
              );
            },
            error: failed,
          });
        break;
    }
  }

  languageName(locale: string): string {
    return locale === 'ar'
      ? $localize`:@@tenderBuilder.arabic:Arabic`
      : $localize`:@@tenderBuilder.english:English`;
  }

  private focus(id: string): void {
    setTimeout(() => this.document.getElementById(id)?.focus());
  }

  private fail(error: unknown): void {
    this.busy.set(false);
    if (isStale(error)) {
      this.reloadRequested.emit(
        $localize`:@@tenderInvitation.stale:This invitation changed in the meantime. The latest version is shown; check it and try again.`,
      );
      return;
    }
    this.error.set(tenderProblemMessage(error));
  }
}
