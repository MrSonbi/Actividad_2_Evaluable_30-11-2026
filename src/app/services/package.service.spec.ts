import { TestBed } from '@angular/core/testing';

import { PACKAGE_PRIORITIES, PACKAGE_STATUSES, TRACKING_CODE_PATTERN } from '../models/package.model';
import type { PackageStatus, WarehousePackage } from '../models/package.model';

import { PackageService } from './package.service';

const UUID_V4_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Devuelve un estado distinto del actual para forzar un cambio real. */
function otherStatus(current: PackageStatus): PackageStatus {
  return current === 'IN_TRANSIT' ? 'INSPECTED' : 'IN_TRANSIT';
}

describe('PackageService', () => {
  let service: PackageService;

  beforeEach(() => {
    // TestBed se reinicia entre tests: cada test recibe un servicio nuevo con los datos iniciales.
    TestBed.configureTestingModule({});
    service = TestBed.inject(PackageService);
  });

  describe('datos iniciales', () => {
    it('packages() devuelve los 12 paquetes iniciales', () => {
      expect(service.packages()).toHaveLength(12);
    });

    it('los ids son únicos y cumplen formato UUID v4', () => {
      const ids = service.packages().map((pkg) => pkg.id);
      expect(new Set(ids).size).toBe(ids.length);
      for (const id of ids) {
        expect(id).toMatch(UUID_V4_PATTERN);
      }
    });

    it('los trackingCode son únicos y cumplen TRACKING_CODE_PATTERN', () => {
      const codes = service.packages().map((pkg) => pkg.trackingCode);
      expect(new Set(codes).size).toBe(codes.length);
      for (const code of codes) {
        expect(code).toMatch(TRACKING_CODE_PATTERN);
      }
    });

    it('están presentes las 9 combinaciones prioridad × estado', () => {
      const combos = new Set(service.packages().map((pkg) => `${pkg.priority}|${pkg.status}`));
      for (const priority of PACKAGE_PRIORITIES) {
        for (const status of PACKAGE_STATUSES) {
          expect(combos.has(`${priority}|${status}`), `${priority} × ${status}`).toBe(true);
        }
      }
    });
  });

  describe('updateStatus', () => {
    it('con id válido devuelve true y actualiza de forma inmutable', () => {
      const before = service.packages();
      const original: WarehousePackage = before[0];
      const snapshot = { ...original };
      const newStatus = otherStatus(original.status);

      expect(service.updateStatus(original.id, newStatus)).toBe(true);

      const after = service.packages();
      expect(after).not.toBe(before);
      expect(after).toHaveLength(before.length);

      const updated = after.find((pkg) => pkg.id === original.id);
      expect(updated).toBeDefined();
      expect(updated).not.toBe(original);
      expect(updated?.status).toBe(newStatus);

      before.forEach((pkg, index) => {
        if (pkg.id !== original.id) {
          expect(after[index]).toBe(pkg);
        }
      });

      expect(original).toEqual(snapshot);
    });

    it('con id inexistente devuelve false y no cambia la referencia', () => {
      const before = service.packages();

      expect(service.updateStatus('00000000-0000-4000-8000-000000000000', 'INSPECTED')).toBe(false);
      expect(service.packages()).toBe(before);
    });

    it('con el mismo estado devuelve false y no cambia la referencia', () => {
      const before = service.packages();
      const target = before[0];

      expect(service.updateStatus(target.id, target.status)).toBe(false);
      expect(service.packages()).toBe(before);
    });
  });
});
