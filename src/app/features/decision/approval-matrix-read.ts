import { DOCUMENT } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { ltr } from '../../core/localization/labels';
import { LocaleService } from '../../core/localization/locale.service';
import { money } from '../evaluation/evaluation-format';
import { approverRoleLabel } from './decision-labels';
import {
  ApprovalMatrixRead as MatrixRead,
  ApprovalRuleRead,
  DecisionApi,
  decisionProblemMessage,
} from './decision.api';

/**
 * CF-136: the approval routes as approvers and submitters read them — which rule applies to which decisions and who must approve. Read-only;
 * the matrix itself is maintained under company administration.
 */
@Component({
  selector: 'app-approval-matrix-read',
  template: `
    <section class="prj-page">
      <div class="prj-head">
        <div>
          <p class="prj-eyebrow" i18n="@@matrixRead.eyebrow">Award approvals</p>
          <h1 i18n="@@matrixRead.title">Approval routes</h1>
          <p class="prj-hint" i18n="@@matrixRead.intro">
            Which approvals an award decision needs. The first active rule that matches, by
            priority, decides; otherwise the default route applies. Each decision keeps the route it
            was submitted under.
          </p>
        </div>
      </div>
      @if (error()) {
        <p class="prj-note prj-note--error" role="alert">{{ error() }}</p>
      }
      @if (matrix(); as current) {
        <section class="prj-card" aria-labelledby="matrix-read-rules">
          <h2 id="matrix-read-rules" i18n="@@matrixRead.rules">Active rules</h2>
          @if (current.rules.length === 0) {
            <p class="prj-note" i18n="@@matrixRead.noRules">
              No rule is active: every decision follows the default route.
            </p>
          }
          <ul class="matrix-read-list">
            @for (rule of current.rules; track rule.name; let index = $index) {
              <li
                [id]="'matrix-rule-' + index"
                [class.is-matched]="matched() === index"
                [attr.aria-current]="matched() === index ? 'true' : null"
              >
                @if (matched() === index) {
                  <span class="prj-chip matrix-read-matched" i18n="@@matrixRead.matched"
                    >Applies to this decision</span
                  >
                }
                <strong
                  ><bdi>{{ rule.name }}</bdi></strong
                >
                <span class="prj-hint">{{ describe(rule) }}</span>
                <span>{{ steps(rule) }}</span>
                @if (rule.requiredApprovals === 0 || rule.allowSelfApproval) {
                  <span class="prj-chip" i18n="@@matrixRead.noIndependent"
                    >Without independent approval</span
                  >
                }
              </li>
            }
          </ul>
        </section>
        <section
          class="prj-card"
          id="matrix-default-route"
          aria-labelledby="matrix-read-default"
          [class.is-matched]="matched() === 'default'"
          [attr.aria-current]="matched() === 'default' ? 'true' : null"
        >
          <h2 id="matrix-read-default" i18n="@@matrixRead.default">Default route</h2>
          @if (matched() === 'default') {
            <span class="prj-chip matrix-read-matched" i18n="@@matrixRead.matched"
              >Applies to this decision</span
            >
          }
          <p>{{ steps(current.defaultRoute) }}</p>
        </section>
      }
    </section>
  `,
  styles: `
    .matrix-read-list {
      list-style: none;
      padding: 0;
      display: grid;
      gap: 0.75rem;
    }
    .matrix-read-list li {
      display: grid;
      gap: 0.2rem;
    }
    .is-matched {
      outline: 2px solid var(--color-accent);
      outline-offset: 0.35rem;
    }
    .matrix-read-matched {
      justify-self: start;
    }
  `,
})
export class ApprovalMatrixRead implements OnInit {
  private readonly api = inject(DecisionApi);
  private readonly locale = inject(LocaleService).locale;
  private readonly document = inject(DOCUMENT);
  /** CF-136 AC6: `?rule=` names the rule a decision was routed by ("default" for the default route); it is highlighted. */
  private readonly requested = inject(ActivatedRoute).snapshot?.queryParamMap?.get('rule') ?? null;
  readonly matrix = signal<MatrixRead | null>(null);
  /** The highlighted entry: an active rule's index, the default route, or nothing. */
  readonly matched = signal<number | 'default' | null>(null);
  readonly error = signal('');

  ngOnInit(): void {
    this.api.readApprovalMatrix().subscribe({
      next: (matrix) => {
        this.matrix.set(matrix);
        this.highlight(matrix);
      },
      error: (error: unknown) => this.error.set(decisionProblemMessage(error)),
    });
  }

  /** An active rule of that exact name; otherwise "default" is the default route. A rule no longer active matches nothing. */
  private highlight(matrix: MatrixRead): void {
    const name = this.requested;
    if (!name) return;
    const index = matrix.rules.findIndex((rule) => rule.name === name);
    const matched = index >= 0 ? index : name === 'default' ? 'default' : null;
    this.matched.set(matched);
    if (matched === null) return;
    const id = matched === 'default' ? 'matrix-default-route' : `matrix-rule-${matched}`;
    setTimeout(() => this.document.getElementById(id)?.scrollIntoView?.({ block: 'center' }));
  }

  describe(rule: ApprovalRuleRead): string {
    const min = rule.minimumValue
      ? ltr(`${rule.currency} ${money(rule.minimumValue, this.locale)}`)
      : null;
    const max = rule.maximumValue
      ? ltr(`${rule.currency} ${money(rule.maximumValue, this.locale)}`)
      : null;
    const band =
      min && max
        ? $localize`:@@matrixRead.band:${min}:min: up to ${max}:max:`
        : min
          ? $localize`:@@matrixRead.bandMin:from ${min}:min:`
          : max
            ? $localize`:@@matrixRead.bandMax:below ${max}:max:`
            : $localize`:@@matrixRead.bandAny:any value`;
    return rule.category
      ? $localize`:@@matrixRead.withCategory:${band}:band: · ${rule.category}:category:`
      : band;
  }

  steps(rule: ApprovalRuleRead): string {
    if (rule.requiredApprovals === 0) return $localize`:@@matrixRead.zero:No approval required`;
    const roles = rule.stepRoles
      .map(
        (role, index) =>
          `${index + 1}. ${role ? approverRoleLabel(role) : $localize`:@@matrixRead.anyApprover:any approver`}`,
      )
      .join(' → ');
    return rule.allowSelfApproval
      ? $localize`:@@matrixRead.selfAllowed:${roles}:roles: (the submitter may approve)`
      : roles;
  }
}
