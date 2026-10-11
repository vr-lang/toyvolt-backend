export const getShippingUpdateEmailTemplate = ({ order, shipment }) => {
  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Your Toyvolt Order Has Shipped!</title>
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
              <h1 style="margin: 0 0 12px; font-size: 22px; font-weight: 700; color: #111111;">Your order is on its way! 🚀</h1>
              <p style="margin: 0 0 20px; font-size: 15px; line-height: 1.6; color: #444444;">
                Great news! Your Toyvolt package for Order <strong>#${order.orderNumber}</strong> has been handed over to our courier partner.
              </p>

              <!-- Tracking card -->
              <div style="background-color: #F0F4FF; border-left: 4px solid #0055FF; padding: 18px 20px; margin: 24px 0; border-radius: 4px;">
                <p style="margin: 0 0 8px; font-size: 14px; color: #333333;">
                  <strong>Courier:</strong> ${shipment.courierName || 'Shiprocket Logistics'}
                </p>
                <p style="margin: 0 0 8px; font-size: 14px; color: #333333;">
                  <strong>AWB / Tracking Number:</strong> <span style="font-family: monospace; font-weight: 700;">${shipment.awbCode || 'Pending Assignment'}</span>
                </p>
                <p style="margin: 0; font-size: 14px; color: #333333;">
                  <strong>Status:</strong> ${shipment.status}
                </p>
              </div>

              ${shipment.trackingUrl ? `
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin: 28px 0;">
                <tr>
                  <td align="center">
                    <a href="${shipment.trackingUrl}" target="_blank" style="background-color: #0055FF; color: #FFFFFF; text-decoration: none; padding: 14px 28px; border-radius: 6px; font-size: 15px; font-weight: 700; display: inline-block;">
                      Track My Shipment
                    </a>
                  </td>
                </tr>
              </table>
              ` : ''}

              <div style="border-top: 1px solid #EBEBEB; margin: 28px 0 20px;"></div>
              <p style="margin: 0; font-size: 13px; line-height: 1.5; color: #888888;">
                Deliveries typically take 2-4 business days. If you experience delays or issues, reach out to us at support@toyvolt.com.
              </p>
            </td>
          </tr>
          <tr>
            <td style="background-color: #F8F7F2; padding: 20px 32px; text-align: center; font-size: 12px; color: #777777;">
              © ${new Date().getFullYear()} Toyvolt Toys. High performance RC toys.
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
TOYVOLT - Shipment Dispatched

Your package for Order #${order.orderNumber} is on its way!
Courier: ${shipment.courierName || 'Shiprocket'}
AWB: ${shipment.awbCode || 'Assigned'}
Status: ${shipment.status}
Tracking Link: ${shipment.trackingUrl || 'Check order status in your account'}

© ${new Date().getFullYear()} Toyvolt Toys
`;

  return { html, text };
};
