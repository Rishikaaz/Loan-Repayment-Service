# Vitto MSME Loan Repayment Service

An enterprise-grade MSME Loan Repayment Service built with **Next.js (JavaScript-only)**, **PostgreSQL**, and **Firebase Authentication**.

---

## 🔗 Live Application & Seeded Loans

- **Live Deployed Application:** `https://loan-repayment-service.vercel.app` *(Replace with your deployed URL)*
- **GitHub Repository:** [https://github.com/Rishikaaz/Loan-Repayment-Service](https://github.com/Rishikaaz/Loan-Repayment-Service)

### 👥 Test Reviewer Account
- **Email:** `evaluator@vitto.money`
- **Password:** `VittoAssessment2026!`
- *(Or click the **"⚡ Instant Reviewer Access (Demo Token)"** button directly on the sign-in screen for one-click access)*

### 📊 Seeded Loans in Database
| Loan ID | Principal | Rate | Tenure | Status | Scenario / Notes |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **`LOAN-MSME-101`** | ₹2,00,000 | 18% | 24 mo | `ACTIVE` | Standard on-time loan with initial installment paid. |
| **`LOAN-MSME-102`** | ₹5,00,000 | 15% | 12 mo | `DELINQUENT` | ⚠️ **Overdue Loan** — 3 missed installments totaling overdue amount. |
| **`LOAN-MSME-103`** | ₹1,00,000 | 12% | 6 mo | `ACTIVE` | Short-term MSME loan with 2 installments paid. |

---

## 🛠️ Architecture & Tech Stack

- **Framework:** Next.js (App Router, JavaScript `.js`/`.jsx` across 100% of the codebase, no TypeScript).
- **Database:** PostgreSQL (Hosted on Neon / Supabase).
- **Authentication:** Firebase Authentication (Client SDK + Server-Side Admin Token Verification).
- **Styling:** Modern Dark-mode Glassmorphism CSS design system.
- **Testing:** Jest unit & integration test suite.
- **CI/CD:** Automated GitHub Actions workflow on every push/PR.

---

## 💰 Engineering Decisions

### 1. Money Type & Precision Arithmetic
- **Decision:** All monetary amounts are internally stored and computed as **Integer Paise** (`1 INR = 100 Paise`) using `BIGINT` in PostgreSQL.
- **Rationale:** Storing currency as floating-point numbers (`FLOAT`, `DOUBLE PRECISION`, or JS `Number` decimals) introduces precision drift (e.g. `0.1 + 0.2 !== 0.3`). By enforcing integer arithmetic in Paise at the database level and across all calculations, zero precision drift occurs. Conversion to Rupees (`Paise.toRupees`) and INR formatting is performed strictly at the API output/display boundary.

### 2. EMI Calculation & Remainder Absorption
- **Standard Formula:**
  $$\text{EMI} = \frac{P \cdot r \cdot (1+r)^n}{(1+r)^n - 1}$$
  where $P$ is principal, $n$ is tenure in months, and $r = \frac{\text{Annual Rate}}{12 \times 100}$.
- **Rounding Handling:** Monthly interest is computed on remaining opening balance. The regular monthly principal component is $\text{EMI} - \text{Interest}$. On the **final installment**, the remaining principal balance is absorbed directly into the final installment to ensure the total principal paid equals the initial loan principal with 0 paise discrepancy.

### 3. Payment Allocation Policy
- **Chronological Waterfall:** Payments are settled chronologically against the oldest unpaid / overdue installments first.
- **Underpayment:** When a partial payment is received, it is credited towards the current due installment, reducing the installment's remaining due. The installment is marked as `PARTIAL` (or `OVERDUE` if past the due date).
- **Overpayment:** When payment exceeds the total due of the current installment, the excess amount waterfalls forward to settle subsequent upcoming installments in chronological order, directly reducing future obligations and outstanding principal.
- **Late Payment:** Payments received after due dates immediately reduce the delinquent overdue amount and adjust the loan position in real-time.
- **Duplicate Prevention:** Payments are validated against duplicate IDs/idempotency keys in an ACID PostgreSQL transaction with `FOR UPDATE` row locks to prevent race conditions.

---

## 📡 REST API Reference

All endpoints require `Authorization: Bearer <firebase_id_token>`.

### 1. Create Loan
- **`POST /api/loans`**
- **Request Body:**
  ```json
  {
    "principal": 200000,
    "annualInterestRate": 18,
    "tenureMonths": 24,
    "disbursementDate": "2026-01-01"
  }
  ```
- **Response (201 Created):** Returns generated loan, schedule, and initial position.

### 2. Get Loan & Schedule
- **`GET /api/loans/:id`**
- **Response (200 OK):**
  ```json
  {
    "success": true,
    "loan": { "id": "LOAN-MSME-101", "principal": 200000, "status": "ACTIVE", ... },
    "currentPosition": {
      "outstandingPrincipal": 193014.00,
      "overdueAmount": 0.00,
      "nextDueDate": "2026-10-01",
      "nextDueAmount": 9985.00,
      "loanStatus": "ACTIVE"
    },
    "schedule": [
      {
        "installmentNumber": 1,
        "dueDate": "2026-02-01",
        "principalComponent": 6985.00,
        "interestComponent": 3000.00,
        "totalDue": 9985.00,
        "amountPaid": 9985.00,
        "remainingDue": 0.00,
        "status": "PAID"
      }
    ]
  }
  ```

### 3. Record Payment
- **`POST /api/loans/:id/payments`**
- **Request Body:**
  ```json
  {
    "amount": 9985,
    "paymentDate": "2026-10-05",
    "paymentId": "PAY-CUSTOM-ID-123"
  }
  ```
- **Response (201 Created):** Returns updated position, allocation breakdown, and schedule.

---

## 🧪 Running Tests Locally

Run the complete test suite (unit + integration tests):
```bash
npm test
```

### Setup & Local Development

1. **Clone & Install:**
   ```bash
   git clone https://github.com/Rishikaaz/Loan-Repayment-Service.git
   cd Loan-Repayment-Service
   npm install
   ```

2. **Configure Environment:**
   ```bash
   cp .env.example .env.local
   # Update DATABASE_URL with your PostgreSQL instance
   ```

3. **Initialize Schema & Seed Database:**
   ```bash
   npm run db:init
   npm run db:seed
   ```

4. **Start Development Server:**
   ```bash
   npm run dev
   ```
   Open `http://localhost:3000` in your browser.