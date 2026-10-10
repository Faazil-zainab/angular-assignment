import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

/**
 * Root component.
 *
 * It does nothing but host the router outlet - layout belongs to `AppShell`,
 * which is itself a routed component so the public (auth) area can render
 * without the application chrome.
 */
@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  templateUrl: './app.html',
  styleUrl: './app.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {}
