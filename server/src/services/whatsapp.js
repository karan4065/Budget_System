const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });
const Reminder = require('../models/Reminder');

/**
 * Normalizes phone numbers to standard E.164 international format (+919876543210)
 */
function normalizePhoneNumber(phone) {
  if (!phone) return null;
  const trimmed = String(phone).trim();
  const digitsOnly = trimmed.replace(/\D/g, '');

  if (!digitsOnly || digitsOnly.length < 10) return null;
  if (digitsOnly.length === 10) return `+91${digitsOnly}`;
  if (digitsOnly.length === 12 && digitsOnly.startsWith('91')) return `+${digitsOnly}`;
  if (trimmed.startsWith('+')) return `+${digitsOnly}`;
  return `+${digitsOnly}`;
}

/**
 * Format dynamic reminder message content
 */
function getReminderMessageText(reminderType, { clientName, amount, dueDate, daysOverdue, overdueWeeks, overdueInterest, principal, loansList }) {
  const name = clientName || 'Valued Client';

  // If there are multiple active loans for this client, format single consolidated message
  if (loansList && Array.isArray(loansList) && loansList.length > 1) {
    const loanLines = loansList.map((l, i) => {
      const lAmt = Number(l.remainingAmount || l.amount || l.totalPayable || 0).toLocaleString('en-IN');
      const lDue = l.formattedDueDate || l.dueDate || 'scheduled date';
      const isOverdue = l.isOverdue || (l.dueDate && new Date().toISOString().split('T')[0] > l.dueDate);
      const ordinalTag = l.ordinalLabel ? ` (${l.ordinalLabel})` : '';
      const overdueTag = isOverdue ? ' (Overdue)' : '';
      return `${i + 1}) ₹${lAmt} - Due: ${lDue}${ordinalTag}${overdueTag}`;
    }).join('\n');

    const totalAmt = Number(amount || loansList.reduce((sum, l) => sum + Number(l.remainingAmount || l.amount || 0), 0)).toLocaleString('en-IN');
    const hasAnyOverdue = loansList.some(l => l.isOverdue || (l.dueDate && new Date().toISOString().split('T')[0] > l.dueDate));

    return `Hello ${name}, you have ${loansList.length} active loans with outstanding payments:

${loanLines}

Total Outstanding: ₹${totalAmt}.
Please make your payments ${hasAnyOverdue ? 'as soon as possible' : 'on time'}. Thank you.`;
  }

  const formattedAmount = Number(amount || 0).toLocaleString('en-IN');
  const dateStr = dueDate || 'the scheduled date';

  switch (reminderType) {
    case 'due_tomorrow':
      return `Hello ${name}, your loan payment of ₹${formattedAmount} is due tomorrow, ${dateStr}. Please make your payment on time. Thank you.`;
    case 'due_today':
      return `Hello ${name}, your loan payment of ₹${formattedAmount} is due today, ${dateStr}. Please make your payment on time. Thank you.`;
    case 'overdue':
      if (daysOverdue && overdueWeeks) {
        return `Hello ${name}, your loan payment of ₹${formattedAmount} was due on ${dateStr} and is currently ${daysOverdue} day(s) overdue (Week ${overdueWeeks} accrual). Note: +10% weekly overdue interest has been applied to your balance. Please make your payment as soon as possible. Thank you.`;
      }
      return `Hello ${name}, your loan payment of ₹${formattedAmount} was due on ${dateStr} and is currently overdue. Please make your payment as soon as possible. Thank you.`;
    case 'manual':
    default:
      return `Hello ${name}, your loan payment of ₹${formattedAmount} is due on ${dateStr}. Please make your payment on time. Thank you.`;
  }
}

/**
 * Send WhatsApp Message via official Meta WhatsApp Business Cloud API
 */
async function sendWhatsAppMessage({ to, reminderType, clientName, amount, dueDate, daysOverdue, overdueWeeks, overdueInterest, principal, loansList, customMessage }) {
  const normalizedPhone = normalizePhoneNumber(to);
  const messageText = customMessage || getReminderMessageText(reminderType, { clientName, amount, dueDate, daysOverdue, overdueWeeks, overdueInterest, principal, loansList });

  if (!normalizedPhone) {
    return { success: false, error: 'Invalid or missing client phone number for WhatsApp message.', messageText };
  }

  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const apiVersion = process.env.WHATSAPP_API_VERSION || 'v19.0';

  if (!accessToken || !phoneNumberId) {
    // Simulated dispatch when Meta Cloud API credentials are not provided
    const mockMessageId = `wamid.HBgL${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    console.log(`[WhatsApp Service] 📲 Message dispatched to ${normalizedPhone}: "${messageText}"`);
    return { success: true, messageId: mockMessageId, messageText, normalizedPhone, isSimulated: true };
  }

  const recipientNumber = normalizedPhone.replace(/^\+/, '');
  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: recipientNumber,
    type: 'text',
    text: { preview_url: false, body: messageText }
  };

  try {
    const url = `https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      const errorDetail = data?.error?.message || `HTTP Error ${response.status}`;
      console.error(`[WhatsApp API Error] Failed to send to ${recipientNumber}:`, errorDetail);
      return { success: false, error: errorDetail, messageText, normalizedPhone };
    }

    const messageId = data?.messages?.[0]?.id || null;
    return { success: true, messageId, messageText, normalizedPhone };
  } catch (err) {
    console.error(`[WhatsApp Network Error] Sending to ${recipientNumber}:`, err.message);
    return { success: false, error: err.message || 'Network connection failed to WhatsApp Cloud API', messageText, normalizedPhone };
  }
}

/**
 * Record reminder attempt into reminders collection (MongoDB)
 */
async function logReminder({
  loanId, clientId, phoneNumber, reminderType,
  channel = 'whatsapp', dueDate, amount, message,
  status, whatsappMessageId = null, errorMessage = null
}) {
  try {
    const reminder = await Reminder.create({
      loanId,
      clientId,
      phoneNumber,
      reminderType,
      channel: channel || 'whatsapp',
      dueDate,
      amount,
      message,
      status,
      sentAt: new Date(),
      whatsappMessageId,
      errorMessage
    });
    return reminder._id.toString();
  } catch (err) {
    console.error('[Reminder Logger Error] Failed to write reminder log:', err.message);
    return null;
  }
}

module.exports = {
  normalizePhoneNumber,
  getReminderMessageText,
  sendWhatsAppMessage,
  logReminder
};
