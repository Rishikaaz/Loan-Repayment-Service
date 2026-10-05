import { NextResponse } from 'next/server';
import { query, initDb } from '../../../lib/db.js';
import { authenticateRequest } from '../../../lib/auth.js';
import { Paise } from '../../../lib/money.js';
import { generateSchedule } from '../../../lib/emi.js';
import { evaluateLoanPosition } from '../../../lib/allocation.js';

export async function GET(request) {
  try {
    await authenticateRequest(request);
    await initDb();

    const loansResult = await query(
      `SELECT id, principal_paise, annual_interest_rate, tenure_months, disbursement_date, status, created_at 
       FROM loans ORDER BY created_at DESC`
    );

    const loans = loansResult.rows.map(row => ({
      id: row.id,
      principal: Paise.toRupees(row.principal_paise),
      principalPaise: Number(row.principal_paise),
      annualInterestRate: Number(row.annual_interest_rate),
      tenureMonths: row.tenure_months,
      disbursementDate: row.disbursement_date.toISOString().split('T')[0],
      status: row.status,
      createdAt: row.created_at
    }));

    return NextResponse.json({ success: true, count: loans.length, loans });
  } catch (error) {
    const status = error.statusCode || 500;
    return NextResponse.json({ success: false, error: error.message }, { status });
  }
}

export async function POST(request) {
  try {
    await authenticateRequest(request);

    const body = await request.json();
    const { principal, annualInterestRate, tenureMonths, disbursementDate, id } = body;

    // Validation
    if (principal === undefined || isNaN(Number(principal)) || Number(principal) <= 0) {
      return NextResponse.json(
        { success: false, error: 'Validation failed: principal must be a positive number' },
        { status: 400 }
      );
    }
    if (annualInterestRate === undefined || isNaN(Number(annualInterestRate)) || Number(annualInterestRate) < 0) {
      return NextResponse.json(
        { success: false, error: 'Validation failed: annualInterestRate must be a non-negative number' },
        { status: 400 }
      );
    }
    if (!tenureMonths || !Number.isInteger(Number(tenureMonths)) || Number(tenureMonths) <= 0) {
      return NextResponse.json(
        { success: false, error: 'Validation failed: tenureMonths must be a positive integer' },
        { status: 400 }
      );
    }
    if (!disbursementDate || isNaN(new Date(disbursementDate).getTime())) {
      return NextResponse.json(
        { success: false, error: 'Validation failed: disbursementDate must be a valid ISO date (YYYY-MM-DD)' },
        { status: 400 }
      );
    }

    await initDb();

    const principalPaise = Paise.fromRupees(principal);
    const parsedRate = Number(annualInterestRate);
    const parsedTenure = Number(tenureMonths);
    const loanId = id || `LOAN-${Date.now()}-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;

    // Check if loan ID already exists
    const existing = await query('SELECT id FROM loans WHERE id = $1', [loanId]);
    if (existing.rows.length > 0) {
      return NextResponse.json(
        { success: false, error: `Loan with ID ${loanId} already exists` },
        { status: 409 }
      );
    }

    // Generate repayment schedule
    const schedule = generateSchedule({
      principalPaise,
      annualRatePercent: parsedRate,
      tenureMonths: parsedTenure,
      disbursementDate
    });

    // Save loan and installments
    await query(
      `INSERT INTO loans (id, principal_paise, annual_interest_rate, tenure_months, disbursement_date, status)
       VALUES ($1, $2, $3, $4, $5, 'ACTIVE')`,
      [loanId, principalPaise, parsedRate, parsedTenure, disbursementDate]
    );

    for (const inst of schedule) {
      await query(
        `INSERT INTO installments (
           loan_id, installment_number, due_date, 
           principal_component_paise, interest_component_paise, 
           total_due_paise, amount_paid_paise
         ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          loanId,
          inst.installmentNumber,
          inst.dueDate,
          inst.principalComponentPaise,
          inst.interestComponentPaise,
          inst.totalDuePaise,
          inst.amountPaidPaise
        ]
      );
    }

    const loanObj = {
      id: loanId,
      principal: Number(principal),
      principalPaise,
      annualInterestRate: parsedRate,
      tenureMonths: parsedTenure,
      disbursementDate,
      status: 'ACTIVE'
    };

    const { currentPosition } = evaluateLoanPosition(loanObj, schedule);

    return NextResponse.json(
      {
        success: true,
        message: 'Loan created successfully with full repayment schedule',
        loan: loanObj,
        currentPosition: {
          ...currentPosition,
          initialPrincipal: Paise.toRupees(currentPosition.initialPrincipalPaise),
          outstandingPrincipal: Paise.toRupees(currentPosition.outstandingPrincipalPaise),
          overdueAmount: Paise.toRupees(currentPosition.overdueAmountPaise),
          nextDueAmount: Paise.toRupees(currentPosition.nextDueAmountPaise)
        },
        schedule: schedule.map(i => ({
          installmentNumber: i.installmentNumber,
          dueDate: i.dueDate,
          principalComponent: Paise.toRupees(i.principalComponentPaise),
          interestComponent: Paise.toRupees(i.interestComponentPaise),
          totalDue: Paise.toRupees(i.totalDuePaise),
          amountPaid: Paise.toRupees(i.amountPaidPaise),
          status: i.status
        }))
      },
      { status: 201 }
    );
  } catch (error) {
    const status = error.statusCode || 500;
    return NextResponse.json({ success: false, error: error.message }, { status });
  }
}
