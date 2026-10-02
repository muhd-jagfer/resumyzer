import {type FormEvent, useState} from 'react'
import Navbar from "~/components/Navbar";
import FileUploader from "~/components/FileUploader";
import {usePuterStore} from "~/lib/puter";
import {useNavigate} from "react-router";
import {convertPdfToImage} from "~/lib/pdf2img";
import {generateUUID} from "~/lib/utils";
import {prepareInstructions} from "../../constants";

const Upload = () => {
    const { auth, isLoading, fs, ai, kv } = usePuterStore();
    const navigate = useNavigate();
    const [isProcessing, setIsProcessing] = useState(false);
    const [statusText, setStatusText] = useState('');
    const [file, setFile] = useState<File | null>(null);

    const getFeedbackText = (content: any): string => {
        if (typeof content === 'string') return content;
        if (Array.isArray(content)) {
            return content
                .map((item) => getFeedbackText(item))
                .filter(Boolean)
                .join(' ');
        }
        if (typeof content === 'object' && content !== null) {
            if (typeof content.text === 'string') return content.text;
            if (content.content) return getFeedbackText(content.content);
            return Object.values(content)
                .map((value) => getFeedbackText(value))
                .filter(Boolean)
                .join(' ');
        }
        return '';
    };

    const extractJsonString = (text: string) => {
        const firstBrace = text.indexOf('{');
        const lastBrace = text.lastIndexOf('}');
        if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
            return text.slice(firstBrace, lastBrace + 1);
        }
        return text;
    };

    const handleFileSelect = (file: File | null) => {
        setFile(file)
    }

    const handleAnalyze = async ({ companyName, jobTitle, jobDescription, file }: { companyName?: string; jobTitle?: string; jobDescription?: string; file: File  }) => {
        setIsProcessing(true);
        setStatusText('Uploading the file...');
        const uploadedFile = await fs.upload([file]);
        if(!uploadedFile) {
            setStatusText('Error: Failed to upload file');
            setIsProcessing(false);
            return;
        }

        setStatusText('Converting to image...');
        const imageFile = await convertPdfToImage(file);
        if(!imageFile.file) {
            setStatusText(
                imageFile.error
                    ? `Error: ${imageFile.error}`
                    : 'Error: Failed to convert PDF to image'
            );
            setIsProcessing(false);
            return;
        }

        setStatusText('Uploading the image...');
        const uploadedImage = await fs.upload([imageFile.file]);
        if(!uploadedImage) {
            setStatusText('Error: Failed to upload image');
            setIsProcessing(false);
            return;
        }

        setStatusText('Preparing data...');
        const uuid = generateUUID();
        const data = {
            id: uuid,
            resumePath: uploadedFile.path,
            imagePath: uploadedImage.path,
            companyName: companyName || '',
            jobTitle: jobTitle || '',
            jobDescription: jobDescription || '',
        };

        await kv.set(`resume:${uuid}`, JSON.stringify({ ...data, feedback: null }));

        setStatusText('Analyzing...');

        const feedbackPrompt = prepareInstructions({
            jobTitle: jobTitle || 'Unknown Position',
            jobDescription: jobDescription || 'No job description provided.',
        });

        let feedback: AIResponse | undefined;

        try {
            feedback = await ai.feedback(uploadedFile.path, feedbackPrompt);
        } catch (err) {
            const message = err instanceof Error
                ? err.message
                : typeof err === 'string'
                    ? err
                    : err && typeof err === 'object'
                        ? JSON.stringify(err, Object.getOwnPropertyNames(err))
                        : String(err);
            setStatusText(`Error: AI analysis failed. ${message}`);
            setIsProcessing(false);
            return;
        }

        if (!feedback || !feedback.message) {
            setStatusText('Error: Failed to analyze resume');
            setIsProcessing(false);
            return;
        }

        const feedbackText = getFeedbackText(feedback.message.content);
        const jsonString = extractJsonString(feedbackText);

        if (!feedbackText) {
            setStatusText('Error: Invalid analysis response');
            setIsProcessing(false);
            return;
        }

        let parsedFeedback: Feedback;
        try {
            parsedFeedback = JSON.parse(jsonString) as Feedback;
        } catch (error) {
            setStatusText(`Error: Failed to parse analysis response. Response was: ${jsonString}`);
            setIsProcessing(false);
            return;
        }

        const resumeData: Resume = {
            ...data,
            feedback: parsedFeedback,
        };

        await kv.set(`resume:${uuid}`, JSON.stringify(resumeData));
        setStatusText('Analysis complete, redirecting...');
        navigate(`/resume/${uuid}`);
    }

    const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        const companyName = (e.currentTarget.elements.namedItem('company-name') as HTMLInputElement | null)?.value.trim() || '';
        const jobTitle = (e.currentTarget.elements.namedItem('job-title') as HTMLInputElement | null)?.value.trim() || '';
        const jobDescription = (e.currentTarget.elements.namedItem('job-description') as HTMLTextAreaElement | null)?.value.trim() || '';

        if (!file) {
            setStatusText('Please upload a resume file.');
            return;
        }

        handleAnalyze({ companyName, jobTitle, jobDescription, file });
    }

    return (
        <main className="bg-[url('/images/bg-main.svg')] bg-cover">
            <Navbar />

            <section className="main-section">
                <div className="page-heading py-16">
                    <h1>Smart feedback for your dream job</h1>
                    {isProcessing ? (
                        <>
                            <h2>{statusText}</h2>
                            <img src="/images/resume-scan.gif" className="w-full" />
                        </>
                    ) : (
                        <h2>Drop your resume for an ATS score and improvement tips</h2>
                    )}
                    {statusText && (
                        <div className="mt-4 rounded-xl bg-red-50 border border-red-100 p-4 text-red-700">
                            {statusText}
                        </div>
                    )}
                    {!isProcessing && (
                        <form id="upload-form" onSubmit={handleSubmit} className="flex flex-col gap-4 mt-8">
                            <div className="form-div">
                                <label htmlFor="company-name">Company Name <span className="text-sm text-slate-500">(optional)</span></label>
                                <input type="text" name="company-name" placeholder="Company Name (optional)" id="company-name" />
                            </div>
                            <div className="form-div">
                                <label htmlFor="job-title">Job Title <span className="text-sm text-slate-500">(optional)</span></label>
                                <input type="text" name="job-title" placeholder="Job Title (optional)" id="job-title" />
                            </div>
                            <div className="form-div">
                                <label htmlFor="job-description">Job Description <span className="text-sm text-slate-500">(optional)</span></label>
                                <textarea rows={5} name="job-description" placeholder="Job Description (optional)" id="job-description" />
                            </div>

                            <div className="form-div">
                                <label htmlFor="uploader">Upload Resume</label>
                                <FileUploader onFileSelect={handleFileSelect} />
                            </div>

                            <button className="primary-button" type="submit">
                                Analyze Resume
                            </button>
                        </form>
                    )}
                </div>
            </section>
        </main>
    )
}
export default Upload
