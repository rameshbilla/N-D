import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ToastsComponent } from './core/toast.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, ToastsComponent],
  template: `<router-outlet /><nd-toasts />`,
})
export class App {}
