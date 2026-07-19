const pdfParse = require("pdf-parse")
const { generateInterviewReport, generateResumePdf } = require("../services/ai.services")
const interviewReportModel = require("../models/interviewReport.model")




/**
 * @description Controller to generate interview report based on user self description, resume and job description.
 */
async function generateInterViewReportController(req, res) {

    try {
        let resumeContent = { text: req.body.selfDescription || '' }

        if (req.file) {
            resumeContent = await (new pdfParse.PDFParse(Uint8Array.from(req.file.buffer))).getText()
        }

        const { selfDescription, jobDescription } = req.body

        const interViewReportByAi = await generateInterviewReport({
            resume: resumeContent.text,
            selfDescription,
            jobDescription
        })

        // Validate and clean preparationPlan data
        if (interViewReportByAi.preparationPlan && Array.isArray(interViewReportByAi.preparationPlan)) {
            interViewReportByAi.preparationPlan = interViewReportByAi.preparationPlan.map((plan, index) => {
                let day = plan.day;
                
                // Convert day to number if it's a string
                if (typeof day === 'string') {
                    // Extract first number from strings like "1-2", "3-4", etc.
                    const match = day.match(/^\d+/);
                    day = match ? parseInt(match[0], 10) : (index + 1);
                } else if (typeof day === 'number') {
                    day = Math.floor(day);
                } else {
                    day = index + 1;
                }

                // Ensure day is between 1 and 7
                day = Math.max(1, Math.min(7, day));

                return {
                    ...plan,
                    day
                };
            });
        }

        // Validate and clean skillGaps data
        if (interViewReportByAi.skillGaps && Array.isArray(interViewReportByAi.skillGaps)) {
            interViewReportByAi.skillGaps = interViewReportByAi.skillGaps.map((gap) => {
                let severity = gap.severity;
                
                // Normalize severity to valid enum values
                const validSeverities = ['low', 'medium', 'high'];
                severity = severity ? severity.toString().toLowerCase().trim() : 'medium';
                
                // If severity is not valid, map it to the closest valid value
                if (!validSeverities.includes(severity)) {
                    // Map common invalid values to valid ones
                    const severityMap = {
                        'none': 'low',
                        'minor': 'low',
                        'critical': 'high',
                        'important': 'high',
                        'nice-to-have': 'low',
                        'required': 'high',
                        'essential': 'high',
                        'optional': 'low'
                    };
                    
                    severity = severityMap[severity] || 'medium';
                }

                return {
                    ...gap,
                    severity
                };
            });
        }

        const interviewReport = await interviewReportModel.create({
            user: req.user.id,
            resume: resumeContent.text,
            selfDescription,
            jobDescription,
            ...interViewReportByAi
        })

        res.status(201).json({
            message: "Interview report generated successfully.",
            interviewReport
        })
    } catch (error) {
        console.error('Error generating interview report:', error)
        res.status(500).json({
            message: "Failed to generate interview report. Please try again."
        })
    }

}

/**
 * @description Controller to get interview report by interviewId.
 */
async function getInterviewReportByIdController(req, res) {

    const { interviewId } = req.params

    const interviewReport = await interviewReportModel.findOne({ _id: interviewId, user: req.user.id })

    if (!interviewReport) {
        return res.status(404).json({
            message: "Interview report not found."
        })
    }

    res.status(200).json({
        message: "Interview report fetched successfully.",
        interviewReport
    })
}


/** 
 * @description Controller to get all interview reports of logged in user.
 */
async function getAllInterviewReportsController(req, res) {
    const interviewReports = await interviewReportModel.find({ user: req.user.id }).sort({ createdAt: -1 }).select("-resume -selfDescription -jobDescription -__v -technicalQuestions -behavioralQuestions -skillGaps -preparationPlan")

    res.status(200).json({
        message: "Interview reports fetched successfully.",
        interviewReports
    })
}


/**
 * @description Controller to generate resume PDF based on user self description, resume and job description.
 */
async function generateResumePdfController(req, res) {
    try {
        const { interviewReportId } = req.params

        const interviewReport = await interviewReportModel.findById(interviewReportId)

        if (!interviewReport) {
            return res.status(404).json({
                message: "Interview report not found."
            })
        }

        const { resume, jobDescription, selfDescription } = interviewReport

        const pdfBuffer = await generateResumePdf({ resume, jobDescription, selfDescription })

        if (!pdfBuffer || pdfBuffer.length === 0) {
            return res.status(500).json({
                message: "Failed to generate resume PDF."
            })
        }

        res.set({
            "Content-Type": "application/pdf",
            "Content-Disposition": `attachment; filename=resume_${interviewReportId}.pdf`,
            "Content-Length": pdfBuffer.length
        })

        res.send(pdfBuffer)
    } catch (error) {
        console.error('Error generating resume PDF:', error)
        res.status(500).json({
            message: "Failed to generate resume PDF. Please try again."
        })
    }
}

module.exports = { generateInterViewReportController, getInterviewReportByIdController, getAllInterviewReportsController, generateResumePdfController }