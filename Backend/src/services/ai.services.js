const Groq = require("groq-sdk");
const { z } = require("zod");
const { zodToJsonSchema } = require("zod-to-json-schema");
const puppeteer = require("puppeteer");

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

const interviewReportSchema = z.object({
  matchScore: z
    .number()
    .describe(
      "A score between 0 and 100 indicating how well the candidate's profile matches the job describe",
    ),
  technicalQuestions: z
    .array(
      z.object({
        question: z
          .string()
          .describe("The technical question can be asked in the interview"),
        intention: z
          .string()
          .describe("The intention of interviewer behind asking this question"),
        answer: z
          .string()
          .describe(
            "How to answer this question, what points to cover, what approach to take etc.",
          ),
      }),
    )
    .describe(
      "Technical questions that can be asked in the interview along with their intention and how to answer them",
    ),
  behavioralQuestions: z
    .array(
      z.object({
        question: z
          .string()
          .describe("The technical question can be asked in the interview"),
        intention: z
          .string()
          .describe("The intention of interviewer behind asking this question"),
        answer: z
          .string()
          .describe(
            "How to answer this question, what points to cover, what approach to take etc.",
          ),
      }),
    )
    .describe(
      "Behavioral questions that can be asked in the interview along with their intention and how to answer them",
    ),
  skillGaps: z
    .array(
      z.object({
        skill: z.string().describe("The skill which the candidate is lacking"),
        severity: z
          .enum(["low", "medium", "high"])
          .describe(
            "The severity of this skill gap, i.e. how important is this skill for the job and how much it can impact the candidate's chances",
          ),
      }),
    )
    .describe(
      "List of skill gaps in the candidate's profile along with their severity",
    ),
  preparationPlan: z
    .array(
      z.object({
        day: z
          .number()
          .describe("The day number in the preparation plan, starting from 1"),
        focus: z
          .string()
          .describe(
            "The main focus of this day in the preparation plan, e.g. data structures, system design, mock interviews etc.",
          ),
        tasks: z
          .array(z.string())
          .describe(
            "List of tasks to be done on this day to follow the preparation plan, e.g. read a specific book or article, solve a set of problems, watch a video etc.",
          ),
      }),
    )
    .describe(
      "A day-wise preparation plan for the candidate to follow in order to prepare for the interview effectively",
    ),
  title: z
    .string()
    .describe(
      "The title of the job for which the interview report is generated",
    ),
});

async function generateInterviewReport({
  resume,
  selfDescription,
  jobDescription,
}) {
  const prompt = `You are an expert technical recruiter and interview coach. Analyze the candidate's profile against the job requirements and generate a comprehensive interview preparation report.

CANDIDATE PROFILE:
Resume: ${resume}
Self Description: ${selfDescription}

TARGET JOB:
${jobDescription}

INSTRUCTIONS:
1. Analyze the job description to identify key technical and soft skills required
2. Compare candidate's experience with job requirements
3. Generate realistic, role-specific questions that would actually be asked
4. Provide detailed, actionable answers covering key points
5. Identify genuine skill gaps based on job requirements
6. Create a practical 7-day preparation roadmap

IMPORTANT - Return ONLY valid JSON with NO markdown, NO code blocks, NO extra text:

{
  "title": "Job position title from the job description",
  "matchScore": "number between 0-100 indicating how well candidate matches the role",
  "technicalQuestions": [
    {
      "question": "Specific technical question related to the job requirements",
      "intention": "Why interviewer asks this - what they're evaluating (2-3 sentences)",
      "answer": "Comprehensive answer covering: key concepts, approach, implementation details, example code/pseudocode if relevant, common mistakes to avoid (5-7 sentences minimum)"
    }
  ],
  "behavioralQuestions": [
    {
      "question": "Behavioral question assessing soft skills relevant to the role",
      "intention": "What interviewer is assessing - specific skill or competency they want to evaluate (2-3 sentences)",
      "answer": "Complete STAR method answer: Situation (context), Task (responsibility), Action (specific steps taken), Result (quantifiable outcome) with lessons learned (5-7 sentences minimum)"
    }
  ],
  "skillGaps": [
    {
      "skill": "Specific skill name missing or weak",
      "severity": "MUST be ONLY one of: low, medium, or high. Do NOT use any other values like none, critical, minor, etc."
    }
  ],
  "preparationPlan": [
    {
      "day": 1-7 ONLY,
      "focus": "Main focus area for this day",
      "tasks": ["Specific, actionable task 1", "Specific, actionable task 2", "Practice exercise or project"]
    }
  ]
}

CRITICAL: 
- The "day" field MUST be a NUMBER (1, 2, 3, 4, 5, 6, or 7)
- Do NOT use ranges like "1-2" or "3-4"
- Each day should be a separate object
- Return exactly 7 days in preparationPlan
- For skill gaps, severity MUST be EXACTLY one of these three values: "low", "medium", or "high"
- Do NOT use values like "none", "critical", "minor", "optional", "required", "essential", etc.
- Use "low" for nice-to-have or minor gaps
- Use "medium" for important gaps that should be addressed
- Use "high" for critical gaps essential to the role`;

  const response = await groq.chat.completions.create({
    model: "llama-3.1-8b-instant",
    messages: [
      {
        role: "user",
        content: prompt,
      },
    ],
  });

  const text = response.choices[0].message.content;
  return parseAiJson(text);
}

function parseAiJson(text) {
  try {
    // Remove markdown code blocks and language specifiers
    let cleaned = text
      .replace(/```json\n?/g, "")
      .replace(/```html\n?/g, "")
      .replace(/```\n?/g, "")
      .trim();

    // If response contains both JSON and HTML, try to extract just the JSON part
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      cleaned = jsonMatch[0];
    }

    // Extract JSON between first { and last }
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");

    if (start !== -1 && end !== -1) {
      cleaned = cleaned.substring(start, end + 1);
    }

    // Try parsing as-is first
    try {
      return JSON.parse(cleaned);
    } catch (e1) {
      // If parsing fails, fix common issues
      let fixed = cleaned;

      // Fix unescaped newlines and special characters inside quoted strings
      fixed = fixed.replace(/("(?:[^"\\]|\\.)*")/g, (match) => {
        return match
          .replace(/\n/g, "\\n")
          .replace(/\r/g, "\\r")
          .replace(/\t/g, "\\t")
          .replace(/\\/g, "\\\\");
      });

      try {
        return JSON.parse(fixed);
      } catch (e2) {
        // Fix broken HTML tags (unclosed or misformatted)
        fixed = fixed.replace(/<b(?![^>]*>)/g, "<b>")
          .replace(/<\/b(?![^>]*>)/g, "</b>")
          .replace(/&/g, "&amp;")
          .replace(/'/g, "\\'");

        try {
          return JSON.parse(fixed);
        } catch (e3) {
          // Last attempt: try fixing template literals
          fixed = fixed.replace(/`([^`]*)`/g, '"$1"');
          return JSON.parse(fixed);
        }
      }
    }
  } catch (err) {
    console.log("❌ Raw AI Response:\n", text);
    throw err;
  }
}

async function generatePdfFromHtml(htmlContent) {
  try {
    if (!htmlContent || typeof htmlContent !== "string") {
      throw new Error("Invalid HTML content provided");
    }

    const browser = await puppeteer.launch({
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    const page = await browser.newPage();
    
    // Set content with error handling
    try {
      await page.setContent(htmlContent, { waitUntil: "networkidle0", timeout: 10000 });
    } catch (contentError) {
      console.error("Error setting page content:", contentError);
      // Continue anyway - the page might still render
    }

    const pdfBuffer = await page.pdf({
      format: "A4",
      displayHeaderFooter: false,
      margin: {
        top: "12mm",
        bottom: "12mm",
        left: "12mm",
        right: "12mm",
      },
      printBackground: false,
      preferCSSPageSize: true,
    });

    await browser.close();

    if (!pdfBuffer || pdfBuffer.length === 0) {
      throw new Error("PDF generation produced empty buffer");
    }

    return pdfBuffer;
  } catch (error) {
    console.error("PDF generation error:", error);
    throw new Error(`Failed to generate PDF: ${error.message}`);
  }
}

async function generateResumePdf({
  resume,
  selfDescription,
  jobDescription,
}) {
  const prompt = `Create a professional ATS-friendly resume in ONE A4 page format. Extract or infer contact details from the provided information.

CANDIDATE INFO:
Resume: ${resume}
Self Description: ${selfDescription}

TARGET JOB:
${jobDescription}

CRITICAL INSTRUCTIONS:
1. Create ONLY an HTML resume document (no commentary, no explanation, no extra text)
2. Return ONLY valid JSON - nothing else before or after
3. Do NOT include any markdown, code blocks, or explanations
4. The JSON MUST contain ONLY these two keys: "html" and nothing else
5. The "html" value must be a valid HTML string with ALL quotes properly escaped
6. Use double quotes for all JSON strings
7. Escape special characters: \\ for backslash, \" for quotes, \\n for newlines

RESUME STRUCTURE (in this exact order):
1. HEADER: Name (bold), Phone | Email | LinkedIn | GitHub (clickable links)
2. PROFESSIONAL SUMMARY: 2-3 sentences
3. TECHNICAL SKILLS: Categories like Languages, Frameworks, Databases, Tools
4. EXPERIENCE: Job title, dates, company, 2-3 bullet points with metrics
5. PROJECTS: 1-3 relevant projects with technologies
6. ACHIEVEMENTS & CERTIFICATIONS: Brief list

HTML REQUIREMENTS:
- DOCTYPE html with head and body tags
- Font: Arial or Helvetica, sans-serif
- Body text: 9pt, line-height: 1.2
- Section headers: 10pt, bold, #2c3e50 color
- Name: 14pt, bold
- Margins: 0.5 inches
- Inline CSS only, no external stylesheets
- Use <a> tags for email (mailto:) and LinkedIn/GitHub links
- Use bullet points (•) or <ul><li> for lists
- No page breaks, no graphics, no images

RETURN FORMAT - ONLY THIS STRUCTURE, NOTHING ELSE:
{
  "html": "<html>...complete valid HTML document with all special characters properly escaped...</html>"
}

START CREATING THE RESUME NOW. RESPOND ONLY WITH THE JSON OBJECT.`;

  const response = await groq.chat.completions.create({
    model: "llama-3.1-8b-instant",
    messages: [
      {
        role: "user",
        content: prompt,
      },
    ],
  });

  const text = response.choices[0].message.content;
  
  let jsonContent;
  try {
    jsonContent = parseAiJson(text);
  } catch (parseError) {
    console.error("Failed to parse AI response, using fallback resume generator:", parseError);
    // Use fallback resume generator
    const fallbackHtml = generateFallbackResume({ resume, selfDescription, jobDescription });
    jsonContent = { html: fallbackHtml };
  }

  if (!jsonContent.html || typeof jsonContent.html !== "string") {
    console.error("Invalid HTML content, generating fallback resume");
    const fallbackHtml = generateFallbackResume({ resume, selfDescription, jobDescription });
    jsonContent = { html: fallbackHtml };
  }

  return await generatePdfFromHtml(jsonContent.html);
}

function generateFallbackResume({ resume, selfDescription, jobDescription }) {
  // Extract basic info from resume or use self description
  const nameMatch = resume.match(/^(\w+[\w\s]*)/m) || ["", "Candidate"];
  const name = nameMatch[1].trim() || "Candidate";
  
  const emailMatch = resume.match(/[\w\.-]+@[\w\.-]+\.\w+/) || ["contact@example.com"];
  const email = emailMatch[0];
  
  // Create a basic but valid HTML resume
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Resume - ${name}</title>
  <style>
    body {
      font-family: Arial, Helvetica, sans-serif;
      font-size: 9pt;
      line-height: 1.2;
      margin: 0.5in;
      color: #333;
    }
    h1 {
      font-size: 14pt;
      font-weight: bold;
      margin: 0 0 3pt 0;
      color: #2c3e50;
    }
    h2 {
      font-size: 10pt;
      font-weight: bold;
      margin: 8pt 0 4pt 0;
      color: #2c3e50;
      border-bottom: 1px solid #ddd;
      padding-bottom: 2pt;
    }
    p {
      margin: 3pt 0;
    }
    ul {
      margin: 3pt 0;
      padding-left: 20pt;
    }
    li {
      margin: 2pt 0;
    }
    a {
      color: #0066cc;
      text-decoration: none;
    }
  </style>
</head>
<body>
  <h1>${name}</h1>
  <p>Email: <a href="mailto:${email}">${email}</a> | LinkedIn: <a href="https://linkedin.com">LinkedIn</a> | GitHub: <a href="https://github.com">GitHub</a></p>
  
  <h2>Professional Summary</h2>
  <p>${selfDescription || 'Professional with strong technical skills and experience in software development.'}</p>
  
  <h2>Technical Skills</h2>
  <p>• Web Development • MERN Stack • JavaScript • React.js • Node.js • MongoDB • Express.js</p>
  
  <h2>Experience</h2>
  <p><strong>Developer/Student</strong></p>
  <p>Gained experience in full-stack development and modern web technologies through projects and learning.</p>
  
  <h2>Projects</h2>
  <ul>
    <li>Developed applications using MERN Stack</li>
    <li>Built responsive web interfaces with React.js</li>
    <li>Implemented backend services with Node.js and Express.js</li>
  </ul>
  
  <h2>Education & Certifications</h2>
  <p>• Computer Science/Technology related studies</p>
</body>
</html>`;
  
  return html;
}

module.exports = { generateInterviewReport, generateResumePdf };
