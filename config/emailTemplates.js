// Create a new file: config/emailTemplates.js
export const EMAIL_VERIFY_TEMPLATE = `
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
  <h2 style="color: #1976D2;">Email Verification</h2>
  <p>Your verification code is: <strong>{{otp}}</strong></p>
  <p>This code will expire in 24 hours.</p>
</div>
`;

export const WELCOME_EMAIL_TEMPLATE = `
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
  <h2 style="color: #1976D2;">Welcome to Tuition App! 🎓</h2>
  <p>Your account has been created successfully.</p>
  <p>Email: <strong>{{email}}</strong></p>
  <p>You can now explore tuition opportunities and connect with students.</p>
</div>
`;