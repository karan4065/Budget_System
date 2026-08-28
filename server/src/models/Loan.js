const mongoose = require('mongoose');

const loanSchema = new mongoose.Schema({
  clientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Client', required: true, index: true },
  amountTaken: { type: Number, required: true },
  interestRate: { type: Number, default: 10.00 },
  interestAmount: { type: Number, default: 0 },
  totalPayable: { type: Number, default: 0 },
  duration: { type: String, enum: ['weekly', 'fortnight', 'monthly'], required: true, index: true },
  durationDays: { type: Number, required: true },
  startDate: { type: String, required: true },   // stored as 'YYYY-MM-DD' string
  dueDate: { type: String, required: true, index: true },      // stored as 'YYYY-MM-DD' string
  totalPaid: { type: Number, default: 0 },
  remainingAmount: { type: Number, required: true },
  status: { type: String, enum: ['active', 'completed', 'overdue'], default: 'active', index: true },
  pendingAmount: { type: Number, default: 0 },
  isSettledPending: { type: Boolean, default: false },
  note: { type: String, default: null }
}, { timestamps: true });

loanSchema.index({ status: 1, remainingAmount: 1, dueDate: 1 });
loanSchema.index({ duration: 1, status: 1, remainingAmount: 1 });

module.exports = mongoose.model('Loan', loanSchema);
