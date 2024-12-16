const express = require("express");
const nodemailer = require("nodemailer");

const router = express.Router();

router.post("/feedback", async (req, res) => {
  const { fullName, email, rating, comments } = req.body;

  if (!email) {
    return res.status(400).json({ error: "Email is required." });
  }

  try {
    // Create a Nodemailer transporter
    const transporter = nodemailer.createTransport({
      service: "Gmail", // Replace with your email service
      auth: {
        user: "feedbackdeptiu@gmail.com", // Your email
        pass: "IUfeedbackdept@123", // Your email password or app password
      },
    });

    // Send acknowledgment email
    await transporter.sendMail({
      from: '"Feedback Team" <your-email@gmail.com>',
      to: email,
      subject: "Thank You for Your Feedback!",
      text: `Dear ${fullName || "User"},

Thank you for your feedback regarding your experience. Your input is valuable to us.

Our team is working on the issue, and if we need any additional information, we will reach out to you.

Thank you for your patience.

Best regards,  
The Feedback Team`,
    });

    // Respond with success
    res.status(200).json({ message: "Feedback received and email sent." });
  } catch (error) {
    console.error("Error sending email:", error);
    res.status(500).json({ error: "Failed to send acknowledgment email." });
  }
});

module.exports = router;
