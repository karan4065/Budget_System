const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema({
  loanId: { type: mongoose.Schema.Types.ObjectId, ref: 'Loan', required: true, index: true },
  clientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Client', required: true, index: true },
  amount: { type: Number, required: true },
  transactionType: {
    type: String,
    enum: ['disbursement', 'payment', 'penalty', 'adjustment'],
    required: true,
    index: true
  },
  transactionDate: { type: String, required: true, index: true },  // 'YYYY-MM-DD'
  remainingAfter: { type: Number, required: true },
  paymentMode: { type: String, default: 'Cash' },
  note: { type: String, default: null }
}, { timestamps: true });

transactionSchema.index({ loanId: 1, transactionType: 1 });
transactionSchema.index({ transactionDate: -1, _id: -1 });

module.exports = mongoose.model('Transaction', transactionSchema);
