import { NextResponse } from 'next/server';
import { query, initDb } from '../../../../lib/db.js';
import { authenticateRequest } from '../../../../lib/auth.js';
import { Paise } from '../../../../lib/money.js';
import { evaluateLoanPosition } from '../../../../lib/allocation.js';

export async function GET(request, { params }) {
  try {
    await authenticateRequest(request);
    await initDb();

    const { id } = await params;
    if (!id) {
      return NextResponse.json(
        { success: false, error: 'Loan identifier is required' },
        { status: 400 }
      );
    }

    // Fetch loan
    const loanResult = await query(
      `SELECT id, principal_paise, annual_interest_rate, tenure_months, disbursement_date, status, created_at
       FROM loans WHERE id = $1`,
      [id]
    );

    if (loanResult.rows.length === 0) {
      return NextResponse.json(
        { success: false, error: `Loan not found with identifier: ${id}` },
        { status: 404 }
      );
    }

    const loanRow = loanResult.rows[0];
    const loan = {
      id: loanRow.id,
      principal: Paise.toRupees(loanRow.principal_paise),
      principalPaise: Number(loanRow.principal_paise),
      annualInterestRate: Number(loanRow.annual_interest_rate),
      tenureMonths: loanRow.tenure_months,
      disbursementDate: loanRow.disbursement_date.toISOString().split('T')[0],
      status: loanRow.status,
      createdAt: loanRow.created_at
    };

    // Fetch installments
    const installmentsResult = await query(
      `SELECT installment_number, due_date, principal_component_paise, interest_component_paise, total_due_paise, amount_paid_paise
       FROM installments WHERE loan_id = $1 ORDER BY installment_number ASC`,
      [id]
    );

    const schedule = installmentsResult.rows.map(row => ({
      installmentNumber: row.installment_number,
      dueDate: row.due_date.toISOString().split('T')[0],
      principalComponentPaise: Number(row.principal_component_paise),
      interestComponentPaise: Number(row.interest_component_paise),
      totalDuePaise: Number(row.total_due_paise),
      amountPaidPaise: Number(row.amount_paid_paise)
    }));

    // Fetch payments
    const paymentsResult = await query(
      `SELECT id, amount_paise, payment_date, created_at
       FROM payments WHERE loan_id = $1 ORDER BY payment_date ASC, created_at ASC`,
      [id]
    );

    const payments = paymentsResult.rows.map(row => ({
      id: row.id,
      amount: Paise.toRupees(row.amount_paise),
      amountPaise: Number(row.amount_paise),
      paymentDate: row.payment_date.toISOString().split('T')[0],
      createdAt: row.created_at
    }));

    // Evaluate live current position
    const { updatedSchedule, currentPosition } = evaluateLoanPosition(loan, schedule);

    return NextResponse.json({
      success: true,
      loan: {
        ...loan,
        status: currentPosition.loanStatus
      },
      currentPosition: {
        loanId: currentPosition.loanId,
        loanStatus: currentPosition.loanStatus,
        initialPrincipal: Paise.toRupees(currentPosition.initialPrincipalPaise),
        initialPrincipalPaise: currentPosition.initialPrincipalPaise,
        outstandingPrincipal: Paise.toRupees(currentPosition.outstandingPrincipalPaise),
        outstandingPrincipalPaise: currentPosition.outstandingPrincipalPaise,
        totalPrincipalPaid: Paise.toRupees(currentPosition.totalPrincipalPaidPaise),
        totalInterestPaid: Paise.toRupees(currentPosition.totalInterestPaidPaise),
        overdueAmount: Paise.toRupees(currentPosition.overdueAmountPaise),
        overdueAmountPaise: currentPosition.overdueAmountPaise,
        nextDueDate: currentPosition.nextDueDate,
        nextDueAmount: Paise.toRupees(currentPosition.nextDueAmountPaise),
        nextDueAmountPaise: currentPosition.nextDueAmountPaise,
        asOfDate: currentPosition.asOfDate
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
      })),
      payments
    });
  } catch (error) {
    const status = error.statusCode || 500;
    return NextResponse.json({ success: false, error: error.message }, { status });
  }
}
