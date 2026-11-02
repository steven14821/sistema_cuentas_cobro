import { Injectable, Logger } from '@nestjs/common';
import nodemailer from 'nodemailer';

export type ApprovalEmailResult = {
  status: 'sent' | 'not_configured' | 'failed';
};

type ApprovedAccountEmail = {
  email: string;
  technician: string;
  month: number;
  year: number;
};

const MONTHS = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
];

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character]!);
}

@Injectable()
export class ApprovalEmailService {
  private readonly logger = new Logger(ApprovalEmailService.name);

  async sendAccountApproved(account: ApprovedAccountEmail): Promise<ApprovalEmailResult> {
    const host = process.env.SMTP_HOST?.trim();
    const portValue = process.env.SMTP_PORT?.trim();
    const user = process.env.SMTP_USER?.trim();
    const password = process.env.SMTP_PASSWORD;
    const from = process.env.SMTP_FROM?.trim();
    const frontendUrl = process.env.FRONTEND_URL?.trim();
    const port = Number(portValue);

    if (!host || !portValue || !Number.isInteger(port) || port <= 0 || !user || !password || !from || !frontendUrl) {
      this.logger.warn('Approval email not sent: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, SMTP_FROM and FRONTEND_URL must be configured.');
      return { status: 'not_configured' };
    }

    const period = `${MONTHS[account.month - 1]} ${account.year}`;
    const technician = escapeHtml(account.technician);

    try {
      const loginUrl = new URL('/login', frontendUrl).toString();
      const transporter = nodemailer.createTransport({
        host,
        port,
        secure: port === 465,
        auth: { user, pass: password },
      });

      await transporter.sendMail({
        from,
        to: account.email,
        subject: `Tu cuenta de cobro de ${period} fue aprobada`,
        text: [
          `Hola ${account.technician},`,
          '',
          `Tu cuenta de cobro de ${period} fue aprobada.`,
          'Ingresa a la aplicación para firmarla:',
          loginUrl,
          '',
          'Por seguridad, inicia sesión para completar la firma.',
        ].join('\n'),
        html: `
          <div style="font-family:Arial,sans-serif;line-height:1.6;color:#08111f;max-width:560px;margin:0 auto">
            <div style="height:6px;background:#0057b8"></div>
            <h2 style="margin:28px 0 12px">Tu cuenta fue aprobada</h2>
            <p>Hola ${technician},</p>
            <p>Tu cuenta de cobro de <strong>${period}</strong> fue aprobada por el administrador.</p>
            <p>Inicia sesión para revisar y firmar la cuenta:</p>
            <p style="margin:24px 0">
              <a href="${escapeHtml(loginUrl)}" style="background:#0057b8;color:#fff;text-decoration:none;padding:12px 18px;border-radius:8px;display:inline-block;font-weight:bold">Entrar a firmar</a>
            </p>
            <p style="font-size:13px;color:#526579">Por seguridad, debes iniciar sesión para completar la firma.</p>
          </div>
        `,
      });
      this.logger.log(`Approval email sent for account period ${period}.`);
      return { status: 'sent' };
    } catch (error) {
      this.logger.error(
        `Approval email could not be sent for account period ${period}.`,
        error instanceof Error ? error.message : undefined,
      );
      return { status: 'failed' };
    }
  }
}
