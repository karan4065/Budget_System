const mongoose = require('mongoose');

const loanSchema = new mongoose.Schema({
  clientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Client', required: true },
  amountTaken: { type: Number, required: true },
  interestRate: { type: Number, default: 10.00 },
  interestAmount: { type: Number, default: 0 },
  totalPayable: { type: Number, default: 0 },
  duration: { type: String, enum: ['weekly', 'fortnight', 'monthly'], required: true },
  durationDays: { type: Number, required: true },
  startDate: { type: String, required: true },   // stored as 'YYYY-MM-DD' string
  dueDate: { type: String, required: true },      // stored as 'YYYY-MM-DD' string
  totalPaid: { type: Number, default: 0 },
  remainingAmount: { type: Number, required: true },
  status: { type: String, enum: ['active', 'completed', 'overdue'], default: 'active' },
  note: { type: String, default: null }
}, { timestamps: true });

module.exports = mongoose.model('Loan', loanSchema);
