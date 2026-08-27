const mongoose = require('mongoose');

const clientSchema = new mongoose.Schema({
  clientNo: { type: Number, unique: true, sparse: true },
  name: { type: String, required: true, trim: true },
  mobileNumber: { type: String, required: true, unique: true, trim: true },
  aadhaarNumber: { type: String, default: null, trim: true },
  address: { type: String, default: null },
  notes: { type: String, default: null }
}, { timestamps: true });

// Auto-assign sequential clientNo before saving new clients
clientSchema.pre('save', async function (next) {
  if (this.isNew && !this.clientNo) {
    const last = await this.constructor.findOne({}, { clientNo: 1 }).sort({ clientNo: -1 });
    this.clientNo = last && last.clientNo ? last.clientNo + 1 : 1;
  }
  next();
});

module.exports = mongoose.model('Client', clientSchema);
