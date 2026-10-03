import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { BusinessDatePipe } from '../../core/localization/business-format';
import { firstAdminStateLabel, identityMailLabel } from '../../core/localization/labels';
import { PlatformSessionService } from '../../core/auth/platform-session.service';
import { ConfirmDialog } from '../../shared/ui/confirm-dialog';
import { CompanyStore } from './company-store';
import { CommercialChip, commercialModeLabel } from './commercial-terms';
import { InFlightCounts } from './in-flight-counts';
import {
  Company,
  CommercialMode,
  CompanyPurgeCertificate,
  AdminRecovery,
  IntelligenceReusePolicy,
  ResidencyPolicies,
  ResidencyPolicy,
  PlatformApi,
  problemMessage,
} from './platform-api.service';

/** Company identity, lifecycle and first-administrator provisioning state. */
@Component({
  selector: 'app-platform-company-overview',
  imports: [BusinessDatePipe, FormsModule, ConfirmDialog, InFlightCounts, CommercialChip],
  styleUrl: './platform.scss',
  template: `
    @if (store.company(); as item) {
      <div class="grid">
        <section class="panel" aria-labelledby="record-title">
          <div class="toolbar">
            <h2 id="record-title" i18n="@@company.record">Company record</h2>
            @if (!renaming()) {
              <button
                type="button"
                class="secondary"
                [disabled]="store.busy()"
                (click)="startRename(item.name)"
                i18n="@@company.rename"
              >
                Rename
              </button>
            }
          </div>
          @if (renaming()) {
            <form (ngSubmit)="rename(item.id, item.version)" #renameForm="ngForm">
              <label
                ><span i18n="@@companies.name">Company name</span
                ><input
                  name="name"
                  required
                  maxlength="200"
                  autocomplete="organization"
                  [(ngModel)]="name"
                  aria-describedby="rename-hint"
              /></label>
              <small id="rename-hint" i18n="@@company.renameHint"
                >Only the display name changes. The company code, its users and the first Company
                Admin stay as they are; the change is recorded in the platform audit.</small
              >
              <div class="actions">
                <button
                  [disabled]="
                    renameForm.invalid || !name.trim() || name.trim() === item.name || store.busy()
                  "
                  i18n="@@company.saveName"
                >
                  Save name
                </button>
                <button
                  type="button"
                  class="secondary"
                  (click)="renaming.set(false)"
                  i18n="@@common.cancel"
                >
                  Cancel
                </button>
              </div>
            </form>
          }
          <dl>
            <dt i18n="@@companies.name">Company name</dt>
            <dd>
              <bdi>{{ item.name }}</bdi>
            </dd>
            <dt i18n="@@companies.code">Company code</dt>
            <dd>
              <bdi dir="ltr">{{ item.code }}</bdi>
              <small class="muted" i18n="@@company.codeFixed"> · permanent identifier</small>
            </dd>
            <dt i18n="@@company.id">Company ID</dt>
            <dd>
              <bdi dir="ltr">{{ item.id }}</bdi>
            </dd>
            <dt i18n="@@company.created">Created</dt>
            <dd>{{ item.createdAtUtc | businessDate: 'instant' }}</dd>
          </dl>
        </section>
        <section class="panel" aria-labelledby="admin-title">
          <h2 id="admin-title" i18n="@@company.firstAdmin">First Company Admin</h2>
          <p>
            <bdi dir="ltr">{{ item.firstAdminEmail }}</bdi>
          </p>
          <p class="muted">{{ firstAdminState(item.firstAdminState) }}</p>
          @if (
            item.firstAdminState === 'InvitationIssued' && item.firstAdminInvitationEmail;
            as mail
          ) {
            <p
              class="muted"
              [class.first-admin-mail--failed]="mail.status === 'Failed'"
              [attr.role]="mail.status === 'Failed' ? 'status' : null"
            >
              {{ mailLabel(mail) }}
            </p>
          }
          @if (item.firstAdminState === 'InvitationIssued') {
            <p class="muted" i18n="@@company.firstAdminHelp">
              The administrator chooses their own password from a one-time invitation.
            </p>
            <button
              class="secondary"
              type="button"
              [disabled]="store.busy()"
              (click)="resend(item.id)"
              i18n="@@company.resend"
            >
              Resend first admin invitation
            </button>
          }
        </section>
      </div>
      <section class="panel" aria-labelledby="status-title">
        <div class="toolbar">
          <h2 id="status-title" i18n="@@company.statusTitle">Company status</h2>
          @if (item.accessState === 'ReadOnlyGrace') {
            <button
              class="secondary"
              type="button"
              [disabled]="store.busy()"
              (click)="confirmingEndGrace.set(true)"
              i18n="@@company.endGrace"
            >
              End the grace now
            </button>
          } @else {
            @if (item.isActive) {
              <button
                class="secondary"
                type="button"
                [disabled]="store.busy()"
                (click)="openGrace(item.id)"
                i18n="@@company.startGrace"
              >
                Start a read-only grace
              </button>
            }
            <button
              class="secondary"
              type="button"
              [disabled]="store.busy()"
              (click)="openStatus(item.id)"
            >
              @if (item.isActive) {
                <ng-container i18n="@@company.suspend">Suspend company</ng-container>
              } @else {
                <ng-container i18n="@@company.reactivate">Reactivate company</ng-container>
              }
            </button>
          }
        </div>
        @if (item.accessState === 'ReadOnlyGrace') {
          <p data-testid="company-grace" i18n="@@company.graceState">
            Read-only until <bdi>{{ item.graceEndsAtUtc | businessDate: 'instant' }}</bdi
            >: members sign in, read and export, but nothing is created, changed or sent.
          </p>
          @if (item.graceEndState === 'Active') {
            <p i18n="@@company.graceThenPlan">
              Then the new plan applies and the company is active again.
            </p>
          } @else {
            <p i18n="@@company.graceThenSuspended">Then the company is suspended.</p>
          }
        } @else {
          <p i18n="@@company.suspendHelp">
            Suspension denies tenant access and preserves all company data.
          </p>
        }
      </section>

      <!-- CF-079 (ADR-143): a new Company Admin after the only one was lost — two operators, a written request. -->
      @if (item.isActive) {
        <section class="panel" aria-labelledby="recovery-title" data-testid="admin-recovery">
          <h2 id="recovery-title" i18n="@@recovery.title">Company Admin recovery</h2>
          <p class="muted" i18n="@@recovery.help">
            Only when the company has lost its only Company Admin, on its written request: one
            operator asks, a second operator approves, and the new Company Admin receives the normal
            invitation. Every Company Admin is told and sees it in the company's audit log.
          </p>
          @for (recovery of recoveries(); track recovery.id) {
            @if (recovery.status === 'Pending') {
              <p data-testid="recovery-pending" i18n="@@recovery.pending">
                <bdi dir="ltr">{{ recovery.email }}</bdi> on request
                <bdi>{{ recovery.requestReference }}</bdi
                >, asked by <bdi>{{ recovery.requestedByName ?? recovery.requestedBy }}</bdi
                >.
              </p>
              <div class="actions">
                @if (recovery.requestedBy === me()) {
                  <span class="muted" i18n="@@recovery.waiting"
                    >Waiting for a second operator.</span
                  >
                } @else {
                  <button
                    type="button"
                    [disabled]="store.busy()"
                    (click)="decide(recovery.id, 'approve')"
                    i18n="@@recovery.approve"
                  >
                    Approve and invite
                  </button>
                }
                <button
                  class="secondary"
                  type="button"
                  [disabled]="store.busy()"
                  (click)="decide(recovery.id, 'cancel')"
                  i18n="@@recovery.cancel"
                >
                  Cancel the request
                </button>
              </div>
            }
          }
          @if (!hasPending()) {
            <label for="recovery-email" i18n="@@recovery.email"
              >New Company Admin's email (an allowed domain)</label
            >
            <input id="recovery-email" dir="ltr" type="email" [(ngModel)]="recoveryEmail" />
            <label for="recovery-name" i18n="@@recovery.name">Name</label>
            <input id="recovery-name" maxlength="160" [(ngModel)]="recoveryName" />
            <label for="recovery-reference" i18n="@@recovery.reference"
              >Customer's written request (reference)</label
            >
            <input id="recovery-reference" maxlength="200" [(ngModel)]="recoveryReference" />
            <button
              class="secondary"
              type="button"
              [disabled]="
                store.busy() ||
                !recoveryEmail.trim() ||
                !recoveryName.trim() ||
                recoveryReference.trim().length < 3
              "
              (click)="requestRecovery()"
              i18n="@@recovery.request"
            >
              Ask a second operator to approve
            </button>
          }
        </section>
      }

      <!-- OD-20 (ADR-139): the company's country and the residency policy it is placed under. -->
      @if (item.accessState !== 'Purged') {
        <section class="panel" aria-labelledby="residency-title" data-testid="company-residency">
          <h2 id="residency-title" i18n="@@company.residencyTitle">Data residency</h2>
          @if (placedPolicy(item); as placed) {
            <p i18n="@@company.residencyPlaced">
              <bdi dir="ltr">{{ item.countryCode }}</bdi> · <bdi>{{ placed.name }}</bdi> — data kept
              in <bdi dir="ltr" class="ltr-token">{{ placed.region }}</bdi
              >, at least <bdi dir="ltr">{{ placed.minimumRetentionDays }}</bdi> days before a
              deletion
            </p>
            @if (item.residencyOverrideReason) {
              <p class="muted" i18n="@@company.residencyOverride">
                Not the policy recommended for its country:
                <bdi>{{ item.residencyOverrideReason }}</bdi>
              </p>
            }
          } @else {
            <p class="muted" i18n="@@company.residencyNone">
              Not placed under a residency policy yet.
            </p>
          }
          <label for="residency-country" i18n="@@company.residencyCountry"
            >Company country (two-letter code)</label
          >
          <input
            id="residency-country"
            dir="ltr"
            maxlength="2"
            [ngModel]="residencyCountry()"
            (ngModelChange)="residencyCountry.set($event.toUpperCase())"
          />
          <label for="residency-policy" i18n="@@company.residencyPolicy">Residency policy</label>
          <select id="residency-policy" [(ngModel)]="residencyPolicyId">
            <option value="" i18n="@@companies.chooseMode">Choose</option>
            @for (policy of assignablePolicies(); track policy.id) {
              <option [value]="policy.id">
                {{ policy.name }} ({{ policy.region }})
                @if (recommended(policy)) {
                  — {{ recommendedLabel }}
                }
              </option>
            }
          </select>
          @if (needsReason()) {
            <label for="residency-reason" i18n="@@company.residencyReason"
              >Why not the policy recommended for this country</label
            >
            <textarea
              id="residency-reason"
              rows="2"
              maxlength="500"
              [(ngModel)]="residencyReason"
            ></textarea>
          }
          <button
            class="secondary"
            type="button"
            [disabled]="store.busy() || residencyCountry().length !== 2 || !residencyPolicyId"
            (click)="placeResidency()"
            i18n="@@company.residencySave"
          >
            Place under this policy
          </button>
        </section>
      }

      <!-- CF-127 / OD-15 (ADR-138): the commercial footing — shown to the operator, read by no control. -->
      @if (item.accessState !== 'Purged') {
        <section class="panel" aria-labelledby="commercial-title" data-testid="company-commercial">
          <h2 id="commercial-title" i18n="@@company.commercialTitle">Commercial terms</h2>
          <p><app-commercial-chip [company]="item" /></p>
          @if (item.commercialReference) {
            <p class="muted" i18n="@@company.commercialReferenceShown">
              Contract <bdi>{{ item.commercialReference }}</bdi>
            </p>
          }
          @if (editingTerms()) {
            <label for="terms-mode" i18n="@@companies.commercialMode">Mode</label>
            <select id="terms-mode" [(ngModel)]="termsMode">
              @for (mode of modes; track mode) {
                <option [value]="mode">{{ modeLabel(mode) }}</option>
              }
            </select>
            <label for="terms-starts" i18n="@@companies.commercialStarts">Starts on</label>
            <input id="terms-starts" type="date" [(ngModel)]="termsStartsOn" />
            <label for="terms-ends" i18n="@@companies.commercialEnds"
              >Ends on (required for a pilot)</label
            >
            <input id="terms-ends" type="date" [(ngModel)]="termsEndsOn" />
            <label for="terms-reference" i18n="@@companies.commercialReference"
              >Contract reference</label
            >
            <input id="terms-reference" maxlength="200" [(ngModel)]="termsReference" />
            <div class="actions">
              <button
                type="button"
                [disabled]="
                  store.busy() || !termsStartsOn || (termsMode !== 'Subscribed' && !termsEndsOn)
                "
                (click)="saveTerms()"
                i18n="@@company.saveTerms"
              >
                Save commercial terms
              </button>
              <button
                class="secondary"
                type="button"
                (click)="editingTerms.set(false)"
                i18n="@@common.cancel"
              >
                Cancel
              </button>
            </div>
          } @else {
            <button
              class="secondary"
              type="button"
              [disabled]="store.busy()"
              (click)="editTerms(item)"
              i18n="@@company.editTerms"
            >
              Record commercial terms
            </button>
          }
          <p class="muted" i18n="@@companies.commercialHelp">
            Recorded for the operator only. A paid pilot gets exactly the same security, access and
            plan rules as any other company; nothing is billed.
          </p>
        </section>
      }

      <!-- OD-16 (ADR-135): whether this company's intelligence evidence may ever leave it. -->
      @if (item.accessState !== 'Purged') {
        <section class="panel" aria-labelledby="reuse-title" data-testid="company-reuse">
          <h2 id="reuse-title" i18n="@@company.reuseTitle">Use of this company's data elsewhere</h2>
          @if (item.intelligenceReuse === 'AnonymizedAggregate') {
            <p i18n="@@company.reuseAggregate">
              Anonymised aggregates allowed, on the recorded legal basis:
              <bdi>{{ item.intelligenceReuseLegalBasis }}</bdi>
            </p>
          } @else {
            <p i18n="@@company.reuseTenantOnly">
              This company only: its records and the intelligence computed from them serve this
              company alone.
            </p>
          }
          <p class="muted" i18n="@@company.reuseHelp">
            No cross-company aggregate exists in the product today: this setting only records the
            customer's permission and its legal basis. Under either setting the company's data is
            deleted with it.
          </p>
          @if (item.intelligenceReuse === 'AnonymizedAggregate') {
            <button
              class="secondary"
              type="button"
              [disabled]="store.busy()"
              (click)="setReuse('TenantOnly')"
              i18n="@@company.reuseRevoke"
            >
              Return to this company only
            </button>
          } @else {
            <label for="reuse-basis" i18n="@@company.reuseBasis"
              >Legal basis (the agreement and its clause)</label
            >
            <textarea
              id="reuse-basis"
              rows="2"
              maxlength="1000"
              [(ngModel)]="reuseBasis"
            ></textarea>
            <button
              class="secondary"
              type="button"
              [disabled]="store.busy() || reuseBasis.trim().length < 20"
              (click)="setReuse('AnonymizedAggregate')"
              i18n="@@company.reuseAllow"
            >
              Allow anonymised aggregates
            </button>
          }
        </section>
      }

      <!-- CF-071 (ADR-134): deletion of a suspended company's data, on the customer's written request. -->
      @if (item.accessState === 'Purged') {
        <section class="panel" aria-labelledby="purge-title" data-testid="company-purged">
          <h2 id="purge-title" i18n="@@company.purgeTitle">Company data</h2>
          <p i18n="@@company.purged">
            Every record and file of this company was deleted on
            <bdi>{{ item.purgedAtUtc | businessDate: 'instant' }}</bdi
            >. The deletion certificate is in the platform audit.
          </p>
          @if (certificate(); as done) {
            <p data-testid="purge-certificate" i18n="@@company.purgeCertificate">
              Deleted <bdi dir="ltr">{{ done.totalRows }}</bdi> records and
              <bdi dir="ltr">{{ done.files }}</bdi> files on request
              <bdi>{{ done.requestReference }}</bdi
              >.
            </p>
          }
        </section>
      } @else if (item.accessState === 'Suspended') {
        <section class="panel" aria-labelledby="purge-title" data-testid="company-purge">
          <h2 id="purge-title" i18n="@@company.purgeTitle">Company data</h2>
          @if (item.purgeAfterUtc) {
            <p i18n="@@company.purgeScheduled">
              Deletion scheduled for
              <bdi>{{ item.purgeAfterUtc | businessDate: 'instant' }}</bdi> on request
              <bdi>{{ item.purgeRequestReference }}</bdi
              >. Reactivating the company cancels it.
            </p>
            <div class="actions">
              <button
                class="secondary"
                type="button"
                [disabled]="store.busy()"
                (click)="cancelPurge()"
                i18n="@@company.cancelPurge"
              >
                Cancel the deletion
              </button>
              @if (purgeDue(item)) {
                <button
                  class="danger"
                  type="button"
                  [disabled]="store.busy()"
                  (click)="confirmCode = ''; confirmingPurge.set(true)"
                  i18n="@@company.runPurge"
                >
                  Delete the company's data now
                </button>
              }
            </div>
          } @else {
            <p class="muted" i18n="@@company.purgeHelp">
              On the customer's written request, after its export was delivered, schedule the
              deletion of every record and file. It runs no earlier than the agreed retention.
            </p>
            <label for="purge-reference" i18n="@@company.purgeReference"
              >Customer's written request (reference)</label
            >
            <input id="purge-reference" type="text" maxlength="200" [(ngModel)]="purgeReference" />
            <label for="purge-days" i18n="@@company.purgeDays"
              >Delete no earlier than (days from now)</label
            >
            <input id="purge-days" type="number" min="1" max="365" [(ngModel)]="purgeDays" />
            <button
              class="secondary"
              type="button"
              [disabled]="store.busy() || purgeReference.trim().length < 3"
              (click)="schedulePurge()"
              i18n="@@company.schedulePurge"
            >
              Schedule the deletion
            </button>
          }
        </section>
      }

      @if (confirmingPurge()) {
        <app-confirm-dialog
          [heading]="purgeTitle"
          [confirmLabel]="purgeLabel"
          [danger]="true"
          [busy]="store.busy()"
          (confirmed)="purge()"
          (cancelled)="confirmingPurge.set(false)"
        >
          <p i18n="@@company.purgeConsequence">
            Every record and stored file of <bdi>{{ item.name }}</bdi> is deleted permanently, under
            the maintenance credential. This cannot be undone. Type the company code to confirm.
          </p>
          <label for="purge-code" i18n="@@company.purgeCode">Company code</label>
          <input id="purge-code" type="text" dir="ltr" [(ngModel)]="confirmCode" />
        </app-confirm-dialog>
      }

      @if (confirmingStatus()) {
        <app-confirm-dialog
          [heading]="item.isActive ? suspendTitle : reactivateTitle"
          [confirmLabel]="item.isActive ? suspendLabel : reactivateLabel"
          [danger]="item.isActive"
          [busy]="store.busy()"
          (confirmed)="toggle()"
          (cancelled)="confirmingStatus.set(false)"
        >
          @if (item.isActive) {
            <p i18n="@@company.suspendConsequence">
              Every user of <bdi>{{ item.name }}</bdi> loses access at their next request, including
              Company Admins. Projects, users and all other data are kept unchanged, and nothing is
              deleted.
            </p>
            <app-in-flight-counts [counts]="store.inFlight()" />
            @if ((store.inFlight()?.total ?? 0) > 0) {
              <label class="checkbox">
                <input id="confirm-in-flight" type="checkbox" [(ngModel)]="acknowledged" />
                <ng-container i18n="@@company.confirmInFlight"
                  >I understand this freezes the work above. A read-only grace would let it wind
                  down instead.</ng-container
                >
              </label>
            }
          } @else {
            <p i18n="@@company.reactivateConsequence">
              Users of <bdi>{{ item.name }}</bdi> can sign in again, subject to the company’s access
              policy and their own account status.
            </p>
          }
        </app-confirm-dialog>
      }

      @if (confirmingGrace()) {
        <app-confirm-dialog
          [heading]="graceTitle"
          [confirmLabel]="graceLabel"
          [busy]="store.busy()"
          (confirmed)="startGrace()"
          (cancelled)="confirmingGrace.set(false)"
        >
          <p i18n="@@company.graceConsequence">
            Users of <bdi>{{ item.name }}</bdi> can still sign in, read and export their data, but
            nothing can be created, changed or sent, and bidders see their tenders as paused. When
            the grace ends the company is suspended.
          </p>
          <label for="grace-days" i18n="@@company.graceDays">Days of read-only access (1–90)</label>
          <input id="grace-days" type="number" min="1" max="90" [(ngModel)]="graceDays" />
          <app-in-flight-counts [counts]="store.inFlight()" />
        </app-confirm-dialog>
      }

      @if (confirmingEndGrace()) {
        <app-confirm-dialog
          [heading]="endGraceTitle"
          [confirmLabel]="endGraceLabel"
          [danger]="item.graceEndState !== 'Active'"
          [busy]="store.busy()"
          (confirmed)="endGrace()"
          (cancelled)="confirmingEndGrace.set(false)"
        >
          @if (item.graceEndState === 'Active') {
            <p i18n="@@company.endGraceToPlan">
              The new plan applies now and the company is active again.
            </p>
          } @else {
            <p i18n="@@company.endGraceToSuspended">The company is suspended now.</p>
          }
        </app-confirm-dialog>
      }
    }
  `,
})
export class CompanyOverview {
  protected readonly store = inject(CompanyStore);
  private readonly api = inject(PlatformApi);
  protected readonly firstAdminState = firstAdminStateLabel;
  protected readonly mailLabel = identityMailLabel;
  protected readonly renaming = signal(false);
  protected readonly confirmingStatus = signal(false);
  protected readonly suspendTitle = $localize`:@@company.suspendTitle:Suspend this company?`;
  protected readonly reactivateTitle = $localize`:@@company.reactivateTitle:Reactivate this company?`;
  protected readonly suspendLabel = $localize`:@@company.suspend:Suspend company`;
  protected readonly reactivateLabel = $localize`:@@company.reactivate:Reactivate company`;
  protected readonly confirmingGrace = signal(false);
  protected readonly confirmingEndGrace = signal(false);
  protected readonly graceTitle = $localize`:@@company.graceTitle:Make this company read-only for a while?`;
  protected readonly graceLabel = $localize`:@@company.startGrace:Start a read-only grace`;
  protected readonly endGraceTitle = $localize`:@@company.endGraceTitle:End the read-only grace now?`;
  protected readonly endGraceLabel = $localize`:@@company.endGrace:End the grace now`;
  name = '';
  /** CF-071 (ADR-134): the deletion's request reference, delay, typed code, and its certificate once run. */
  purgeReference = '';
  purgeDays = 30;
  confirmCode = '';
  protected readonly confirmingPurge = signal(false);
  protected readonly certificate = signal<CompanyPurgeCertificate | null>(null);
  protected readonly purgeTitle = $localize`:@@company.purgeConfirmTitle:Delete this company's data permanently?`;
  protected readonly purgeLabel = $localize`:@@company.runPurge:Delete the company's data now`;

  purgeDue(company: Company): boolean {
    return !!company.purgeAfterUtc && new Date(company.purgeAfterUtc).getTime() <= Date.now();
  }

  private readonly operatorSession = inject(PlatformSessionService);
  protected readonly recoveries = signal<AdminRecovery[]>([]);
  recoveryEmail = '';
  recoveryName = '';
  recoveryReference = '';

  protected me(): string | undefined {
    return this.operatorSession.identity()?.id;
  }

  protected hasPending(): boolean {
    return this.recoveries().some((recovery) => recovery.status === 'Pending');
  }

  private loadRecoveries(): void {
    const company = this.store.company();
    if (!company) return;
    this.api.adminRecoveries(company.id).subscribe({
      next: (items) => this.recoveries.set(items),
      error: () => this.recoveries.set([]),
    });
  }

  requestRecovery(): void {
    const company = this.store.company();
    if (!company || this.store.busy()) return;
    this.store.busy.set(true);
    this.store.error.set('');
    this.api
      .requestAdminRecovery(
        company.id,
        this.recoveryEmail.trim(),
        this.recoveryName.trim(),
        this.recoveryReference.trim(),
      )
      .subscribe({
        next: () => {
          this.store.busy.set(false);
          this.recoveryEmail = '';
          this.recoveryName = '';
          this.recoveryReference = '';
          this.store.notice.set(
            $localize`:@@recovery.requested:The recovery is waiting for a second operator's approval.`,
          );
          this.loadRecoveries();
        },
        error: (error: unknown) => {
          this.store.busy.set(false);
          this.store.error.set(problemMessage(error));
        },
      });
  }

  decide(recoveryId: string, decision: 'approve' | 'cancel'): void {
    const company = this.store.company();
    if (!company || this.store.busy()) return;
    this.store.busy.set(true);
    this.store.error.set('');
    this.api.decideAdminRecovery(company.id, recoveryId, decision).subscribe({
      next: () => {
        this.store.busy.set(false);
        this.store.notice.set(
          decision === 'approve'
            ? $localize`:@@recovery.approved:The new Company Admin was invited; every Company Admin was told.`
            : $localize`:@@recovery.cancelled:The recovery request was cancelled.`,
        );
        this.loadRecoveries();
      },
      error: (error: unknown) => {
        this.store.busy.set(false);
        this.store.error.set(problemMessage(error));
      },
    });
  }

  protected readonly residency = signal<ResidencyPolicies | null>(null);
  protected readonly residencyCountry = signal('');
  residencyPolicyId = '';
  residencyReason = '';
  protected readonly recommendedLabel = $localize`:@@company.residencyRecommended:recommended`;

  constructor() {
    this.loadRecoveries();
    this.api.residencyPolicies().subscribe({
      next: (view) => this.residency.set(view),
      error: () => this.residency.set(null),
    });
  }

  protected placedPolicy(company: Company): ResidencyPolicy | null {
    return (
      this.residency()?.policies.find((policy) => policy.id === company.residencyPolicyId) ?? null
    );
  }

  /** Only active policies kept in this deployment's region can be assigned here. */
  protected assignablePolicies(): ResidencyPolicy[] {
    const view = this.residency();
    return (view?.policies ?? []).filter(
      (policy) => policy.isActive && policy.region === view?.deploymentRegion,
    );
  }

  protected recommended(policy: ResidencyPolicy): boolean {
    return policy.recommendedCountries.includes(this.residencyCountry());
  }

  /** A reason is needed when another policy is recommended for the country and this one is not. */
  protected needsReason(): boolean {
    const chosen = this.assignablePolicies().find((policy) => policy.id === this.residencyPolicyId);
    const country = this.residencyCountry();
    const anyRecommended = (this.residency()?.policies ?? []).some(
      (policy) => policy.isActive && policy.recommendedCountries.includes(country),
    );
    return !!chosen && anyRecommended && !chosen.recommendedCountries.includes(country);
  }

  placeResidency(): void {
    const company = this.store.company();
    if (!company) return;
    this.store.apply(
      this.api.setResidency(
        company.id,
        this.residencyCountry(),
        this.residencyPolicyId,
        this.needsReason() ? this.residencyReason.trim() : null,
        company.version,
      ),
      $localize`:@@company.residencyPlacedNotice:The residency is recorded in the platform audit.`,
      () => (this.residencyReason = ''),
    );
  }

  protected readonly editingTerms = signal(false);
  protected readonly modes: readonly CommercialMode[] = ['Pilot', 'PaidPilot', 'Subscribed'];
  protected readonly modeLabel = commercialModeLabel;
  termsMode: CommercialMode = 'Pilot';
  termsStartsOn = '';
  termsEndsOn = '';
  termsReference = '';

  editTerms(company: Company): void {
    this.termsMode = company.commercialMode ?? 'Pilot';
    this.termsStartsOn = company.commercialStartsOn ?? new Date().toISOString().slice(0, 10);
    this.termsEndsOn = company.commercialEndsOn ?? '';
    this.termsReference = company.commercialReference ?? '';
    this.editingTerms.set(true);
  }

  saveTerms(): void {
    const company = this.store.company();
    if (!company) return;
    this.store.apply(
      this.api.setCommercialTerms(
        company.id,
        {
          mode: this.termsMode,
          startsOn: this.termsStartsOn,
          endsOn: this.termsEndsOn || null,
          reference: this.termsReference.trim() || null,
        },
        company.version,
      ),
      $localize`:@@company.termsSaved:The commercial terms are recorded in the platform audit.`,
      () => this.editingTerms.set(false),
    );
  }

  reuseBasis = '';

  setReuse(policy: IntelligenceReusePolicy): void {
    const company = this.store.company();
    if (!company) return;
    this.store.apply(
      this.api.setIntelligenceReuse(
        company.id,
        policy,
        policy === 'TenantOnly' ? null : this.reuseBasis.trim(),
        company.version,
      ),
      policy === 'TenantOnly'
        ? $localize`:@@company.reuseRevokedNotice:This company's data now serves this company only.`
        : $localize`:@@company.reuseAllowedNotice:The permission and its legal basis are recorded in the platform audit.`,
      () => (this.reuseBasis = ''),
    );
  }

  schedulePurge(): void {
    const company = this.store.company();
    if (!company) return;
    this.store.apply(
      this.api.schedulePurge(
        company.id,
        Number(this.purgeDays),
        this.purgeReference.trim(),
        company.version,
      ),
      $localize`:@@company.purgeScheduledNotice:The deletion is scheduled. It can run once the date has passed.`,
    );
  }

  cancelPurge(): void {
    const company = this.store.company();
    if (!company) return;
    this.store.apply(
      this.api.cancelPurge(company.id, company.version),
      $localize`:@@company.purgeCancelled:The scheduled deletion was cancelled.`,
    );
  }

  purge(): void {
    const company = this.store.company();
    if (!company || this.store.busy()) return;
    this.store.busy.set(true);
    this.store.error.set('');
    this.api.purge(company.id, this.confirmCode.trim(), company.version).subscribe({
      next: (certificate) => {
        this.store.busy.set(false);
        this.certificate.set(certificate);
        this.confirmingPurge.set(false);
        this.store.notice.set(
          $localize`:@@company.purgedNotice:The company's data was deleted. The certificate is recorded in the platform audit.`,
        );
        this.store.reload();
      },
      error: (error: unknown) => {
        this.store.busy.set(false);
        this.confirmingPurge.set(false);
        this.store.error.set(problemMessage(error));
      },
    });
  }
  /** CF-061: the second confirmation of a suspension over work in progress. */
  acknowledged = false;
  graceDays = 30;

  openStatus(id: string): void {
    this.acknowledged = false;
    if (this.store.company()?.isActive) this.store.loadInFlight(id);
    this.confirmingStatus.set(true);
  }

  openGrace(id: string): void {
    this.graceDays = 30;
    this.store.loadInFlight(id);
    this.confirmingGrace.set(true);
  }

  startGrace(): void {
    const company = this.store.company();
    if (!company) return;
    this.store.apply(
      this.api.startGrace(company.id, Number(this.graceDays), null, company.version),
      $localize`:@@company.graceStarted:The company is read-only until its grace ends. Bidders see their tenders as paused.`,
      undefined,
      () => this.confirmingGrace.set(false),
    );
  }

  endGrace(): void {
    const company = this.store.company();
    if (!company) return;
    this.store.apply(
      this.api.endGrace(company.id, company.version),
      $localize`:@@company.graceEnded:The grace has ended and its recorded outcome applies.`,
      undefined,
      () => this.confirmingEndGrace.set(false),
    );
  }

  startRename(current: string): void {
    this.name = current;
    this.renaming.set(true);
  }

  rename(id: string, version: string): void {
    this.store.apply(
      this.api.renameCompany(id, this.name.trim(), version),
      $localize`:@@company.renamed:Company renamed. The code and every user account are unchanged.`,
      () => this.renaming.set(false),
    );
  }

  toggle(): void {
    const company = this.store.company();
    if (!company) return;
    // CF-061 (ADR-133): suspending over work in progress needs the explicit second confirmation.
    const frozen = company.isActive ? (this.store.inFlight()?.total ?? 0) : 0;
    if (frozen > 0 && !this.acknowledged) {
      this.store.error.set(
        $localize`:@@company.confirmInFlightRequired:Confirm that this freezes the work in progress, or start a read-only grace instead.`,
      );
      return;
    }
    this.store.apply(
      this.api.companyStatus(company.id, !company.isActive, company.version, frozen > 0),
      company.isActive
        ? $localize`:@@company.suspended:Company suspended. Tenant access is denied; data is retained.`
        : $localize`:@@company.reactivated:Company reactivated, subject to its access policy.`,
      undefined,
      () => this.confirmingStatus.set(false),
    );
  }

  resend(id: string): void {
    this.store.run(
      this.api.resendFirstAdminInvitation(id),
      $localize`:@@company.resent:A new one-time invitation was issued. The previous invitation is invalid.`,
    );
  }
}
