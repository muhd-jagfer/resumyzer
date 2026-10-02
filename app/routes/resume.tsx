import {Link, useNavigate, useParams} from "react-router";
import {useEffect, useState} from "react";
import {usePuterStore} from "~/lib/puter";
import Summary from "~/components/Summary";
import ATS from "~/components/ATS";
import Details from "~/components/Details";

export const meta = () => ([
    { title: 'Resumyzer | Review ' },
    { name: 'description', content: 'Detailed overview of your resume' },
])

const Resume = () => {
    const { auth, isLoading, fs, kv } = usePuterStore();
    const { id } = useParams();
    const [imageUrl, setImageUrl] = useState('');
    const [resumeUrl, setResumeUrl] = useState('');
    const [feedback, setFeedback] = useState<Feedback | null>(null);
    const navigate = useNavigate();

    useEffect(() => {
        if (!isLoading && !auth.isAuthenticated) {
            if (id) {
                navigate(`/auth?next=/resume/${id}`);
            } else {
                navigate('/auth?next=/');
            }
        }
    }, [isLoading, auth.isAuthenticated, id, navigate]);

    useEffect(() => {
        if (!id) {
            return;
        }

        let resumeUrlRef: string | null = null;
        let imageUrlRef: string | null = null;

        const loadResume = async () => {
            const resume = await kv.get(`resume:${id}`);
            if (!resume) {
                return;
            }

            let data: Resume | null = null;
            try {
                data = JSON.parse(resume) as Resume;
            } catch {
                return;
            }

            if (!data?.resumePath || !data?.imagePath) {
                return;
            }

            const resumeBlob = await fs.read(data.resumePath);
            if (resumeBlob) {
                const pdfBlob = new Blob([resumeBlob], { type: 'application/pdf' });
                resumeUrlRef = URL.createObjectURL(pdfBlob);
                setResumeUrl(resumeUrlRef);
            } else if (data.resumePath.startsWith('/')) {
                setResumeUrl(data.resumePath);
            }

            const imageBlob = await fs.read(data.imagePath);
            if (imageBlob) {
                imageUrlRef = URL.createObjectURL(imageBlob);
                setImageUrl(imageUrlRef);
            } else if (data.imagePath.startsWith('/')) {
                setImageUrl(data.imagePath);
            }

            setFeedback(data.feedback ?? null);
        };

        loadResume();

        return () => {
            if (resumeUrlRef) {
                URL.revokeObjectURL(resumeUrlRef);
            }
            if (imageUrlRef) {
                URL.revokeObjectURL(imageUrlRef);
            }
        };
    }, [id, fs, kv]);

    return (
        <main className="!pt-0">
            <nav className="resume-nav">
                <Link to="/" className="back-button">
                    <img src="/icons/back.svg" alt="logo" className="w-2.5 h-2.5" />
                    <span className="text-gray-800 text-sm font-semibold">Back to Homepage</span>
                </Link>
            </nav>
            <div className="flex flex-row w-full max-lg:flex-col-reverse">
                <section className="feedback-section bg-[url('/images/bg-small.svg') bg-cover h-[100vh] sticky top-0 items-center justify-center">
                    {imageUrl && resumeUrl && (
                        <div className="animate-in fade-in duration-1000 gradient-border max-sm:m-0 h-[90%] max-wxl:h-fit w-fit">
                            <a href={resumeUrl} target="_blank" rel="noopener noreferrer">
                                <img
                                    src={imageUrl}
                                    className="w-full h-full object-contain rounded-2xl"
                                    title="resume"
                                />
                            </a>
                        </div>
                    )}
                </section>
                <section className="feedback-section">
                    <h2 className="text-4xl !text-black font-bold">Resume Review</h2>
                    {feedback ? (
                        <div className="flex flex-col gap-8 animate-in fade-in duration-1000">
                            <Summary feedback={feedback} />
                            <ATS score={feedback.ATS.score || 0} suggestions={feedback.ATS.tips || []} />
                            <Details feedback={feedback} />
                        </div>
                    ) : (
                        <img src="/images/resume-scan-2.gif" className="w-full" />
                    )}
                </section>
            </div>
        </main>
    )
}
export default Resume
