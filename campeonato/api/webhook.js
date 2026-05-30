const express = require('express');
const ws = require('ws');
const router  = express.Router();
const { MercadoPagoConfig, Payment } = require('mercadopago');
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY,
  {
    realtime: {
      transport: ws
    }
  }
);

// Mercado Pago calls this endpoint automatically when a payment status changes
router.post('/', async (req, res) => {
  // Always respond 200 quickly so MP doesn't retry
  res.sendStatus(200);

  const { type, data } = req.body;

  // We only care about payment events
  if (type !== 'payment' || !data?.id) return;

  const paymentId = String(data.id);
  console.log(`[webhook] Payment event received: ${paymentId}`);

  try {
    // ── Get MP token ──
    const { data: cfgRow } = await supabase
      .from('config')
      .select('value')
      .eq('key', 'mp_token')
      .single();

    const mpToken = (cfgRow?.value && cfgRow.value.trim()) || process.env.MP_ACCESS_TOKEN;

    const client   = new MercadoPagoConfig({ accessToken: mpToken });
    const payment  = new Payment(client);
    const mpData   = await payment.get({ id: paymentId });
    const status   = mpData.status;

    console.log(`[webhook] Payment ${paymentId} status: ${status}`);

    if (status !== 'approved') return;

    // ── Get pending payment record ──
    const { data: pendingRow } = await supabase
      .from('payments')
      .select('*')
      .eq('payment_id', paymentId)
      .single();

    if (!pendingRow) {
      console.log(`[webhook] No pending record for payment ${paymentId}`);
      return;
    }

    if (pendingRow.status === 'approved') {
      console.log(`[webhook] Payment ${paymentId} already approved, skipping.`);
      return;
    }

    // ── Mark payment approved ──
    await supabase
      .from('payments')
      .update({ status: 'approved', updated_at: new Date().toISOString() })
      .eq('payment_id', paymentId);

    // ── Create team ──
    const { data: existingTeam } = await supabase
      .from('teams')
      .select('id')
      .eq('name', pendingRow.team_name)
      .single();

    if (!existingTeam) {
      const { error: teamErr } = await supabase.from('teams').insert({
        name:     pendingRow.team_name,
        leader:   pendingRow.leader,
        members:  pendingRow.members,
        reserves: pendingRow.reserves || [],
        slot:     pendingRow.slot
      });

      if (teamErr) {
        console.error('[webhook] Error creating team:', teamErr.message);
      } else {
        console.log(`[webhook] Team "${pendingRow.team_name}" confirmed on slot ${pendingRow.slot}`);
      }
    }

  } catch (err) {
    console.error('[webhook] Error processing payment:', err.message);
  }
});

module.exports = router;
