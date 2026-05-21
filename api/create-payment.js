const express = require('express');
const router  = express.Router();
const { MercadoPagoConfig, Payment } = require('mercadopago');
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;

if (!supabaseUrl) {
  throw new Error('SUPABASE_URL não configurado no .env');
}

if (!supabaseKey) {
  throw new Error('SUPABASE_SERVICE_ROLE_KEY não configurado no .env');
}

const supabase = createClient(supabaseUrl, supabaseKey);

router.post('/', async (req, res) => {
  const { team, leader, members, reserves, slot, amount } = req.body;

  if (!team || !leader || !Array.isArray(members) || members.length < 4 || !slot || amount === undefined) {
    return res.status(400).json({ error: 'Dados incompletos.' });
  }

  const finalAmount = Number(amount);

  if (!finalAmount || finalAmount <= 0) {
    return res.status(400).json({ error: 'Valor da inscrição inválido.' });
  }

  try {
    const { data: existingTeam, error: teamCheckError } = await supabase
      .from('teams')
      .select('id')
      .eq('slot', slot)
      .maybeSingle();

    if (teamCheckError) throw new Error(teamCheckError.message);

    const { data: existingPayment, error: paymentCheckError } = await supabase
      .from('payments')
      .select('id')
      .eq('slot', slot)
      .eq('status', 'pending')
      .maybeSingle();

    if (paymentCheckError) throw new Error(paymentCheckError.message);

    if (existingTeam || existingPayment) {
      return res.status(409).json({ error: 'Slot já ocupado.' });
    }

    const { data: existingName, error: nameCheckError } = await supabase
      .from('teams')
      .select('id')
      .ilike('name', team)
      .maybeSingle();

    if (nameCheckError) throw new Error(nameCheckError.message);

    if (existingName) {
      return res.status(409).json({ error: 'Já existe uma equipe com esse nome.' });
    }

    const { data: cfgRow } = await supabase
      .from('config')
      .select('value')
      .eq('key', 'mp_token')
      .maybeSingle();

    const mpToken = (cfgRow?.value && cfgRow.value.trim()) || process.env.MP_ACCESS_TOKEN;

    if (!mpToken) {
      return res.status(500).json({ error: 'Token do Mercado Pago não configurado.' });
    }

    const client  = new MercadoPagoConfig({ accessToken: mpToken });
    const payment = new Payment(client);

    const idempotencyKey = `${String(team).replace(/\s/g, '-')}-slot${slot}-${Date.now()}`;

    const mpResponse = await payment.create({
      body: {
        transaction_amount: finalAmount,
        description: `Inscrição Campeonato - ${team} - Slot ${slot}`,
        payment_method_id: 'pix',
        payer: {
          email: 'inscricao@campeonato.com',
          first_name: String(leader).split(' ')[0] || 'Jogador',
          last_name: String(leader).split(' ').slice(1).join(' ') || 'Equipe'
        }
      },
      requestOptions: { idempotencyKey }
    });

    const pixCode   = mpResponse.point_of_interaction?.transaction_data?.qr_code;
    const pixQrB64  = mpResponse.point_of_interaction?.transaction_data?.qr_code_base64;
    const paymentId = String(mpResponse.id);

    if (!pixCode) {
      return res.status(500).json({ error: 'Mercado Pago não retornou o código Pix.' });
    }

    const { data: pendingRow, error: dbErr } = await supabase
      .from('payments')
      .insert({
        payment_id: paymentId,
        team_name: team,
        leader,
        members,
        reserves: reserves || [],
        slot,
        status: 'pending',
        amount: finalAmount
      })
      .select()
      .single();

    if (dbErr) throw new Error(dbErr.message);

    return res.json({
      payment_id: paymentId,
      db_id: pendingRow.id,
      pix_code: pixCode,
      pix_qr_b64: pixQrB64,
      amount: finalAmount
    });

  } catch (err) {
    console.error('[create-payment] Error:', err);
    return res.status(500).json({ error: err.message || 'Erro ao criar pagamento.' });
  }
});

module.exports = router;
