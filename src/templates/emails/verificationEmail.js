export const getVerificationEmailTemplate = ({ name, otp, expiresInMinutes = 5 }) => {
  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Verify your Toyvolt Account</title>
</head>
<body style="margin: 0; padding: 0; background-color: #F8F7F2; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #111111;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #F8F7F2; padding: 40px 10px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" style="max-width: 580px; background-color: #FFFFFF; border-radius: 12px; border: 1px solid #E5E5E0; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.05);" cellspacing="0" cellpadding="0">
          <!-- Header -->
          <tr>
            <td style="background-color: #111111; padding: 28px 32px; text-align: left; border-bottom: 3px solid #0055FF;">
              <span style="font-size: 26px; font-weight: 800; letter-spacing: -0.5px; color: #FFFFFF;">
                TOY<span style="color: #FF5500;">VOLT</span>
              </span>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding: 36px 32px;">
              <h1 style="margin: 0 0 16px; font-size: 22px; font-weight: 700; color: #111111;">Verify your email address</h1>
              <p style="margin: 0 0 20px; font-size: 15px; line-height: 1.6; color: #444444;">
                Hi ${name || 'there'},
              </p>
              <p style="margin: 0 0 24px; font-size: 15px; line-height: 1.6; color: #444444;">
                Thank you for creating an account with <strong>Toyvolt</strong>. Use the 6-digit verification code below to complete your registration:
              </p>
              <!-- OTP Box -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin: 28px 0;">
                <tr>
                  <td align="center">
                    <div style="background-color: #F0F4FF; border: 2px dashed #0055FF; border-radius: 10px; padding: 18px 32px; display: inline-block;">
                      <span style="font-family: 'Courier New', Courier, monospace; font-size: 34px; font-weight: 800; letter-spacing: 8px; color: #0055FF;">
                        ${otp}
                      </span>
                    </div>
                  </td>
                </tr>
              </table>
              <p style="margin: 0 0 12px; font-size: 14px; color: #666666; text-align: center;">
                This code is valid for <strong>${expiresInMinutes} minutes</strong>. Please do not share it with anyone.
              </p>
              <div style="border-top: 1px solid #EBEBEB; margin: 28px 0 20px;"></div>
              <p style="margin: 0; font-size: 13px; line-height: 1.5; color: #888888;">
                If you did not request this verification, you can safely ignore this email.
              </p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background-color: #F8F7F2; padding: 20px 32px; text-align: center; font-size: 12px; color: #777777;">
              © ${new Date().getFullYear()} Toyvolt Toys. High performance RC toys engineered for thrill.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`;

  const text = `
TOYVOLT - Account Verification

Hi ${name || 'there'},

Your 6-digit verification code is: ${otp}

This code will expire in ${expiresInMinutes} minutes. If you did not request this, you can safely ignore this email.

© ${new Date().getFullYear()} Toyvolt
`;

  return { html, text };
};
