# BudgetFlow — Secure Budget Management System

A production-ready, responsive, and secure **Budget & Loan Management System** built exclusively for a **Single Administrator**.

---

## 🔐 Single Admin Credentials

> 🔒 **Security Notice:** There is **NO public registration** and **NO customer dashboard**. Only the designated administrator can access the system.

---

## ⚡ Core Features & Workflow

1. **Secure Admin Authentication**: Single admin login with bcrypt password hashing, JWT session protection, and route authorization.
2. **Automated Repayment Durations & Due Dates**:
   - **Weekly — 8 Days**: Due Date = `Start Date + 8 Days`
   - **Fortnight — 15 Days**: Due Date = `Start Date + 15 Days`
   - **Monthly — 30 Days**: Due Date = `Start Date + 30 Days`
3. **Automated Categorization**: Clients automatically appear in their dedicated category tabs:
   - Weekly List (8 Days)
   - 15-Day List (Fortnight)
   - Monthly List (30 Days)
4. **Historical Record Preservation**:
   - When the same client returns to take money again, a new loan record is created under their client profile.
   - All past loans, transactions, and payment receipts are **never overwritten or deleted**.
5. **Aadhaar Privacy**: Aadhaar numbers are validated (12 digits) and masked throughout the application (`XXXX-XXXX-1234`) with restricted reveal access.
6. **Live Balance & Status Transitions**:
   - `Remaining Amount = 0` ➔ **Completed**
   - `Remaining Amount > 0` & `Due Date passed` ➔ **Overdue** (pulsing alerts)
   - `Remaining Amount > 0` & `Due Date not passed` ➔ **Active**
7. **Fast Mobile Search**: Instant lookup by 10-digit mobile number displaying the client's current active loan, full history, and transaction ledger.
8. **Printable Payment Receipts**: 1-click printable receipt slip for every recorded payment.
9. **Full Mobile Responsiveness**: Touch-friendly bottom navigation, card layouts on mobile, and responsive desktop tables.

---

## 🚀 Quick Start

### 1. Start Backend Server
```bash
cd server
npm install
npm start
```
*Backend runs on `http://localhost:5000` with SQLite database.*

### 2. Start Frontend (Development)
```bash
cd client
npm install
npm run dev
```
*Frontend runs on `http://localhost:5173` (proxied to port 5000).*

### 3. Production Single-Server Mode
```bash
cd client && npm run build
cd ../server && npm start
```
*Open `http://localhost:5000` to access both API and Frontend.*
