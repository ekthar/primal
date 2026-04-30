require('dotenv').config();

const twilio = require('twilio');

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function mask(value) {
  if (value.length <= 8) {
    return '********';
  }
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

function parseArgs(argv) {
  const to = argv[2] || process.env.TWILIO_WHATSAPP_TEST_TO;
  const body = argv[3] || process.env.TWILIO_WHATSAPP_TEST_BODY;

  if (!to) {
    throw new Error('Missing WhatsApp test recipient. Pass it as the first argument or set TWILIO_WHATSAPP_TEST_TO.');
  }
  if (!body) {
    throw new Error('Missing WhatsApp test body. Pass it as the second argument or set TWILIO_WHATSAPP_TEST_BODY.');
  }

  return { to, body };
}

function formatWhatsappNumber(value) {
  return value.startsWith('whatsapp:') ? value : `whatsapp:${value}`;
}

async function main() {
  const accountSid = requireEnv('TWILIO_ACCOUNT_SID');
  const authToken = requireEnv('TWILIO_AUTH_TOKEN');
  const from = requireEnv('TWILIO_WHATSAPP_FROM');
  const args = parseArgs(process.argv);
  const client = twilio(accountSid, authToken);

  const message = await client.messages.create({
    from,
    to: formatWhatsappNumber(args.to),
    body: args.body,
  });

  console.log(JSON.stringify({
    ok: true,
    sid: message.sid,
    status: message.status,
    from,
    to: formatWhatsappNumber(args.to),
    accountSid: mask(accountSid),
  }, null, 2));
}

main().catch((error) => {
  console.error(JSON.stringify({
    ok: false,
    error: error.message,
    code: error.code || null,
    status: error.status || null,
    moreInfo: error.moreInfo || null,
  }, null, 2));
  process.exitCode = 1;
});
