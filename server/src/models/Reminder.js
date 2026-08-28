const mongoose = require('mongoose');

const reminderSchema = new mongoose.Schema({
  loanId: { type: mongoose.Schema.Types.ObjectId, ref: 'Loan', required: true, index: true },
  clientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Client', required: true, index: true },
  phoneNumber: { type: String, required: true },
  reminderType: { type: String, required: true },
  channel: { type: String, default: 'whatsapp' },
  dueDate: { type: String, required: true },  // 'YYYY-MM-DD'
  amount: { type: Number, required: true },
  message: { type: String, required: true },
  status: { type: String, enum: ['pending', 'sent', 'failed'], default: 'pending', index: true },
  sentAt: { type: Date, default: Date.now, index: true },
  whatsappMessageId: { type: String, default: null },
  errorMessage: { type: String, default: null }
}, { timestamps: true });

reminderSchema.index({ sentAt: -1 });

module.exports = mongoose.model('Reminder', reminderSchema);
