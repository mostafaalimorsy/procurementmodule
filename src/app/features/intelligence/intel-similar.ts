import { Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { BusinessDatePipe } from '../../core/localization/business-format';
import {
  categoryLabel,
  rehireShortLabel,
  scheduleOutcomeLabel,
  signedPercent,
} from '../performance/performance-labels';
import { IntelligenceAccess, SimilarProjects } from './intelligence.api';
import { reasonLabel } from './intelligence-labels';
import { VarianceCause } from '../performance/variance-cause';

/**
 * Similar-project evidence for the next project (Part 12, ADR-078): completed projects matched by structured facts only — same category
 * (required), same project, comparable value in the same currency — each with exactly why it matched. No text similarity is claimed.
 */
@Component({
  selector: 'app-intel-similar',
  imports: [RouterLink, BusinessDatePipe, VarianceCause],
  templateUrl: './intel-similar.html',
  styleUrl: './intel-similar.scss',
})
export class IntelSimilarView {
  readonly similar = input.required<SimilarProjects>();
  readonly access = input.required<IntelligenceAccess>();
  readonly reasonLabel = reasonLabel;
  readonly percent = signedPercent;
  readonly scheduleLabel = scheduleOutcomeLabel;
  readonly rehireLabel = rehireShortLabel;
  readonly categoryLabel = categoryLabel;
}
