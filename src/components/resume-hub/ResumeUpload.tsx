import { useRef, useState, DragEvent, ChangeEvent } from "react";
import { Loader2, Upload, FileText, CheckCircle2, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { resumeHubApi, ResumeContent } from "@/lib/resumeHub";
import { useToast } from "@/hooks/use-toast";

interface Props {
  /** Called when a file has been parsed. plainText is ready for ResumeMatch textarea. */
  onParsed: (result: { resume: ResumeContent; plainText: string }) => void;
  /** Optional extra class names for the drop zone */
  className?: string;
  /** Label variant: 'full' (big card) | 'compact' (small inline button) */
  variant?: "full" | "compact";
}

const ACCEPTED = ["application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "text/plain"];
const ACCEPTED_EXT = ".pdf,.docx,.txt";

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // result is "data:<mime>;base64,<data>" — strip the prefix
      const base64 = result.split(",")[1];
      resolve(base64);
    };
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}

export function ResumeUpload({ onParsed, className, variant = "full" }: Props) {
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);

  const [status, setStatus] = useState<"idle" | "parsing" | "done" | "error">("idle");
  const [fileName, setFileName] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  const handleFile = async (file: File) => {
    if (!ACCEPTED.includes(file.type) && !file.name.endsWith(".docx") && !file.name.endsWith(".pdf") && !file.name.endsWith(".txt")) {
      toast({ title: "Unsupported file", description: "Please upload a PDF, DOCX, or TXT file.", variant: "destructive" });
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast({ title: "File too large", description: "Maximum file size is 10 MB.", variant: "destructive" });
      return;
    }

    setFileName(file.name);
    setStatus("parsing");

    try {
      let mimeType = file.type;
      if (!mimeType || mimeType === "application/octet-stream") {
        if (file.name.endsWith(".pdf")) mimeType = "application/pdf";
        else if (file.name.endsWith(".docx")) mimeType = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
        else mimeType = "text/plain";
      }

      const base64 = await fileToBase64(file);
      const result = await resumeHubApi.parseFile(base64, mimeType);

      setStatus("done");
      onParsed(result);
      toast({ title: "Resume loaded", description: `Parsed from ${file.name}` });
    } catch (e: unknown) {
      setStatus("error");
      toast({
        title: "Could not parse file",
        description: e instanceof Error ? e.message : "Something went wrong",
        variant: "destructive",
      });
    }
  };

  const onInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    // Reset so the same file can be re-uploaded
    e.target.value = "";
  };

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  };

  const onDragOver = (e: DragEvent<HTMLDivElement>) => { e.preventDefault(); setDragging(true); };
  const onDragLeave = () => setDragging(false);

  if (variant === "compact") {
    return (
      <div className={cn("flex items-center gap-2", className)}>
        <input ref={inputRef} type="file" accept={ACCEPTED_EXT} onChange={onInputChange} className="hidden" />
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={status === "parsing"}
          className={cn(
            "inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-semibold transition-all duration-200",
            "disabled:opacity-50 disabled:cursor-not-allowed"
          )}
          style={{ borderColor: "var(--rh-hair, var(--border))" }}
          onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--rh-accent, var(--foreground))"; }}
          onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--rh-hair, var(--border))"; }}
        >
          {status === "parsing"
            ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Parsing...</>
            : status === "done"
            ? <><CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />Upload Resume</>
            : <><Upload className="w-3.5 h-3.5" />Upload Resume</>}
        </button>
        {fileName && status !== "idle" && (
          <span className="text-xs text-muted-foreground truncate max-w-[160px]">{fileName}</span>
        )}
      </div>
    );
  }

  // Full variant — drag and drop card
  return (
    <div className={cn("w-full", className)}>
      <input ref={inputRef} type="file" accept={ACCEPTED_EXT} onChange={onInputChange} className="hidden" />
      <div
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onClick={() => status !== "parsing" && inputRef.current?.click()}
        className={cn(
          "relative border-2 border-dashed rounded-xl p-8 flex flex-col items-center justify-center gap-3 cursor-pointer",
          "transition-all duration-200 select-none",
          status === "done"
            ? "border-emerald-500/60 bg-emerald-50/30 dark:bg-emerald-950/10"
            : status === "error"
            ? "border-rose-500/60 bg-rose-50/30 dark:bg-rose-950/10"
            : "",
          status === "parsing" && "cursor-wait pointer-events-none opacity-80"
        )}
        style={
          status === "done" || status === "error"
            ? undefined
            : dragging
              ? { borderColor: "var(--rh-accent, var(--foreground))", background: "var(--rh-tint, transparent)", transform: "scale(1.01)" }
              : { borderColor: "var(--rh-hair, var(--border))" }
        }
      >
        {status === "parsing" ? (
          <>
            <Loader2 className="w-8 h-8 animate-spin" style={{ color: "var(--rh-accent-2, currentColor)" }} />
            <p className="text-sm" style={{ color: "var(--rh-muted, currentColor)" }}>Reading {fileName}…</p>
            <p className="text-xs" style={{ color: "var(--rh-faint, currentColor)" }}>AI is extracting your details</p>
          </>
        ) : status === "done" ? (
          <>
            <CheckCircle2 className="w-8 h-8 text-emerald-500" />
            <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">Resume loaded</p>
            <p className="text-xs text-muted-foreground">{fileName} · click to upload a different file</p>
          </>
        ) : status === "error" ? (
          <>
            <XCircle className="w-8 h-8 text-rose-500" />
            <p className="text-sm font-semibold text-rose-600 dark:text-rose-400">Parse failed</p>
            <p className="text-xs text-muted-foreground">Click to try again</p>
          </>
        ) : (
          <>
            <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ background: "var(--rh-tint, transparent)" }}>
              <Upload className="w-5 h-5" style={{ color: "var(--rh-accent-2, currentColor)" }} />
            </div>
            <div className="text-center">
              <p className="text-sm font-medium">Drop your resume here or <span className="underline underline-offset-2" style={{ color: "var(--rh-accent-2, currentColor)" }}>browse</span></p>
              <p className="text-xs mt-1" style={{ color: "var(--rh-muted, currentColor)" }}>PDF, DOCX, or TXT · max 10 MB</p>
            </div>
            <div className="flex items-center gap-3 mt-1">
              {[".pdf", ".docx", ".txt"].map((ext) => (
                <span
                  key={ext}
                  className="inline-flex items-center gap-1.5 text-[11px] font-semibold rounded-full px-2.5 py-1"
                  style={{ background: "var(--rh-raised, transparent)", color: "var(--rh-muted, currentColor)" }}
                >
                  <FileText className="w-3 h-3" />{ext}
                </span>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
