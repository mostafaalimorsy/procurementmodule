import { Component, computed, input, model, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { PlatformPackage, currentRevision } from './platform-api.service';

/**
 * Chooses the commercial terms for an assignment. Only each active package's current revision is
 * offered by default, so a new customer is never placed on superseded terms by accident; earlier
 * revisions stay reachable behind an explicit choice.
 */
@Component({
  selector: 'app-revision-picker',
  imports: [FormsModule],
  styleUrl: './platform.scss',
  template: `
    <label
      ><span>{{ label() }}</span
      ><select
        [attr.name]="name()"
        required
        [ngModelOptions]="{ standalone: true }"
        [ngModel]="value()"
        (ngModelChange)="value.set($event)"
        [attr.aria-describedby]="name() + '-earlier'"
      >
        <option value="" i18n="@@companies.chooseRevision">Choose revision</option>
        @for (group of groups(); track group.pack.id) {
          <optgroup [label]="group.label">
            @for (option of group.options; track option.id) {
              <option
                [value]="option.id"
                [disabled]="option.id === excludeId() || option.incomplete"
              >
                {{ option.text }}
              </option>
            }
          </optgroup>
        }
      </select></label
    >
    <label class="check" [id]="name() + '-earlier'">
      <input
        type="checkbox"
        [name]="name() + '-show-earlier'"
        [checked]="showEarlier()"
        (change)="showEarlier.set($any($event.target).checked)"
      />
      <span i18n="@@picker.showEarlier">Show earlier revisions</span>
    </label>
  `,
})
export class RevisionPicker {
  readonly packages = input.required<readonly PlatformPackage[]>();
  readonly value = model('');
  readonly label = input.required<string>();
  readonly name = input('revision');
  /** The company's present assignment: shown for context, never offered as a change to itself. */
  readonly excludeId = input<string | null>(null);
  protected readonly showEarlier = signal(false);
  private readonly revisionWord = $localize`:@@packages.revisionWord:revision`;
  private readonly supersededWord = $localize`:@@revision.superseded:Superseded`;

  protected readonly groups = computed(() =>
    this.packages()
      .filter((pack) => pack.isActive)
      .map((pack) => {
        const current = currentRevision(pack);
        const revisions = [...pack.revisions]
          .sort((a, b) => b.number - a.number)
          .filter(
            (revision) =>
              revision.id === current.id ||
              this.showEarlier() ||
              revision.id === this.value() ||
              revision.id === this.excludeId(),
          );
        return {
          pack,
          label: `${current.displayName} · ${pack.code}`,
          options: revisions.map((revision) => ({
            id: revision.id,
            // CF-060 (ADR-137): a revision whose workflow cannot be finished is never newly assigned.
            incomplete: !!revision.workflowIssue,
            text:
              revision.id === current.id
                ? `${revision.displayName} — ${this.revisionWord} ${revision.number}`
                : `${revision.displayName} — ${this.revisionWord} ${revision.number} (${this.supersededWord})`,
          })),
        };
      }),
  );
}
