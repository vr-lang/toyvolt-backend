export const getWelcomeEmailTemplate = ({ name, welcomeCoupon = 'WELCOME100' }) => {
  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Welcome to Toyvolt!</title>
</head>
<body style="margin: 0; padding: 0; background-color: #F8F7F2; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #111111;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #F8F7F2; padding: 40px 10px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" style="max-width: 580px; background-color: #FFFFFF; border-radius: 12px; border: 1px solid #E5E5E0; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.05);" cellspacing="0" cellpadding="0">
          <tr>
            <td style="background-color: #111111; padding: 28px 32px; text-align: left; border-bottom: 3px solid #0055FF;">
              <span style="font-size: 26px; font-weight: 800; letter-spacing: -0.5px; color: #FFFFFF;">
                TOY<span style="color: #FF5500;">VOLT</span>
              </span>
            </td>
          </tr>
          <tr>
            <td style="padding: 36px 32px;">
              <h1 style="margin: 0 0 16px; font-size: 24px; font-weight: 700; color: #111111;">Welcome to the Track, ${name}!</h1>
              <p style="margin: 0 0 20px; font-size: 15px; line-height: 1.6; color: #444444;">
                Your Toyvolt account is officially verified and ready to roll. We design precision-engineered, high-speed remote control toys built for real speed enthusiasts.
              </p>
              
              <!-- Gift / Coupon Banner -->
              <div style="background-color: #FFF8F0; border: 2px solid #FF5500; border-radius: 10px; padding: 20px; margin: 28px 0; text-align: center;">
                <p style="margin: 0 0 8px; font-size: 13px; font-weight: 700; text-transform: uppercase; color: #FF5500; letter-spacing: 1px;">
                  Exclusive Welcome Gift
                </p>
                <p style="margin: 0 0 12px; font-size: 18px; font-weight: 700; color: #111111;">
                  Get ₹100 OFF on your first order
                </p>
                <div style="background-color: #FFFFFF; border: 1px dashed #FF5500; border-radius: 6px; padding: 8px 18px; display: inline-block;">
                  <span style="font-family: monospace; font-size: 20px; font-weight: 800; color: #111111; letter-spacing: 2px;">
                    ${welcomeCoupon}
                  </span>
                </div>
              </div>

              <p style="margin: 0 0 24px; font-size: 15px; line-height: 1.6; color: #444444;">
                Check out our flagship high-speed drift RC car and experience true proportional throttle and precision steering.
              </p>
              <div style="border-top: 1px solid #EBEBEB; margin: 28px 0 20px;"></div>
              <p style="margin: 0; font-size: 13px; line-height: 1.5; color: #888888;">
                Have questions or need technical support? Reply to this email or reach us anytime at support@toyvolt.com.
              </p>
            </td>
          </tr>
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
Welcome to Toyvolt, ${name}!

Your account is verified and ready.
As a welcome gift, use coupon code "${welcomeCoupon}" at checkout to enjoy ₹100 OFF on your first order!

Visit Toyvolt to get started.

© ${new Date().getFullYear()} Toyvolt Toys
`;

  return { html, text };
};
