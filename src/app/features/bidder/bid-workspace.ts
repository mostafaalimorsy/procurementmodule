import { VerificationDetails } from '../../shared/ui/verification-details';
import { DOCUMENT, NgTemplateOutlet } from '@angular/common';
import { HttpErrorResponse, HttpEventType } from '@angular/common/http';
import {
  Component,
  DestroyRef,
  OnInit,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { BusinessDatePipe } from '../../core/localization/business-format';
import { bidFieldLabel, bidGapLabel, scheduleItemTypeLabel } from '../../core/localization/labels';
import { LocaleService } from '../../core/localization/locale.service';
import {
  currencyName,
  extension,
  formatAmount,
  parseMoney,
  sumAmounts,
  trimDecimal,
} from '../../core/localization/money';
import { problemMessage } from '../../core/localization/product-problem';
import { ConfirmDialog } from '../../shared/ui/confirm-dialog';
import {
  RATE_DECIMALS,
  ScheduleItem,
  VAT_TREATMENTS,
  VatTreatment,
  describeLocal,
  fileSize,
} from '../tendering/tendering.api';
import { vatTreatmentLabel } from '../evaluation/evaluation-labels';
import {
  BID_LIMITS,
  BID_WORKSPACE_BACKEND,
  Bid,
  BidAttachment,
  BidContent,
  BidGap,
  BidWorkspaceBackend,
  BidderApi,
  BidderInvitation,
  ScopeCompliance,
} from './bidder.api';
import { requestKey } from '../../shared/util/request-key';

export type BidStep = 'commercial' | 'technical' | 'files' | 'review';
export type SaveState = 'saved' | 'dirty' | 'saving' | 'failed' | 'invalid' | 'conflict' | 'closed';

interface LineForm {
  description: string;
  amount: string;
}

interface BidForm {
  totalAmount: string;
  lines: LineForm[];
  validityDays: string;
  paymentTerms: string;
  durationDays: string;
  warrantyMonths: string;
  exclusions: string[];
  commercialDeviations: string[];
  commercialNotes: string;
  scopeCompliance: ScopeCompliance | '';
  technicalApproach: string;
  technicalDeviations: string[];
  technicalNotes: string;
  // CF-055 (ADR-092): the pricing-basis answer and the requested terms.
  vatConfirmed: '' | 'yes' | 'no';
  vatTreatment: VatTreatment | '';
  vatRatePercent: string;
  retentionPercent: string;
  advancePaymentPercent: string;
  performanceSecurityPercent: string;
  bidBondProvided: '' | 'yes' | 'no';
  itemRates: { key: string | null; rate: string | null }[];
}

/** A file on its way up (or that failed), shown with honest progress and a retry. */
export interface UploadItem {
  readonly key: number;
  readonly file: File;
  readonly requirement: string | null;
  progress: number;
  state: 'waiting' | 'uploading' | 'failed';
  /** Refused before sending (type or size): retrying would fail the same way. */
  retryable: boolean;
  message: string;
}

type ListField = 'exclusions' | 'commercialDeviations' | 'technicalDeviations';

/** How long typing must pause before a draft is saved automatically. */
export const AUTOSAVE_DELAY_MS = 2500;
let uploadKey = 0;

/**
 * The bidder's bid workspace: a structured commercial and technical response, supporting files, a review and an
 * explicit, confirmed submission. Drafts save automatically a moment after typing stops (and on every step
 * change and explicit save), always with the version last seen, so a second tab can never silently overwrite
 * newer work. Every save state is announced; leaving with unsaved work is warned about.
 */
@Component({
  selector: 'app-bid-workspace',
  imports: [VerificationDetails, FormsModule, NgTemplateOutlet, BusinessDatePipe, ConfirmDialog],
  templateUrl: './bid-workspace.html',
  styleUrl: './bid-workspace.scss',
  host: {
    '(window:beforeunload)': 'beforeUnload($event)',
    '(document:visibilitychange)': 'visibilityChanged()',
  },
})
export class BidWorkspace implements OnInit {
  readonly token = input.required<string>();
  readonly invitation = input.required<BidderInvitation>();
  readonly initial = input.required<Bid>();
  /** Part 10: set when this is a revised response in a negotiation round (the round's number), not the tender bid. */
  readonly round = input<number | null>(null);
  /** CF-091 (ADR-107): in a negotiation round, the part of the offer the round does not open is shown read-only. */
  readonly scope = input<'Commercial' | 'Technical' | 'CommercialAndTechnical' | null>(null);
  readonly commercialLocked = computed(() => this.scope() === 'Technical');
  readonly technicalLocked = computed(() => this.scope() === 'Commercial');
  readonly back = output<void>();
  readonly submitted = output<Bid>();

  /** The invitation portal's bid by default; a negotiation round provides its own operations (Part 10). */
  private readonly api: BidWorkspaceBackend =
    inject(BID_WORKSPACE_BACKEND, { optional: true }) ?? inject(BidderApi);
  private readonly document = inject(DOCUMENT);
  readonly locale = inject(LocaleService).locale;
  readonly limits = BID_LIMITS;
  readonly fieldLabel = bidFieldLabel;
  readonly size = (bytes: number) => fileSize(bytes, this.locale);

  readonly bid = signal<Bid | null>(null);
  readonly step = signal<BidStep>('commercial');
  readonly saveState = signal<SaveState>('saved');
  readonly savedAt = signal<string | null>(null);
  readonly gaps = signal<readonly BidGap[]>([]);
  readonly errors = signal<Record<string, string>>({});
  readonly message = signal('');
  readonly uploads = signal<UploadItem[]>([]);
  readonly confirmChecked = signal(false);
  readonly confirming = signal(false);
  readonly submitting = signal(false);
  /** CF-045: a revision is being started or set aside. */
  readonly busy = signal(false);
  readonly submitError = signal('');
  /** Leaving was asked for while work could not be saved: the page asks before discarding it. */
  readonly confirmingLeave = signal(false);
  form: BidForm = emptyForm();

  private draftVersion = '';
  private timer: ReturnType<typeof setTimeout> | null = null;
  private inFlight: Subscription | null = null;
  private resave = false;
  /** A new key for every submission attempt series: a revision after a submission must not replay the first receipt. */
  private idempotencyKey = requestKey();
  private readonly now = signal(Date.now());
  /** Server clock minus this device's clock, from the bid's own response: the countdown follows the server. */
  private leaveAfterSave = false;

  readonly currency = computed(() => this.bid()?.currency ?? this.invitation().currency);
  readonly decimals = computed(() => this.bid()?.currencyDecimals ?? 2);
  readonly currencyTitle = computed(() => currencyName(this.currency(), this.locale));
  readonly requiredDocuments = computed(() => this.invitation().requiredDocuments);
  readonly attachments = computed(() => this.bid()?.attachments ?? []);
  readonly deadline = computed(() =>
    describeLocal(this.invitation().submissionDeadline, this.invitation().timeZoneId, this.locale),
  );
  /** Whole days, hours and minutes left by the server's clock (this device's clock corrected by the offset). */
  readonly remaining = computed(() => {
    // Part 9: a tender the buyer closed early has no time left, whatever its deadline says.
    if (this.invitation().closedEarlyAt || this.invitation().state === 'Closed') return null;
    const left =
      Date.parse(this.invitation().submissionDeadline.utc) -
      (this.now() + this.clockOffsetSignal());
    if (left <= 0) return null;
    const minutes = Math.floor(left / 60_000);
    return {
      days: Math.floor(minutes / 1440),
      hours: Math.floor((minutes % 1440) / 60),
      minutes: minutes % 60,
    };
  });
  private readonly clockOffsetSignal = signal(0);
  readonly editable = computed(() => !!this.bid()?.canEdit && this.remaining() !== null);
  /** The form is a working copy: a first draft, or (CF-045) a revision of the submitted bid before the deadline. */
  readonly drafting = computed(
    () => this.bid()?.status === 'Draft' || this.bid()?.status === 'Amending',
  );
  readonly amending = computed(() => this.bid()?.status === 'Amending');
  readonly canAmend = computed(
    () => !!this.api.amend && !!this.bid()?.resubmission?.canStart && this.remaining() !== null,
  );
  readonly uploading = computed(() =>
    this.uploads().some((item) => item.state === 'uploading' || item.state === 'waiting'),
  );
  /** Input problems found on this device, with the section each is in, for the review and the step list. */
  readonly clientErrors = computed(() =>
    Object.entries(this.errors()).map(([key, text]) => ({
      key,
      text: `${bidFieldLabel(fieldOf(key))}${indexOf(key)}: ${text}`,
      step: stepOfField(key),
    })),
  );
  readonly stepsWithErrors = computed(
    () => new Set(this.clientErrors().map((error) => error.step)),
  );
  readonly linesTotal = computed(() => {
    this.revision();
    const amounts = this.form.lines
      .map((line) => parseMoney(line.amount, this.decimals(), true).value)
      .filter((amount): amount is string => !!amount);
    return amounts.length ? sumAmounts(amounts, this.decimals()) : null;
  });
  readonly gapMessages = computed(() =>
    this.gaps().map((gap) => ({
      gap,
      text: bidGapLabel(gap.key, gap.index, this.requiredDocuments(), this.scheduleKeys()),
      step: gapStep(gap.key),
    })),
  );
  readonly canSubmit = computed(
    () =>
      this.editable() &&
      this.saveState() === 'saved' &&
      !this.uploading() &&
      this.gaps().length === 0 &&
      Object.keys(this.errors()).length === 0,
  );
  // ---------------------------------------------------------------- CF-004: the price schedule

  /** The buyer's price schedule of the revision in force (empty for a lump-sum tender). */
  readonly schedule = computed(() => this.invitation().schedule ?? []);
  readonly scheduleKeys = computed(() => this.schedule().map((item) => item.key));
  readonly itemTypeLabel = scheduleItemTypeLabel;
  /** The measured amounts and provisional sums, exactly; null while a measured item has no exact amount. */
  readonly scheduleTotal = computed(() => {
    this.revision();
    const amounts: string[] = [];
    for (const item of this.schedule()) {
      if (item.type === 'Optional' || item.type === 'RateOnly') continue;
      const price = this.itemPrice(item);
      if (!price.amount) return null;
      amounts.push(price.amount);
    }
    return sumAmounts(amounts, this.decimals());
  });
  /** What the total must be: the schedule plus the bidder's own lines. */
  readonly expectedTotal = computed(() => {
    const schedule = this.scheduleTotal();
    if (schedule === null) return null;
    const lines = this.linesTotal();
    return lines ? sumAmounts([schedule, lines], this.decimals()) : schedule;
  });

  rateText(key: string): string {
    return this.form.itemRates.find((item) => item.key === key)?.rate ?? '';
  }

  setRate(key: string, value: string): void {
    const others = this.form.itemRates.filter((item) => item.key !== key);
    this.form.itemRates = value.trim() ? [...others, { key, rate: value }] : others;
    this.edited();
  }

  rateLabel(key: string): string {
    return $localize`:@@bidWorkspace.rateFor:Rate for item ${key}:item:`;
  }

  quantity(value: string | null): string {
    return trimDecimal(value);
  }

  /** Quantity × rate exactly (never rounded), as the server will judge it; a provisional sum is the buyer's amount. */
  itemPrice(item: ScheduleItem): { amount: string | null; problem: 'inexact' | 'range' | null } {
    if (item.type === 'ProvisionalSum') return { amount: item.provisionalAmount, problem: null };
    if (item.type === 'RateOnly') return { amount: null, problem: null };
    const rate = parseMoney(latinDigits(this.rateText(item.key)), RATE_DECIMALS, true).value;
    if (!rate || !item.quantity) return { amount: null, problem: null };
    return extension(item.quantity, rate, this.decimals());
  }

  useScheduleTotal(): void {
    const total = this.expectedTotal();
    if (!total) return;
    this.form.totalAmount = formatAmount(total, this.decimals(), this.locale);
    this.edited();
  }

  /** Bumped on every edit so computed views of the mutable form refresh. */
  private readonly revision = signal(0);

  // ---------------------------------------------------------------- Part 8: tender changes

  /** The revision in force now, and the one this bid was started on (or answered, once submitted). */
  readonly currentTenderRevision = computed(
    () => this.bid()?.currentTenderRevision || this.bid()?.tenderRevision || 1,
  );
  readonly answeredRevision = computed(() => {
    const bid = this.bid();
    return bid?.status === 'Submitted'
      ? (bid.receipt?.tenderRevision ?? bid.tenderRevision)
      : (bid?.tenderRevision ?? 1);
  });
  /** Addenda issued after this bid was started (or submitted), and those still to acknowledge. */
  readonly newerAddenda = computed(() =>
    (this.bid()?.addenda ?? []).filter(
      (addendum) => addendum.tenderRevision > this.answeredRevision(),
    ),
  );
  readonly outstandingAddenda = computed(() =>
    (this.bid()?.addenda ?? []).filter(
      (addendum) => addendum.acknowledgementRequired && !addendum.acknowledgedAtUtc,
    ),
  );

  constructor() {
    const destroy = inject(DestroyRef);
    const ticker = setInterval(() => this.now.set(Date.now()), 30_000);
    destroy.onDestroy(() => {
      clearInterval(ticker);
      // A pending autosave is sent now rather than dropped, and a save already on its way is left to finish.
      if (this.timer && this.saveState() === 'dirty') this.save();
      if (this.timer) clearTimeout(this.timer);
    });
    effect(() => {
      if (this.remaining() === null && this.drafting()) this.saveState.set('closed');
    });
  }

  ngOnInit(): void {
    this.apply(this.initial(), true);
  }

  // ---------------------------------------------------------------- editing

  edited(): void {
    this.revision.update((value) => value + 1);
    // After a conflict nothing is saved automatically until the bidder reloads the newer version.
    if (!this.editable() || this.saveState() === 'conflict' || this.saveState() === 'closed')
      return;
    this.submitError.set('');
    this.validate();
    if (Object.keys(this.errors()).length) {
      this.saveState.set('invalid');
      this.clearTimer();
      return;
    }
    this.saveState.set('dirty');
    this.clearTimer();
    this.timer = setTimeout(() => this.save(), AUTOSAVE_DELAY_MS);
  }

  /** Formats a money field on blur, so the bidder sees exactly the amount that will be stored. */
  tidyMoney(kind: 'total' | 'line', index = 0): void {
    const text = kind === 'total' ? this.form.totalAmount : this.form.lines[index]?.amount;
    const parsed = parseMoney(text ?? '', this.decimals(), kind === 'line');
    if (!parsed.value) return;
    const shown = formatAmount(parsed.value, this.decimals(), this.locale);
    if (kind === 'total') this.form.totalAmount = shown;
    else this.form.lines[index].amount = shown;
    this.revision.update((value) => value + 1);
  }

  addLine(): void {
    if (this.form.lines.length >= BID_LIMITS.lines) return;
    this.form.lines = [...this.form.lines, { description: '', amount: '' }];
    this.edited();
    this.focus(`bid-line-description-${this.form.lines.length - 1}`);
  }

  removeLine(index: number): void {
    this.form.lines = this.form.lines.filter((_, at) => at !== index);
    this.edited();
    this.focus(
      this.form.lines.length ? `bid-line-description-${Math.max(0, index - 1)}` : 'bid-add-line',
    );
  }

  useLinesTotal(): void {
    const total = this.linesTotal();
    if (!total) return;
    this.form.totalAmount = formatAmount(total, this.decimals(), this.locale);
    this.edited();
  }

  addItem(field: ListField): void {
    if (this.form[field].length >= BID_LIMITS.listItems) return;
    this.form[field] = [...this.form[field], ''];
    this.edited();
    this.focus(`bid-${field}-${this.form[field].length - 1}`);
  }

  removeItem(field: ListField, index: number): void {
    this.form[field] = this.form[field].filter((_, at) => at !== index);
    this.edited();
    this.focus(`bid-add-${field}`);
  }

  trackIndex(index: number): number {
    return index;
  }

  goTo(step: BidStep): void {
    if (step === this.step()) return;
    // Moving on is a natural moment to persist what was typed.
    if (this.saveState() === 'dirty') this.save();
    this.step.set(step);
    this.focus(`bid-step-${step}`);
  }

  // ---------------------------------------------------------------- saving

  /** Saves now. Only one save is in flight; edits made meanwhile are saved right after it. */
  save(): void {
    this.clearTimer();
    if (!this.editable() || this.saveState() === 'conflict') return;
    this.validate();
    if (Object.keys(this.errors()).length) {
      this.saveState.set('invalid');
      return;
    }
    if (this.inFlight) {
      this.resave = true;
      return;
    }
    this.saveState.set('saving');
    const content = this.content();
    this.inFlight = this.api.saveDraft(this.token(), this.draftVersion, content).subscribe({
      next: (saved) => {
        this.inFlight = null;
        this.draftVersion = saved.draftVersion;
        this.savedAt.set(saved.savedAtUtc);
        this.gaps.set(saved.gaps);
        if (this.resave) {
          this.resave = false;
          this.save();
          return;
        }
        if (this.saveState() === 'saving') this.saveState.set('saved');
        if (this.leaveAfterSave && this.saveState() === 'saved') {
          this.leaveAfterSave = false;
          this.back.emit();
        }
      },
      error: (error: unknown) => {
        this.inFlight = null;
        this.resave = false;
        this.handleSaveError(error);
        if (this.leaveAfterSave) {
          this.leaveAfterSave = false;
          this.confirmingLeave.set(true);
          this.focus('bw-leave');
        }
      },
    });
  }

  /** Discards local edits and loads the latest saved bid (after a conflict with another tab). */
  reload(): void {
    this.clearTimer();
    this.message.set('');
    this.api.bid(this.token()).subscribe({
      next: (bid) => {
        this.apply(bid, true);
        // The pressed button is gone with the conflict panel: continue from the bid's heading.
        this.focus(bid.status === 'Submitted' ? 'bid-receipt' : 'bw-title');
      },
      error: (error: unknown) => this.message.set(problemMessage(error)),
    });
  }

  /** CF-045 (ADR-099): starts a revision of the submitted bid from exactly what was submitted. */
  amend(): void {
    if (!this.api.amend || this.busy()) return;
    this.busy.set(true);
    this.message.set('');
    this.api.amend(this.token()).subscribe({
      next: (bid) => {
        this.busy.set(false);
        this.idempotencyKey = requestKey();
        this.apply(bid, true);
        this.step.set('commercial');
        this.focus('bw-title');
      },
      error: (error: unknown) => {
        this.busy.set(false);
        this.message.set(problemMessage(error));
      },
    });
  }

  /** CF-049 (ADR-100): withdrawing asks first; the reason is optional and goes to the buyer. */
  readonly confirmingWithdraw = signal(false);
  withdrawReason = '';
  private withdrawKey = requestKey();
  readonly canWithdraw = computed(
    () => !!this.api.withdraw && !!this.bid()?.canWithdraw && this.remaining() !== null,
  );

  askWithdraw(): void {
    this.withdrawReason = '';
    this.withdrawKey = requestKey();
    this.confirmingWithdraw.set(true);
    this.focus('bw-withdraw');
  }

  withdraw(): void {
    if (!this.api.withdraw || this.busy()) return;
    this.clearTimer();
    this.busy.set(true);
    this.message.set('');
    const reason = this.withdrawReason.trim();
    this.api.withdraw(this.token(), reason || null, this.withdrawKey).subscribe({
      next: (bid) => {
        this.busy.set(false);
        this.confirmingWithdraw.set(false);
        this.apply(bid, true);
        this.focus('bid-withdrawn');
      },
      error: (error: unknown) => {
        this.busy.set(false);
        this.message.set(problemMessage(error));
      },
    });
  }

  /** Sets the revision aside: the submitted bid stays exactly as submitted. */
  discardAmendment(): void {
    if (!this.api.discardAmendment || this.busy()) return;
    this.clearTimer();
    this.busy.set(true);
    this.message.set('');
    this.api.discardAmendment(this.token()).subscribe({
      next: (bid) => {
        this.busy.set(false);
        this.apply(bid, true);
        this.focus('bid-receipt');
      },
      error: (error: unknown) => {
        this.busy.set(false);
        this.message.set(problemMessage(error));
      },
    });
  }

  retrySave(): void {
    this.save();
    this.focus('bw-save-status');
  }

  // ---------------------------------------------------------------- files

  upload(input: HTMLInputElement, requirement: string | null): void {
    const files = [...(input.files ?? [])];
    input.value = '';
    for (const file of files) this.startUpload(file, requirement);
  }

  private removing = false;

  retry(item: UploadItem): void {
    this.uploads.update((items) => items.filter((candidate) => candidate.key !== item.key));
    this.startUpload(item.file, item.requirement);
  }

  dismiss(item: UploadItem): void {
    this.uploads.update((items) => items.filter((candidate) => candidate.key !== item.key));
  }

  remove(attachment: BidAttachment): void {
    if (!this.editable() || this.removing) return;
    this.removing = true;
    this.message.set('');
    this.api.removeAttachment(this.token(), attachment.id).subscribe({
      next: (bid) => {
        this.removing = false;
        this.adoptFiles(bid);
        this.message.set(
          $localize`:@@bidWorkspace.fileRemoved:${attachment.fileName}:file: was removed from your bid.`,
        );
        this.focus('bid-files-status');
      },
      error: (error: unknown) => {
        this.removing = false;
        this.message.set(problemMessage(error));
      },
    });
  }

  download(attachment: BidAttachment): void {
    this.api.attachment(this.token(), attachment.id).subscribe({
      next: (blob) => {
        const url = URL.createObjectURL(blob);
        const anchor = this.document.createElement('a');
        anchor.href = url;
        anchor.download = attachment.fileName;
        anchor.rel = 'noopener';
        this.document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      },
      error: (error: unknown) =>
        void blobProblem(error).then((message) => this.message.set(message)),
    });
  }

  filesFor(requirement: string | null): readonly BidAttachment[] {
    return this.attachments().filter((attachment) => attachment.requirementLabel === requirement);
  }

  uploadsFor(requirement: string | null): readonly UploadItem[] {
    return this.uploads().filter((item) => item.requirement === requirement);
  }

  /** Files are sent one at a time, in the order chosen: steadier on slow links, and each shows its own progress. */
  private readonly queue: UploadItem[] = [];
  private sending = false;

  private startUpload(file: File, requirement: string | null): void {
    const bid = this.bid();
    if (!bid || !this.editable()) return;
    const item: UploadItem = {
      key: ++uploadKey,
      file,
      requirement,
      progress: 0,
      state: 'waiting',
      message: '',
      retryable: true,
    };
    // Limits the page already knows are checked before anything is sent.
    const pending = this.uploads().filter((candidate) => candidate.state !== 'failed');
    const files = bid.attachments.length + pending.length;
    const bytes = [
      ...bid.attachments,
      ...pending.map((candidate) => ({ sizeBytes: candidate.file.size })),
    ].reduce((sum, candidate) => sum + candidate.sizeBytes, 0);
    const extension = file.name.includes('.')
      ? file.name.slice(file.name.lastIndexOf('.')).toLowerCase()
      : '';
    const refusal =
      file.size > bid.maxAttachmentBytes
        ? $localize`:@@bidWorkspace.fileTooLarge:This file is larger than ${Math.round(bid.maxAttachmentBytes / 1_048_576)}:megabytes: MB.`
        : !bid.allowedExtensions.includes(extension)
          ? $localize`:@@bidWorkspace.fileType:This type of file cannot be attached. Use ${bid.allowedExtensions.join(' ')}:extensions:.`
          : files >= bid.maxAttachments
            ? $localize`:@@bidWorkspace.fileLimit:Your bid already has the most files allowed (${bid.maxAttachments}:max:). Remove one first.`
            : bytes + file.size > bid.maxTotalAttachmentBytes
              ? $localize`:@@bidWorkspace.fileTotal:This file would take your bid's files over ${Math.round(bid.maxTotalAttachmentBytes / 1_048_576)}:megabytes: MB in total.`
              : null;
    if (refusal) {
      item.state = 'failed';
      item.retryable = false;
      item.message = refusal;
      this.uploads.update((items) => [...items, item]);
      return;
    }
    this.uploads.update((items) => [...items, item]);
    this.queue.push(item);
    this.sendNext();
  }

  private sendNext(): void {
    if (this.sending) return;
    const item = this.queue.shift();
    if (!item) return;
    this.sending = true;
    item.state = 'uploading';
    this.uploads.update((items) => [...items]);
    const { file, requirement } = item;
    const finished = () => {
      this.sending = false;
      this.sendNext();
    };
    this.api.uploadAttachment(this.token(), file, requirement).subscribe({
      next: (event) => {
        if (event.type === HttpEventType.UploadProgress && event.total) {
          item.progress = Math.min(99, Math.round((event.loaded / event.total) * 100));
          this.uploads.update((items) => [...items]);
        } else if (event.type === HttpEventType.Response && event.body) {
          this.uploads.update((items) => items.filter((candidate) => candidate.key !== item.key));
          this.adoptFiles(event.body);
          this.message.set(
            $localize`:@@bidWorkspace.fileAdded:${file.name}:file: was uploaded to your bid.`,
          );
          finished();
        }
      },
      error: (error: unknown) => {
        item.state = 'failed';
        item.message =
          error instanceof HttpErrorResponse && error.status === 413
            ? $localize`:@@bidWorkspace.fileTooLargeServer:The file is too large to upload.`
            : problemMessage(error);
        this.uploads.update((items) => [...items]);
        finished();
      },
    });
  }

  // ---------------------------------------------------------------- submission

  openConfirmation(): void {
    if (!this.canSubmit() || !this.confirmChecked()) {
      if (!this.confirmChecked())
        this.submitError.set(
          $localize`:@@bidWorkspace.confirmFirst:Tick the confirmation box before submitting.`,
        );
      return;
    }
    this.submitError.set('');
    this.confirming.set(true);
  }

  submit(): void {
    const bid = this.bid();
    if (!bid || this.submitting()) return;
    this.submitting.set(true);
    this.api
      .submit(
        this.token(),
        this.draftVersion,
        bid.attachments.map((attachment) => attachment.id),
        this.idempotencyKey,
        // The revision the bidder reviewed on this screen; the server refuses any other.
        this.currentTenderRevision(),
      )
      .subscribe({
        next: (result) => {
          this.submitting.set(false);
          this.confirming.set(false);
          this.apply(result, false);
          this.submitted.emit(result);
        },
        error: (error: unknown) => {
          this.submitting.set(false);
          this.confirming.set(false);
          const code = error instanceof HttpErrorResponse ? error.error?.code : null;
          if (code === 'bid.draft_stale') this.saveState.set('conflict');
          // Submitted meanwhile (another tab, or a lost response before a reload): show what the server holds.
          if (code === 'bid.already_submitted' || code === 'negotiation.already_submitted') {
            this.reload();
            return;
          }
          // The tender changed while the bidder reviewed, or an acknowledgement is outstanding: show the latest
          // revision and addenda (the typed draft is saved and stays as it is).
          if (code === 'bid.tender_revision_changed' || code === 'bid.acknowledgement_required')
            this.api.bid(this.token()).subscribe({
              next: (latest) => {
                const current = this.bid();
                this.bid.set(
                  current
                    ? {
                        ...current,
                        addenda: latest.addenda,
                        gaps: latest.gaps,
                        currentTenderRevision: latest.currentTenderRevision,
                      }
                    : latest,
                );
                this.gaps.set(latest.gaps);
              },
              error: () => undefined,
            });
          this.submitError.set(problemMessage(error));
          this.focus('bid-submit-error');
        },
      });
  }

  // ---------------------------------------------------------------- leaving

  /**
   * Leaves the workspace only once the work is safe: a pending or running save finishes first; work that cannot
   * be saved (invalid fields, a failed save, a conflict) is not discarded without asking.
   */
  requestBack(): void {
    const state = this.saveState();
    if (state === 'dirty' || state === 'saving') {
      this.leaveAfterSave = true;
      if (state === 'dirty') this.save();
      return;
    }
    if (state === 'invalid' || state === 'failed' || state === 'conflict' || this.uploading()) {
      this.confirmingLeave.set(true);
      this.focus('bw-leave');
      return;
    }
    this.back.emit();
  }

  leaveAnyway(): void {
    this.confirmingLeave.set(false);
    this.leaveAfterSave = false;
    this.back.emit();
  }

  /** A phone may close a backgrounded tab without warning: save what was typed as soon as the tab is hidden. */
  visibilityChanged(): void {
    if (this.document.visibilityState === 'hidden' && this.saveState() === 'dirty') this.save();
  }

  beforeUnload(event: BeforeUnloadEvent): void {
    if (this.hasUnsavedWork()) {
      event.preventDefault();
      event.returnValue = '';
    }
  }

  hasUnsavedWork(): boolean {
    return ['dirty', 'saving', 'invalid', 'failed'].includes(this.saveState()) || this.uploading();
  }

  // ---------------------------------------------------------------- helpers

  /** List entries as the server keeps them: trimmed, blank ones left out. */
  filled(items: readonly string[]): readonly string[] {
    return items.map((item) => item.trim()).filter(Boolean);
  }

  fieldError(key: string): string {
    return this.errors()[key] ?? '';
  }

  describedBy(key: string, hint?: string): string | null {
    const ids = [this.fieldError(key) ? `bid-error-${key}` : '', hint ?? ''].filter(Boolean);
    return ids.length ? ids.join(' ') : null;
  }

  amount(value: string | null | undefined): string {
    return formatAmount(value, this.decimals(), this.locale);
  }

  private apply(bid: Bid, resetForm: boolean): void {
    this.bid.set(bid);
    if (bid.serverTimeUtc) {
      this.clockOffsetSignal.set(Date.parse(bid.serverTimeUtc) - Date.now());
    }
    this.draftVersion = bid.draftVersion;
    this.savedAt.set(bid.draftSavedAtUtc);
    this.gaps.set(bid.gaps);
    if (resetForm) {
      this.form = toForm(
        bid.status === 'Submitted' && bid.submitted ? bid.submitted : bid.draft,
        bid.currencyDecimals,
        this.locale,
      );
      if (!this.form.validityDays && this.invitation().bidValidityDays)
        this.form.validityDays = String(this.invitation().bidValidityDays);
      this.errors.set({});
      this.revision.update((value) => value + 1);
    }
    this.saveState.set(bid.status === 'Submitted' ? 'saved' : bid.canEdit ? 'saved' : 'closed');
  }

  /** A file change does not touch the typed draft: only the file list and what is missing change. */
  private adoptFiles(bid: Bid): void {
    const current = this.bid();
    this.bid.set(current ? { ...current, attachments: bid.attachments, gaps: bid.gaps } : bid);
    if (this.saveState() === 'saved') this.gaps.set(bid.gaps);
  }

  private handleSaveError(error: unknown): void {
    const code = error instanceof HttpErrorResponse ? error.error?.code : null;
    if (code === 'bid.draft_stale') {
      // The conflict panel explains it and offers the reload; one announcement is enough.
      this.saveState.set('conflict');
      this.message.set('');
      return;
    }
    if (
      code === 'bid.deadline_passed' ||
      code === 'bidder.response_closed' ||
      code === 'negotiation.response_closed'
    ) {
      this.saveState.set('closed');
      this.message.set(problemMessage(error));
      return;
    }
    // A value the server refused is shown on its field, like any other input problem, not as a failed save.
    const parameters = error instanceof HttpErrorResponse ? error.error?.parameters : null;
    if (
      (code === 'bid.amount_invalid' ||
        code === 'bid.field_invalid' ||
        code === 'bid.list_too_long') &&
      typeof parameters?.field === 'string'
    ) {
      const field: string = parameters.field;
      const key = field.startsWith('lines.')
        ? `lines.${parameters.index ?? 0}.${field.slice('lines.'.length)}`
        : field;
      this.errors.set({ ...this.errors(), [key]: problemMessage(error) });
      this.saveState.set('invalid');
      return;
    }
    this.saveState.set('failed');
    this.message.set(problemMessage(error));
  }

  private validate(): void {
    const errors: Record<string, string> = {};
    const decimals = this.decimals();
    const money = (key: string, text: string, allowZero: boolean) => {
      const parsed = parseMoney(text, decimals, allowZero);
      if (parsed.problem) errors[key] = moneyProblem(parsed.problem, decimals, this.currency());
    };
    money('totalAmount', this.form.totalAmount, false);
    this.form.lines.forEach((line, index) => {
      money(`lines.${index}.amount`, line.amount, true);
      if (line.description.length > BID_LIMITS.lineDescription)
        errors[`lines.${index}.description`] = tooLong(BID_LIMITS.lineDescription);
    });
    const range = (
      key: 'validityDays' | 'durationDays' | 'warrantyMonths',
      min: number,
      max: number,
    ) => {
      const text = latinDigits(this.form[key].trim());
      if (text && (!/^\d+$/.test(text) || +text < min || +text > max))
        errors[key] =
          $localize`:@@bidWorkspace.range:Enter a whole number from ${min}:min: to ${max}:max:.`;
    };
    // CF-004: rates have at most six decimals and are never rounded.
    this.schedule().forEach((item, index) => {
      const text = this.rateText(item.key);
      if (!text.trim() || item.type === 'ProvisionalSum') return;
      const parsed = parseMoney(latinDigits(text), RATE_DECIMALS, true);
      if (parsed.problem)
        errors[`itemRates.${index}`] =
          parsed.problem === 'decimals'
            ? $localize`:@@bidWorkspace.rateDecimals:Rates have at most ${RATE_DECIMALS}:decimals: decimal places. They are never rounded.`
            : moneyProblem(parsed.problem, RATE_DECIMALS, this.currency());
    });
    range('validityDays', BID_LIMITS.validityMin, BID_LIMITS.validityMax);
    range('durationDays', BID_LIMITS.durationMin, BID_LIMITS.durationMax);
    range('warrantyMonths', 0, BID_LIMITS.warrantyMax);
    this.errors.set(errors);
  }

  readonly vatTreatments = VAT_TREATMENTS;
  readonly vatLabel = vatTreatmentLabel;

  private content(): BidContent {
    const decimals = this.decimals();
    const text = (value: string) => (value.trim() ? value.trim() : null);
    const whole = (value: string) => (value.trim() ? Number(latinDigits(value.trim())) : null);
    const list = (items: string[]) => items.map((item) => item.trim()).filter(Boolean);
    return {
      totalAmount: parseMoney(this.form.totalAmount, decimals).value,
      lines: this.form.lines
        .map((line) => ({
          description: text(line.description),
          amount: parseMoney(line.amount, decimals, true).value,
        }))
        .filter((line) => line.description !== null || line.amount !== null),
      validityDays: whole(this.form.validityDays),
      paymentTerms: text(this.form.paymentTerms),
      durationDays: whole(this.form.durationDays),
      warrantyMonths: whole(this.form.warrantyMonths),
      exclusions: list(this.form.exclusions),
      commercialDeviations: list(this.form.commercialDeviations),
      commercialNotes: text(this.form.commercialNotes),
      scopeCompliance: this.form.scopeCompliance || null,
      technicalApproach: text(this.form.technicalApproach),
      technicalDeviations: list(this.form.technicalDeviations),
      technicalNotes: text(this.form.technicalNotes),
      pricing: this.invitation().pricing
        ? {
            confirmed: this.form.vatConfirmed === '' ? null : this.form.vatConfirmed === 'yes',
            treatment: this.form.vatConfirmed === 'no' ? this.form.vatTreatment || null : null,
            vatRatePercent:
              this.form.vatConfirmed === 'no' && this.form.vatTreatment !== 'NotApplicable'
                ? text(latinDigits(this.form.vatRatePercent))
                : null,
          }
        : null,
      terms: this.invitation().terms
        ? {
            retentionPercent: text(latinDigits(this.form.retentionPercent)),
            advancePaymentPercent: text(latinDigits(this.form.advancePaymentPercent)),
            performanceSecurityPercent: text(latinDigits(this.form.performanceSecurityPercent)),
            bidBondProvided:
              this.form.bidBondProvided === '' ? null : this.form.bidBondProvided === 'yes',
          }
        : null,
      // Only rates for items of the schedule in force, in its order, each as an exact canonical decimal.
      itemRates: this.schedule()
        .filter((item) => item.type !== 'ProvisionalSum')
        .map((item) => {
          const rate = parseMoney(latinDigits(this.rateText(item.key)), RATE_DECIMALS, true).value;
          // Trailing zeros dropped (85.600000 → 85.6): the same exact number, as the bidder typed it.
          return { key: item.key, rate: rate === null ? null : trimDecimal(rate) };
        })
        .filter((item) => item.rate !== null),
    };
  }

  private clearTimer(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  private focus(id: string): void {
    setTimeout(() => this.document.getElementById(id)?.focus());
  }
}

function emptyForm(): BidForm {
  return {
    totalAmount: '',
    lines: [],
    validityDays: '',
    paymentTerms: '',
    durationDays: '',
    warrantyMonths: '',
    exclusions: [],
    commercialDeviations: [],
    commercialNotes: '',
    scopeCompliance: '',
    technicalApproach: '',
    technicalDeviations: [],
    technicalNotes: '',
    vatConfirmed: '',
    vatTreatment: '',
    vatRatePercent: '',
    retentionPercent: '',
    advancePaymentPercent: '',
    performanceSecurityPercent: '',
    bidBondProvided: '',
    itemRates: [],
  };
}

function toForm(content: BidContent, decimals: number, locale: string): BidForm {
  const shown = (amount: string | null) => (amount ? formatAmount(amount, decimals, locale) : '');
  return {
    totalAmount: shown(content.totalAmount),
    lines: content.lines.map((line) => ({
      description: line.description ?? '',
      amount: shown(line.amount),
    })),
    validityDays: content.validityDays?.toString() ?? '',
    paymentTerms: content.paymentTerms ?? '',
    durationDays: content.durationDays?.toString() ?? '',
    warrantyMonths: content.warrantyMonths?.toString() ?? '',
    exclusions: [...content.exclusions],
    commercialDeviations: [...content.commercialDeviations],
    commercialNotes: content.commercialNotes ?? '',
    scopeCompliance: content.scopeCompliance ?? '',
    technicalApproach: content.technicalApproach ?? '',
    technicalDeviations: [...content.technicalDeviations],
    technicalNotes: content.technicalNotes ?? '',
    vatConfirmed:
      content.pricing?.confirmed === true
        ? 'yes'
        : content.pricing?.confirmed === false
          ? 'no'
          : '',
    vatTreatment: content.pricing?.treatment ?? '',
    vatRatePercent: content.pricing?.vatRatePercent ?? '',
    retentionPercent: content.terms?.retentionPercent ?? '',
    advancePaymentPercent: content.terms?.advancePaymentPercent ?? '',
    performanceSecurityPercent: content.terms?.performanceSecurityPercent ?? '',
    bidBondProvided:
      content.terms?.bidBondProvided === true
        ? 'yes'
        : content.terms?.bidBondProvided === false
          ? 'no'
          : '',
    itemRates: (content.itemRates ?? []).map((item) => ({ key: item.key, rate: item.rate })),
  };
}

function gapStep(key: string): BidStep {
  if (key === 'requiredDocument') return 'files';
  if (key === 'addendumAcknowledgement') return 'review';
  if (key === 'technicalApproach' || key === 'scopeCompliance' || key === 'deviationExplanation')
    return 'technical';
  return 'commercial';
}

function moneyProblem(problem: string, decimals: number, currency: string): string {
  switch (problem) {
    case 'decimals':
      return decimals === 0
        ? $localize`:@@bidWorkspace.moneyNoDecimals:${currency}:currency: amounts have no decimal places.`
        : $localize`:@@bidWorkspace.moneyDecimals:Use at most ${decimals}:decimals: decimal places for ${currency}:currency:.`;
    case 'grouping':
      return $localize`:@@bidWorkspace.moneyGrouping:Use a point for decimals, for example 1250.50. Commas may only separate thousands.`;
    case 'range':
      return $localize`:@@bidWorkspace.moneyRange:The amount must be below one trillion.`;
    case 'zero':
      return $localize`:@@bidWorkspace.moneyZero:The total must be more than zero.`;
    default:
      return $localize`:@@bidWorkspace.moneyFormat:Enter digits only, for example 1250000.50 (no currency sign, no minus).`;
  }
}

function tooLong(max: number): string {
  return $localize`:@@bidWorkspace.tooLong:Use at most ${max}:max: characters.`;
}

/** Arabic-Indic and extended Arabic-Indic digits read as the same Latin digits, as money fields already do. */
function latinDigits(value: string): string {
  return value.replace(/[\u0660-\u0669\u06F0-\u06F9]/g, (digit) =>
    String((digit.charCodeAt(0) & 0x0f) % 10),
  );
}

function fieldOf(key: string): string {
  if (/^itemRates\.\d+$/.test(key)) return 'itemRates';
  const match = /^lines\.\d+\.(\w+)$/.exec(key);
  return match ? `lines.${match[1]}` : key;
}

function indexOf(key: string): string {
  const match = /^(?:lines\.(\d+)\.|itemRates\.(\d+)$)/.exec(key);
  if (match?.[2]) return ` ${Number(match[2]) + 1}`;
  return match ? ` ${Number(match[1]) + 1}` : '';
}

function stepOfField(key: string): BidStep {
  return /^(scopeCompliance|technical)/.test(key) ? 'technical' : 'commercial';
}

/** A failed download carries its problem in a Blob: read it so the right, localized message is shown. */
async function blobProblem(error: unknown): Promise<string> {
  if (error instanceof HttpErrorResponse && error.error instanceof Blob) {
    try {
      const body: unknown = JSON.parse(await error.error.text());
      return problemMessage(
        new HttpErrorResponse({ error: body, status: error.status, statusText: error.statusText }),
      );
    } catch {
      return problemMessage(
        new HttpErrorResponse({ status: error.status, statusText: error.statusText }),
      );
    }
  }
  return problemMessage(error);
}
