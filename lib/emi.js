import { Paise } from './money.js';

/**
 * Calculates monthly EMI using the standard formula:
 * EMI = P * r * (1 + r)^n / ((1 + r)^n - 1)
 * 
 * @param {number} principalPaise - Principal in Paise
 * @param {number} annualRatePercent - Annual interest rate (e.g. 18 for 18%)
 * @param {number} tenureMonths - Tenure in months (3 to 36)
 * @returns {number} Monthly EMI in Paise (rounded to whole paise)
 */
export function calculateEMI(principalPaise, annualRatePercent, tenureMonths) {
  if (!principalPaise || principalPaise <= 0) throw new Error('Principal must be positive');
  if (annualRatePercent === undefined || annualRatePercent === null || annualRatePercent < 0) {
    throw new Error('Annual rate must be non-negative');
  }
  if (!tenureMonths || tenureMonths <= 0 || !Number.isInteger(tenureMonths)) {
    throw new Error('Tenure must be a positive integer');
  }

  // If 0% interest, straight division
  if (annualRatePercent === 0) {
    return Math.round(principalPaise / tenureMonths);
  }

  const r = annualRatePercent / (12 * 100);
  const factor = Math.pow(1 + r, tenureMonths);
  const emi = (principalPaise * r * factor) / (factor - 1);

  return Math.round(emi);
}

/**
 * Generates full repayment schedule.
 * Correctly accounts for rounding differences on the final installment.
 * 
 * @param {Object} params
 * @param {number} params.principalPaise - Principal in Paise
 * @param {number} params.annualRatePercent - Annual interest rate in percent
 * @param {number} params.tenureMonths - Number of monthly installments
 * @param {string|Date} params.disbursementDate - ISO string or Date
 * @returns {Array<Object>} List of schedule installments
 */
export function generateSchedule({ principalPaise, annualRatePercent, tenureMonths, disbursementDate }) {
  if (!principalPaise || principalPaise <= 0) throw new Error('Principal must be positive');
  if (!tenureMonths || tenureMonths <= 0) throw new Error('Tenure must be positive');
  if (!disbursementDate) throw new Error('Disbursement date is required');

  const baseDate = new Date(disbursementDate);
  if (isNaN(baseDate.getTime())) throw new Error('Invalid disbursement date');

  const monthlyRate = annualRatePercent / (12 * 100);
  const regularEmiPaise = calculateEMI(principalPaise, annualRatePercent, tenureMonths);

  let balancePrincipalPaise = principalPaise;
  const schedule = [];

  for (let i = 1; i <= tenureMonths; i++) {
    // Due date = 1 month after disbursement date for 1st installment, etc.
    const dueDate = new Date(baseDate);
    dueDate.setMonth(dueDate.getMonth() + i);
    const dueDateStr = dueDate.toISOString().split('T')[0];

    // Interest for the current month based on remaining principal balance
    const interestPaise = Math.round(balancePrincipalPaise * monthlyRate);

    let principalPaiseForMonth;
    let totalDuePaise;

    if (i === tenureMonths) {
      // Final installment: Absorb remaining principal and adjust total due
      principalPaiseForMonth = balancePrincipalPaise;
      totalDuePaise = principalPaiseForMonth + interestPaise;
      balancePrincipalPaise = 0;
    } else {
      principalPaiseForMonth = regularEmiPaise - interestPaise;
      // Handle edge case if regular EMI is lower than interest
      if (principalPaiseForMonth <= 0) {
        principalPaiseForMonth = 1;
      }
      // Ensure we don't exceed remaining principal
      if (principalPaiseForMonth > balancePrincipalPaise) {
        principalPaiseForMonth = balancePrincipalPaise;
      }
      totalDuePaise = principalPaiseForMonth + interestPaise;
      balancePrincipalPaise -= principalPaiseForMonth;
    }

    schedule.push({
      installmentNumber: i,
      dueDate: dueDateStr,
      principalComponentPaise: principalPaiseForMonth,
      interestComponentPaise: interestPaise,
      totalDuePaise: totalDuePaise,
      amountPaidPaise: 0,
      status: 'PENDING' // 'PENDING', 'PARTIAL', 'PAID', 'OVERDUE'
    });
  }

  return schedule;
}
