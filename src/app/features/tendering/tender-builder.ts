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
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { Observable, catchError, map, of, switchMap } from 'rxjs';
import { EntitlementsService } from '../../core/auth/entitlements.service';
import { RoleHoldersService } from '../../core/auth/role-holders.service';
import { SessionService } from '../../core/auth/session.service';
import { BusinessDatePipe } from '../../core/localization/business-format';
import {
  mailFailureLabel,
  roleList,
  subcontractorStatusLabel,
  tenderFieldLabel,
  tenderTypeLabel,
} from '../../core/localization/labels';
import { LocaleService } from '../../core/localization/locale.service';
import { knownProductProblem } from '../../core/localization/product-problem';
import { ConfirmDialog } from '../../shared/ui/confirm-dialog';
import {
  DOCUMENT_ACCEPT,
  MAX_DOCUMENT_BYTES,
  MAX_REMINDERS,
  REASON_MAX,
  REASON_MIN,
  REMINDER_DAY_OPTIONS,
  RecipientOption,
  ShortlistMember,
  TENDER_PERMISSIONS,
  TENDER_TYPES,
  TenderDetail,
  TenderDocument,
  TenderDraftInput,
  TenderEmailPreview,
  InviteAllResult,
  TenderInvitation,
  TenderType,
  TenderingApi,
  describeLocal,
  fileSize,
  isStale,
  tenderProblemMessage,
  timeZoneOptions,
  VAT_TREATMENTS,
  VatTreatment,
  ScheduleItemInput,
  scheduleInput,
  scheduleRequest,
} from './tendering.api';
import { vatTreatmentLabel } from '../evaluation/evaluation-labels';
import { EVALUATION_FEATURES, EVALUATION_PERMISSIONS } from '../evaluation/evaluation.api';
import { AWARD_FEATURES, DECISION_PERMISSIONS } from '../decision/decision.api';
import { ScheduleEditor } from './schedule-editor';
import { ErrorSummary } from '../../shared/ui/error-summary';
import { localDateTimeParts } from '../../core/localization/zoned-time';

export type BuilderStep = 'basics' | 'documents' | 'requirements' | 'invitees' | 'dates' | 'review';

interface DraftForm {
  type: TenderType;
  title: string;
  scopeInstructions: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  emailLocale: 'en' | 'ar';
  bidValidityDays: string;
  technicalProposalRequired: boolean;
  durationRequired: boolean;
  vatTreatment: VatTreatment | '';
  vatRatePercent: string;
  pricingNote: string;
  evaluationPolicyId: string;
  recommendationPolicyId: string;
  criteriaDisclosed: boolean;
  retentionPercent: string;
  advancePaymentPercent: string;
  performanceSecurityPercent: string;
  bidBondRequired: boolean;
  paymentTermsNote: string;
  schedule: ScheduleItemInput[];
  requiredDocuments: string;
  submissionInstructions: string;
  timeZoneId: string;
  submissionDeadlineLocal: string;
  questionsDeadlineLocal: string;
  reminderDays: number[];
}

type Dialog =
  | { readonly kind: 'publish' }
  | { readonly kind: 'cancel' }
  | { readonly kind: 'removeDocument'; readonly document: TenderDocument }
  | { readonly kind: 'removeInvitee'; readonly invitation: TenderInvitation };

/**
 * The step-based Tender Builder: basics, documents, bidder requirements, invitees from the approved
 * shortlist, dates and reminders, then review and publish. Each step saves the whole draft with the
 * version the screen holds; nothing a bidder will see is sent until publication.
 */
@Component({
  selector: 'app-tender-builder',
  imports: [FormsModule, BusinessDatePipe, ConfirmDialog, ScheduleEditor, ErrorSummary],
  templateUrl: './tender-builder.html',
  styleUrl: './tendering.scss',
})
export class TenderBuilder {
  private readonly api = inject(TenderingApi);
  private readonly session = inject(SessionService);
  private readonly http = inject(HttpClient);
  private readonly entitlements = inject(EntitlementsService);
  private readonly roleHolders = inject(RoleHoldersService);
  readonly locale = inject(LocaleService).locale;

  readonly tender = input.required<TenderDetail>();
  readonly changed = output<TenderDetail>();
  readonly announce = output<string>();
  readonly reloadRequested = output<string>();

  readonly steps: readonly BuilderStep[] = [
    'basics',
    'documents',
    'requirements',
    'invitees',
    'dates',
    'review',
  ];
  readonly types = TENDER_TYPES;
  readonly reminderOptions = REMINDER_DAY_OPTIONS;
  readonly maxReminders = MAX_REMINDERS;
  readonly accept = DOCUMENT_ACCEPT;
  readonly maxMegabytes = MAX_DOCUMENT_BYTES / (1024 * 1024);
  readonly reasonMin = REASON_MIN;
  readonly reasonMax = REASON_MAX;
  readonly typeLabel = tenderTypeLabel;
  readonly standingLabel = subcontractorStatusLabel;
  readonly fieldLabel = tenderFieldLabel;
  readonly failureLabel = mailFailureLabel;
  readonly size = (bytes: number) => fileSize(bytes, this.locale);

  readonly step = signal<BuilderStep>('basics');
  readonly busy = signal(false);
  readonly error = signal('');
  readonly dialog = signal<Dialog | null>(null);
  readonly dialogError = signal('');
  readonly preview = signal<TenderEmailPreview | null>(null);
  readonly previewError = signal('');
  readonly zones = signal<readonly string[]>([]);
  /**
   * CF-013 AC3: a non-blocking warning when no scorecard / recommendation policy is active, naming the roles that may activate one
   * (S-ROLES). Empty when there is nothing to warn about — or when it could not be read (ADR-165: what cannot be read is left out).
   */
  readonly policyWarnings = signal<readonly string[]>([]);
  readonly submitted = signal(false);

  form: DraftForm = this.emptyForm();
  private baseline = '';
  private seenVersion = '';
  private ownVersion = '';
  /** The contact chosen for each shortlist member before it is added, keyed by subcontractor. */
  choices: Record<string, string> = {};
  cancelReason = '';

  readonly canEdit = computed(
    () => this.session.hasPermission(TENDER_PERMISSIONS.edit) && this.tender().lockReason === null,
  );
  readonly canPublish = computed(
    () =>
      this.session.hasPermission(TENDER_PERMISSIONS.publish) && this.tender().lockReason === null,
  );
  readonly canCancel = computed(() => this.session.hasPermission(TENDER_PERMISSIONS.cancel));
  readonly lockMessage = computed(() => {
    const reason = this.tender().lockReason;
    return reason ? (knownProductProblem({ code: reason }) ?? '') : '';
  });
  readonly invitees = computed(() => this.tender().invitations);
  readonly members = computed(() => this.tender().approvedShortlist?.members ?? []);
  readonly inviteeWarnings = computed(() =>
    this.invitees().filter(
      (invitation) =>
        !invitation.onApprovedShortlist ||
        (invitation.currentStanding && invitation.currentStanding !== 'Active'),
    ),
  );

  constructor() {
    // The form follows the server's draft when it first arrives and whenever it changes elsewhere; a change
    // this builder made itself (an invitee or a document) never discards what is being typed.
    effect(() => {
      const tender = this.tender();
      untracked(() => {
        if (tender.version === this.seenVersion) return;
        const external = tender.version !== this.ownVersion;
        this.seenVersion = tender.version;
        if (external || !this.baseline) this.resetForm(tender);
        this.zones.set(timeZoneOptions(tender.timeZoneId));
      });
    });
  }

  can(permission: string): boolean {
    return this.session.hasPermission(permission);
  }

  stepLabel(step: BuilderStep): string {
    return {
      basics: $localize`:@@tenderBuilder.stepBasics:Basics`,
      documents: $localize`:@@tenderBuilder.stepDocuments:Documents`,
      requirements: $localize`:@@tenderBuilder.stepRequirements:Bidder requirements`,
      invitees: $localize`:@@tenderBuilder.stepInvitees:Invitees`,
      dates: $localize`:@@tenderBuilder.stepDates:Dates & reminders`,
      review: $localize`:@@tenderBuilder.stepReview:Review & publish`,
    }[step];
  }

  /** Whether a step has what publication needs (for the step list's status text). */
  stepComplete(step: BuilderStep): boolean {
    const missing = this.tender().missingForPublication;
    switch (step) {
      case 'basics':
        return !missing.some((field) =>
          ['scopeInstructions', 'contactName', 'contactEmail'].includes(field),
        );
      case 'requirements':
        return !missing.includes('currency');
      case 'invitees':
        return !missing.includes('invitees') && this.inviteeWarnings().length === 0;
      case 'dates':
        return !missing.includes('submissionDeadline');
      default:
        return true;
    }
  }

  go(step: BuilderStep): void {
    this.error.set('');
    this.step.set(step);
    if (step === 'review') {
      this.loadPreview();
      this.loadPolicyWarnings();
    }
  }

  /** CF-013 AC3: reads the policies only where the plan has the stage and the reader may read them; publishing is never blocked. */
  private loadPolicyWarnings(): void {
    this.policyWarnings.set([]);
    const may = (...permissions: string[]) => permissions.some((key) => this.can(key));
    const planned = (features: readonly string[]) =>
      features.every((feature) => this.entitlements.has(feature));
    const checks: Observable<string | null>[] = [];
    if (
      planned(EVALUATION_FEATURES) &&
      may(EVALUATION_PERMISSIONS.view, EVALUATION_PERMISSIONS.managePolicy)
    )
      checks.push(
        this.warnWithoutActive(
          '/api/v1/evaluation-policies',
          EVALUATION_PERMISSIONS.managePolicy,
          (roles) =>
            roles
              ? $localize`:@@tenderBuilder.noScorecardPolicy:No scorecard policy is active. Bids can be received, but the evaluation cannot start until ${roles}:roles: activates one.`
              : $localize`:@@tenderBuilder.noScorecardPolicyUnnamed:No scorecard policy is active. Bids can be received, but the evaluation cannot start until one is activated.`,
        ),
      );
    if (
      planned(AWARD_FEATURES) &&
      may(DECISION_PERMISSIONS.view, DECISION_PERMISSIONS.managePolicy)
    )
      checks.push(
        this.warnWithoutActive(
          '/api/v1/recommendation-policies',
          DECISION_PERMISSIONS.managePolicy,
          (roles) =>
            roles
              ? $localize`:@@tenderBuilder.noRecommendationPolicy:No recommendation policy is active. Bids can be received, but the recommendation cannot be computed until ${roles}:roles: activates one.`
              : $localize`:@@tenderBuilder.noRecommendationPolicyUnnamed:No recommendation policy is active. Bids can be received, but the recommendation cannot be computed until one is activated.`,
        ),
      );
    for (const check of checks)
      check.subscribe({
        next: (warning) => {
          if (warning) this.policyWarnings.update((current) => [...current, warning]);
        },
        // A failed read shows no warning.
        error: () => undefined,
      });
  }

  private warnWithoutActive(
    url: string,
    owner: string,
    message: (roles: string | null) => string,
  ): Observable<string | null> {
    return this.http.get<readonly { status: string }[]>(url).pipe(
      switchMap((policies) =>
        policies.some((policy) => policy.status === 'Active')
          ? of(null)
          : // Re-audit O: the warning stands without the role names when they cannot be read (or no role holds the right).
            this.roleHolders.rolesWith(owner).pipe(
              map((roles) => message(roles.length ? roleList(roles, this.locale) : null)),
              catchError(() => of(message(null))),
            ),
      ),
    );
  }

  dirty(): boolean {
    return JSON.stringify(this.form) !== this.baseline;
  }

  /** Saves the whole draft, then moves on when a next step is given. */
  save(next?: BuilderStep): void {
    this.submitted.set(true);
    if (this.busy() || !this.canEdit()) return;
    if (this.clientErrors().length) {
      this.error.set(this.clientErrors()[0]);
      return;
    }
    if (!this.dirty()) {
      if (next) this.go(next);
      return;
    }
    this.busy.set(true);
    this.error.set('');
    this.api.update(this.tender().id, this.input(), this.tender().version).subscribe({
      next: (tender) => {
        this.busy.set(false);
        this.submitted.set(false);
        this.ownVersion = tender.version;
        this.resetForm(tender);
        this.changed.emit(tender);
        this.announce.emit($localize`:@@tenderBuilder.saved:Draft saved.`);
        if (next) this.go(next);
      },
      error: (error: unknown) => this.fail(error),
    });
  }

  /** CF-130 (ADR-097): tells the publisher the draft is waiting; any later change clears it. */
  requestPublish(): void {
    if (this.busy() || this.dirty()) return;
    this.busy.set(true);
    this.error.set('');
    this.api.requestPublish(this.tender().id, this.tender().version).subscribe({
      next: (tender) => {
        this.busy.set(false);
        this.ownVersion = tender.version;
        this.resetForm(tender);
        this.changed.emit(tender);
        this.announce.emit($localize`:@@tenderBuilder.requestedNotice:Marked ready to publish.`);
      },
      error: (error: unknown) => this.fail(error),
    });
  }

  /** Problems the server would refuse, stated before sending. The server re-decides everything. */
  clientErrors(): string[] {
    const errors: string[] = [];
    if (!this.form.title.trim()) errors.push(this.required('title'));
    for (const field of ['contactEmail'] as const)
      if (this.form[field].trim() && !validEmail(this.form[field]))
        errors.push(
          $localize`:@@tenderBuilder.emailInvalid:Enter a valid email address for ${tenderFieldLabel(field)}:field:.`,
        );
    const validity = this.form.bidValidityDays.trim();
    if (validity && (!/^\d+$/.test(validity) || +validity < 1 || +validity > 365))
      errors.push($localize`:@@tenderBuilder.validityInvalid:Bid validity must be 1 to 365 days.`);
    if (this.form.questionsDeadlineLocal && !this.form.submissionDeadlineLocal)
      errors.push(
        $localize`:@@tenderBuilder.questionsNeedsDeadline:Set the submission deadline before a questions deadline.`,
      );
    if (
      this.form.questionsDeadlineLocal &&
      this.form.submissionDeadlineLocal &&
      this.form.questionsDeadlineLocal >= this.form.submissionDeadlineLocal
    )
      errors.push(
        $localize`:@@tenderBuilder.questionsAfterDeadline:The questions deadline must be before the submission deadline.`,
      );
    if (this.form.reminderDays.length > MAX_REMINDERS)
      errors.push(
        $localize`:@@tenderBuilder.tooManyReminders:Choose at most ${MAX_REMINDERS}:max: reminder days.`,
      );
    return errors;
  }

  fieldInvalid(field: 'title'): boolean {
    return this.submitted() && field === 'title' && !this.form.title.trim();
  }

  toggleReminder(day: number, checked: boolean): void {
    const days = new Set(this.form.reminderDays);
    if (checked) days.add(day);
    else days.delete(day);
    this.form.reminderDays = [...days].sort((a, b) => b - a);
  }

  reminderDisabled(day: number): boolean {
    return !this.form.reminderDays.includes(day) && this.form.reminderDays.length >= MAX_REMINDERS;
  }

  /** When each chosen reminder would go out, in the tender's local time; null when it would already be due. */
  reminderPlan(): readonly { day: number; local: string | null }[] {
    const deadline = this.form.submissionDeadlineLocal;
    return this.form.reminderDays.map((day) => {
      if (!deadline) return { day, local: null };
      const [date, time] = deadline.split('T');
      const [y, m, d] = date.split('-').map(Number);
      const due = new Date(Date.UTC(y, m - 1, d - day));
      const local = `${due.toISOString().slice(0, 10)}T${time}`;
      return { day, local: local > nowLocal(this.form.timeZoneId) ? local : null };
    });
  }

  describe(local: string | null): string {
    if (!local) return '—';
    return describeLocal({ utc: '', local, offset: '' }, this.form.timeZoneId, this.locale);
  }

  deadlineShown(): string {
    const deadline = this.tender().submissionDeadline;
    return describeLocal(deadline, this.tender().timeZoneId, this.locale);
  }

  // -------------------------------------------------------------- documents

  upload(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file || this.busy() || !this.canEdit()) return;
    if (file.size > MAX_DOCUMENT_BYTES) {
      this.error.set(
        $localize`:@@tenderBuilder.fileTooLarge:${file.name}:name: is larger than ${this.maxMegabytes}:max: MB.`,
      );
      return;
    }
    this.busy.set(true);
    this.error.set('');
    this.api.uploadDocument(this.tender().id, file, this.tender().version).subscribe({
      next: (tender) => this.accepted(tender, $localize`:@@tenderBuilder.uploaded:Document added.`),
      error: (error: unknown) => this.fail(error),
    });
  }

  documentUrl(document: TenderDocument): string {
    return this.api.documentUrl(this.tender().id, document.id);
  }

  // -------------------------------------------------------------- invitees

  invitationOf(member: ShortlistMember): TenderInvitation | undefined {
    return this.invitees().find(
      (invitation) => invitation.subcontractorId === member.subcontractorId,
    );
  }

  emailContacts(member: ShortlistMember): readonly RecipientOption[] {
    return member.contacts.filter((contact) => !!contact.email);
  }

  chosenContact(member: ShortlistMember): string {
    return (this.choices[member.subcontractorId] ??=
      this.invitationOf(member)?.contactId ?? this.emailContacts(member)[0]?.contactId ?? '');
  }

  addInvitee(member: ShortlistMember): void {
    const contactId = this.chosenContact(member);
    if (!contactId || this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    this.api
      .addInvitee(this.tender().id, member.subcontractorId, contactId, this.tender().version)
      .subscribe({
        next: (tender) =>
          this.accepted(tender, $localize`:@@tenderBuilder.inviteeAdded:Invitee added.`),
        error: (error: unknown) => this.fail(error),
      });
  }

  /** CF-086 (ADR-101): the deadline is shorter than the company's normal bid period (publishing warns; below the minimum it is refused). */
  readonly shortBidPeriod = computed(() => {
    const tender = this.tender();
    const deadline = tender.submissionDeadline?.utc;
    const normalDays = tender.normalBidPeriodDays ?? 5;
    if (!deadline || tender.status !== 'Draft') return null;
    const left = Date.parse(deadline) - Date.now();
    return left < normalDays * 86_400_000
      ? { normalDays, minimumHours: tender.minimumBidPeriodHours ?? 1 }
      : null;
  });

  /** CF-057: every approved firm of the shortlist that has no invitation yet. */
  readonly uninvited = computed(() =>
    this.members().filter((member) => !this.invitationOf(member)),
  );
  readonly skipped = signal<InviteAllResult['skipped']>([]);

  /** CF-057: one action invites the whole approved shortlist; firms that cannot be invited are listed. */
  inviteAll(): void {
    if (this.busy() || !this.canEdit()) return;
    this.busy.set(true);
    this.error.set('');
    this.api.inviteAllShortlisted(this.tender().id, this.tender().version).subscribe({
      next: (result) => {
        this.skipped.set(result.skipped);
        this.accepted(
          result.tender,
          $localize`:@@tenderBuilder.invitedAll:Shortlisted firms invited.`,
        );
      },
      error: (error: unknown) => this.fail(error),
    });
  }

  changeRecipient(invitation: TenderInvitation, contactId: string): void {
    if (!contactId || contactId === invitation.contactId || this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    this.api
      .changeDraftRecipient(this.tender().id, invitation.id, contactId, this.tender().version)
      .subscribe({
        next: (tender) =>
          this.accepted(tender, $localize`:@@tenderBuilder.recipientChanged:Recipient changed.`),
        error: (error: unknown) => this.fail(error),
      });
  }

  memberFor(invitation: TenderInvitation): ShortlistMember | undefined {
    return this.members().find((member) => member.subcontractorId === invitation.subcontractorId);
  }

  // -------------------------------------------------------------- review, publish, cancel

  loadPreview(): void {
    this.previewError.set('');
    this.api.emailPreview(this.tender().id, 'invitation').subscribe({
      next: (preview) => this.preview.set(preview),
      error: (error: unknown) => this.previewError.set(tenderProblemMessage(error)),
    });
  }

  open(dialog: Dialog): void {
    this.dialogError.set('');
    this.cancelReason = '';
    this.dialog.set(dialog);
  }

  close(): void {
    if (!this.busy()) this.dialog.set(null);
  }

  confirm(): void {
    const dialog = this.dialog();
    if (!dialog || this.busy()) return;
    const tender = this.tender();
    let request;
    let message: string;
    switch (dialog.kind) {
      case 'publish':
        request = this.api.publish(tender.id, tender.version);
        message = $localize`:@@tenderBuilder.published:Tender published. Invitation emails are being sent.`;
        break;
      case 'cancel':
        if (this.cancelReason.trim().length < REASON_MIN) {
          this.dialogError.set(
            knownProductProblem({
              code: 'reason.required',
              parameters: { min: REASON_MIN },
            }) ?? '',
          );
          return;
        }
        request = this.api.cancel(tender.id, this.cancelReason.trim(), tender.version);
        message = $localize`:@@tenderBuilder.cancelled:Draft cancelled. It stays on record.`;
        break;
      case 'removeDocument':
        request = this.api.removeDocument(tender.id, dialog.document.id, tender.version);
        message = $localize`:@@tenderBuilder.documentRemoved:Document removed from the draft.`;
        break;
      case 'removeInvitee':
        request = this.api.removeInvitee(tender.id, dialog.invitation.id, tender.version);
        message = $localize`:@@tenderBuilder.inviteeRemoved:Invitee removed from the draft.`;
        break;
    }
    this.busy.set(true);
    this.dialogError.set('');
    request.subscribe({
      next: (updated) => {
        this.dialog.set(null);
        this.accepted(updated, message);
      },
      error: (error: unknown) => {
        this.busy.set(false);
        if (isStale(error)) {
          this.dialog.set(null);
          this.reloadRequested.emit(this.staleMessage());
          return;
        }
        this.dialogError.set(tenderProblemMessage(error));
      },
    });
  }

  private accepted(tender: TenderDetail, message: string): void {
    this.busy.set(false);
    this.ownVersion = tender.version;
    this.changed.emit(tender);
    this.announce.emit(message);
  }

  private fail(error: unknown): void {
    this.busy.set(false);
    if (isStale(error)) {
      this.reloadRequested.emit(this.staleMessage());
      return;
    }
    this.error.set(tenderProblemMessage(error));
  }

  private staleMessage(): string {
    return $localize`:@@tenderBuilder.stale:Someone else changed this tender. The latest version is shown; check it and try again.`;
  }

  private required(field: string): string {
    return knownProductProblem({ code: 'tender.field_required', parameters: { field } }) ?? '';
  }

  readonly vatTreatments = VAT_TREATMENTS;
  readonly vatLabel = vatTreatmentLabel;

  private input(): TenderDraftInput {
    const text = (value: string) => (value.trim() ? value.trim() : null);
    return {
      type: this.form.type,
      title: this.form.title.trim(),
      scopeInstructions: text(this.form.scopeInstructions),
      bidValidityDays: this.form.bidValidityDays.trim() ? Number(this.form.bidValidityDays) : null,
      technicalProposalRequired: this.form.technicalProposalRequired,
      durationRequired: this.form.durationRequired,
      pricing: {
        treatment: this.form.vatTreatment || null,
        vatRatePercent:
          this.form.vatTreatment === 'NotApplicable' ? null : text(this.form.vatRatePercent),
        note: text(this.form.pricingNote),
      },
      terms: {
        retentionPercent: text(this.form.retentionPercent),
        advancePaymentPercent: text(this.form.advancePaymentPercent),
        performanceSecurityPercent: text(this.form.performanceSecurityPercent),
        bidBondRequired: this.form.bidBondRequired,
        paymentTermsNote: text(this.form.paymentTermsNote),
      },
      criteria: {
        evaluationPolicyId: this.form.evaluationPolicyId || null,
        recommendationPolicyId: this.form.recommendationPolicyId || null,
        disclosed: this.form.criteriaDisclosed,
      },
      schedule: scheduleRequest(this.form.schedule),
      requiredDocuments: this.form.requiredDocuments
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean),
      submissionInstructions: text(this.form.submissionInstructions),
      submissionDeadlineLocal: this.form.submissionDeadlineLocal || null,
      questionsDeadlineLocal: this.form.questionsDeadlineLocal || null,
      timeZoneId: this.form.timeZoneId,
      contactName: text(this.form.contactName),
      contactEmail: text(this.form.contactEmail),
      contactPhone: text(this.form.contactPhone),
      emailLocale: this.form.emailLocale,
      reminderDays: [...this.form.reminderDays],
    };
  }

  private resetForm(tender: TenderDetail): void {
    this.form = {
      type: tender.type,
      title: tender.title,
      scopeInstructions: tender.scopeInstructions ?? '',
      contactName: tender.contactName ?? '',
      contactEmail: tender.contactEmail ?? '',
      contactPhone: tender.contactPhone ?? '',
      emailLocale: tender.emailLocale,
      bidValidityDays: tender.bidValidityDays?.toString() ?? '',
      technicalProposalRequired: tender.technicalProposalRequired,
      durationRequired: tender.durationRequired,
      vatTreatment: tender.pricing?.treatment ?? '',
      vatRatePercent: tender.pricing?.vatRatePercent ?? '',
      pricingNote: tender.pricing?.note ?? '',
      evaluationPolicyId: tender.criteria?.evaluationPolicyId ?? '',
      recommendationPolicyId: tender.criteria?.recommendationPolicyId ?? '',
      criteriaDisclosed: tender.criteria?.disclosed ?? false,
      retentionPercent: tender.terms?.retentionPercent ?? '',
      advancePaymentPercent: tender.terms?.advancePaymentPercent ?? '',
      performanceSecurityPercent: tender.terms?.performanceSecurityPercent ?? '',
      bidBondRequired: tender.terms?.bidBondRequired ?? false,
      paymentTermsNote: tender.terms?.paymentTermsNote ?? '',
      schedule: (tender.schedule ?? []).map(scheduleInput),
      requiredDocuments: tender.requiredDocuments.join('\n'),
      submissionInstructions: tender.submissionInstructions ?? '',
      timeZoneId: tender.timeZoneId,
      submissionDeadlineLocal: tender.submissionDeadline?.local ?? '',
      questionsDeadlineLocal: tender.questionsDeadline?.local ?? '',
      reminderDays: [...tender.reminderDays].sort((a, b) => b - a),
    };
    this.baseline = JSON.stringify(this.form);
  }

  private emptyForm(): DraftForm {
    return {
      type: 'Rfq',
      title: '',
      scopeInstructions: '',
      contactName: '',
      contactEmail: '',
      contactPhone: '',
      emailLocale: 'en',
      bidValidityDays: '',
      technicalProposalRequired: false,
      durationRequired: true,
      vatTreatment: '',
      vatRatePercent: '',
      pricingNote: '',
      evaluationPolicyId: '',
      recommendationPolicyId: '',
      criteriaDisclosed: false,
      retentionPercent: '',
      advancePaymentPercent: '',
      performanceSecurityPercent: '',
      bidBondRequired: false,
      paymentTermsNote: '',
      schedule: [],
      requiredDocuments: '',
      submissionInstructions: '',
      timeZoneId: 'UTC',
      submissionDeadlineLocal: '',
      questionsDeadlineLocal: '',
      reminderDays: [],
    };
  }
}

function validEmail(value: string): boolean {
  return /^[^\s@<>,;"]+@[^\s@<>,;"]+\.[^\s@<>,;"]+$/.test(value.trim());
}

/** "Now" as a local "YYYY-MM-DDTHH:mm" in a zone, for comparing with local deadline values. */
function nowLocal(zone: string): string {
  return localDateTimeParts(new Date(), zone);
}
