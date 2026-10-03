import {
  Component,
  Injectable,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { BusinessDatePipe } from '../../core/localization/business-format';
import { LocaleService } from '../../core/localization/locale.service';
import { fileSize, isStale } from '../tendering/tendering.api';
import {
  COMMENT_MAX,
  Criterion,
  EVIDENCE_MAX,
  EvaluationApi,
  NOTE_MAX,
  NoteKind,
  ScoreEntry,
  Scorecard,
  TechnicalBid,
  TechnicalWorkspace,
  evaluationProblemMessage,
  parseScore,
} from './evaluation.api';
import {
  criterionCategoryLabel,
  flagLabel,
  gapLabel,
  scoreBlockedLabel,
  scorecardStatusLabel,
} from './evaluation-labels';

interface EntryForm {
  score: string;
  comment: string;
  evidence: string;
}

/**
 * What an evaluator has typed per bid and not yet saved. Provided by the evaluation page, so switching bids or tabs (which
 * destroys this section) never throws typed scores away; an entry is dropped once the server has saved it.
 */
@Injectable()
export class ScorecardDrafts {
  /** Per bid: the entries as typed and the scorecard version they were typed against (a save names it, so stale is detected). */
  private readonly forms = new Map<
    string,
    { form: Record<string, EntryForm>; version: string | null }
  >();
  get(bidId: string) {
    return this.forms.get(bidId);
  }
  keep(bidId: string, form: Record<string, EntryForm>, version: string | null): void {
    if (!this.forms.has(bidId)) this.forms.set(bidId, { form, version });
  }
  saved(bidId: string, version: string): void {
    const draft = this.forms.get(bidId);
    if (draft) draft.version = version;
  }
  drop(bidId: string): void {
    this.forms.delete(bidId);
  }
}

/**
 * The technical evaluation (Part 9): each opened bid's technical answers and technical files, and the signed-in evaluator's own
 * scorecard — criterion by criterion, with comments and evidence where the policy asks. Nothing here can show a price: the
 * server's technical view carries none. Each evaluator keeps their own scorecard; submitting freezes a copy as evidence.
 */
@Component({
  selector: 'app-evaluation-technical',
  imports: [FormsModule, BusinessDatePipe],
  templateUrl: './evaluation-technical.html',
  styleUrl: './evaluation-technical.scss',
})
export class EvaluationTechnical {
  private readonly api = inject(EvaluationApi);
  private readonly drafts = inject(ScorecardDrafts, { optional: true }) ?? new ScorecardDrafts();
  readonly locale = inject(LocaleService).locale;

  readonly tenderId = input.required<string>();
  readonly changed = output<void>();
  readonly announce = output<string>();

  readonly categoryLabel = criterionCategoryLabel;
  readonly flagLabel = flagLabel;
  readonly gapLabel = gapLabel;
  readonly statusLabel = scorecardStatusLabel;
  readonly commentMax = COMMENT_MAX;
  readonly evidenceMax = EVIDENCE_MAX;
  readonly noteMax = NOTE_MAX;
  readonly size = (bytes: number) => fileSize(bytes, this.locale);

  readonly workspace = signal<TechnicalWorkspace | null>(null);
  readonly error = signal('');
  readonly formError = signal('');
  readonly busy = signal(false);
  readonly selectedId = signal<string | null>(null);
  /** The evaluator's entries as typed, per criterion, for the selected bid. */
  form: Record<string, EntryForm> = {};
  noteText = '';
  noteKind: NoteKind = 'Comment';

  readonly selected = computed<TechnicalBid | null>(() => {
    const bids = this.workspace()?.bids ?? [];
    return bids.find((bid) => bid.openingBidId === this.selectedId()) ?? bids[0] ?? null;
  });
  readonly criteria = computed<readonly Criterion[]>(
    () => this.workspace()?.policy?.criteria ?? [],
  );
  readonly editable = computed(
    () => !!this.workspace()?.canScore && this.selected()?.myScorecard?.status !== 'Submitted',
  );
  readonly scale = computed(() => this.workspace()?.policy?.scaleMaximum ?? 10);
  readonly blockedReason = computed(() =>
    scoreBlockedLabel(this.workspace()?.scoreBlockedReason ?? null),
  );

  constructor() {
    effect(() => {
      const id = this.tenderId();
      untracked(() => this.load(id));
    });
  }

  load(id = this.tenderId()): void {
    this.error.set('');
    this.api.technical(id).subscribe({
      next: (workspace) => {
        this.workspace.set(workspace);
        this.resetForm();
      },
      error: (error: unknown) => this.error.set(evaluationProblemMessage(error)),
    });
  }

  select(bid: TechnicalBid): void {
    this.selectedId.set(bid.openingBidId);
    this.formError.set('');
    this.resetForm();
  }

  fileUrl(fileId: string): string {
    return this.api.fileUrl(this.tenderId(), fileId);
  }

  /** The evaluator typed something: the entries are kept for this bid until the server has saved them. */
  touched(): void {
    const bid = this.selected();
    if (bid) this.drafts.keep(bid.openingBidId, this.form, bid.myScorecard?.version ?? null);
  }

  entry(criterionId: string): EntryForm {
    return (this.form[criterionId] ??= { score: '', comment: '', evidence: '' });
  }

  scoreInvalid(criterionId: string): boolean {
    const text = this.entry(criterionId).score.trim();
    return text !== '' && parseScore(text, this.scale()) === null;
  }

  save(submitAfter = false): void {
    const bid = this.selected();
    if (!bid || this.busy() || !this.editable()) return;
    const entries: ScoreEntry[] = [];
    for (const criterion of this.criteria()) {
      const typed = this.entry(criterion.id);
      const score = typed.score.trim() === '' ? null : parseScore(typed.score, this.scale());
      if (typed.score.trim() !== '' && score === null) {
        this.formError.set(
          $localize`:@@evaluation.scoreFormat:Enter each score as a number from 0 to ${this.scale()}:max: with at most one decimal (use a point).`,
        );
        return;
      }
      entries.push({
        criterionId: criterion.id,
        score,
        comment: typed.comment.trim() || null,
        evidence: typed.evidence.trim() || null,
      });
    }
    this.busy.set(true);
    this.formError.set('');
    const base = this.drafts.get(bid.openingBidId)?.version ?? bid.myScorecard?.version ?? null;
    this.api.saveScorecard(this.tenderId(), bid.openingBidId, entries, base).subscribe({
      next: (scorecard) => {
        // The save succeeded: the scorecard's new version is what the next save or submit must name, even if submitting fails.
        this.drafts.saved(bid.openingBidId, scorecard.version);
        this.adopt(scorecard);
        if (submitAfter) {
          this.api.submitScorecard(this.tenderId(), bid.openingBidId, scorecard.version).subscribe({
            next: () =>
              this.finish(
                bid.openingBidId,
                $localize`:@@evaluation.scorecardSubmitted:Scorecard submitted. A copy is kept as evidence.`,
              ),
            // Refused (a required comment missing, for example): the typed entries stay for the evaluator to complete.
            error: (error: unknown) => this.fail(error),
          });
        } else
          this.finish(
            bid.openingBidId,
            $localize`:@@evaluation.scorecardSaved:Scorecard draft saved.`,
          );
      },
      error: (error: unknown) => this.fail(error),
    });
  }

  reopen(): void {
    const bid = this.selected();
    if (!bid?.myScorecard || this.busy()) return;
    this.busy.set(true);
    this.api.reopenScorecard(this.tenderId(), bid.openingBidId, bid.myScorecard.version).subscribe({
      next: () =>
        this.finish(
          bid.openingBidId,
          $localize`:@@evaluation.scorecardReopened:Scorecard reopened for correction. The submitted copy stays on record.`,
        ),
      error: (error: unknown) => this.fail(error),
    });
  }

  addNote(): void {
    const bid = this.selected();
    if (!bid || this.busy()) return;
    if (!this.noteText.trim()) {
      this.formError.set($localize`:@@evaluation.noteRequired:Write the note first.`);
      return;
    }
    this.busy.set(true);
    this.api
      .addNote(this.tenderId(), bid.openingBidId, 'Technical', this.noteKind, this.noteText.trim())
      .subscribe({
        next: () => {
          this.noteText = '';
          this.noteKind = 'Comment';
          this.finish(null, $localize`:@@evaluation.noteAdded:Note added.`);
        },
        error: (error: unknown) => this.fail(error),
      });
  }

  /** `saved` names the bid whose scorecard the server now holds exactly as typed (its unsaved entries are dropped). */
  private finish(saved: string | null, message: string): void {
    this.busy.set(false);
    if (saved) this.drafts.drop(saved);
    this.announce.emit(message);
    this.changed.emit();
    this.load();
  }

  private fail(error: unknown): void {
    this.busy.set(false);
    if (isStale(error)) {
      this.formError.set(
        $localize`:@@evaluation.scorecardStale:This scorecard was saved elsewhere (another tab or device). The latest version is shown.`,
      );
      const bid = this.selected();
      if (bid) this.drafts.drop(bid.openingBidId);
      this.load();
    } else this.formError.set(evaluationProblemMessage(error));
  }

  /** Puts a scorecard the server returned into the workspace (its version, status and gaps) without touching typed entries. */
  private adopt(scorecard: Scorecard): void {
    const workspace = this.workspace();
    if (!workspace) return;
    this.workspace.set({
      ...workspace,
      bids: workspace.bids.map((bid) =>
        bid.openingBidId === scorecard.openingBidId ? { ...bid, myScorecard: scorecard } : bid,
      ),
    });
  }

  private resetForm(): void {
    const bid = this.selected();
    const kept = bid ? this.drafts.get(bid.openingBidId) : undefined;
    if (kept) {
      this.form = kept.form;
      return;
    }
    const scorecard = bid?.myScorecard;
    const form: Record<string, EntryForm> = {};
    for (const criterion of this.criteria()) {
      const saved = scorecard?.entries.find((item) => item.criterionId === criterion.id);
      form[criterion.id] = {
        score: saved?.score == null ? '' : String(saved.score),
        comment: saved?.comment ?? '',
        evidence: saved?.evidence ?? '',
      };
    }
    this.form = form;
  }
}
