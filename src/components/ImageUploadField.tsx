import { useRef, useState } from "react";
import { toast } from "sonner";
import { ImagePlus, Loader2, X } from "lucide-react";

export function ImageUploadField({ value, onChange, label }: { value: string; onChange: (url: string) => void; label: string }) {
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    setBusy(true);
    try {
      const dataUrl: string = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      onChange(dataUrl);
    } catch (e: any) {
      toast.error(e.message ?? "Couldn't read image");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <span className="block text-[10px] uppercase tracking-club text-muted-foreground font-bold mb-1.5">{label}</span>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
          e.target.value = "";
        }}
      />
      {value ? (
        <div className="relative rounded-xl overflow-hidden border border-border">
          <img src={value} alt="Cover" className="w-full h-32 object-cover" />
          <button
            type="button"
            onClick={() => onChange("")}
            className="absolute top-2 right-2 size-7 rounded-full bg-charcoal/70 text-cream grid place-items-center"
          >
            <X className="size-4" />
          </button>
          {busy && (
            <div className="absolute inset-0 bg-charcoal/50 grid place-items-center">
              <Loader2 className="size-5 text-cream animate-spin" />
            </div>
          )}
        </div>
      ) : (
        <button
          type="button"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
          className="w-full bg-paper rounded-xl px-4 py-6 text-sm outline-none border border-dashed border-border flex flex-col items-center gap-1.5 text-muted-foreground disabled:opacity-60"
        >
          {busy ? <Loader2 className="size-5 animate-spin" /> : <ImagePlus className="size-5" />}
          <span className="text-xs">{busy ? "Uploading…" : "Tap to upload an image"}</span>
        </button>
      )}
    </div>
  );
}
