export const testEmail = async (req, res) => {
  try {
    const mailOptions = {
      from: process.env.SENDER_EMAIL,
      to: 'test@example.com',
      subject: 'Test Email',
      text: 'This is a test email from your application.',
    };

    await transporter.sendMail(mailOptions);
    res.json({ success: true, message: 'Test email sent successfully' });
  } catch (error) {
    console.error('Email test failed:', error);
    res.json({ success: false, message: error.message });
  }
};