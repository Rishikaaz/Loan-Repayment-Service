/**
 * Precision Money Handling Utility
 * All monetary amounts are stored internally as BigInt / Integer Paise (1 INR = 100 Paise)
 * to eliminate floating-point rounding errors and precision drifts.
 */

export const Paise = {
  /**
   * Converts INR amount (number or string) to Integer Paise.
   * e.g., 200000 -> 20000000, 9986.50 -> 998650
   */
  fromRupees(amount) {
    if (amount === undefined || amount === null || isNaN(Number(amount))) {
      throw new Error(`Invalid money amount: ${amount}`);
    }
    const num = Number(amount);
    return Math.round(num * 100);
  },

  /**
   * Converts Integer Paise to INR amount (number with 2 decimal places).
   * e.g., 20000000 -> 200000, 998650 -> 9986.50
   */
  toRupees(paise) {
    if (paise === undefined || paise === null || isNaN(Number(paise))) {
      return 0;
    }
    return Math.round(Number(paise)) / 100;
  },

  /**
   * Formats paise as INR currency string.
   * e.g., 20000000 -> "₹2,00,000.00"
   */
  formatINR(paise) {
    const rupees = this.toRupees(paise);
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(rupees);
  }
};
