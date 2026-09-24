const hasSmtpConfig = process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS;

const transporter = hasSmtpConfig
    ? require('nodemailer').createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT || 587),
        secure: process.env.SMTP_SECURE === 'true',
        auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS
        }
    })
    : null;

async function sendOtpEmail(email, otp) {
    if (!transporter) {
        console.log(`[development] OTP for ${email}: ${otp}`);
        return;
    }

    const text = `Your Loan verification code is ${otp}. It expires in 10 minutes. If you did not request this code, you can ignore this email.`;
    const html = `
        <!doctype html>
        <html lang="en">
            <body style="margin:0;background:#f5f1fb;color:#24143d;font-family:Arial,sans-serif;">
                <div style="padding:40px 16px;">
                    <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e5daf3;border-radius:16px;overflow:hidden;">
                        <div style="padding:28px 32px;background:#241143;color:#ffffff;">
                            <div style="font-size:13px;font-weight:bold;letter-spacing:3px;">LOAN</div>
                            <div style="margin-top:22px;font-size:26px;font-weight:bold;">Verify your email</div>
                        </div>
                        <div style="padding:32px;">
                            <p style="margin:0;color:#665979;font-size:15px;line-height:1.6;">Use the verification code below to finish setting up your Loan account.</p>
                            <div style="margin:28px 0;padding:18px;text-align:center;background:#f3eaff;border:1px solid #d9b8ff;border-radius:12px;">
                                <div style="color:#7650a8;font-size:11px;font-weight:bold;letter-spacing:2px;">YOUR VERIFICATION CODE</div>
                                <div style="margin-top:10px;color:#241143;font-size:34px;font-weight:bold;letter-spacing:8px;">${otp}</div>
                            </div>
                            <p style="margin:0;color:#665979;font-size:13px;line-height:1.6;">This code expires in <strong>10 minutes</strong>. Never share it with anyone, including someone claiming to be from Loan.</p>
                            <p style="margin:24px 0 0;color:#9588a4;font-size:12px;line-height:1.6;">If you did not request this code, you can safely ignore this email.</p>
                        </div>
                        <div style="padding:18px 32px;background:#faf8fd;color:#9588a4;font-size:11px;">Loan Application &middot; Secure account access</div>
                    </div>
                </div>
            </body>
        </html>`;

    await transporter.sendMail({
        from: process.env.SMTP_FROM || process.env.SMTP_USER,
        to: email,
        subject: 'Your Loan Application verification code',
        text,
        html
    });
}

module.exports = { sendOtpEmail };