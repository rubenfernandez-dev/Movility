import { emailTestConfig } from '../resend-mail.mjs';
import { publicOrigin } from '../seo.mjs';

const required = ['MOVILITY_RESEND_API_KEY', 'MOVILITY_EMAIL_FROM', 'MOVILITY_EMAIL_TEST_TO', 'MOVILITY_PUBLIC_ORIGIN'];
const missing = required.filter(name => !process.env[name]?.trim());

if (process.env.MOVILITY_EMAIL_MODE !== 'resend-test') {
  missing.unshift('MOVILITY_EMAIL_MODE=resend-test');
}

if (missing.length) {
  console.error('Configuración pendiente: ' + missing.join(', '));
  process.exitCode = 1;
} else {
  try {
    emailTestConfig(process.env, publicOrigin(process.env.MOVILITY_PUBLIC_ORIGIN));
    console.log('Configuración válida para Resend de prueba. No se ha enviado ningún correo.');
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
