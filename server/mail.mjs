import nodemailer from 'nodemailer';

export function mailConfigured() {
  return Boolean(process.env.QQ_SMTP_USER && process.env.QQ_SMTP_AUTH_CODE);
}

function transport() {
  if (!mailConfigured()) throw new Error('邮件服务未配置，请在服务端设置 QQ_SMTP_USER 和 QQ_SMTP_AUTH_CODE');
  return nodemailer.createTransport({
    host: 'smtp.qq.com', port: 465, secure: true,
    auth: { user: process.env.QQ_SMTP_USER, pass: process.env.QQ_SMTP_AUTH_CODE },
  });
}

export async function sendRegistrationCode(email, code) {
  try {
    await transport().sendMail({
      from: `小小任务 <${process.env.QQ_SMTP_USER}>`, to: email,
      subject: '小小任务注册验证码',
      text: `你的注册验证码是 ${code}，10 分钟内有效。若非本人操作，请忽略这封邮件。`,
    });
  } catch {
    throw new Error('邮件发送失败，请检查 QQ 邮箱 SMTP 授权码与网络');
  }
}

export async function verifyMailConnection() {
  return transport().verify();
}
