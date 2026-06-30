import express from "express";
import path from "path";
import dotenv from "dotenv";
import { GoogleGenAI } from "@google/genai";
import nodemailer from "nodemailer";

dotenv.config();

const app = express();
const PORT = 3000;

// Set up larger limits for base64 image uploads
app.use(express.json({ limit: "20mb" }));
app.use(express.urlencoded({ limit: "20mb", extended: true }));

// Lazy initializer for Gemini client to prevent crash when GEMINI_API_KEY is missing
let aiClient: GoogleGenAI | null = null;
function getAI(): GoogleGenAI {
  if (!aiClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY environment variable is required");
    }
    aiClient = new GoogleGenAI({ apiKey });
  }
  return aiClient;
}

// REST API endpoints
app.get("/api/health", (req, res) => {
  res.json({ status: "healthy", timestamp: new Date().toISOString() });
});

// Analyzing the image and generating the community complaint
app.post("/api/analyze-issue", async (req, res) => {
  try {
    const { image, description, userLocation, citizenUrgency, isEmergency } = req.body;

    if (!image) {
      return res.status(400).json({ error: "Missing image attachment" });
    }

    // Isolate pure base64 database content
    let pureBase64 = image;
    let mimeType = "image/jpeg";
    if (image.startsWith("data:")) {
      const match = image.match(/^data:([^;]+);base64,(.*)$/);
      if (match) {
        mimeType = match[1];
        pureBase64 = match[2];
      }
    }

    const ai = getAI();
    const prompt = `
      You are CivicAI, an expert agents system that analyzes hyperlocal community problem reports.
      Analyze the attached image showing a civic issue${description ? ` accompanied by the user's report: "${description}"` : ""}.
      ${citizenUrgency ? `The reporting citizen has initially categorized the immediate urgency of this issue as: "${citizenUrgency}". Please take this human user's assessment of urgency into careful consideration alongside your visual evaluation to determine the final priority levels, gravity, and repair advice.` : ""}
      ${isEmergency ? `CRITICAL ACTION MANDATE: The reporting citizen has flagged this report with the "EMERGENCY" indicator, signifying an immediate safety hazard like live wires, toxic gas leaks, water main bursts, structural collapses, or severe road cave-ins. You MUST force "severity" to "Critical", force "urgency" to "Immediate", prefix the "title" with "🚨 EMERGENCY:", tailor the "description" and "urgencyReason" to highlight life-threatening risks, and draft a high-priority "complaintText" formal dispatch demanding 24-hour emergency response.` : ""}
      
      First, evaluate if the image represents a real civic or municipal issue (e.g., potholes, garbage piles, water/sewage leakage, broken streetlights, damaged public property, road hazards, etc.). 
      If the image is completely unrelated to civic issues (such as a selfie of a person, an indoor room, a pet animal, a clean food plate, a random document, general abstract graphics, a clean scenic landscape without any damage or issues, memes, etc.), you MUST set "isCivicRelated" to false and provide a friendly explanation in "nonCivicReason" stating that this platform is used specifically for municipal/civic issues. If it is civic-related, set "isCivicRelated" to true and "nonCivicReason" to "".
      
      Evaluate the problem carefully. Determine the type of issue (pothole, garbage, water leakage, streetlight issue, or other), name it, describe it, estimate the gravity and priority, estimate repair costs in Indian Rupees (₹) with an accurately measured realistic budget (e.g. "₹5,000 - ₹12,000" or similar local Indian standard rate depending on scale), estimate a realistic resolution time (e.g., "72 Hours", "3 Days", "5 Days"), and determine the relevant municipal/city corporation office name and its physical address based on the current location: "${userLocation || "Your City"}".
      For example, if Bengaluru is mentioned or inferred, use "Bruhat Bengaluru Mahanagara Palike (BBMP)" and its office address "BBMP Head Office, Hudson Circle, Bengaluru, Karnataka 560002". If Delhi, use "Municipal Corporation of Delhi (MCD)". If New York, use "New York City Department of Transportation". Fail-safely determine the most appropriate real or realistic municipality/city corporation and address matching the current location.
      
      Generate a highly professional, formal complaint letter addressed to the Municipal Commissioner of this determined municipality, requesting prompt action. It should state that the image was analyzed and verified via CivicAI Visual Inspection.
      
      Respond with a JSON object. Ensure that keys are EXACTLY as specified below, with no wrapping Markdown symbols (e.g. do not wrap in \`\`\`json).
      
      JSON keys required:
      {
        "isCivicRelated": true or false,
        "nonCivicReason": "A polite warning message explaining that this platform is used specifically for reporting municipal and civic concerns (e.g., potholes, garbage, streetlights, leakage) if isCivicRelated is false (otherwise empty string)",
        "category": "pothole" | "garbage" | "leakage" | "streetlight" | "other",
        "title": "A short descriptive, action-oriented title of 3-6 words",
        "description": "An objective, thorough assessment of the visual issue, including what is seen, its scope, and potential direct hazards (2-3 sentences)",
        "severity": "Low" | "Medium" | "High" | "Critical",
        "urgency": "Low" | "Medium" | "High" | "Immediate",
        "urgencyReason": "A detailed explanation of why it was given this urgency level, focusing on pedestrian safety, vehicle damage, property risk, or public sanitation",
        "estimatedCost": "Estimated budget or cost range in Indian Rupees, e.g., '₹8,500 - ₹15,000'",
        "estimatedResolutionTime": "Expected time to solve the problem, e.g., '5 Days' or '72 Hours'",
        "municipalityName": "Determined municipality/city corporation name (e.g., 'Bruhat Bengaluru Mahanagara Palike (BBMP)')",
        "municipalityAddress": "Headquarters address of the determined municipality (e.g., 'BBMP Head Office, Hudson Circle, Bengaluru, Karnataka 560002')",
        "complaintText": "A professional, formal complaint letter drafted on behalf of the active local citizens, addressed specifically to the determined municipality name & address, detailing the issue, location background: ${userLocation || "Current Location"}, potential liabilities for the municipality, and requesting immediate rectification."
      }
    `;

    console.log("Analyzing image using gemini-2.5-flash...");
    const aiResponse = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [
        {
          inlineData: {
            data: pureBase64,
            mimeType: mimeType
          }
        },
        prompt
      ],
      config: {
        responseMimeType: "application/json",
      }
    });

    const contentText = aiResponse.text;
    if (!contentText) {
      throw new Error("No analysis returned from Gemini");
    }

    // Clean any backticks or markdown wrap in case the model ignored output type instructions
    let jsonText = contentText.trim();
    if (jsonText.startsWith("```")) {
      jsonText = jsonText.replace(/^```(json)?/, "").replace(/```$/, "").trim();
    }

    const parsedData = JSON.parse(jsonText);
    return res.json(parsedData);

  } catch (error: any) {
    console.error("Analysis failed:", error);
    return res.status(500).json({
      error: "AI analysis failed",
      message: error.message || String(error)
    });
  }
});

// Generate resolution summary & community upkeep tips
app.post("/api/resolve-issue", async (req, res) => {
  try {
    const { title, category, description, address } = req.body;

    if (!title) {
      return res.status(400).json({ error: "Missing issue title/details for resolution generation" });
    }

    const ai = getAI();
    const prompt = `
      You are CivicAI, an expert civic maintenance coordinator.
      A community issue has been officially marked as RESOLVED by the municipal department.
      
      Issue Details:
      - Title: "${title}"
      - Category: "${category || 'general'}"
      - Description: "${description || 'No direct description provided'}"
      - Location/Address: "${address || 'Unknown neighborhood'}"
      
      Please generate:
      1. A professional, clear "Resolution Summary" (2 short sentences) detailing how the municipal operations team likely mitigated the damage/disorder (e.g. specialized asphalt paving, eco-safe compost clearing, pipe/valves refitting, LED modern grid update) and confirming the safety of the perimeter.
      2. A constructive "Repair Advice" community tip (1-2 sentences) advising local citizens on steps to take to ensure this area stays well-maintained, how to prevent subsequent damage (e.g., proper trash bins, not overloading electrical outlets, reducing heavy load parking, reporting early moisture spots), and who to alert.
      
      Respond with a JSON object. Ensure that keys are EXACTLY as specified below, with no wrapping Markdown markup (e.g. do not wrap in \`\`\`json).
      
      JSON keys required:
      {
        "resolutionSummary": "Summary here",
        "repairAdvice": "Community upkeep advice here"
      }
    `;

    console.log("Generating resolution data using gemini-2.5-flash...");
    const aiResponse = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
      }
    });

    const contentText = aiResponse.text;
    if (!contentText) {
      throw new Error("No resolution advice returned from Gemini");
    }

    let jsonText = contentText.trim();
    if (jsonText.startsWith("```")) {
      jsonText = jsonText.replace(/^```(json)?/, "").replace(/```$/, "").trim();
    }

    const parsedData = JSON.parse(jsonText);
    return res.json(parsedData);

  } catch (error: any) {
    console.error("Resolution tips generation failed:", error);
    return res.status(500).json({
      error: "AI resolution tip generation failed",
      message: error.message || String(error)
    });
  }
});

// Send automated email updates to reporters when an issue moves to "Resolved" or "In Progress"
app.post("/api/send-status-email", async (req, res) => {
  const { reporterEmail = "", issueTitle = "", status = "" } = req.body || {};
  try {
    console.log(`[NOTIFICATIONS DISABLED] SMTP notification requested for ${reporterEmail} regarding issue: "${issueTitle}" (New Status: ${status}). SMTP dispatch is disabled.`);
    return res.json({
      success: true,
      message: "SMTP email notification has been successfully disabled as requested."
    });
  } catch (error: any) {
    try {
      let transporter;
    let fromEmail = "CivicAI Support <updates@civicai.org>";
    let isEthereal = false;

    if (process.env.SMTP_USER && process.env.SMTP_PASS) {
      transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST || "smtp.gmail.com",
        port: parseInt(process.env.SMTP_PORT || "587"),
        secure: process.env.SMTP_PORT === "465",
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS,
        },
      });
      fromEmail = process.env.SMTP_FROM || `CivicAI Updates <${process.env.SMTP_USER}>`;
    } else {
      console.log("No custom SMTP credentials found in environment. Generating dynamic Ethereal test SMTP account...");
      isEthereal = true;
      try {
        const testAccount = await nodemailer.createTestAccount();
        transporter = nodemailer.createTransport({
          host: testAccount.smtp.host,
          port: testAccount.smtp.port,
          secure: testAccount.smtp.secure,
          auth: {
            user: testAccount.user,
            pass: testAccount.pass,
          },
        });
        fromEmail = `"CivicAI Updates (Test Mode)" <${testAccount.user}>`;
      } catch (etherealErr: any) {
        console.error("Failed to generate Ethereal test account, falling back to a dry-run log:", etherealErr);
        // Fail-safe mock/dry-run transporter
        transporter = {
          sendMail: async (options: any) => {
            console.log("[DRY-RUN EMAIL SENT]:", JSON.stringify(options, null, 2));
            return { messageId: "dry-run-id", response: "dry-run success" };
          }
        } as any;
      }
    }

    // Determine content, subject and visual colors based on status
    const isResolved = status === "Resolved";
    const statusColor = isResolved ? "#10b981" : "#f59e0b"; // Emerald green vs Amber
    const subject = isResolved
      ? `🎉 SUCCESS: Your reported issue has been RESOLVED! — CivicAI`
      : `🛠️ UPDATE: Your reported issue is now IN PROGRESS — CivicAI`;

    const statusBadgeText = isResolved ? "RESOLVED" : "IN PROGRESS";
    const xpBonusText = isResolved ? "+150 XP (Civic Champion Badge Eligible!)" : "+50 XP (Work Scheduled!)";

    // Build responsive and polished HTML email
    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      background-color: #fcfaf5;
      color: #3d3d33;
      margin: 0;
      padding: 0;
      -webkit-font-smoothing: antialiased;
    }
    .wrapper {
      width: 100%;
      background-color: #fcfaf5;
      padding: 30px 0;
    }
    .container {
      max-width: 600px;
      margin: 0 auto;
      background-color: #ffffff;
      border: 1px solid #e2ddcf;
      border-radius: 12px;
      overflow: hidden;
      box-shadow: 0 4px 12px rgba(90, 90, 64, 0.05);
    }
    .header {
      background-color: #5A5A40;
      padding: 30px;
      text-align: center;
    }
    .logo {
      font-family: Georgia, serif;
      font-size: 26px;
      font-weight: bold;
      color: #fcfae6;
      letter-spacing: 1px;
      margin: 0;
    }
    .tagline {
      font-size: 11px;
      font-weight: bold;
      text-transform: uppercase;
      letter-spacing: 2px;
      color: #cbcbb4;
      margin-top: 5px;
      margin-bottom: 0;
    }
    .content {
      padding: 40px 35px;
    }
    .status-alert {
      text-align: center;
      margin-bottom: 30px;
    }
    .status-badge {
      display: inline-block;
      font-size: 12px;
      font-weight: 900;
      letter-spacing: 1.5px;
      color: #ffffff;
      background-color: ${statusColor};
      padding: 8px 18px;
      border-radius: 50px;
      text-transform: uppercase;
    }
    h1 {
      font-family: Georgia, serif;
      font-size: 20px;
      font-weight: bold;
      color: #2d2d24;
      margin-top: 0;
      margin-bottom: 15px;
      line-height: 1.3;
    }
    p {
      font-size: 14px;
      color: #555544;
      line-height: 1.6;
      margin-top: 0;
      margin-bottom: 20px;
    }
    .ticket-card {
      background-color: #fbfbfa;
      border: 1px solid #ebdcb9;
      border-left: 4px solid ${statusColor};
      border-radius: 8px;
      padding: 20px;
      margin: 25px 0;
    }
    .ticket-title {
      font-size: 15px;
      font-weight: bold;
      color: #2d2d24;
      margin: 0 0 8px 0;
    }
    .ticket-meta {
      font-size: 11px;
      font-family: monospace;
      color: #8a8a7a;
      margin-bottom: 12px;
    }
    .meta-item {
      margin-bottom: 4px;
    }
    .section-title {
      font-size: 11px;
      font-weight: bold;
      text-transform: uppercase;
      letter-spacing: 1px;
      color: #5a5a40;
      margin-top: 15px;
      margin-bottom: 6px;
    }
    .section-text {
      font-size: 13px;
      color: #555544;
      line-height: 1.5;
      margin: 0 0 15px 0;
    }
    .bonus-box {
      background-color: #f0fdf4;
      border: 1px solid #bbf7d0;
      border-radius: 8px;
      padding: 15px;
      text-align: center;
      margin: 25px 0;
    }
    .bonus-title {
      font-size: 13px;
      font-weight: bold;
      color: #166534;
      margin: 0 0 4px 0;
    }
    .bonus-sub {
      font-size: 11px;
      color: #15803d;
      margin: 0;
    }
    .footer {
      background-color: #f4f2ea;
      border-top: 1px solid #e2ddcf;
      padding: 25px 35px;
      text-align: center;
      font-size: 12px;
      color: #8a8a7a;
    }
    .footer-links {
      margin-bottom: 10px;
    }
    .footer-link {
      color: #5A5A40;
      text-decoration: none;
      font-weight: bold;
      margin: 0 8px;
    }
    .footer-link:hover {
      text-decoration: underline;
    }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="container">
      <!-- Header -->
      <div class="header">
        <div class="logo">CivicAI</div>
        <div class="tagline">Hyperlocal Democracy & Transparency</div>
      </div>
      
      <!-- Main Content -->
      <div class="content">
        <div class="status-alert">
          <span class="status-badge">Issue ${statusBadgeText}</span>
        </div>
        
        <h1>Dear Citizen Reporter,</h1>
        
        <p>
          We are pleased to inform you that the civic issue you reported in your neighborhood has reached a major milestone! Thanks to your active participation, local municipal channels have responded and executed updates.
        </p>
        
        <!-- Ticket Card -->
        <div class="ticket-card">
          <div class="ticket-title">${issueTitle}</div>
          <div class="ticket-meta">
            \${issueId ? \`<div class="meta-item"><strong>Ticket ID:</strong> \${issueId}</div>\` : ""}
            \${municipalityName ? \`<div class="meta-item"><strong>Assigned Office:</strong> \${municipalityName}</div>\` : ""}
            <div class="meta-item"><strong>Status Shifted:</strong> ${statusBadgeText}</div>
          </div>

          \${isResolved && resolutionSummary ? \`
            <div class="section-title">Resolution Summary</div>
            <p class="section-text">"\${resolutionSummary}"</p>
          \` : ""}

          \${isResolved && repairAdvice ? \`
            <div class="section-title">Community Upkeep & Prevention Advice</div>
            <p class="section-text">"\${repairAdvice}"</p>
          \` : ""}

          \${!isResolved ? \`
            <div class="section-title">Current Operations</div>
            <p class="section-text">
              Municipal operations crews have officially been dispatched and are currently performing on-site repairs at the location. The status in the CivicAI grid has been upgraded to <strong>In Progress</strong>.
            </p>
          \` : ""}
        </div>
        
        <!-- Reward Points Box -->
        <div class="bonus-box">
          <div class="bonus-title">🎉 Citizen Points Credited!</div>
          <div class="bonus-sub">${xpBonusText} has been credited to your active citizen profile.</div>
        </div>

        <p>
          Thank you for being the eyes and ears of your neighborhood. Together, we are bridging the gap between citizens and administrators to build safer, cleaner, and more transparent communities.
        </p>
        
        <p style="margin-bottom: 0;">
          Best regards,<br>
          <strong>The CivicAI Operations Team</strong>
        </p>
      </div>
      
      <!-- Footer -->
      <div class="footer">
        <div class="footer-links">
          <a href="#" class="footer-link">Dashboard</a>
          <a href="#" class="footer-link">Civic Charter</a>
          <a href="#" class="footer-link">Support</a>
        </div>
        <div>
          &copy; \${new Date().getFullYear()} CivicAI. Empowering local democracy. All rights reserved.
        </div>
      </div>
    </div>
  </div>
</body>
</html>
    `;

    // Send the email via SMTP fallback
    const mailOptions = {
      from: fromEmail,
      to: reporterEmail,
      subject: subject,
      html: htmlContent
    };

    const info = await transporter.sendMail(mailOptions);
    console.log("Status email successfully sent! Message ID:", info.messageId);

    const responsePayload: any = {
      success: true,
      messageId: info.messageId,
      recipient: reporterEmail,
      isEthereal: isEthereal
    };

    if (isEthereal) {
      const testUrl = nodemailer.getTestMessageUrl(info);
      responsePayload.etherealTestUrl = testUrl;
      console.log(`[TEST EMAIL]: Preview available at ${testUrl}`);
    }

    return res.json(responsePayload);
    } catch (e) {}
  }
});

// Configure Vite integration for dev environment or serve statics in prod
async function setupServer() {
  if (process.env.NODE_ENV !== "production") {
    console.log("Starting full-stack dev server with Vite...");
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    console.log("Starting full-stack production server...");
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`CivicAI App server running on port ${PORT}`);
  });
}

setupServer();
