import { Component, OnInit, computed, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SessionService } from '../../core/auth/session.service';
import { BusinessDatePipe } from '../../core/localization/business-format';
import { requestKey } from '../../shared/util/request-key';
import {
  OutsideBidChannel,
  OutsideBids,
  OutsideBidIntake,
  TENDER_PERMISSIONS,
  TenderDetail,
  TenderingApi,
  tenderProblemMessage,
} from './tendering.api';

/**
 * CF-058 (ADR-102, OD-11): bids received outside the portal. With the company setting on, a Procurement Manager records one before the
 * deadline — the firm, how and when it arrived, an attestation, the transcribed totals and the original files. A second user checks the
 * transcription against the originals and confirms it; the bids are opened only after every such bid is confirmed.
 */
@Component({
  selector: 'app-outside-bids',
  imports: [FormsModule, BusinessDatePipe],
  template: `
    @if (view(); as current) {
      @if (current.enabled || current.intakes.length) {
        <section class="prj-section" aria-labelledby="outside-title">
          <h2 id="outside-title" i18n="@@outside.title">Bids received outside the portal</h2>
          <p class="prj-hint" i18n="@@outside.intro">
            An exception, used only when a firm could not use its link: the original files, the
            transcription and an attestation are recorded before the deadline, sealed like any bid,
            and confirmed by a second user before the bids are opened. The firm is emailed a
            receipt.
          </p>
          @if (error()) {
            <p class="prj-note prj-note--error" role="alert">{{ error() }}</p>
          }
          @for (intake of current.intakes; track intake.id) {
            <div class="prj-note" [class.tnd-attention-box]="!intake.confirmedAtUtc">
              <p>
                <bdi dir="ltr" class="tnd-code">{{ intake.subcontractorCode }}</bdi>
                <bdi>{{ intake.subcontractorName }}</bdi> ·
                <bdi dir="ltr" class="tnd-code">{{ intake.bidReference }}</bdi> ·
                {{ channelLabel(intake.channel) }} ·
                <ng-container i18n="@@outside.receivedAt"
                  >received {{ intake.receivedAtUtc | businessDate: 'instant' }}</ng-container
                >
              </p>
              <p class="prj-hint" i18n="@@outside.recordedBy">
                Recorded by <bdi>{{ intake.recordedByName }}</bdi> on
                {{ intake.recordedAtUtc | businessDate: 'instant' }}:
                <bdi>{{ intake.attestation }}</bdi>
              </p>
              @if (intake.content; as content) {
                <p>
                  <ng-container i18n="@@outside.transcribedTotal">Transcribed total</ng-container>:
                  <bdi dir="ltr">{{ content.totalAmount }}</bdi>
                </p>
              } @else {
                <p class="prj-hint" data-testid="outside-sealed" i18n="@@outside.sealed">
                  Confirmed and sealed: like every bid, its content and files open with the bid
                  opening.
                </p>
              }
              <ul role="list">
                @for (file of intake.files; track file.id) {
                  <li>
                    <a [href]="fileUrl(intake, file.id)" download
                      ><bdi>{{ file.fileName }}</bdi></a
                    >
                    @if (file.requirementLabel) {
                      · <bdi>{{ file.requirementLabel }}</bdi>
                    }
                  </li>
                }
              </ul>
              @if (intake.confirmedAtUtc) {
                <p class="prj-hint" i18n="@@outside.confirmed">
                  Transcription confirmed by <bdi>{{ intake.confirmedByName }}</bdi> on
                  {{ intake.confirmedAtUtc | businessDate: 'instant' }}.
                </p>
              } @else if (intake.canConfirm) {
                <button
                  class="prj-btn"
                  type="button"
                  [disabled]="busy()"
                  (click)="confirm(intake)"
                  i18n="@@outside.confirm"
                >
                  I checked the transcription against the originals — confirm
                </button>
              } @else {
                <p class="tnd-attention" i18n="@@outside.awaitingConfirmation">
                  Waiting for another user to confirm the transcription. The bids cannot be opened
                  until then.
                </p>
              }
            </div>
          }
          @if (current.canRecord && recordable().length) {
            <details>
              <summary i18n="@@outside.recordSummary">
                Record a bid received outside the portal
              </summary>
              <form class="prj-form" (ngSubmit)="record()">
                <div class="prj-field">
                  <label for="ob-firm" i18n="@@outside.firm">Invited firm</label>
                  <select id="ob-firm" name="invitation" [(ngModel)]="invitationId" required>
                    @for (invitation of recordable(); track invitation.id) {
                      <option [value]="invitation.id">
                        {{ invitation.subcontractorCode }} · {{ invitation.subcontractorName }}
                      </option>
                    }
                  </select>
                </div>
                <div class="prj-field">
                  <label for="ob-channel" i18n="@@outside.channel">Received by</label>
                  <select id="ob-channel" name="channel" [(ngModel)]="channel">
                    @for (option of channels; track option) {
                      <option [value]="option">{{ channelLabel(option) }}</option>
                    }
                  </select>
                </div>
                <div class="prj-field">
                  <label for="ob-received" i18n="@@outside.receivedAtLabel">Received at</label>
                  <input
                    id="ob-received"
                    name="received"
                    type="datetime-local"
                    [(ngModel)]="receivedAt"
                    required
                  />
                </div>
                <div class="prj-field">
                  <label for="ob-attestation" i18n="@@outside.attestation"
                    >Attestation (who received it, how, and why the portal was not used)</label
                  >
                  <textarea
                    id="ob-attestation"
                    name="attestation"
                    rows="2"
                    maxlength="1000"
                    [(ngModel)]="attestation"
                  ></textarea>
                </div>
                <div class="prj-field">
                  <label for="ob-total" i18n="@@outside.total">Total bid amount (as written)</label>
                  <input
                    id="ob-total"
                    name="total"
                    inputmode="decimal"
                    dir="ltr"
                    [(ngModel)]="total"
                  />
                </div>
                <div class="prj-field">
                  <label for="ob-validity" i18n="@@outside.validity">Validity (days)</label>
                  <input
                    id="ob-validity"
                    name="validity"
                    type="number"
                    min="1"
                    [(ngModel)]="validityDays"
                  />
                </div>
                <div class="prj-field">
                  <label for="ob-duration" i18n="@@outside.duration">Duration (days)</label>
                  <input
                    id="ob-duration"
                    name="duration"
                    type="number"
                    min="1"
                    [(ngModel)]="durationDays"
                  />
                </div>
                <div class="prj-field">
                  <label for="ob-approach" i18n="@@outside.approach"
                    >Technical approach (as written)</label
                  >
                  <textarea
                    id="ob-approach"
                    name="approach"
                    rows="2"
                    [(ngModel)]="technicalApproach"
                  ></textarea>
                </div>
                @for (document of tender().requiredDocuments; track document) {
                  <div class="prj-field">
                    <label [for]="'ob-file-' + $index"
                      ><bdi>{{ document }}</bdi></label
                    >
                    <input
                      [id]="'ob-file-' + $index"
                      type="file"
                      (change)="pick(document, $event)"
                    />
                  </div>
                }
                <div class="prj-field">
                  <label for="ob-file-other" i18n="@@outside.otherFile"
                    >Other original file (optional)</label
                  >
                  <input id="ob-file-other" type="file" (change)="pick('', $event)" />
                </div>
                <div class="prj-form-actions">
                  <button
                    class="prj-btn"
                    type="submit"
                    [disabled]="busy() || !ready()"
                    i18n="@@outside.record"
                  >
                    Record the bid
                  </button>
                </div>
              </form>
            </details>
          }
        </section>
      }
    }
  `,
})
export class OutsideBidsPanel implements OnInit {
  private readonly api = inject(TenderingApi);
  private readonly session = inject(SessionService);

  readonly tender = input.required<TenderDetail>();
  readonly announce = output<string>();
  readonly view = signal<OutsideBids | null>(null);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly channels: readonly OutsideBidChannel[] = ['Email', 'HandDelivered', 'Courier', 'Other'];
  readonly recordable = computed(() =>
    this.tender().invitations.filter((invitation) =>
      ['Invited', 'IntendsToBid', 'BidStarted', 'Declined'].includes(invitation.status),
    ),
  );
  invitationId = '';
  channel: OutsideBidChannel = 'Email';
  receivedAt = '';
  attestation = '';
  total = '';
  validityDays = '';
  durationDays = '';
  technicalApproach = '';
  private readonly files = new Map<string, File>();
  private key = requestKey();

  ngOnInit(): void {
    if (!this.session.hasPermission(TENDER_PERMISSIONS.view)) return;
    this.api.outsideBids(this.tender().id).subscribe({
      next: (view) => this.view.set(view),
      error: () => this.view.set(null),
    });
  }

  channelLabel(channel: OutsideBidChannel): string {
    return (
      {
        Email: $localize`:@@outside.channelEmail:Email`,
        HandDelivered: $localize`:@@outside.channelHand:Delivered by hand`,
        Courier: $localize`:@@outside.channelCourier:Courier`,
        Other: $localize`:@@outside.channelOther:Other`,
      } as Record<OutsideBidChannel, string>
    )[channel];
  }

  fileUrl(intake: OutsideBidIntake, fileId: string): string {
    return this.api.outsideBidFileUrl(this.tender().id, intake.id, fileId);
  }

  pick(requirement: string, event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (file) this.files.set(requirement, file);
    else this.files.delete(requirement);
  }

  ready(): boolean {
    return (
      !!this.invitationId &&
      !!this.receivedAt &&
      this.attestation.trim().length >= 10 &&
      !!this.total.trim() &&
      this.files.size > 0
    );
  }

  record(): void {
    if (this.busy() || !this.ready()) return;
    const form = new FormData();
    form.append('invitationId', this.invitationId);
    form.append('channel', this.channel);
    form.append('receivedAtUtc', new Date(this.receivedAt).toISOString());
    form.append('attestation', this.attestation.trim());
    form.append(
      'content',
      JSON.stringify({
        totalAmount: this.total.trim(),
        lines: [],
        validityDays: this.validityDays ? Number(this.validityDays) : null,
        paymentTerms: null,
        durationDays: this.durationDays ? Number(this.durationDays) : null,
        warrantyMonths: null,
        exclusions: [],
        commercialDeviations: [],
        commercialNotes: null,
        scopeCompliance: 'Full',
        technicalApproach: this.technicalApproach.trim() || null,
        technicalDeviations: [],
        technicalNotes: null,
      }),
    );
    form.append('requestKey', this.key);
    for (const [requirement, file] of this.files) {
      form.append('file', file, file.name);
      form.append('requirement', requirement);
    }
    this.busy.set(true);
    this.error.set('');
    this.api.recordOutsideBid(this.tender().id, form).subscribe({
      next: (view) => {
        this.busy.set(false);
        this.view.set(view);
        this.key = requestKey();
        this.files.clear();
        this.announce.emit(
          $localize`:@@outside.recorded:Bid recorded. Another user must confirm the transcription before opening.`,
        );
      },
      error: (error: unknown) => {
        this.busy.set(false);
        this.error.set(tenderProblemMessage(error));
      },
    });
  }

  confirm(intake: OutsideBidIntake): void {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    this.api.confirmOutsideBid(this.tender().id, intake.id, intake.version).subscribe({
      next: (view) => {
        this.busy.set(false);
        this.view.set(view);
        this.announce.emit($localize`:@@outside.confirmedNotice:Transcription confirmed.`);
      },
      error: (error: unknown) => {
        this.busy.set(false);
        this.error.set(tenderProblemMessage(error));
      },
    });
  }
}
