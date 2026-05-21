const express = require('express');
const router  = express.Router();
const { MercadoPagoConfig, Payment } = require('mercadopago');
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

router.get('/:paymentId', async (req, res) => {
  const { paymentId } = req.params;

  try {
    // ── Get MP token ──
    const { data: cfgRow } = await supabase
      .from('config')
      .select('value')
      .eq('key', 'mp_token')
      .single();

    const mpToken = (cfgRow?.value && cfgRow.value.trim()) || process.env.MP_ACCESS_TOKEN;

    const client  = new MercadoPagoConfig({ accessToken: mpToken });
    const payment = new Payment(client);

    const mpResponse = await payment.get({ id: paymentId });
    const status     = mpResponse.status; // pending, approved, rejected, cancelled

    // If approved, confirm in DB
    if (status === 'approved') {
      // Get pending payment record
      const { data: pendingRow } = await supabase
        .from('payments')
        .select('*')
        .eq('payment_id', paymentId)
        .single();

      if (pendingRow && pendingRow.status === 'pending') {
        // Mark payment approved
        await supabase
          .from('payments')
          .update({ status: 'approved', updated_at: new Date().toISOString() })
          .eq('payment_id', paymentId);

        // Create team (if not already there)
        const { data: existingTeam } = await supabase
          .from('teams')
          .select('id')
          .eq('name', pendingRow.team_name)
          .single();

        if (!existingTeam) {
          await supabase.from('teams').insert({
            name:    pendingRow.team_name,
            leader:  pendingRow.leader,
            members: pendingRow.members,
            reserves: pendingRow.reserves || [],
            slot:    pendingRow.slot
          });
        }
      }
    }

    return res.json({ status, payment_id: paymentId });

  } catch (err) {
    console.error('[check] Error:', err);
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
