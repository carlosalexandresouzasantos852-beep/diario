const express = require('express');
const router  = express.Router();
const { MercadoPagoConfig, Payment } = require('mercadopago');
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

router.post('/', async (req, res) => {
  const { team, leader, members, reserves, slot, amount } = req.body;

  // ── Validate ──
  if (!team || !leader || !members || !slot || amount === undefined) {
    return res.status(400).json({ error: 'Dados incompletos.' });
  }

  // ── Check slot still available ──
  const { data: existingTeam } = await supabase
    .from('teams')
    .select('id')
    .eq('slot', slot)
    .single();

  const { data: existingPayment } = await supabase
    .from('payments')
    .select('id')
    .eq('slot', slot)
    .eq('status', 'pending')
    .single();

  if (existingTeam || existingPayment) {
    return res.status(409).json({ error: 'Slot já ocupado.' });
  }

  // ── Check team name ──
  const { data: existingName } = await supabase
    .from('teams')
    .select('id')
    .ilike('name', team)
    .single();

  if (existingName) {
    return res.status(409).json({ error: 'Já existe uma equipe com esse nome.' });
  }

  try {
    // ── Get MP token from config or env ──
    const { data: cfgRow } = await supabase
      .from('config')
      .select('value')
      .eq('key', 'mp_token')
      .single();

    const mpToken = (cfgRow?.value && cfgRow.value.trim()) || process.env.MP_ACCESS_TOKEN;

    if (!mpToken) {
      return res.status(500).json({ error: 'Token do Mercado Pago não configurado.' });
    }

    const client  = new MercadoPagoConfig({ accessToken: mpToken });
    const payment = new Payment(client);

    const idempotencyKey = `${team.replace(/\s/g,'-')}-slot${slot}-${Date.now()}`;

    const mpResponse = await payment.create({
      body: {
        transaction_amount: parseFloat(amount),
        description: `Inscrição Campeonato - ${team} - Slot ${slot}`,
        payment_method_id: 'pix',
        payer: {
          email: 'inscricao@campeonato.com',
          first_name: leader.split(' ')[0] || 'Jogador',
          last_name:  leader.split(' ').slice(1).join(' ') || 'Equipe'
        }
      },
      requestOptions: { idempotencyKey }
    });

    const pixCode   = mpResponse.point_of_interaction?.transaction_data?.qr_code;
    const pixQrB64  = mpResponse.point_of_interaction?.transaction_data?.qr_code_base64;
    const paymentId = String(mpResponse.id);

    // ── Save pending payment ──
    const { data: pendingRow, error: dbErr } = await supabase
      .from('payments')
      .insert({
        payment_id: paymentId,
        team_name:  team,
        leader,
        members,
        reserves:   reserves || [],
        slot,
        status:     'pending',
        amount:     parseFloat(amount)
      })
      .select()
      .single();

    if (dbErr) throw new Error(dbErr.message);

    return res.json({
      payment_id: paymentId,
      db_id:      pendingRow.id,
      pix_code:   pixCode,
      pix_qr_b64: pixQrB64,
      amount:     parseFloat(amount)
    });

  } catch (err) {
    console.error('[create-payment] Error:', err);
    return res.status(500).json({ error: err.message || 'Erro ao criar pagamento.' });
  }
});

module.exports = router;
