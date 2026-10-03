import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

/**
 * Deliberately empty. The Platform Console and the company workspace are separate product contexts
 * with their own shells, identities and navigation; the root only chooses between them by route.
 */
@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  template: '<router-outlet />',
})
export class App {}
