# Vitto MSME Loan Repayment Service

A robust, enterprise-grade MSME Loan Repayment Service built with **Next.js (JavaScript)**, **PostgreSQL**, and **Firebase Authentication**.

---

## 🔗 Live Application & Seeded Loans

- **GitHub Repository:** [https://github.com/Rishikaaz/Loan-Repayment-Service](https://github.com/Rishikaaz/Loan-Repayment-Service)
- **Live Deployment:** Hosted on Vercel with PostgreSQL instance on Supabase.

### 👥 Test Reviewer Credentials
- **Email:** `evaluator@vitto.money`
- **Password:** `VittoAssessment2026!`
- *Alternative:* Instant one-click reviewer access is available via the demo token action on the sign-in screen.

### 📊 Seeded Test Loans
The hosted database is initialized and seeded with representative MSME loan scenarios:

| Loan ID | Principal | Interest Rate | Tenure | Status | Scenario Details |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **`LOAN-MSME-101`** | ₹2,00,000 | 18.00% p.a. | 24 months | `ACTIVE` | Standard active loan with initial monthly installment paid on time. |
| **`LOAN-MSME-102`** | ₹5,00,000 | 15.00% p.a. | 12 months | `DELINQUENT` | **Overdue Loan** — Disbursed with multiple missed installments reflecting delinquent position and overdue amount. |
| **`LOAN-MSME-103`** | ₹1,00,000 | 12.00% p.a. | 6 months | `ACTIVE` | Short-term working capital loan with consecutive installment payments. |

---

## 🛠️ Architecture & Technology Stack

- **Runtime & Framework:** Next.js (App Router, 100% pure JavaScript, no TypeScript).
- **Database:** PostgreSQL (Hosted on Supabase with connection pooling).
- **Authentication:** Firebase Authentication with server-side ID token verification (`firebase-admin`).
- **Styling:** Custom CSS design system with glassmorphism, responsive tables, and dark theme.
- **Testing:** Jest unit and integration test suite (`npm test`).
- **CI/CD:** Automated GitHub Actions workflow on pushes and pull requests.

---

## 💰 Engineering Decisions

### 1. Money Representation & Precision Arithmetic
- **Storage Type:** Monetary amounts are stored as `BIGINT` in integer **Paise** (`1 INR = 100 Paise`) at the database level.
- **Rationale:** Floating-point representations (`FLOAT`, `DOUBLE PRECISION`, or raw JavaScript numbers) suffer from binary rounding drift. Enforcing integer paise arithmetic guarantees exact precision across interest compounding, payment splits, and cumulative totals. Conversion to Rupees (`Paise.toRupees`) and INR formatting is executed strictly at API response and UI boundaries.

### 2. EMI Calculation & Final Installment Absorption
- **Standard Amortization Formula:**
  $$\text{EMI} = \frac{P \cdot r \cdot (1+r)^n}{(1+r)^n - 1}$$
  where $P$ is principal in paise, $n$ is tenure in months, and $r = \frac{\text{Annual Rate}}{12 \times 100}$.
- **Rounding Handling:** Monthly interest is computed against the active opening balance. The monthly principal component is computed as $\text{EMI} - \text{Interest}$. On the **final installment**, remaining principal is absorbed into the final installment balance, ensuring that cumulative principal paid matches original disbursement with zero discrepancy.

### 3. Payment Allocation Policy
- **Chronological Waterfall:** Payments are settled against the oldest unpaid or overdue installments first.
- **Underpayment:** When a partial payment is received, it credits towards the oldest unpaid installment, reducing its remaining balance and marking it `PARTIAL` (or `OVERDUE` if past the due date).
- **Overpayment:** When payment exceeds the installment due, excess funds cascade to settle subsequent upcoming installments in chronological order, reducing future liability and outstanding principal.
- **Late Payment:** Payments submitted past the due date settle delinquent overdue installments first and update the real-time position immediately.
- **Duplicate Prevention:** Payments require unique identifiers / idempotency keys and are executed inside ACID PostgreSQL transactions with `FOR UPDATE` row locks to eliminate race conditions.

---

## 📡 REST API Reference

All route handlers enforce server-side authentication via `Authorization: Bearer <firebase_id_token>`.

### 1. Create Loan
`POST /api/loans`
```json
{
  "principal": 200000,
  "annualInterestRate": 18,
  "tenureMonths": 24,
  "disbursementDate": "2026-01-01"
}
```
**Response (201 Created):** Returns loan record, full repayment schedule, and initial position.

### 2. Get Loan & Schedule
`GET /api/loans/:id`

**Response (200 OK):**
```json
{
  "success": true,
  "loan": {
    "id": "LOAN-MSME-101",
    "principal": 200000,
    "annualInterestRate": 18,
    "tenureMonths": 24,
    "disbursementDate": "2026-08-01",
    "status": "ACTIVE"
  },
  "currentPosition": {
    "loanId": "LOAN-MSME-101",
    "loanStatus": "ACTIVE",
    "initialPrincipal": 200000,
    "outstandingPrincipal": 193015,
    "overdueAmount": 0,
    "nextDueDate": "2026-10-01",
    "nextDueAmount": 9985
  },
  "schedule": [
    {
      "installmentNumber": 1,
      "dueDate": "2026-09-01",
      "principalComponent": 6985,
      "interestComponent": 3000,
      "totalDue": 9985,
      "amountPaid": 9985,
      "remainingDue": 0,
      "status": "PAID"
    }
  ],
  "payments": [
    {
      "id": "PAY-101-1",
      "amount": 9985,
      "paymentDate": "2026-09-01"
    }
  ]
}
```

### 3. Record Payment
`POST /api/loans/:id/payments`
```json
{
  "amount": 9985,
  "paymentDate": "2026-10-05",
  "paymentId": "PAY-CUSTOM-001"
}
```
**Response (201 Created):** Returns payment receipt, allocation distribution across installments, updated position, and schedule.

---

## 🧪 Running Tests & Local Setup

### Test Suite Execution
```bash
npm test
```
*Runs all 12 unit and integration tests covering EMI calculations, allocation edge cases, and API route handlers.*

### Local Setup Steps

1. **Clone Repository & Install Dependencies:**
   ```bash
   git clone https://github.com/Rishikaaz/Loan-Repayment-Service.git
   cd Loan-Repayment-Service
   npm install
   ```

2. **Configure Environment:**
   ```bash
   cp .env.example .env.local
   ```
   Set `DATABASE_URL` with your PostgreSQL instance and Firebase credentials.

3. **Database Migration & Seeding:**
   ```bash
   npm run db:init
   npm run db:seed
   ```

4. **Run Development Server:**
   ```bash
   npm run dev
   ```
   Access the dashboard at `http://localhost:3000`.