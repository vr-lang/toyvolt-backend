import { formatCurrency } from '../../utils/money.js';

export const getOrderConfirmationEmailTemplate = ({ order, user }) => {
  const itemsHtml = order.items.map(item => `
    <tr>
      <td style="padding: 12px 0; border-bottom: 1px solid #EEEEEE; font-size: 14px; color: #111111;">
        <strong>${item.name}</strong><br/>
        <span style="font-size: 12px; color: #666666;">SKU: ${item.sku} &bull; Qty: ${item.quantity}</span>
      </td>
      <td align="right" style="padding: 12px 0; border-bottom: 1px solid #EEEEEE; font-size: 14px; font-weight: 600; color: #111111;">
        ${formatCurrency(item.total)}
      </td>
    </tr>
  `).join('');

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Order Confirmation - Toyvolt</title>
</head>
<body style="margin: 0; padding: 0; background-color: #F8F7F2; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #111111;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #F8F7F2; padding: 40px 10px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" style="max-width: 600px; background-color: #FFFFFF; border-radius: 12px; border: 1px solid #E5E5E0; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.05);" cellspacing="0" cellpadding="0">
          <tr>
            <td style="background-color: #111111; padding: 28px 32px; text-align: left; border-bottom: 3px solid #0055FF;">
              <span style="font-size: 26px; font-weight: 800; letter-spacing: -0.5px; color: #FFFFFF;">
                TOY<span style="color: #FF5500;">VOLT</span>
              </span>
            </td>
          </tr>
          <tr>
            <td style="padding: 36px 32px;">
              <div style="background-color: #E8F5E9; border: 1px solid #4CAF50; border-radius: 8px; padding: 12px 18px; margin-bottom: 24px;">
                <span style="font-weight: 700; color: #2E7D32;">✔ Payment Received & Order Confirmed</span>
              </div>
              
              <h1 style="margin: 0 0 8px; font-size: 22px; font-weight: 700; color: #111111;">Thank you for your order!</h1>
              <p style="margin: 0 0 20px; font-size: 14px; color: #666666;">
                Order Number: <strong>${order.orderNumber}</strong> &bull; Placed on ${new Date(order.createdAt).toLocaleDateString('en-IN')}
              </p>
              
              <h3 style="margin: 24px 0 12px; font-size: 16px; font-weight: 700; border-bottom: 2px solid #111111; padding-bottom: 6px;">Order Summary</h3>
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                ${itemsHtml}
                <tr>
                  <td style="padding: 10px 0 4px; font-size: 14px; color: #666666;">Subtotal</td>
                  <td align="right" style="padding: 10px 0 4px; font-size: 14px; color: #111111;">${formatCurrency(order.subtotal)}</td>
                </tr>
                ${order.discountAmount > 0 ? `
                <tr>
                  <td style="padding: 4px 0; font-size: 14px; color: #2E7D32;">Discount (${order.couponCode || 'Coupon'})</td>
                  <td align="right" style="padding: 4px 0; font-size: 14px; font-weight: 600; color: #2E7D32;">-${formatCurrency(order.discountAmount)}</td>
                </tr>
                ` : ''}
                <tr>
                  <td style="padding: 4px 0; font-size: 14px; color: #666666;">Shipping</td>
                  <td align="right" style="padding: 4px 0; font-size: 14px; color: #111111;">${order.shippingFee === 0 ? 'FREE' : formatCurrency(order.shippingFee)}</td>
                </tr>
                <tr>
                  <td style="padding: 14px 0; border-top: 2px solid #111111; font-size: 16px; font-weight: 700; color: #111111;">Total Paid</td>
                  <td align="right" style="padding: 14px 0; border-top: 2px solid #111111; font-size: 18px; font-weight: 800; color: #0055FF;">${formatCurrency(order.finalAmount)}</td>
                </tr>
              </table>

              <h3 style="margin: 28px 0 8px; font-size: 15px; font-weight: 700; color: #111111;">Delivery Address</h3>
              <p style="margin: 0; font-size: 14px; line-height: 1.5; color: #555555;">
                <strong>${order.shippingAddress.fullName}</strong><br/>
                ${order.shippingAddress.addressLine1}${order.shippingAddress.addressLine2 ? ', ' + order.shippingAddress.addressLine2 : ''}<br/>
                ${order.shippingAddress.city}, ${order.shippingAddress.state} - ${order.shippingAddress.postalCode}<br/>
                Phone: ${order.shippingAddress.phone}
              </p>

              <div style="border-top: 1px solid #EBEBEB; margin: 28px 0 20px;"></div>
              <p style="margin: 0; font-size: 13px; line-height: 1.5; color: #888888;">
                We are preparing your package for dispatch. You will receive tracking details via email as soon as your shipment is picked up.
              </p>
            </td>
          </tr>
          <tr>
            <td style="background-color: #F8F7F2; padding: 20px 32px; text-align: center; font-size: 12px; color: #777777;">
              © ${new Date().getFullYear()} Toyvolt Toys. Built for thrill.
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
TOYVOLT - Order Confirmation

Order: ${order.orderNumber}
Total Paid: ${formatCurrency(order.finalAmount)}

Items:
${order.items.map(i => `- ${i.name} x ${i.quantity} (${formatCurrency(i.total)})`).join('\n')}

Shipping Address:
${order.shippingAddress.fullName}
${order.shippingAddress.addressLine1}
${order.shippingAddress.city}, ${order.shippingAddress.state} - ${order.shippingAddress.postalCode}
Phone: ${order.shippingAddress.phone}

© ${new Date().getFullYear()} Toyvolt Toys
`;

  return { html, text };
};
