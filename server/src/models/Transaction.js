const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema({
  loanId: { type: mongoose.Schema.Types.ObjectId, ref: 'Loan', required: true },
  clientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Client', required: true },
  amount: { type: Number, required: true },
  transactionType: {
    type: String,
    enum: ['disbursement', 'payment', 'penalty', 'adjustment'],
    required: true
  },
  transactionDate: { type: String, required: true },  // 'YYYY-MM-DD'
  remainingAfter: { type: Number, required: true },
  paymentMode: { type: String, default: 'Cash' },
  note: { type: String, default: null }
}, { timestamps: true });

module.exports = mongoose.model('Transaction', transactionSchema);
