export function SalaryFilter({ minimum, currency, onMinimum, onCurrency }: {
  minimum: number; currency: string; onMinimum: (v: number) => void; onCurrency: (v: string) => void;
}) {
  return <fieldset className="ayn-salary-filter space-y-2 text-xs">
    <legend className="font-semibold">Minimum advertised annual pay</legend>
    <div className="flex gap-2">
      <label className="flex-1 min-w-0">Amount<input aria-label="Minimum annual salary" className="w-full rounded-md border p-2" type="number" min="0" max="10000000" step="1000" value={minimum || ''}
        onChange={e => onMinimum(Math.max(0, Math.min(10000000, Number(e.target.value) || 0)))} placeholder="No minimum" /></label>
      <label>Currency<select aria-label="Salary currency" className="block rounded-md border p-2" value={currency} onChange={e => onCurrency(e.target.value)}>
        {['USD','CAD','GBP','EUR','AUD','AED','SAR','SGD','CHF','INR'].map(c => <option key={c}>{c}</option>)}
      </select></label>
    </div>
    <p className="text-muted-foreground">Uses the stated range's minimum, annualized. With a minimum set, unknown pay is excluded. No currency conversion.</p>
  </fieldset>;
}
