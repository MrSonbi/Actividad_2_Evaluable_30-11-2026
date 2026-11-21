import { ChangeDetectionStrategy, Component, ElementRef, computed, inject, viewChild } from '@angular/core';
import { IonApp, IonRouterOutlet } from '@ionic/angular';

import { AtmosphereComponent } from './components/atmosphere/atmosphere.component';
import { MotionService } from './services/motion.service';
import { ThemeService } from './services/theme.service';

/**
 * Raíz de la app y contenedor de la atmósfera: conecta ThemeService y MotionService con AtmosphereComponent
 * (presentacional) y le pasa el contenido que se hunde durante el cambio de modo (el router outlet).
 */
@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IonApp, IonRouterOutlet, AtmosphereComponent],
})
export class AppComponent {
  private readonly theme = inject(ThemeService);
  private readonly motion = inject(MotionService);

  private readonly outlet = viewChild(IonRouterOutlet, { read: ElementRef });

  readonly night = computed(() => this.theme.shift() === 'night');
  readonly fogMoving = computed(() => !this.motion.backgroundPaused() && !this.motion.reducedMotion());
  readonly transition = this.theme.transition;
  readonly sinkTarget = computed<HTMLElement | null>(() => this.outlet()?.nativeElement ?? null);

  onAtmosphereAvailable(available: boolean): void {
    this.motion.setBackgroundAvailable(available);
  }

  onTransitionMidpoint(id: number): void {
    this.theme.applyTransitionMidpoint(id);
  }

  onTransitionEnd(id: number): void {
    this.theme.completeTransition(id);
  }
}
