const Expiry = require('../src/utils/expiry');

describe('Expiry', () => {
  it('should create a date expiry for a valid Date object', () => {
    const d = new Date();
    const expiry = Expiry.at(d);

    expect(expiry).toBeDefined();
    expect(expiry.type).toBe('date');
    expect(expiry.value).toBe(d);
    expect(expiry.toTimestamp()).toBe(d.getTime());
  });

  it('should reject invalid Date objects (NaN)', () => {
    const invalidDate = new Date('not-a-date');
    expect(invalidDate instanceof Date).toBe(true);
    expect(Number.isNaN(invalidDate.getTime())).toBe(true);

    expect(() => Expiry.at(invalidDate)).toThrow('Invalid date');
  });

  it('should reject non-Date values in at()', () => {
    expect(() => Expiry.at('2021-01-01')).toThrow('Invalid date');
    expect(() => Expiry.at(1640995200000)).toThrow('Invalid date');
    expect(() => Expiry.at(null)).toThrow('Invalid date');
  });

  it('should create a never expiry and report Infinity timestamp', () => {
    const expiry = Expiry.never();
    expect(expiry).toBeDefined();
    expect(expiry.type).toBe('never');
    expect(expiry.isNever()).toBe(true);
    expect(expiry.toTimestamp()).toBe(Infinity);
    expect(expiry.toJSON()).toEqual({ type: 'never', value: null });
  });

  it('should be able to construct fromValue with null -> never', () => {
    const expiry = Expiry.fromValue(null);
    expect(expiry.type).toBe('never');
    expect(expiry.isNever()).toBe(true);
  });

  it('should be able to construct fromValue from Date and string', () => {
    const d = new Date('2025-04-01T12:00:00Z');
    const expiryFromDate = Expiry.fromValue(d);
    expect(expiryFromDate.type).toBe('date');
    expect(expiryFromDate.value.getTime()).toBe(d.getTime());

    const expiryFromString = Expiry.fromValue('2025-04-01T12:00:00Z');
    expect(expiryFromString.type).toBe('date');
    expect(expiryFromString.value.getTime()).toBe(d.getTime());
  });

  it('should throw fromValue for invalid date string', () => {
    expect(() => Expiry.fromValue('invalid-date')).toThrow(/Invalid date/);
  });

  it('should serialize and deserialize via JSON', () => {
    const never = Expiry.never();
    expect(Expiry.fromJSON(never.toJSON()).isNever()).toBe(true);

    const d = new Date('2025-04-01T12:00:00Z');
    const dateExpiry = Expiry.at(d);
    const parsed = Expiry.fromJSON(dateExpiry.toJSON());
    expect(parsed.type).toBe('date');
    expect(parsed.value.getTime()).toBe(d.getTime());
  });

  it('should compare and select later correctly', () => {
    const early = Expiry.at(new Date('2025-01-01T00:00:00Z'));
    const later = Expiry.at(new Date('2025-12-31T23:59:59Z'));

    expect(Expiry.compare(early, later)).toBeLessThan(0);
    expect(Expiry.compare(later, early)).toBeGreaterThan(0);
    expect(Expiry.compare(early, early)).toBe(0);

    expect(Expiry.selectLater(early, later)).toBe(later);
    expect(Expiry.selectLater(later, early)).toBe(later);

    const never = Expiry.never();
    expect(Expiry.compare(early, never)).toBe(-1);
    expect(Expiry.compare(never, early)).toBe(1);
    expect(Expiry.compare(never, never)).toBe(0);
    expect(Expiry.selectLater(early, never)).toBe(never);
    expect(Expiry.selectLater(never, later)).toBe(never);
  });
});
