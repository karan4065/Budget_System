const mongoose = require('mongoose');

const reminderSchema = new mongoose.Schema({
  loanId: { type: mongoose.Schema.Types.ObjectId, ref: 'Loan', required: true },
  clientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Client', required: true },
  phoneNumber: { type: String, required: true },
  reminderType: { type: String, required: true },
  channel: { type: String, default: 'whatsapp' },
  dueDate: { type: String, required: true },  // 'YYYY-MM-DD'
  amount: { type: Number, required: true },
  message: { type: String, required: true },
  status: { type: String, enum: ['pending', 'sent', 'failed'], default: 'pending' },
  sentAt: { type: Date, default: Date.now },
  whatsappMessageId: { type: String, default: null },
  errorMessage: { type: String, default: null }
}, { timestamps: true });

module.exports = mongoose.model('Reminder', reminderSchema);
