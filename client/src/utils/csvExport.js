// Utility to export client loan records CSV with exact requested columns:
// ID, Name of Client, Loan Duration, Principal Amount, Total Payable, Total Repaid, Loan Status

export function generateClientTransactionsCSV(client, loanRecords = []) {
  if (!client) return;

  const escapeCsv = (val) => {
    if (val === null || val === undefined) return '""';
    const str = String(val).replace(/"/g, '""');
    return `"${str}"`;
  };

  const headers = [
    'ID',
    'Name of Client',
    'Loan Duration',
    'Principal Amount',
    'Total Payable',
    'Total Repaid',
    'Loan Status'
  ];

  const rows = [];
  const clientIdVal = client.displayId || client.clientNo || client.id;
  const clientNameVal = client.name || 'Client';

  if (!loanRecords || loanRecords.length === 0) {
    rows.push([
      escapeCsv(clientIdVal),
      escapeCsv(clientNameVal),
      escapeCsv('N/A'),
      escapeCsv(0),
      escapeCsv(0),
      escapeCsv(0),
      escapeCsv('No Loans')
    ]);
  } else {
    for (const loan of loanRecords) {
      const principal = Number(loan.amountTaken || 0);
      const rate = Number(loan.interestRate || 10);
      const interest = Number(loan.interestAmount || (principal * rate / 100));
      const payable = Number(loan.totalPayable || (principal + interest));
      const repaid = Number(loan.totalPaid || 0);
      const durationLabel = loan.duration 
        ? (loan.duration.charAt(0).toUpperCase() + loan.duration.slice(1).toLowerCase())
        : 'N/A';
      const statusLabel = (loan.status || 'Active').toUpperCase();

      rows.push([
        escapeCsv(clientIdVal),
        escapeCsv(clientNameVal),
        escapeCsv(durationLabel),
        escapeCsv(principal),
        escapeCsv(payable),
        escapeCsv(repaid),
        escapeCsv(statusLabel)
      ]);
    }
  }

  // Generate CSV with UTF-8 BOM for Excel and spreadsheet compatibility
  const csvString = '\uFEFF' + [headers.map(h => `"${h}"`).join(','), ...rows.map(r => r.join(','))].join('\r\n');
  const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
  const url = window.URL.createObjectURL(blob);
  
  const safeName = clientNameVal.replace(/[^a-zA-Z0-9_-]/g, '_');
  const dateStr = new Date().toISOString().split('T')[0];
  const filename = `Client_${clientIdVal}_${safeName}_Loans_${dateStr}.csv`;

  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(url);
}
