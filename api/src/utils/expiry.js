const { isISO8601 } = require('validator');

class Expiry {
  constructor(type, value = null) {
    Expiry._validateType(type);
    if (type === 'date') {
      Expiry._validateDate(value);
    }

    this.type = type;
    this.value = value;
  }

  static _validateType(type) {
    if (type !== 'never' && type !== 'date') {
      throw new Error(`Invalid Expiry type: ${type} - must be 'never' or 'date'`);
    }
  }

  static _validateDate(value) {
    if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
      throw new Error(`Invalid date value for Expiry: ${value}`);
    }
  }

  static never() {
    return new Expiry('never');
  }

  static at(date) {
    this._validateDate(date);
    return new Expiry('date', date);
  }

  static fromValue(value) {
    if (value == null) return Expiry.never();
    const d = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(d)) throw new Error('Invalid date from DB');
    return Expiry.at(d);
  }

  toValue() {
    return this.isNever() ? null : this.value;
  }

  isNever() {
    return this.type === 'never';
  }

  isDate() {
    return this.type === 'date';
  }

  hasExpired() {
    if (this.isNever()) return false;
    const now = new Date();
    return this.value <= now;
  }

  toTimestamp() {
    return this.isNever() ? Infinity : this.value.getTime();
  }

  static fromJSON(json) {
    if (json.type === 'never') {
      return Expiry.never();
    } if (json.type === 'date') {
      if (!isISO8601(json.value)) {
        throw new Error('Invalid ISO8601 date for Expiry');
      }
      return Expiry.at(new Date(json.value));
    }
    throw new Error('Invalid JSON for Expiry');
  }

  toJSON() {
    return {
      type: this.type,
      value: this.isNever() ? null : this.value.toISOString(),
    };
  }

  /** Comparison function for sorting or comparing Expiry instances
   * - -1: a < b (a expires sooner than b)
   * - 0: a and b are equivalent in terms of expiry
   * - 1: a > b (a expires later than b)
   *
   * 'never' is considered greater than any date (i.e. it expires later than any date)
   */
  static compare(a, b) {
    if (a.type === 'never' && b.type === 'never') return 0;
    if (a.type === 'never') return 1;
    if (b.type === 'never') return -1;

    return a.value - b.value; // standard Date comparison
  }

  static selectLater(a, b) {
    if (a === undefined) return b;
    if (b === undefined) return a;
    return Expiry.compare(a, b) >= 0 ? a : b;
  }
}

module.exports = Expiry;
