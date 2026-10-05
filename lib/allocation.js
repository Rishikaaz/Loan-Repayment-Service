import { Paise } from './money.js';

/**
 * Recalculates installment statuses and computes current position of the loan.
 * 
 * @param {Object} loan - Loan object
 * @param {Array<Object>} schedule - List of installments
 * @param {string|Date} [asOfDate] - Evaluation date (defaults to current date)
 * @returns {Object} { updatedSchedule, currentPosition }
 */
export function evaluateLoanPosition(loan, schedule, asOfDate = new Date()) {
  const currentDate = new Date(asOfDate);
  currentDate.setHours(0, 0, 0, 0);

  let totalPrincipalPaidPaise = 0;
  let totalInterestPaidPaise = 0;
  let overdueAmountPaise = 0;
  let nextDueDate = null;
  let nextDueAmountPaise = 0;

  const updatedSchedule = schedule.map(inst => {
    const instDueDate = new Date(inst.dueDate);
    instDueDate.setHours(0, 0, 0, 0);

    const isPastDue = instDueDate < currentDate;
    const remainingDuePaise = inst.totalDuePaise - inst.amountPaidPaise;

    let status = 'PENDING';
    if (inst.amountPaidPaise >= inst.totalDuePaise) {
      status = 'PAID';
    } else if (inst.amountPaidPaise > 0) {
      status = isPastDue ? 'OVERDUE' : 'PARTIAL';
    } else {
      status = isPastDue ? 'OVERDUE' : 'PENDING';
    }

    if (isPastDue && remainingDuePaise > 0) {
      overdueAmountPaise += remainingDuePaise;
    }

    if (!nextDueDate && remainingDuePaise > 0 && !isPastDue) {
      nextDueDate = inst.dueDate;
      nextDueAmountPaise = remainingDuePaise;
    }

    // Principal & interest tracking
    // Interest is prioritized first within the installment
    const interestPaidForInst = Math.min(inst.amountPaidPaise, inst.interestComponentPaise);
    const principalPaidForInst = Math.max(0, inst.amountPaidPaise - inst.interestComponentPaise);

    totalInterestPaidPaise += interestPaidForInst;
    totalPrincipalPaidPaise += principalPaidForInst;

    return {
      ...inst,
      status,
      remainingDuePaise: Math.max(0, remainingDuePaise)
    };
  });

  // If there are no future installments, but overdue exists, next due date can reflect the oldest overdue or null
  if (!nextDueDate && overdueAmountPaise > 0) {
    const firstUnpaid = updatedSchedule.find(i => i.remainingDuePaise > 0);
    if (firstUnpaid) {
      nextDueDate = firstUnpaid.dueDate;
      nextDueAmountPaise = firstUnpaid.remainingDuePaise;
    }
  }

  const initialPrincipalPaise = Number(loan.principalPaise);
  const outstandingPrincipalPaise = Math.max(0, initialPrincipalPaise - totalPrincipalPaidPaise);

  let loanStatus = 'ACTIVE';
  if (outstandingPrincipalPaise === 0 && overdueAmountPaise === 0) {
    loanStatus = 'PAID_OFF';
  } else if (overdueAmountPaise > 0) {
    loanStatus = 'DELINQUENT';
  }

  return {
    updatedSchedule,
    currentPosition: {
      loanId: loan.id,
      loanStatus,
      initialPrincipalPaise,
      outstandingPrincipalPaise,
      totalPrincipalPaidPaise,
      totalInterestPaidPaise,
      overdueAmountPaise,
      nextDueDate,
      nextDueAmountPaise,
      asOfDate: currentDate.toISOString().split('T')[0]
    }
  };
}

/**
 * Allocates a payment amount across the loan repayment schedule.
 * 
 * Allocation Policy:
 * 1. Chronological order: Oldest unpaid / overdue installments are settled first.
 * 2. Excess payments (overpayment) waterfall forward to settle subsequent installments.
 * 3. Partial payments reduce the current oldest installment, marking it PARTIAL or OVERDUE.
 * 4. Payment is recorded and position is re-evaluated.
 * 
 * @param {Object} loan
 * @param {Array<Object>} schedule
 * @param {number} paymentAmountPaise
 * @param {string|Date} paymentDate
 * @returns {Object} { updatedSchedule, currentPosition, allocatedDetails }
 */
export function allocatePayment(loan, schedule, paymentAmountPaise, paymentDate) {
  if (!paymentAmountPaise || paymentAmountPaise <= 0 || !Number.isInteger(paymentAmountPaise)) {
    throw new Error('Payment amount must be a positive integer in paise');
  }

  let unallocatedPaise = paymentAmountPaise;
  const allocations = [];

  const updatedSchedule = schedule.map(inst => {
    if (unallocatedPaise <= 0 || inst.amountPaidPaise >= inst.totalDuePaise) {
      return { ...inst };
    }

    const neededPaise = inst.totalDuePaise - inst.amountPaidPaise;
    const allocateForInst = Math.min(unallocatedPaise, neededPaise);

    unallocatedPaise -= allocateForInst;
    allocations.push({
      installmentNumber: inst.installmentNumber,
      allocatedPaise: allocateForInst,
      priorPaidPaise: inst.amountPaidPaise,
      newPaidPaise: inst.amountPaidPaise + allocateForInst,
      totalDuePaise: inst.totalDuePaise
    });

    return {
      ...inst,
      amountPaidPaise: inst.amountPaidPaise + allocateForInst
    };
  });

  const { updatedSchedule: finalSchedule, currentPosition } = evaluateLoanPosition(
    loan,
    updatedSchedule,
    paymentDate
  );

  return {
    updatedSchedule: finalSchedule,
    currentPosition,
    unallocatedPaise, // If payment exceeds total loan obligation
    allocations
  };
}
