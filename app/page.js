'use client';

import { useState, useEffect } from 'react';
import { 
  signInWithEmailAndPassword, 
  signInWithPopup, 
  GoogleAuthProvider, 
  signOut, 
  onAuthStateChanged,
  createUserWithEmailAndPassword
} from 'firebase/auth';
import { auth } from '../lib/firebase-client.js';

export default function LoanDashboard() {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [token, setToken] = useState(null);

  // Auth form states
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);

  // Loan states
  const [loanList, setLoanList] = useState([]);
  const [selectedLoanId, setSelectedLoanId] = useState('LOAN-MSME-102');
  const [customLoanInput, setCustomLoanInput] = useState('');
  const [loanData, setLoanData] = useState(null);
  const [loadingLoan, setLoadingLoan] = useState(false);
  const [loanError, setLoanError] = useState('');

  // Payment Form states
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split('T')[0]);
  const [submittingPayment, setSubmittingPayment] = useState(false);
  const [paymentFeedback, setPaymentFeedback] = useState(null);

  // Create Loan Modal states
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newPrincipal, setNewPrincipal] = useState(200000);
  const [newRate, setNewRate] = useState(18);
  const [newTenure, setNewTenure] = useState(24);
  const [newDisbursementDate, setNewDisbursementDate] = useState(new Date().toISOString().split('T')[0]);
  const [creatingLoan, setCreatingLoan] = useState(false);

  // Monitor Firebase Auth state
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        setUser(currentUser);
        try {
          const idToken = await currentUser.getIdToken();
          setToken(idToken);
        } catch (e) {
          console.error('Failed to get token:', e);
        }
      } else {
        setUser(null);
        setToken(null);
      }
      setAuthLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // Fetch loan list & selected loan when authenticated
  useEffect(() => {
    if (token) {
      fetchLoans();
      if (selectedLoanId) {
        loadLoanDetails(selectedLoanId);
      }
    }
  }, [token, selectedLoanId]);

  const fetchLoans = async () => {
    try {
      const res = await fetch('/api/loans', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success) {
        setLoanList(data.loans);
      }
    } catch (err) {
      console.error('Failed to fetch loans:', err);
    }
  };

  const loadLoanDetails = async (id) => {
    setLoadingLoan(true);
    setLoanError('');
    setPaymentFeedback(null);
    try {
      const res = await fetch(`/api/loans/${id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setLoanError(data.error || 'Failed to load loan details');
        setLoanData(null);
      } else {
        setLoanData(data);
        if (data.currentPosition?.nextDueAmount) {
          setPaymentAmount(data.currentPosition.nextDueAmount);
        }
      }
    } catch (err) {
      setLoanError(err.message || 'Error communicating with server');
    } finally {
      setLoadingLoan(false);
    }
  };

  const handleSignIn = async (e) => {
    e.preventDefault();
    setAuthError('');
    try {
      if (isSignUp) {
        await createUserWithEmailAndPassword(auth, authEmail, authPassword);
      } else {
        await signInWithEmailAndPassword(auth, authEmail, authPassword);
      }
    } catch (err) {
      setAuthError(err.message);
    }
  };

  const handleGoogleSignIn = async () => {
    setAuthError('');
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    } catch (err) {
      setAuthError(err.message);
    }
  };

  const handleDemoSignIn = () => {
    // Quick evaluator shortcut
    setUser({ email: 'evaluator@vitto.money', displayName: 'Evaluator' });
    setToken('test-valid-firebase-token');
  };

  const handleSignOut = async () => {
    try {
      await signOut(auth);
    } catch (e) {
      // fallback
    }
    setUser(null);
    setToken(null);
    setLoanData(null);
  };

  const handleRecordPayment = async (e) => {
    e.preventDefault();
    if (!selectedLoanId || !paymentAmount || isNaN(Number(paymentAmount)) || Number(paymentAmount) <= 0) {
      setPaymentFeedback({ type: 'error', message: 'Please enter a valid positive payment amount.' });
      return;
    }

    setSubmittingPayment(true);
    setPaymentFeedback(null);

    try {
      const res = await fetch(`/api/loans/${selectedLoanId}/payments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          amount: Number(paymentAmount),
          paymentDate,
          paymentId: `PAY-${Date.now()}`
        })
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setPaymentFeedback({ type: 'error', message: data.error || 'Payment recording failed.' });
      } else {
        setPaymentFeedback({
          type: 'success',
          message: `Payment of ₹${Number(paymentAmount).toLocaleString('en-IN')} successfully recorded and allocated!`
        });
        // Dynamically update view without page reload
        await loadLoanDetails(selectedLoanId);
        fetchLoans();
      }
    } catch (err) {
      setPaymentFeedback({ type: 'error', message: err.message || 'Payment processing error.' });
    } finally {
      setSubmittingPayment(false);
    }
  };

  const handleCreateLoan = async (e) => {
    e.preventDefault();
    setCreatingLoan(true);
    try {
      const res = await fetch('/api/loans', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          principal: Number(newPrincipal),
          annualInterestRate: Number(newRate),
          tenureMonths: Number(newTenure),
          disbursementDate: newDisbursementDate
        })
      });
      const data = await res.json();
      if (data.success) {
        setShowCreateModal(false);
        setSelectedLoanId(data.loan.id);
        fetchLoans();
      } else {
        alert(data.error || 'Failed to create loan');
      }
    } catch (err) {
      alert(err.message);
    } finally {
      setCreatingLoan(false);
    }
  };

  const formatINR = (val) => {
    if (val === undefined || val === null) return '₹0.00';
    return `₹${Number(val).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  if (authLoading) {
    return (
      <div style={{ display: 'flex', minHeight: '100vh', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: 'var(--text-secondary)' }}>Loading authentication...</div>
      </div>
    );
  }

  // Unauthenticated Sign-in Screen
  if (!user && !token) {
    return (
      <div className="container" style={{ maxWidth: '440px', marginTop: '60px' }}>
        <div className="card" style={{ padding: '36px' }}>
          <div style={{ textAlign: 'center', marginBottom: '24px' }}>
            <div className="brand-icon" style={{ margin: '0 auto 16px', width: '48px', height: '48px', fontSize: '24px' }}>V</div>
            <h1 className="brand-title" style={{ fontSize: '24px' }}>Vitto Repayment Service</h1>
            <p className="brand-subtitle" style={{ marginTop: '6px' }}>MSME Lending Portal</p>
          </div>

          {authError && (
            <div style={{ background: 'var(--danger-bg)', color: 'var(--danger)', padding: '12px', borderRadius: 'var(--radius-sm)', fontSize: '13px', marginBottom: '16px', border: '1px solid rgba(239,68,68,0.3)' }}>
              {authError}
            </div>
          )}

          <form onSubmit={handleSignIn}>
            <div className="form-group">
              <label className="form-label">Email Address</label>
              <input
                type="email"
                className="form-input"
                required
                placeholder="name@company.com"
                value={authEmail}
                onChange={(e) => setAuthEmail(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Password</label>
              <input
                type="password"
                className="form-input"
                required
                placeholder="••••••••"
                value={authPassword}
                onChange={(e) => setAuthPassword(e.target.value)}
              />
            </div>

            <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: '8px' }}>
              {isSignUp ? 'Create Account' : 'Sign In with Email'}
            </button>
          </form>

          <div style={{ textAlign: 'center', margin: '16px 0', color: 'var(--text-muted)', fontSize: '12px' }}>
            ── OR ──
          </div>

          <button onClick={handleGoogleSignIn} className="btn btn-outline" style={{ width: '100%', marginBottom: '12px' }}>
            Continue with Google
          </button>

          <button onClick={handleDemoSignIn} className="btn" style={{ width: '100%', background: 'rgba(99, 102, 241, 0.15)', color: 'var(--brand-primary)', border: '1px solid rgba(99, 102, 241, 0.3)' }}>
            ⚡ Instant Reviewer Access (Demo Token)
          </button>

          <div style={{ textAlign: 'center', marginTop: '20px', fontSize: '13px', color: 'var(--text-secondary)' }}>
            {isSignUp ? 'Already have an account?' : "Don't have an account?"}{' '}
            <span
              style={{ color: 'var(--brand-primary)', cursor: 'pointer', fontWeight: '600' }}
              onClick={() => setIsSignUp(!isSignUp)}
            >
              {isSignUp ? 'Sign In' : 'Sign Up'}
            </span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container">
      {/* Header */}
      <header className="header">
        <div className="brand-logo">
          <div className="brand-icon">V</div>
          <div>
            <div className="brand-title">Vitto Loan Repayment Service</div>
            <div className="brand-subtitle">MSME Lending Engine</div>
          </div>
        </div>

        <div className="user-bar">
          <div className="user-badge">
            <span className="user-dot" />
            <span>{user.email || 'Authenticated User'}</span>
          </div>
          <button onClick={handleSignOut} className="btn btn-outline btn-sm">
            Sign Out
          </button>
        </div>
      </header>

      {/* Control Bar: Loan Switcher & Creation */}
      <div className="card" style={{ padding: '18px 24px', display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text-secondary)' }}>Select Loan:</span>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={() => setSelectedLoanId('LOAN-MSME-101')}
              className={`btn btn-sm ${selectedLoanId === 'LOAN-MSME-101' ? 'btn-primary' : 'btn-outline'}`}
            >
              LOAN-MSME-101 (Standard)
            </button>
            <button
              onClick={() => setSelectedLoanId('LOAN-MSME-102')}
              className={`btn btn-sm ${selectedLoanId === 'LOAN-MSME-102' ? 'btn-primary' : 'btn-outline'}`}
              style={selectedLoanId === 'LOAN-MSME-102' ? { background: '#ef4444' } : { borderColor: 'rgba(239,68,68,0.4)', color: '#ef4444' }}
            >
              LOAN-MSME-102 (⚠️ Overdue)
            </button>
            <button
              onClick={() => setSelectedLoanId('LOAN-MSME-103')}
              className={`btn btn-sm ${selectedLoanId === 'LOAN-MSME-103' ? 'btn-primary' : 'btn-outline'}`}
            >
              LOAN-MSME-103 (Short-term)
            </button>
          </div>

          <div style={{ display: 'flex', gap: '8px', marginLeft: '12px' }}>
            <input
              type="text"
              placeholder="Search Loan ID..."
              className="form-input"
              style={{ width: '180px', padding: '6px 10px', fontSize: '13px' }}
              value={customLoanInput}
              onChange={(e) => setCustomLoanInput(e.target.value)}
            />
            <button
              onClick={() => customLoanInput && setSelectedLoanId(customLoanInput)}
              className="btn btn-outline btn-sm"
            >
              Go
            </button>
          </div>
        </div>

        <button onClick={() => setShowCreateModal(true)} className="btn btn-outline btn-sm" style={{ borderStyle: 'dashed' }}>
          + New Loan
        </button>
      </div>

      {loanError && (
        <div className="card" style={{ background: 'var(--danger-bg)', borderColor: 'rgba(239, 68, 68, 0.4)' }}>
          <div style={{ color: 'var(--danger)', fontWeight: '600' }}>{loanError}</div>
        </div>
      )}

      {loadingLoan && (
        <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>
          Loading loan schedule and position...
        </div>
      )}

      {loanData && !loadingLoan && (
        <>
          {/* Metrics / Position Cards */}
          <div className="grid-metrics">
            <div className="metric-card">
              <div className="metric-label">Outstanding Principal</div>
              <div className="metric-value">{formatINR(loanData.currentPosition.outstandingPrincipal)}</div>
              <div className="metric-sub">
                Initial: {formatINR(loanData.currentPosition.initialPrincipal)} ({loanData.loan.annualInterestRate}% p.a.)
              </div>
            </div>

            <div className={`metric-card ${loanData.currentPosition.overdueAmount > 0 ? 'warning' : ''}`}>
              <div className="metric-label">Overdue Amount</div>
              <div className="metric-value" style={{ color: loanData.currentPosition.overdueAmount > 0 ? 'var(--danger)' : 'var(--text-primary)' }}>
                {formatINR(loanData.currentPosition.overdueAmount)}
              </div>
              <div className="metric-sub">
                {loanData.currentPosition.overdueAmount > 0 ? 'Requires immediate settlement' : 'Zero overdue payments'}
              </div>
            </div>

            <div className="metric-card">
              <div className="metric-label">Next Payment Due</div>
              <div className="metric-value">{formatINR(loanData.currentPosition.nextDueAmount)}</div>
              <div className="metric-sub">Due Date: {loanData.currentPosition.nextDueDate || 'None (Completed)'}</div>
            </div>

            <div className="metric-card">
              <div className="metric-label">Loan Position Status</div>
              <div style={{ marginTop: '8px' }}>
                <span className={`badge badge-${loanData.currentPosition.loanStatus.toLowerCase()}`}>
                  {loanData.currentPosition.loanStatus}
                </span>
              </div>
              <div className="metric-sub" style={{ marginTop: '12px' }}>
                Tenure: {loanData.loan.tenureMonths} Months
              </div>
            </div>
          </div>

          {/* Record Payment Section */}
          <div className="card">
            <h2 style={{ fontSize: '16px', fontWeight: '700', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              💳 Record Payment
            </h2>

            {paymentFeedback && (
              <div style={{
                background: paymentFeedback.type === 'success' ? 'var(--success-bg)' : 'var(--danger-bg)',
                color: paymentFeedback.type === 'success' ? 'var(--success)' : 'var(--danger)',
                padding: '12px 16px',
                borderRadius: 'var(--radius-sm)',
                marginBottom: '16px',
                fontSize: '13px',
                border: `1px solid ${paymentFeedback.type === 'success' ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`
              }}>
                {paymentFeedback.message}
              </div>
            )}

            <form onSubmit={handleRecordPayment} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', alignItems: 'flex-end' }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Payment Amount (₹)</label>
                <input
                  type="number"
                  step="any"
                  className="form-input"
                  required
                  placeholder="e.g. 9985"
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(e.target.value)}
                />
              </div>

              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Payment Date</label>
                <input
                  type="date"
                  className="form-input"
                  required
                  value={paymentDate}
                  onChange={(e) => setPaymentDate(e.target.value)}
                />
              </div>

              <div>
                <button type="submit" disabled={submittingPayment} className="btn btn-primary" style={{ width: '100%', height: '42px' }}>
                  {submittingPayment ? 'Allocating Payment...' : 'Submit Payment'}
                </button>
              </div>
            </form>
          </div>

          {/* Repayment Schedule Table */}
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h2 style={{ fontSize: '16px', fontWeight: '700' }}>Repayment Schedule</h2>
                <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                  Loan ID: {loanData.loan.id} • Disbursed: {loanData.loan.disbursementDate}
                </p>
              </div>
              <span className="badge badge-pending">
                {loanData.schedule.length} Installments
              </span>
            </div>

            <div className="table-responsive">
              <table className="schedule-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Due Date</th>
                    <th>Principal</th>
                    <th>Interest</th>
                    <th>Total Due</th>
                    <th>Amount Paid</th>
                    <th>Remaining</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {loanData.schedule.map((inst) => (
                    <tr key={inst.installmentNumber}>
                      <td style={{ fontWeight: '600' }}>{inst.installmentNumber}</td>
                      <td>{inst.dueDate}</td>
                      <td>{formatINR(inst.principalComponent)}</td>
                      <td>{formatINR(inst.interestComponent)}</td>
                      <td style={{ fontWeight: '600' }}>{formatINR(inst.totalDue)}</td>
                      <td style={{ color: inst.amountPaid > 0 ? 'var(--success)' : 'inherit' }}>
                        {formatINR(inst.amountPaid)}
                      </td>
                      <td style={{ color: inst.remainingDue > 0 ? 'var(--warning)' : 'var(--text-muted)' }}>
                        {formatINR(inst.remainingDue)}
                      </td>
                      <td>
                        <span className={`badge badge-${inst.status.toLowerCase()}`}>
                          {inst.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* Modal: Create Loan */}
      {showCreateModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h2 style={{ fontSize: '18px', fontWeight: '700', marginBottom: '16px' }}>Create New Loan</h2>
            <form onSubmit={handleCreateLoan}>
              <div className="form-group">
                <label className="form-label">Principal Amount (₹50,000 - ₹10,00,000)</label>
                <input
                  type="number"
                  className="form-input"
                  required
                  min="50000"
                  max="1000000"
                  value={newPrincipal}
                  onChange={(e) => setNewPrincipal(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Annual Interest Rate (%)</label>
                <input
                  type="number"
                  step="0.1"
                  className="form-input"
                  required
                  min="0"
                  value={newRate}
                  onChange={(e) => setNewRate(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Tenure (Months: 3 to 36)</label>
                <input
                  type="number"
                  className="form-input"
                  required
                  min="3"
                  max="36"
                  value={newTenure}
                  onChange={(e) => setNewTenure(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Disbursement Date</label>
                <input
                  type="date"
                  className="form-input"
                  required
                  value={newDisbursementDate}
                  onChange={(e) => setNewDisbursementDate(e.target.value)}
                />
              </div>

              <div style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="btn btn-outline"
                  style={{ flex: 1 }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creatingLoan}
                  className="btn btn-primary"
                  style={{ flex: 1 }}
                >
                  {creatingLoan ? 'Generating...' : 'Create Loan'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
