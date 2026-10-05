import { NextResponse } from 'next/server';
import { getPool, initDb } from '../../../../../lib/db.js';
import { authenticateRequest } from '../../../../../lib/auth.js';
import { Paise } from '../../../../../lib/money.js';
import { allocatePayment } from '../../../../../lib/allocation.js';

export async function POST(request, { params }) {
  const pool = getPool();
  let client;

  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json(
        { success: false, error: 'Loan identifier is required' },
        { status: 400 }
      );
    }

    const body = await request.json();
    const { amount, paymentDate, paymentId } = body;

    // Validation
    if (amount === undefined || isNaN(Number(amount)) || Number(amount) <= 0) {
      return NextResponse.json(
        { success: false, error: 'Validation failed: Payment amount must be a positive number' },
        { status: 400 }
      );
    }

    if (!paymentDate || isNaN(new Date(paymentDate).getTime())) {
      return NextResponse.json(
        { success: false, error: 'Validation failed: paymentDate must be a valid date (YYYY-MM-DD)' },
        { status: 400 }
      );
    }

    await initDb();

    const paymentAmountPaise = Paise.fromRupees(amount);
    const resolvedPaymentId = paymentId || `PAY-${Date.now()}-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;

    client = await pool.connect();
    await client.query('BEGIN');

    // 1. Check for duplicate payment submission
    const duplicateCheck = await client.query(
      'SELECT id, amount_paise, payment_date FROM payments WHERE id = $1',
      [resolvedPaymentId]
    );

    if (duplicateCheck.rows.length > 0) {
      await client.query('ROLLBACK');
      return NextResponse.json(
        {
          success: false,
          error: `Duplicate submission: Payment with ID ${resolvedPaymentId} has already been processed`
        },
        { status: 409 }
      );
    }

    // 2. Fetch loan
    const loanRes = await client.query(
      'SELECT id, principal_paise, annual_interest_rate, tenure_months, disbursement_date, status FROM loans WHERE id = $1 FOR UPDATE',
      [id]
    );

    if (loanRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return NextResponse.json(
        { success: false, error: `Loan not found with identifier: ${id}` },
        { status: 404 }
      );
    }

    const loanRow = loanRes.rows[0];
    const loan = {
      id: loanRow.id,
      principal: Paise.toRupees(loanRow.principal_paise),
      principalPaise: Number(loanRow.principal_paise),
      annualInterestRate: Number(loanRow.annual_interest_rate),
      tenureMonths: loanRow.tenure_months,
      disbursementDate: loanRow.disbursement_date.toISOString().split('T')[0],
      status: loanRow.status
    };

    // 3. Fetch current installments with lock
    const instRes = await client.query(
      `SELECT installment_number, due_date, principal_component_paise, interest_component_paise, total_due_paise, amount_paid_paise
       FROM installments WHERE loan_id = $1 ORDER BY installment_number ASC FOR UPDATE`,
      [id]
    );

    const schedule = instRes.rows.map(row => ({
      installmentNumber: row.installment_number,
      dueDate: row.due_date.toISOString().split('T')[0],
      principalComponentPaise: Number(row.principal_component_paise),
      interestComponentPaise: Number(row.interest_component_paise),
      totalDuePaise: Number(row.total_due_paise),
      amountPaidPaise: Number(row.amount_paid_paise)
    }));

    // 4. Allocate payment
    const { updatedSchedule, currentPosition, unallocatedPaise, allocations } = allocatePayment(
      loan,
      schedule,
      paymentAmountPaise,
      paymentDate
    );

    // 5. Update installments in DB
    for (const inst of updatedSchedule) {
      await client.query(
        `UPDATE installments SET amount_paid_paise = $1 
         WHERE loan_id = $2 AND installment_number = $3`,
        [inst.amountPaidPaise, id, inst.installmentNumber]
      );
    }

    // 6. Record payment in payments table
    await client.query(
      `INSERT INTO payments (id, loan_id, amount_paise, payment_date)
       VALUES ($1, $2, $3, $4)`,
      [resolvedPaymentId, id, paymentAmountPaise, paymentDate]
    );

    // 7. Update loan status if paid off
    if (currentPosition.loanStatus === 'PAID_OFF') {
      await client.query("UPDATE loans SET status = 'PAID_OFF' WHERE id = $1", [id]);
    }

    await client.query('COMMIT');

    return NextResponse.json(
      {
        success: true,
        message: 'Payment recorded and allocated across schedule successfully',
        payment: {
          id: resolvedPaymentId,
          loanId: id,
          amount: Paise.toRupees(paymentAmountPaise),
          amountPaise: paymentAmountPaise,
          paymentDate,
          unallocatedAmount: Paise.toRupees(unallocatedPaise)
        },
        allocations: allocations.map(a => ({
          installmentNumber: a.installmentNumber,
          allocatedAmount: Paise.toRupees(a.allocatedPaise),
          totalDue: Paise.toRupees(a.totalDuePaise),
          newPaidAmount: Paise.toRupees(a.newPaidPaise)
        })),
        currentPosition: {
          loanId: currentPosition.loanId,
          loanStatus: currentPosition.loanStatus,
          outstandingPrincipal: Paise.toRupees(currentPosition.outstandingPrincipalPaise),
          overdueAmount: Paise.toRupees(currentPosition.overdueAmountPaise),
          nextDueDate: currentPosition.nextDueDate,
          nextDueAmount: Paise.toRupees(currentPosition.nextDueAmountPaise),
          totalPrincipalPaid: Paise.toRupees(currentPosition.totalPrincipalPaidPaise),
          totalInterestPaid: Paise.toRupees(currentPosition.totalInterestPaidPaise)
        },
        schedule: updatedSchedule.map(inst => ({
          installmentNumber: inst.installmentNumber,
          dueDate: inst.dueDate,
          principalComponent: Paise.toRupees(inst.principalComponentPaise),
          interestComponent: Paise.toRupees(inst.interestComponentPaise),
          totalDue: Paise.toRupees(inst.totalDuePaise),
          amountPaid: Paise.toRupees(inst.amountPaidPaise),
          remainingDue: Paise.toRupees(inst.remainingDuePaise),
          status: inst.status
        }))
      },
      { status: 201 }
    );
  } catch (error) {
    if (client) {
      try {
        await client.query('ROLLBACK');
      } catch (rbErr) {
        // ignore rollback error
      }
    }
    const status = error.statusCode || 500;
    return NextResponse.json({ success: false, error: error.message }, { status });
  } finally {
    if (client) {
      client.release();
    }
  }
}
