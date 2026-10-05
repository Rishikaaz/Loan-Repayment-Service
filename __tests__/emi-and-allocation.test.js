import { calculateEMI, generateSchedule } from '../lib/emi.js';
import { allocatePayment, evaluateLoanPosition } from '../lib/allocation.js';
import { Paise } from '../lib/money.js';

describe('Unit Tests: EMI Calculation & Schedule Generation', () => {
  test('1. Calculates correct monthly EMI for ₹2,00,000 at 18% p.a. for 24 months (~₹9,985 - ₹9,986)', () => {
    const principalPaise = Paise.fromRupees(200000);
    const emiPaise = calculateEMI(principalPaise, 18, 24);
    const emiRupees = Paise.toRupees(emiPaise);

    // Standard formula yields 9984.87 -> rounds to 9985
    expect(emiRupees).toBeGreaterThanOrEqual(9984);
    expect(emiRupees).toBeLessThanOrEqual(9986);
  });

  test('2. Generates schedule where sum of principal components matches initial principal exactly', () => {
    const principalPaise = Paise.fromRupees(200000);
    const schedule = generateSchedule({
      principalPaise,
      annualRatePercent: 18,
      tenureMonths: 24,
      disbursementDate: '2026-01-01'
    });

    expect(schedule.length).toBe(24);

    const totalPrincipal = schedule.reduce((sum, inst) => sum + inst.principalComponentPaise, 0);
    expect(totalPrincipal).toBe(principalPaise);

    // Verify first installment due date is 1 month after disbursement
    expect(schedule[0].dueDate).toBe('2026-02-01');
    expect(schedule[23].dueDate).toBe('2028-01-01');
  });

  test('3. Rejects invalid inputs (zero or negative tenure, negative principal)', () => {
    expect(() => calculateEMI(0, 18, 24)).toThrow('Principal must be positive');
    expect(() => calculateEMI(Paise.fromRupees(100000), 18, 0)).toThrow('Tenure must be a positive integer');
    expect(() => calculateEMI(Paise.fromRupees(100000), -5, 12)).toThrow('Annual rate must be non-negative');
  });
});

describe('Unit Tests: Payment Allocation & Edge Cases', () => {
  const sampleLoan = {
    id: 'LOAN-TEST-001',
    principalPaise: Paise.fromRupees(200000),
    annualInterestRate: 18,
    tenureMonths: 24,
    disbursementDate: '2026-01-01'
  };

  test('4. Underpayment: ₹9,985 due and ₹5,000 received leaves installment PARTIAL / reduces outstanding', () => {
    const schedule = generateSchedule({
      principalPaise: sampleLoan.principalPaise,
      annualRatePercent: sampleLoan.annualInterestRate,
      tenureMonths: sampleLoan.tenureMonths,
      disbursementDate: sampleLoan.disbursementDate
    });

    const paymentPaise = Paise.fromRupees(5000);
    const paymentDate = '2026-01-15'; // before due date

    const { updatedSchedule, currentPosition } = allocatePayment(
      sampleLoan,
      schedule,
      paymentPaise,
      paymentDate
    );

    expect(updatedSchedule[0].amountPaidPaise).toBe(paymentPaise);
    expect(updatedSchedule[0].status).toBe('PARTIAL');
    expect(updatedSchedule[0].remainingDuePaise).toBe(updatedSchedule[0].totalDuePaise - paymentPaise);
  });

  test('5. Overpayment: Twice the regular installment received settles current and rolls over into next installment', () => {
    const schedule = generateSchedule({
      principalPaise: sampleLoan.principalPaise,
      annualRatePercent: sampleLoan.annualInterestRate,
      tenureMonths: sampleLoan.tenureMonths,
      disbursementDate: sampleLoan.disbursementDate
    });

    const firstTotalDue = schedule[0].totalDuePaise;
    const overpaymentPaise = firstTotalDue * 2;

    const { updatedSchedule } = allocatePayment(
      sampleLoan,
      schedule,
      overpaymentPaise,
      '2026-01-15'
    );

    // First installment is completely PAID
    expect(updatedSchedule[0].status).toBe('PAID');
    expect(updatedSchedule[0].amountPaidPaise).toBe(firstTotalDue);

    // Second installment receives the remainder
    expect(updatedSchedule[1].amountPaidPaise).toBe(firstTotalDue);
  });

  test('6. Late payment: Evaluates overdue position correctly when payment date is 11 days past due date', () => {
    const schedule = generateSchedule({
      principalPaise: sampleLoan.principalPaise,
      annualRatePercent: sampleLoan.annualInterestRate,
      tenureMonths: sampleLoan.tenureMonths,
      disbursementDate: sampleLoan.disbursementDate
    });

    // Due date for installment 1 is 2026-02-01
    // Evaluate status on 2026-02-12 (11 days late) BEFORE payment
    const { currentPosition: overduePos } = evaluateLoanPosition(
      sampleLoan,
      schedule,
      '2026-02-12'
    );

    expect(overduePos.loanStatus).toBe('DELINQUENT');
    expect(overduePos.overdueAmountPaise).toBe(schedule[0].totalDuePaise);

    // Now record late payment on 2026-02-12
    const { updatedSchedule, currentPosition: settledPos } = allocatePayment(
      sampleLoan,
      schedule,
      schedule[0].totalDuePaise,
      '2026-02-12'
    );

    expect(updatedSchedule[0].status).toBe('PAID');
    expect(settledPos.overdueAmountPaise).toBe(0);
  });

  test('7. Multiple partial payments accumulate to fully settle installment', () => {
    const schedule = generateSchedule({
      principalPaise: sampleLoan.principalPaise,
      annualRatePercent: sampleLoan.annualInterestRate,
      tenureMonths: sampleLoan.tenureMonths,
      disbursementDate: sampleLoan.disbursementDate
    });

    const part1 = Paise.fromRupees(4000);
    const { updatedSchedule: step1 } = allocatePayment(sampleLoan, schedule, part1, '2026-01-10');
    expect(step1[0].status).toBe('PARTIAL');

    const part2 = Paise.fromRupees(6000);
    const { updatedSchedule: step2 } = allocatePayment(sampleLoan, step1, part2, '2026-01-20');

    expect(step2[0].status).toBe('PAID');
    expect(step2[0].amountPaidPaise).toBe(step2[0].totalDuePaise);
    // Excess overflows into installment 2
    expect(step2[1].amountPaidPaise).toBeGreaterThan(0);
  });

  test('8. Rejects invalid payment input (negative or non-numeric values)', () => {
    const schedule = generateSchedule({
      principalPaise: sampleLoan.principalPaise,
      annualRatePercent: sampleLoan.annualInterestRate,
      tenureMonths: sampleLoan.tenureMonths,
      disbursementDate: sampleLoan.disbursementDate
    });

    expect(() => allocatePayment(sampleLoan, schedule, -100, '2026-01-10')).toThrow(
      'Payment amount must be a positive integer in paise'
    );
    expect(() => allocatePayment(sampleLoan, schedule, 0, '2026-01-10')).toThrow(
      'Payment amount must be a positive integer in paise'
    );
  });
});
