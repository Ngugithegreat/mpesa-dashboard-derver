const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// These come from your Railway environment variables
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const FEE_C2B = parseFloat(process.env.FEE_C2B || '1.5') / 100;
const FEE_B2C = parseFloat(process.env.FEE_B2C || '1.0') / 100;
const FEE_B2B = parseFloat(process.env.FEE_B2B || '0.8') / 100;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// M-Pesa sends transaction data here
app.post('/payment/callback', async (req, res) => {
  try {
    const body = req.body;
    const transType = body.TransactionType || 'C2B';
    let feeRate = FEE_C2B;
    if (transType === 'BusinessPayment') feeRate = FEE_B2C;
    if (transType === 'BusinessToBusinessTransfer') feeRate = FEE_B2B;

    const amount = parseFloat(body.TransAmount || 0);
    const fee = parseFloat((amount * feeRate).toFixed(2));

    const { error } = await supabase.from('transactions').insert([{
      trans_id: body.TransID,
      trans_time: body.TransTime,
      trans_amount: amount,
      business_short_code: body.BusinessShortCode,
      bill_ref_number: body.BillRefNumber,
      msisdn: body.MSISDN,
      first_name: body.FirstName,
      trans_type: transType,
      fee_earned: fee,
    }]);

    if (error) throw error;

    res.json({ ResultCode: 0, ResultDesc: 'Accepted' });
  } catch (err) {
    console.error(err);
    res.json({ ResultCode: 0, ResultDesc: 'Accepted' });
  }
});

// Dashboard reads transactions from here
app.get('/transactions', async (req, res) => {
  res.header('Access-Control-Allow-Origin', '*');
  const { data, error } = await supabase
    .from('transactions')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(500);
  if (error) return res.status(500).json({ error });
  res.json(data);
});

// Summary stats endpoint
app.get('/summary', async (req, res) => {
  res.header('Access-Control-Allow-Origin', '*');
  const { data, error } = await supabase
    .from('transactions')
    .select('trans_amount, fee_earned, trans_type, created_at');
  if (error) return res.status(500).json({ error });

  const total_volume = data.reduce((s, t) => s + t.trans_amount, 0);
  const total_fees = data.reduce((s, t) => s + (t.fee_earned || 0), 0);
  const count = data.length;

  res.json({ total_volume, total_fees, count, transactions: data });
});

app.get('/', (req, res) => res.send('PSP Dashboard Server running OK'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Server running on port ' + PORT));
