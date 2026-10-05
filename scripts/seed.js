import 'dotenv/config';
import { initDb, getPool, query } from '../lib/db.js';
import { Paise } from '../lib/money.js';
import { generateSchedule } from '../lib/emi.js';
import { allocatePayment } from '../lib/allocation.js';

const SEED_LOANS = [
  {
    id: 'LOAN-MSME-101',
    description: 'Active Standard Loan - ₹2,00,000 @ 18% for 24 months (On-time repayments)',
    principal: 200000,
    annualInterestRate: 18,
    tenureMonths: 24,
    disbursementDate: '2026-08-01',
    payments: [
      { id: 'PAY-101-1', amount: 9985, paymentDate: '2026-09-01' }
    ]
  },
  {
    id: 'LOAN-MSME-102',
    description: 'OVERDUE Loan - ₹5,00,000 @ 15% for 12 months (3 installments overdue)',
    principal: 500000,
    annualInterestRate: 15,
    tenureMonths: 12,
    disbursementDate: '2026-05-15',
    payments: [
      { id: 'PAY-102-1', amount: 45129, paymentDate: '2026-06-15' }
      // July, Aug, Sep installments missed -> Overdue!
    ]
  },
  {
    id: 'LOAN-MSME-103',
    description: 'Multi-payment Short Term Loan - ₹1,00,000 @ 12% for 6 months',
    principal: 100000,
    annualInterestRate: 12,
    tenureMonths: 6,
    disbursementDate: '2026-07-10',
    payments: [
      { id: 'PAY-103-1', amount: 17255, paymentDate: '2026-08-10' },
      { id: 'PAY-103-2', amount: 17255, paymentDate: '2026-09-10' }
    ]
  }
];

async function seed() {
  console.log('🌱 Seeding PostgreSQL Database with MSME test loans...');
  await initDb();

  for (const item of SEED_LOANS) {
    const principalPaise = Paise.fromRupees(item.principal);
    
    // Check if loan exists, remove for idempotent re-seeding
    await query('DELETE FROM loans WHERE id = $1', [item.id]);

    // Insert loan
    await query(
      `INSERT INTO loans (id, principal_paise, annual_interest_rate, tenure_months, disbursement_date, status)
       VALUES ($1, $2, $3, $4, $5, 'ACTIVE')`,
      [item.id, principalPaise, item.annualInterestRate, item.tenureMonths, item.disbursementDate]
    );

    // Generate schedule
    const schedule = generateSchedule({
      principalPaise,
      annualRatePercent: item.annualInterestRate,
      tenureMonths: item.tenureMonths,
      disbursementDate: item.disbursementDate
    });

    for (const inst of schedule) {
      await query(
        `INSERT INTO installments (
           loan_id, installment_number, due_date, 
           principal_component_paise, interest_component_paise, 
           total_due_paise, amount_paid_paise
         ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          item.id,
          inst.installmentNumber,
          inst.dueDate,
          inst.principalComponentPaise,
          inst.interestComponentPaise,
          inst.totalDuePaise,
          0
        ]
      );
    }

    // Apply seed payments
    let currentSchedule = [...schedule];
    const loanObj = {
      id: item.id,
      principalPaise,
      annualInterestRate: item.annualInterestRate,
      tenureMonths: item.tenureMonths,
      disbursementDate: item.disbursementDate
    };

    for (const pay of item.payments) {
      const payPaise = Paise.fromRupees(pay.amount);
      const { updatedSchedule } = allocatePayment(loanObj, currentSchedule, payPaise, pay.paymentDate);
      currentSchedule = updatedSchedule;

      for (const inst of updatedSchedule) {
        await query(
          `UPDATE installments SET amount_paid_paise = $1 WHERE loan_id = $2 AND installment_number = $3`,
          [inst.amountPaidPaise, item.id, inst.installmentNumber]
        );
      }

      await query(
        `INSERT INTO payments (id, loan_id, amount_paise, payment_date)
         VALUES ($1, $2, $3, $4)`,
        [pay.id, item.id, payPaise, pay.paymentDate]
      );
    }

    console.log(`✅ Seeded Loan: ${item.id} (${item.description})`);
  }

  console.log('🎉 Seeding completed successfully!');
  const pool = getPool();
  await pool.end();
}

seed().catch(err => {
  console.error('❌ Seeding failed:', err);
  process.exit(1);
});
