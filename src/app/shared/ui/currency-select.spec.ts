import { TestBed } from '@angular/core/testing';
import { CurrencySelect } from './currency-select';

const CATALOGUE = [
  { code: 'QAR', name: 'Qatari Rial', minorUnits: 2 },
  { code: 'EUR', name: 'Euro', minorUnits: 2 },
];

function render(value: string | null) {
  const fixture = TestBed.createComponent(CurrencySelect);
  fixture.componentRef.setInput('currencies', CATALOGUE);
  fixture.componentRef.setInput('value', value);
  fixture.detectChanges();
  const select = (fixture.nativeElement as HTMLElement).querySelector('select')!;
  return { fixture, select };
}

describe('currency select', () => {
  it('keeps showing a code saved before the catalogue instead of silently switching it', () => {
    const { select } = render('HRK');
    expect(select.value).toBe('HRK');
    expect(select.selectedOptions[0].textContent).toContain('HRK (no longer listed)');
  });

  it('offers an empty choice only while nothing is chosen', () => {
    expect(render(null).select.options[0].value).toBe('');
    const { select } = render('QAR');
    expect(select.value).toBe('QAR');
    expect(Array.from(select.options).some((option) => option.value === '')).toBe(false);
  });
});
