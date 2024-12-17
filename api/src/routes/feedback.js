require("dotenv").config();
const express = require("express");
const nodemailer = require("nodemailer");

const router = express.Router();

router.post("/", async (req, res) => {
  const { fullName, email, rating, comments } = req.body;

  // Validation
  if (!email || !fullName || !rating || !comments) {
    return res.status(400).json({ error: "Full Name, Email, Rating, and Comments are required." });
  }

  try {
    // Current timestamp for submission time
    const submissionTime = new Date().toLocaleString();

    // Gmail SMTP Configuration
    const transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 465,
      secure: true, // Use SSL
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS, // App password
      },
    });

    /** ---------------------
     *  Email to the User
     * --------------------- */
    const userEmailContent = `
Dear ${fullName},

Thank you for your feedback regarding your experience. Below is the summary of the feedback you submitted:

- **Rating**: ${rating} / 5
- **Comments**: ${comments}

Your input is valuable to us, and we appreciate you taking the time to share it.

If we need any additional information, we will reach out to you.

Best regards,  
The Feedback Team
`;

    await transporter.sendMail({
      from: `"Feedback Team" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: "Thank You for Your Feedback!",
      text: userEmailContent,
    });

    /** ----------------------------
     *  Email to the Admin/Feedback Department
     * ---------------------------- */
    const adminEmailContent = `
New feedback submission received:

- **Submitted On**: ${submissionTime}
- **User Name**: ${fullName}
- **User Email**: ${email}
- **Rating**: ${rating} / 5
- **Comments**: ${comments}

Please review the feedback and take appropriate action if required.

Best regards,  
The Feedback System
`;

    await transporter.sendMail({
      from: `"Feedback System" <${process.env.EMAIL_USER}>`,
      to: process.env.ADMIN_EMAIL, // Feedback department email
      subject: "New Feedback Received",
      text: adminEmailContent,
    });

    // Success response
    res.status(200).json({ message: "Feedback received and emails sent." });
  } catch (error) {
    console.error("Error sending email:", error.message);
    res.status(500).json({ error: "Failed to send acknowledgment or admin email." });
  }
});

module.exports = router;
