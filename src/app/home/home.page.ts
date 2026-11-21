import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import {
  IonHeader,
  IonToolbar,
  IonTitle,
  IonContent,
  IonSearchbar,
  IonList,
  IonItem,
  IonLabel,
  IonBadge,
  IonNote,
} from '@ionic/angular';
import { Observable } from 'rxjs';
import {
  debounceTime,
  distinctUntilChanged,
  map,
  startWith,
  switchMap,
} from 'rxjs/operators';

import { WarehousePackage } from '../models/package.model';
import { PackageService } from '../services/package.service';

@Component({
  selector: 'app-home',
  templateUrl: 'home.page.html',
  styleUrls: ['home.page.scss'],
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonContent,
    IonSearchbar,
    IonList,
    IonItem,
    IonLabel,
    IonBadge,
    IonNote,
  ],
})
export class HomePage {
  private readonly packageService = inject(PackageService);

  // Control reactivo vinculado al ion-searchbar
  searchControl = new FormControl('', { nonNullable: true });

  // Flujo reactivo de paquetes filtrados
  filteredPackages$: Observable<WarehousePackage[]> = this.searchControl.valueChanges.pipe(
    startWith(''), // Emite un valor inicial para cargar toda la lista al entrar
    map((term) => term.trim().toLowerCase()),
    debounceTime(300), // Espera 300ms tras la última pulsación
    distinctUntilChanged(), // Evita peticiones duplicadas si el término limpio no cambió
    switchMap((cleanTerm) => this.filterPackages(cleanTerm))
  );

  /**
   * Obtiene los paquetes del servicio y los filtra por trackingCode.
   * Si PackageService ya tiene un método de búsqueda en backend (ej. searchByTracking),
   * puedes llamarlo directamente aquí dentro del switchMap.
   */
  private filterPackages(searchTerm: string): Observable<WarehousePackage[]> {
    return this.packageService.getPackages().pipe(
      map((packages) => {
        if (!searchTerm) {
          return packages;
        }
        return packages.filter((pkg) =>
          pkg.trackingCode.toLowerCase().includes(searchTerm)
        );
      })
    );
  }
}
